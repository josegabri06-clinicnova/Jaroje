"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, CheckCircle2, Lock, Unlock, X } from 'lucide-react';
import { getActiveEmployee, getAdminPin } from '@/lib/auth';
import { getUnitName, getRoomMetadata } from '@/lib/beds24';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const PRICES: Record<string, Record<string, number>> = {
  '679077': { baja: 1600, media: 1900, media_alta: 2000, alta: 2200 },
  '679087': { baja: 2400, media: 2850, media_alta: 3000, alta: 3300 },
  '679091': { baja: 3200, media: 3800, media_alta: 4000, alta: 4400 },
  '679092': { baja: 4800, media: 5700, media_alta: 6000, alta: 6600 },
  '679093': { baja: 6400, media: 7600, media_alta: 8000, alta: 8800 },
};

function getSeason(dateStr: string): string {
  if (!dateStr) return 'media';
  const d = new Date(dateStr + 'T12:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  if ((month === 12 && day >= 20) || (month === 1 && day <= 6)) return 'alta';
  if (month === 4 && day <= 14) return 'alta';
  if (month === 7 || month === 8) return 'media_alta';
  if (month === 11 && day <= 5) return 'media_alta';
  if (month === 12 && day < 20) return 'media_alta';
  if (month === 2 || month === 3 || month === 10 || month === 11) return 'media';
  if (month === 1 && day > 6) return 'media';
  return 'baja';
}

function getLocalDateStr(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  } catch (e) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

function getNextDayStr(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return getLocalDateStr(d);
}

function addDaysToDateStr(dateStr: string, days: number): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return getLocalDateStr(d);
}

export default function VercelActionForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'reserva' | 'bloqueo'>('reserva');
  const [loading, setLoading] = useState(false);
  
  const [todayStr, setTodayStr] = useState('');

  useEffect(() => {
    setTodayStr(getLocalDateStr());
  }, []);
  
  const [form, setForm] = useState({
    roomId: '',
    unitId: '',
    groupRooms: [] as { roomId: string; unitId: string; name: string }[],
    checkIn: '',
    checkOut: '',
    guestName: '',
    channel: 'Directo',
    price: '',
    dailyRate: '',
    deposit: '',
    phone: '',
    numAdult: 1,
    numChild: 0,
    notes: ''
  });

  const [nights, setNights] = useState<number | ''>(1);

  const [inventory, setInventory] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  const [isPriceUnlocked, setIsPriceUnlocked] = useState(false);
  const [isDailyRateEdited, setIsDailyRateEdited] = useState(false);
  const [isDepositEdited, setIsDepositEdited] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);

  // Calcular precio automático
  useEffect(() => {
    if (form.checkIn && form.checkOut) {
      const season = getSeason(form.checkIn);
      
      const diffTime = Math.abs(new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime());
      const computedNights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      
      let multiplier = 1;
      if (form.channel === 'Airbnb') multiplier = 1.25;
      if (form.channel === 'Booking.com') multiplier = 1.10;

      let calculatedDailyRate = 0;
      const group = form.groupRooms || [];
      const totalRooms = group.length > 0 ? group.length : 1;

      if (group.length > 0) {
        const gr = group[0];
        const basePrice = PRICES[gr.roomId]?.[season] || 2000;
        const priceWithChannel = Math.round(basePrice * multiplier);
        const tax = Math.round(priceWithChannel * 0.19); // 16% IVA + 3% ISH
        calculatedDailyRate = priceWithChannel + tax;
      } else if (form.roomId) {
        const basePrice = PRICES[form.roomId]?.[season] || 2000;
        const priceWithChannel = Math.round(basePrice * multiplier);
        const tax = Math.round(priceWithChannel * 0.19); // 16% IVA + 3% ISH
        calculatedDailyRate = priceWithChannel + tax;
      }

      const activeDailyRate = isDailyRateEdited ? Number(form.dailyRate) || 0 : calculatedDailyRate;
      const totalStay = activeDailyRate * computedNights * totalRooms;

      setForm(prev => {
        const nextState = { ...prev };
        if (!isDailyRateEdited) {
          nextState.dailyRate = calculatedDailyRate.toString();
        }
        nextState.price = totalStay.toString();
        if (!isDepositEdited) {
          nextState.deposit = totalStay.toString();
        }
        return nextState;
      });
    }
  }, [form.roomId, form.groupRooms, form.checkIn, form.checkOut, form.channel, form.dailyRate, isDailyRateEdited, isDepositEdited]);

  // Resetear ediciones manuales cuando cambien las habitaciones seleccionadas
  useEffect(() => {
    setIsDailyRateEdited(false);
    setIsDepositEdited(false);
    setIsPriceUnlocked(false);
  }, [form.roomId, form.unitId, form.groupRooms]);

  const handleUnlockPrice = () => {
    if (pinInput === getAdminPin()) {
      setIsPriceUnlocked(true);
      setShowPinModal(false);
      setPinInput('');
    } else {
      alert('PIN Incorrecto');
    }
  };

  useEffect(() => {
    if (form.checkIn && form.checkOut) {
      const fetchAvailability = async () => {
        setLoadingInventory(true);
        try {
          const res = await fetch(`/api/availability?checkIn=${form.checkIn}&checkOut=${form.checkOut}`);
          const data = await res.json();
          if (data.success) {
            setInventory(data.inventory);
            
            // Auto-seleccionar la primera disponible si no hay seleccionada (opcional, pero mejor dejar que elija)
          } else {
            console.error("Error fetching availability", data.error);
          }
        } catch(e) {
          console.error(e);
        } finally {
          setLoadingInventory(false);
        }
      };
      fetchAvailability();
    } else {
      setInventory([]);
    }
  }, [form.checkIn, form.checkOut]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const hasRoomSelected = (form.groupRooms && form.groupRooms.length > 0) || (form.roomId && form.unitId);
    if (!hasRoomSelected) {
      return alert("Por favor, selecciona al menos una habitación física específica.");
    }

    if (mode === 'reserva') {
      if (!form.guestName || !form.phone || !form.numAdult || Number(form.numAdult) < 1) {
        return alert("Por favor, rellene todos los campos obligatorios: Nombre del Huésped, N. Móvil y Adultos.");
      }
    }

    setLoading(true);

    try {
      const isBlock = mode === 'bloqueo';
      
      const roomsToBook = form.groupRooms && form.groupRooms.length > 0
        ? form.groupRooms
        : [{
            roomId: form.roomId,
            unitId: form.unitId,
            name: getUnitName(form.roomId, form.unitId) || form.unitId
          }];

      const totalRooms = roomsToBook.length;
      const totalPayment = isBlock ? 0 : Number(form.price || 0);
      const pricePerRoom = Math.round(totalPayment / totalRooms);
      const totalDeposit = isBlock ? 0 : Number(form.deposit || 0);
      const depositPerRoom = Math.round(totalDeposit / totalRooms);
      const roomNamesList = roomsToBook.map(r => r.name).join(', ');

      for (const room of roomsToBook) {
        const payload = {
          roomId: room.roomId,
          unitId: room.unitId,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          guestName: form.guestName,
          isBlock,
          price: pricePerRoom,
          deposit: depositPerRoom,
          phone: isBlock ? '' : form.phone,
          numAdult: isBlock ? 1 : (Number(form.numAdult) || 1),
          numChild: isBlock ? 0 : (Number(form.numChild) || 0),
          notes: isBlock ? '' : `${form.notes || ''}${totalRooms > 1 ? ` (Grupo: Habs ${roomNamesList})` : ''}`,
        };

        const bgRes = await fetch('/api/reservas', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        });
        
        const responseData = await bgRes.json();

        if (!bgRes.ok) throw new Error(responseData.error || `Error al registrar habitación ${room.name} en Beds24`);

        // Registrar auditoría rica 360 por habitación
        try {
          const emp = getActiveEmployee('recepcion');
          const employeeNum = emp?.employee_num || '999';
          const employeeName = emp?.full_name || 'Administrador';
          const employeeDept = emp?.department || 'recepcion';
          
          const roomMeta = getRoomMetadata(room.roomId, null);
          const roomDisplayName = roomMeta ? `${roomMeta.nombre} (${room.name})` : `Habitación ${room.name}`;
          
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              employee_num: employeeNum,
              employee_name: employeeName,
              department: employeeDept,
              module: 'recepcion',
              action: isBlock ? 'bloqueo_habitacion' : 'reserva_creada',
              room: room.name,
              details: JSON.stringify({
                text: isBlock 
                  ? `Aplicó bloqueo físico en ${roomDisplayName} para fechas ${form.checkIn} a ${form.checkOut}. Motivo: ${form.guestName || 'Mantenimiento'}`
                  : `Registró reserva manual de ${form.guestName || 'Huésped'} en ${roomDisplayName} desde ${form.checkIn} a ${form.checkOut} por $${pricePerRoom} (Anticipo: $${depositPerRoom}) vía ${form.channel}${totalRooms > 1 ? ` (Grupo: Habs ${roomNamesList})` : ''}`,
                reserva: {
                  guestName: form.guestName || (isBlock ? 'Bloqueo' : 'Reserva Directa'),
                  roomId: room.roomId,
                  unitId: room.unitId,
                  roomName: roomDisplayName,
                  checkIn: form.checkIn,
                  checkOut: form.checkOut,
                  price: pricePerRoom,
                  deposit: depositPerRoom,
                  channel: form.channel,
                  isBlock
                }
              })
            })
          });
        } catch (logErr) {
          console.error("Error registrando log de reserva/bloqueo:", logErr);
        }
      }

      alert(mode === 'reserva' 
        ? '¡Éxito! Reserva(s) conectada(s) hacia Beds24 y confirmada(s) en la(s) unidad(es) seleccionada(s).' 
        : '¡Éxito! Bloqueo(s) aplicado(s) en la(s) unidad(es) seleccionada(s).');
      
      router.push('/reservas');
    } catch (err: any) {
      alert(`Fallo en el intento:\n\n${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-24 bg-[#fafafa] min-h-screen">
      
      <div className="mb-6 border-b border-zinc-200/80 pb-4">
        <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight leading-tight">Gestión Inmediata</h2>
        <p className="text-[13px] font-medium text-zinc-500 mt-1">Registra o bloquea disponibilidad en unidades específicas.</p>
      </div>

      {/* Segmented Control */}
      <div className="flex p-0.5 bg-zinc-200/50 rounded-xl mb-6 shadow-inner">
        <button 
          type="button"
          onClick={() => setMode('reserva')}
          className={`flex-1 py-2.5 text-[13px] font-semibold rounded-[10px] transition-all duration-200 ${
            mode === 'reserva' ? 'bg-white text-zinc-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Reserva Directa
        </button>
        <button 
          type="button"
          onClick={() => setMode('bloqueo')}
          className={`flex-1 py-2.5 text-[13px] font-semibold rounded-[10px] transition-all duration-200 ${
            mode === 'bloqueo' ? 'bg-white text-rose-600 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Forzar Bloqueo
        </button>
      </div>

      {mode === 'bloqueo' && (
        <div className="bg-rose-50/50 border border-rose-200/60 p-4 rounded-2xl flex items-start gap-3 mb-6 shadow-[0_2px_8px_rgba(225,29,72,0.02)]">
          <ShieldAlert className="text-rose-600 mt-0.5 shrink-0" size={16} strokeWidth={2.5}/>
          <p className="text-[12px] text-rose-900 font-medium leading-relaxed">
            <strong className="block mb-0.5 text-[13px] font-semibold">Bloqueo Físico de Unidad</strong>
            Esto cerrará la habitación exacta seleccionada, impidiendo reservas online para esa unidad.
          </p>
        </div>
      )}

      {mode === 'reserva' && (
        <div className="bg-zinc-100/50 border border-zinc-200/60 p-3.5 rounded-2xl flex items-center gap-3 mb-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <CheckCircle2 className="text-zinc-700 shrink-0" size={16} strokeWidth={2.5}/>
          <p className="text-[12px] text-zinc-600 font-medium">Beds24 asignará esta reserva exactamente al número de habitación que elijas.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-zinc-200/80 p-5 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-5">
        
        {/* Fechas (Primero, para poder cargar disponibilidad) */}
        <div className="grid grid-cols-2 gap-3.5 w-full">
          <div className="flex-1 min-w-0 space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Check-In</label>
            <input 
              key={todayStr ? `checkin-${todayStr}` : 'checkin-loading'}
              type="date" 
              required
              min={todayStr}
              className="w-full min-w-0 max-w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl px-2.5 py-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none block"
              value={form.checkIn}
              onChange={e => {
                let newCheckIn = e.target.value;
                if (newCheckIn && newCheckIn < todayStr) {
                  newCheckIn = todayStr;
                }
                const newCheckOut = addDaysToDateStr(newCheckIn, Number(nights) || 1);
                setForm({...form, checkIn: newCheckIn, checkOut: newCheckOut, roomId: '', unitId: '', groupRooms: []});
              }}
            />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Noches</label>
            <input 
              type="number" 
              required
              min={1}
              className="w-full min-w-0 max-w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl px-2.5 py-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none block"
              value={nights}
              onChange={e => {
                const val = e.target.value;
                if (val === '') {
                  setNights('');
                  return;
                }
                const num = Number(val);
                if (isNaN(num)) return;
                setNights(num);
                if (form.checkIn) {
                  const newCheckOut = addDaysToDateStr(form.checkIn, num);
                  setForm(prev => ({ ...prev, checkOut: newCheckOut, roomId: '', unitId: '', groupRooms: [] }));
                }
              }}
              onBlur={() => {
                const num = Math.max(1, Number(nights) || 1);
                setNights(num);
                if (form.checkIn) {
                  const newCheckOut = addDaysToDateStr(form.checkIn, num);
                  setForm(prev => ({ ...prev, checkOut: newCheckOut, roomId: '', unitId: '', groupRooms: [] }));
                }
              }}
            />
          </div>
        </div>

        {form.checkOut && (
          <div className="text-[12px] font-medium text-zinc-500 bg-zinc-50 border border-zinc-200/60 p-3.5 rounded-xl flex items-center gap-2 animate-in fade-in duration-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-zinc-400">Check-Out (Salida):</span>
            <span className="font-bold text-zinc-800">
              {format(parseISO(form.checkOut), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
            </span>
          </div>
        )}

        {/* Mapa Visual de Habitaciones */}
        {form.checkIn && form.checkOut && (
          <div className="space-y-3 pt-2">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Seleccionar Habitación</label>
            
            {loadingInventory ? (
              <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin"></div></div>
            ) : inventory.length > 0 ? (
              <div className="space-y-4">
                {inventory.map((roomGroup: any) => (
                  <div key={roomGroup.roomId} className="bg-zinc-50 border border-zinc-200/60 rounded-xl p-3">
                    <h4 className="text-[12px] font-bold text-zinc-700 mb-2">{roomGroup.name}</h4>
                    <div className="flex flex-wrap gap-2">
                      {roomGroup.units.map((u: any) => {
                        const isSelected = form.groupRooms?.some(gr => gr.roomId === roomGroup.roomId && gr.unitId === u.unitId) || (form.roomId === roomGroup.roomId && form.unitId === u.unitId);
                        return (
                          <button
                            key={u.unitId}
                            type="button"
                            disabled={!u.isAvailable}
                            onClick={() => {
                              const currentGroup = form.groupRooms || [];
                              let baseGroup = currentGroup;
                              if (baseGroup.length === 0 && form.roomId && form.unitId) {
                                baseGroup = [{
                                  roomId: form.roomId,
                                  unitId: form.unitId,
                                  name: getUnitName(form.roomId, form.unitId) || form.unitId
                                }];
                              }

                              const exists = baseGroup.some(gr => gr.roomId === roomGroup.roomId && gr.unitId === u.unitId);
                              let newGroup;
                              if (exists) {
                                newGroup = baseGroup.filter(gr => !(gr.roomId === roomGroup.roomId && gr.unitId === u.unitId));
                              } else {
                                newGroup = [...baseGroup, { roomId: roomGroup.roomId, unitId: u.unitId, name: u.name }];
                              }

                              const last = newGroup[newGroup.length - 1];
                              setForm({
                                ...form,
                                groupRooms: newGroup,
                                roomId: last ? last.roomId : '',
                                unitId: last ? last.unitId : ''
                              });
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                              !u.isAvailable 
                                ? 'bg-zinc-200/50 text-zinc-400 cursor-not-allowed line-through' 
                                : isSelected
                                  ? 'bg-zinc-900 text-white shadow-md scale-105'
                                  : 'bg-white border border-zinc-200 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100'
                            }`}
                          >
                            {u.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {form.groupRooms && form.groupRooms.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200/60 rounded-xl p-3 space-y-1.5 animate-in fade-in duration-200">
                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest block">Habitaciones Seleccionadas ({form.groupRooms.length})</span>
                    <div className="flex flex-wrap gap-1.5">
                      {form.groupRooms.map(gr => (
                        <span key={`${gr.roomId}_${gr.unitId}`} className="px-2.5 py-1 bg-white border border-blue-200 text-blue-800 text-[11px] font-black rounded-lg shadow-sm flex items-center gap-1">
                          {gr.name}
                          <button
                            type="button"
                            onClick={() => {
                              const newGroup = form.groupRooms!.filter(x => !(x.roomId === gr.roomId && x.unitId === gr.unitId));
                              const last = newGroup[newGroup.length - 1];
                              setForm({
                                ...form,
                                groupRooms: newGroup,
                                roomId: last ? last.roomId : '',
                                unitId: last ? last.unitId : ''
                              });
                            }}
                            className="w-3.5 h-3.5 rounded-full hover:bg-zinc-100 flex items-center justify-center text-blue-500 hover:text-blue-700 transition-colors"
                          >
                            <X size={10} strokeWidth={3} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
               <div className="text-[13px] text-zinc-500 bg-zinc-50 p-4 rounded-xl border border-zinc-200">No hay disponibilidad o revisa las fechas.</div>
            )}
          </div>
        )}

        {/* Cliente / Motivo */}
        {form.unitId && (
          <div className="space-y-5 pt-2 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">
                {mode === 'reserva' ? 'Huésped' : 'Motivo / Nota Interna'}
              </label>
              <input 
                type="text" 
                required
                placeholder={mode === 'reserva' ? "Nombre completo" : "Ej: Mantenimiento"}
                className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none placeholder:font-medium placeholder:text-zinc-400"
                value={form.guestName}
                onChange={e => setForm({...form, guestName: e.target.value})}
              />
            </div>

            {/* Extra Form Fields for Reserva only */}
            {mode === 'reserva' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">N. Móvil</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ej. +52 55 1234 5678"
                    className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none placeholder:font-medium placeholder:text-zinc-400"
                    value={form.phone}
                    onChange={e => setForm({...form, phone: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Adultos</label>
                    <input 
                      type="number" 
                      required
                      min={1}
                      className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none"
                      value={form.numAdult}
                      onChange={e => {
                        const val = e.target.value;
                        setForm({...form, numAdult: val === '' ? '' : Math.max(1, Number(val)) as any});
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Niños</label>
                    <input 
                      type="number" 
                      required
                      min={0}
                      className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none"
                      value={form.numChild}
                      onChange={e => {
                        const val = e.target.value;
                        setForm({...form, numChild: val === '' ? '' : Math.max(0, Number(val)) as any});
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Nota / Comentarios (Opcional)</label>
                  <textarea 
                    placeholder="Ej. Requiere factura, check-in temprano..."
                    className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none placeholder:font-medium placeholder:text-zinc-400 h-20 resize-none"
                    value={form.notes}
                    onChange={e => setForm({...form, notes: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5 pt-1">
                  {/* Origen */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Origen</label>
                    <div className="relative">
                      <select 
                        className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none appearance-none cursor-pointer"
                        value={form.channel}
                        onChange={e => {
                          setForm({...form, channel: e.target.value});
                          if (e.target.value === 'Recepción') {
                            setIsPriceUnlocked(false);
                          }
                        }}
                      >
                        <option value="Directo">Directo Web</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Recepción">Walk-in Recepción</option>
                        <option value="Airbnb">Airbnb</option>
                        <option value="Booking.com">Booking.com</option>
                      </select>
                    </div>
                  </div>

                  {/* Tarifa Diaria */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center pr-1">
                      <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Tarifa Diaria (x Hab)</label>
                      {form.channel === 'Recepción' && (
                        <button 
                          type="button" 
                          onClick={() => isPriceUnlocked ? setIsPriceUnlocked(false) : setShowPinModal(true)}
                          className="text-[10px] font-bold text-blue-600 flex items-center gap-1"
                        >
                          {isPriceUnlocked ? <Unlock size={12} /> : <Lock size={12} />}
                          {isPriceUnlocked ? 'Bloquear' : 'Modificar'}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                      <input 
                        type="number" 
                        placeholder="0.00"
                        readOnly={form.channel === 'Recepción' && !isPriceUnlocked}
                        className={`w-full border rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none ${
                          (form.channel !== 'Recepción' || isPriceUnlocked)
                            ? 'bg-white border-blue-400 focus:ring-4 focus:ring-blue-900/10 text-zinc-900 shadow-sm' 
                            : 'bg-zinc-100 border-zinc-200/80 text-zinc-650 cursor-not-allowed'
                        }`}
                        value={form.dailyRate}
                        onChange={e => {
                          setIsDailyRateEdited(true);
                          setForm({...form, dailyRate: e.target.value});
                        }}
                      />
                    </div>
                  </div>

                  {/* Anticipo */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Anticipo</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                      <input 
                        type="number" 
                        placeholder="0.00"
                        className="w-full bg-white border border-blue-400 focus:ring-4 focus:ring-blue-900/10 text-zinc-900 shadow-sm rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none"
                        value={form.deposit}
                        onChange={e => {
                          setIsDepositEdited(true);
                          setForm({...form, deposit: e.target.value});
                        }}
                      />
                    </div>
                  </div>

                  {/* Tarifa Total */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Tarifa Total</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                      <input 
                        type="number" 
                        placeholder="0.00"
                        readOnly
                        className="w-full bg-zinc-100 border border-zinc-200/80 text-zinc-650 cursor-not-allowed rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none"
                        value={form.price}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Modal PIN */}
            {showPinModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-zinc-900 flex items-center gap-2"><Lock size={18} className="text-blue-600" /> Desbloquear Tarifa</h3>
                    <button type="button" onClick={() => setShowPinModal(false)} className="text-zinc-400 hover:text-zinc-900">
                      <ShieldAlert size={20} />
                    </button>
                  </div>
                  <p className="text-[13px] text-zinc-500 mb-4">Introduce el PIN de administrador para aplicar descuentos o modificar la tarifa calculada por Beds24.</p>
                  <input 
                    type="password"
                    maxLength={4}
                    placeholder="****"
                    value={pinInput}
                    onChange={e => setPinInput(e.target.value)}
                    className="w-full text-center tracking-[1em] font-mono text-2xl bg-zinc-50 border border-zinc-200 rounded-xl py-3 mb-4 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 outline-none"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowPinModal(false)} className="flex-1 py-3 text-[14px] font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors">Cancelar</button>
                    <button type="button" onClick={handleUnlockPrice} className="flex-1 py-3 text-[14px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-md shadow-blue-600/20">Desbloquear</button>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button 
                type="submit" 
                disabled={loading || (mode === 'reserva' && (!form.guestName || !form.phone || !((form.groupRooms && form.groupRooms.length > 0) || (form.roomId && form.unitId))))}
                className={`w-full font-semibold text-[15px] p-3.5 rounded-xl transition-all shadow-sm flex justify-center items-center active:scale-[0.98] ${
                  mode === 'reserva' 
                    ? 'bg-zinc-900 hover:bg-black text-white' 
                    : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                }`}
              >
                {loading ? 'Procesando...' : (mode === 'reserva' ? 'Registrar y Asignar Unidad' : 'Aplicar Bloqueo Físico')}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
