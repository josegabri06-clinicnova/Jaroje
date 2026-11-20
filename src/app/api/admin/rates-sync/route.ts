import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getSessionFromRequest } from '@/lib/session';
import { rateLimitResponse } from '@/lib/public-rate-limit';
import { syncRatesFromBeds24 } from '@/lib/rates-mirror';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Solo administradores con sesión (el middleware ya lo exige; aquí se vuelve a comprobar) */
async function requireAdmin(req: Request): Promise<NextResponse | null> {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden: Se requieren privilegios de administrador.' }, { status: 403, headers: NO_STORE });
  }
  return null;
}

/** Estado de la copia de tarifas del portal de venta: cuándo se sincronizó por completo por última vez y cuántas noches guarda */
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const [synced, count] = await Promise.all([
      supabase.from('settings').select('value').eq('key', 'rates_mirror_synced_at').maybeSingle(),
      supabase.from('beds24_rates').select('*', { count: 'exact', head: true }),
    ]);
    const raw = String(synced.data?.value ?? '').replace(/^"|"$/g, '');
    return NextResponse.json({ success: true, syncedAt: raw || null, rows: count.count ?? 0 }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo leer el estado de la copia.' }, { status: 500, headers: NO_STORE });
  }
}

/** Vuelve a copiar de Beds24 las tarifas del próximo año (5 consultas de 1 crédito). Máximo 3 veces cada 10 minutos. */
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const limited = await rateLimitResponse(req, 'rates-sync-admin', { max: 3, windowMs: 10 * 60_000, lockMs: 5 * 60_000 });
  if (limited) return limited;

  try {
    const result = await syncRatesFromBeds24();
    return NextResponse.json({ success: result.ok, ...result }, { headers: NO_STORE });
  } catch (err) {
    console.error('[Admin Rates Sync] Error:', (err as Error)?.message);
    return NextResponse.json({ success: false, error: 'No se pudo sincronizar con Beds24.' }, { status: 500, headers: NO_STORE });
  }
}
