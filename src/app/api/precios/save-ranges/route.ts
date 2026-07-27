import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const defaultSeasonRanges = [
  // Temporada Alta
  { season: "alta", from: "2026-12-18", to: "2027-01-08" },
  { season: "alta", from: "2027-03-19", to: "2027-04-03" },
  { season: "alta", from: "2027-12-17", to: "2028-01-07" },
  // Temporada Media-Alta
  { season: "media_alta", from: "2026-07-15", to: "2026-08-17" },
  { season: "media_alta", from: "2027-07-16", to: "2027-08-13" },
  // Temporada Media
  { season: "media", from: "2026-09-12", to: "2026-09-16" },
  { season: "media", from: "2026-10-30", to: "2026-12-17" },
  { season: "media", from: "2027-05-14", to: "2027-05-15" },
  { season: "media", from: "2027-09-15", to: "2027-09-18" },
  { season: "media", from: "2027-10-29", to: "2027-12-16" }
];

/**
 * GET /api/precios/save-ranges
 * Carga los rangos de temporada de Supabase, auto-sembrando si no existen.
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'season_ranges')
      .maybeSingle();

    if (error) throw error;

    if (data?.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      return NextResponse.json({ success: true, ranges: parsed });
    }

    // Auto-seeding
    console.log('[Save-Ranges API] Sembrando rangos de temporada por defecto...');
    const { error: upsertErr } = await supabase
      .from('settings')
      .upsert({ key: 'season_ranges', value: defaultSeasonRanges }, { onConflict: 'key' });

    if (upsertErr) throw upsertErr;

    return NextResponse.json({ success: true, ranges: defaultSeasonRanges });
  } catch (err: any) {
    console.error('[Save-Ranges GET Error]:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/precios/save-ranges
 * Guarda los rangos de temporada enviados por el cliente.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { ranges } = body;

    if (!ranges || !Array.isArray(ranges)) {
      return NextResponse.json({ success: false, error: 'Se requiere un array de rangos' }, { status: 400 });
    }

    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'season_ranges', value: ranges }, { onConflict: 'key' });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Save-Ranges POST Error]:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
