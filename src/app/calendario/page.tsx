"use client";

import { useState, useEffect, useMemo } from 'react';
import { format, addDays, subDays, isToday, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, RefreshCw, CalendarDays, UserPlus, X, BedDouble, ArrowDownLeft, ArrowUpRight, Moon, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';

// ─── ROOM STRUCTURE ──────────────────────────────────────────────────────────
const ROOM_GROUPS = [
  { label: 'Estándar', color: '#6366f1', bg: '#eef2ff', rooms: ['301','302','303','304','305','306'] },
  { label: 'Condo 2R', color: '#0ea5e9', bg: '#f0f9ff', rooms: ['201','202','203','204','205','206'] },
  { label: 'Condo 3R', color: '#f59e0b', bg: '#fffbeb', rooms: ['101','102','103','104','105','106','107'] },
  { label: 'Condo 1R', color: '#10b981', bg: '#f0fdf4', rooms: ['401'] },
  { label: 'Casa Lujo', color: '#ec4899', bg: '#fdf4ff', rooms: ['402'] },
];

const ALL_ROOMS = ROOM_GROUPS.flatMap(g => g.rooms);

const ROOM_TO_BEDS24: Record<string, { roomId: string; unitId: string }> = {
  '301': { roomId: '679077', unitId: '1' }, '302': { roomId: '679077', unitId: '2' },
  '303': { roomId: '679077', unitId: '3' }, '304': { roomId: '679077', unitId: '4' },
  '305': { roomId: '679077', unitId: '5' }, '306': { roomId: '679077', unitId: '6' },
  '401': { roomId: '679087', unitId: '1' },
  '201': { roomId: '679091', unitId: '1' }, '202': { roomId: '679091', unitId: '2' },
  '203': { roomId: '679091', unitId: '3' }, '204': { roomId: '679091', unitId: '4' },
  '205': { roomId: '679091', unitId: '5' }, '206': { roomId: '679091', unitId: '6' },
  '101': { roomId: '679092', unitId: '1' }, '102': { roomId: '679092', unitId: '2' },
  '103': { roomId: '679092', unitId: '3' }, '104': { roomId: '679092', unitId: '4' },
  '105': { roomId: '679092', unitId: '5' }, '106': { roomId: '679092', unitId: '6' },
  '107': { roomId: '679092', unitId: '7' },
  '402': { roomId: '679093', unitId: '1' },
};

const COLS = 10; // days to show

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function roomGroupOf(room: string) {
  return ROOM_GROUPS.find(g => g.rooms.includes(room));
}

function getBookingForRoomDay(
  reservas: any[],
  room: string,
  dayStr: string
): any | null {
  return reservas.find(r => {
    const roomMatch = (r.room_name || '').includes(room);
    return roomMatch && r.check_in <= dayStr && r.check_out > dayStr;
  }) || null;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const router = useRouter();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [reservas, setReservas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReserva, setSelectedReserva] = useState<any | null>(null);
  const [panelRoom, setPanelRoom] = useState<{ room: string; date: Date } | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/reservas');
      const json = await res.json();
      if (json.success) setReservas(json.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Lock body scroll when any panel is open
  const panelOpen = !!selectedReserva || !!panelRoom;
  useEffect(() => {
    if (panelOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.classList.add('panel-open');
      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.classList.remove('panel-open');
      };
    }
  }, [panelOpen]);

  // Build date columns
  const days = useMemo(() =>
    Array.from({ length: COLS }, (_, i) => addDays(startDate, i)),
    [startDate]
  );

  const dayStrings = useMemo(() => days.map(d => format(d, 'yyyy-MM-dd')), [days]);

  const goBack = () => setStartDate(d => subDays(d, 7));
  const goForward = () => setStartDate(d => addDays(d, 7));
  const goToday = () => { const d = new Date(); d.setHours(0,0,0,0); setStartDate(d); };

  const handleWalkIn = (room: string, date: Date) => {
    const b = ROOM_TO_BEDS24[room];
    if (!b) return;
    router.push(`/recepcion?walkin=true&room=${b.roomId}&unit=${b.unitId}&date=${format(date, 'yyyy-MM-dd')}`);
  };

  // ── Stats strip ───────────────────────────────────────────────────────────
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayArrivals = reservas.filter(r => r.check_in === todayStr).length;
  const todayDepartures = reservas.filter(r => r.check_out === todayStr).length;
  const todayActive = reservas.filter(r => r.check_in <= todayStr && r.check_out > todayStr).length;

  return (
    <div className="pb-28 bg-[#f8f8fa] min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[22px] font-bold text-zinc-900 tracking-tight">Disponibilidad</h2>
          <p className="text-[13px] font-medium text-zinc-500">
            {isLoading ? 'Sincronizando...' : `${reservas.length} reservas · Vista semanal`}
          </p>
        </div>
        <button onClick={fetchData} disabled={isLoading}
          className="w-9 h-9 flex items-center justify-center bg-white border border-zinc-200 rounded-xl shadow-sm hover:bg-zinc-50 active:scale-95 transition-all">
          <RefreshCw size={15} className={`text-zinc-500 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Today summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
          <p className="text-[20px] font-bold text-emerald-700">{todayArrivals}</p>
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Llegan hoy</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
          <p className="text-[20px] font-bold text-blue-700">{todayActive}</p>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">En casa</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
          <p className="text-[20px] font-bold text-amber-700">{todayDepartures}</p>
          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Salen hoy</p>
        </div>
      </div>

      {/* Nav controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={goBack}
            className="w-8 h-8 flex items-center justify-center bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 active:scale-95 transition-all shadow-sm">
            <ChevronLeft size={16} className="text-zinc-600" />
          </button>
          <button onClick={goForward}
            className="w-8 h-8 flex items-center justify-center bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 active:scale-95 transition-all shadow-sm">
            <ChevronRight size={16} className="text-zinc-600" />
          </button>
        </div>
        <span className="text-[13px] font-bold text-zinc-700 capitalize">
          {format(startDate, "d MMM", { locale: es })} — {format(days[COLS - 1], "d MMM yyyy", { locale: es })}
        </span>
        <button onClick={goToday}
          className="text-[12px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 active:scale-95 transition-all">
          Hoy
        </button>
      </div>

      {/* ── GANTT GRID ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">

        {/* Date header row */}
        <div className="flex border-b border-zinc-100">
          {/* Room label column header */}
          <div className="w-[52px] shrink-0 border-r border-zinc-100 bg-zinc-50" />
          {/* Day columns */}
          <div className="flex-1 grid overflow-x-auto" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(38px, 1fr))` }}>
            {days.map((d, i) => {
              const today = isToday(d);
              return (
                <div key={i} className={`text-center py-2 border-r border-zinc-100 last:border-r-0 ${today ? 'bg-blue-50' : ''}`}>
                  <p className={`text-[9px] font-bold uppercase tracking-wide ${today ? 'text-blue-600' : 'text-zinc-400'}`}>
                    {format(d, 'EEE', { locale: es }).slice(0, 2)}
                  </p>
                  <p className={`text-[13px] font-bold leading-tight ${today ? 'text-blue-600' : 'text-zinc-800'}`}>
                    {format(d, 'd')}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Room rows grouped by category */}
        {ROOM_GROUPS.map(group => (
          <div key={group.label}>
            {/* Group header */}
            <div className="flex border-b border-zinc-100 bg-zinc-50/70">
              <div
                className="w-[52px] shrink-0 border-r border-zinc-100 flex items-center justify-center py-1.5"
                style={{ backgroundColor: group.bg }}
              >
                <span className="text-[8px] font-black uppercase tracking-wider" style={{ color: group.color }}>
                  {group.label.replace(' ', '\n')}
                </span>
              </div>
              <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(38px, 1fr))` }}>
                {days.map((_, i) => (
                  <div key={i} className={`border-r border-zinc-100 last:border-r-0 h-6 ${isToday(days[i]) ? 'bg-blue-50/40' : ''}`} />
                ))}
              </div>
            </div>

            {/* Rooms in group */}
            {group.rooms.map(room => (
              <div key={room} className="flex border-b border-zinc-100 last:border-b-0">
                {/* Room label */}
                <div
                  className="w-[52px] shrink-0 border-r border-zinc-100 flex items-center justify-center"
                  style={{ backgroundColor: group.bg + '80' }}
                >
                  <span className="text-[11px] font-black" style={{ color: group.color }}>{room}</span>
                </div>

                {/* Day cells */}
                <div
                  className="flex-1 grid"
                  style={{ gridTemplateColumns: `repeat(${COLS}, minmax(38px, 1fr))` }}
                >
                  {dayStrings.map((ds, i) => {
                    const booking = getBookingForRoomDay(reservas, room, ds);
                    const isArrival = booking?.check_in === ds;
                    const isDeparture = booking?.check_out === ds;
                    const todayCol = isToday(days[i]);

                    if (booking) {
                      return (
                        <div
                          key={ds}
                          onClick={() => setSelectedReserva(booking)}
                          className="border-r border-zinc-100 last:border-r-0 h-9 px-0.5 py-1 cursor-pointer relative"
                          style={{ backgroundColor: todayCol ? '#eff6ff' : undefined }}
                        >
                          <div
                            className="h-full rounded flex items-center px-1 overflow-hidden"
                            style={{
                              backgroundColor: group.color + '22',
                              borderLeft: isArrival ? `3px solid ${group.color}` : undefined,
                              borderRight: isDeparture ? `3px solid ${group.color}88` : undefined,
                            }}
                          >
                            {isArrival && (
                              <span className="text-[8px] font-black truncate" style={{ color: group.color }}>
                                {booking.guest_name?.split(' ')[0]}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Free cell — clickable for Walk-in
                    return (
                      <div
                        key={ds}
                        onClick={() => setPanelRoom({ room, date: days[i] })}
                        className={`border-r border-zinc-100 last:border-r-0 h-9 flex items-center justify-center cursor-pointer group transition-colors ${
                          todayCol ? 'bg-blue-50/40 hover:bg-blue-100/60' : 'hover:bg-emerald-50'
                        }`}
                      >
                        <UserPlus
                          size={10}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: group.color }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 px-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#6366f122', borderLeft: '3px solid #6366f1' }} />
          <span className="text-[11px] font-semibold text-zinc-500">Llegada</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-zinc-100 flex items-center justify-center">
            <UserPlus size={8} className="text-emerald-500" />
          </div>
          <span className="text-[11px] font-semibold text-zinc-500">Libre · pulsa para Walk-in</span>
        </div>
      </div>

      {/* ── RESERVATION DETAIL PANEL ─────────────────────────────────────── */}
      {selectedReserva && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/50" style={{ backdropFilter: 'blur(6px)' }} onClick={() => setSelectedReserva(null)} />
          <div
            className="fixed left-0 right-0 z-[210] bg-white rounded-t-3xl shadow-2xl flex flex-col"
            style={{ bottom: 0, maxHeight: '90svh', paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
          >
            <div className="px-6 pt-5 pb-4 border-b border-zinc-100 flex-shrink-0">
              <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-4" />
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-[18px] font-bold text-zinc-900">{selectedReserva.guest_name}</h3>
                  <p className="text-[13px] text-zinc-500 font-medium mt-0.5">{selectedReserva.room_name}</p>
                </div>
                <button onClick={() => setSelectedReserva(null)} className="w-8 h-8 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors">
                  <X size={15} className="text-zinc-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-1 flex items-center gap-1"><ArrowDownLeft size={10} />Check-in</p>
                  <p className="text-[14px] font-bold text-zinc-900">{selectedReserva.check_in}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-1 flex items-center gap-1"><ArrowUpRight size={10} />Check-out</p>
                  <p className="text-[14px] font-bold text-zinc-900">{selectedReserva.check_out}</p>
                </div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-2.5">
                {selectedReserva.guest_phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={13} className="text-zinc-400 shrink-0" />
                    <span className="text-[13px] font-semibold text-zinc-800">{selectedReserva.guest_phone}</span>
                  </div>
                )}
                {selectedReserva.nights && (
                  <div className="flex items-center gap-2">
                    <Moon size={13} className="text-zinc-400 shrink-0" />
                    <span className="text-[13px] font-semibold text-zinc-800">{selectedReserva.nights} noches</span>
                  </div>
                )}
                {selectedReserva.channel && (
                  <div className="flex items-center gap-2">
                    <CalendarDays size={13} className="text-zinc-400 shrink-0" />
                    <span className="text-[13px] font-semibold text-zinc-800">{selectedReserva.channel}</span>
                  </div>
                )}
                {selectedReserva.price_estimate && (
                  <div className="flex items-center gap-2">
                    <BedDouble size={13} className="text-zinc-400 shrink-0" />
                    <span className="text-[13px] font-semibold text-emerald-600">
                      ${selectedReserva.price_estimate.toLocaleString()} MXN total
                    </span>
                  </div>
                )}
              </div>
              {selectedReserva.notes && (
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Notas</p>
                  <p className="text-[13px] text-zinc-700">{selectedReserva.notes}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── WALK-IN CONFIRM PANEL ─────────────────────────────────────────── */}
      {panelRoom && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/50" style={{ backdropFilter: 'blur(6px)' }} onClick={() => setPanelRoom(null)} />
          <div
            className="fixed left-0 right-0 z-[210] bg-white rounded-t-3xl shadow-2xl flex flex-col"
            style={{ bottom: 0, maxHeight: '50svh', paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
          >
            <div className="px-6 pt-5 pb-4 border-b border-zinc-100 flex-shrink-0">
              <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[17px] font-bold text-zinc-900">Habitación libre</h3>
                  <p className="text-[13px] text-zinc-500 font-medium mt-0.5">
                    {panelRoom.room} · {format(panelRoom.date, "EEEE d 'de' MMMM", { locale: es })}
                  </p>
                </div>
                <button onClick={() => setPanelRoom(null)} className="w-8 h-8 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors">
                  <X size={15} className="text-zinc-500" />
                </button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3">
              <button
                onClick={() => { handleWalkIn(panelRoom.room, panelRoom.date); setPanelRoom(null); }}
                className="w-full py-4 bg-zinc-900 hover:bg-black text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-[15px]"
              >
                <UserPlus size={18} />
                Registrar Walk-in aquí
              </button>
              <button
                onClick={() => setPanelRoom(null)}
                className="w-full py-3 text-zinc-500 font-semibold text-[14px]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
