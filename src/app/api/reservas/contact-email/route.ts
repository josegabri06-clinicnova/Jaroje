import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getSessionFromRequest } from '@/lib/session';
import { updateBeds24BookingEmail, clearBeds24Cache } from '@/lib/beds24';
import { isValidGuestEmail } from '@/lib/guest-email';

export const dynamic = 'force-dynamic';

const MAX_BOOKINGS = 20; // habitaciones de un mismo grupo

/**
 * POST /api/reservas/contact-email  { bookingIds: (string|number)[], email: string }
 * Guarda el correo de contacto de un huésped (cuando no quiere dar su teléfono). Solo Administración y Recepción.
 * Se escribe primero en Beds24 (la fuente de verdad: la sincronización copia de allí) y después en la copia de Supabase.
 * Solo cambia el correo: no toca precio, fechas, estado, teléfono ni envía ningún mensaje.
 */
export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (session?.role !== 'admin' && session?.role !== 'recepcion') {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const email = String(body?.email ?? '').trim().toLowerCase();
    const ids = Array.isArray(body?.bookingIds) ? [...new Set<string>(body.bookingIds.map((i: unknown) => String(i)))] : [];

    if (!isValidGuestEmail(email)) {
      return NextResponse.json({ success: false, error: 'Escribe un correo válido.' }, { status: 400 });
    }
    if (ids.length === 0 || ids.length > MAX_BOOKINGS || !ids.every(id => /^\d{1,15}$/.test(id))) {
      return NextResponse.json({ success: false, error: 'Reserva no válida.' }, { status: 400 });
    }

    // Solo reservas que existen (así no se manda a Beds24 un número inventado, que crearía una reserva nueva o fallaría)
    const { data: found, error: findErr } = await supabase.from('beds24_reservations').select('id').in('id', ids);
    if (findErr) {
      return NextResponse.json({ success: false, error: 'No se pudo comprobar la reserva. Inténtalo de nuevo.' }, { status: 500 });
    }
    const existing = (found || []).map((r: { id: string | number }) => String(r.id));
    if (!existing.includes(ids[0])) {
      return NextResponse.json({ success: false, error: 'Esta reserva no está en Beds24: no se puede guardar el correo.' }, { status: 404 });
    }

    if (!(await updateBeds24BookingEmail(existing, email))) {
      return NextResponse.json({ success: false, error: 'Beds24 no aceptó el cambio. Inténtalo de nuevo.' }, { status: 502 });
    }

    const { error: mirrorErr } = await supabase
      .from('beds24_reservations')
      .update({ guest_email: email, updated_at: new Date().toISOString() })
      .in('id', existing);
    if (mirrorErr) console.warn('[contact-email] Guardado en Beds24, pero no en la copia local:', mirrorErr.message);

    clearBeds24Cache();
    return NextResponse.json({ success: true, email });
  } catch (err) {
    console.error('[contact-email] Error:', (err as Error)?.message);
    return NextResponse.json({ success: false, error: 'Error interno.' }, { status: 500 });
  }
}
