"use client";

import { useEffect, useState, useRef } from 'react';
import { 
  Clock, BedDouble, Lock, MessageCircle, AlertTriangle, 
  CheckCircle2, ArrowDownLeft, ArrowUpRight, RefreshCw,
  Wallet, Wrench, UserCheck, Package, Search, Calendar, 
  ChevronRight, SlidersHorizontal, Sparkles, AlertCircle, X
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// Inicializar cliente de Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type EventType = 'checkin' | 'checkout' | 'booking' | 'block' | 'conflict' | 'bot' | 'finanzas' | 'tarea' | 'sesion' | 'inventario';

interface HistoryEvent {
  id: string;
  type: EventType;
  title: string;
  desc: string;
  time: string;
  date: string;
  rawDate: string; // YYYY-MM-DD
  module: string;
  employee_name: string;
  details: string;
  room?: string;
  rawLog: any; // Log crudo para resolución de links
  parsed?: any; // Objeto parseado si es JSON
}

function parseLogDetails(detailsStr: string | null | undefined): { text: string; parsed: any } {
  if (!detailsStr) return { text: '', parsed: null };
  const trimmed = detailsStr.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);
      return {
        text: obj.text || detailsStr,
        parsed: obj
      };
    } catch (e) {
      // Fallback
    }
  }
  
  // Heurística de fallback con expresiones regulares para registros antiguos
  const lowerDetails = detailsStr.toLowerCase();
  if (lowerDetails.includes('movimiento contable') || lowerDetails.includes('traspaso') || lowerDetails.includes('pago')) {
    const isIngreso = lowerDetails.includes('ingreso') || lowerDetails.includes('recibió pago') || lowerDetails.includes('recibido');
    const isGasto = lowerDetails.includes('gasto') || lowerDetails.includes('enviado');
    const isTraspaso = lowerDetails.includes('traspaso');
    
    let type = isIngreso ? 'ingreso' : isGasto ? 'gasto' : isTraspaso ? 'traspaso' : 'gasto';
    
    // Extraer monto
    const amountMatch = detailsStr.match(/\$(\d+(?:\.\d+)?)/);
    const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;
    
    // Extraer cuenta
    let account = 'General';
    const accMatch = detailsStr.match(/(?:cuenta|desde|sobre)\s+([A-Za-záéíóúüñ0-9\s]+?)(?:\s+\(|,|\.|\s+a\s+|$)/i);
    if (accMatch) account = accMatch[1].trim();
    
    // Extraer categoría
    let category = 'Ajuste';
    const catMatch = detailsStr.match(/\(([A-Za-záéíóúüñ\s]+)\)/);
    if (catMatch) category = catMatch[1].trim();
    
    return {
      text: detailsStr,
      parsed: {
        finance: {
          type,
          amount,
          account,
          category,
          description: detailsStr
        }
      }
    };
  }
  
  if (lowerDetails.includes('tarea') || lowerDetails.includes('incidencia') || lowerDetails.includes('daño técnico')) {
    const isResuelta = lowerDetails.includes('resuelta') || lowerDetails.includes('resolución') || lowerDetails.includes('resuel');
    const isEnProceso = lowerDetails.includes('proceso') || lowerDetails.includes('inició');
    const isPendiente = lowerDetails.includes('pendiente');
    
    let status = isResuelta ? 'resuelta' : isEnProceso ? 'en_proceso' : isPendiente ? 'pendiente' : 'nuevo';
    
    // Extraer comentarios de cierre
    let comments = '';
    const commentsMatch = detailsStr.match(/(?:cierre|comentarios de cierre:)\s*(.+)/i);
    if (commentsMatch) comments = commentsMatch[1].trim();
    
    return {
      text: detailsStr,
      parsed: {
        mantenimiento: {
          status,
          resolutionComments: comments,
          description: detailsStr
        }
      }
    };
  }

  if (lowerDetails.includes('walk-in') || lowerDetails.includes('check-in') || lowerDetails.includes('check-out') || lowerDetails.includes('reserva')) {
    const isCheckIn = lowerDetails.includes('check-in') || lowerDetails.includes('checkin');
    const isCheckOut = lowerDetails.includes('check-out') || lowerDetails.includes('checkout');
    const isWalkIn = lowerDetails.includes('walk-in');
    
    return {
      text: detailsStr,
      parsed: {
        reserva: {
          guestName: detailsStr.replace(/Registró (?:Walk-In|Check-In|Check-Out) de\s*/i, '').trim(),
          isCheckIn,
          isCheckOut,
          isWalkIn,
          channel: isWalkIn ? 'Recepción' : 'Directo'
        }
      }
    };
  }
  
  return { text: detailsStr, parsed: null };
}

// Configuración visual por tipo
const iconByType = (type: EventType) => {
  switch(type) {
    case 'checkin': return <ArrowDownLeft size={16} strokeWidth={2.5} className="text-emerald-600" />;
    case 'checkout': return <ArrowUpRight size={16} strokeWidth={2.5} className="text-zinc-650" />;
    case 'booking': return <BedDouble size={16} strokeWidth={2.5} className="text-indigo-600" />;
    case 'block': return <Lock size={16} strokeWidth={2.5} className="text-rose-600" />;
    case 'conflict': return <AlertTriangle size={16} strokeWidth={2.5} className="text-amber-600" />;
    case 'bot': return <MessageCircle size={16} strokeWidth={2.5} className="text-blue-600" />;
    case 'finanzas': return <Wallet size={16} strokeWidth={2.5} className="text-emerald-600" />;
    case 'tarea': return <Wrench size={16} strokeWidth={2.5} className="text-rose-500" />;
    case 'sesion': return <UserCheck size={16} strokeWidth={2.5} className="text-cyan-600" />;
    case 'inventario': return <Package size={16} strokeWidth={2.5} className="text-violet-650" />;
  }
};

const bgByType = (type: EventType) => {
  switch(type) {
    case 'checkin': return 'bg-emerald-50 border-emerald-100/80';
    case 'checkout': return 'bg-zinc-50 border-zinc-150';
    case 'booking': return 'bg-indigo-50 border-indigo-100';
    case 'block': return 'bg-rose-50 border-rose-100';
    case 'conflict': return 'bg-amber-50 border-amber-100';
    case 'bot': return 'bg-blue-50 border-blue-100';
    case 'finanzas': return 'bg-emerald-50 border-emerald-100/80';
    case 'tarea': return 'bg-rose-50 border-rose-100';
    case 'sesion': return 'bg-cyan-50 border-cyan-100';
    case 'inventario': return 'bg-violet-50 border-violet-100/80';
  }
};

// Sintetizador Web Audio API Premium (Tono dual armónico E5 + A5)
const playIncidentSound = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc1.type = 'sine';
    osc2.type = 'sine';
    
    // Armónico premium (E5 = 659.25Hz, A5 = 880.00Hz)
    osc1.frequency.setValueAtTime(659.25, audioCtx.currentTime);
    osc2.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.12);
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.15);
    
    osc2.start(audioCtx.currentTime + 0.1);
    osc2.stop(audioCtx.currentTime + 0.6);
  } catch (e) {
    console.warn("AudioContext bloqueado o no soportado en este navegador:", e);
  }
};

// Resolutor de deep links inteligentes
const resolveDeepLink = (log: any) => {
  const actionLower = (log.action || '').toLowerCase();
  const moduleLower = (log.module || '').toLowerCase();
  
  // Expresión regular para parsear Beds24 ID o Reserva ID de 5 a 12 dígitos
  const idMatch = log.details?.match(/(?:id|reserva|beds24|id_reserva)\s*#?[:\-]?\s*(\d{5,12})/i);
  
  if (moduleLower === 'finanzas' || actionLower.includes('finan') || actionLower.includes('pago') || actionLower.includes('transac')) {
    return '/finanzas';
  }
  if (moduleLower === 'mantenimiento' || actionLower.includes('mantenimiento') || actionLower.includes('incidencia') || actionLower.includes('tarea')) {
    return '/mantenimiento';
  }
  if (moduleLower === 'limpieza' || actionLower.includes('limpieza') || actionLower.includes('cambio_estado')) {
    return '/recepcion'; // Los logs de limpieza de habitaciones redirigen a Recepción como recomendado
  }
  if (moduleLower === 'inventario' || actionLower.includes('inventario') || actionLower.includes('stock')) {
    return '/inventario';
  }
  if (moduleLower === 'equipo' || actionLower.includes('sesion') || actionLower.includes('turno') || actionLower.includes('firma')) {
    return '/equipo';
  }
  if (moduleLower === 'bot' || actionLower.includes('bot') || actionLower.includes('whatsapp')) {
    return '/bot';
  }
  
  // checkin/checkout/reserva general
  if (actionLower.includes('check') || actionLower.includes('reserv') || moduleLower === 'recepcion') {
    if (idMatch && idMatch[1]) {
      return `/reservas?id=${idMatch[1]}`;
    }
    return '/reservas';
  }
  
  return null;
};

export default function HistorialPage() {
  const router = useRouter();
  const [rawLogs, setRawLogs] = useState<any[]>([]);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Persistencia en sesión para filtros
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('jaroje_hist_search') || '';
    return '';
  });
  const [moduleFilter, setModuleFilter] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('jaroje_hist_module') || 'todos';
    return 'todos';
  });
  const [dateRangePill, setDateRangePill] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('jaroje_hist_date_pill') || 'todos';
    return 'todos';
  });
  const [customStartDate, setCustomStartDate] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('jaroje_hist_start_date') || '';
    return '';
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('jaroje_hist_end_date') || '';
    return '';
  });
  const [groupBy, setGroupBy] = useState<'date' | 'module'>(() => {
    if (typeof window !== 'undefined') return (sessionStorage.getItem('jaroje_hist_group_by') as any) || 'date';
    return 'date';
  });

  // Notificación flotante (Toast)
  const [showToast, setShowToast] = useState(false);
  const [toastLog, setToastLog] = useState<any>(null);
  const toastTimeoutRef = useRef<any>(null);

  // Event Details Modal State
  const [selectedEventForModal, setSelectedEventForModal] = useState<HistoryEvent | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);

  const openEventDetails = (ev: HistoryEvent) => {
    setSelectedEventForModal(ev);
    setShowEventModal(true);
  };

  const renderEventCard = (ev: HistoryEvent, showDate: boolean = false) => {
    const parsed = ev.parsed;
    
    // ─── 1. DISEÑO PREMIUM DE TARJETA DE FINANZAS ────────────────────────────
    if (parsed?.finance) {
      const fin = parsed.finance;
      const isIngreso = fin.type === 'ingreso';
      const isTraspaso = fin.type === 'traspaso';
      const isReconciled = fin.type === 'reconciled';
      
      let bgCircle = 'bg-rose-50 text-rose-600 border-rose-100';
      let IconComponent = <ArrowUpRight size={18} strokeWidth={2.5} />;
      let amountColor = 'text-zinc-900';
      let prefix = '-';
      
      if (isIngreso) {
        bgCircle = 'bg-emerald-50 text-emerald-600 border-emerald-100';
        IconComponent = <ArrowDownLeft size={18} strokeWidth={2.5} />;
        amountColor = 'text-emerald-600';
        prefix = '+';
      } else if (isTraspaso) {
        bgCircle = 'bg-indigo-50 text-indigo-600 border-indigo-100';
        IconComponent = <RefreshCw size={16} strokeWidth={2.5} className="animate-spin duration-[10s]" />;
        amountColor = 'text-indigo-600';
        prefix = '';
      } else if (isReconciled) {
        bgCircle = 'bg-amber-50 text-amber-600 border-amber-100';
        IconComponent = <CheckCircle2 size={16} strokeWidth={2.5} />;
        amountColor = 'text-amber-600';
        prefix = '';
      }

      const rawDetailsText = typeof fin.description === 'string' ? fin.description : ev.desc;
      // Remueve tags como [Synced: B24] o [Pending Sync: B24]
      const cleanDetailsText = rawDetailsText.replace(/\[Synced:\s*B24\]/gi, '').replace(/\[Pending\s*Sync:\s*B24\]/gi, '').trim();

      return (
        <div
          key={ev.id}
          onClick={() => openEventDetails(ev)}
          className="p-4 flex flex-col gap-3 hover:bg-zinc-50/80 transition-colors cursor-pointer group"
        >
          <div className="flex items-center justify-between gap-3.5">
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${bgCircle}`}>
                {IconComponent}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
                  <span className="text-[14px] font-bold text-zinc-900 leading-tight capitalize truncate">
                    {fin.category || (isTraspaso ? 'Traspaso de Fondos' : isReconciled ? 'Conciliación Beds24' : 'Finanzas')}
                  </span>
                  <span className="text-[10px] font-black uppercase bg-zinc-100 text-zinc-500 border border-zinc-200 px-1.5 py-0.5 rounded">
                    {fin.account || 'Caja'}
                  </span>
                </div>
                <p className="text-[12px] font-medium text-zinc-500 line-clamp-1 leading-normal">
                  {cleanDetailsText}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col items-end shrink-0 ml-2">
              <span className={`text-[15px] font-black tracking-tight ${amountColor}`}>
                {prefix}MX${Math.round(fin.amount || 0).toLocaleString('es-MX')}
              </span>
              <span className="text-[10px] font-semibold text-zinc-400 mt-0.5">
                {ev.time} {showDate && `• ${ev.date}`}
              </span>
            </div>
          </div>

          {/* Footer/Firma de la tarjeta */}
          <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold border-t border-zinc-100/50 pt-2">
            <span className="flex items-center gap-1">
              👤 Firma: <span className="text-zinc-650 capitalize">{ev.employee_name}</span>
            </span>
            <span className="text-[9px] text-zinc-300 font-black tracking-wider uppercase">FINANZAS</span>
          </div>
        </div>
      );
    }

    // ─── 2. DISEÑO PREMIUM DE TARJETA DE MANTENIMIENTO ───────────────────────
    if (parsed?.mantenimiento) {
      const mtto = parsed.mantenimiento;
      const isResuelta = mtto.status === 'resuelta';
      const isEnProceso = mtto.status === 'en_proceso';
      const isPendiente = mtto.status === 'pendiente';
      const isEliminada = mtto.status === 'eliminada';
      
      let statusPill = 'bg-purple-50 text-purple-600 border-purple-100';
      let statusLabel = 'Nuevo';
      
      if (isResuelta) {
        statusPill = 'bg-emerald-50 text-emerald-600 border-emerald-100';
        statusLabel = 'Resuelta ✓';
      } else if (isEnProceso) {
        statusPill = 'bg-blue-50 text-blue-600 border-blue-100';
        statusLabel = 'En Proceso ⚡';
      } else if (isPendiente) {
        statusPill = 'bg-amber-50 text-amber-600 border-amber-100';
        statusLabel = 'Pendiente';
      } else if (isEliminada) {
        statusPill = 'bg-rose-50 text-rose-600 border-rose-100';
        statusLabel = 'Eliminada ✕';
      }

      return (
        <div
          key={ev.id}
          onClick={() => openEventDetails(ev)}
          className="p-4 flex flex-col gap-3.5 hover:bg-zinc-50/80 transition-colors cursor-pointer group"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0">
              <Wrench size={18} strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${statusPill}`}>
                    {statusLabel}
                  </span>
                  <span className="text-[10px] font-black uppercase bg-zinc-100 text-zinc-655 border border-zinc-200 px-2 py-0.5 rounded-md">
                    Hab: {mtto.room || ev.room || 'Gral'}
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-zinc-400">
                  {ev.time} {showDate && `• ${ev.date}`}
                </span>
              </div>
              
              <p className="text-[13px] font-bold text-zinc-900 whitespace-pre-line leading-tight">
                {mtto.description || ev.desc}
              </p>
              
              {/* Comentarios de resolución destacados si existen */}
              {mtto.resolutionComments && (
                <div className="mt-2 bg-emerald-50/40 border border-emerald-100/50 p-2.5 rounded-xl text-[11px] font-semibold text-emerald-800 leading-snug flex items-start gap-1">
                  <span className="shrink-0">🛠️</span>
                  <span><strong>Cierre:</strong> {mtto.resolutionComments}</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer/Firma de la tarjeta */}
          <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold border-t border-zinc-100/50 pt-2">
            <span className="flex items-center gap-1">
              👤 Operador: <span className="text-zinc-650 capitalize">{ev.employee_name}</span>
            </span>
            <div className="flex gap-1.5 items-center">
              {mtto.photo_url && (
                <span className="text-[9px] font-bold text-blue-650">📷 Foto</span>
              )}
              {mtto.resolution_photo_url && (
                <span className="text-[9px] font-bold text-emerald-650">✅ Evidencia</span>
              )}
              <span className="text-[9px] text-zinc-300 font-black tracking-wider uppercase ml-1">MANTENIMIENTO</span>
            </div>
          </div>
        </div>
      );
    }

    // ─── 3. DISEÑO PREMIUM DE TARJETA DE RESERVAS ────────────────────────────
    if (parsed?.reserva) {
      const res = parsed.reserva;
      const isBlock = res.isBlock;
      
      let sourceBg = 'bg-zinc-100 text-zinc-800 border-zinc-200';
      if (res.channel === 'Airbnb') {
        sourceBg = 'bg-rose-50 text-rose-600 border-rose-100';
      } else if (res.channel === 'Booking.com') {
        sourceBg = 'bg-blue-50 text-blue-600 border-blue-100';
      } else if (res.channel === 'WhatsApp' || res.channel === 'WhatsApp Bot') {
        sourceBg = 'bg-emerald-50 text-emerald-600 border-emerald-100';
      }

      return (
        <div
          key={ev.id}
          onClick={() => openEventDetails(ev)}
          className="p-4 flex flex-col gap-3 hover:bg-zinc-50/80 transition-colors cursor-pointer group"
        >
          <div className="flex items-start justify-between gap-3.5">
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${isBlock ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-indigo-50 border-indigo-100 text-indigo-600'}`}>
                <BedDouble size={18} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
                  <span className="text-[14px] font-bold text-zinc-900 leading-tight truncate">
                    {res.guestName}
                  </span>
                  {!isBlock && (
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${sourceBg}`}>
                      {res.channel}
                    </span>
                  )}
                  {isBlock && (
                    <span className="text-[9px] font-black uppercase bg-rose-100 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded">
                      Bloqueo Físico
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mt-0.5">
                  📅 {format(new Date(res.checkIn + 'T12:00:00Z'), 'dd MMM', { locale: es })} — {format(new Date(res.checkOut + 'T12:00:00Z'), 'dd MMM', { locale: es })}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col items-end shrink-0 ml-2">
              {!isBlock && res.price > 0 ? (
                <span className="text-[14px] font-black text-indigo-650">
                  MX${Math.round(res.price).toLocaleString('es-MX')}
                </span>
              ) : (
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  —
                </span>
              )}
              <span className="text-[10px] font-semibold text-zinc-400 mt-0.5">
                {ev.time} {showDate && `• ${ev.date}`}
              </span>
            </div>
          </div>

          {/* Footer/Firma de la tarjeta */}
          <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold border-t border-zinc-100/50 pt-2">
            <span className="flex items-center gap-1">
              👤 Operador: <span className="text-zinc-650 capitalize">{ev.employee_name}</span>
            </span>
            <span className="text-[9px] text-zinc-300 font-black tracking-wider uppercase">RECEPCIÓN</span>
          </div>
        </div>
      );
    }

    // ─── 4. RENDER DE FILA DE FALLBACK (Estilo base original limpio) ─────────
    return (
      <div
        key={ev.id}
        onClick={() => openEventDetails(ev)}
        className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-zinc-50/50 transition-colors group cursor-pointer"
      >
        <div className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 border ${bgByType(ev.type)}`}>
          {iconByType(ev.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[14px] font-semibold text-zinc-900 leading-tight truncate">{ev.title}</p>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-md border border-zinc-200 shrink-0">
              Detalles
            </span>
          </div>
          <p className="text-[12px] font-medium text-zinc-500 mt-1 truncate">{ev.desc}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <div className="flex flex-col items-end">
            <span className="text-[11px] font-semibold text-zinc-400">{ev.time}</span>
            {showDate && (
              <span className="text-[9px] font-bold text-zinc-400 mt-0.5 capitalize">{ev.date}</span>
            )}
          </div>
          <ChevronRight size={14} className="text-zinc-300 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    );
  };

  // Deep-linking: Auto-abrir modal si hay ?id= en la URL
  useEffect(() => {
    if (events.length > 0 && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const targetId = params.get('id');
      if (targetId) {
        const found = events.find(e => String(e.id) === String(targetId));
        if (found) {
          setSelectedEventForModal(found);
          setShowEventModal(true);
          // Limpiar la URL de forma elegante
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }
      }
    }
  }, [events]);

  // Sincronizar filtros a sessionStorage
  useEffect(() => {
    sessionStorage.setItem('jaroje_hist_search', searchQuery);
    sessionStorage.setItem('jaroje_hist_module', moduleFilter);
    sessionStorage.setItem('jaroje_hist_date_pill', dateRangePill);
    sessionStorage.setItem('jaroje_hist_start_date', customStartDate);
    sessionStorage.setItem('jaroje_hist_end_date', customEndDate);
    sessionStorage.setItem('jaroje_hist_group_by', groupBy);
  }, [searchQuery, moduleFilter, dateRangePill, customStartDate, customEndDate, groupBy]);

  const mapLogsToEvents = (logsData: any[]): HistoryEvent[] => {
    return logsData.map((log: any) => {
      const actionLower = (log.action || '').toLowerCase();
      const moduleLower = (log.module || '').toLowerCase();
      
      let type: EventType = 'booking';
      if (actionLower.includes('checkin') || actionLower.includes('check-in')) {
        type = 'checkin';
      } else if (actionLower.includes('checkout') || actionLower.includes('check-out')) {
        type = 'checkout';
      } else if (actionLower.includes('finan') || actionLower.includes('movimiento') || actionLower.includes('transac') || actionLower.includes('pago') || actionLower.includes('nomina')) {
        type = 'finanzas';
      } else if (actionLower.includes('incidencia') || actionLower.includes('limpieza') || actionLower.includes('mantenimiento') || actionLower.includes('tarea')) {
        type = 'tarea';
      } else if (actionLower.includes('sesion') || actionLower.includes('turno') || actionLower.includes('firma')) {
        type = 'sesion';
      } else if (moduleLower.includes('inventario') || actionLower.includes('stock') || actionLower.includes('articulo') || actionLower.includes('almacen')) {
        type = 'inventario';
      } else if (actionLower.includes('bloqueo') || actionLower.includes('block')) {
        type = 'block';
      } else if (actionLower.includes('bot') || moduleLower.includes('bot') || moduleLower.includes('webhook')) {
        type = 'bot';
      } else if (actionLower.includes('conflicto') || actionLower.includes('canal') || actionLower.includes('error')) {
        type = 'conflict';
      }
      
      const d = new Date(log.created_at);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      let dateStr = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
      if (d.toDateString() === today.toDateString()) {
        dateStr = 'Hoy';
      } else if (d.toDateString() === yesterday.toDateString()) {
        dateStr = 'Ayer';
      }
      
      const timeStr = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
      
      const rawDateStr = log.created_at.split('T')[0];
      
      let rawAction = log.action;
      const friendlyActions: Record<string, string> = {
        'inicio_sesion_turno': 'Inicio de Turno',
        'check_in': 'Check-In Procesado',
        'check_out': 'Check-Out Procesado',
        'movimiento_financiero': 'Movimiento de Caja',
        'incidencia_mantenimiento': 'Problema Reportado',
        'cambio_estado_incidencia': 'Tarea Actualizada',
        'ajuste_stock': 'Ajuste de Almacén',
        'nuevo_articulo': 'Artículo Creado',
        'actualizacion_articulo': 'Parámetros Actualizados',
        'eliminar_articulo': 'Artículo Eliminado',
        'reserva_creada': 'Nueva Reserva Manual 📅',
        'bloqueo_habitacion': 'Bloqueo Físico de Unidad 🔒',
        'reserva_cancelada': 'Reserva Cancelada ✕',
        'reasignacion_habitacion': 'Habitación Reasignada 🔁',
        'reserva_creada_webhook': 'Nueva Reserva Recibida 📥',
      };
      const friendlyTitle = friendlyActions[rawAction] || rawAction.replace(/_/g, ' ');

      let title = friendlyTitle;
      if (log.employee_name) {
        title = `${friendlyTitle} · ${log.employee_name}`;
      }
      
      const parsedInfo = parseLogDetails(log.details);
      
      let desc = parsedInfo.text || `${log.department || 'Sistema'} · Módulo: ${log.module}`;
      if (log.room && !desc.toLowerCase().includes('habitación') && !desc.toLowerCase().includes('habitacion')) {
        desc = `Habitación ${log.room} · ${desc}`;
      }
      
      return {
        id: String(log.id),
        type,
        title,
        desc,
        time: timeStr,
        date: dateStr,
        rawDate: rawDateStr,
        module: log.module || 'recepcion',
        employee_name: log.employee_name || 'Sistema',
        details: log.details || '',
        room: log.room || undefined,
        rawLog: log,
        parsed: parsedInfo.parsed
      };
    });
  };

  const fetchLogs = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch('/api/employee-logs');
      const json = await res.json();
      
      if (json.success && Array.isArray(json.data)) {
        setRawLogs(json.data);
        setEvents(mapLogsToEvents(json.data));
      }
    } catch (e) {
      console.error("Error fetching logs", e);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // Suscripción Realtime Supabase + Polling de Respaldo
  useEffect(() => {
    fetchLogs();

    // 1. Supabase Realtime Postgres Channel
    const channel = supabase
      .channel('employee_logs_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'employee_logs' },
        (payload: any) => {
          console.log('Realtime Postgres Insert Recibida:', payload.new);
          const newLog = payload.new;
          
          // Prevenir duplicados locales
          setRawLogs(prev => {
            if (prev.some(item => String(item.id) === String(newLog.id))) return prev;
            const updated = [newLog, ...prev];
            setEvents(mapLogsToEvents(updated));
            return updated;
          });

          // Disparar chime de audio ante cualquier nuevo evento en el historial
          playIncidentSound();

          // Mostrar Banner Toast Flotante Premium
          setToastLog(newLog);
          setShowToast(true);
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          toastTimeoutRef.current = setTimeout(() => {
            setShowToast(false);
          }, 8000);
        }
      )
      .subscribe();

    // 2. Polling silencioso cada 10 segundos para consistencia robusta offline-online
    const pollInterval = setInterval(() => {
      fetch('/api/employee-logs')
        .then(r => r.json())
        .then(json => {
          if (json.success && Array.isArray(json.data)) {
            setRawLogs(prev => {
              // Buscar si hay algún ID nuevo en la respuesta
              const existingIds = new Set(prev.map(x => String(x.id)));
              const newItems = json.data.filter((x: any) => !existingIds.has(String(x.id)));
              
              if (newItems.length > 0) {
                // Tocar sonido ante cualquier nuevo evento
                playIncidentSound();

                // Mostrar toast del más nuevo
                setToastLog(newItems[0]);
                setShowToast(true);
                if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                toastTimeoutRef.current = setTimeout(() => setShowToast(false), 8000);

                const merged = [...newItems, ...prev];
                setEvents(mapLogsToEvents(merged));
                return merged;
              }
              return prev;
            });
          }
        })
        .catch(err => console.log("Silent poll error:", err));
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Motor de filtros combinados de búsqueda
  const filteredEvents = events.filter(ev => {
    // 1. Filtro de Texto
    let matchText = true;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      matchText = 
        ev.title.toLowerCase().includes(q) ||
        ev.desc.toLowerCase().includes(q) ||
        ev.employee_name.toLowerCase().includes(q) ||
        ev.details.toLowerCase().includes(q) ||
        (ev.room && ev.room.includes(q)) ||
        ev.type.toLowerCase().includes(q);
    }

    // 2. Filtro de Módulo/Concepto
    let matchModule = true;
    if (moduleFilter !== 'todos') {
      matchModule = ev.module.toLowerCase() === moduleFilter.toLowerCase() || ev.type === moduleFilter;
      // Fallback cruzado para robustez
      if (moduleFilter === 'finanzas' && ev.type === 'finanzas') matchModule = true;
      if (moduleFilter === 'mantenimiento' && (ev.type === 'tarea' || ev.module === 'mantenimiento')) matchModule = true;
      if (moduleFilter === 'recepcion' && (ev.type === 'checkin' || ev.type === 'checkout' || ev.type === 'booking')) matchModule = true;
    }

    // 3. Filtro de Rango de Fechas
    let matchDate = true;
    const evDate = new Date(ev.rawDate + 'T12:00:00Z');
    const today = new Date();
    today.setHours(12,0,0,0);

    if (dateRangePill === 'hoy') {
      matchDate = evDate.toDateString() === today.toDateString();
    } else if (dateRangePill === 'ayer') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      matchDate = evDate.toDateString() === yesterday.toDateString();
    } else if (dateRangePill === 'semana') {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      matchDate = evDate >= sevenDaysAgo;
    } else if (dateRangePill === 'personalizado') {
      if (customStartDate) {
        const start = new Date(customStartDate + 'T12:00:00Z');
        matchDate = matchDate && (evDate >= start);
      }
      if (customEndDate) {
        const end = new Date(customEndDate + 'T12:00:00Z');
        matchDate = matchDate && (evDate <= end);
      }
    }

    return matchText && matchModule && matchDate;
  });

  // Agrupación Contable/Operativa
  const groupedByDate = filteredEvents.reduce((acc, item) => {
    if (!acc[item.date]) acc[item.date] = [];
    acc[item.date].push(item);
    return acc;
  }, {} as Record<string, HistoryEvent[]>);

  const groupedByModule = filteredEvents.reduce((acc, item) => {
    let groupName = 'Otros';
    if (item.type === 'finanzas' || item.module === 'finanzas') groupName = 'Finanzas y Caja';
    else if (item.type === 'tarea' || item.module === 'mantenimiento' || item.module === 'limpieza') groupName = 'Mantenimiento y Limpieza';
    else if (item.type === 'checkin' || item.type === 'checkout' || item.type === 'booking' || item.module === 'recepcion') groupName = 'Recepción y Reservas';
    else if (item.type === 'inventario' || item.module === 'inventario') groupName = 'Inventario y Stock';
    else if (item.type === 'bot' || item.module === 'bot') groupName = 'WhatsApp Bot';
    else if (item.type === 'sesion') groupName = 'Sesiones y Personal';

    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(item);
    return acc;
  }, {} as Record<string, HistoryEvent[]>);

  return (
    <div className="space-y-6 pb-28 bg-[#fafafa] min-h-screen">
      
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-bold text-zinc-900 tracking-tight">Historial de Auditoría</h2>
          <p className="text-[13px] font-medium text-zinc-500 mt-0.5">
            {isLoading ? 'Sincronizando operaciones...' : 'Registro de actividad hotelera en tiempo real'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchLogs()}
            disabled={isLoading}
            className={`w-9 h-9 flex items-center justify-center text-zinc-500 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl shadow-sm transition-all ${isLoading ? 'opacity-50' : 'active:scale-95'}`}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── PANEL DE FILTROS AVANZADOS ──────────────────────────────────── */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm space-y-4">
        
        {/* Búsqueda por Texto */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por empleado, habitación, acción, descripción..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-10 pr-4 py-2.5 outline-none text-[13px] font-medium text-zinc-900 focus:ring-2 focus:ring-zinc-900/10 placeholder-zinc-400 transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Selector de Rango de Fecha */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
              <Calendar size={12} />
              Rango de Fecha
            </span>
            {dateRangePill === 'personalizado' && (
              <span className="text-[10px] font-bold text-blue-600">Calendario Activo</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'hoy', label: 'Hoy' },
              { id: 'personalizado', label: 'Personalizado' }
            ].map(pill => (
              <button
                key={pill.id}
                onClick={() => setDateRangePill(pill.id)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                  dateRangePill === pill.id 
                    ? 'bg-zinc-900 border-zinc-900 text-white shadow-sm' 
                    : 'bg-zinc-50 border-zinc-200 text-zinc-650 hover:bg-zinc-100'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Inputs de Fecha Personalizada */}
          {dateRangePill === 'personalizado' && (
            <div className="grid grid-cols-2 gap-3 pt-2 animate-in slide-in-from-top-2 duration-200">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Desde</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 outline-none text-[12px] font-semibold text-zinc-800 focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Hasta</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 outline-none text-[12px] font-semibold text-zinc-800 focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>
            </div>
          )}
        </div>

        {/* Toggles de Agrupación */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
          <span className="text-[11px] font-semibold text-zinc-400">Tipo de Visualización</span>
          <div className="flex bg-zinc-100 p-0.5 rounded-xl border border-zinc-200/80">
            <button
              onClick={() => setGroupBy('date')}
              className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
                groupBy === 'date' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
              }`}
            >
              Por Fecha
            </button>
            <button
              onClick={() => setGroupBy('module')}
              className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
                groupBy === 'module' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
              }`}
            >
              Por Módulo
            </button>
          </div>
        </div>

      </div>

      {/* ── LISTADO DEL HISTORIAL DE AUDITORÍA ────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-6">
          {[1, 2].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-3 bg-zinc-200 rounded w-24 mb-3" />
              <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 space-y-4">
                {[1, 2].map(j => (
                  <div key={j} className="flex gap-4">
                    <div className="w-8 h-8 rounded-lg bg-zinc-200 shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3.5 bg-zinc-200 rounded w-1/3" />
                      <div className="h-3 bg-zinc-200 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white border border-zinc-200/80 rounded-3xl p-8 text-center shadow-sm max-w-sm mx-auto my-12 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-zinc-50 border border-zinc-150 flex items-center justify-center text-zinc-400">
            <Clock size={32} strokeWidth={1.5} className="animate-pulse" />
          </div>
          <div className="space-y-1">
            <h4 className="text-[15px] font-bold text-zinc-950">Sin registros coincidentes</h4>
            <p className="text-[12px] text-zinc-500 leading-relaxed">
              No encontramos registros de operaciones con los criterios y filtros seleccionados en este momento.
            </p>
          </div>
          <button
            onClick={() => {
              setSearchQuery('');
              setModuleFilter('todos');
              setDateRangePill('todos');
              fetchLogs();
            }}
            className="inline-flex items-center gap-2 bg-zinc-950 text-white text-[12px] font-bold py-2.5 px-4.5 rounded-xl hover:bg-black transition-all active:scale-95 shadow-sm"
          >
            <RefreshCw size={13} />
            <span>Restablecer Filtros</span>
          </button>
        </div>
      ) : (
        /* Renderizado según agrupación */
        groupBy === 'date' ? (
          Object.entries(groupedByDate).map(([date, items]) => (
            <div key={date} className="mb-4">
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3.5 flex items-center gap-2">
                <Clock size={11} /> {date}
              </h3>
              <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden divide-y divide-zinc-100">
                {items.map(ev => renderEventCard(ev, false))}
              </div>
            </div>
          ))
        ) : (
          Object.entries(groupedByModule).map(([moduleName, items]) => (
            <div key={moduleName} className="mb-4">
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3.5 flex items-center gap-2">
                <Sparkles size={11} className="text-blue-500" /> {moduleName}
                <span className="normal-case text-[10px] font-semibold text-zinc-450 bg-zinc-150 px-2 py-0.5 rounded-full border border-zinc-200">
                  {items.length} registros
                </span>
              </h3>
              <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden divide-y divide-zinc-100">
                {items.map(ev => renderEventCard(ev, true))}
              </div>
            </div>
          ))
        )
      )}

      {/* ── TOAST NOTIFICACIÓN FLOTANTE PREMIUM ─────────────────────────── */}
      {showToast && toastLog && (
        <div className="fixed bottom-6 right-6 left-6 sm:left-auto sm:w-[380px] z-[999] bg-zinc-900 text-white rounded-[24px] p-4 shadow-2xl border border-zinc-800 animate-in slide-in-from-bottom-6 fade-in duration-300">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500 flex items-center justify-center shrink-0 text-white animate-pulse">
              <AlertCircle size={20} strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black text-rose-450 uppercase tracking-widest">ALERTA EN TIEMPO REAL</span>
                <button 
                  onClick={() => setShowToast(false)}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-[13px] font-bold text-white mt-1 leading-snug truncate">
                {toastLog.employee_name ? `${toastLog.action.replace(/_/g, ' ')} · ${toastLog.employee_name}` : toastLog.action.replace(/_/g, ' ')}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed truncate">
                {toastLog.room ? `Habitación ${toastLog.room} · ${toastLog.details}` : toastLog.details}
              </p>
              
              {/* Enlace rápido interactivo desde el banner */}
              {resolveDeepLink(toastLog) && (
                <button
                  onClick={() => {
                    const link = resolveDeepLink(toastLog);
                    if (link) router.push(link);
                    setShowToast(false);
                  }}
                  className="mt-3 w-full py-2 bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-center text-white text-[11px] font-bold rounded-xl flex items-center justify-center gap-1"
                >
                  <span>Atender Incidencia</span>
                  <ChevronRight size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Premium Event Details Modal */}
      {showEventModal && selectedEventForModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowEventModal(false)}>
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 max-h-[90vh] overflow-y-auto border border-zinc-100 space-y-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-3 border-b border-zinc-100">
              <h3 className="text-lg font-bold text-zinc-900">Detalle de Registro</h3>
              <button 
                onClick={() => setShowEventModal(false)} 
                className="w-8 h-8 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors"
              >
                <X size={16} strokeWidth={3} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Encabezado con Icono */}
              <div className="flex items-center gap-3 bg-zinc-50 p-4 rounded-2xl border border-zinc-200/50">
                <div className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 border ${bgByType(selectedEventForModal.type)}`}>
                  {iconByType(selectedEventForModal.type)}
                </div>
                <div>
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block">Concepto</span>
                  <span className="text-[14px] font-extrabold text-zinc-800 leading-tight">
                    {selectedEventForModal.title.split(' · ')[0]}
                  </span>
                </div>
              </div>

              {/* Detalles principales */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Detalle de Actividad</span>
                <p className="text-[13px] text-zinc-800 font-medium whitespace-pre-line bg-zinc-50/50 p-4 border border-zinc-200/40 rounded-2xl leading-relaxed">
                  {selectedEventForModal.desc}
                </p>
              </div>

              {/* Grid de Metadatos del Empleado y Sistema */}
              <div className="bg-zinc-50/30 border border-zinc-100 p-4 rounded-2xl space-y-3.5 text-[12px]">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block border-b border-zinc-100 pb-1.5">Firma y Auditoría</span>
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 font-medium">
                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase">Operador</span>
                    <span className="font-bold text-zinc-800">{selectedEventForModal.employee_name}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase">No. Empleado</span>
                    <span className="font-bold text-zinc-800">{selectedEventForModal.rawLog.employee_num || '—'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase">Departamento</span>
                    <span className="font-bold text-zinc-800 uppercase">{selectedEventForModal.rawLog.department || 'SISTEMA'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase">Módulo</span>
                    <span className="font-bold text-zinc-800 uppercase">{selectedEventForModal.module}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase">Ubicación</span>
                    <span className="font-bold text-zinc-800">{selectedEventForModal.room || 'General'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase">Acción Interna</span>
                    <span className="font-bold text-zinc-600 font-mono text-[10px]">{selectedEventForModal.rawLog.action}</span>
                  </div>
                </div>
              </div>

              {/* Timestamp */}
              <div className="flex justify-between items-center text-[11px] text-zinc-400 font-semibold px-1">
                <span>Registro del Servidor</span>
                <span>
                  {format(new Date(selectedEventForModal.rawLog.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: es })}
                </span>
              </div>
            </div>

            {/* Acciones */}
            <div className="pt-4 border-t border-zinc-100 flex flex-col gap-2">
              {resolveDeepLink(selectedEventForModal.rawLog) && (
                <button
                  onClick={() => {
                    const link = resolveDeepLink(selectedEventForModal.rawLog);
                    if (link) router.push(link);
                    setShowEventModal(false);
                  }}
                  className="w-full py-4 bg-zinc-950 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all shadow-lg text-[14px] flex items-center justify-center gap-1.5 cursor-pointer animate-pulse"
                >
                  <span>Ir a la Sección Relacionada ↗</span>
                </button>
              )}
              
              <button
                onClick={() => setShowEventModal(false)}
                className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-500 font-bold rounded-xl transition-colors text-[13px] cursor-pointer"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
