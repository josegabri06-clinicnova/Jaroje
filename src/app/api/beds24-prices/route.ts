import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// IDs padres de Beds24 (un ID por tipo de alojamiento)
const PARENT_ROOM_IDS = ['679077', '679087', '679091', '679092', '679093'];

// Factor de impuestos: IVA 16% + ISH 3% = 19%
const TAX_FACTOR = 1.19;

// Nombre legible de cada room ID
const ROOM_NAMES: Record<string, string> = {
  '679077': 'Habitación DOBLE',
  '679087': 'Apartamento Premier 1 dorm',
  '679091': 'Apartamento Premier 2 dorm',
  '679092': 'Apartamento Premier 3 dorm',
  '679093': 'Casa Vacacional 3 dorm',
};

/**
 * GET /api/beds24-prices
 *
 * Lee el calendario de precios de Beds24 para los próximos 365 días,
 * detecta el rango de precios de cada habitación y devuelve:
 *  - pricesByRoom: { roomId: { min, max, p25, p75, samples } }
 *  - multipliers: { airbnb, booking }  (desde Supabase settings)
 *  - rawCalendar: datos crudos de Beds24 (para debug)
 *
 * Los precios de Beds24 vienen SIN impuestos → se multiplican × 1.19
 * para devolver el precio FINAL al cliente.
 */
export async function GET(req: Request) {
  try {
    const token = await getBeds24Token();
    const { searchParams } = new URL(req.url);

    // Rango: desde hoy hasta 365 días adelante (cubre todas las temporadas)
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 365);

    const startStr = today.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const roomIdParams = PARENT_ROOM_IDS.map(id => `roomId=${id}`).join('&');

    // ── Llamar al calendario de Beds24 ────────────────────────────────────────
    const calRes = await fetch(
      `https://api.beds24.com/v2/inventory/rooms/calendar?startDate=${startStr}&endDate=${endStr}&${roomIdParams}&includePrices=true`,
      {
        headers: { token },
        cache: 'no-store',
      }
    );

    if (!calRes.ok) {
      const errText = await calRes.text();
      return NextResponse.json(
        { success: false, error: `Beds24 calendar error ${calRes.status}: ${errText}` },
        { status: 502 }
      );
    }

    const calJson = await calRes.json();
    const calData: any[] = calJson.data || [];

    // ── Analizar precios por habitación ───────────────────────────────────────
    // Para cada habitación recogemos todos los precios y calculamos estadísticas
    const pricesByRoom: Record<string, {
      min: number;
      max: number;
      p25: number;   // percentil 25 ≈ temporada baja
      p50: number;   // mediana ≈ temporada media
      p75: number;   // percentil 75 ≈ temporada media-alta
      p90: number;   // percentil 90 ≈ temporada alta
      name: string;
      samples: number;
    }> = {};

    for (const roomData of calData) {
      const roomId = String(roomData.roomId);
      if (!PARENT_ROOM_IDS.includes(roomId)) continue;

      const prices: number[] = [];

      if (Array.isArray(roomData.calendar)) {
        for (const day of roomData.calendar) {
          // price1 es el precio base del día (sin impuestos)
          const raw = day.price1 ?? day.price;
          if (raw != null && Number(raw) > 0) {
            // Aplicar impuestos para obtener el precio FINAL al cliente
            prices.push(Math.round(Number(raw) * TAX_FACTOR));
          }
        }
      }

      if (prices.length === 0) continue;

      prices.sort((a, b) => a - b);
      const n = prices.length;

      pricesByRoom[roomId] = {
        name: ROOM_NAMES[roomId] || roomId,
        samples: n,
        min: prices[0],
        max: prices[n - 1],
        p25: prices[Math.floor(n * 0.25)],
        p50: prices[Math.floor(n * 0.50)],
        p75: prices[Math.floor(n * 0.75)],
        p90: prices[Math.floor(n * 0.90)],
      };
    }

    // ── Leer multiplicadores OTA desde Supabase ───────────────────────────────
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'ota_multipliers')
      .maybeSingle();

    const multipliers = settingsRow?.value
      ? (typeof settingsRow.value === 'string' ? JSON.parse(settingsRow.value) : settingsRow.value)
      : { airbnb: 1.20, booking: 1.35 };

    return NextResponse.json({
      success: true,
      pricesByRoom,
      multipliers,
      meta: {
        startDate: startStr,
        endDate: endStr,
        taxFactor: TAX_FACTOR,
        roomsReturned: calData.length,
      },
    });

  } catch (err: any) {
    if (err.message === 'TOKEN_EXPIRED') {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 401 });
    }
    console.error('beds24-prices GET error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/beds24-prices
 * Guarda los multiplicadores OTA en Supabase settings.
 * Body: { airbnb: number, booking: number }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { airbnb, booking } = body;

    if (typeof airbnb !== 'number' || typeof booking !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Se esperan: airbnb (number), booking (number)' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'ota_multipliers', value: JSON.stringify({ airbnb, booking }) }, { onConflict: 'key' });

    if (error) throw error;

    return NextResponse.json({ success: true, multipliers: { airbnb, booking } });
  } catch (err: any) {
    console.error('beds24-prices POST error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
