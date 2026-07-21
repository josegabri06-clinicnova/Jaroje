"use client";

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, X, Clock } from 'lucide-react';

export function Beds24RateLimitBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    // Interceptar llamadas a fetch globalmente en el cliente para detectar 429 o errores de Beds24
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      try {
        const response = await originalFetch.apply(this, args);
        if (response.status === 429) {
          window.dispatchEvent(new CustomEvent('beds24_rate_limited'));
        } else if (!response.ok) {
          // Clonar respuesta para no consumir la secuencia de datos
          const clone = response.clone();
          try {
            const text = await clone.text();
            if (
              text.includes('Credit limit exceeded') || 
              text.includes('límite de solicitudes') || 
              text.includes('rate limit') ||
              text.includes('Beds24 superó el límite') ||
              text.includes('Beds24 está temporalmente en su límite')
            ) {
              window.dispatchEvent(new CustomEvent('beds24_rate_limited'));
            }
          } catch (e) {}
        }
        return response;
      } catch (err) {
        throw err;
      }
    };

    const handleRateLimitEvent = () => {
      setIsVisible(true);
      setCountdown(30);
    };

    window.addEventListener('beds24_rate_limited', handleRateLimitEvent);

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener('beds24_rate_limited', handleRateLimitEvent);
    };
  }, []);

  // Manejar el conteo regresivo de 30 segundos
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
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-100 text-center relative overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Barra superior decorativa de peligro */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 animate-pulse" />

        <button 
          onClick={() => setIsVisible(false)}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-700 bg-zinc-100 p-1.5 rounded-full transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        {/* Icono de advertencia */}
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-amber-50 shadow-inner">
          <AlertTriangle size={32} className="animate-bounce" />
        </div>

        <h3 className="text-[19px] font-extrabold text-zinc-900 tracking-tight mb-2">
          Servidor Beds24 Bloqueado Temporalmente
        </h3>

        <p className="text-[13px] font-medium text-zinc-600 leading-relaxed mb-4">
          Beds24 ha pausado el procesamiento de reservas debido a un alto volumen de solicitudes por minuto.
        </p>

        {/* Caja destacada con la instrucción exacta */}
        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 mb-5 text-left space-y-2">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-[13px]">
            <Clock size={16} className="text-amber-600 shrink-0" />
            <span>¿Qué debo hacer?</span>
          </div>
          <p className="text-[12.5px] font-semibold text-amber-800 leading-relaxed">
            Por favor, <span className="underline decoration-amber-400 font-extrabold text-amber-950">espera {countdown} segundos</span>, cierra la aplicación por completo y vuelve a abrirla para que las reservas se vuelvan a sincronizar.
          </p>
        </div>

        {/* Botones de acción */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.location.reload()}
            className="flex-1 bg-zinc-900 hover:bg-black text-white font-bold py-3 px-4 rounded-xl text-[13px] transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw size={15} />
            Recargar App ({countdown}s)
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="px-4 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-[13px] transition-all active:scale-95 cursor-pointer"
          >
            Entendido
          </button>
        </div>

      </div>
    </div>
  );
}
