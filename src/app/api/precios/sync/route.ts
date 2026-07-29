import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSeason, pushRatesToBeds24, JAROJE_PRICES } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ROOM_GROUPS = [
  { parentId: '679077', childIds: ['685531', '685532', '685533', '685534', '685535', '685536'] },
  { parentId: '679087', childIds: ['679087'] },
  { parentId: '679091', childIds: ['685312', '685318', '685314', '685315', '685316', '685317'] },
  { parentId: '679092', childIds: ['685321', '685322', '685323', '685324', '685325', '685326', '685327'] },
  { parentId: '679093', childIds: ['679008'] },
  { parentId: '685542', childIds: ['685542'] }
];

export async function GET(req: Request) {
  return handleSync(req, false);
}

export async function POST(req: Request) {
  return handleSync(req, true);
}

async function handleSync(req: Request, checkAuth: boolean) {
  try {
    if (checkAuth) {
      // Validar token de seguridad de Cron si está configurado en las variables de entorno
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret) {
        const authHeader = req.headers.get('authorization') || '';
        const providedToken = authHeader.replace(/^bearer\s+/i, '').trim() || req.headers.get('x-cron-secret') || '';
        if (providedToken !== cronSecret) {
          return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
        }
      }
    }

    // 1. Obtener reglas, rangos de temporadas y descuentos temporales de Supabase
    const [{ data: rules, error: rulesErr }, { data: seasonRow }, { data: discountRow }, { data: basePricesRow }] = await Promise.all([
      supabase
        .from('pricing_rules')
        .select('*')
        .order('created_at', { ascending: true }),
      supabase
        .from('settings')
        .select('value')
        .eq('key', 'season_ranges')
        .maybeSingle(),
      supabase
        .from('settings')
        .select('value')
        .eq('key', 'temp_discounts')
        .maybeSingle(),
      supabase
        .from('settings')
        .select('value')
        .eq('key', 'season_base_prices')
        .maybeSingle()
    ]);

    if (rulesErr) {
      throw new Error(`Error al leer reglas de Supabase: ${rulesErr.message}`);
    }

    const seasonRanges = seasonRow?.value
      ? (typeof seasonRow.value === 'string'
          ? JSON.parse(seasonRow.value)
          : seasonRow.value)
      : [];

    const tempDiscounts = discountRow?.value
      ? (typeof discountRow.value === 'string'
          ? JSON.parse(discountRow.value)
          : discountRow.value)
      : [];

    const seasonBasePrices = basePricesRow?.value
      ? (typeof basePricesRow.value === 'string'
          ? JSON.parse(basePricesRow.value)
          : basePricesRow.value)
      : {};

    // 2. Definir ventana de 540 días a partir de hoy
    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < 540; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const ratesPayload: any[] = [];

    // 3. Calcular tarifas noche por noche para cada cuarto hijo y el cuarto padre
    ROOM_GROUPS.forEach(group => {
      const roomIds = Array.from(new Set([group.parentId, ...group.childIds]));
      
      roomIds.forEach(roomId => {
        const calendarDays: any[] = [];

        dates.forEach(dateStr => {
          // Buscar regla especial
          const specialRule = rules.find((r: any) => 
            r.room_type_id === group.parentId && 
            r.rule_type === 'special' && 
            r.start_date <= dateStr && 
            r.end_date >= dateStr
          );

          // Buscar regla de temporada
          const seasonalRule = rules.find((r: any) => 
            r.room_type_id === group.parentId && 
            r.rule_type === 'seasonal' && 
            r.start_date <= dateStr && 
            r.end_date >= dateStr
          );

          // Buscar regla base
          const baseRule = rules.find((r: any) => 
            r.room_type_id === group.parentId && 
            r.rule_type === 'base'
          );

          // 1. Verificar si hay un descuento temporal activo para este cuarto y fecha
          const activeDiscount = tempDiscounts.find((d: any) => 
            Array.isArray(d.rooms) && 
            d.rooms.includes(group.parentId) && 
            dateStr >= d.from && 
            dateStr <= d.to
          );

          let priceUsed = 0;
          if (specialRule) {
            priceUsed = Number(specialRule.price);
          } else if (activeDiscount) {
            priceUsed = Number(activeDiscount.priceRaw);
          } else if (seasonalRule) {
            priceUsed = Number(seasonalRule.price);
          } else {
            const fallbackSeason = getSeason(dateStr, seasonRanges);
            const dbSeasonRule = rules.find((r: any) => 
              r.room_type_id === group.parentId && 
              r.rule_type === 'seasonal' && 
              (
                (fallbackSeason === 'alta' && r.name.toLowerCase().includes('alta') && !r.name.toLowerCase().includes('media')) ||
                (fallbackSeason === 'media_alta' && r.name.toLowerCase().includes('media-alta')) ||
                (fallbackSeason === 'media' && r.name.toLowerCase().includes('media') && !r.name.toLowerCase().includes('alta')) ||
                (fallbackSeason === 'baja' && r.name.toLowerCase().includes('baja'))
              )
            );

            if (dbSeasonRule) {
              priceUsed = Number(dbSeasonRule.price);
            } else if (baseRule && fallbackSeason === 'baja') {
              priceUsed = Number(baseRule.price);
            } else {
              priceUsed = seasonBasePrices[group.parentId]?.[fallbackSeason] || JAROJE_PRICES[group.parentId]?.[fallbackSeason] || 2000;
            }
          }

          if (priceUsed > 0) {
            calendarDays.push({
              from: dateStr,
              to: dateStr,
              price1: priceUsed
            });
          }
        });

        if (calendarDays.length > 0) {
          ratesPayload.push({
            roomId: Number(roomId),
            calendar: calendarDays
          });
        }
      });
    });

    // 4. Empujar todas las tarifas a Beds24 en una sola petición para evitar el límite de créditos/peticiones (Rate Limit)
    console.log(`[Sync API] Sincronizando ${ratesPayload.length} habitaciones a Beds24 en una sola petición...`);
    await pushRatesToBeds24(ratesPayload);

    return NextResponse.json({ 
      success: true, 
      message: `Tarifas sincronizadas exitosamente en Beds24 para 540 días en ${ratesPayload.length} habitaciones.`
    });

  } catch (err: any) {
    console.error('[Sync API Error]:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
