"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Home, Calendar as CalendarIcon, Plus, List as ListIcon, Settings, Edit3, Lock, Wallet, Users, Wrench } from 'lucide-react';
import { usePathname } from 'next/navigation';

export function BottomNav() {
  const [menuOpen, setMenuOpen]   = useState(false);
  const [role, setRole]           = useState<string | null>('loading');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setRole(localStorage.getItem('jaroje_role'));
  }, [pathname]);

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

  if (role === 'loading' || pathname === '/login' || keyboardOpen) return null;


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

    // Recepción: panel + calendar + reservas + precios
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-zinc-200/80 pb-safe">
        <div className="flex justify-around items-center px-2 py-2 pb-3 max-w-md mx-auto">
          {[
            { href: '/recepcion', icon: <Home size={22} />, label: 'Panel' },
            { href: '/calendario', icon: <CalendarIcon size={22} />, label: 'Calendario' },
            { href: '/reservas',  icon: <ListIcon size={22} />, label: 'Reservas' },
            { href: '/precios',   icon: <Wallet size={22} />,   label: 'Tarifas' },
          ].map(item => (
            <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1 p-1">
              <div className={`p-1.5 rounded-xl transition-all ${pathname === item.href ? 'bg-blue-50 text-blue-600' : 'text-zinc-400 hover:text-zinc-600'}`}>
                {item.icon}
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
    <>
      {/* Overlay Backdrop */}
      {menuOpen && (
        <div 
          className="fixed inset-0 bg-zinc-900/20 z-40 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Action Popover */}
      <div 
        className={`fixed bottom-[95px] left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 transition-all duration-300 origin-bottom ${
          menuOpen ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 pointer-events-none translate-y-4'
        }`}
      >
        <div className="bg-white/80 backdrop-blur-xl border border-zinc-200/80 p-1.5 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-56 flex flex-col gap-1">
          <Link href="/nueva?mode=reserva" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-100/80 transition-colors group">
            <div className="bg-zinc-100 rounded-lg p-1.5 text-zinc-600 group-hover:text-zinc-900 group-hover:bg-white shadow-sm transition-all"><Edit3 size={16} strokeWidth={2.5}/></div>
            <span className="font-semibold text-zinc-800 text-[13px]">Registrar Reserva</span>
          </Link>
          <div className="h-px w-full bg-zinc-100"></div>
          <Link href="/nueva?mode=bloqueo" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-rose-50/80 transition-colors group">
            <div className="bg-rose-100/50 rounded-lg p-1.5 text-rose-600 group-hover:text-rose-700 group-hover:bg-rose-100 shadow-sm transition-all"><Lock size={16} strokeWidth={2.5}/></div>
            <span className="font-semibold text-rose-600 text-[13px]">Aplicar Bloqueo</span>
          </Link>
          <div className="h-px w-full bg-zinc-100"></div>
          <Link href="/finanzas" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-emerald-50/80 transition-colors group">
            <div className="bg-emerald-100/50 rounded-lg p-1.5 text-emerald-600 group-hover:text-emerald-700 group-hover:bg-emerald-100 shadow-sm transition-all"><Wallet size={16} strokeWidth={2.5}/></div>
            <span className="font-semibold text-emerald-700 text-[13px]">Finanzas</span>
          </Link>
          <div className="h-px w-full bg-zinc-100"></div>
          <Link href="/equipo" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50/80 transition-colors group">
            <div className="bg-blue-100/50 rounded-lg p-1.5 text-blue-600 group-hover:text-blue-700 group-hover:bg-blue-100 shadow-sm transition-all"><Users size={16} strokeWidth={2.5}/></div>
            <span className="font-semibold text-blue-700 text-[13px]">Pagar Nómina</span>
          </Link>
          <div className="h-px w-full bg-zinc-100"></div>
          <Link href="/mantenimiento" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-amber-50/80 transition-colors group">
            <div className="bg-amber-100/50 rounded-lg p-1.5 text-amber-600 group-hover:text-amber-700 group-hover:bg-amber-100 shadow-sm transition-all"><Wrench size={16} strokeWidth={2.5}/></div>
            <span className="font-semibold text-amber-700 text-[13px]">Mantenimiento</span>
          </Link>
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-zinc-200/80 pb-safe">
        <div className="flex justify-between items-end px-6 py-2 pb-3 max-w-md mx-auto relative">
          
          <Link href="/" onClick={() => setMenuOpen(false)} className="flex flex-col items-center gap-1 p-1">
            <div className={`p-1.5 rounded-xl transition-all ${pathname === '/' ? 'bg-zinc-100/80' : ''}`}>
              <Home size={22} strokeWidth={pathname === '/' ? 2.5 : 2} className={getIconClass('/')} />
            </div>
          </Link>
          
          <Link href="/calendario" onClick={() => setMenuOpen(false)} className="flex flex-col items-center gap-1 p-1">
             <div className={`p-1.5 rounded-xl transition-all ${pathname === '/calendario' ? 'bg-zinc-100/80' : ''}`}>
              <CalendarIcon size={22} strokeWidth={pathname === '/calendario' ? 2.5 : 2} className={getIconClass('/calendario')} />
            </div>
          </Link>
          
          {/* FAB */}
          <button 
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex flex-col items-center justify-center transform -translate-y-5 px-3 relative z-50"
          >
            <div className={`transition-all duration-300 w-[52px] h-[52px] rounded-full shadow-[0_4px_14px_0_rgba(0,0,0,0.2)] flex items-center justify-center border-[3px] border-white/90 ${
              menuOpen ? 'bg-zinc-800 rotate-45 scale-95' : 'bg-zinc-900 active:scale-95'
            }`}>
              <Plus size={24} strokeWidth={3} className="text-white relative z-10" />
            </div>
          </button>

          <Link href="/reservas" onClick={() => setMenuOpen(false)} className="flex flex-col items-center gap-1 p-1">
             <div className={`p-1.5 rounded-xl transition-all ${pathname === '/reservas' ? 'bg-zinc-100/80' : ''}`}>
              <ListIcon size={22} strokeWidth={pathname === '/reservas' ? 2.5 : 2} className={getIconClass('/reservas')} />
            </div>
          </Link>

          <Link href="/ajustes" onClick={() => setMenuOpen(false)} className="flex flex-col items-center gap-1 p-1">
            <div className={`p-1.5 rounded-xl transition-all ${pathname === '/ajustes' ? 'bg-zinc-100/80' : ''}`}>
              <Settings size={22} strokeWidth={pathname === '/ajustes' ? 2.5 : 2} className={getIconClass('/ajustes')} />
            </div>
          </Link>
        </div>
      </nav>
    </>
  );
}
