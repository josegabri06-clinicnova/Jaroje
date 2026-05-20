"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { validatePinAsync, setRole, resetAllPinsToDefault, loadPinsFromSupabase } from '@/lib/auth';
import { Shield, Wrench, Sparkles, KeyRound, RotateCcw, AlertTriangle } from 'lucide-react';

type Mode = 'select' | 'admin' | 'staff_limpieza' | 'staff_mantenimiento' | 'recepcion';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('select');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logoTaps, setLogoTaps] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // Precargar PINs desde Supabase al iniciar
  useEffect(() => {
    loadPinsFromSupabase().catch(() => {});
  }, []);

  // Si ya hay sesión, redirigir
  useEffect(() => {
    const role = localStorage.getItem('jaroje_role');
    if (role === 'admin') router.replace('/');
    if (role === 'staff_limpieza' || role === 'staff_mantenimiento') router.replace('/staff');
    if (role === 'recepcion') router.replace('/recepcion');
  }, [router]);

  // Tap en el logo 5 veces → mostrar reset de emergencia
  const handleLogoTap = () => {
    const next = logoTaps + 1;
    setLogoTaps(next);
    if (next >= 5) {
      setLogoTaps(0);
      setShowResetConfirm(true);
    }
  };

  const handleEmergencyReset = async () => {
    await resetAllPinsToDefault();
    setShowResetConfirm(false);
    setResetDone(true);
    setMode('select');
    setPin('');
    setTimeout(() => setResetDone(false), 4000);
  };

  const handleDigit = async (d: string) => {
    if (pin.length >= 4 || loading) return;
    const next = pin + d;
    setPin(next);
    setError(false);

    if (next.length === 4) {
      setLoading(true);
      setTimeout(async () => {
        try {
          const valid = await validatePinAsync(next, mode as any);
          if (!valid) {
            setShake(true);
            setError(true);
            setTimeout(() => { setPin(''); setShake(false); setLoading(false); }, 600);
          } else {
            setRole(mode as any);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('jaroje_session_pin', next);
            }
            if (mode === 'admin') router.replace('/');
            else if (mode === 'recepcion') router.replace('/recepcion');
            else router.replace('/staff');
          }
        } catch {
          setShake(true);
          setError(true);
          setTimeout(() => { setPin(''); setShake(false); setLoading(false); }, 600);
        }
      }, 100);
    }
  };

  const handleDelete = () => {
    setPin(p => p.slice(0, -1));
    setError(false);
  };

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  const modeColor = {
    admin:               '#18181b',
    recepcion:           '#2563eb',
    staff_limpieza:      '#f59e0b',
    staff_mantenimiento: '#dc2626',
    select:              '#18181b',
  }[mode];

  return (
    <div className="fixed inset-0 bg-[#fafafa] flex flex-col items-center justify-center z-[100] select-none">

      {/* Reset de emergencia: confirmación */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
                <AlertTriangle size={24} className="text-amber-600" />
              </div>
              <div>
                <p className="font-bold text-zinc-900 text-base">Restablecer todos los PINs</p>
                <p className="text-zinc-500 text-sm mt-1 leading-relaxed">
                  Esto volverá todos los PINs a los valores por defecto:<br />
                  <strong>Admin: 1234 · Recepción: 0000</strong><br />
                  Limpieza: 5678 · Mtto: 8765
                </p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-3 rounded-xl border border-zinc-200 text-zinc-600 font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEmergencyReset}
                  className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-bold text-sm"
                >
                  Restablecer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banner reset exitoso */}
      {resetDone && (
        <div className="fixed top-6 left-4 right-4 z-[200] bg-emerald-500 text-white rounded-2xl px-4 py-3 text-center font-semibold text-sm shadow-lg">
          ✅ PINs restablecidos — Admin: 1234 · Recepción: 0000
        </div>
      )}

      {/* Logo — tap 5 veces para reset */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <button onClick={handleLogoTap} className="focus:outline-none active:scale-95 transition-transform">
          <img src="/logo-jaroje.png" alt="Jaroje OS" className="h-10 w-auto object-contain opacity-90" />
        </button>
        {logoTaps >= 2 && logoTaps < 5 && (
          <p className="text-[11px] text-zinc-400 font-medium animate-pulse">
            Toca {5 - logoTaps} veces más para restablecer PINs
          </p>
        )}
      </div>

      {/* Selector de rol */}
      {mode === 'select' && (
        <div className="flex flex-col items-center gap-4 w-full max-w-xs px-6">
          <p className="text-zinc-500 text-sm font-medium text-center">¿Cómo quieres acceder?</p>

          {[
            { id: 'admin',               label: 'Administrador',          sub: 'Acceso completo al sistema',          color: '#18181b', Icon: Shield   },
            { id: 'recepcion',            label: 'Recepción',              sub: 'Check-in, Check-out y pagos',         color: '#2563eb', Icon: KeyRound },
            { id: 'staff_limpieza',       label: 'Equipo de Limpieza',     sub: 'Gestión de limpieza y cuartos',       color: '#f59e0b', Icon: Sparkles },
            { id: 'staff_mantenimiento',  label: 'Equipo de Mantenimiento',sub: 'Reparaciones y desperfectos',         color: '#dc2626', Icon: Wrench   },
          ].map(({ id, label, sub, color, Icon }) => (
            <button
              key={id}
              onClick={() => setMode(id as Mode)}
              className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-zinc-300 transition-all active:scale-[0.98]"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color }}>
                <Icon size={20} className="text-white" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-zinc-900 text-sm">{label}</p>
                <p className="text-zinc-400 text-xs mt-0.5">{sub}</p>
              </div>
            </button>
          ))}

          {/* Enlace de emergencia */}
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 text-zinc-400 text-xs hover:text-zinc-600 transition-colors mt-2"
          >
            <RotateCcw size={12} />
            ¿Olvidaste tu PIN? Restablecer todos
          </button>
        </div>
      )}

      {/* Teclado PIN */}
      {mode !== 'select' && (
        <div className="flex flex-col items-center gap-8 w-full max-w-xs px-6">

          {/* Título */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: modeColor }}>
              {mode === 'admin' ? <Shield size={18} className="text-white" /> :
               mode === 'recepcion' ? <KeyRound size={18} className="text-white" /> :
               mode === 'staff_limpieza' ? <Sparkles size={18} className="text-white" /> :
               <Wrench size={18} className="text-white" />}
            </div>
            <p className="text-zinc-800 font-semibold text-base mt-1">
              {mode === 'admin' ? 'Administrador' : mode === 'recepcion' ? 'Recepción' : mode === 'staff_limpieza' ? 'Limpieza' : 'Mantenimiento'}
            </p>
            <p className="text-zinc-400 text-xs">
              {loading ? 'Verificando...' : 'Introduce tu PIN de acceso'}
            </p>
          </div>

          {/* Indicadores PIN */}
          <div
            className={`flex gap-4 transition-all`}
            style={shake ? { animation: 'wiggle 0.4s ease-in-out' } : {}}
          >
            {[0,1,2,3].map(i => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
                  i < pin.length
                    ? error
                      ? 'bg-red-500 border-red-500'
                      : 'border-transparent'
                    : 'border-zinc-300 bg-transparent'
                }`}
                style={i < pin.length && !error ? { background: modeColor, borderColor: modeColor } : {}}
              />
            ))}
          </div>

          {error && (
            <p className="text-red-500 text-xs font-medium -mt-4">PIN incorrecto</p>
          )}

          {/* Teclado numérico */}
          <div className="grid grid-cols-3 gap-3 w-full">
            {digits.map((d, i) => (
              <button
                key={i}
                onClick={() => {
                  if (d === '⌫') handleDelete();
                  else if (d !== '') handleDigit(d);
                }}
                disabled={loading}
                className={`h-[62px] rounded-2xl font-semibold text-xl transition-all active:scale-95 ${
                  d === ''
                    ? 'pointer-events-none'
                    : d === '⌫'
                    ? 'bg-transparent text-zinc-400 hover:text-zinc-700'
                    : 'bg-white border border-zinc-200 text-zinc-900 hover:bg-zinc-50 shadow-sm disabled:opacity-40'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <button
            onClick={() => { setMode('select'); setPin(''); setError(false); setLoading(false); }}
            className="text-zinc-400 text-sm hover:text-zinc-600 transition-colors"
          >
            ← Cambiar tipo de acceso
          </button>
        </div>
      )}

      <style jsx global>{`
        @keyframes wiggle {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}
