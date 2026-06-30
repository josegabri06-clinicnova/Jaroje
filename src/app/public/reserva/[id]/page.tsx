'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  Calendar, 
  User, 
  MapPin, 
  Copy, 
  Check, 
  CreditCard, 
  FileText, 
  Clock, 
  HelpCircle,
  Users,
  Compass,
  AlertTriangle
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export default function PublicReservaPage() {
  const params = useParams();
  const id = params?.id;

  const [booking, setBooking] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [copiedClabe, setCopiedClabe] = useState(false);
  const [copiedConcept, setCopiedConcept] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchBooking = async () => {
      try {
        const res = await fetch(`/api/public/reserva?id=${id}`);
        const json = await res.json();
        if (res.ok && json.success) {
          setBooking(json.data);
        } else {
          setError(json.error || 'No se pudo cargar la información de la reservación.');
        }
      } catch (e) {
        setError('Error de conexión al cargar la reservación.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchBooking();
  }, [id]);

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDateStr = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      return format(parseISO(dateStr), "dd 'de' MMMM, yyyy", { locale: es });
    } catch (e) {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mb-4" />
        <p className="text-zinc-650 font-medium text-sm">Cargando los detalles de tu reservación...</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4 border border-rose-100">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-zinc-900 font-extrabold text-lg mb-2">¡Ups! Algo salió mal</h2>
        <p className="text-zinc-600 text-sm mb-6">{error || 'La reservación solicitada no existe o ha sido cancelada.'}</p>
        <a 
          href="https://wa.me/529581168698" 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-indigo-650 text-white font-bold text-sm py-3 px-6 rounded-xl shadow-md hover:bg-indigo-700 transition-all cursor-pointer"
        >
          Contactar por WhatsApp
        </a>
      </div>
    );
  }

  const anticipoRequerido = Math.round(booking.price * 0.5);
  const esConfirmada = booking.deposit > 0 || booking.is_acknowledged;

  return (
    <div className="min-h-screen bg-[#F6F5F2] text-zinc-900 pb-16 font-sans">
      {/* Header Premium */}
      <header className="bg-zinc-900 text-white text-center py-8 px-4 shadow-md relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent)] pointer-events-none" />
        <h1 className="text-xl md:text-2xl font-black uppercase tracking-wider text-amber-100">CONDOMINIOS JAROJE</h1>
        <p className="text-zinc-400 text-xs mt-1 font-medium tracking-wide uppercase">Tu paraíso en Huatulco, Oaxaca 🌴</p>
      </header>

      <main className="max-w-md mx-auto px-4 mt-6 space-y-5">
        
        {/* Tarjeta de Bienvenida */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -mr-8 -mt-8" />
          <h2 className="text-lg font-black text-zinc-900 leading-tight">
            {esConfirmada ? '🎉 ¡Tu reservación está confirmada!' : '👋 ¡Hola, ' + booking.guest_name.split(' ')[0] + '!'}
          </h2>
          <p className="text-zinc-650 text-[13.5px] mt-2 leading-relaxed">
            {esConfirmada 
              ? 'Hemos recibido tu anticipo y todo está listo para recibirte en las hermosas playas de Huatulco.' 
              : 'Hemos preparado tu solicitud de reservación directa. Para bloquear tus fechas, únicamente falta confirmar tu anticipo requerido.'}
          </p>
        </div>

        {/* Resumen de Reservación */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <FileText size={18} className="text-indigo-600" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">Resumen de tu Estancia</h3>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">Huésped</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{booking.guest_name}</strong>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">ID de Reserva</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{booking.id}</strong>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100 col-span-2">
              <span className="text-zinc-500 font-semibold block">Alojamiento</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{booking.room_name}</strong>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">Fecha de Llegada</span>
              <span className="text-zinc-900 font-bold text-[11.5px] block mt-0.5">{formatDateStr(booking.check_in)}</span>
              <span className="text-zinc-500 text-[10px] mt-0.5 block">(Check-in: 3:00 PM)</span>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">Fecha de Salida</span>
              <span className="text-zinc-900 font-bold text-[11.5px] block mt-0.5">{formatDateStr(booking.check_out)}</span>
              <span className="text-zinc-500 text-[10px] mt-0.5 block">(Check-out: 12:00 PM)</span>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">Estancia</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{booking.nights} noche{booking.nights !== 1 ? 's' : ''}</strong>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">Huéspedes</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{booking.num_adult + booking.num_child} persona{booking.num_adult + booking.num_child !== 1 ? 's' : ''}</strong>
            </div>
          </div>
        </div>

        {/* Desglose Financiero */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-3.5">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <Clock size={18} className="text-indigo-600" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">Estado de Cuenta</h3>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center text-zinc-600">
              <span>Total de la estancia:</span>
              <strong className="text-zinc-900 font-extrabold">${booking.price.toLocaleString('es-MX')} MXN</strong>
            </div>
            {esConfirmada ? (
              <>
                <div className="flex justify-between items-center text-emerald-600 font-semibold bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100">
                  <span className="flex items-center gap-1">Anticipo Recibido:</span>
                  <strong className="font-black">${booking.deposit.toLocaleString('es-MX')} MXN</strong>
                </div>
                <div className="flex justify-between items-center text-zinc-800 pt-2 border-t border-dashed border-zinc-200">
                  <span className="font-bold">Saldo restante (adeudo):</span>
                  <strong className="text-indigo-650 font-black text-base">${booking.balance.toLocaleString('es-MX')} MXN</strong>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center text-indigo-600 font-semibold bg-indigo-50/50 px-3 py-2 rounded-xl border border-indigo-100/80">
                  <span>Anticipo Requerido (50%):</span>
                  <strong className="font-black">${anticipoRequerido.toLocaleString('es-MX')} MXN</strong>
                </div>
                <div className="flex justify-between items-center text-zinc-500">
                  <span>Anticipo depositado:</span>
                  <strong className="font-bold">$0 MXN</strong>
                </div>
                <div className="flex justify-between items-center text-zinc-800 pt-2 border-t border-dashed border-zinc-200">
                  <span className="font-bold">Saldo restante (adeudo):</span>
                  <strong className="text-indigo-650 font-black text-base">${booking.price.toLocaleString('es-MX')} MXN</strong>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Formas de Pago */}
        {booking.balance > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
              <CreditCard size={18} className="text-indigo-600" />
              <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">
                {esConfirmada ? 'Liquidar Saldo Pendiente' : 'Formas de Pago'}
              </h3>
            </div>

            {/* Método 1: Tarjeta */}
            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase text-indigo-600 tracking-wider block">Opción 1: Tarjeta de Crédito / Débito (Pasarela)</span>
              <a 
                href="https://link.mercadopago.com.mx/jaroje" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full bg-[#00A650] hover:bg-[#008f43] text-white font-bold text-sm py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <CreditCard size={18} />
                Pagar con Mercado Pago
              </a>
              <p className="text-[10px] text-zinc-500 italic text-center mt-1">Si realizas tu pago con tarjeta, no es necesario enviar comprobante.</p>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-zinc-200"></div>
              <span className="flex-shrink mx-4 text-zinc-400 text-xs font-bold uppercase">ó</span>
              <div className="flex-grow border-t border-zinc-200"></div>
            </div>

            {/* Método 2: Transferencia */}
            <div className="space-y-3">
              <span className="text-[10px] font-extrabold uppercase text-zinc-650 tracking-wider block">Opción 2: Transferencia o Depósito Bancario</span>
              
              <div className="bg-[#FAF9F6] border border-zinc-200/70 rounded-xl p-3 text-xs space-y-2 relative overflow-hidden">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 font-semibold">Banco:</span>
                  <strong className="text-zinc-950 font-extrabold">Santander</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 font-semibold">Titular:</span>
                  <strong className="text-zinc-950 font-extrabold">Laura Isabel Corral Dovalina</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 font-semibold">Cuenta:</span>
                  <strong className="text-zinc-950 font-extrabold">60628351140</strong>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-zinc-150">
                  <span className="text-zinc-500 font-semibold">CLABE:</span>
                  <strong className="text-zinc-950 font-black tracking-wide">014060606283511403</strong>
                </div>
                
                <button
                  onClick={() => copyToClipboard('014060606283511403', setCopiedClabe)}
                  className="w-full mt-2.5 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-lg text-xs hover:bg-indigo-100 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedClabe ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  {copiedClabe ? '¡Copiado!' : 'Copiar CLABE'}
                </button>
              </div>

              <div className="bg-[#FAF9F6] border border-zinc-200/70 rounded-xl p-3 text-xs space-y-2 relative overflow-hidden">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 font-semibold">Concepto de Transferencia:</span>
                  <strong className="text-zinc-950 font-black">{booking.id}</strong>
                </div>
                
                <button
                  onClick={() => copyToClipboard(String(booking.id), setCopiedConcept)}
                  className="w-full mt-2 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-lg text-xs hover:bg-indigo-100 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedConcept ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  {copiedConcept ? '¡Copiado!' : 'Copiar Concepto'}
                </button>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-850 flex gap-2">
                <Users size={16} className="shrink-0 mt-0.5 text-amber-700" />
                <p className="leading-relaxed">
                  <strong>Importante:</strong> {esConfirmada 
                    ? 'Si realizas una transferencia para liquidar tu saldo, por favor envía el comprobante por WhatsApp para registrarlo en tu cuenta.'
                    : 'Si realizas una transferencia o depósito, por favor envía el comprobante por WhatsApp para confirmar tu reservación.'
                  }
                </p>
              </div>

              <a 
                href={`https://wa.me/529581168698?text=Hola,%20envío%20el%20comprobante%20de%20mi%20reserva%20${booking.id}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold text-sm py-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                Enviar Comprobante por WhatsApp
              </a>
            </div>
          </div>
        )}

        {/* Guía y Reglamento */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-3.5">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <Compass size={18} className="text-indigo-600" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">Reglamento e Instrucciones</h3>
          </div>

          <div className="space-y-3 text-xs leading-relaxed text-zinc-650">
            <p>
              Para garantizar una estancia agradable a todos nuestros huéspedes, te pedimos revisar la guía digital de tu alojamiento:
            </p>
            <a 
              href="https://drive.google.com/drive/folders/1f03zp9bblMC-AtY2RkRyYHq-ugl-OyKl"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold rounded-xl text-center block border border-zinc-300/40 transition-all cursor-pointer"
            >
              📖 Ver Fotografías y Guía del Alojamiento
            </a>

            <div className="bg-[#FAF9F6] border border-zinc-200/50 rounded-xl p-3 space-y-2 mt-2">
              <h4 className="font-extrabold text-zinc-900 uppercase text-[10px] tracking-wide">🚫 Políticas Básicas</h4>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>No se admiten mascotas</strong> bajo ningún concepto.</li>
                <li><strong>Espacio 100% libre de humo</strong> (solo permitido fumar en áreas exteriores designadas).</li>
                <li>El horario de entrada es de <strong>3:00 PM a 8:00 PM</strong>. Salida a las <strong>12:00 PM</strong>.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Cómo Llegar */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-3.5">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <MapPin size={18} className="text-indigo-600" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">Ubicación y Cómo Llegar</h3>
          </div>

          <div className="space-y-3 text-xs">
            <p className="text-zinc-650 leading-relaxed">
              Condominios Jaroje se encuentra en Huatulco, Oaxaca. Haz clic en el botón de abajo para abrir la ubicación exacta en Google Maps:
            </p>
            <a 
              href="https://maps.app.goo.gl/1DzGMNAu5yeRJ5Qr6?g_st=ic"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-center flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <MapPin size={16} />
              Abrir en Google Maps
            </a>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="text-center text-zinc-500 text-[10px] mt-12 px-4 space-y-1">
        <p>© 2026 Condominios Jaroje. Todos los derechos reservados.</p>
        <p>¿Necesitas ayuda? Escríbenos a nuestro WhatsApp oficial: <strong>958 116 8698</strong></p>
      </footer>
    </div>
  );
}
