/**
 * Teléfono para verificar al huésped cuando nuestra copia aún no lo tiene pero Beds24 sí. Solo servidor y solo lectura.
 * Aparte de guest-access para que las rutas que no consultan Beds24 (p. ej. la entrega de archivos) sigan siendo ligeras.
 */
import { hasUsablePhone } from '@/lib/guest-auth';
import { getBeds24Token, extractPhoneFromBookingData, isDummyOrInvalidPhone } from '@/lib/beds24';
import { beds24FetchTracked } from '@/lib/beds24-credits';

/** Un teléfono sirve para verificar si es utilizable y no es uno ficticio o de reenvío de una OTA */
export function isVerifiablePhone(phone: unknown, notes?: string | null, channel?: string | null): boolean {
  return hasUsablePhone(phone) && !isDummyOrInvalidPhone(String(phone), notes, channel);
}

/**
 * Teléfono verificable de la reserva según Beds24, con los mismos campos que usa el listado con el que el portal decide bloquear.
 * null = la reserva no tiene; undefined = no se pudo consultar (no es lo mismo que no tener).
 */
export async function fetchLiveBookingPhone(bookingId: string): Promise<string | null | undefined> {
  try {
    const res = await beds24FetchTracked('portal:verificar', 'reserva-id', `https://api.beds24.com/v2/bookings?id=${bookingId}`, {
      headers: { 'token': await getBeds24Token() },
      cache: 'no-store'
    });
    if (!res.ok) return undefined;
    const booking = (await res.json())?.data?.[0];
    if (!booking || String(booking.id) !== bookingId) return null;
    const phone = extractPhoneFromBookingData(booking);
    return isVerifiablePhone(phone, booking.notes, booking.channel || booking.referer) ? phone : null;
  } catch (err) {
    console.warn('[verify] No se pudo consultar el teléfono en Beds24:', (err as Error)?.message);
    return undefined;
  }
}
