import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { safeFilesNext } from '@/lib/safe-next';

// Rutas públicas que no requieren sesión
const PUBLIC_FILE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|pdf)$/i;

function isPublicPath(pathname: string, req?: NextRequest): boolean {
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
    // Archivos estáticos (imágenes, css, js…): nunca dentro de /api, donde una ruta puede terminar en .jpg o .pdf
    // y aun así servir datos privados (p. ej. /api/files/dni_images/x.jpg)
    (PUBLIC_FILE_EXTENSIONS.test(pathname) && !pathname.startsWith('/api/'))
  ) {
    return true;
  }

  // Rutas de autenticación pública (login únicamente)
  if (
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname === '/api/auth/session' ||
    pathname === '/api/auth/verify-recovery-key' ||
    pathname === '/api/auth/webauthn/login/options' ||
    pathname === '/api/auth/webauthn/login/verify'
  ) {
    return true;
  }

  // Rutas públicas de pagos para huéspedes (subida de comprobantes)
  if (pathname === '/api/payments/transfer-submit') {
    return true;
  }

  // Delegar autenticación por token en exportación si viene con parámetro token o header de autorización
  if (pathname === '/api/export' && req) {
    if (req.nextUrl.searchParams.has('token') || req.headers.has('authorization') || req.headers.has('x-export-token')) {
      return true;
    }
  }

  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Omitir recursos públicos, estáticos y webhooks
  if (isPublicPath(pathname, req)) {
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
    // Un enlace a un archivo de huésped (DNI, comprobante) abierto desde WhatsApp u otro navegador sin sesión: se lleva al inicio de
    // sesión y, tras entrar con el PIN, se vuelve al archivo. Solo para navegaciones del navegador; las demás peticiones reciben el 401.
    if (pathname.startsWith('/api/files/') && req.method === 'GET') {
      const isNavigation = req.headers.get('sec-fetch-mode') === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
      const next = safeFilesNext(pathname);
      if (isNavigation && next) {
        const loginUrl = new URL('/login', req.url);
        loginUrl.searchParams.set('next', next);
        return NextResponse.redirect(loginUrl);
      }
    }

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

  // Registro de Passkeys: Exclusivo para Administrador autenticado
  if (pathname.startsWith('/api/auth/webauthn/register')) {
    if (role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Se requieren privilegios de administrador para registrar passkeys.' },
        { status: 403 }
      );
    }
  }

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

  // Gestión de Empleados: Exclusivo para Administrador
  if (pathname.startsWith('/api/employees') || pathname.startsWith('/api/payroll')) {
    if (role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Solo administradores pueden gestionar empleados.' },
        { status: 403 }
      );
    }
  }

  // Módulos de Ajustes y Panel: Exclusivos para Administrador
  if (
    pathname.startsWith('/ajustes') ||
    pathname.startsWith('/panel') ||
    pathname.startsWith('/api/beds24-auth') ||
    pathname === '/api/settings/pins' ||
    pathname === '/api/settings/recovery-key'
  ) {
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

  // Precios y cuenta bancaria: Recepción puede consultarlos (GET), pero solo el Administrador puede modificarlos
  const isReadMethod = req.method === 'GET' || req.method === 'HEAD';
  if (
    pathname === '/api/precios/sync' ||
    (!isReadMethod && (
      pathname === '/api/beds24-prices' ||
      pathname === '/api/precios/save-ranges' ||
      pathname === '/api/settings/transfer-account'
    ))
  ) {
    if (role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Se requieren privilegios de administrador para modificar precios o la cuenta bancaria.' },
        { status: 403 }
      );
    }
  }

  // Operaciones de Cobros y Aprobación de Transferencias: Solo Admin y Recepción
  if (
    pathname === '/api/payments/transfer-approve' ||
    pathname === '/api/reservas/payment' ||
    pathname === '/api/reservas/rebalance-group'
  ) {
    if (role !== 'admin' && role !== 'recepcion') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: No autorizado para gestionar pagos o transferencias.' },
        { status: 403 }
      );
    }
  }

  // Staff de Limpieza y Mantenimiento: Restringido a /staff, /calendario y sus APIs asociadas
  if (role === 'staff_limpieza' || role === 'staff_mantenimiento') {
    if (pathname.startsWith('/api/')) {
      const allowedStaffApis = [
        '/api/tasks',
        '/api/reservas',
        '/api/auth/logout',
        '/api/employee-logs',
        '/api/room-status',
        '/api/inventory', // exportación del inventario (la propia ruta limita los roles)
        '/api/db' // pasarela de base de datos: ella misma decide por rol qué puede hacer cada perfil
      ];
      const isAllowed = allowedStaffApis.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'));
      // Las reservas son de solo lectura para limpieza y mantenimiento: modificar, crear o cancelar una reserva (con aviso al huésped
      // por WhatsApp) es cosa de Recepción y Administración. La pantalla del equipo solo consulta (GET).
      if (isAllowed && !isReadMethod && (pathname === '/api/reservas' || pathname.startsWith('/api/reservas/'))) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Las reservas son de solo lectura para este perfil.' },
          { status: 403 }
        );
      }
      if (!isAllowed) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Permisos insuficientes para este recurso.' },
          { status: 403 }
        );
      }
    } else {
      const isAllowedStaffPage = pathname === '/staff' || pathname.startsWith('/staff') || pathname === '/calendario' || pathname.startsWith('/calendario') || pathname === '/inventario' || pathname.startsWith('/inventario');
      if (!isAllowedStaffPage) {
        return NextResponse.redirect(new URL('/staff', req.url));
      }
    }
  }

  // Recepción: no puede entrar a /staff
  if (role === 'recepcion') {
    if (pathname.startsWith('/staff')) {
      return NextResponse.redirect(new URL('/calendario', req.url));
    }
  }

  // Sesión y permisos válidos -> continuar con la petición
  return NextResponse.next();
}

// Compatibilidad Next.js 16 (proxy) y versiones anteriores (middleware)
export const proxy = middleware;
export default middleware;

export const config = {
  matcher: [
    /*
     * Coincidir con todas las rutas excepto archivos estáticos internos de Next.js
     */
    '/((?!_next/static|_next/image).*)',
  ],
};

