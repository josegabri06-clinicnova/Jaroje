"use client";

import { useState, useEffect } from 'react';
import { 
  Calculator, Zap, Check, AlertCircle, RefreshCw, X
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
    } catch (err: any) {
      setBeds24Error('Error de red: ' + err.message);
    } finally {
      setBeds24Loading(false);
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



  useEffect(() => {
    loadBeds24Prices();
  }, []);

  return (
    <div className="space-y-6 pb-24 bg-[#fafafa] min-h-screen text-zinc-950 font-sans">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-950 to-indigo-900 px-6 py-8 rounded-b-[24px] shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4 text-white">
        <div>
          <span className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-widest block mb-1">Sincronización Beds24 · Bidirecional</span>
          <h2 className="text-[24px] font-black tracking-tight leading-none">Manipulador de precios</h2>
          <p className="text-[13px] text-indigo-200 mt-1.5 font-medium">
            Edita las tarifas de Beds24 directamente desde la app. Los cambios se sincronizan automáticamente.
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-6">
        <div className="space-y-6 animate-in fade-in duration-200">

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
                                  <div className="flex-1 grid grid-cols-4 items-center gap-4">
                                    
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
        </div>
      </div>
    </div>
  );
}
