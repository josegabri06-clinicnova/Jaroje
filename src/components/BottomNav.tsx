"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Home, Calendar as CalendarIcon, Plus, List as ListIcon, Settings, Edit3, Lock, Wallet, Users, Wrench, MessageCircle, PhoneCall } from 'lucide-react';
import { usePathname } from 'next/navigation';

export function BottomNav() {
  const [menuOpen, setMenuOpen]   = useState(false);
  const [role, setRole]           = useState<string | null>('loading');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [unreadCalls, setUnreadCalls] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    setRole(localStorage.getItem('jaroje_role'));
  }, [pathname]);

  // Consultar llamadas no atendidas para la insignia
  useEffect(() => {
    let mounted = true;
    const fetchUnread = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { count } = await supabase
          .from('conmutador_calls')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'nueva');
        if (mounted) setUnreadCalls(count || 0);
      } catch (e) {
        // silent
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 20000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Hide nav when virtual keyboard appears OR when any panel/sheet is open
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        setKeyboardOpen(true);
      }
    };
    const onFocusOut = () => setKeyboardOpen(false);

    // Also watch for panel-open class on body
    const observer = new MutationObserver(() => {
      setKeyboardOpen(document.body.classList.contains('panel-open'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      observer.disconnect();
    };
  }, []);

  if (role === 'loading' || pathname === '/login' || keyboardOpen || pathname?.startsWith('/public')) return null;


  if (role === 'staff_limpieza' || role === 'staff_mantenimiento' || role === 'recepcion') {
    const homePath = role === 'recepcion' ? '/recepcion' : '/staff';

    // Staff limpieza/mantenimiento: panel + calendar only
    if (role !== 'recepcion') {
      return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-zinc-200/80 pb-safe">
          <div className="flex justify-center items-center gap-16 px-6 py-2 pb-3 max-w-md mx-auto">
            <Link href={homePath} className="flex flex-col items-center gap-1 p-1">
              <div className={`p-1.5 rounded-xl transition-all ${pathname === homePath ? 'bg-blue-50 text-blue-600' : 'text-zinc-400 hover:text-zinc-600'}`}>
                <Home size={22} strokeWidth={pathname === homePath ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] font-bold ${pathname === homePath ? 'text-blue-600' : 'text-zinc-400'}`}>Panel</span>
            </Link>
            <Link href="/calendario" className="flex flex-col items-center gap-1 p-1">
              <div className={`p-1.5 rounded-xl transition-all ${pathname === '/calendario' ? 'bg-blue-50 text-blue-600' : 'text-zinc-400 hover:text-zinc-600'}`}>
                <CalendarIcon size={22} strokeWidth={pathname === '/calendario' ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] font-bold ${pathname === '/calendario' ? 'text-blue-600' : 'text-zinc-400'}`}>Calendario</span>
            </Link>
          </div>
        </nav>
      );
    }

    // Recepción: panel + calendar + reservas + llamadas
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-zinc-200/80 pb-safe">
        <div className="flex justify-around items-center px-2 py-2 pb-3 max-w-md mx-auto">
          {[
            { href: '/recepcion', icon: <Home size={20} />, label: 'Panel' },
            { href: '/calendario', icon: <CalendarIcon size={20} />, label: 'Calendario' },
            { href: '/reservas',  icon: <ListIcon size={20} />, label: 'Reservas' },
            { href: '/llamadas',  icon: <PhoneCall size={20} />, label: 'Llamadas', badge: unreadCalls },
          ].map(item => (
            <Link key={item.href} href={item.href} className="relative flex flex-col items-center gap-1 p-1">
              <div className={`relative p-1.5 rounded-xl transition-all ${pathname === item.href ? 'bg-blue-50 text-blue-600' : 'text-zinc-400 hover:text-zinc-600'}`}>
                {item.icon}
                {Boolean(item.badge && item.badge > 0) && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse shadow-xs">
                    {(item.badge ?? 0) > 9 ? '9+' : item.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-bold ${pathname === item.href ? 'text-blue-600' : 'text-zinc-400'}`}>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    );
  }


  const getIconClass = (path: string) => {
    return pathname === path 
      ? "text-zinc-900" 
      : "text-zinc-400 hover:text-zinc-600 transition-colors";
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-zinc-200/80 pb-safe">
      <div className="flex justify-around items-center px-2 py-2 pb-3 max-w-md mx-auto">
        {[
          { href: '/panel', icon: <Home size={20} />, label: 'Panel' },
          { href: '/calendario', icon: <CalendarIcon size={20} />, label: 'Calendario' },
          { href: '/reservas',  icon: <ListIcon size={20} />, label: 'Reservas' },
          { href: '/llamadas',  icon: <PhoneCall size={20} />, label: 'Llamadas', badge: unreadCalls },
        ].map(item => (
          <Link key={item.href} href={item.href} className="relative flex flex-col items-center gap-1 p-1">
            <div className={`relative p-1.5 rounded-xl transition-all ${pathname === item.href ? 'bg-zinc-100 text-zinc-950 font-extrabold' : 'text-zinc-400 hover:text-zinc-600'}`}>
              {item.icon}
              {Boolean(item.badge && item.badge > 0) && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse shadow-xs">
                  {(item.badge ?? 0) > 9 ? '9+' : item.badge}
                </span>
              )}
            </div>
            <span className={`text-[10px] font-bold ${pathname === item.href ? 'text-zinc-900 font-extrabold' : 'text-zinc-400'}`}>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
