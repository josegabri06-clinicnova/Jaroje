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
  try {
    // 1. Obtener reglas y rangos de temporadas de Supabase
    const [{ data: rules, error: rulesErr }, { data: seasonRow }] = await Promise.all([
      supabase
        .from('pricing_rules')
        .select('*')
        .order('created_at', { ascending: true }),
      supabase
        .from('settings')
        .select('value')
        .eq('key', 'season_ranges')
        .maybeSingle()
    ]);

    if (rulesErr) {
      return NextResponse.json({ success: false, error: 'rules fetch error', details: rulesErr }, { status: 500 });
    }

    const seasonRanges = seasonRow?.value
      ? (typeof seasonRow.value === 'string'
          ? JSON.parse(seasonRow.value)
          : seasonRow.value)
      : [];

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

          let priceUsed = 0;
          if (specialRule) {
            priceUsed = Number(specialRule.price);
          } else if (seasonalRule) {
            priceUsed = Number(seasonalRule.price);
          } else {
            const fallbackSeason = getSeason(dateStr, seasonRanges);
            const dbSeasonRule = rules.find((r: any) => 
              r.room_type_id === group.parentId && 
              r.rule_type === 'seasonal' && 
              (
                (fallbackSeason === 'alta' && r.name && r.name.toLowerCase().includes('alta') && !r.name.toLowerCase().includes('media')) ||
                (fallbackSeason === 'media_alta' && r.name && r.name.toLowerCase().includes('media-alta')) ||
                (fallbackSeason === 'media' && r.name && r.name.toLowerCase().includes('media') && !r.name.toLowerCase().includes('alta')) ||
                (fallbackSeason === 'baja' && r.name && r.name.toLowerCase().includes('baja'))
              )
            );

            if (dbSeasonRule) {
              priceUsed = Number(dbSeasonRule.price);
            } else if (baseRule && fallbackSeason === 'baja') {
              priceUsed = Number(baseRule.price);
            } else {
              priceUsed = JAROJE_PRICES[group.parentId]?.[fallbackSeason] || 2000;
            }
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
            roomId: Number(roomId),
            calendar: calendarDays
          });
        }
      });
    });

    return NextResponse.json({ success: true, payloadLength: ratesPayload.length, samplePayload: ratesPayload.slice(0, 1) });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, stack: err.stack }, { status: 500 });
  }
}
