'use client';

import React from 'react';
import { ArrowLeft, ShieldCheck, MessageCircle } from 'lucide-react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';

export function WhatsAppInAppHeader() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const lang = searchParams.get('lang') === 'en' ? 'en' : 'es';
  const bookingId = searchParams.get('bookingId') || searchParams.get('id') || '';

  const isSubPage = pathname?.includes('/pago-transferencia');

  const returnToWhatsApp = () => {
    // Redirige de vuelta al hilo de chat de WhatsApp del hotel
    window.location.href = 'https://wa.me/529581168698';
  };

  const returnToPortal = () => {
    if (bookingId) {
      router.push(`/public/reserva/${bookingId}${lang === 'en' ? '?lang=en' : ''}`);
    } else {
      router.back();
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-[#075E54] text-white shadow-md border-b border-[#054c44] select-none pt-[env(safe-area-inset-top)]">
      <div className="max-w-xl mx-auto px-3.5 py-2.5 flex items-center justify-between">
        {/* Botón de Retorno Inteligente */}
        {isSubPage ? (
          <button
            onClick={returnToPortal}
            type="button"
            className="flex items-center gap-1.5 bg-[#128C7E] hover:bg-[#0e7468] active:scale-95 text-white px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer border border-white/15"
            aria-label={lang === 'en' ? 'Back to Guest Portal' : 'Volver al Portal del Huésped'}
          >
            <ArrowLeft size={14} className="stroke-[2.5]" />
            <span className="tracking-tight">
              {lang === 'en' ? 'Back to Portal' : 'Volver al Portal'}
            </span>
          </button>
        ) : (
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
        )}

        {/* Acciones derechas */}
        <div className="flex items-center gap-2">
          {isSubPage && (
            <button
              onClick={returnToWhatsApp}
              type="button"
              className="flex items-center gap-1 text-[11px] font-bold text-white/90 bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-full transition-all cursor-pointer"
              title={lang === 'en' ? 'Contact on WhatsApp' : 'Contactar por WhatsApp'}
            >
              <MessageCircle size={12} />
              <span>WhatsApp</span>
            </button>
          )}
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/90">
            <ShieldCheck size={14} className="text-emerald-300 stroke-[2.5]" />
            <span className="tracking-tight hidden xs:inline">
              {lang === 'en' ? 'Official Portal' : 'Portal Oficial'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
