'use client';

import React from 'react';
import { ArrowLeft, ShieldCheck, MessageCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export function WhatsAppInAppHeader() {
  const searchParams = useSearchParams();
  const lang = searchParams.get('lang') === 'en' ? 'en' : 'es';

  const returnToWhatsApp = () => {
    // Redirige de vuelta al hilo de chat de WhatsApp del hotel
    window.location.href = 'https://wa.me/529581168698';
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-[#075E54] text-white shadow-md border-b border-[#054c44] select-none pt-[env(safe-area-inset-top)]">
      <div className="max-w-xl mx-auto px-3.5 py-2.5 flex items-center justify-between">
        {/* Botón de Retorno In-App a WhatsApp */}
        <button
          onClick={returnToWhatsApp}
          type="button"
          className="flex items-center gap-2 bg-[#128C7E] hover:bg-[#0e7468] active:scale-95 text-white px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer border border-white/15"
          aria-label={lang === 'en' ? 'Return to WhatsApp chat' : 'Volver al chat de WhatsApp'}
        >
          <ArrowLeft size={14} className="stroke-[2.5]" />
          <MessageCircle size={15} className="fill-white/20 stroke-[2]" />
          <span className="tracking-tight">
            {lang === 'en' ? 'Back to WhatsApp' : 'Volver a WhatsApp'}
          </span>
        </button>

        {/* Indicador de Seguridad y Modo In-App */}
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/90">
          <ShieldCheck size={14} className="text-emerald-300 stroke-[2.5]" />
          <span className="tracking-tight">
            {lang === 'en' ? 'Official In-App Portal' : 'Portal Oficial In-App'}
          </span>
        </div>
      </div>
    </header>
  );
}
