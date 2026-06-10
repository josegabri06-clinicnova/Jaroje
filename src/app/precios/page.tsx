"use client";

import { useState, useEffect, useMemo } from 'react';
import { 
  Calculator, Calendar, Tag, ChevronDown, TrendingUp, Zap, 
  Plus, Trash2, Edit2, Info, Check, AlertCircle, RefreshCw, Users, Shield, ArrowRight, X
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { getLengthOfStayMultiplier } from '@/lib/beds24';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ─── CONFIGURACIONES DE HABITACIONES ──────────────────────────────────────────
const ROOMS = [
  { id: '679077', name: 'Habitación DOBLE - 2 camas dobles', icon: '🛏️', capacity: 4, baseCapacity: 2 },
  { id: '679087', name: 'Apartamento Premier de 1 dormitorio', icon: '🏠', capacity: 4, baseCapacity: 2 },
  { id: '679091', name: 'Apartamento Premier de 2 dormitorios', icon: '🏡', capacity: 8, baseCapacity: 4 },
  { id: '679092', name: 'Apartamento Premier de 3 dormitorios', icon: '🏘️', capacity: 12, baseCapacity: 6 },
  { id: '679093', name: 'Casa Vacacional de 3 dormitorios', icon: '💎', capacity: 16, baseCapacity: 8 },
];

const CHANNELS = [
  { id: 'directo',  label: 'Directo / WhatsApp', multiplier: 1.00, color: 'bg-blue-600 text-white border-blue-600' },
  { id: 'booking',  label: 'Booking.com',         multiplier: 1.10, color: 'bg-[#003580] text-white border-[#003580]' },
  { id: 'airbnb',   label: 'Airbnb',              multiplier: 1.25, color: 'bg-[#ff5a5f] text-white border-[#ff5a5f]' },
];

const TAX = 0.19; // 16% IVA + 3% ISH estatal

const SEASONS = [
  { id: 'baja',       label: 'Baja',        color: '#3b82f6', bg: '#eff6ff', months: 'May · Jun · Sep' },
  { id: 'media',      label: 'Media',       color: '#f59e0b', bg: '#fffbeb', months: 'Ene · Feb · Mar · Oct · Nov' },
  { id: 'media_alta', label: 'Media-Alta',  color: '#f97316', bg: '#fff7ed', months: 'Jul · Ago · Dic (1-19) · Nov 1-5' },
  { id: 'alta',       label: 'Alta',        color: '#ef4444', bg: '#fef2f2', months: 'Dic 20-31 · Ene 1-6 · Abr 1-14' },
];

// Fallback estático en caso de que no haya reglas de tarifas en la DB
const FALLBACK_PRICES: Record<string, Record<string, number>> = {
  '679077': { baja: 1600, media: 1900, media_alta: 2000, alta: 2200 },
  '679087': { baja: 2400, media: 2850, media_alta: 3000, alta: 3300 },
  '679091': { baja: 3200, media: 3800, media_alta: 4000, alta: 4400 },
  '679092': { baja: 4800, media: 5700, media_alta: 6000, alta: 6600 },
  '679093': { baja: 6400, media: 7600, media_alta: 8000, alta: 8800 },
};

function getSeason(dateStr: string): string {
  if (!dateStr) return 'media';

  // 1. Rangos específicos definidos por el usuario para 2025-2027
  // TEMPORADA ALTA
  if (
    (dateStr >= '2025-12-20' && dateStr <= '2026-01-10') ||
    (dateStr >= '2026-03-27' && dateStr <= '2026-04-11') ||
    (dateStr >= '2026-12-20' && dateStr <= '2027-01-10') ||
    (dateStr >= '2027-03-19' && dateStr <= '2027-04-03') ||
    (dateStr >= '2027-12-20' && dateStr <= '2028-01-10')
  ) {
    return 'alta';
  }

  // TEMPORADA MEDIA-ALTA
  if (
    (dateStr >= '2025-12-15' && dateStr <= '2025-12-19') ||
    (dateStr >= '2026-07-15' && dateStr <= '2026-08-16') ||
    (dateStr >= '2026-12-15' && dateStr <= '2026-12-19') ||
    (dateStr >= '2027-07-15' && dateStr <= '2027-08-16') ||
    (dateStr >= '2027-12-15' && dateStr <= '2027-12-19')
  ) {
    return 'media_alta';
  }

  // TEMPORADA MEDIA
  if (
    (dateStr >= '2026-01-11' && dateStr <= '2026-03-26') ||
    (dateStr >= '2026-08-17' && dateStr <= '2026-08-31') ||
    (dateStr >= '2026-09-12' && dateStr <= '2026-09-15') ||
    (dateStr >= '2026-11-01' && dateStr <= '2026-12-14') ||
    (dateStr >= '2027-01-11' && dateStr <= '2027-03-18') ||
    (dateStr >= '2027-08-17' && dateStr <= '2027-08-31') ||
    (dateStr >= '2027-09-12' && dateStr <= '2027-09-15') ||
    (dateStr >= '2027-11-01' && dateStr <= '2027-12-14')
  ) {
    return 'media';
  }

  // Si es del periodo 2025-2027 y no cayó en ninguna de las anteriores, es BAJA ("Resto del año")
  if (dateStr >= '2025-01-01' && dateStr <= '2027-12-31') {
    return 'baja';
  }

  // 2. Fallback genérico mensual para otros años futuros (2028+)
  const d = new Date(dateStr + 'T12:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();

  if ((month === 12 && day >= 20) || (month === 1 && day <= 10)) return 'alta';
  if ((month === 3 && day >= 22) || (month === 4 && day <= 7)) return 'alta';
  if ((month === 7 && day >= 15) || (month === 8 && day <= 16)) return 'media_alta';
  if (month === 12 && day >= 15 && day <= 19) return 'media_alta';
  if (month === 1 && day >= 11) return 'media';
  if (month === 2) return 'media';
  if (month === 3 && day < 22) return 'media';
  if (month === 8 && day >= 17 && day <= 31) return 'media';
  if (month === 9 && day >= 12 && day <= 15) return 'media';
  if (month === 11 || (month === 12 && day <= 14)) return 'media';
  return 'baja';
}

function fmt(n: number) {
  return 'MX$' + Math.round(n).toLocaleString('es-MX');
}

const todayStr = new Date().toISOString().split('T')[0];
const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();

export default function PreciosPage() {
  const [activeTab, setActiveTab] = useState<'configuracion' | 'simulador'>('configuracion');
  
  // API State
  const [rules, setRules] = useState<any[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Beds24 direct pricing state
  const [beds24Loading, setBeds24Loading] = useState(false);
  const [beds24Rooms, setBeds24Rooms] = useState<any[]>([]); // rooms con precios del calendario
  const [beds24Multipliers, setBeds24Multipliers] = useState({ airbnb: 1.20, booking: 1.35 });
  const [beds24Error, setBeds24Error] = useState<string | null>(null);
  // Key format: `${roomId}_${fromDate}` — permite editar cada bloque de temporada por separado
  const [savingPriceKey, setSavingPriceKey] = useState<string | null>(null);
  const [editedPrices, setEditedPrices] = useState<Record<string, string>>({});  
  const [editedSeasonPrices, setEditedSeasonPrices] = useState<Record<string, string>>({});  
  const [savingSeasonKey, setSavingSeasonKey] = useState<string | null>(null);
  const [expandedLos, setExpandedLos] = useState<Record<string, boolean>>({}); // roomId → expandido
  const [savingMultipliers, setSavingMultipliers] = useState(false);

  // Form State
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formRoomTypeId, setFormRoomTypeId] = useState('679091');
  const [formRuleType, setFormRuleType] = useState<'base' | 'seasonal' | 'special'>('base');
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');

  // Simulator State
  const [simRoomId, setSimRoomId] = useState('679091');
  const [simCheckIn, setSimCheckIn] = useState(todayStr);
  const [simCheckOut, setSimCheckOut] = useState(tomorrowStr);
  const [simGuests, setSimGuests] = useState(2);
  const [simChannelId, setSimChannelId] = useState('directo');

  // Dynamic Settings (Discounts & Multipliers) State
  const [pricingSettings, setPricingSettings] = useState<Record<string, any>>({});
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Unit Config Tab States
  const [configRoomId, setConfigRoomId] = useState('679091');
  
  const [configBasePrice, setConfigBasePrice] = useState('');
  const [configSeasonName, setConfigSeasonName] = useState('');
  const [configSeasonPrice, setConfigSeasonPrice] = useState('');
  const [configSeasonStart, setConfigSeasonStart] = useState('');
  const [configSeasonEnd, setConfigSeasonEnd] = useState('');

  const [discNights7, setDiscNights7] = useState('15');
  const [discNights15, setDiscNights15] = useState('25');
  const [discNights30, setDiscNights30] = useState('40');

  const [multAirbnb, setMultAirbnb] = useState('1.20');
  const [multBooking, setMultBooking] = useState('1.35');
  const [multDirecto, setMultDirecto] = useState('1.00');
  const [syncingBeds24, setSyncingBeds24] = useState(false);

  // Fetch Pricing Settings (JSON) from DB
  const fetchPricingSettings = async () => {
    setLoadingSettings(true);
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'pricing_unit_settings')
        .maybeSingle();

      if (error) {
        console.error("Error al cargar pricing_unit_settings:", error.message);
      } else if (data && data.value) {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        setPricingSettings(parsed || {});
      }
    } catch (err) {
      console.error("Excepción al cargar pricing_unit_settings:", err);
    } finally {
      setLoadingSettings(false);
    }
  };

  // Save Pricing Settings helper
  const savePricingSettings = async (newSettings: Record<string, any>) => {
    try {
      const { error } = await supabase
        .from('settings')
        .upsert(
          { key: 'pricing_unit_settings', value: JSON.stringify(newSettings) },
          { onConflict: 'key' }
        );
      if (error) throw error;
      setPricingSettings(newSettings);
      return true;
    } catch (err: any) {
      alert(`Error al guardar configuración: ${err.message}`);
      return false;
    }
  };

  // Fetch Rules from DB
  const fetchRules = async () => {
    setLoadingRules(true);
    try {
      const res = await fetch('/api/precios');
      const json = await res.json();
      if (json.success && json.data) {
        setRules(json.data);
      }
    } catch (err) {
      console.error("Error cargando reglas de precio:", err);
    } finally {
      setLoadingRules(false);
    }
  };

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
      if (json.multipliers) setBeds24Multipliers(json.multipliers);
    } catch (err: any) {
      setBeds24Error('Error de red: ' + err.message);
    } finally {
      setBeds24Loading(false);
    }
  };

  // Guardar precio base de habitación en Beds24 (precio SIN impuestos)
  /**
   * Guarda el precio de un bloque de temporada específico en Beds24.
   * block = { roomId, roomName, from, to, fromLabel, toLabel, seasonLabel, priceRaw }
   */
  const handleSaveBlockPrice = async (block: {
    roomId: string;
    roomName: string;
    from: string;
    to: string;
    fromLabel: string;
    toLabel: string;
    seasonLabel: string;
    currentPriceRaw: number;
  }) => {
    const priceKey = `${block.roomId}_${block.from}`;
    const rawInput = editedPrices[priceKey];
    const newPriceRaw = Number(rawInput);

    if (!newPriceRaw || isNaN(newPriceRaw) || newPriceRaw <= 0) {
      alert('Ingresa un precio válido mayor que 0.');
      return;
    }

    const precioDirecto = Math.round(newPriceRaw * 1.19).toLocaleString('es-MX');
    const precioAirbnb  = Math.round(newPriceRaw * beds24Multipliers.airbnb * 1.19).toLocaleString('es-MX');
    const precioBooking = Math.round(newPriceRaw * beds24Multipliers.booking * 1.19).toLocaleString('es-MX');

    const confirmed = window.confirm(
      `⚠️ CONFIRMAR CAMBIO EN BEDS24\n\n` +
      `Habitación: ${block.roomName}\n` +
      `Temporada: ${block.seasonLabel}\n` +
      `Periodo: ${block.fromLabel} — ${block.toLabel}\n` +
      `Nuevo precio base: $${newPriceRaw.toLocaleString('es-MX')} (sin impuestos)\n\n` +
      `Los huéspedes verán (1-6 noches):\n` +
      `  · Directo:  $${precioDirecto}\n` +
      `  · Airbnb:   $${precioAirbnb}\n` +
      `  · Booking:  $${precioBooking}\n\n` +
      `Solo se modifica ESTE periodo en Beds24.\n` +
      `Las reservas ya confirmadas NO se ven afectadas.\n\n` +
      `¿Continuar?`
    );
    if (!confirmed) return;

    setSavingPriceKey(priceKey);
    try {
      const res = await fetch('/api/beds24-prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: block.roomId,
          priceRaw: newPriceRaw,
          from: block.from,
          to: block.to,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      
      // Actualizar localmente el bloque modificado
      setBeds24Rooms(prev => prev.map(room => {
        if (room.id !== block.roomId) return room;
        return {
          ...room,
          seasonBlocks: (room.seasonBlocks || []).map((b: any) => {
            if (b.from !== block.from) return b;
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

      setEditedPrices(prev => { const n = { ...prev }; delete n[priceKey]; return n; });
      alert(`✅ Precio actualizado en Beds24.\n${block.seasonLabel} → $${newPriceRaw.toLocaleString('es-MX')} (sin imp.)`);
    } catch (err: any) {
      alert('Error al guardar en Beds24: ' + err.message);
    } finally {
      setSavingPriceKey(null);
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
      `  · Directo:  $${precioDirecto}\n` +
      `  · Airbnb:   $${precioAirbnb}\n` +
      `  · Booking:  $${precioBooking}\n\n` +
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

        // Si no hay bloques de Beds24 cargados para este periodo, usamos un rango genérico basado en la configuración
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

  // Save OTA multipliers to Supabase
  const handleSaveMultipliers = async () => {
    setSavingMultipliers(true);
    try {
      const res = await fetch('/api/beds24-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(beds24Multipliers),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      alert('✅ Multiplicadores guardados correctamente.');
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSavingMultipliers(false);
    }
  };

  useEffect(() => {
    fetchRules();
    fetchPricingSettings();
    loadBeds24Prices();
  }, []);

  // Update inputs whenever selected unit config changes or dynamic pricing settings change
  useEffect(() => {
    const unitConf = pricingSettings[configRoomId] || {};
    setDiscNights7(unitConf.discounts?.nights7 !== undefined ? String(unitConf.discounts.nights7) : '15');
    setDiscNights15(unitConf.discounts?.nights15 !== undefined ? String(unitConf.discounts.nights15) : '25');
    setDiscNights30(unitConf.discounts?.nights30 !== undefined ? String(unitConf.discounts.nights30) : '40');

    setMultAirbnb(unitConf.multipliers?.airbnb !== undefined ? String(unitConf.multipliers.airbnb) : '1.20');
    setMultBooking(unitConf.multipliers?.booking !== undefined ? String(unitConf.multipliers.booking) : '1.35');
    setMultDirecto(unitConf.multipliers?.directo !== undefined ? String(unitConf.multipliers.directo) : '1.00');

    const baseRule = rules.find(r => r.room_type_id === configRoomId && r.rule_type === 'base');
    setConfigBasePrice(baseRule ? String(baseRule.price) : String(FALLBACK_PRICES[configRoomId]?.baja || 2000));
  }, [configRoomId, pricingSettings, rules]);

  // Save base price to pricing_rules
  const handleSaveBasePrice = async () => {
    if (!configBasePrice || isNaN(Number(configBasePrice))) {
      alert("Por favor ingresa un precio base válido.");
      return;
    }
    setActionLoading(true);
    try {
      const existingBaseRule = rules.find(r => r.room_type_id === configRoomId && r.rule_type === 'base');
      const payload: any = {
        room_type_id: configRoomId,
        rule_type: 'base',
        name: 'Tarifa Base',
        price: Number(configBasePrice)
      };
      if (existingBaseRule) {
        payload.id = existingBaseRule.id;
      }
      
      const res = await fetch('/api/precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fallo al guardar la tarifa base");
      
      // Log audit
      try {
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: '999',
            employee_name: 'Administrador',
            department: 'admin',
            module: 'precios',
            action: 'precio_base_actualizado',
            details: JSON.stringify({
              text: `Actualizó tarifa base para ${ROOMS.find(r => r.id === configRoomId)?.name || configRoomId} a MX$${configBasePrice}`
            })
          })
        });
      } catch (logErr) {
        console.error("Error log audit:", logErr);
      }

      alert("Tarifa base guardada con éxito.");
      fetchRules();
      
      // Sincronización automática de Beds24
      fetch('/api/precios/sync', { method: 'POST' });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Add seasonal rate to pricing_rules
  const handleSaveSeasonPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configSeasonName || !configSeasonPrice || !configSeasonStart || !configSeasonEnd) {
      alert("Por favor completa todos los campos de la tarifa de temporada.");
      return;
    }
    setActionLoading(true);
    try {
      const payload = {
        room_type_id: configRoomId,
        rule_type: 'seasonal',
        name: configSeasonName,
        price: Number(configSeasonPrice),
        start_date: configSeasonStart,
        end_date: configSeasonEnd
      };
      
      const res = await fetch('/api/precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fallo al guardar tarifa de temporada");

      // Log audit
      try {
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: '999',
            employee_name: 'Administrador',
            department: 'admin',
            module: 'precios',
            action: 'precio_temporada_creado',
            details: JSON.stringify({
              text: `Creó tarifa de temporada "${configSeasonName}" (MX$${configSeasonPrice}) de ${configSeasonStart} a ${configSeasonEnd} para ${ROOMS.find(r => r.id === configRoomId)?.name || configRoomId}`
            })
          })
        });
      } catch (logErr) {
        console.error("Error log audit:", logErr);
      }

      alert("Tarifa de temporada agregada con éxito.");
      setConfigSeasonName('');
      setConfigSeasonPrice('');
      setConfigSeasonStart('');
      setConfigSeasonEnd('');
      
      fetchRules();
      fetch('/api/precios/sync', { method: 'POST' });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Save Custom discounts & multipliers to settings table
  const handleSaveDiscountsAndMultipliers = async () => {
    if (isNaN(Number(discNights7)) || isNaN(Number(discNights15)) || isNaN(Number(discNights30)) ||
        isNaN(Number(multAirbnb)) || isNaN(Number(multBooking)) || isNaN(Number(multDirecto))) {
      alert("Por favor ingresa valores numéricos válidos para los descuentos y multiplicadores.");
      return;
    }
    setSavingSettings(true);
    try {
      const updatedSettings = {
        ...pricingSettings,
        [configRoomId]: {
          discounts: {
            nights7: Number(discNights7),
            nights15: Number(discNights15),
            nights30: Number(discNights30)
          },
          multipliers: {
            airbnb: Number(multAirbnb),
            booking: Number(multBooking),
            directo: Number(multDirecto)
          }
        }
      };

      const success = await savePricingSettings(updatedSettings);
      if (success) {
        // Log audit
        try {
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_num: '999',
              employee_name: 'Administrador',
              department: 'admin',
              module: 'precios',
              action: 'ajustes_unidad_actualizados',
              details: JSON.stringify({
                text: `Actualizó multiplicadores/descuentos para ${ROOMS.find(r => r.id === configRoomId)?.name || configRoomId}`
              })
            })
          });
        } catch (logErr) {
          console.error("Error log audit:", logErr);
        }
        alert("Descuentos y multiplicadores guardados correctamente.");
      }
    } catch (err: any) {
      alert(`Error al guardar: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Sincronización de precios y multiplicadores desde Beds24 API ─────────────
  const handleSyncFromBeds24 = async () => {
    setSyncingBeds24(true);
    try {
      const res = await fetch('/api/beds24-prices?t=' + Date.now());
      const json = await res.json();

      if (!json.success) {
        if (json.error === 'TOKEN_EXPIRED') {
          alert('Token de Beds24 caducado. Genera uno nuevo en Beds24 > Marketplace > API.');
          return;
        }
        alert(`Error al sincronizar con Beds24: ${json.error}`);
        return;
      }

      const { rooms: beds24RoomsList, multipliers } = json;

      // 1️⃣ Actualizar multiplicadores OTA en los campos del formulario
      if (multipliers) {
        if (multipliers.airbnb !== undefined) setMultAirbnb(String(multipliers.airbnb));
        if (multipliers.booking !== undefined) setMultBooking(String(multipliers.booking));
      }

      // 2️⃣ Mapear bloques de temporada y upsertear en pricing_rules
      if (beds24RoomsList && beds24RoomsList.length > 0) {
        let rulesUpdated = 0;
        const summary: string[] = [];

        for (const room of beds24RoomsList) {
          const getPriceForSeason = (seasonId: string) => {
            const block = room.seasonBlocks?.find((b: any) => b.season === seasonId);
            return block ? Number(block.priceRaw) : null;
          };

          const baja = getPriceForSeason('baja');
          const media = getPriceForSeason('media');
          const media_alta = getPriceForSeason('media_alta');
          const alta = getPriceForSeason('alta');

          if (baja === null && media === null && media_alta === null && alta === null) continue;

          summary.push(`\n${room.name}: Baja $${baja || '—'} | Media $${media || '—'} | M-Alta $${media_alta || '—'} | Alta $${alta || '—'}`);

          const seasonMapping = [
            { name: 'Temporada Baja', price: baja },
            { name: 'Temporada Media', price: media },
            { name: 'Temporada Media-Alta', price: media_alta },
            { name: 'Temporada Alta', price: alta },
          ];

          for (const { name, price } of seasonMapping) {
            if (price === null || price === undefined || price <= 0) continue;

            const existingRule = rules.find(
              r => r.room_type_id === room.id && r.name === name
            );

            await fetch('/api/precios', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...(existingRule ? { id: existingRule.id } : {}),
                room_type_id: room.id,
                rule_type: 'seasonal',
                name,
                price: Math.round(price),
              }),
            });
            rulesUpdated++;
          }
        }

        await fetchRules();
        alert(
          `✅ Sincronización exitosa desde Beds24\n` +
          `📊 Precios base importados (sin impuestos):` +
          summary.join('') +
          `\n\n${rulesUpdated} reglas actualizadas en Supabase.`
        );
      } else {
        alert(
          `⚠️ Beds24 no devolvió precios del calendario.\n\n` +
          `Revisa que:\n• Las habitaciones tengan precios en Beds24\n• El token tiene scope "inventory"\n• Hay precios activos para los próximos 540 días`
        );
      }
    } catch (err: any) {
      alert(`Error de red: ${err.message}`);
    } finally {
      setSyncingBeds24(false);
    }
  };

  // Sync simulator guests physical limit
  const selectedRoomMetadata = useMemo(() => {
    return ROOMS.find(r => r.id === simRoomId) || ROOMS[0];
  }, [simRoomId]);

  useEffect(() => {
    if (simGuests > selectedRoomMetadata.capacity) {
      setSimGuests(selectedRoomMetadata.capacity);
    }
  }, [simRoomId, selectedRoomMetadata]);

  // Pricing cascade calculation
  const quote = useMemo(() => {
    const emptyResult = {
      nights: 0,
      breakdown: [] as any[],
      totalBaseWithoutSurcharge: 0,
      discountMult: 1.00,
      discountedBaseSum: 0,
      totalSurcharges: 0,
      subtotalWithSurcharge: 0,
      totalWithChannel: 0,
      taxAmount: 0,
      finalTotal: 0,
      extraGuests: 0,
      channelMultiplier: 1.00
    };
    if (!simCheckIn || !simCheckOut) return emptyResult;
    const dStart = new Date(simCheckIn + 'T12:00:00');
    const dEnd = new Date(simCheckOut + 'T12:00:00');
    if (dEnd <= dStart) return emptyResult;

    const nights = Math.max(1, Math.round((dEnd.getTime() - dStart.getTime()) / 86400000));
    const breakdown: any[] = [];
    let totalBaseWithoutSurcharge = 0;
    let totalSurcharges = 0;

    const capacityBase = selectedRoomMetadata.baseCapacity;
    const extraGuests = Math.max(0, simGuests - capacityBase);
    const surchargePerNight = 0; // Desactivado: tarifa plana por habitación (anteriormente extraGuests * 200)

    const customDiscounts = pricingSettings?.[simRoomId]?.discounts;
    const discountMult = getLengthOfStayMultiplier(nights, customDiscounts);

    for (let i = 0; i < nights; i++) {
      const curr = new Date(dStart);
      curr.setDate(dStart.getDate() + i);
      const dateStr = curr.toISOString().split('T')[0];

      // 0. Buscar precio en vivo de Beds24
      const beds24Room = beds24Rooms.find(r => r.id === simRoomId);
      const activeBlock = beds24Room?.seasonBlocks?.find((block: any) => 
        block.from <= dateStr && dateStr <= block.to
      );

      // 1. Buscar regla especial
      const specialRule = rules.find(r => 
        r.room_type_id === simRoomId && 
        r.rule_type === 'special' && 
        r.start_date <= dateStr && 
        r.end_date >= dateStr
      );

      // 2. Buscar regla de temporada
      const seasonalRule = rules.find(r => 
        r.room_type_id === simRoomId && 
        r.rule_type === 'seasonal' && 
        r.start_date <= dateStr && 
        r.end_date >= dateStr
      );

      // 3. Buscar regla base
      const baseRule = rules.find(r => 
        r.room_type_id === simRoomId && 
        r.rule_type === 'base'
      );

      let priceUsed = 0;
      let ruleName = '';
      let ruleSource = '';

      if (activeBlock) {
        priceUsed = Number(activeBlock.priceRaw);
        ruleName = `${activeBlock.seasonLabel} (Beds24 Live)`;
        ruleSource = 'beds24';
      } else if (specialRule) {
        priceUsed = Number(specialRule.price);
        ruleName = `${specialRule.name} (Especial)`;
        ruleSource = 'special';
      } else if (seasonalRule) {
        priceUsed = Number(seasonalRule.price);
        ruleName = `${seasonalRule.name} (Temporada)`;
        ruleSource = 'seasonal';
      } else if (baseRule) {
        priceUsed = Number(baseRule.price);
        ruleName = 'Tarifa Base DB';
        ruleSource = 'base';
      } else {
        const fallbackSeason = getSeason(dateStr);
        priceUsed = FALLBACK_PRICES[simRoomId]?.[fallbackSeason] ?? 0;
        ruleName = `Predeterminado (${fallbackSeason})`;
        ruleSource = 'fallback';
      }

      totalBaseWithoutSurcharge += priceUsed;
      totalSurcharges += surchargePerNight;

      const discountedBasePrice = Math.round(priceUsed * discountMult);

      breakdown.push({
        date: dateStr,
        basePrice: priceUsed,
        discountedBasePrice,
        surcharge: surchargePerNight,
        totalNight: discountedBasePrice + surchargePerNight,
        ruleName,
        ruleSource
      });
    }

    const customMultipliers = pricingSettings?.[simRoomId]?.multipliers;
    const customMultVal = customMultipliers?.[simChannelId] !== undefined
      ? Number(customMultipliers[simChannelId])
      : (simChannelId === 'airbnb' ? beds24Multipliers.airbnb : simChannelId === 'booking' ? beds24Multipliers.booking : 1.00);

    const discountedBaseSum = Math.round(totalBaseWithoutSurcharge * discountMult);
    const subtotalWithSurcharge = discountedBaseSum + totalSurcharges;
    const totalWithChannel = Math.round(subtotalWithSurcharge * customMultVal);
    const taxAmount = Math.round(totalWithChannel * TAX);
    const finalTotal = totalWithChannel + taxAmount;

    return {
      nights,
      breakdown,
      totalBaseWithoutSurcharge,
      discountMult,
      discountedBaseSum,
      totalSurcharges,
      subtotalWithSurcharge,
      totalWithChannel,
      taxAmount,
      finalTotal,
      extraGuests,
      channelMultiplier: customMultVal
    };
  }, [simRoomId, simCheckIn, simCheckOut, simGuests, simChannelId, rules, selectedRoomMetadata, pricingSettings, beds24Rooms, beds24Multipliers]);

  // Save Rule
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formPrice) {
      alert("Por favor completa los campos obligatorios.");
      return;
    }

    setActionLoading(true);
    try {
      const payload: any = {
        room_type_id: formRoomTypeId,
        rule_type: formRuleType,
        name: formName,
        price: Number(formPrice)
      };

      if (formRuleType !== 'base') {
        if (!formStartDate || !formEndDate) {
          alert("Debes proporcionar las fechas de inicio y fin para reglas temporales o especiales.");
          setActionLoading(false);
          return;
        }
        payload.start_date = formStartDate;
        payload.end_date = formEndDate;
      }

      if (editingRuleId) {
        payload.id = editingRuleId;
      }

      const res = await fetch('/api/precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || "Fallo al guardar la regla");

      // Log action
      try {
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: '999', employee_name: 'Administrador',
            department: 'admin', module: 'precios',
            action: editingRuleId ? 'precio_regla_actualizada' : 'precio_regla_creada',
            details: JSON.stringify({ text: `${editingRuleId ? 'Actualizó' : 'Creó'} regla "${formName}" — ${formRuleType} MX$${formPrice}` })
          })
        });
      } catch (logErr) { console.error('Error log audit:', logErr); }

      alert('Regla guardada con éxito.');
      setShowFormModal(false);
      resetForm();
      fetchRules();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Rule
  const handleDeleteRule = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar la regla "${name}"?`)) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/precios?id=${id}`, {
        method: 'DELETE'
      });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || "Fallo al borrar");

      // Log audit
      try {
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: '999',
            employee_name: 'Administrador',
            department: 'admin',
            module: 'precios',
            action: 'precio_regla_eliminada',
            details: JSON.stringify({
              text: `Eliminó regla de precio "${name}"`
            })
          })
        });
      } catch (logErr) {
        console.error("Error log audit:", logErr);
      }

      alert('Regla eliminada.');
      fetchRules();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const resetForm = () => {
    setEditingRuleId(null);
    setFormName('');
    setFormPrice('');
    setFormStartDate('');
    setFormEndDate('');
    setFormRuleType('base');
  };

  const handleEditRuleClick = (rule: any) => {
    setEditingRuleId(rule.id);
    setFormRoomTypeId(rule.room_type_id);
    setFormRuleType(rule.rule_type);
    setFormName(rule.name);
    setFormPrice(String(rule.price));
    setFormStartDate(rule.start_date || '');
    setFormEndDate(rule.end_date || '');
    setShowFormModal(true);
  };

  // Helper values for dynamically matching base prices from rule table
  const dynamicBasePriceGrid = useMemo(() => {
    const grid: Record<string, Record<string, number>> = {};
    ROOMS.forEach(r => {
      grid[r.id] = { baja: 0, media: 0, media_alta: 0, alta: 0 };
      
      // Look for custom seasonal/base pricing rule
      const baseRule = rules.find(rule => rule.room_type_id === r.id && rule.rule_type === 'base');
      
      SEASONS.forEach(s => {
        // Find if there is a seasonal rule matching typical months or manually configured in DB matching name
        const matchSeasonal = rules.find(rule => 
          rule.room_type_id === r.id && 
          rule.rule_type === 'seasonal' && 
          rule.name.toLowerCase().includes(s.label.toLowerCase())
        );

        if (matchSeasonal) {
          grid[r.id][s.id] = Number(matchSeasonal.price);
        } else if (baseRule) {
          // If no specific seasonal rule is found, use base price or default to fallback + season multiplier
          const fallbackSeasonBase = FALLBACK_PRICES[r.id][s.id];
          const fallbackBaseDefault = FALLBACK_PRICES[r.id].baja;
          const ratio = fallbackSeasonBase / fallbackBaseDefault;
          grid[r.id][s.id] = Math.round(Number(baseRule.price) * ratio);
        } else {
          grid[r.id][s.id] = FALLBACK_PRICES[r.id][s.id];
        }
      });
    });
    return grid;
  }, [rules]);

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
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => { resetForm(); setShowFormModal(true); }}
            className="px-4.5 py-3 bg-white hover:bg-zinc-50 text-indigo-950 font-black text-[12px] rounded-2xl flex items-center gap-2 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus size={15} strokeWidth={3} />
            NUEVA REGLA
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="px-6 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'configuracion', label: 'Tarifas Beds24', icon: <RefreshCw size={14} /> },
          { id: 'simulador', label: 'Simulador de Cotizaciones', icon: <Calculator size={14} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`whitespace-nowrap flex items-center gap-2 px-4.5 py-2.5 rounded-full text-[12.5px] font-bold transition-all active:scale-[0.97] cursor-pointer ${
              activeTab === tab.id
                ? 'bg-zinc-900 text-white shadow-md'
                : 'bg-white text-zinc-650 border border-zinc-200/80 hover:bg-zinc-50'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="px-6">
        {loadingRules && (
          <div className="bg-white border border-zinc-200 rounded-3xl p-10 flex flex-col items-center justify-center gap-3 shadow-sm">
            <RefreshCw size={24} className="text-indigo-650 animate-spin" />
            <span className="text-[13px] font-semibold text-zinc-500">Sincronizando reglas de precio...</span>
          </div>
        )}

        {(!loadingRules && !loadingSettings) ? (
          <>
            {/* ── CONFIGURACION / BEDS24 TAB ── */}
            {activeTab === 'configuracion' && (
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
                                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 items-center gap-3">
                                          
                                          {/* Input Precio Base */}
                                          <div className="flex flex-col">
                                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Precio Base</span>
                                            <div className="relative">
                                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-zinc-450">$</span>
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
                                            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">Directo (1.19)</span>
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
                                            <span className="text-[9.5px] font-bold text-zinc-455 uppercase tracking-wider">Sincronizado</span>
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

                {/* Multiplicadores OTA */}
                <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm space-y-5">
                  <div>
                    <h3 className="text-[13px] font-extrabold text-zinc-900 flex items-center gap-2">
                      <Zap size={15} className="text-indigo-500" />
                      Multiplicadores de Canal
                    </h3>
                    <p className="text-[11px] text-zinc-400 font-semibold mt-1">
                      Cambiar estos valores actualiza la vista de precios en tiempo real. Guarda para persistir.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider mb-1.5">Airbnb</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-zinc-400">×</span>
                        <input type="number" step="0.01" min="1"
                          value={beds24Multipliers.airbnb}
                          onChange={e => setBeds24Multipliers(prev => ({ ...prev, airbnb: parseFloat(e.target.value) || 1 }))}
                          className="w-full pl-7 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-[13px] font-extrabold text-zinc-900 outline-none focus:bg-white focus:border-indigo-300"
                        />
                      </div>
                      <p className="text-[9px] text-zinc-400 font-semibold mt-0.5">+{Math.round((beds24Multipliers.airbnb - 1) * 100)}% comisión OTA</p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider mb-1.5">Booking.com</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-zinc-400">×</span>
                        <input type="number" step="0.01" min="1"
                          value={beds24Multipliers.booking}
                          onChange={e => setBeds24Multipliers(prev => ({ ...prev, booking: parseFloat(e.target.value) || 1 }))}
                          className="w-full pl-7 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-[13px] font-extrabold text-zinc-900 outline-none focus:bg-white focus:border-sky-300"
                        />
                      </div>
                      <p className="text-[9px] text-zinc-400 font-semibold mt-0.5">+{Math.round((beds24Multipliers.booking - 1) * 100)}% comisión OTA</p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider mb-1.5">Directo</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-zinc-300">×</span>
                        <input type="number" value={1.00} readOnly
                          className="w-full pl-7 pr-3 py-2.5 bg-zinc-100 border border-zinc-200 rounded-xl text-[13px] font-extrabold text-zinc-400 outline-none cursor-not-allowed"
                        />
                      </div>
                      <p className="text-[9px] text-zinc-400 font-semibold mt-0.5">Sin recargo</p>
                    </div>
                  </div>
                  <div className="flex justify-end pt-3 border-t border-zinc-100">
                    <button
                      onClick={handleSaveMultipliers}
                      disabled={savingMultipliers}
                      className="px-6 py-3 bg-zinc-900 hover:bg-black text-white text-[11px] font-extrabold uppercase tracking-wider rounded-xl flex items-center gap-2 shadow cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      {savingMultipliers ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
                      Guardar Multiplicadores
                    </button>
                  </div>
                </div>

                {/* Sección consolidada de Descuentos por Estancia al pie */}
                <div className="bg-white border border-zinc-200 rounded-3xl p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-[13px] font-extrabold text-zinc-900 flex items-center gap-2">
                      <Calculator size={15} className="text-zinc-505" />
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
            )}
            {/* ── SIMULADOR TAB ── */}
            {activeTab === 'simulador' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Parámetros */}
                <div className="lg:col-span-7 space-y-5">
                  
                  {/* Selector de Unidad */}
                  <div className="bg-white border border-zinc-200 rounded-3xl p-5 shadow-sm space-y-3.5">
                    <h3 className="text-[11px] font-extrabold text-zinc-400 uppercase tracking-widest">Tipo de Unidad</h3>
                    <div className="space-y-2">
                      {ROOMS.map(r => (
                        <button
                          key={r.id}
                          onClick={() => setSimRoomId(r.id)}
                          className={`w-full text-left p-3.5 rounded-2xl border flex items-center justify-between transition-all cursor-pointer ${
                            simRoomId === r.id
                              ? 'bg-indigo-50/50 border-indigo-200 text-indigo-950 shadow-sm'
                              : 'bg-zinc-50/20 border-zinc-200 hover:border-zinc-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{r.icon}</span>
                            <div>
                              <p className={`text-[13.5px] font-bold ${simRoomId === r.id ? 'text-indigo-950' : 'text-zinc-900'}`}>{r.name}</p>
                              <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">Capacidad Base: {r.baseCapacity} pax · Límite Físico: {r.capacity} pax</p>
                            </div>
                          </div>
                          <span className={`text-[12px] font-bold ${simRoomId === r.id ? 'text-indigo-700' : 'text-zinc-500'}`}>
                            {fmt(rules.find(rule => rule.room_type_id === r.id && rule.rule_type === 'base')?.price || FALLBACK_PRICES[r.id].baja)}+
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fechas & Huéspedes */}
                  <div className="bg-white border border-zinc-200 rounded-3xl p-5 shadow-sm space-y-4">
                    <h3 className="text-[11px] font-extrabold text-zinc-400 uppercase tracking-widest">Detalle de Estancia</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 pl-0.5">Check-in</label>
                        <input
                          type="date"
                          value={simCheckIn}
                          onChange={e => setSimCheckIn(e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 outline-none text-[13px] font-bold text-zinc-800 focus:bg-white focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5 transition-all cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 pl-0.5">Check-out</label>
                        <input
                          type="date"
                          value={simCheckOut}
                          onChange={e => setSimCheckOut(e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 outline-none text-[13px] font-bold text-zinc-800 focus:bg-white focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5 transition-all cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="pt-2">
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 pl-0.5">Huéspedes</label>
                      <div className="flex items-center gap-3">
                        <Users size={16} className="text-zinc-400 shrink-0" />
                        <select
                          value={simGuests}
                          onChange={e => setSimGuests(Number(e.target.value))}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 outline-none text-[13px] font-bold text-zinc-800 focus:bg-white focus:border-zinc-400 cursor-pointer"
                        >
                          {Array.from({ length: selectedRoomMetadata.capacity }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>
                              {n} Persona{n !== 1 ? 's' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Canal de Venta */}
                  <div className="bg-white border border-zinc-200 rounded-3xl p-5 shadow-sm space-y-3">
                    <h3 className="text-[11px] font-extrabold text-zinc-400 uppercase tracking-widest">Canal de Venta / Origen</h3>
                    <div className="flex gap-2.5">
                      {CHANNELS.map(ch => (
                        <button
                          key={ch.id}
                          onClick={() => setSimChannelId(ch.id)}
                          className={`flex-1 p-3 rounded-2xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                            simChannelId === ch.id
                              ? `${ch.color} shadow-md border-transparent scale-[1.02]`
                              : 'bg-zinc-50/20 border-zinc-200 hover:border-zinc-350 text-zinc-600'
                          }`}
                        >
                          <span className="text-[13px] font-black leading-none">{ch.id === 'directo' ? 'Directo / WA' : ch.id === 'booking' ? 'Booking' : 'Airbnb'}</span>
                          <span className={`text-[10px] font-semibold mt-1 opacity-85 ${simChannelId === ch.id ? 'text-white' : 'text-zinc-400'}`}>
                            {ch.multiplier === 1.00 ? 'Sin recargo' : `× ${ch.multiplier.toFixed(2)} (${Math.round((ch.multiplier - 1) * 100)}%)`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Recibo de Cotización (Cascada) */}
                <div className="lg:col-span-5">
                  <div className="bg-[#1e1b4b] text-white border border-indigo-950 rounded-[32px] p-6 shadow-xl space-y-6 relative overflow-hidden">
                    
                    {/* Background glows */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                    
                    {/* Header Recibo */}
                    <div className="border-b border-indigo-900/60 pb-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-extrabold text-indigo-300 uppercase tracking-widest">Recibo Estimado</span>
                        <span className="text-[10px] font-bold text-indigo-200 bg-indigo-900/40 px-2.5 py-0.5 rounded-full border border-indigo-800/50">
                          {quote.nights} Noche{quote.nights !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <h4 className="text-[15px] font-bold text-white mt-2 flex items-center gap-1.5">
                        <span>{selectedRoomMetadata.icon}</span>
                        <span className="truncate">{selectedRoomMetadata.name}</span>
                      </h4>
                    </div>

                    {/* Cascading breakdown logic view */}
                    <div className="space-y-3">
                      <span className="text-[9px] font-extrabold text-indigo-300 uppercase tracking-widest block">Evaluación de Reglas (Cascada):</span>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                        {quote.breakdown.map((day, idx) => {
                          let sourceLabelColor = 'bg-zinc-800 text-zinc-300';
                          if (day.ruleSource === 'special') sourceLabelColor = 'bg-rose-900/80 text-rose-200 border border-rose-800';
                          if (day.ruleSource === 'seasonal') sourceLabelColor = 'bg-amber-900/80 text-amber-200 border border-amber-800';
                          if (day.ruleSource === 'base') sourceLabelColor = 'bg-indigo-900/80 text-indigo-200 border border-indigo-850';

                          return (
                            <div key={idx} className="flex justify-between items-center text-[12px] bg-indigo-950/50 border border-indigo-900/30 p-2.5 rounded-xl">
                              <div>
                                <span className="font-semibold text-indigo-200">{day.date.split('-').slice(1).reverse().join('/')}</span>
                                <span className={`ml-2 text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${sourceLabelColor}`}>
                                  {day.ruleName}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="font-black text-white">{fmt(day.totalNight)}</span>
                                {(day.surcharge > 0 || quote.discountMult < 1.0) && (
                                  <span className="block text-[8.5px] text-indigo-300 font-bold">
                                    Base: {fmt(day.discountedBasePrice)} {day.surcharge > 0 ? `+ Surch. (${fmt(day.surcharge)})` : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Desglose contable */}
                    <div className="space-y-3 pt-3 border-t border-indigo-900/60 text-[13px] font-medium text-indigo-200">
                      
                      <div className="flex justify-between">
                        <span>Suma de Tarifas Base</span>
                        <span className="text-white font-bold">{fmt(quote.totalBaseWithoutSurcharge)}</span>
                      </div>

                      {quote.discountMult < 1.0 && (
                        <div className="flex justify-between text-emerald-400">
                          <span>Descuento Larga Estancia ({Math.round((1 - quote.discountMult) * 100)}%)</span>
                          <span className="font-bold">-{fmt(quote.totalBaseWithoutSurcharge - quote.discountedBaseSum)}</span>
                        </div>
                      )}

                      {quote.totalSurcharges > 0 && (
                        <div className="flex justify-between text-rose-300">
                          <span>Recargo pax adicional ({quote.extraGuests} pax × $200)</span>
                          <span className="font-bold">+{fmt(quote.totalSurcharges)}</span>
                        </div>
                      )}

                      {quote.channelMultiplier > 1.00 && (
                        <div className="flex justify-between text-amber-300">
                          <span>Comisión del Canal ({CHANNELS.find(c => c.id === simChannelId)?.label})</span>
                          <span className="font-bold">+{fmt(quote.totalWithChannel - quote.subtotalWithSurcharge)}</span>
                        </div>
                      )}

                      <div className="flex justify-between">
                        <span>Impuestos obligatorios (19%)</span>
                        <span className="text-white font-bold">{fmt(quote.taxAmount)}</span>
                      </div>

                      <div className="h-0.5 bg-indigo-900/60 my-2" />

                      <div className="flex justify-between items-center pt-1">
                        <span className="text-[14px] font-black text-white uppercase tracking-wider">Total Estancia</span>
                        <div className="text-right">
                          <span className="text-[26px] font-black text-[#E5BD69] tracking-tight leading-none">{fmt(quote.finalTotal)}</span>
                          <span className="block text-[9.5px] text-indigo-300 font-bold mt-1">Con IVA + ISH incluido</span>
                        </div>
                      </div>

                    </div>

                    {/* Explicación del Algoritmo Badge */}
                    <div className="bg-indigo-950 border border-indigo-900 p-3.5 rounded-2xl flex items-start gap-2 text-[11px] leading-relaxed text-indigo-200 mt-2">
                      <Info size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>Algoritmo en Cascada:</strong> Para cada noche evalúa prioritariamente Tarifas Especiales &gt; Tarifas Temporales &gt; Tarifa Base DB &gt; Predeterminado Beds24. Recargo adicional de $200/noche por pax extra. Multiplica por el canal (+10% Booking, +25% Airbnb) y añade 19% de impuestos.
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            )}
          </>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-3xl p-10 flex flex-col items-center justify-center gap-3 shadow-sm">
            <RefreshCw size={24} className="text-indigo-650 animate-spin" />
            <span className="text-[13px] font-semibold text-zinc-500">Cargando configuraciones de tarifas...</span>
          </div>
        )}
      </div>

      {/* ── FORM MODAL REGISTRO DE REGLAS ── */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-6 duration-300 flex flex-col max-h-[90vh]">
            
            {/* Header Modal */}
            <div className="px-6 py-5 border-b border-zinc-150 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-zinc-950 leading-tight">
                  {editingRuleId ? 'Modificar Regla de Precio' : 'Nueva Regla de Precio'}
                </h3>
                <p className="text-[11px] text-zinc-400 font-bold uppercase mt-0.5">Guardado directo en Supabase</p>
              </div>
              <button
                onClick={() => setShowFormModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-150 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 cursor-pointer"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </div>

            {/* Body Form */}
            <form onSubmit={handleSaveRule} className="flex-1 overflow-y-auto p-6 space-y-4">
              
              {/* Tipo de Regla */}
              <div>
                <label className="block text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5">Categoría de Regla</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'base', label: 'Base' },
                    { id: 'seasonal', label: 'Temporada' },
                    { id: 'special', label: 'Especial' }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormRuleType(t.id as any)}
                      className={`py-2 px-1 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                        formRuleType === t.id
                          ? 'bg-zinc-950 text-white border-transparent shadow-sm'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-650 hover:bg-zinc-100'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nombre de la Regla */}
              <div>
                <label className="block text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5">Nombre / Etiqueta</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Tarifa Base 2026, Semana Santa, Navidad"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full bg-[#fafafa] border border-zinc-200 rounded-xl p-3 outline-none text-[13.5px] font-semibold text-zinc-900 focus:bg-white focus:border-zinc-400"
                />
              </div>

              {/* Tipo de Habitación */}
              <div>
                <label className="block text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5">Tipo de Habitación / Beds24 Type ID</label>
                <select
                  value={formRoomTypeId}
                  onChange={e => setFormRoomTypeId(e.target.value)}
                  className="w-full bg-[#fafafa] border border-zinc-200 rounded-xl p-3 outline-none text-[13.5px] font-semibold text-zinc-900 cursor-pointer"
                >
                  {ROOMS.map(r => (
                    <option key={r.id} value={r.id}>{r.icon} {r.name}</option>
                  ))}
                </select>
              </div>

              {/* Tarifa base por noche */}
              <div>
                <label className="block text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5">Precio Neto por Noche (MXN)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-400">$</span>
                  <input
                    type="number"
                    required
                    placeholder="0.00"
                    value={formPrice}
                    onChange={e => setFormPrice(e.target.value)}
                    className="w-full bg-[#fafafa] border border-zinc-200 rounded-xl py-3 pl-8 pr-4 outline-none text-[13.5px] font-extrabold text-zinc-900 focus:bg-white focus:border-zinc-400"
                  />
                </div>
              </div>

              {/* Rango de Fechas (Seasonal & Special) */}
              {formRuleType !== 'base' && (
                <div className="grid grid-cols-2 gap-3 pt-1.5 border-t border-zinc-100 animate-in slide-in-from-top-2 duration-200">
                  <div>
                    <label className="block text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5">Fecha Inicio</label>
                    <input
                      type="date"
                      required
                      value={formStartDate}
                      onChange={e => setFormStartDate(e.target.value)}
                      className="w-full bg-[#fafafa] border border-zinc-200 rounded-xl p-3 outline-none text-[12.5px] font-semibold text-zinc-900 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5">Fecha Fin</label>
                    <input
                      type="date"
                      required
                      value={formEndDate}
                      onChange={e => setFormEndDate(e.target.value)}
                      className="w-full bg-[#fafafa] border border-zinc-200 rounded-xl p-3 outline-none text-[12.5px] font-semibold text-zinc-900 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Botón de envío */}
              <button
                type="submit"
                disabled={actionLoading}
                className="w-full bg-zinc-900 hover:bg-black text-white font-extrabold py-4 text-[12px] uppercase tracking-wider rounded-2xl shadow-lg mt-3 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                <span>{editingRuleId ? 'Actualizar Regla' : 'Crear Regla en DB'}</span>
              </button>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
