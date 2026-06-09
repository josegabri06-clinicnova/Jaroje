import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PARENT_ROOM_IDS = ['679077', '679087', '679091', '679092', '679093'];
const TAX_FACTOR = 1.19; // IVA 16% + ISH 3%

const ROOM_NAMES: Record<string, string> = {
  '679077': 'Habitación DOBLE',
  '679087': 'Apartamento Premier 1 dorm',
  '679091': 'Apartamento Premier 2 dorm',
  '679092': 'Apartamento Premier 3 dorm',
  '679093': 'Casa Vacacional 3 dorm',
};

/**
 * GET /api/beds24-prices
 * Lee las tarifas fijas (fixedPrices) de Beds24 y las devuelve con impuestos aplicados.
 * Estructura de respuesta:
 *   fixedPrices: [ { id, roomId, name, priceWithTax, priceRaw } ]
 *   multipliers: { airbnb, booking }
 */
export async function GET() {
  try {
    const token = await getBeds24Token();

    const roomIdParams = PARENT_ROOM_IDS.map(id => `roomId=${id}`).join('&');
    const res = await fetch(
      `https://api.beds24.com/v2/inventory/fixedPrices?${roomIdParams}`,
      { headers: { token }, cache: 'no-store' }
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { success: false, error: `Beds24 error ${res.status}: ${errText}` },
        { status: 502 }
      );
    }

    const json = await res.json();
    const raw: any[] = json.data || [];

    // Enriquecer con nombre de habitación y precio con impuestos
    const fixedPrices = raw
      .filter(fp => PARENT_ROOM_IDS.includes(String(fp.roomId)))
      .map(fp => ({
        id: fp.id,
        roomId: String(fp.roomId),
        roomName: ROOM_NAMES[String(fp.roomId)] || String(fp.roomId),
        name: fp.name || '',
        priceRaw: fp.price1 ?? fp.price ?? 0,  // precio sin impuestos (como lo almacena Beds24)
        priceWithTax: Math.round((fp.price1 ?? fp.price ?? 0) * TAX_FACTOR), // precio final al cliente
        from: fp.from || null,
        to: fp.to || null,
      }));

    // Multiplicadores OTA desde Supabase
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'ota_multipliers')
      .maybeSingle();

    const multipliers = settingsRow?.value
      ? (typeof settingsRow.value === 'string' ? JSON.parse(settingsRow.value) : settingsRow.value)
      : { airbnb: 1.20, booking: 1.35 };

    return NextResponse.json({ success: true, fixedPrices, multipliers });

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
 * Actualiza un fixedPrice en Beds24 con el nuevo precio (se envía CON impuestos, se divide por 1.19 antes de enviar).
 * Body: { id: number, roomId: string, priceWithTax: number }
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, roomId, priceWithTax } = body;

    if (!id || !roomId || typeof priceWithTax !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Se requieren: id, roomId y priceWithTax' },
        { status: 400 }
      );
    }

    // Convertir precio con impuestos → precio sin impuestos para Beds24
    const priceRaw = parseFloat((priceWithTax / TAX_FACTOR).toFixed(2));

    const token = await getBeds24Token();

    const res = await fetch('https://api.beds24.com/v2/inventory/fixedPrices', {
      method: 'POST',  // Beds24 usa POST para crear/modificar (si se incluye id = modificar)
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        id: Number(id),
        roomId: Number(roomId),
        price1: priceRaw,
      }]),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { success: false, error: `Beds24 error ${res.status}: ${errText}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      priceRaw,
      priceWithTax,
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
