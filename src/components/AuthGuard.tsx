"use client";

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { logout, fetchServerSession, clearServerSessionCache, clearLegacyPinCopies } from '@/lib/auth';
import { LogOut, Shield, Wrench, Sparkles, KeyRound, Hammer, RefreshCw, Settings } from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';

type Role = 'admin' | 'recepcion' | 'staff_limpieza' | 'staff_mantenimiento' | null;

const PUBLIC_ROUTES = ['/login'];

const PERMITTED_ROUTES: Record<string, string[]> = {
  admin: ['/'], // Admin has universal access
  recepcion: ['/recepcion', '/calendario', '/reservas', '/nueva'],
  staff_limpieza: ['/staff', '/calendario'],
  staff_mantenimiento: ['/staff', '/calendario'],
};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [role, setRole]       = useState<Role>(null);
  const [checked, setChecked] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const start = () => setIsRefreshing(true);
    const end = () => setIsRefreshing(false);
    window.addEventListener('refresh-start', start);
    window.addEventListener('refresh-end', end);
    return () => {
      window.removeEventListener('refresh-start', start);
      window.removeEventListener('refresh-end', end);
    };
  }, []);

  const handleRefresh = () => {
    window.dispatchEvent(new Event('refresh-data'));
  };

  useEffect(() => {
    let cancelled = false;
    clearLegacyPinCopies();

    (async () => {
      // La fuente de verdad es la cookie de sesión del servidor; localStorage solo es una copia para pintar la interfaz.
      // Si el servidor no reconoce la sesión (p. ej. sesión antigua anterior a la cookie), se borra la copia: así nunca
      // queda una pantalla en blanco ni un bucle entre /login y el panel.
      const server = await fetchServerSession();
      if (cancelled) return;

      let stored = localStorage.getItem('jaroje_role') as Role;
      if (server.status === 'ok') {
        if (stored !== server.role) {
          localStorage.setItem('jaroje_role', server.role as string);
          stored = server.role;
        }
      } else if (server.status === 'none' && stored) {
        localStorage.removeItem('jaroje_role');
        stored = null;
      }
      setRole(stored);

      const isPublicRoute = PUBLIC_ROUTES.includes(pathname || '') || (pathname || '').startsWith('/public');

      if (!stored) {
        if (!isPublicRoute) {
          router.replace('/login');
        } else {
          setChecked(true);
        }
        return;
      }

      // Si está autenticado e intenta ir a /login, redirigir a su panel por defecto
      if (pathname === '/login') {
        if (stored === 'admin' || stored === 'recepcion') router.replace('/calendario');
        else router.replace('/staff');
        return;
      }

      // Las páginas públicas (portal de venta, reserva del huésped…) abren para cualquier rol: un móvil con sesión
      // de personal abierta no debe ser redirigido a su panel al abrir el enlace de una plantilla de WhatsApp
      if ((pathname || '').startsWith('/public')) {
        setChecked(true);
        return;
      }

      // Validar acceso a la ruta según el rol
      if (stored === 'admin') {
        setChecked(true);
        return;
      }

      const allowed = PERMITTED_ROUTES[stored] || [];
      const isAllowed = allowed.some(prefix => (pathname || '').startsWith(prefix));

      if (!isAllowed) {
        console.warn(`Acceso denegado a ${pathname} para el rol ${stored}. Redirigiendo...`);
        if (stored === 'recepcion') {
          router.replace('/calendario');
        } else {
          router.replace('/staff');
        }
        return;
      }

      setChecked(true);
    })();

    return () => { cancelled = true; };
  }, [pathname, router]);

  const handleLogout = async () => {
    await logout();
    clearServerSessionCache();
    router.replace('/login');
  };

  if (!checked) return <div className="fixed inset-0 bg-[#fafafa]" />;

  if (pathname?.startsWith('/public')) {
    return <>{children}</>;
  }

  return (
    <>
      <header className="px-4 py-3.5 sticky top-0 z-30 w-full flex items-center justify-between bg-white/70 backdrop-blur-xl border-b border-zinc-200/80 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2.5">
          <img src="/logo-jaroje.png" alt="Jaroje Condominios" className="h-[38px] w-auto object-contain" />
        </div>
        
        <div className="flex items-center gap-2">
          {/* Badge de rol */}
          {role === 'admin' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800">
              <Shield size={10} className="text-white" />
              <span className="text-[10px] font-bold text-white tracking-wide uppercase">Admin</span>
            </div>
          )}
          {role === 'recepcion' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-600 border border-blue-700">
              <KeyRound size={10} className="text-white" />
              <span className="text-[10px] font-bold text-white tracking-wide uppercase">Recepción</span>
            </div>
          )}
          {role === 'staff_limpieza' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500 border border-amber-600">
              <Sparkles size={10} className="text-white" />
              <span className="text-[10px] font-bold text-white tracking-wide uppercase">Limpieza</span>
            </div>
          )}
          {role === 'staff_mantenimiento' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-600 border border-rose-700">
              <Hammer size={10} className="text-white" />
              <span className="text-[10px] font-bold text-white tracking-wide uppercase">Mantenimiento</span>
            </div>
          )}

          {/* Copilot */}
          {role && role !== 'staff_mantenimiento' && role !== 'staff_limpieza' && (
            <button
              onClick={() => window.dispatchEvent(new Event('open-copilot'))}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-zinc-100 transition-colors"
              aria-label="Abrir Copiloto"
            >
              <Sparkles size={18} className="text-zinc-500" />
            </button>
          )}

          {/* Registro Rápido de Finanzas ($) — solo admin */}
          {role === 'admin' && (
            <button
              onClick={() => router.push('/finanzas?action=new_movement')}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-zinc-100 active:scale-95 transition-all text-zinc-500 hover:text-zinc-950 font-black text-[20px] leading-none cursor-pointer"
              aria-label="Registrar movimiento financiero"
            >
              $
            </button>
          )}

          {/* Campana — solo admin */}
          {role === 'admin' && <NotificationBell />}

          {/* Ajustes — solo admin */}
          {role === 'admin' && (
            <button
              onClick={() => router.push('/ajustes')}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-zinc-100 active:scale-95 transition-all text-zinc-500 hover:text-zinc-950 cursor-pointer"
              aria-label="Ir a Ajustes"
            >
              <Settings size={18} className="text-zinc-500" />
            </button>
          )}

          {/* Refresh button */}
          {role && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-zinc-100 active:scale-95 transition-all cursor-pointer"
              aria-label="Refrescar datos"
            >
              <RefreshCw size={17} className={`text-zinc-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          )}

          {/* Logout */}
          {role && (
            <button
              onClick={handleLogout}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-zinc-100 transition-colors"
              aria-label="Cerrar sesión"
            >
              <LogOut size={18} strokeWidth={2} className="text-zinc-500" />
            </button>
          )}
        </div>
      </header>
      {children}
    </>
  );
}

