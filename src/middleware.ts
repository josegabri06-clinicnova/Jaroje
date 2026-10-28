import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

// Rutas públicas que no requieren sesión
const PUBLIC_FILE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|pdf)$/i;

function isPublicPath(pathname: string): boolean {
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/public') ||
    pathname.startsWith('/api/public') ||
    pathname.startsWith('/api/webhook') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/cron') ||
    pathname === '/login' ||
    pathname === '/favicon.ico' ||
    pathname === '/api/health' ||
    PUBLIC_FILE_EXTENSIONS.test(pathname)
  ) {
    return true;
  }

  // Rutas de autenticación
  if (
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname === '/api/auth/verify-recovery-key' ||
    pathname.startsWith('/api/auth/webauthn')
  ) {
    return true;
  }

  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Omitir recursos públicos, estáticos y webhooks
  if (isPublicPath(pathname)) {
    // Si ya tiene sesión activa e intenta entrar a /login, redirigir a su panel
    if (pathname === '/login') {
      const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (sessionCookie) {
        const session = await verifySessionToken(sessionCookie);
        if (session) {
          if (session.role === 'staff_limpieza' || session.role === 'staff_mantenimiento') {
            return NextResponse.redirect(new URL('/staff', req.url));
          }
          return NextResponse.redirect(new URL('/calendario', req.url));
        }
      }
    }
    return NextResponse.next();
  }

  // 2. Extraer y verificar la cookie de sesión HttpOnly
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionCookie ? await verifySessionToken(sessionCookie) : null;

  // 3. Si no hay sesión válida:
  if (!session) {
    // Si es petición a la API, rechazar con 401 Unauthorized
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesión de servidor requerida.' },
        { status: 401 }
      );
    }
    // Si es una página web, redirigir al login
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Control de Acceso Basado en Roles (RBAC) en el Servidor
  const role = session.role;

  // Módulo de Finanzas: Exclusivo para Administrador
  if (pathname.startsWith('/finanzas') || pathname.startsWith('/api/finances')) {
    if (role !== 'admin') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Se requieren privilegios de administrador.' },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL('/calendario', req.url));
    }
  }

  // Módulos de Ajustes y Panel: Exclusivos para Administrador
  if (pathname.startsWith('/ajustes') || pathname.startsWith('/panel')) {
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/calendario', req.url));
    }
  }

  // Staff de Limpieza y Mantenimiento: Solo acceso a /staff y /calendario
  if (role === 'staff_limpieza' || role === 'staff_mantenimiento') {
    const isAllowedStaffPage = pathname === '/staff' || pathname.startsWith('/staff') || pathname === '/calendario' || pathname.startsWith('/calendario');
    if (!pathname.startsWith('/api/') && !isAllowedStaffPage) {
      return NextResponse.redirect(new URL('/staff', req.url));
    }
  }

  // Recepción: no puede entrar a /staff ni a /finanzas ni a /ajustes
  if (role === 'recepcion') {
    if (pathname.startsWith('/staff')) {
      return NextResponse.redirect(new URL('/calendario', req.url));
    }
  }

  // Sesión y permisos válidos -> continuar con la petición
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Coincidir con todas las rutas excepto archivos estáticos internos de Next.js
     */
    '/((?!_next/static|_next/image).*)',
  ],
};
