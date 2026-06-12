import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBeds24Token, getSeason } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TAX_FACTOR = 1.19;

const ROOMS: { id: string; name: string; icon: string }[] = [
  { id: '679077', name: 'Habitación Doble', icon: '🛏️' },
  { id: '679087', name: 'Apartamento 1 dorm.', icon: '🏠' },
  { id: '679091', name: 'Apartamento 2 dorm.', icon: '🏠' },
  { id: '679092', name: 'Apartamento 3 dorm.', icon: '🏡' },
  { id: '679093', name: 'Casa Vacacional 3 dorm.', icon: '🏖️' },
];

const SEASON_LABELS: Record<string, string> = {
  alta:       'Temporada Alta',
  media_alta: 'Temporada Media-Alta',
  media:      'Temporada Media',
  baja:       'Temporada Baja',
};

const SEASON_BADGE: Record<string, string> = {
  alta:       'rose',
  media_alta: 'orange',
  media:      'amber',
  baja:       'sky',
};

// Descuentos LOS hardcoded desde las capturas de Beds24 (usados cuando fixedPrices devuelve vacío)
const FALLBACK_TIERS: Record<string, { minStay: number; maxStay: number; offsetPct: number; name: string }[]> = {
  '679077': [
    { name: 'Estándar 1-6 noches', minStay: 1,  maxStay: 6,   offsetPct: 0   },
    { name: 'Estándar 7-14 noches',minStay: 7,  maxStay: 14,  offsetPct: -15 },
    { name: 'Estándar 15-29 noch', minStay: 15, maxStay: 29,  offsetPct: -25 },
    { name: 'Estándar +29 noches', minStay: 30, maxStay: 100, offsetPct: -40 },
  ],
  '679087': [
    { name: 'Condo 1R 1-6 noches',  minStay: 1,  maxStay: 6,   offsetPct: 0   },
    { name: 'Condo 1R 7-14 noches', minStay: 7,  maxStay: 14,  offsetPct: -15 },
    { name: 'Condo 1R 15-29 noch',  minStay: 15, maxStay: 29,  offsetPct: -25 },
    { name: 'Condo 1R +29 noches',  minStay: 30, maxStay: 100, offsetPct: -40 },
  ],
  '679091': [
    { name: 'Condo 2R 1-6 noches',  minStay: 1,  maxStay: 6,   offsetPct: 0   },
    { name: 'Condo 2R 7-14 noches', minStay: 7,  maxStay: 14,  offsetPct: -15 },
    { name: 'Condo 2R 15-29 noch',  minStay: 15, maxStay: 29,  offsetPct: -25 },
    { name: 'Condo 2R +29 noches',  minStay: 30, maxStay: 100, offsetPct: -40 },
  ],
  '679092': [
    { name: 'Condo 3R 1-6 noches',  minStay: 1,  maxStay: 6,   offsetPct: 0   },
    { name: 'Condo 3R 7-14 noches', minStay: 7,  maxStay: 14,  offsetPct: -15 },
    { name: 'Condo 3R 15-29 noch',  minStay: 15, maxStay: 29,  offsetPct: -25 },
    { name: 'Condo 3R +29 noches',  minStay: 30, maxStay: 100, offsetPct: -40 },
  ],
  '679093': [
    { name: 'Casa Lujo 1-6 noches',  minStay: 1,  maxStay: 6,   offsetPct: 0   },
    { name: 'Casa Lujo 7-14 noch',   minStay: 7,  maxStay: 14,  offsetPct: -15 },
    { name: 'Casa Lujo 15-29 noch',  minStay: 15, maxStay: 29,  offsetPct: -25 },
    { name: 'Casa Lujo +29 noches',  minStay: 30, maxStay: 100, offsetPct: -40 },
  ],
};

/** Devuelve la fecha media de un rango para detectar la temporada */
function getMidDate(from: string, to: string): string {
  const f = new Date(from + 'T12:00:00');
  const t = new Date(to + 'T12:00:00');
  const mid = new Date((f.getTime() + t.getTime()) / 2);
  return mid.toISOString().split('T')[0];
}

/** Formatea una fecha ISO (YYYY-MM-DD) como "15 dic 2026" o "6 ene 2027" */
function fmtDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  const day = d.getDate();
  const month = d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function buildTiers(
  baseRaw: number,
  fallbackTiers: { minStay: number; maxStay: number; offsetPct: number; name: string }[],
  multipliers: { airbnb: number; booking: number }
) {
  return fallbackTiers.map(ft => {
    const tierRaw = baseRaw > 0 ? baseRaw * (1 + ft.offsetPct / 100) : 0;
    return {
      name: ft.name,
      minStay: ft.minStay,
      maxStay: ft.maxStay,
      offsetPct: ft.offsetPct,
      priceRaw:     Math.round(tierRaw * 100) / 100,
      priceDirecto: tierRaw > 0 ? Math.round(tierRaw * TAX_FACTOR) : 0,
      priceAirbnb:  tierRaw > 0 ? Math.round(tierRaw * multipliers.airbnb * TAX_FACTOR) : 0,
      priceBooking: tierRaw > 0 ? Math.round(tierRaw * multipliers.booking * TAX_FACTOR) : 0,
    };
  });
}

/**
 * GET /api/beds24-prices
 *
 * Lee el calendario completo de Beds24 (540 días) para cada habitación.
 * Devuelve todos los rangos de fechas con sus precios (1 rango por temporada).
 * También lee las reglas de descuento por estancia (LOS) de fixedPrices.
 *
 * Respuesta por habitación:
 *   id, name, icon, multipliers,
 *   seasonBlocks: [{ from, to, season, seasonLabel, badge, priceRaw, priceDirecto, priceAirbnb, priceBooking, tiers }]
 */
export async function GET() {
  try {
    const token = await getBeds24Token();

    // 1. Multiplicadores OTA desde Supabase
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

    // 2. Leer 540 días de calendario (para cubrir todas las temporadas)
    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    const endDateFull = new Date(today);
    endDateFull.setDate(today.getDate() + 540);
    const endDate = endDateFull.toISOString().split('T')[0];

    const roomIdParams = ROOMS.map(r => `roomId=${r.id}`).join('&');

    const [calRes, fixedRes] = await Promise.all([
      fetch(
        `https://api.beds24.com/v2/inventory/rooms/calendar?startDate=${startDate}&endDate=${endDate}&${roomIdParams}&includePrices=true`,
        { headers: { token }, cache: 'no-store' }
      ),
      fetch(
        `https://api.beds24.com/v2/inventory/fixedPrices?${roomIdParams}`,
        { headers: { token }, cache: 'no-store' }
      ),
    ]);

    if (!calRes.ok) {
      const t = await calRes.text();
      return NextResponse.json({ success: false, error: `Calendar error ${calRes.status}: ${t}` }, { status: 502 });
    }

    const calJson = await calRes.json();
    const calData: any[] = Array.isArray(calJson) ? calJson : (calJson.data || []);

    // fixedPrices: LOS discount rules por roomId
    let fixedPricesData: any[] = [];
    if (fixedRes.ok) {
      const fixedJson = await fixedRes.json();
      fixedPricesData = Array.isArray(fixedJson) ? fixedJson : (fixedJson.data || []);
    }

    // Agrupar rangos del calendario por roomId
    const calendarByRoom: Record<string, { from: string; to: string; price1: number }[]> = {};
    for (const entry of calData) {
      const roomId = String(entry.roomId || '');
      const ranges: { from: string; to: string; price1: number }[] = (entry.calendar || [])
        .filter((r: any) => r.price1 !== undefined && r.price1 !== null && Number(r.price1) > 0)
        .map((r: any) => ({ from: r.from, to: r.to, price1: Number(r.price1) }));
      if (ranges.length > 0) {
        calendarByRoom[roomId] = ranges;
      }
    }

    // Agrupar fixedPrices LOS rules por roomId
    const losByRoom: Record<string, any[]> = {};
    for (const fp of fixedPricesData) {
      const roomId = String(fp.roomId || '');
      if (!losByRoom[roomId]) losByRoom[roomId] = [];
      losByRoom[roomId].push(fp);
    }

    // Construir resultado por habitación
    const rooms = ROOMS.map(room => {
      const calRanges = calendarByRoom[room.id] || [];
      const fallbackTiers = FALLBACK_TIERS[room.id] || [];

      // Obtener LOS tiers para esta habitación (desde fixedPrices o fallback)
      const apiLos = losByRoom[room.id] || [];
      const losSource = apiLos.length > 0 ? 'beds24' : 'fallback';

      // Si no hay rangos del calendario, devolver un bloque vacío
      if (calRanges.length === 0) {
        return {
          id: room.id,
          name: room.name,
          icon: room.icon,
          seasonBlocks: [],
          tiers: buildTiers(0, fallbackTiers, multipliers),
          losSource,
          hasCalendarData: false,
        };
      }

      // Convertir rangos del calendario en "season blocks"
      const seasonBlocks = calRanges
        .sort((a, b) => a.from.localeCompare(b.from))
        .map(range => {
          const midDate = getMidDate(range.from, range.to);
          const season = getSeason(midDate);
          const priceRaw = range.price1;

          return {
            from: range.from,
            to: range.to,
            fromLabel: fmtDate(range.from),
            toLabel: fmtDate(range.to),
            season,
            seasonLabel: SEASON_LABELS[season] || 'Temporada',
            badge: SEASON_BADGE[season] || 'zinc',
            priceRaw,
            priceDirecto: Math.round(priceRaw * TAX_FACTOR),
            priceAirbnb:  Math.round(priceRaw * multipliers.airbnb * TAX_FACTOR),
            priceBooking: Math.round(priceRaw * multipliers.booking * TAX_FACTOR),
          };
        });

      // LOS tiers calculados sobre el primer bloque (como referencia)
      const firstPrice = seasonBlocks[0]?.priceRaw ?? 0;
      const tiers = buildTiers(firstPrice, fallbackTiers, multipliers);

      return {
        id: room.id,
        name: room.name,
        icon: room.icon,
        seasonBlocks,
        tiers,
        losSource,
        hasCalendarData: true,
      };
    });

    return NextResponse.json({
      success: true,
      rooms,
      multipliers,
      startDate,
      endDate,
    });

  } catch (err: any) {
    if (err.message === 'TOKEN_EXPIRED' || err.message === 'REFRESH_TOKEN_EXPIRED') {
      return NextResponse.json({ success: false, error: err.message }, { status: 401 });
    }
    console.error('beds24-prices GET error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/beds24-prices
 * Actualiza el precio de un rango de fechas específico en Beds24.
 * Body: { roomId: string, priceRaw: number, from: string, to: string }
 *
 * Si no se especifican from/to, aplica desde hoy hasta +540 días.
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { roomId, priceRaw } = body;

    if (!roomId || typeof priceRaw !== 'number' || priceRaw <= 0) {
      return NextResponse.json(
        { success: false, error: 'Se requieren: roomId y priceRaw (> 0)' },
        { status: 400 }
      );
    }

    const token = await getBeds24Token();

    // Si viene body.ranges, se construye un array con cada rango y el mismo precio
    const calendarEntries = body.ranges && Array.isArray(body.ranges)
      ? body.ranges.map((r: any) => ({
          from: r.from,
          to: r.to,
          price1: Math.round(priceRaw * 100) / 100,
        }))
      : [{
          from: body.from || new Date().toISOString().split('T')[0],
          to: body.to || (() => {
            const d = new Date();
            d.setDate(d.getDate() + 540);
            return d.toISOString().split('T')[0];
          })(),
          price1: Math.round(priceRaw * 100) / 100,
        }];

    const payload = [{
      roomId: Number(roomId),
      calendar: calendarEntries
    }];

    const res = await fetch('https://api.beds24.com/v2/inventory/rooms/calendar', {
      method: 'POST',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { success: false, error: `Beds24 error ${res.status}: ${errText}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, roomId, priceRaw, ranges: calendarEntries });

  } catch (err: any) {
    if (err.message === 'TOKEN_EXPIRED' || err.message === 'REFRESH_TOKEN_EXPIRED') {
      return NextResponse.json({ success: false, error: err.message }, { status: 401 });
    }
    console.error('beds24-prices PUT error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/beds24-prices
 * Guarda los multiplicadores OTA en Supabase.
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
