"use client";

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { logout } from '@/lib/auth';
import { LogOut, Shield, Wrench, Sparkles, KeyRound, Hammer } from 'lucide-react';
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

  useEffect(() => {
    const stored = localStorage.getItem('jaroje_role') as Role;
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
      if (stored === 'admin') router.replace('/');
      else if (stored === 'recepcion') router.replace('/recepcion');
      else router.replace('/staff');
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
        router.replace('/recepcion');
      } else {
        router.replace('/staff');
      }
      return;
    }

    setChecked(true);
  }, [pathname, router]);

  const handleLogout = () => {
    logout();
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

          {/* Campana — solo admin */}
          {role === 'admin' && <NotificationBell />}

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

