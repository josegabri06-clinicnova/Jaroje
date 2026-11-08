import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { rateLimitResponse } from '@/lib/public-rate-limit';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const ACCOUNT_RE = /^[a-z0-9_-]{1,30}$/;
const BOOKING_RE = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * GET /api/public/transfer-account?bookingId=...
 * Devuelve SOLO el nombre de la cuenta de transferencia que debe mostrar la página pública de pago
 * (la elegida para esa reserva o, si no hay, la cuenta por defecto). Nada más de las tablas.
 * Sustituye a las lecturas de booking_portal_settings y settings que la página hacía con la clave pública.
 * No revela si la reserva existe: sin ajuste propio responde igual que con una reserva cualquiera (la cuenta por defecto).
 */
export async function GET(req: Request) {
  try {
    const limited = await rateLimitResponse(req, 'transfer-account', { max: 60, windowMs: 15 * 60_000, lockMs: 5 * 60_000 });
    if (limited) return limited;

    const bookingId = (new URL(req.url).searchParams.get('bookingId') || '').trim();
    let account: string | null = null;

    if (bookingId && BOOKING_RE.test(bookingId)) {
      const { data } = await supabase
        .from('booking_portal_settings')
        .select('transfer_account')
        .eq('booking_id', bookingId)
        .maybeSingle();
      const own = String(data?.transfer_account ?? '').toLowerCase().trim();
      if (ACCOUNT_RE.test(own)) account = own;
    }

    if (!account) {
      const { data } = await supabase.from('settings').select('value').eq('key', 'default_transfer_account').maybeSingle();
      const def = String(data?.value ?? '').toLowerCase().trim();
      if (ACCOUNT_RE.test(def)) account = def;
    }

    return NextResponse.json({ success: true, account }, { headers: NO_STORE });
  } catch (err) {
    console.error('[transfer-account] Error:', err instanceof Error ? err.name : 'desconocido');
    return NextResponse.json({ success: true, account: null }, { headers: NO_STORE });
  }
}
