import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── IDs de habitaciones padre (tipos de alojamiento canónicos en Beds24) ────────
const PARENT_ROOM_IDS = ['679077', '679087', '679091', '679092', '679093'];

// ── Mapeo de nombre de tarifa (de Beds24) → clave de temporada interna ──────────
// Beds24 guarda los "fixed prices" con un campo `name` libre que nosotros definimos.
// Si tus tarifas en Beds24 se llaman de otra forma ajusta este mapa.
function resolveSeasonKey(name: string): string | null {
  const n = (name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (n.includes('baja'))           return 'baja';
  if (n.includes('media alta') || n.includes('media-alta') || n.includes('mediaalta')) return 'media_alta';
  if (n.includes('media'))          return 'media';
  if (n.includes('alta'))           return 'alta';
  return null;
}

/**
 * GET /api/beds24-prices
 * Devuelve:
 * - prices: { roomId: { baja, media, media_alta, alta } }  (leídos desde Beds24 fixedPrices)
 * - multipliers: { airbnb, booking }  (leídos desde Supabase settings)
 */
export async function GET() {
  try {
    const token = await getBeds24Token();

    // ── 1. Llamar a Beds24 /inventory/fixedPrices ────────────────────────────
    const roomIdParams = PARENT_ROOM_IDS.map(id => `roomId=${id}`).join('&');
    const fpRes = await fetch(
      `https://api.beds24.com/v2/inventory/fixedPrices?${roomIdParams}`,
      {
        headers: { token },
        cache: 'no-store',
      }
    );

    if (!fpRes.ok) {
      const errText = await fpRes.text();
      return NextResponse.json(
        { success: false, error: `Beds24 error ${fpRes.status}: ${errText}` },
        { status: 502 }
      );
    }

    const fpJson = await fpRes.json();
    const fixedPrices: any[] = fpJson.data || [];

    // ── 2. Mapear a estructura interna ───────────────────────────────────────
    // Beds24 devuelve: [ { id, roomId, name, price1, from, to, ... }, ... ]
    // price1 = precio base por noche (1 persona/grupo hasta capacidad base)
    const prices: Record<string, Record<string, number>> = {};

    for (const fp of fixedPrices) {
      const roomId = String(fp.roomId);
      const seasonKey = resolveSeasonKey(fp.name || '');
      if (!seasonKey) continue; // ignorar tarifas sin nombre de temporada reconocible

      const priceValue = fp.price1 ?? fp.price;
      if (priceValue == null || isNaN(Number(priceValue))) continue;

      if (!prices[roomId]) prices[roomId] = {};
      // Si hay varias con el mismo nombre, guardamos la primera (o el menor valor = base)
      if (prices[roomId][seasonKey] === undefined) {
        prices[roomId][seasonKey] = Number(priceValue);
      }
    }

    // ── 3. Leer multiplicadores de Supabase ──────────────────────────────────
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
      prices,
      multipliers,
      raw: fixedPrices, // útil para debug
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
      return NextResponse.json({ success: false, error: 'Parámetros inválidos. Se esperan: airbnb (number), booking (number)' }, { status: 400 });
    }

    const value = JSON.stringify({ airbnb, booking });

    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'ota_multipliers', value }, { onConflict: 'key' });

    if (error) throw error;

    return NextResponse.json({ success: true, multipliers: { airbnb, booking } });
  } catch (err: any) {
    console.error('beds24-prices POST error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
