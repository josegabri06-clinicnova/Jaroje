"use client";

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { logout } from '@/lib/auth';
import { LogOut, Shield, Wrench, Sparkles } from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';

type Role = 'admin' | 'staff' | null;

const ADMIN_ROUTES = ['/', '/reservas', '/calendario', '/analytics', '/bot', '/historial', '/precios', '/ajustes', '/nueva'];
const STAFF_ROUTES = ['/staff', '/calendario'];
const STAFF_ONLY_ROUTES = ['/staff'];
const PUBLIC_ROUTES = ['/login'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [role, setRole]       = useState<Role>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('jaroje_role') as Role;
    setRole(stored);

    const isPublicRoute = PUBLIC_ROUTES.includes(pathname || '');

    if (!stored && !isPublicRoute) {
      router.replace('/login');
      return;
    }

    if (stored === 'staff' && !STAFF_ROUTES.some(r => (pathname || '').startsWith(r)) && !isPublicRoute) {
      router.replace('/staff');
      return;
    }

    if (stored === 'admin' && STAFF_ONLY_ROUTES.some(r => (pathname || '').startsWith(r))) {
      router.replace('/');
      return;
    }

    setChecked(true);
  }, [pathname, router]);

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  if (!checked) return <div className="fixed inset-0 bg-[#fafafa]" />;

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
          {role === 'staff' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-600 border border-blue-700">
              <Wrench size={10} className="text-white" />
              <span className="text-[10px] font-bold text-white tracking-wide uppercase">Staff</span>
            </div>
          )}

          {/* Copilot */}
          {role && (
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
