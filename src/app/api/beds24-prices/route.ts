import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TAX_FACTOR = 1.19; // IVA 16% + ISH 3%

// Rooms principales de Beds24 (IDs padre)
const ROOMS: { id: string; name: string; icon: string }[] = [
  { id: '679077', name: 'Habitación DOBLE', icon: '🛏️' },
  { id: '679087', name: 'Apartamento Premier 1 dorm.', icon: '🏠' },
  { id: '679091', name: 'Apartamento Premier 2 dorm.', icon: '🏠' },
  { id: '679092', name: 'Apartamento Premier 3 dorm.', icon: '🏡' },
  { id: '679093', name: 'Casa Vacacional 3 dorm.', icon: '🏖️' },
];

/**
 * Calcula la mediana de un array de números.
 * Usamos mediana (no promedio) para evitar que precios de pico distorsionen la "tarifa base".
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * GET /api/beds24-prices
 * 
 * Lee el CALENDARIO de precios diarios de Beds24 (pantalla "Daily Prices")
 * para los próximos 90 días. Extrae la mediana por habitación como "tarifa base".
 * 
 * Los precios en Beds24 son SIN impuestos.
 * Para calcular el precio final al huésped:
 *   precio_beds24 × multiplicador_OTA × 1.19
 * 
 * Respuesta:
 *   rooms: [ { id, name, icon, priceRaw, priceBase (con impuestos directo), 
 *              priceAirbnb, priceBooking, sampleDate } ]
 *   multipliers: { airbnb, booking }
 */
export async function GET() {
  try {
    const token = await getBeds24Token();

    // Rango: desde hoy hasta 90 días (suficiente para capturar temporadas)
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const toDate = new Date(today);
    toDate.setDate(today.getDate() + 90);
    const to = toDate.toISOString().split('T')[0];

    // Multiplicadores OTA desde Supabase
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'ota_multipliers')
      .maybeSingle();

    const multipliers: { airbnb: number; booking: number } = settingsRow?.value
      ? (typeof settingsRow.value === 'string'
          ? JSON.parse(settingsRow.value)
          : settingsRow.value)
      : { airbnb: 1.20, booking: 1.35 };

    // Llamar a /inventory/rooms/calendar (incluye precios)
    // Beds24 API v2: GET /inventory/rooms/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
    const roomIdParams = ROOMS.map(r => `roomId=${r.id}`).join('&');
    const calRes = await fetch(
      `https://api.beds24.com/v2/inventory/rooms/calendar?from=${from}&to=${to}&${roomIdParams}`,
      { headers: { token }, cache: 'no-store' }
    );

    if (!calRes.ok) {
      const errText = await calRes.text();
      console.error(`[beds24-prices] Calendar API error ${calRes.status}: ${errText}`);
      return NextResponse.json(
        { success: false, error: `Beds24 error ${calRes.status}: ${errText}` },
        { status: 502 }
      );
    }

    const calJson = await calRes.json();
    const calData: any[] = Array.isArray(calJson) ? calJson : (calJson.data || []);

    // Construir mapa roomId → lista de precios diarios
    const pricesByRoom: Record<string, number[]> = {};
    for (const dayEntry of calData) {
      // El formato puede variar entre versiones:
      // { roomId, date, price1, price2, ... } o { roomId, calendar: [{ date, price1 }] }
      const roomId = String(dayEntry.roomId || '');
      if (!ROOMS.find(r => r.id === roomId)) continue;

      if (!pricesByRoom[roomId]) pricesByRoom[roomId] = [];

      // Formato flat (un entry por día)
      const p = Number(dayEntry.price1 ?? dayEntry.price ?? 0);
      if (p > 0) pricesByRoom[roomId].push(p);

      // Formato con sub-array calendar
      if (Array.isArray(dayEntry.calendar)) {
        for (const cal of dayEntry.calendar) {
          const cp = Number(cal.price1 ?? cal.price ?? 0);
          if (cp > 0) pricesByRoom[roomId].push(cp);
        }
      }
    }

    // Construir resultado por habitación
    const rooms = ROOMS.map(room => {
      const prices = pricesByRoom[room.id] || [];
      const priceRaw = median(prices); // precio sin impuestos (como está en Beds24)

      return {
        id: room.id,
        name: room.name,
        icon: room.icon,
        priceRaw,                                                   // Precio sin impuestos (editable)
        priceDirecto: Math.round(priceRaw * TAX_FACTOR),           // × 1.19 (directo)
        priceAirbnb: Math.round(priceRaw * multipliers.airbnb * TAX_FACTOR), // × OTA × 1.19
        priceBooking: Math.round(priceRaw * multipliers.booking * TAX_FACTOR),
        sampledDays: prices.length,
      };
    });

    return NextResponse.json({ success: true, rooms, multipliers, from, to });

  } catch (err: any) {
    if (err.message === 'TOKEN_EXPIRED') {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 401 });
    }
    console.error('beds24-prices GET error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/beds24-prices
 * 
 * Actualiza el precio base de una habitación en Beds24 para un rango de fechas.
 * El precio que llega en el body es SIN impuestos (precio Beds24 directo).
 * 
 * Body: { roomId: string, priceRaw: number, from?: string, to?: string }
 * 
 * Si no se especifica rango, actualiza los próximos 365 días.
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { roomId, priceRaw } = body;

    if (!roomId || typeof priceRaw !== 'number' || priceRaw <= 0) {
      return NextResponse.json(
        { success: false, error: 'Se requieren: roomId (string) y priceRaw (number > 0)' },
        { status: 400 }
      );
    }

    // Rango: desde hoy hasta 365 días si no se especifica
    const fromDate = body.from || new Date().toISOString().split('T')[0];
    const toDate = body.to || (() => {
      const d = new Date();
      d.setDate(d.getDate() + 365);
      return d.toISOString().split('T')[0];
    })();

    const token = await getBeds24Token();

    // Beds24 API v2: POST /inventory/rooms/calendar para actualizar precios
    // Formato: [{ roomId, calendar: [{ from, to, price1 }] }]
    const payload = [{
      roomId: Number(roomId),
      calendar: [{
        from: fromDate,
        to: toDate,
        price1: Math.round(priceRaw * 100) / 100, // máximo 2 decimales
      }]
    }];

    const res = await fetch('https://api.beds24.com/v2/inventory/rooms/calendar', {
      method: 'POST',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[beds24-prices] Calendar PUT error ${res.status}: ${errText}`);
      return NextResponse.json(
        { success: false, error: `Beds24 error ${res.status}: ${errText}` },
        { status: 502 }
      );
    }

    const resJson = await res.json().catch(() => ({}));

    return NextResponse.json({
      success: true,
      roomId,
      priceRaw,
      from: fromDate,
      to: toDate,
      beds24Response: resJson,
    });

  } catch (err: any) {
    if (err.message === 'TOKEN_EXPIRED') {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 401 });
    }
    console.error('beds24-prices PUT error:', err);
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
      .upsert(
        { key: 'ota_multipliers', value: JSON.stringify({ airbnb, booking }) },
        { onConflict: 'key' }
      );

    if (error) throw error;

    return NextResponse.json({ success: true, multipliers: { airbnb, booking } });
  } catch (err: any) {
    console.error('beds24-prices POST error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
