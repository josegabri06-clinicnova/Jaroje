import { NextResponse } from 'next/server';
import { normalizeBookingId, hasUsablePhone, phoneLast4, grantGuestAccess } from '@/lib/guest-auth';
import { resolveBookingPhone } from '@/lib/guest-phone';
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

  const phone = await resolveBookingPhone(bookingId);
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
