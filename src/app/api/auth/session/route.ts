import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Indica al navegador si tiene una sesión válida en el servidor (cookie HttpOnly firmada).
 * El navegador no puede leer esa cookie, así que el guardián de rutas (AuthGuard) la consulta aquí
 * en vez de fiarse de la copia antigua guardada en localStorage.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) {
    return NextResponse.json({ success: false, role: null }, { status: 401 });
  }
  return NextResponse.json({ success: true, role: session.role });
}
