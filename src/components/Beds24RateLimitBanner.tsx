"use client";

import { useEffect, useState, useRef } from 'react';
import { AlertTriangle, RefreshCw, X, Clock } from 'lucide-react';

export function Beds24RateLimitBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const lastShownRef = useRef<number>(0);

  useEffect(() => {
    // Interceptar llamadas a fetch globalmente en el cliente para detectar 429 reales de mutación
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      try {
        const response = await originalFetch.apply(this, args);
        
        // Solo disparar si la llamada falló con 429 y es una mutación o petición explícita
        if (response.status === 429) {
          const urlStr = typeof args[0] === 'string' ? args[0] : (args[0] instanceof Request ? args[0].url : '');
          // Omitir peticiones de fondo como conversaciones o analytics
          if (!urlStr.includes('/api/conversations') && !urlStr.includes('/api/analytics')) {
            const now = Date.now();
            // Cooldown de 3 minutos para no saturar al usuario
            if (now - lastShownRef.current > 180000) {
              lastShownRef.current = now;
              window.dispatchEvent(new CustomEvent('beds24_rate_limited'));
            }
          }
        }
        return response;
      } catch (err) {
        throw err;
      }
    };

    const handleRateLimitEvent = () => {
      setIsVisible(true);
      setCountdown(15);
    };

    window.addEventListener('beds24_rate_limited', handleRateLimitEvent);

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener('beds24_rate_limited', handleRateLimitEvent);
    };
  }, []);

  // Manejar el conteo regresivo
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isVisible && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isVisible, countdown]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-amber-150 text-center relative overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Barra superior decorativa */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 animate-pulse" />

        <button 
          onClick={() => setIsVisible(false)}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-700 bg-zinc-100 hover:bg-zinc-200 p-1.5 rounded-full transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        {/* Icono de advertencia */}
        <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-amber-200 shadow-xs">
          <AlertTriangle size={28} />
        </div>

        <h3 className="text-[18px] font-extrabold text-zinc-900 tracking-tight mb-1.5">
          Sincronización Beds24 en Espera
        </h3>

        <p className="text-[12.5px] font-medium text-zinc-600 leading-relaxed mb-4">
          Beds24 ha pausado temporalmente las solicitudes por exceso de consultas por minuto. La app continúa funcionando con los datos respaldados en Supabase.
        </p>

        {/* Caja destacada con la instrucción */}
        <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-3.5 mb-5 text-left space-y-1.5">
          <div className="flex items-center gap-1.5 text-amber-900 font-bold text-[12px]">
            <Clock size={14} className="text-amber-600 shrink-0" />
            <span>¿Qué debo hacer?</span>
          </div>
          <p className="text-[12px] font-medium text-amber-800 leading-relaxed">
            Puedes cerrar este aviso y continuar usando la app normalmente, o esperar <span className="font-bold text-amber-950">{countdown}s</span> antes de forzar otra recarga manual.
          </p>
        </div>

        {/* Botones de acción */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsVisible(false);
              window.location.reload();
            }}
            className="flex-1 bg-zinc-900 hover:bg-black text-white font-bold py-2.5 px-4 rounded-xl text-[12.5px] transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={14} />
            {countdown > 0 ? `Recargar (${countdown}s)` : 'Recargar Ahora'}
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-[12.5px] transition-all active:scale-95 cursor-pointer"
          >
            Continuar en la App
          </button>
        </div>

      </div>
    </div>
  );
}
