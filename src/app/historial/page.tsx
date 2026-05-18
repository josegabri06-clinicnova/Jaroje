"use client";

import { Clock, BedDouble, Lock, MessageCircle, AlertTriangle, CheckCircle2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

type EventType = 'checkin' | 'checkout' | 'booking' | 'block' | 'conflict' | 'bot';

const MOCK_HISTORY: { id: string; type: EventType; title: string; desc: string; time: string; date: string }[] = [
  { id: '1', type: 'conflict', title: 'Conflicto de Canal Detectado', desc: 'Penthouse Jaroje · Airbnb vs Directo · Solucionado', time: '09:14', date: 'Hoy' },
  { id: '2', type: 'checkin', title: 'Check-In Registrado', desc: 'Carlos Méndez · Penthouse Jaroje · Directo', time: '14:30', date: 'Hoy' },
  { id: '3', type: 'bot', title: 'Reserva vía WhatsApp Bot', desc: 'María López confirmó reserva para 25-28 Abril · $260', time: '11:02', date: 'Hoy' },
  { id: '4', type: 'block', title: 'Bloqueo de Fechas Aplicado', desc: 'Condominio 1 Hab · 28 Abril · Mantenimiento AC', time: '10:45', date: 'Ayer' },
  { id: '5', type: 'checkout', title: 'Check-Out Completado', desc: 'Marta Ruiz · Condominio 2 Hab · Booking', time: '11:00', date: 'Ayer' },
  { id: '6', type: 'booking', title: 'Nueva Reserva Manual', desc: 'Pedro Sánchez · Estudio Jaroje · Directo · $195', time: '16:22', date: 'Ayer' },
  { id: '7', type: 'checkin', title: 'Check-In Registrado', desc: 'Marta Ruiz · Condominio 2 Hab · Booking', time: '15:10', date: '21 Abril' },
  { id: '8', type: 'bot', title: 'Consulta resuelta por Bot', desc: 'Consulta de disponibilidad de Estudio · Respondida en 3s', time: '09:00', date: '21 Abril' },
];

const iconByType = (type: EventType) => {
  switch(type) {
    case 'checkin': return <ArrowDownLeft size={15} strokeWidth={2.5} className="text-emerald-600" />;
    case 'checkout': return <ArrowUpRight size={15} strokeWidth={2.5} className="text-zinc-600" />;
    case 'booking': return <BedDouble size={15} strokeWidth={2.5} className="text-zinc-900" />;
    case 'block': return <Lock size={15} strokeWidth={2.5} className="text-rose-600" />;
    case 'conflict': return <AlertTriangle size={15} strokeWidth={2.5} className="text-amber-600" />;
    case 'bot': return <MessageCircle size={15} strokeWidth={2.5} className="text-blue-600" />;
  }
};

const bgByType = (type: EventType) => {
  switch(type) {
    case 'checkin': return 'bg-emerald-50 border-emerald-100';
    case 'checkout': return 'bg-zinc-100 border-zinc-200';
    case 'booking': return 'bg-zinc-100 border-zinc-200';
    case 'block': return 'bg-rose-50 border-rose-100';
    case 'conflict': return 'bg-amber-50 border-amber-100';
    case 'bot': return 'bg-blue-50 border-blue-100';
  }
};

export default function HistorialPage() {
  const groupedByDate = MOCK_HISTORY.reduce((acc, item) => {
    if (!acc[item.date]) acc[item.date] = [];
    acc[item.date].push(item);
    return acc;
  }, {} as Record<string, typeof MOCK_HISTORY>);

  return (
    <div className="space-y-1 pb-24 bg-[#fafafa]">
      <div className="mb-6">
        <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight">Historial</h2>
        <p className="text-[13px] font-medium text-zinc-500 mt-1">Registro completo de actividad</p>
      </div>

      {Object.entries(groupedByDate).map(([date, events]) => (
        <div key={date} className="mb-6">
          <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Clock size={11} /> {date}
          </h3>
          <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden divide-y divide-zinc-100">
            {events.map(ev => (
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
      ))}
    </div>
  );
}
