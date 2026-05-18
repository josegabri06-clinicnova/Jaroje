"use client";

import { useState, useEffect, useRef } from 'react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  isSameDay, addDays, differenceInDays
} from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  ChevronLeft, ChevronRight, CheckCircle2, User, 
  RefreshCw, X, Phone, CheckCircle, Moon, BedDouble
} from 'lucide-react';

const ALL_ROOMS = [
  '001', '002', '003', '004', '005', '006',
  'Condominio 1R (Único)',
  '201', '202', '203', '204', '205', '206',
  '301', '302', '303', '304', '305', '306', '307',
  'Casa de Lujo (Única)'
];

export default function TimelineCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [reservas, setReservas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReservaModal, setSelectedReservaModal] = useState<any | null>(null);

  const fetchReservas = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/reservas');
      const json = await res.json();
      if (json.success && json.data) {
        const formattedReservas = json.data.map((r: any) => ({
          id: r.id,
          date: r.check_in,
          departure: r.check_out,
          guest: r.guest_name || 'Sin Nombre',
          guest_phone: r.guest_phone || null,
          room: r.room_name || r.rooms?.name || 'Habitación',
          status: r.status === 'confirmed' ? 'confirmada' : 'pendiente',
          channel: r.channel || 'Directo',
          nights: r.nights || 1,
          price_estimate: r.price_estimate || null,
        }));
        setReservas(formattedReservas);
      }
    } catch (e) {
      console.error("Error al cargar reservas", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchReservas(); }, []);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  // Timeline variables
  const startDate = startOfMonth(currentDate);
  const endDate = endOfMonth(currentDate);
  const daysInMonth = differenceInDays(endDate, startDate) + 1;
  const daysArray = Array.from({ length: daysInMonth }).map((_, i) => addDays(startDate, i));

  const CELL_WIDTH = 50; // px
  const HEADER_HEIGHT = 60; // px

  const renderBlocks = (roomName: string) => {
    const roomReservations = reservas.filter(r => r.room === roomName || r.room.includes(roomName.split(' ')[0]));
    
    return roomReservations.map(res => {
      const resStart = new Date(`${res.date}T00:00:00`);
      const resEnd = new Date(`${res.departure}T00:00:00`);
      
      if (resEnd < startDate || resStart > endDate) return null; // Fuera del mes

      const adjustedStart = resStart < startDate ? startDate : resStart;
      const adjustedEnd = resEnd > endDate ? endDate : resEnd;
      
      const leftIndex = differenceInDays(adjustedStart, startDate);
      const spanDays = differenceInDays(adjustedEnd, adjustedStart);

      if (spanDays <= 0) return null;

      const isConfirmed = res.status === 'confirmada';

      return (
        <div
          key={res.id}
          onClick={() => setSelectedReservaModal(res)}
          style={{
            position: 'absolute',
            left: `${leftIndex * CELL_WIDTH}px`,
            width: `${spanDays * CELL_WIDTH}px`,
            top: '4px',
            bottom: '4px',
            zIndex: 10,
          }}
          className="px-1"
        >
          <div className={`w-full h-full rounded-lg shadow-sm border p-1.5 overflow-hidden text-xs cursor-pointer transition-transform hover:scale-[1.02] ${
            isConfirmed ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-blue-50 border-blue-200 text-blue-700'
          }`}>
            <p className="font-bold truncate text-[10px] leading-tight">{res.guest}</p>
          </div>
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-screen max-h-screen pb-20 bg-[#fafafa] overflow-hidden">
      
      <div className="flex items-center justify-between mb-4 px-2 shrink-0">
        <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight">Timeline</h2>
        <button 
          onClick={fetchReservas} 
          disabled={isLoading}
          className={`w-8 h-8 flex items-center justify-center text-zinc-500 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg shadow-sm transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col flex-1 overflow-hidden">
        {/* Mes Control */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50 rounded-full transition-colors">
            <ChevronLeft size={18} strokeWidth={2.5}/>
          </button>
          <h2 className="text-[13px] font-semibold text-zinc-900 uppercase tracking-widest">
            {format(currentDate, 'MMMM yyyy', { locale: es })}
          </h2>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50 rounded-full transition-colors">
            <ChevronRight size={18} strokeWidth={2.5}/>
          </button>
        </div>

        {/* Timeline Container */}
        <div className="flex flex-1 overflow-hidden relative">
          
          {/* Eje Y (Habitaciones) Sticky */}
          <div className="w-24 shrink-0 border-r border-zinc-200 bg-zinc-50 flex flex-col z-20 shadow-[2px_0_10px_rgba(0,0,0,0.02)]">
            <div style={{ height: HEADER_HEIGHT }} className="border-b border-zinc-200 flex items-center justify-center bg-zinc-100 shrink-0">
              <BedDouble size={16} className="text-zinc-400" />
            </div>
            <div className="overflow-y-hidden flex-1">
              {ALL_ROOMS.map((room, i) => (
                <div key={i} className="h-14 border-b border-zinc-200 flex items-center justify-center px-1">
                  <span className="text-[10px] font-bold text-zinc-600 text-center uppercase tracking-wider truncate w-full">{room}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Eje X (Días) Scrollable */}
          <div className="flex-1 overflow-auto relative scrollbar-hide">
            {/* Cabecera de días */}
            <div 
              style={{ height: HEADER_HEIGHT, width: daysInMonth * CELL_WIDTH }} 
              className="flex border-b border-zinc-200 bg-white sticky top-0 z-10 shadow-sm"
            >
              {daysArray.map((day, i) => {
                const isToday = isSameDay(day, new Date());
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                return (
                  <div 
                    key={i} 
                    style={{ width: CELL_WIDTH }} 
                    className={`flex flex-col items-center justify-center border-r border-zinc-100 shrink-0 ${isWeekend ? 'bg-zinc-50/50' : ''}`}
                  >
                    <span className="text-[9px] font-bold uppercase text-zinc-400">{format(day, 'EEE', { locale: es }).substring(0,3)}</span>
                    <span className={`text-[13px] font-semibold mt-0.5 ${isToday ? 'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-zinc-700'}`}>
                      {format(day, 'd')}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Grid de habitaciones (Filas) */}
            <div style={{ width: daysInMonth * CELL_WIDTH }} className="relative bg-[#fafafa]">
              {ALL_ROOMS.map((room, i) => (
                <div key={i} className="h-14 border-b border-zinc-100 flex relative">
                  {/* Columnas (días) de fondo */}
                  {daysArray.map((day, j) => (
                    <div key={j} style={{ width: CELL_WIDTH }} className="h-full border-r border-zinc-100 shrink-0" />
                  ))}
                  
                  {/* Bloques de reservas */}
                  {!isLoading && renderBlocks(room)}
                </div>
              ))}
            </div>
          </div>
          
        </div>
      </div>

      {/* BOTTOM SHEET MODAL — Premium CRM */}
      {selectedReservaModal && (
        <>
          <div 
            className="fixed inset-0 bg-zinc-900/50 backdrop-blur-[2px] z-[90] transition-opacity"
            onClick={() => setSelectedReservaModal(null)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[100] bg-white rounded-t-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.12)] pb-8">
            <div className="p-6">
              <div className="w-12 h-1.5 bg-zinc-200 rounded-full mx-auto mb-5" />
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h2 className="text-[22px] font-bold text-zinc-900 tracking-tight leading-tight mb-1.5">
                    {selectedReservaModal.guest}
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider">
                      {selectedReservaModal.room}
                    </span>
                    <span className="text-[12px] font-medium text-zinc-400">· {selectedReservaModal.channel}</span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedReservaModal(null)}
                  className="w-8 h-8 flex items-center justify-center bg-zinc-100 text-zinc-500 rounded-full hover:bg-zinc-200 transition-colors"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>

              <div className="bg-[#fafafa] border border-zinc-100 rounded-2xl p-4 mb-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Estado</span>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                    selectedReservaModal.status === 'confirmada' ? 'text-emerald-600 bg-emerald-50' : 'text-blue-600 bg-blue-50'
                  }`}>
                    <CheckCircle size={13} strokeWidth={2.5} />
                    <span className="text-[12px] font-bold">{selectedReservaModal.status.toUpperCase()}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-zinc-200/60">
                  <div>
                    <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Check-in</span>
                    <span className="text-[14px] font-semibold text-zinc-900">
                      {selectedReservaModal.date ? format(new Date(selectedReservaModal.date + 'T12:00:00'), 'dd MMM yyyy', { locale: es }) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Check-out</span>
                    <span className="text-[14px] font-semibold text-zinc-900">
                      {selectedReservaModal.departure ? format(new Date(selectedReservaModal.departure + 'T12:00:00'), 'dd MMM yyyy', { locale: es }) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                {selectedReservaModal.guest_phone ? (
                  <a
                    href={`https://wa.me/${selectedReservaModal.guest_phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2.5 bg-[#25D366] text-white font-semibold text-[15px] py-3.5 rounded-2xl hover:bg-[#22C55E] transition-all active:scale-[0.98]"
                  >
                    <Phone size={16} /> WhatsApp al huésped
                  </a>
                ) : (
                  <button className="w-full flex items-center justify-center gap-2 bg-zinc-100 text-zinc-400 font-medium text-[14px] py-3.5 rounded-2xl cursor-not-allowed">
                    <Phone size={16} /> Sin número
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
