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

export async function POST() {
  try {
    // 1. Obtener reglas activas de Supabase
    const { data: rules, error: rulesErr } = await supabase
      .from('pricing_rules')
      .select('*')
      .order('created_at', { ascending: true });

    if (rulesErr) {
      throw new Error(`Error al leer reglas de Supabase: ${rulesErr.message}`);
    }

    // 2. Definir ventana de 365 días a partir de hoy
    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const ratesPayload: any[] = [];

    // 3. Calcular tarifas noche por noche para cada cuarto hijo
    ROOM_GROUPS.forEach(group => {
      group.childIds.forEach(childId => {
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

          let priceUsed = 0;
          if (specialRule) {
            priceUsed = Number(specialRule.price);
          } else if (seasonalRule) {
            priceUsed = Number(seasonalRule.price);
          } else if (baseRule) {
            priceUsed = Number(baseRule.price);
          } else {
            const fallbackSeason = getSeason(dateStr);
            priceUsed = JAROJE_PRICES[group.parentId]?.[fallbackSeason] || 2000;
          }

          if (priceUsed > 0) {
            calendarDays.push({
              date: dateStr,
              price1: priceUsed
            });
          }
        });

        if (calendarDays.length > 0) {
          ratesPayload.push({
            roomId: Number(childId),
            calendar: calendarDays
          });
        }
      });
    });

    // 4. Empujar las tarifas a Beds24 en fragmentos (habitación por habitación) para seguridad
    console.log(`[Sync API] Sincronizando ${ratesPayload.length} habitaciones a Beds24...`);
    let syncedCount = 0;
    
    for (const roomItem of ratesPayload) {
      await pushRatesToBeds24([roomItem]);
      syncedCount++;
    }

    return NextResponse.json({ 
      success: true, 
      message: `Tarifas sincronizadas exitosamente en Beds24 para 365 días en ${syncedCount} habitaciones.`
    });

  } catch (err: any) {
    console.error('[Sync API Error]:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
