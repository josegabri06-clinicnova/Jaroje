import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { normalizeBookingId, grantGuestAccess } from '@/lib/guest-auth';
import { checkGuestAccess, verificationRequiredResponse, isUnknownBooking, bookingNotFoundResponse } from '@/lib/guest-access';
import { rateLimitResponse } from '@/lib/public-rate-limit';
import { isDummyOrInvalidPhone, updateBeds24BookingPhone } from '@/lib/beds24';
import { recordOtaMessageLog } from '@/lib/beds24-messages';
import { sendTemplate3_ReservacionConfirmada } from '@/lib/whatsapp';
import { buildGuestPhoneDigits } from '@/lib/guest-phone-input';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const OTA_CHANNEL = /airbnb|expedia|booking\.com/i;

const fail = (status: number, code: string, error: string) =>
  NextResponse.json({ success: false, code, error }, { status, headers: NO_STORE });

/**
 * El huésped de una reserva de OTA (Airbnb, Expedia, Booking.com) que no dio su teléfono en el chat puede dejarlo aquí (opcional).
 * Reglas, para que esta ruta pública no sirva para cambiar datos de nadie:
 *  - solo reservas de OTA que hoy NO tienen un teléfono válido (nunca sustituye uno existente);
 *  - la actualización es condicional: si otra petición o el personal guardó un teléfono entre tanto, no se pisa;
 *  - si la reserva ya tiene documentos o comprobantes, solo quien ya está autorizado en el dispositivo puede añadirlo;
 *  - límite de intentos por IP y número validado (prefijo conocido, longitud, sin números de relleno).
 * Al guardarlo hace lo mismo que cuando el teléfono llega por el chat de la OTA: lo guarda, lo sincroniza con Beds24 y envía
 * por WhatsApp la plantilla de reservación confirmada.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const guestId = normalizeBookingId(body?.id);
    if (!guestId) return fail(400, 'invalid', 'ID de reserva no válido');

    const limited = await rateLimitResponse(req, 'portal-phone', { max: 6, windowMs: 15 * 60_000, lockMs: 15 * 60_000 });
    if (limited) return limited;

    const access = await checkGuestAccess(req, guestId);
    if (!access.allowed) return verificationRequiredResponse();
    if (isUnknownBooking(access)) return bookingNotFoundResponse();

    const phone = buildGuestPhoneDigits(body?.dialCode, body?.national);
    if (!phone) return fail(400, 'invalid_phone', 'Escribe un número de teléfono válido, con su código de país.');

    const { data: row, error: rowErr } = await supabase
      .from('beds24_reservations')
      .select('id, guest_name, channel, guest_phone, check_in, check_out, status, price, deposit')
      .eq('id', guestId)
      .maybeSingle();
    if (rowErr) return fail(500, 'error', 'No se pudo comprobar la reserva. Inténtalo de nuevo.');
    if (!row) return bookingNotFoundResponse();
    if (!OTA_CHANNEL.test(String(row.channel || ''))) return fail(403, 'not_ota', 'Esta reserva no admite este cambio.');
    if (['cancelled', '0'].includes(String(row.status || '').toLowerCase())) return fail(409, 'cancelled', 'La reserva está cancelada.');
    if (!isDummyOrInvalidPhone(row.guest_phone)) return fail(409, 'has_phone', 'Esta reserva ya tiene un teléfono registrado.');

    // Con documentos o comprobantes ya subidos, solo el dispositivo que los subió (cookie) puede añadir el teléfono
    if (access.reason === 'no_phone') {
      const [{ data: checkin }, { data: receipts }] = await Promise.all([
        supabase.from('checkins').select('document_url, receipt_url').eq('reservation_id', guestId).maybeSingle(),
        supabase.from('transfer_receipts').select('id').eq('booking_id', Number(guestId)).limit(1),
      ]);
      if (checkin?.document_url || checkin?.receipt_url || (receipts && receipts.length > 0)) {
        return fail(403, 'has_documents', 'Para añadir tu teléfono escríbenos por el chat de la reserva.');
      }
    }

    // Actualización condicional: solo si el teléfono sigue siendo el que acabamos de ver
    let update = supabase.from('beds24_reservations').update({ guest_phone: phone, updated_at: new Date().toISOString() }).eq('id', guestId);
    update = row.guest_phone == null ? update.is('guest_phone', null) : update.eq('guest_phone', row.guest_phone);
    const { data: updated, error: updErr } = await update.select('id');
    if (updErr) return fail(500, 'error', 'No se pudo guardar el teléfono. Inténtalo de nuevo.');
    if (!updated || updated.length === 0) return fail(409, 'has_phone', 'Esta reserva ya tiene un teléfono registrado.');

    await supabase.from('checkins').update({ phone }).eq('reservation_id', guestId);

    // Igual que el teléfono capturado del chat de la OTA: se refleja también en Beds24 (un fallo aquí no invalida lo guardado)
    await updateBeds24BookingPhone(guestId, phone).catch(err => console.warn('[portal-phone] No se pudo guardar el teléfono en Beds24:', err?.message || err));

    // Se registra como capturado (sin guardar el número en el registro): el proceso de respuestas de la OTA deja de buscarlo
    await recordOtaMessageLog({
      bookingId: guestId,
      channel: row.channel,
      guestName: row.guest_name,
      message: 'Teléfono capturado desde el portal del huésped',
      templateType: 'ota_guest_reply_captured',
      status: 'captured',
      responsePayload: { source: 'portal' },
    });

    // Confirmación por WhatsApp. Sin reenvío forzado: respeta el anti-duplicado y la lista de números excluidos
    let whatsappSent = false;
    try {
      const lang = body?.lang === 'en' ? 'en' : body?.lang === 'es' ? 'es' : undefined;
      const wa = await sendTemplate3_ReservacionConfirmada({
        id: guestId,
        guest_name: row.guest_name,
        phone,
        channel: row.channel,
        check_in: row.check_in,
        check_out: row.check_out,
        price: row.price,
        deposit: row.deposit,
        lang,
      }, true, false);
      whatsappSent = Boolean(wa?.success);
      if (!wa?.success) console.warn(`[portal-phone] WhatsApp no enviado para la reserva ${guestId}:`, wa?.error);
    } catch (waErr) {
      console.warn(`[portal-phone] Error enviando WhatsApp para la reserva ${guestId}:`, (waErr as Error)?.message);
    }

    const res = NextResponse.json({ success: true, whatsappSent }, { headers: NO_STORE });
    await grantGuestAccess(res, guestId); // quien lo acaba de escribir lo conoce: el portal no le pide verificarlo
    return res;
  } catch (err) {
    console.error('[portal-phone] Error:', (err as Error)?.message);
    return fail(500, 'error', 'Error interno');
  }
}
