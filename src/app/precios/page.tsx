"use client";

import { useState, useEffect } from 'react';
import { 
  Calculator, Zap, Check, AlertCircle, RefreshCw, X, Tag, Percent, CalendarDays, Trash2, Calendar, Save
} from 'lucide-react';

export default function PreciosPage() {
  // Beds24 direct pricing state
  const [beds24Loading, setBeds24Loading] = useState(false);
  const [beds24Rooms, setBeds24Rooms] = useState<any[]>([]); // rooms con precios del calendario
  const [beds24Multipliers, setBeds24Multipliers] = useState({ airbnb: 1.20, booking: 1.35 });
  const [beds24Error, setBeds24Error] = useState<string | null>(null);

  // Key format: `${roomId}_${seasonId}` — permite editar cada bloque de temporada por separado
  const [editedSeasonPrices, setEditedSeasonPrices] = useState<Record<string, string>>({});  
  const [savingSeasonKey, setSavingSeasonKey] = useState<string | null>(null);
  const [expandedLos, setExpandedLos] = useState<Record<string, boolean>>({}); // roomId → expandido

  const [capacitySettings, setCapacitySettings] = useState<Record<string, any>>({});
  const [savingCapacity, setSavingCapacity] = useState(false);

  // Cargar precios del calendario de Beds24 (Daily Prices)
  const loadBeds24Prices = async () => {
    setBeds24Loading(true);
    setBeds24Error(null);
    try {
      const res = await fetch('/api/beds24-prices?t=' + Date.now());
      const json = await res.json();
      if (!json.success) {
        setBeds24Error(json.error === 'TOKEN_EXPIRED'
          ? 'Token de Beds24 caducado. Regenera uno en Beds24 > Marketplace > API.'
          : json.error || 'Error al cargar precios de Beds24');
        return;
      }
      setBeds24Rooms(json.rooms || []);
      if (json.multipliers) {
        setBeds24Multipliers(json.multipliers);
      }
      if (json.capacitySettings) {
        setCapacitySettings({
          'extra_guest_price': 500,
          ...json.capacitySettings
        });
      } else {
        setCapacitySettings({
          '679077': { base: 4, max: 4 },
          '679087': { base: 4, max: 4 },
          '679091': { base: 6, max: 8 },
          '679092': { base: 10, max: 12 },
          '679093': { base: 12, max: 16 },
          '685542': { base: 2, max: 2 },
          '685542_501': { base: 4, max: 4 },
          'extra_guest_price': 500,
        });
      }
    } catch (err: any) {
      setBeds24Error('Error de red: ' + err.message);
    } finally {
      setBeds24Loading(false);
    }
  };

  const handleSaveCapacitySettings = async () => {
    setSavingCapacity(true);
    try {
      const res = await fetch('/api/beds24-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capacitySettings
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Error al guardar');
      alert('✅ Capacidades de habitaciones actualizadas con éxito.');
    } catch (err: any) {
      alert('Error al guardar capacidades: ' + err.message);
    } finally {
      setSavingCapacity(false);
    }
  };

  /**
   * Guarda el precio para todos los bloques de una temporada a la vez en Beds24.
   */
  const handleSaveBeds24SeasonPrice = async (params: {
    roomId: string;
    roomName: string;
    seasonId: string;
    seasonLabel: string;
    ranges: { from: string; to: string }[];
  }) => {
    const key = `${params.roomId}_${params.seasonId}`;
    const rawInput = editedSeasonPrices[key];
    const newPriceRaw = Number(rawInput);

    if (!rawInput || isNaN(newPriceRaw) || newPriceRaw <= 0) {
      alert('Ingresa un precio válido mayor que 0.');
      return;
    }

    const precioDirecto = Math.round(newPriceRaw * 1.19).toLocaleString('es-MX');
    const precioAirbnb  = Math.round(newPriceRaw * beds24Multipliers.airbnb * 1.19).toLocaleString('es-MX');
    const precioBooking = Math.round(newPriceRaw * beds24Multipliers.booking * 1.19).toLocaleString('es-MX');

    const confirmed = window.confirm(
      `⚠️ CONFIRMAR CAMBIO MASIVO EN BEDS24\n\n` +
      `Habitación: ${params.roomName}\n` +
      `Temporada: ${params.seasonLabel}\n` +
      `Total de periodos a actualizar: ${params.ranges.length}\n` +
      `Nuevo precio base para toda la temporada: $${newPriceRaw.toLocaleString('es-MX')} (sin impuestos)\n\n` +
      `Los huéspedes verán (1-6 noches):\n` +
      `  · Directo:  $${precioDirecto} (con impuestos)\n` +
      `  · Airbnb:   $${precioAirbnb} (con impuestos)\n` +
      `  · Booking:  $${precioBooking} (con impuestos)\n\n` +
      `Se modificarán TODOS los periodos de esta temporada en Beds24.\n` +
      `Las reservas ya confirmadas NO se ven afectadas.\n\n` +
      `¿Continuar?`
    );
    if (!confirmed) return;

    setSavingSeasonKey(key);
    try {
      const res = await fetch('/api/beds24-prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: params.roomId,
          priceRaw: newPriceRaw,
          ranges: params.ranges,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      
      // Actualizar localmente los precios de los bloques de esta temporada
      setBeds24Rooms(prev => prev.map(room => {
        if (room.id !== params.roomId) return room;
        return {
          ...room,
          seasonBlocks: (room.seasonBlocks || []).map((b: any) => {
            if (b.season !== params.seasonId) return b;
            return {
              ...b,
              priceRaw: newPriceRaw,
              priceDirecto: Math.round(newPriceRaw * 1.19),
              priceAirbnb: Math.round(newPriceRaw * beds24Multipliers.airbnb * 1.19),
              priceBooking: Math.round(newPriceRaw * beds24Multipliers.booking * 1.19),
            };
          })
        };
      }));

      setEditedSeasonPrices(prev => { const n = { ...prev }; delete n[key]; return n; });
      alert(`✅ Precios de la temporada "${params.seasonLabel}" actualizados en Beds24.`);
    } catch (err: any) {
      alert('Error al guardar en Beds24: ' + err.message);
    } finally {
      setSavingSeasonKey(null);
    }
  };

  /**
   * Guarda de forma masiva las tarifas editadas para todos los cuartos de una misma temporada.
   */
  const handleSaveBulkSeasonPrices = async (seasonId: string, seasonLabel: string) => {
    // Filtrar qué habitaciones tienen precio editado y válido para esta temporada
    const roomsToSave = beds24Rooms.filter(room => {
      const seasonKey = `${room.id}_${seasonId}`;
      const val = editedSeasonPrices[seasonKey];
      return val !== undefined && Number(val) > 0;
    });

    if (roomsToSave.length === 0) {
      alert("No hay cambios pendientes de guardar para esta temporada.");
      return;
    }

    const confirmed = window.confirm(
      `⚠️ CONFIRMAR CAMBIO CONJUNTO EN BEDS24\n\n` +
      `Temporada: ${seasonLabel}\n` +
      `Se actualizarán ${roomsToSave.length} unidades simultáneamente con los precios indicados.\n\n` +
      `¿Desea continuar?`
    );
    if (!confirmed) return;

    const bulkKey = `bulk_${seasonId}`;
    setSavingSeasonKey(bulkKey);

    try {
      // Guardar de forma secuencial para no saturar la API
      for (const room of roomsToSave) {
        const seasonKey = `${room.id}_${seasonId}`;
        const newPriceRaw = Number(editedSeasonPrices[seasonKey]);
        const blocksInSeason = (room.seasonBlocks || []).filter((b: any) => b.season === seasonId);

        const ranges = blocksInSeason.length > 0 
          ? blocksInSeason.map((b: any) => ({ from: b.from, to: b.to }))
          : [];

        if (ranges.length === 0) {
          throw new Error(`No se encontraron rangos de fechas activos para la habitación: ${room.name}`);
        }

        const res = await fetch('/api/beds24-prices', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: room.id,
            priceRaw: newPriceRaw,
            ranges,
          }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || `Error desconocido en ${room.name}`);
      }

      // Actualizar localmente el estado de beds24Rooms
      setBeds24Rooms(prev => prev.map(room => {
        const seasonKey = `${room.id}_${seasonId}`;
        const editedVal = editedSeasonPrices[seasonKey];
        if (editedVal === undefined) return room;

        const newPriceRaw = Number(editedVal);
        return {
          ...room,
          seasonBlocks: (room.seasonBlocks || []).map((b: any) => {
            if (b.season !== seasonId) return b;
            return {
              ...b,
              priceRaw: newPriceRaw,
              priceDirecto: Math.round(newPriceRaw * 1.19),
              priceAirbnb: Math.round(newPriceRaw * beds24Multipliers.airbnb * 1.19),
              priceBooking: Math.round(newPriceRaw * beds24Multipliers.booking * 1.19),
            };
          })
        };
      }));

      // Limpiar campos editados de esta temporada
      setEditedSeasonPrices(prev => {
        const copy = { ...prev };
        roomsToSave.forEach(room => {
          delete copy[`${room.id}_${seasonId}`];
        });
        return copy;
      });

      alert(`✅ Tarifas de la temporada "${seasonLabel}" actualizadas con éxito en Beds24.`);
    } catch (err: any) {
      alert('Error al guardar tarifas: ' + err.message);
    } finally {
      setSavingSeasonKey(null);
    }
  };



  // --- CONFIGURACIÓN DE FECHAS DE TEMPORADAS ---
  const [seasonRanges, setSeasonRanges] = useState<any[]>([]);
  const [loadingSeasonRanges, setLoadingSeasonRanges] = useState(false);
  const [savingSeasonRanges, setSavingSeasonRanges] = useState(false);
  const [showSeasonsConfig, setShowSeasonsConfig] = useState(false);

  const defaultSeasonRanges = [
    // Temporada Alta
    { season: "alta", from: "2026-12-18", to: "2027-01-08" },
    { season: "alta", from: "2027-03-19", to: "2027-04-03" },
    { season: "alta", from: "2027-12-17", to: "2028-01-07" },
    // Temporada Media-Alta
    { season: "media_alta", from: "2026-07-15", to: "2026-08-17" },
    { season: "media_alta", from: "2027-07-16", to: "2027-08-13" },
    // Temporada Media
    { season: "media", from: "2026-09-12", to: "2026-09-16" },
    { season: "media", from: "2026-10-30", to: "2026-12-17" },
    { season: "media", from: "2027-05-14", to: "2027-05-15" },
    { season: "media", from: "2027-09-15", to: "2027-09-18" },
    { season: "media", from: "2027-10-29", to: "2027-12-16" }
  ];

  const loadSeasonRanges = async () => {
    setLoadingSeasonRanges(true);
    try {
      const res = await fetch('/api/precios/save-ranges?t=' + Date.now());
      const data = await res.json();
      if (data.success && Array.isArray(data.ranges)) {
        setSeasonRanges(data.ranges);
      } else {
        setSeasonRanges(defaultSeasonRanges);
      }
    } catch (e) {
      console.error('Error al cargar rangos de temporada:', e);
      setSeasonRanges(defaultSeasonRanges);
    } finally {
      setLoadingSeasonRanges(false);
    }
  };

  const handleSaveSeasonRanges = async (rangesToSave: any[]) => {
    setSavingSeasonRanges(true);
    try {
      const saveRes = await fetch('/api/precios/save-ranges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ranges: rangesToSave })
      });
      const saveData = await saveRes.json();
      if (!saveData.success) {
        throw new Error(saveData.error || 'Error al guardar en la base de datos');
      }

      setSeasonRanges(rangesToSave);

      const doSync = window.confirm(
        '✅ Fechas de temporadas actualizadas con éxito en la base de datos.\n\n' +
        '¿Desea sincronizar ahora mismo todo el calendario de Beds24 para aplicar estas nuevas fechas a las tarifas del hotel? (Recomendado, tardará unos de 5 segundos)'
      );

      if (doSync) {
        const syncRes = await fetch('/api/precios/sync?t=' + Date.now());
        const syncJson = await syncRes.json();
        if (syncJson.success) {
          alert('✅ Sincronización completada. El calendario de Beds24 ha sido actualizado con las nuevas fechas de temporada.');
        } else {
          alert('⚠️ Las fechas se guardaron, pero ocurrió un error al sincronizar con Beds24: ' + syncJson.error);
        }
      }
      
      loadBeds24Prices();
    } catch (err: any) {
      alert('Error al guardar temporadas: ' + err.message);
    } finally {
      setSavingSeasonRanges(false);
    }
  };

  useEffect(() => {
    loadBeds24Prices();
    loadTempDiscounts();
    loadSeasonRanges();
  }, []);

  // ─────────────────────────────────────────────────────
  // DESCUENTOS TEMPORALES
  // ─────────────────────────────────────────────────────
  const ROOMS_LIST = [
    { id: '679077', name: 'Habitación Doble', icon: '🛏️' },
    { id: '679087', name: 'Apartamento 1 dorm.', icon: '🏠' },
    { id: '679091', name: 'Apartamento 2 dorm.', icon: '🏠' },
    { id: '679092', name: 'Apartamento 3 dorm.', icon: '🏡' },
    { id: '679093', name: 'Casa Vacacional 3 dorm.', icon: '🏖️' },
  ];

  const todayStr = new Date().toISOString().split('T')[0];
  const in30Str = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();

  const [tdSelectedRooms, setTdSelectedRooms] = useState<string[]>(['679077']);
  const [tdFrom, setTdFrom] = useState(todayStr);
  const [tdTo, setTdTo] = useState(in30Str);
  const [tdPriceHuesped, setTdPriceHuesped] = useState(''); // precio al huésped (con IVA)
  const [tdLabel, setTdLabel] = useState('');
  const [tdSaving, setTdSaving] = useState(false);
  const [tdError, setTdError] = useState('');
  const [tdSuccess, setTdSuccess] = useState('');
  const [tempDiscounts, setTempDiscounts] = useState<any[]>([]);
  const [tdDeleting, setTdDeleting] = useState<string | null>(null);

  // Evaluar expresión matemática en el precio
  const evaluateMathExpression = (str: string): number => {
    if (!str) return 0;
    let cleanStr = str.replace(/x|X|×/g, '*');
    cleanStr = cleanStr.replace(/[^0-9+\-*/. ]/g, '');
    try {
      const result = new Function(`return (${cleanStr})`)();
      if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
        return result;
      }
    } catch (e) {}
    return 0;
  };

  const evaluatedPrice = (() => {
    if (!tdPriceHuesped) return 0;
    const trimmed = tdPriceHuesped.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    return evaluateMathExpression(trimmed);
  })();

  // El input ahora es Precio Base (sin impuestos)
  const tdPriceRaw = evaluatedPrice ? Math.round(evaluatedPrice * 100) / 100 : 0;
  const tdPriceAirbnb = tdPriceRaw > 0 ? Math.round(tdPriceRaw * beds24Multipliers.airbnb * 1.19) : 0;
  const tdPriceBooking = tdPriceRaw > 0 ? Math.round(tdPriceRaw * beds24Multipliers.booking * 1.19) : 0;

  const loadTempDiscounts = async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data } = await sb.from('settings').select('value').eq('key', 'temp_discounts').maybeSingle();
      if (data?.value && Array.isArray(data.value)) {
        setTempDiscounts(data.value);
      } else if (data?.value) {
        try { setTempDiscounts(JSON.parse(data.value)); } catch {}
      }
    } catch {}
  };

  const saveTempDiscounts = async (list: any[]) => {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await sb.from('settings').upsert({ key: 'temp_discounts', value: list }, { onConflict: 'key' });
  };

  const handleApplyTempDiscount = async () => {
    setTdError('');
    setTdSuccess('');
    const priceNum = evaluatedPrice;
    if (!priceNum || priceNum <= 0) { setTdError('Ingresa un precio válido.'); return; }
    if (!tdFrom || !tdTo || tdFrom > tdTo) { setTdError('Las fechas no son válidas.'); return; }
    if (tdSelectedRooms.length === 0) { setTdError('Selecciona al menos una habitación.'); return; }

    const priceRaw = priceNum;
    const roomNames = tdSelectedRooms.map(id => ROOMS_LIST.find(r => r.id === id)?.name || id).join(', ');

    const confirmed = window.confirm(
      `⚠️ CONFIRMAR TARIFA ESPECIAL (DESCUENTO / AUMENTO)\n\n` +
      `Habitaciones: ${roomNames}\n` +
      `Período: ${tdFrom} → ${tdTo}\n` +
      `Precio base en Beds24 (sin impuestos): $${priceRaw.toLocaleString('es-MX', { maximumFractionDigits: 0 })}\n` +
      `Precio al huésped (con impuestos): $${Math.round(priceRaw * 1.19).toLocaleString('es-MX')} MXN\n\n` +
      `Las reservas ya confirmadas NO se ven afectadas.\n` +
      `¿Continuar?`
    );
    if (!confirmed) return;

    setTdSaving(true);
    try {
      for (const roomId of tdSelectedRooms) {
        const res = await fetch('/api/beds24-prices', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, priceRaw, from: tdFrom, to: tdTo }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || `Error en habitación ${roomId}`);
      }

      // Guardar en historial
      const newDiscount = {
        id: Date.now().toString(),
        rooms: tdSelectedRooms,
        roomNames,
        from: tdFrom,
        to: tdTo,
        priceHuesped: Math.round(priceRaw * 1.19),
        priceRaw,
        label: tdLabel || `Tarifa Especial ${tdFrom} → ${tdTo}`,
        appliedAt: new Date().toISOString()
      };
      const updated = [newDiscount, ...tempDiscounts];
      setTempDiscounts(updated);
      await saveTempDiscounts(updated);

      setTdSuccess(`✅ Tarifa especial aplicada en Beds24 para: ${roomNames} (${tdFrom} → ${tdTo})`);
      setTdPriceHuesped('');
      // setTdLabel(''); <-- Se deja la descripción del descuento sin borrar según petición del usuario
    } catch (err: any) {
      setTdError('Error al aplicar: ' + err.message);
    } finally {
      setTdSaving(false);
    }
  };

  const handleDeleteTempDiscount = async (discountId: string) => {
    setTdDeleting(discountId);
    try {
      const updated = tempDiscounts.filter(d => d.id !== discountId);
      setTempDiscounts(updated);
      await saveTempDiscounts(updated);
    } finally {
      setTdDeleting(null);
    }
  };

  return (
    <div className="space-y-6 pb-24 bg-[#fafafa] min-h-screen text-zinc-950 font-sans">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-950 to-indigo-900 px-6 py-8 rounded-b-[24px] shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4 text-white">
        <div>
          <span className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-widest block mb-1">Sincronización Beds24 · Bidirecional</span>
          <h2 className="text-[24px] font-black tracking-tight leading-none">Tarifas</h2>
          <p className="text-[13px] text-indigo-200 mt-1.5 font-medium">
            Edita las tarifas de Beds24 directamente desde la app. Los cambios se sincronizan automáticamente.
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-6">
        <div className="space-y-6 animate-in fade-in duration-200">

          {/* ═══════════════════════════════════════════════════════ */}
          {/* 🏷️  DESCUENTOS TEMPORALES                              */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="bg-white border border-amber-200 rounded-3xl shadow-sm overflow-hidden">
            
            {/* Header de sección */}
            <div className="px-5 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  <Tag size={18} className="text-amber-700" />
                </div>
                <div>
                  <h3 className="text-[14px] font-black text-zinc-900 tracking-tight">Tarifas Especiales (Descuentos y Aumentos)</h3>
                  <p className="text-[11.5px] text-zinc-500 font-medium mt-0.5">
                    Aumenta o descuenta la tarifa en fechas específicas sin modificar las temporadas base.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-5">

              {/* Selector de habitaciones */}
              <div className="space-y-2">
                <label className="text-[10.5px] font-extrabold text-zinc-500 uppercase tracking-widest block">
                  1. Habitaciones
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {ROOMS_LIST.map(room => {
                    const selected = tdSelectedRooms.includes(room.id);
                    return (
                      <button
                        key={room.id}
                        onClick={() => setTdSelectedRooms([room.id])}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-[12px] font-semibold transition-all cursor-pointer ${
                          selected
                            ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                            : 'bg-white text-zinc-700 border-zinc-200 hover:border-amber-300 hover:bg-amber-50'
                        }`}
                      >
                        <span className="shrink-0">{room.icon}</span>
                        <span className="leading-tight">{room.name}</span>
                        {selected && <Check size={13} strokeWidth={3} className="ml-auto shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Fechas */}
              <div className="space-y-2">
                <label className="text-[10.5px] font-extrabold text-zinc-500 uppercase tracking-widest block">
                  2. Período del ajuste
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide block mb-1">Desde</span>
                    <input
                      type="date"
                      value={tdFrom}
                      onChange={e => setTdFrom(e.target.value)}
                      className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide block mb-1">Hasta</span>
                    <input
                      type="date"
                      value={tdTo}
                      min={tdFrom}
                      onChange={e => setTdTo(e.target.value)}
                      className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Precio al huésped */}
              <div className="space-y-2">
                <label className="text-[10.5px] font-extrabold text-zinc-500 uppercase tracking-widest block">
                  3. Precio Base (sin impuestos)
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 font-black text-[14px]">$</span>
                    <input
                      type="text"
                      value={tdPriceHuesped}
                      onChange={e => { setTdPriceHuesped(e.target.value); setTdError(''); setTdSuccess(''); }}
                      placeholder="Ej: 1513 o 1513 * 1.5"
                      className="w-full border border-zinc-200 rounded-xl pl-8 pr-16 py-3 text-[16px] font-black text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 font-semibold text-[11px]">MXN</span>
                  </div>
                </div>
              </div>

              {/* Preview de precios */}
              {tdPriceRaw > 0 && (
                <div className="bg-zinc-900 rounded-2xl px-4 py-3.5 space-y-2.5">
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Preview de precios calculados</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-zinc-800 rounded-xl p-2.5 text-center">
                      <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wide block mb-1">Base Beds24</span>
                      <span className="text-[14px] font-black text-white">${Math.round(tdPriceRaw).toLocaleString('es-MX')}</span>
                    </div>
                    <div className="bg-emerald-900/50 rounded-xl p-2.5 text-center border border-emerald-800/30">
                      <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wide block mb-1">📱 Directo</span>
                      <span className="text-[14px] font-black text-white">${Math.round(tdPriceRaw * 1.19).toLocaleString('es-MX')}</span>
                    </div>
                    <div className="bg-pink-900/40 rounded-xl p-2.5 text-center border border-pink-800/30">
                      <span className="text-[9px] text-pink-300 font-bold uppercase tracking-wide block mb-1">🏠 Airbnb</span>
                      <span className="text-[14px] font-black text-white">${tdPriceAirbnb.toLocaleString('es-MX')}</span>
                    </div>
                  </div>
                  <div className="bg-blue-900/40 rounded-xl p-2.5 text-center border border-blue-800/30">
                    <span className="text-[9px] text-blue-300 font-bold uppercase tracking-wide block mb-1">🌐 Booking.com</span>
                    <span className="text-[15px] font-black text-white">${tdPriceBooking.toLocaleString('es-MX')} MXN</span>
                  </div>
                  <p className="text-[9.5px] text-zinc-500 italic">
                    Airbnb ×{beds24Multipliers.airbnb} · Booking ×{beds24Multipliers.booking} · todos incluyen IVA 19%
                  </p>
                </div>
              )}

              {/* Etiqueta opcional */}
              <div className="space-y-1.5">
                <label className="text-[10.5px] font-extrabold text-zinc-500 uppercase tracking-widest block">
                  Etiqueta (opcional)
                </label>
                <input
                  type="text"
                  value={tdLabel}
                  onChange={e => setTdLabel(e.target.value)}
                  placeholder='Ej: "Aumento fin de año" o "Descuento bajo flujo"'
                  className="w-full border border-zinc-200 rounded-xl px-3.5 py-2.5 text-[12.5px] font-medium text-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Feedback */}
              {tdError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-3 text-[12px] text-red-700 font-semibold flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" /> {tdError}
                </div>
              )}
              {tdSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-3 text-[12px] text-emerald-700 font-semibold flex items-center gap-2">
                  <Check size={14} strokeWidth={3} className="shrink-0" /> {tdSuccess}
                </div>
              )}

              {/* Botón */}
              <button
                onClick={handleApplyTempDiscount}
                disabled={tdSaving}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-extrabold text-[13px] rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                {tdSaving ? <RefreshCw size={16} className="animate-spin" /> : <Tag size={16} />}
                {tdSaving ? 'Aplicando en Beds24...' : 'Aplicar Tarifa Especial (Descuento/Aumento)'}
              </button>

              {/* Historial de tarifas especiales activas */}
              {tempDiscounts.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-zinc-100">
                  <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block">
                    Historial de tarifas especiales y descuentos
                  </span>
                  {tempDiscounts.map((d: any) => (
                    <div key={d.id} className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex items-start justify-between gap-3">
                      <div className="space-y-0.5 text-[11.5px]">
                        <p className="font-extrabold text-zinc-900">{d.label}</p>
                        <p className="text-zinc-500 font-semibold">{d.roomNames}</p>
                        <p className="text-zinc-500">
                          📅 {d.from} → {d.to} · 
                          <span className="text-indigo-700 font-bold"> ${Number(d.priceHuesped).toLocaleString('es-MX')} MXN</span>
                        </p>
                        <p className="text-zinc-400 text-[10px]">Aplicado: {new Date(d.appliedAt).toLocaleString('es-MX')}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteTempDiscount(d.id)}
                        disabled={tdDeleting === d.id}
                        title="Eliminar del historial"
                        className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 transition-all cursor-pointer shrink-0"
                      >
                        {tdDeleting === d.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* ⚙️  CONFIGURACIÓN DE FECHAS DE TEMPORADAS               */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden">
            <button
              onClick={() => setShowSeasonsConfig(!showSeasonsConfig)}
              className="w-full px-5 py-4 bg-gradient-to-r from-zinc-50 to-zinc-100/50 border-b border-zinc-150 flex items-center justify-between gap-3 text-left focus:outline-none cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                  <Calendar size={18} className="text-zinc-700" />
                </div>
                <div>
                  <h3 className="text-[14px] font-black text-zinc-900 tracking-tight">Configuración de Fechas de Temporadas</h3>
                  <p className="text-[11.5px] text-zinc-500 font-medium mt-0.5">
                    Modifica los rangos de fechas asignados a cada temporada.
                  </p>
                </div>
              </div>
              <span className="text-zinc-400 font-black text-xs">{showSeasonsConfig ? '▲ Colapsar' : '▼ Expandir'}</span>
            </button>

            {showSeasonsConfig && (
              <div className="p-5 space-y-5 animate-in fade-in duration-200">
                {loadingSeasonRanges ? (
                  <div className="flex items-center justify-center py-6 gap-2">
                    <RefreshCw size={16} className="animate-spin text-indigo-600" />
                    <span className="text-[12px] font-semibold text-zinc-500">Cargando fechas de temporadas...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Explicación */}
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-[12px] text-blue-800 leading-relaxed space-y-1">
                      <p className="font-extrabold flex items-center gap-1.5">
                        💡 Información sobre Temporadas:
                      </p>
                      <p>
                        Los rangos de fechas que definas aquí agruparán automáticamente las tarifas en el calendario. Las fechas que no coincidan con ningún rango se considerarán de <strong>Temporada Baja</strong> por defecto.
                      </p>
                    </div>

                    {/* Lista de temporadas editables */}
                    {['alta', 'media_alta', 'media'].map(seasonKey => {
                      const seasonLabel = seasonKey === 'alta' ? 'Temporada Alta 🔥' :
                                          seasonKey === 'media_alta' ? 'Temporada Media-Alta ☀️' : 'Temporada Media 🌤️';
                      const colorClass = seasonKey === 'alta' ? 'text-rose-600 bg-rose-50 border-rose-100' :
                                         seasonKey === 'media_alta' ? 'text-orange-600 bg-orange-50 border-orange-100' :
                                         'text-amber-600 bg-amber-50 border-amber-100';

                      const ranges = seasonRanges.filter(r => r.season === seasonKey);

                      return (
                        <div key={seasonKey} className="border border-zinc-150 rounded-2xl p-4 space-y-3 bg-zinc-50/20">
                          <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                            <span className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md border ${colorClass}`}>
                              {seasonLabel}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const newRange = { season: seasonKey, from: todayStr, to: todayStr };
                                setSeasonRanges(prev => [...prev, newRange]);
                              }}
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer bg-indigo-50 px-2 py-1 rounded-lg"
                            >
                              + Agregar Rango
                            </button>
                          </div>

                          {ranges.length === 0 ? (
                            <p className="text-[11.5px] text-zinc-400 italic">No hay rangos definidos para esta temporada.</p>
                          ) : (
                            <div className="space-y-2">
                              {seasonRanges.map((range, idx) => {
                                if (range.season !== seasonKey) return null;
                                return (
                                  <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-zinc-100 shadow-xs">
                                    <div className="flex-1 grid grid-cols-2 gap-2">
                                      <div>
                                        <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest block mb-0.5">Desde</span>
                                        <input
                                          type="date"
                                          value={range.from}
                                          onChange={e => {
                                            const updated = [...seasonRanges];
                                            updated[idx].from = e.target.value;
                                            setSeasonRanges(updated);
                                          }}
                                          className="w-full text-[12px] font-bold text-zinc-800 border border-zinc-200 focus:outline-none p-1 rounded"
                                        />
                                      </div>
                                      <div>
                                        <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest block mb-0.5">Hasta</span>
                                        <input
                                          type="date"
                                          value={range.to}
                                          onChange={e => {
                                            const updated = [...seasonRanges];
                                            updated[idx].to = e.target.value;
                                            setSeasonRanges(updated);
                                          }}
                                          className="w-full text-[12px] font-bold text-zinc-800 border border-zinc-200 focus:outline-none p-1 rounded"
                                        />
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSeasonRanges(prev => prev.filter((_, i) => i !== idx));
                                      }}
                                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                                      title="Eliminar rango"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Temporada Baja (Read-only reminder) */}
                    <div className="border border-zinc-200 rounded-2xl p-4 bg-zinc-50 border-dashed text-zinc-500 flex items-center justify-between text-[12px]">
                      <span>🍂 <strong>Temporada Baja</strong> (Resto del año)</span>
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Automático</span>
                    </div>

                    {/* Botón de guardar */}
                    <button
                      type="button"
                      disabled={savingSeasonRanges}
                      onClick={() => handleSaveSeasonRanges(seasonRanges)}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-[13px] rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {savingSeasonRanges ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                      {savingSeasonRanges ? 'Guardando en la base de datos...' : 'Guardar Fechas de Temporada'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-black text-zinc-900">Tarifas Beds24 · Daily Prices</h3>
              <p className="text-[12px] text-zinc-400 font-semibold mt-0.5">
                Tarifas base del calendario (sin impuestos) organizadas por temporada. Edita y guarda para actualizar en Beds24.
              </p>
            </div>
            <button
              onClick={loadBeds24Prices}
              disabled={beds24Loading}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold uppercase tracking-wider rounded-xl flex items-center gap-2 shadow cursor-pointer disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={13} className={beds24Loading ? 'animate-spin' : ''} />
              {beds24Loading ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>

          {/* Fórmula visual */}
          <div className="bg-zinc-900 rounded-2xl px-5 py-4 flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Fórmula:</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1.5 bg-zinc-800 rounded-lg text-[11px] font-extrabold text-white">Precio Beds24</span>
              <span className="text-zinc-500 font-black text-sm">×</span>
              <span className="px-2.5 py-1.5 bg-indigo-900/60 rounded-lg text-[11px] font-extrabold text-indigo-300">Multiplicador OTA</span>
              <span className="text-zinc-500 font-black text-sm">×</span>
              <span className="px-2.5 py-1.5 bg-amber-900/60 rounded-lg text-[11px] font-extrabold text-amber-300">1.19 impuestos</span>
              <span className="text-zinc-500 font-black text-sm">=</span>
              <span className="px-2.5 py-1.5 bg-emerald-900/60 rounded-lg text-[11px] font-extrabold text-emerald-300">Precio al huésped</span>
            </div>
          </div>

          {/* Error state */}
          {beds24Error && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-rose-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-bold text-rose-800">Error al conectar con Beds24</p>
                <p className="text-[12px] text-rose-600 mt-0.5">{beds24Error}</p>
              </div>
            </div>
          )}

          {/* Tarjetas de precios agrupados por Temporada */}
          {!beds24Error && (
            <>
              {beds24Loading && beds24Rooms.length === 0 ? (
                <div className="bg-white border border-zinc-200 rounded-3xl p-12 flex flex-col items-center gap-3 shadow-sm">
                  <RefreshCw size={24} className="text-indigo-500 animate-spin" />
                  <span className="text-[13px] font-semibold text-zinc-500">Leyendo calendario de Beds24...</span>
                </div>
              ) : beds24Rooms.length === 0 && !beds24Loading ? (
                <div className="bg-white border border-zinc-200 rounded-3xl p-10 flex flex-col items-center gap-3 text-center shadow-sm">
                  <AlertCircle size={28} className="text-zinc-300" />
                  <p className="text-[13px] font-semibold text-zinc-500">No se obtuvieron precios del calendario.</p>
                  <p className="text-[12px] text-zinc-400 max-w-xs">Presiona <strong>Actualizar</strong> o verifica que el token de Beds24 sea válido.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {(() => {
                    const SEASONS_ORDER = [
                      { id: 'alta', label: 'TEMPORADA ALTA 2026 - 2027', badgeColor: 'rose' },
                      { id: 'media_alta', label: 'TEMPORADA MEDIA-ALTA', badgeColor: 'orange' },
                      { id: 'media', label: 'TEMPORADA MEDIA', badgeColor: 'amber' },
                      { id: 'baja', label: 'TEMPORADA BAJA (Resto del año)', badgeColor: 'sky' }
                    ];

                    const badgeStyles: Record<string, { badge: string; ring: string; bg: string; text: string }> = {
                      rose:   { badge: 'bg-rose-100 text-rose-700 ring-rose-200',   ring: 'ring-rose-200',   bg: 'bg-rose-50/40',   text: 'text-rose-700'   },
                      orange: { badge: 'bg-orange-100 text-orange-700 ring-orange-200',ring: 'ring-orange-200', bg: 'bg-orange-50/40', text: 'text-orange-700' },
                      amber:  { badge: 'bg-amber-100 text-amber-700 ring-amber-200', ring: 'ring-amber-200',  bg: 'bg-amber-50/40',  text: 'text-amber-700'  },
                      sky:    { badge: 'bg-sky-100 text-sky-700 ring-sky-200',     ring: 'ring-sky-200',    bg: 'bg-sky-50/40',    text: 'text-sky-700'    },
                      zinc:   { badge: 'bg-zinc-100 text-zinc-650 ring-zinc-200',   ring: 'ring-zinc-200',   bg: 'bg-zinc-50',      text: 'text-zinc-650'   },
                    };

                    return SEASONS_ORDER.map(sGroup => {
                      // 1. Obtener todos los periodos únicos de esta temporada en todas las habitaciones
                      const uniquePeriods: { from: string; to: string; fromLabel: string; toLabel: string }[] = [];
                      const seenPeriods = new Set<string>();

                      beds24Rooms.forEach(room => {
                        (room.seasonBlocks || []).forEach((b: any) => {
                          if (b.season === sGroup.id) {
                            const key = `${b.from}_${b.to}`;
                            if (!seenPeriods.has(key)) {
                              seenPeriods.add(key);
                              uniquePeriods.push({
                                from: b.from,
                                to: b.to,
                                fromLabel: b.fromLabel,
                                toLabel: b.toLabel
                              });
                            }
                          }
                        });
                      });

                      uniquePeriods.sort((a, b) => a.from.localeCompare(b.from));
                      
                      // Si esta temporada no tiene periodos en ninguna habitación en Beds24, no la mostramos
                      if (uniquePeriods.length === 0) return null;

                      const styles = badgeStyles[sGroup.badgeColor] || badgeStyles.zinc;

                      // Verificar si hay cambios pendientes de guardar para esta temporada
                      const isSeasonEdited = beds24Rooms.some(room => {
                        const seasonKey = `${room.id}_${sGroup.id}`;
                        return editedSeasonPrices[seasonKey] !== undefined;
                      });

                      const isSavingBulk = savingSeasonKey === `bulk_${sGroup.id}`;

                      return (
                        <div key={sGroup.id} className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
                          
                          {/* Cabecera de Temporada */}
                          <div className="px-5 py-4 border-b border-zinc-100 bg-[#fafafa] flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-2.5">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider ${styles.badge} shadow-sm border border-transparent`}>
                                  {sGroup.label}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Periodos aplicables</span>
                                <div className="flex flex-wrap gap-2">
                                  {uniquePeriods.map((p, idx) => (
                                    <span key={idx} className="bg-white text-zinc-800 text-[10px] font-extrabold px-2.5 py-1 rounded-lg border border-zinc-200/85 shadow-xs">
                                      📅 {p.fromLabel} — {p.toLabel}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Botón Guardar Conjunto (Bulk Save) */}
                            {isSeasonEdited && (
                              <button
                                onClick={() => handleSaveBulkSeasonPrices(sGroup.id, sGroup.label)}
                                disabled={isSavingBulk}
                                className="md:self-end px-4.5 py-2.5 bg-indigo-650 hover:bg-indigo-755 disabled:opacity-40 text-white font-extrabold text-[11px] rounded-xl transition-all shadow-md active:scale-[0.96] flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
                              >
                                {isSavingBulk ? (
                                  <RefreshCw size={12} className="animate-spin" />
                                ) : (
                                  <Check size={12} strokeWidth={3} />
                                )}
                                <span>Guardar Cambios de Temporada</span>
                              </button>
                            )}
                          </div>

                          {/* Listado de Habitaciones y sus Inputs/Calculos */}
                          <div className="p-5 divide-y divide-zinc-100 space-y-4">
                            {beds24Rooms.map((room, rIdx) => {
                              const blocksInSeason = (room.seasonBlocks || []).filter((b: any) => b.season === sGroup.id);
                              if (blocksInSeason.length === 0) return null;

                              const seasonKey = `${room.id}_${sGroup.id}`;
                              const isEditing = editedSeasonPrices[seasonKey] !== undefined;
                              const referencePrice = blocksInSeason[0]?.priceRaw || 0;
                              const currentVal = isEditing ? editedSeasonPrices[seasonKey] : String(referencePrice || '');
                              const currentPriceNum = Number(currentVal) || 0;

                              const isSavingItem = savingSeasonKey === seasonKey;

                              // Previews de precios calculados
                              const pDirecto = currentPriceNum > 0 ? Math.round(currentPriceNum * 1.19) : 0;
                              const pAirbnb  = currentPriceNum > 0 ? Math.round(currentPriceNum * beds24Multipliers.airbnb * 1.19) : 0;
                              const pBooking = currentPriceNum > 0 ? Math.round(currentPriceNum * beds24Multipliers.booking * 1.19) : 0;

                              return (
                                <div key={room.id} className={`pt-4 ${rIdx === 0 ? 'pt-0' : ''} flex flex-col lg:flex-row lg:items-center justify-between gap-4`}>
                                  
                                  {/* Nombre Habitación */}
                                  <div className="flex items-center gap-2.5 min-w-0 lg:w-[28%] shrink-0">
                                    <span className="text-xl shrink-0">{room.icon}</span>
                                    <div className="min-w-0">
                                      <p className="text-[12.5px] font-black text-zinc-800 leading-snug">{room.name}</p>
                                      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mt-0.5">Beds24 Live</span>
                                    </div>
                                  </div>

                                  {/* Input y Precios de Canales */}
                                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 items-center gap-3 sm:gap-4">
                                    
                                    {/* Input Precio Base */}
                                    <div className="flex flex-col">
                                      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Precio Base</span>
                                      <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-zinc-400">$</span>
                                        <input
                                          type="number"
                                          value={currentVal}
                                          placeholder="0"
                                          onChange={e => setEditedSeasonPrices(prev => ({ ...prev, [seasonKey]: e.target.value }))}
                                          className={`w-full pl-5.5 pr-2 py-1.5 text-[12px] font-black rounded-lg border outline-none text-right transition-all ${
                                            isEditing
                                              ? 'border-indigo-400 bg-white text-indigo-900 ring-2 ring-indigo-100'
                                              : 'border-zinc-200 bg-zinc-50/30 text-zinc-900 focus:border-indigo-300'
                                          }`}
                                        />
                                      </div>
                                    </div>

                                    {/* Directo */}
                                    <div className="flex flex-col pl-1">
                                      <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">Directo (Con Impuestos)</span>
                                      <span className="text-[12.5px] font-black text-zinc-700 mt-1">${pDirecto > 0 ? pDirecto.toLocaleString('es-MX') : '—'}</span>
                                    </div>

                                    {/* Airbnb */}
                                    <div className="flex flex-col pl-1">
                                      <span className="text-[9px] font-bold text-rose-500 uppercase tracking-wider">Airbnb ({Math.round((beds24Multipliers.airbnb - 1) * 100)}%)</span>
                                      <span className="text-[12.5px] font-black text-rose-600 mt-1">${pAirbnb > 0 ? pAirbnb.toLocaleString('es-MX') : '—'}</span>
                                    </div>

                                    {/* Booking */}
                                    <div className="flex flex-col pl-1">
                                      <span className="text-[9px] font-bold text-sky-500 uppercase tracking-wider">Booking ({Math.round((beds24Multipliers.booking - 1) * 100)}%)</span>
                                      <span className="text-[12.5px] font-black text-sky-600 mt-1">${pBooking > 0 ? pBooking.toLocaleString('es-MX') : '—'}</span>
                                    </div>

                                  </div>

                                  {/* Botones de Acción Individual */}
                                  <div className="shrink-0 flex items-center justify-end gap-1.5 w-full lg:w-[15%]">
                                    {isEditing ? (
                                      <>
                                        <button
                                          onClick={() => handleSaveBeds24SeasonPrice({
                                            roomId: room.id,
                                            roomName: room.name,
                                            seasonId: sGroup.id,
                                            seasonLabel: sGroup.label,
                                            ranges: blocksInSeason.map((b: any) => ({ from: b.from, to: b.to })),
                                          })}
                                          disabled={isSavingItem}
                                          className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center"
                                          title="Guardar tarifa para esta habitación"
                                        >
                                          {isSavingItem ? (
                                            <RefreshCw size={11} className="animate-spin" />
                                          ) : (
                                            <Check size={11} strokeWidth={3} />
                                          )}
                                        </button>
                                        <button
                                          onClick={() => setEditedSeasonPrices(prev => { const n = { ...prev }; delete n[seasonKey]; return n; })}
                                          className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-150 rounded-lg cursor-pointer transition-colors"
                                          title="Deshacer cambios"
                                        >
                                          <X size={11} />
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-wider">Sincronizado</span>
                                    )}
                                  </div>

                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </>
          )}

          {/* Sección consolidada de Descuentos por Estancia al pie */}
          <div className="bg-white border border-zinc-200 rounded-3xl p-5 shadow-sm space-y-4">
            <div>
              <h3 className="text-[13px] font-extrabold text-zinc-900 flex items-center gap-2">
                <Calculator size={15} className="text-zinc-500" />
                Descuentos por Estancia (Beds24 Daily Price Rules)
              </h3>
              <p className="text-[11px] text-zinc-400 font-semibold mt-1">
                Reglas automáticas aplicadas en Beds24 según el número de noches de la reserva.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {beds24Rooms.map(room => {
                if (!room.tiers || room.tiers.length === 0) return null;
                const losExpanded = expandedLos[room.id] ?? false;

                return (
                  <div key={room.id} className="border border-zinc-150 rounded-2xl overflow-hidden bg-zinc-50/20">
                    <button
                      onClick={() => setExpandedLos(prev => ({ ...prev, [room.id]: !prev[room.id] }))}
                      className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors border-b border-zinc-150"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{room.icon}</span>
                        <span className="text-[12px] font-black text-zinc-800">{room.name}</span>
                      </div>
                      <span className="text-[10px] text-zinc-450">{losExpanded ? '▲ Colapsar' : '▼ Ver descuentos'}</span>
                    </button>

                    {losExpanded && (
                      <div className="p-4 space-y-0">
                        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-1 pb-1.5 mb-1 border-b border-zinc-100 text-[8px] font-extrabold text-zinc-450 uppercase">
                          <span>Estancia</span>
                          <span className="text-right">Directo</span>
                          <span className="text-right text-rose-450">Airbnb</span>
                          <span className="text-right text-sky-450">Booking</span>
                        </div>
                        {(room.tiers as any[]).map((tier: any, idx: number) => {
                          const isBase = tier.offsetPct === 0;
                          const stayLabel = tier.maxStay >= 100 ? `${tier.minStay}+ noches` : `${tier.minStay}-${tier.maxStay} noches`;
                          return (
                            <div key={idx} className={`grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-1 py-1 ${isBase ? 'font-extrabold text-zinc-800' : 'text-zinc-500'} text-[10px]`}>
                              <div className="flex items-center gap-1 min-w-0">
                                {!isBase && <span className="text-[8px] text-emerald-600 font-black shrink-0">{tier.offsetPct}%</span>}
                                <span className="truncate">{stayLabel}</span>
                              </div>
                              <span className="text-right">{tier.priceDirecto > 0 ? `$${tier.priceDirecto.toLocaleString('es-MX')}` : '—'}</span>
                              <span className={`text-right ${isBase ? 'text-rose-600 font-extrabold' : 'text-rose-450'}`}>{tier.priceAirbnb > 0 ? `$${tier.priceAirbnb.toLocaleString('es-MX')}` : '—'}</span>
                              <span className={`text-right ${isBase ? 'text-sky-600 font-extrabold' : 'text-sky-450'}`}>{tier.priceBooking > 0 ? `$${tier.priceBooking.toLocaleString('es-MX')}` : '—'}</span>
                            </div>
                          );
                        })}
                        <p className="text-[8px] text-zinc-400 pt-2 italic">* Calculado sobre la tarifa de referencia de la 1ª temporada en Beds24</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sección de Capacidades de Habitaciones */}
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-[13px] font-extrabold text-zinc-900 flex items-center gap-2">
                👥 Configuración de Capacidades (Huéspedes)
              </h3>
              <p className="text-[11px] text-zinc-400 font-semibold mt-1">
                Configura el número de huéspedes permitidos sin costo (Base) y con costo adicional (Máx). Estos valores regulan las alertas de capacidad y los cálculos del recargo de huéspedes adicionales.
              </p>
            </div>

            {/* Tarjeta de Costo por Huésped Adicional */}
            <div className="bg-zinc-50 border border-zinc-200/60 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-lg shrink-0">💰</span>
                <div>
                  <p className="text-[12.5px] font-black text-zinc-800">Costo por Huésped Adicional</p>
                  <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">Recargo neto por cada huésped extra por noche</p>
                </div>
              </div>
              <div className="w-full sm:w-48 flex items-center bg-white border border-zinc-200 rounded-xl px-3 py-1.5 focus-within:border-indigo-300">
                <span className="text-[12.5px] font-black text-zinc-400 mr-1.5">$</span>
                <input
                  type="number"
                  value={capacitySettings.extra_guest_price !== undefined ? capacitySettings.extra_guest_price : 500}
                  onChange={e => setCapacitySettings(prev => ({
                    ...prev,
                    extra_guest_price: Math.max(0, Number(e.target.value) || 0)
                  }))}
                  className="w-full text-[12px] font-black text-zinc-900 outline-none text-right bg-transparent"
                  placeholder="500"
                />
                <span className="text-[11px] font-bold text-zinc-400 ml-1.5">MXN</span>
              </div>
            </div>

            <div className="divide-y divide-zinc-100 space-y-4">
              {[
                { id: '679077', name: 'Habitación Doble (301-306)', icon: '🛏️' },
                { id: '679087', name: 'Apartamento 1 dorm. (402)', icon: '🏠' },
                { id: '679091', name: 'Apartamento 2 dorm. (201-206)', icon: '🏠' },
                { id: '679092', name: 'Apartamento 3 dorm. (101-107)', icon: '🏡' },
                { id: '679093', name: 'Casa Vacacional 3 dorm. (401)', icon: '🏖️' },
                { id: '685542', name: 'Habitación Sencilla (500)', icon: '🛏️' },
                { id: '685542_501', name: 'Habitaciones Dobles (501-507)', icon: '✨' },
              ].map(item => {
                const config = capacitySettings[item.id] || { base: 4, max: 4 };
                return (
                  <div key={item.id} className="pt-4 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5 min-w-0 sm:w-[40%]">
                      <span className="text-lg shrink-0">{item.icon}</span>
                      <p className="text-[12.5px] font-black text-zinc-800 truncate">{item.name}</p>
                    </div>

                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Huéspedes sin costo (Base)</span>
                        <input
                          type="number"
                          value={config.base}
                          onChange={e => setCapacitySettings(prev => ({
                            ...prev,
                            [item.id]: { ...config, base: Math.max(1, Number(e.target.value) || 1) }
                          }))}
                          className="w-full px-3 py-1.5 text-[12px] font-black rounded-lg border border-zinc-200 bg-zinc-50/30 text-zinc-900 focus:border-indigo-300 outline-none text-right"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Huéspedes Máximos (Límite)</span>
                        <input
                          type="number"
                          value={config.max}
                          onChange={e => setCapacitySettings(prev => ({
                            ...prev,
                            [item.id]: { ...config, max: Math.max(config.base, Number(e.target.value) || config.base) }
                          }))}
                          className="w-full px-3 py-1.5 text-[12px] font-black rounded-lg border border-zinc-200 bg-zinc-50/30 text-zinc-900 focus:border-indigo-300 outline-none text-right"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-zinc-100 flex justify-end">
              <button
                onClick={handleSaveCapacitySettings}
                disabled={savingCapacity}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-[0.96] flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                {savingCapacity ? (
                  <RefreshCw size={12} className="animate-spin" />
                ) : (
                  <Check size={12} strokeWidth={3} />
                )}
                <span>Guardar Capacidades</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
