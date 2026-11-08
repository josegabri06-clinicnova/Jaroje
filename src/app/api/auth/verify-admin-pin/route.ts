import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { isPinLocked, registerPinFailure, clearPinFailures } from '@/lib/login-throttle';
import { getExpectedPin, safeEqual, clientIp } from '@/lib/server-pins';

export const dynamic = 'force-dynamic';

/**
 * Comprueba el PIN de administrador (desbloquear precios, borrar inventario…) SIN tocar la sesión:
 * no emite cookie, solo responde si el PIN es correcto. Requiere sesión de administrador o recepción.
 */
export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session || (session.role !== 'admin' && session.role !== 'recepcion')) {
    return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 403 });
  }

  const ip = clientIp(req);
  if (await isPinLocked('admin', ip)) {
    return NextResponse.json({ success: false, error: 'Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
  if (!pin) {
    return NextResponse.json({ success: false, error: 'PIN requerido.' }, { status: 400 });
  }

  const expected = await getExpectedPin('admin');
  if (!expected) {
    return NextResponse.json({ success: false, error: 'PIN de administrador no configurado en el servidor.' }, { status: 500 });
  }

  if (!safeEqual(pin, expected)) {
    await registerPinFailure('admin', ip);
    return NextResponse.json({ success: false, error: 'PIN incorrecto.' }, { status: 401 });
  }

  await clearPinFailures(ip);
  return NextResponse.json({ success: true });
}
