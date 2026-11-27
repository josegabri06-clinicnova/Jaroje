import { NextResponse } from 'next/server';
import { normalizeBookingId, hasUsablePhone, phoneLast4, grantGuestAccess } from '@/lib/guest-auth';
import { resolveBookingPhone } from '@/lib/guest-phone';
import { fetchLiveBookingPhone } from '@/lib/guest-live-phone';
import { reserveBeds24Lookup } from '@/lib/beds24-public-cache';
import { rateLimitResponse } from '@/lib/public-rate-limit';
import { isVerifyLocked, registerVerifyFailure, clearVerifyFailures } from '@/lib/guest-throttle';
import { safeEqual, clientIp } from '@/lib/server-pins';

export const dynamic = 'force-dynamic';

/**
 * El huésped demuestra que es quien reservó escribiendo los últimos 4 dígitos de su teléfono.
 * Si coinciden recibe una cookie firmada, válida solo para esa reserva, con la que puede ver y cambiar sus documentos.
 * Es una ruta pública: limita los intentos por IP y por reserva (solo hay 10.000 combinaciones).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const bookingId = normalizeBookingId(body?.id);
  const last4 = String(body?.last4 ?? '').replace(/\D/g, '');
  if (!bookingId || last4.length !== 4) {
    return NextResponse.json({ success: false, code: 'invalid', error: 'Escribe los 4 últimos dígitos de tu teléfono.' }, { status: 400 });
  }

  const ip = clientIp(req);
  if (await isVerifyLocked(bookingId, ip)) {
    return NextResponse.json({ success: false, code: 'locked', error: 'Demasiados intentos. Inténtalo de nuevo más tarde.' }, { status: 429 });
  }

  // El teléfono guardado; si nuestra copia aún no lo tiene, el de Beds24 (el mismo con el que el portal pide verificar)
  let phone = await resolveBookingPhone(bookingId);
  if (!hasUsablePhone(phone)) {
    // Cuesta créditos de Beds24 en una ruta pública: límite por IP y el mismo presupuesto global que el resto del portal.
    // Si no se puede consultar ahora, se pide reintentar más tarde (no es lo mismo que "la reserva no tiene teléfono").
    const limited = await rateLimitResponse(req, 'verify-live-phone', { max: 10, windowMs: 15 * 60_000, lockMs: 15 * 60_000 });
    const live = limited || !reserveBeds24Lookup() ? undefined : await fetchLiveBookingPhone(bookingId);
    if (live === undefined) {
      return NextResponse.json({ success: false, code: 'locked', error: 'No se pudo verificar ahora. Inténtalo de nuevo más tarde.' }, { status: 429 });
    }
    phone = live;
  }
  if (!hasUsablePhone(phone)) {
    // Sin teléfono registrado no hay con qué verificar; esto no es un intento fallido del huésped
    return NextResponse.json({ success: false, code: 'no_phone', error: 'Esta reserva no tiene un teléfono registrado para verificar.' }, { status: 400 });
  }

  if (!safeEqual(last4, phoneLast4(phone) as string)) {
    await registerVerifyFailure(bookingId, ip);
    return NextResponse.json({ success: false, code: 'wrong', error: 'Los dígitos no coinciden.' }, { status: 401 });
  }

  await clearVerifyFailures(bookingId, ip);
  const res = NextResponse.json({ success: true });
  await grantGuestAccess(res, bookingId);
  return res;
}
