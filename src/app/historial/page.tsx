"use client";

import { useEffect, useState } from 'react';
import { 
  Clock, BedDouble, Lock, MessageCircle, AlertTriangle, 
  CheckCircle2, ArrowDownLeft, ArrowUpRight, RefreshCw,
  Wallet, Wrench, UserCheck
} from 'lucide-react';

type EventType = 'checkin' | 'checkout' | 'booking' | 'block' | 'conflict' | 'bot' | 'finanzas' | 'tarea' | 'sesion';

interface HistoryEvent {
  id: string;
  type: EventType;
  title: string;
  desc: string;
  time: string;
  date: string;
}

const iconByType = (type: EventType) => {
  switch(type) {
    case 'checkin': return <ArrowDownLeft size={15} strokeWidth={2.5} className="text-emerald-600" />;
    case 'checkout': return <ArrowUpRight size={15} strokeWidth={2.5} className="text-zinc-650" />;
    case 'booking': return <BedDouble size={15} strokeWidth={2.5} className="text-indigo-600" />;
    case 'block': return <Lock size={15} strokeWidth={2.5} className="text-rose-600" />;
    case 'conflict': return <AlertTriangle size={15} strokeWidth={2.5} className="text-amber-600" />;
    case 'bot': return <MessageCircle size={15} strokeWidth={2.5} className="text-blue-600" />;
    case 'finanzas': return <Wallet size={15} strokeWidth={2.5} className="text-emerald-650" />;
    case 'tarea': return <Wrench size={15} strokeWidth={2.5} className="text-amber-700" />;
    case 'sesion': return <UserCheck size={15} strokeWidth={2.5} className="text-cyan-600" />;
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
    case 'tarea': return 'bg-amber-50 border-amber-100';
    case 'sesion': return 'bg-cyan-50 border-cyan-100';
  }
};

export default function HistorialPage() {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/employee-logs');
      const json = await res.json();
      
      if (json.success && Array.isArray(json.data)) {
        // Mapear logs reales a la estructura de eventos
        const mapped = json.data.map((log: any) => {
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
          } else if (actionLower.includes('bloqueo') || actionLower.includes('block')) {
            type = 'block';
          } else if (actionLower.includes('bot') || moduleLower.includes('bot') || moduleLower.includes('webhook')) {
            type = 'bot';
          } else if (actionLower.includes('conflicto') || actionLower.includes('canal') || actionLower.includes('error')) {
            type = 'conflict';
          }
          
          // Formatear Fecha y Hora
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
          
          // Título amigable de la acción
          let rawAction = log.action;
          // Reemplazar snake_case o términos técnicos por títulos elegantes
          const friendlyActions: Record<string, string> = {
            'inicio_sesion_turno': 'Inicio de Turno',
            'check_in': 'Check-In Procesado',
            'check_out': 'Check-Out Procesado',
            'movimiento_financiero': 'Movimiento de Caja',
            'incidencia_mantenimiento': 'Problema Reportado',
            'cambio_estado_incidencia': 'Tarea Actualizada',
          };
          const friendlyTitle = friendlyActions[rawAction] || rawAction.replace(/_/g, ' ');

          let title = friendlyTitle;
          if (log.employee_name) {
            title = `${friendlyTitle} · ${log.employee_name}`;
          }
          
          let desc = log.details || `${log.department || 'Sistema'} · Módulo: ${log.module}`;
          if (log.room) {
            desc = `Habitación ${log.room} · ${desc}`;
          }
          
          return {
            id: String(log.id),
            type,
            title,
            desc,
            time: timeStr,
            date: dateStr
          };
        });

        setEvents(mapped);
      } else {
        setEvents([]);
      }
    } catch (e) {
      console.error("Error fetching logs", e);
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const groupedByDate = events.reduce((acc, item) => {
    if (!acc[item.date]) acc[item.date] = [];
    acc[item.date].push(item);
    return acc;
  }, {} as Record<string, HistoryEvent[]>);

  return (
    <div className="space-y-1 pb-24 bg-[#fafafa]">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight">Historial</h2>
          <p className="text-[13px] font-medium text-zinc-500 mt-1">
            {isLoading ? 'Cargando auditoría...' : 'Registro de actividad real en tiempo real'}
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={isLoading}
          className={`w-9 h-9 flex items-center justify-center text-zinc-500 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl shadow-sm transition-all ${isLoading ? 'opacity-50' : 'active:scale-95'}`}
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-3 bg-zinc-200 rounded w-24 mb-3" />
              <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 space-y-4">
                {[1, 2, 3].map(j => (
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
      ) : events.length === 0 ? (
        <div className="bg-white border border-zinc-200/80 rounded-3xl p-8 text-center shadow-sm max-w-sm mx-auto my-12 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-zinc-50 border border-zinc-150 flex items-center justify-center text-zinc-400">
            <Clock size={32} strokeWidth={1.5} className="animate-pulse" />
          </div>
          <div className="space-y-1">
            <h4 className="text-[15px] font-bold text-zinc-950">Historial de Operaciones Vacío</h4>
            <p className="text-[12px] text-zinc-500 leading-relaxed">
              No hay actividades registradas en el hotel todavía. Los movimientos de caja, firmas de turno, check-ins y check-outs reales aparecerán aquí al instante.
            </p>
          </div>
          <button
            onClick={fetchLogs}
            className="inline-flex items-center gap-2 bg-zinc-950 text-white text-[12px] font-bold py-2.5 px-4.5 rounded-xl hover:bg-black transition-all active:scale-95 shadow-sm"
          >
            <RefreshCw size={13} />
            <span>Actualizar Historial</span>
          </button>
        </div>
      ) : (
        Object.entries(groupedByDate).map(([date, items]) => (
          <div key={date} className="mb-6">
            <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Clock size={11} /> {date}
            </h3>
            <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden divide-y divide-zinc-100">
              {items.map(ev => (
                <div key={ev.id} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-zinc-50/50 transition-colors">
                  <div className={`w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 border ${bgByType(ev.type)}`}>
                    {iconByType(ev.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-zinc-900 leading-tight truncate">{ev.title}</p>
                    <p className="text-[12px] font-medium text-zinc-500 mt-0.5 truncate">{ev.desc}</p>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-400 shrink-0">{ev.time}</span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
