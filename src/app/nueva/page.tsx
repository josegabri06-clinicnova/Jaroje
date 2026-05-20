"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, CheckCircle2, Lock, Unlock } from 'lucide-react';

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
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextDayStr(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return getLocalDateStr(d);
}

export default function VercelActionForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'reserva' | 'bloqueo'>('reserva');
  const [loading, setLoading] = useState(false);
  const todayStr = useMemo(() => getLocalDateStr(), []);
  
  const [form, setForm] = useState({
    roomId: '',
    unitId: '',
    checkIn: '',
    checkOut: '',
    guestName: '',
    channel: 'Directo',
    price: ''
  });

  const [inventory, setInventory] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  const [isPriceUnlocked, setIsPriceUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);

  // Calcular precio automático
  useEffect(() => {
    if (form.roomId && form.checkIn && form.checkOut && !isPriceUnlocked) {
      const season = getSeason(form.checkIn);
      const basePrice = PRICES[form.roomId]?.[season] || 0;
      
      const diffTime = Math.abs(new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime());
      const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      
      let multiplier = 1;
      if (form.channel === 'Airbnb') multiplier = 1.25;
      if (form.channel === 'Booking.com') multiplier = 1.10;

      const priceWithChannel = Math.round(basePrice * multiplier);
      const tax = Math.round(priceWithChannel * 0.19); // 16% IVA + 3% ISH
      const totalPerNight = priceWithChannel + tax;
      const totalStay = totalPerNight * nights;

      setForm(prev => ({ ...prev, price: totalStay.toString() }));
    }
  }, [form.roomId, form.checkIn, form.checkOut, form.channel, isPriceUnlocked]);

  const handleUnlockPrice = () => {
    if (pinInput === '1234') { // PIN Hardcodeado o del env
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
    
    if (!form.roomId || !form.unitId) {
      return alert("Por favor, selecciona una habitación física específica.");
    }

    setLoading(true);

    try {
      const isBlock = mode === 'bloqueo';
      const payload = {
        roomId: form.roomId,
        unitId: form.unitId,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        guestName: form.guestName,
        isBlock,
      };

      const bgRes = await fetch('/api/reservas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      
      const responseData = await bgRes.json();

      if (!bgRes.ok) throw new Error(responseData.error || 'Error al conectar con Beds24');

      alert(mode === 'reserva' 
        ? '¡Éxito! Reserva conectada hacia Beds24 y confirmada en la unidad seleccionada.' 
        : '¡Éxito! Bloqueo aplicado en la unidad seleccionada.');
      
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
        <div className="grid grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Check-In</label>
            <input 
              type="date" 
              required
              min={todayStr}
              className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none block"
              value={form.checkIn}
              onChange={e => {
                const newCheckIn = e.target.value;
                let newCheckOut = form.checkOut;
                if (form.checkOut && form.checkOut <= newCheckIn) {
                  newCheckOut = getNextDayStr(newCheckIn);
                }
                setForm({...form, checkIn: newCheckIn, checkOut: newCheckOut, roomId: '', unitId: ''});
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Check-Out</label>
            <input 
              type="date" 
              required
              min={form.checkIn ? getNextDayStr(form.checkIn) : getNextDayStr(todayStr)}
              className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none block"
              value={form.checkOut}
              onChange={e => {
                setForm({...form, checkOut: e.target.value, roomId: '', unitId: ''});
              }}
            />
          </div>
        </div>

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
                        const isSelected = form.roomId === roomGroup.roomId && form.unitId === u.unitId;
                        return (
                          <button
                            key={u.unitId}
                            type="button"
                            disabled={!u.isAvailable}
                            onClick={() => setForm({ ...form, roomId: roomGroup.roomId, unitId: u.unitId })}
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
              <div className="grid grid-cols-2 gap-3.5 pt-1">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Origen</label>
                  <div className="relative">
                    <select 
                      className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none appearance-none"
                      value={form.channel}
                      onChange={e => setForm({...form, channel: e.target.value})}
                    >
                      <option value="Directo">Directo Web</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Recepción">Walk-in Recepción</option>
                      <option value="Airbnb">Airbnb</option>
                      <option value="Booking.com">Booking.com</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center pr-1">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Tarifa Total</label>
                    <button 
                      type="button" 
                      onClick={() => isPriceUnlocked ? setIsPriceUnlocked(false) : setShowPinModal(true)}
                      className="text-[10px] font-bold text-blue-600 flex items-center gap-1"
                    >
                      {isPriceUnlocked ? <Unlock size={12} /> : <Lock size={12} />}
                      {isPriceUnlocked ? 'Bloquear' : 'Modificar'}
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                    <input 
                      type="number" 
                      placeholder="0.00"
                      readOnly={!isPriceUnlocked}
                      className={`w-full border rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none ${
                        isPriceUnlocked 
                          ? 'bg-white border-blue-400 focus:ring-4 focus:ring-blue-900/10 text-zinc-900 shadow-sm' 
                          : 'bg-zinc-100 border-zinc-200/80 text-zinc-600 cursor-not-allowed'
                      }`}
                      value={form.price}
                      onChange={e => setForm({...form, price: e.target.value})}
                    />
                  </div>
                </div>
              </div>
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
                disabled={loading}
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
