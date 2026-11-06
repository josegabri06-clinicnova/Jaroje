/**
 * Regla única de acceso al portal del huésped y a sus acciones.
 *
 * El portal se identifica solo con el número de reserva, que se puede probar. Por eso, si la reserva tiene un teléfono
 * con el que verificar al huésped, NO se enseña ni se permite nada hasta que escriba los 4 últimos dígitos.
 *
 * Tiene acceso quien cumple UNA de estas:
 *  - 'cookie'   : ya verificó los 4 dígitos en este dispositivo (cookie firmada de esa reserva).
 *  - 'staff'    : es personal con sesión (admin o recepción), p. ej. la vista previa del portal dentro de Reservas.
 *  - 'no_phone' : la reserva no tiene teléfono verificable (p. ej. OTA con teléfono de relleno). No hay con qué verificar,
 *                 así que sigue abierta como hasta ahora; sus documentos siguen protegidos aparte.
 *
 * Si no se puede comprobar el teléfono por un fallo de la base de datos, se cierra (fail-closed).
 */
import { NextResponse } from 'next/server';
import { isGuestAuthorized, hasUsablePhone } from '@/lib/guest-auth';
import { resolveBookingContact } from '@/lib/guest-phone';
import { getSessionFromRequest } from '@/lib/session';

export type GuestAccessReason = 'cookie' | 'staff' | 'no_phone' | 'locked';

export interface GuestAccess {
  allowed: boolean;
  reason: GuestAccessReason;
  /** Solo cuando está bloqueado: datos mínimos para la pantalla de verificación */
  contact?: { phone: string | null; guestName: string | null };
  /** Solo con reason "no_phone": si la reserva existe de verdad (un número inventado también carece de teléfono) */
  bookingFound?: boolean;
}

export async function checkGuestAccess(req: Request, bookingId: string): Promise<GuestAccess> {
  if (await isGuestAuthorized(req, bookingId)) return { allowed: true, reason: 'cookie' };

  const session = await getSessionFromRequest(req);
  if (session && (session.role === 'admin' || session.role === 'recepcion')) return { allowed: true, reason: 'staff' };

  const contact = await resolveBookingContact(bookingId);
  if (!contact.failed && !hasUsablePhone(contact.phone)) return { allowed: true, reason: 'no_phone', bookingFound: contact.found };

  return { allowed: false, reason: 'locked', contact: { phone: contact.phone, guestName: contact.guestName } };
}

/** Respuesta estándar de las rutas de escritura cuando el huésped aún no ha verificado su teléfono */
export function verificationRequiredResponse() {
  return NextResponse.json(
    { success: false, error: 'Verifica los 4 últimos dígitos de tu teléfono para continuar.', code: 'verification_required' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } }
  );
}

/** Reserva que no existe en ninguna de nuestras tablas: un número inventado tampoco tiene teléfono y pasaría como "sin teléfono" */
export function isUnknownBooking(access: GuestAccess): boolean {
  return access.reason === 'no_phone' && !access.bookingFound;
}

export function bookingNotFoundResponse() {
  return NextResponse.json({ success: false, error: 'Reserva no encontrada.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Guarda de las rutas de ESCRITURA del portal (documentos, idioma, mantenimiento, factura, comprobantes).
 * Devuelve la respuesta de rechazo, o null si se puede continuar. Exige acceso (cookie, personal o reserva sin teléfono)
 * Y que la reserva exista: así no se pueden guardar archivos, ajustes ni tareas para números de reserva inventados.
 */
export async function requireGuestWriteAccess(req: Request, bookingId: string): Promise<NextResponse | null> {
  const access = await checkGuestAccess(req, bookingId);
  if (!access.allowed) return verificationRequiredResponse();
  if (isUnknownBooking(access)) return bookingNotFoundResponse();
  return null;
}

/** Nombre de pila para saludar sin enseñar el nombre completo */
export function firstNameOf(fullName: string | null | undefined): string {
  const first = String(fullName ?? '').replace(/\(.*?\)/g, ' ').trim().split(/\s+/)[0] || '';
  return first.slice(0, 30);
}
