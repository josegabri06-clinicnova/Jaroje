import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TAX_FACTOR = 1.19; // IVA 16% + ISH 3%

// Rooms principales de Beds24
const ROOMS: { id: string; name: string; icon: string }[] = [
  { id: '679077', name: 'Habitación DOBLE', icon: '🛏️' },
  { id: '679087', name: 'Apartamento Premier 1 dorm.', icon: '🏠' },
  { id: '679091', name: 'Apartamento Premier 2 dorm.', icon: '🏠' },
  { id: '679092', name: 'Apartamento Premier 3 dorm.', icon: '🏡' },
  { id: '679093', name: 'Casa Vacacional 3 dorm.', icon: '🏖️' },
];

/**
 * Estructura de un tier de precio por estancia
 */
interface PriceTier {
  name: string;
  minStay: number;
  maxStay: number;
  offsetPct: number;      // Porcentaje sobre el precio base (0 = base, -15 = -15%, etc.)
  priceRaw: number;       // Sin impuestos
  priceDirecto: number;   // Con impuestos, sin OTA
  priceAirbnb: number;
  priceBooking: number;
}

/**
 * GET /api/beds24-prices
 *
 * Lee:
 * 1. El precio base (price1) del calendario de Beds24 para cada habitación
 * 2. Las reglas de precio por estancia (Daily Price Rules / fixedPrices)
 *    para construir los tiers de descuento por duración
 *
 * Fórmula de precio al huésped:
 *   precio_base × (1 + offsetPct/100) × multiplicador_OTA × 1.19
 */
export async function GET() {
  try {
    const token = await getBeds24Token();

    // 1. Obtener multiplicadores OTA desde Supabase
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

    // 2. Obtener precio base del calendario (próximos 90 días)
    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    const endDate90 = new Date(today);
    endDate90.setDate(today.getDate() + 90);
    const endDate = endDate90.toISOString().split('T')[0];

    const roomIdParams = ROOMS.map(r => `roomId=${r.id}`).join('&');

    const [calRes, fixedRes] = await Promise.all([
      // Calendar: precios diarios (base price)
      fetch(
        `https://api.beds24.com/v2/inventory/rooms/calendar?startDate=${startDate}&endDate=${endDate}&${roomIdParams}&includePrices=true`,
        { headers: { token }, cache: 'no-store' }
      ),
      // FixedPrices: reglas de precio por estancia (Daily Price Rules)
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

    // Extraer precio base (price1) del primer rango del calendario para cada habitación
    const basePriceByRoom: Record<string, number> = {};
    for (const entry of calData) {
      const roomId = String(entry.roomId || '');
      const ranges: any[] = entry.calendar || [];
      for (const range of ranges) {
        const p = Number(range.price1 ?? 0);
        if (p > 0 && !basePriceByRoom[roomId]) {
          basePriceByRoom[roomId] = p;
          break;
        }
      }
    }

    // Extraer reglas de precio por estancia (fixedPrices)
    // Estructura: { roomId, name, minStay, maxStay, priceOffset, priceFromId }
    let fixedPricesData: any[] = [];
    if (fixedRes.ok) {
      const fixedJson = await fixedRes.json();
      fixedPricesData = Array.isArray(fixedJson) ? fixedJson : (fixedJson.data || []);
    } else {
      console.warn(`[beds24-prices] fixedPrices endpoint returned ${fixedRes.status} — using fallback discounts`);
    }

    // Agrupar fixedPrices por roomId
    const rulesByRoom: Record<string, any[]> = {};
    for (const fp of fixedPricesData) {
      const roomId = String(fp.roomId || '');
      if (!rulesByRoom[roomId]) rulesByRoom[roomId] = [];
      rulesByRoom[roomId].push(fp);
    }

    // Fallback de descuentos si fixedPrices no devuelve datos
    // Basado en las Daily Price Rules visibles en Beds24
    const FALLBACK_TIERS: Record<string, { minStay: number; maxStay: number; offsetPct: number; name: string }[]> = {
      '679077': [ // Habitación DOBLE — tiene -10.8% en 7-14 noches (diferente al resto)
        { name: 'Estándar 1-6 noches',  minStay: 1,  maxStay: 6,   offsetPct: 0    },
        { name: 'Estándar 7-14 noches', minStay: 7,  maxStay: 14,  offsetPct: -10.8 },
        { name: 'Estándar 15-29 noch',  minStay: 15, maxStay: 29,  offsetPct: -25  },
        { name: 'Estándar +29 noches',  minStay: 30, maxStay: 100, offsetPct: -40  },
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

    // Construir resultado final por habitación
    const rooms = ROOMS.map(room => {
      const baseRaw = basePriceByRoom[room.id] ?? 0;

      // Intentar usar reglas de fixedPrices (si vinieron de Beds24)
      // Si no, usar fallback hardcodeado de las capturas del usuario
      const apiRules = rulesByRoom[room.id] || [];
      const fallbackTiers = FALLBACK_TIERS[room.id] || [];

      let tiers: PriceTier[];

      if (apiRules.length > 0) {
        // Ordenar por minStay
        const sorted = [...apiRules].sort((a, b) => (a.minStay ?? 1) - (b.minStay ?? 1));

        // Encontrar la regla base (sin priceFromId o la de menor minStay)
        const baseRule = sorted.find(r => !r.priceFromId) || sorted[0];

        tiers = sorted.map(rule => {
          const offsetPct = rule.priceOffset ?? 0; // ya viene como -15, -25, etc.
          const tierRaw = baseRaw > 0 ? baseRaw * (1 + offsetPct / 100) : 0;
          return {
            name: rule.name || `${rule.minStay}-${rule.maxStay} noches`,
            minStay: rule.minStay ?? 1,
            maxStay: rule.maxStay ?? 999,
            offsetPct,
            priceRaw: Math.round(tierRaw * 100) / 100,
            priceDirecto: tierRaw > 0 ? Math.round(tierRaw * TAX_FACTOR) : 0,
            priceAirbnb:  tierRaw > 0 ? Math.round(tierRaw * multipliers.airbnb * TAX_FACTOR) : 0,
            priceBooking: tierRaw > 0 ? Math.round(tierRaw * multipliers.booking * TAX_FACTOR) : 0,
          };
        });
      } else {
        // Usar fallback con los descuentos hardcodeados de las capturas
        tiers = fallbackTiers.map(ft => {
          const tierRaw = baseRaw > 0 ? baseRaw * (1 + ft.offsetPct / 100) : 0;
          return {
            name: ft.name,
            minStay: ft.minStay,
            maxStay: ft.maxStay,
            offsetPct: ft.offsetPct,
            priceRaw: Math.round(tierRaw * 100) / 100,
            priceDirecto: tierRaw > 0 ? Math.round(tierRaw * TAX_FACTOR) : 0,
            priceAirbnb:  tierRaw > 0 ? Math.round(tierRaw * multipliers.airbnb * TAX_FACTOR) : 0,
            priceBooking: tierRaw > 0 ? Math.round(tierRaw * multipliers.booking * TAX_FACTOR) : 0,
          };
        });
      }

      return {
        id: room.id,
        name: room.name,
        icon: room.icon,
        priceRaw: baseRaw,                                                              // Precio base s/imp editable
        priceDirecto: baseRaw > 0 ? Math.round(baseRaw * TAX_FACTOR) : 0,
        priceAirbnb:  baseRaw > 0 ? Math.round(baseRaw * multipliers.airbnb * TAX_FACTOR) : 0,
        priceBooking: baseRaw > 0 ? Math.round(baseRaw * multipliers.booking * TAX_FACTOR) : 0,
        tiers,                                                                          // Tiers con descuentos LOS
        rulesSource: apiRules.length > 0 ? 'beds24' : 'fallback',
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
    if (err.message === 'TOKEN_EXPIRED') {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 401 });
    }
    console.error('beds24-prices GET error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/beds24-prices
 * Actualiza el precio base (price1) de una habitación en el calendario de Beds24.
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

    const fromDate = body.from || new Date().toISOString().split('T')[0];
    const toDate = body.to || (() => {
      const d = new Date();
      d.setDate(d.getDate() + 365);
      return d.toISOString().split('T')[0];
    })();

    const token = await getBeds24Token();

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
      return NextResponse.json(
        { success: false, error: `Beds24 error ${res.status}: ${errText}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      roomId,
      priceRaw,
      from: fromDate,
      to: toDate,
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
