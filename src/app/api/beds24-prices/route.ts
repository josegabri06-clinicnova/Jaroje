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
 * GET /api/beds24-prices
 *
 * Lee el CALENDARIO de precios diarios de Beds24 (pantalla "Daily Prices").
 * 
 * NOTA IMPORTANTE sobre la API de Beds24:
 *   - El endpoint es: GET /inventory/rooms/calendar
 *   - Los params son: startDate / endDate (NO from/to)
 *   - SIN includeX params, devuelve array vacío → necesario: includePrices=true
 *   - El response es: { data: [{ roomId, calendar: [{ from, to, price1 }] }] }
 *   - calendar[] son RANGOS de fechas (no un entry por día)
 * 
 * Los precios en Beds24 son SIN impuestos.
 * Precio final al huésped = precio_beds24 × multiplicador_OTA × 1.19
 */
export async function GET() {
  try {
    const token = await getBeds24Token();

    // Rango: hoy → 90 días
    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    const toDate = new Date(today);
    toDate.setDate(today.getDate() + 90);
    const endDate = toDate.toISOString().split('T')[0];

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

    // Params correctos según spec de Beds24 v2:
    //   startDate, endDate, roomId (array), includePrices=true
    const roomIdParams = ROOMS.map(r => `roomId=${r.id}`).join('&');
    const url = `https://api.beds24.com/v2/inventory/rooms/calendar?startDate=${startDate}&endDate=${endDate}&${roomIdParams}&includePrices=true`;

    console.log('[beds24-prices] GET', url);

    const calRes = await fetch(url, {
      headers: { token },
      cache: 'no-store',
    });

    if (!calRes.ok) {
      const errText = await calRes.text();
      console.error(`[beds24-prices] Calendar error ${calRes.status}: ${errText}`);
      return NextResponse.json(
        { success: false, error: `Beds24 error ${calRes.status}: ${errText}` },
        { status: 502 }
      );
    }

    const calJson = await calRes.json();

    // El response es: { success, data: Array<{ roomId, calendar: Array<{ from, to, price1, ... }> }> }
    const calData: any[] = Array.isArray(calJson) ? calJson : (calJson.data || []);

    console.log('[beds24-prices] Received entries:', calData.length);
    if (calData.length > 0) {
      console.log('[beds24-prices] First entry sample:', JSON.stringify(calData[0]).substring(0, 400));
    }

    // Construir mapa roomId → primer price1 encontrado en los rangos del calendario
    // El calendario devuelve rangos consolidados: { from, to, price1 }
    // Tomamos el price1 del primer rango activo (más cercano a hoy)
    const priceByRoom: Record<string, number> = {};

    for (const entry of calData) {
      const roomId = String(entry.roomId || '');
      if (!ROOMS.find(r => r.id === roomId)) continue;

      const calendarRanges: any[] = entry.calendar || [];
      
      // Buscar el primer rango con price1 válido
      for (const range of calendarRanges) {
        const p = Number(range.price1 ?? 0);
        if (p > 0 && !priceByRoom[roomId]) {
          priceByRoom[roomId] = p;
          break;
        }
      }
    }

    console.log('[beds24-prices] Price map:', priceByRoom);

    // Construir resultado por habitación
    const rooms = ROOMS.map(room => {
      const priceRaw = priceByRoom[room.id] ?? 0;
      // Contar cuántos rangos de calendario se encontraron para esta habitación
      const entry = calData.find((e: any) => String(e.roomId) === room.id);
      const sampledRanges = entry ? (entry.calendar || []).length : 0;

      return {
        id: room.id,
        name: room.name,
        icon: room.icon,
        priceRaw,                                                             // Sin impuestos (en Beds24)
        priceDirecto: priceRaw > 0 ? Math.round(priceRaw * TAX_FACTOR) : 0, // × 1.19
        priceAirbnb:  priceRaw > 0 ? Math.round(priceRaw * multipliers.airbnb * TAX_FACTOR) : 0,
        priceBooking: priceRaw > 0 ? Math.round(priceRaw * multipliers.booking * TAX_FACTOR) : 0,
        sampledDays: sampledRanges,
      };
    });

    return NextResponse.json({
      success: true,
      rooms,
      multipliers,
      startDate,
      endDate,
      rawSample: calData.length > 0 ? calData[0] : null, // para debugging
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
 * PUT /api/beds24-prices
 *
 * Actualiza el precio base de una habitación en Beds24 para un rango de fechas.
 * El precio que llega en el body es SIN impuestos (precio Beds24 directo).
 * 
 * Body: { roomId: string, priceRaw: number, from?: string, to?: string }
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

    // Rango de aplicación: desde hoy hasta 365 días
    const fromDate = body.from || new Date().toISOString().split('T')[0];
    const toDate = body.to || (() => {
      const d = new Date();
      d.setDate(d.getDate() + 365);
      return d.toISOString().split('T')[0];
    })();

    const token = await getBeds24Token();

    // POST /inventory/rooms/calendar — formato correcto según spec:
    // [{ roomId, calendar: [{ from, to, price1 }] }]
    const payload = [{
      roomId: Number(roomId),
      calendar: [{
        from: fromDate,
        to: toDate,
        price1: Math.round(priceRaw * 100) / 100,
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
      console.error(`[beds24-prices] PUT error ${res.status}: ${errText}`);
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
