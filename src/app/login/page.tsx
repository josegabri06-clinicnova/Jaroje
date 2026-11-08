"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkPinAsync, setRole } from '@/lib/auth';
import { safeFilesNext } from '@/lib/safe-next';
import { Shield, Wrench, Sparkles, KeyRound, Fingerprint } from 'lucide-react';
// @ts-ignore
import { startAuthentication } from '@simplewebauthn/browser';

type Mode = 'select' | 'admin' | 'staff_limpieza' | 'staff_mantenimiento' | 'recepcion';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('select');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [locked, setLocked] = useState(false);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  // Estados de recuperación para Admin
  const [showRecoveryInput, setShowRecoveryInput] = useState(false);
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [recoveryError, setRecoveryError] = useState('');

  const handleBiometricLogin = async () => {
    setLoading(true);
    setError(false);
    try {
      const resOptions = await fetch('/api/auth/webauthn/login/options');
      const options = await resOptions.json();
      if (!resOptions.ok) {
        throw new Error(options.error || 'Error al obtener opciones de inicio de sesión');
      }

      const assertion = await startAuthentication(options);

      const resVerify = await fetch('/api/auth/webauthn/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authenticationResponse: assertion })
      });
      const verifyResult = await resVerify.json();
      if (!resVerify.ok) {
        throw new Error(verifyResult.error || 'Verificación fallida');
      }

      setRole('admin');
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('jaroje_session_pin');
      }
      router.replace('/');
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al ingresar con biometría: ${err.message}`);
      setLoading(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryKeyInput.trim()) {
      setRecoveryError('Por favor ingresa la llave de recuperación.');
      return;
    }
    setLoading(true);
    setRecoveryError('');
    try {
      const res = await fetch('/api/auth/verify-recovery-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryKey: recoveryKeyInput.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Llave incorrecta');
      }

      setRole('admin');
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('jaroje_session_pin');
      }
      router.replace('/ajustes?section=seguridad');
    } catch (err: any) {
      console.error(err);
      setRecoveryError(err.message || 'La llave de recuperación es inválida.');
      setLoading(false);
    }
  };

  // Disparar biometría automáticamente cuando se selecciona Administrador
  useEffect(() => {
    if (mode === 'admin' && !showRecoveryInput && !loading) {
      handleBiometricLogin();
    }
  }, [mode, showRecoveryInput]);

  // La redirección "si ya hay sesión" la decide AuthGuard con la cookie del servidor (no con localStorage, que puede ser antigua)

  // El reset de emergencia de PINs (5 toques en el logo) se eliminó: escribía en `settings` desde el navegador
  // sin autenticación. La recuperación del administrador se hace con la llave de recuperación.

  const handleDigit = async (d: string) => {
    if (pin.length >= 4 || loading) return;
    const next = pin + d;
    setPin(next);
    setError(false);
    setLocked(false);

    if (next.length === 4) {
      setLoading(true);
      setTimeout(async () => {
        try {
          const check = await checkPinAsync(next, mode as any);
          if (check !== 'ok') {
            setShake(true);
            setError(true);
            setLocked(check === 'locked');
            setTimeout(() => { setPin(''); setShake(false); setLoading(false); }, 600);
          } else {
            setRole(mode as any);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('jaroje_session_pin', next);
            }
            // Si se llegó desde un enlace a un archivo (DNI, comprobante), se vuelve a él; solo para administrador y recepción
            const fileNext = (mode === 'admin' || mode === 'recepcion') && typeof window !== 'undefined'
              ? safeFilesNext(new URLSearchParams(window.location.search).get('next'))
              : null;
            if (fileNext) { window.location.assign(fileNext); return; }
            if (mode === 'admin') router.replace('/calendario');
            else if (mode === 'recepcion') router.replace('/calendario');
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

      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <img src="/logo-jaroje.png" alt="Jaroje OS" className="h-10 w-auto object-contain opacity-90" />
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
              {mode === 'admin' 
                ? showRecoveryInput 
                  ? 'Ingresa tu Llave de Recuperación' 
                  : loading 
                    ? 'Autenticando biometría...' 
                    : 'Acceso biométrico requerido'
                : loading 
                  ? 'Verificando PIN...' 
                  : 'Introduce tu PIN de acceso'}
            </p>
          </div>

          {mode === 'admin' ? (
            // UI Exclusiva del Admin
            <div className="w-full flex flex-col gap-6">
              {!showRecoveryInput ? (
                <>
                  <div className="bg-white border border-zinc-200 rounded-3xl p-5 shadow-sm text-center flex flex-col items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-zinc-50 border border-zinc-150 flex items-center justify-center text-zinc-800">
                      <Fingerprint size={32} strokeWidth={1.5} className="text-zinc-700 animate-pulse" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-500 leading-relaxed">
                        Usa la biometría (Face ID / Touch ID) para iniciar sesión en tu dispositivo.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleBiometricLogin}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2.5 p-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl font-bold text-sm transition-all active:scale-[0.98] shadow-md cursor-pointer disabled:opacity-40"
                  >
                    <Fingerprint size={18} strokeWidth={2.5} />
                    <span>Iniciar Autenticación</span>
                  </button>

                  <button
                    onClick={() => { setShowRecoveryInput(true); setRecoveryError(''); }}
                    disabled={loading}
                    className="text-zinc-500 hover:text-zinc-800 text-xs font-bold text-center underline cursor-pointer"
                  >
                    ¿Dispositivo nuevo? Registrar con Llave Maestra
                  </button>
                </>
              ) : (
                <form onSubmit={handleRecoverySubmit} className="space-y-4">
                  <div className="bg-white border border-zinc-200 rounded-3xl p-4.5 shadow-sm space-y-3">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">
                      Llave de Recuperación Maestra
                    </label>
                    <input
                      type="text"
                      value={recoveryKeyInput}
                      onChange={(e) => {
                        setRecoveryKeyInput(e.target.value.toUpperCase());
                        setRecoveryError('');
                      }}
                      placeholder="JRJ-SEC-XXXX-XXXX-XXXX"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-3 text-xs font-mono font-bold text-center text-zinc-850 focus:outline-none focus:ring-2 focus:ring-zinc-950 placeholder:text-zinc-350"
                      disabled={loading}
                      autoFocus
                    />
                    {recoveryError && (
                      <p className="text-red-500 text-[11px] font-semibold text-center mt-1">
                        ❌ {recoveryError}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => { setShowRecoveryInput(false); setRecoveryError(''); }}
                      disabled={loading}
                      className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-xs active:scale-[0.98] transition-all cursor-pointer border border-zinc-250/60"
                    >
                      Volver
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl text-xs active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                    >
                      {loading ? 'Verificando...' : 'Verificar Key'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            // UI de los Roles Operativos (PIN Clásico)
            <>
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
                <p className="text-red-500 text-xs font-medium -mt-4 text-center">
                  {locked ? 'Demasiados intentos. Acceso bloqueado 15 minutos.' : 'PIN incorrecto'}
                </p>
              )}

              {/* Teclado numérico */}
              <div className="grid grid-cols-3 gap-3 w-full animate-in fade-in duration-200">
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
            </>
          )}

          <button
            onClick={() => { setMode('select'); setPin(''); setError(false); setLoading(false); setShowRecoveryInput(false); }}
            className="text-zinc-400 text-sm hover:text-zinc-650 transition-colors"
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
