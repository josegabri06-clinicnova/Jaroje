"use client";

import { useState, useEffect, useMemo } from 'react';
import { 
  Calculator, Calendar, Tag, ChevronDown, TrendingUp, Zap, 
  Plus, Trash2, Edit2, Info, Check, AlertCircle, RefreshCw, Users, Shield, ArrowRight, X
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ─── CONFIGURACIONES DE HABITACIONES ──────────────────────────────────────────
const ROOMS = [
  { id: '679077', name: 'Habitación DOBLE - 2 camas dobles', icon: '🛏️', capacity: 2, baseCapacity: 2 },
  { id: '679087', name: 'Apartamento Premier de 1 dormitorio', icon: '🏠', capacity: 4, baseCapacity: 2 },
  { id: '679091', name: 'Apartamento Premier de 2 dormitorios', icon: '🏡', capacity: 6, baseCapacity: 4 },
  { id: '679092', name: 'Apartamento Premier de 3 dormitorios', icon: '🏘️', capacity: 8, baseCapacity: 6 },
  { id: '679093', name: 'Casa Vacacional de 3 dormitorios', icon: '💎', capacity: 12, baseCapacity: 8 },
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

function fmt(n: number) {
  return 'MX$' + Math.round(n).toLocaleString('es-MX');
}

const todayStr = new Date().toISOString().split('T')[0];
const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();

export default function PreciosPage() {
  const [activeTab, setActiveTab] = useState<'simulador' | 'reglas' | 'tabla' | 'temporadas'>('simulador');
  
  // API State
  const [rules, setRules] = useState<any[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

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

  const handleSyncToBeds24 = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/precios/sync', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        alert('Tarifas sincronizadas exitosamente en Beds24.');
      } else {
        throw new Error(json.error || 'Fallo al sincronizar tarifas');
      }
    } catch (err: any) {
      alert(`Error al sincronizar tarifas con Beds24: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

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
    const surchargePerNight = extraGuests * 200; // $200 por persona adicional

    for (let i = 0; i < nights; i++) {
      const curr = new Date(dStart);
      curr.setDate(dStart.getDate() + i);
      const dateStr = curr.toISOString().split('T')[0];

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

      if (specialRule) {
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

      breakdown.push({
        date: dateStr,
        basePrice: priceUsed,
        surcharge: surchargePerNight,
        totalNight: priceUsed + surchargePerNight,
        ruleName,
        ruleSource
      });
    }

    const channel = CHANNELS.find(c => c.id === simChannelId) || CHANNELS[0];
    const subtotalWithSurcharge = totalBaseWithoutSurcharge + totalSurcharges;
    const totalWithChannel = Math.round(subtotalWithSurcharge * channel.multiplier);
    const taxAmount = Math.round(totalWithChannel * TAX);
    const finalTotal = totalWithChannel + taxAmount;

    return {
      nights,
      breakdown,
      totalBaseWithoutSurcharge,
      totalSurcharges,
      subtotalWithSurcharge,
      totalWithChannel,
      taxAmount,
      finalTotal,
      extraGuests,
      channelMultiplier: channel.multiplier
    };
  }, [simRoomId, simCheckIn, simCheckOut, simGuests, simChannelId, rules, selectedRoomMetadata]);

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

      // Log action for audit trail
      try {
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: '999',
            employee_name: 'Administrador',
            department: 'admin',
            module: 'precios',
            action: editingRuleId ? 'precio_regla_actualizada' : 'precio_regla_creada',
            details: JSON.stringify({
              text: `${editingRuleId ? 'Actualizó' : 'Creó'} regla de precio "${formName}" para ${ROOMS.find(r => r.id === formRoomTypeId)?.name || formRoomTypeId}. Tipo: ${formRuleType}, Precio: MX$${formPrice}`
            })
          })
        });
      } catch (logErr) {
        console.error("Error log audit:", logErr);
      }

      alert("Regla guardada con éxito.");
      setShowFormModal(false);
      resetForm();
      fetchRules();

      // Sincronización silenciosa en segundo plano con Beds24
      fetch('/api/precios/sync', { method: 'POST' })
        .then(res => res.json())
        .then(json => {
          if (!json.success) console.error("Error en sincronización automática de Beds24:", json.error);
        })
        .catch(err => console.error("Fallo de red en sincronización automática de Beds24:", err));
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

      alert("Regla eliminada.");
      fetchRules();

      // Sincronización silenciosa en segundo plano con Beds24
      fetch('/api/precios/sync', { method: 'POST' })
        .then(res => res.json())
        .then(json => {
          if (!json.success) console.error("Error en sincronización automática de Beds24:", json.error);
        })
        .catch(err => console.error("Fallo de red en sincronización automática de Beds24:", err));
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
          <span className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-widest block mb-1">Cálculo en Cascada & Sincronización Beds24</span>
          <h2 className="text-[24px] font-black tracking-tight leading-none">Manipulador de precios</h2>
          <p className="text-[13px] text-indigo-200 mt-1.5 font-medium">
            Tarifas base, temporales y reglas especiales sincronizadas automáticamente con Beds24.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSyncToBeds24}
            disabled={syncing}
            className="px-4.5 py-3 bg-indigo-650/40 hover:bg-indigo-600/55 text-white border border-indigo-500/50 font-black text-[12px] rounded-2xl flex items-center gap-2 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={15} className={`stroke-[3px] ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'SINCRONIZANDO...' : 'SINCRONIZAR A BEDS24'}
          </button>
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
          { id: 'simulador', label: 'Simulador de Cotizaciones', icon: <Calculator size={14} /> },
          { id: 'reglas', label: 'Reglas Activas (DB)', icon: <TrendingUp size={14} /> },
          { id: 'tabla', label: 'Tabla de Tarifas', icon: <Tag size={14} /> },
          { id: 'temporadas', label: 'Calendario Temporadas', icon: <Calendar size={14} /> }
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

        {!loadingRules && (
          <>
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
                      <div className="flex justify-between items-center mb-1.5 pl-0.5">
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Huéspedes</label>
                        {simGuests > selectedRoomMetadata.baseCapacity && (
                          <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100 uppercase">
                            Cargo Adicional Aplicado (+{simGuests - selectedRoomMetadata.baseCapacity} pax)
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <Users size={16} className="text-zinc-400 shrink-0" />
                        <select
                          value={simGuests}
                          onChange={e => setSimGuests(Number(e.target.value))}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 outline-none text-[13px] font-bold text-zinc-800 focus:bg-white focus:border-zinc-400 cursor-pointer"
                        >
                          {Array.from({ length: selectedRoomMetadata.capacity }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>
                              {n} Persona{n !== 1 ? 's' : ''} {n > selectedRoomMetadata.baseCapacity ? '(Tarifa Adicional)' : ''}
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
                                {day.surcharge > 0 && (
                                  <span className="block text-[8.5px] text-rose-350 font-bold">Base: {fmt(day.basePrice)} + Surch.</span>
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

            {/* ── REGLAS DE PRECIO TAB (ADMIN DB PANEL) ── */}
            {activeTab === 'reglas' && (
              <div className="space-y-4">
                
                <div className="flex justify-between items-center">
                  <h3 className="text-[14px] font-extrabold text-zinc-500 uppercase tracking-widest">Lista de Reglas en Base de Datos</h3>
                  <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100 border px-3 py-1 rounded-xl">
                    {rules.length} Reglas Guardadas
                  </span>
                </div>

                {rules.length === 0 ? (
                  <div className="bg-white border border-zinc-200/60 border-dashed rounded-3xl p-12 text-center flex flex-col items-center gap-3">
                    <TrendingUp size={32} className="text-zinc-300" strokeWidth={1.5} />
                    <p className="text-[14px] font-semibold text-zinc-500">No hay reglas de precios configuradas en Supabase.</p>
                    <p className="text-[12px] text-zinc-400 max-w-sm">Haz clic en "Nueva Regla" para definir tarifas base por unidad o rangos especiales de fecha.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {rules.map(rule => {
                      const roomMeta = ROOMS.find(r => r.id === rule.room_type_id);
                      
                      let typeColor = 'bg-indigo-50 border-indigo-150 text-indigo-700';
                      if (rule.rule_type === 'seasonal') typeColor = 'bg-amber-50 border-amber-150 text-amber-700';
                      if (rule.rule_type === 'special') typeColor = 'bg-rose-50 border-rose-150 text-rose-700';

                      return (
                        <div key={rule.id} className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between gap-4 hover:border-zinc-350 transition-all">
                          <div className="space-y-2">
                            <div className="flex justify-between items-start">
                              <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${typeColor}`}>
                                {rule.rule_type === 'base' ? 'Base' : rule.rule_type === 'seasonal' ? 'Temporada' : 'Especial'}
                              </span>
                              <div className="flex gap-1.5">
                                <button 
                                  onClick={() => handleEditRuleClick(rule)}
                                  className="p-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-650 rounded-lg border transition-colors cursor-pointer"
                                  title="Editar"
                                >
                                  <Edit2 size={11} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteRule(rule.id, rule.name)}
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                                  title="Eliminar"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>

                            <div>
                              <h4 className="font-bold text-[14px] text-zinc-900 leading-tight">{rule.name}</h4>
                              <p className="text-[11px] text-zinc-400 font-semibold mt-1 flex items-center gap-1">
                                <span>{roomMeta?.icon || '🏨'}</span>
                                <span className="truncate max-w-[200px]">{roomMeta?.name || rule.room_type_id}</span>
                              </p>
                            </div>

                            {rule.rule_type !== 'base' && rule.start_date && rule.end_date && (
                              <div className="text-[11.5px] font-semibold text-zinc-500 bg-zinc-50 border p-2 rounded-xl">
                                📅 {rule.start_date.split('-').reverse().join('/')} al {rule.end_date.split('-').reverse().join('/')}
                              </div>
                            )}
                          </div>

                          <div className="border-t border-zinc-100 pt-3 flex items-baseline justify-between">
                            <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">Tarifa</span>
                            <span className="text-[17px] font-black text-indigo-950">{fmt(rule.price)} <span className="text-[11px] text-zinc-450 font-bold">/noche</span></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            )}

            {/* ── TABLA DE TARIFAS TAB ── */}
            {activeTab === 'tabla' && (
              <div className="bg-white border border-zinc-200 rounded-3xl p-5 shadow-sm space-y-4">
                
                {/* Selector de Canal */}
                <div className="flex justify-between items-center border-b border-zinc-100 pb-3 flex-wrap gap-2">
                  <div>
                    <h3 className="text-[14px] font-extrabold text-zinc-900">Tarifas Base por Tipo de Unidad</h3>
                    <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">Valores por noche calculados de forma dinámica y comisionable.</p>
                  </div>
                  <div className="flex gap-2">
                    {CHANNELS.map(ch => (
                      <button
                        key={ch.id}
                        onClick={() => setSimChannelId(ch.id)}
                        className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                          simChannelId === ch.id
                            ? `${ch.color} border-transparent shadow-sm`
                            : 'bg-zinc-50 text-zinc-650 border-zinc-200'
                        }`}
                      >
                        {ch.id === 'directo' ? 'Directo' : ch.id === 'booking' ? 'Booking' : 'Airbnb'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px] border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-100 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                        <th className="py-3 pr-4">Habitación / Unidad</th>
                        <th className="py-3 px-3 text-center">Baja</th>
                        <th className="py-3 px-3 text-center">Media</th>
                        <th className="py-3 px-3 text-center">Media-Alta</th>
                        <th className="py-3 px-3 text-center">Alta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50 font-medium">
                      {ROOMS.map(r => {
                        const pricesObj = dynamicBasePriceGrid[r.id] || FALLBACK_PRICES[r.id];
                        const mult = CHANNELS.find(c => c.id === simChannelId)?.multiplier || 1.0;

                        return (
                          <tr key={r.id} className="hover:bg-zinc-50/50">
                            <td className="py-3.5 pr-4">
                              <div className="flex items-center gap-2.5">
                                <span className="text-xl">{r.icon}</span>
                                <div>
                                  <span className="font-bold text-zinc-900 block">{r.name}</span>
                                  <span className="text-[10.5px] text-zinc-400 font-semibold">Max: {r.capacity} pax · Base: {r.baseCapacity} pax</span>
                                </div>
                              </div>
                            </td>
                            {SEASONS.map(s => {
                              const calculatedPrice = pricesObj[s.id] * mult;
                              return (
                                <td key={s.id} className="py-3.5 px-3 text-center">
                                  <span className="font-black text-zinc-900 block">{fmt(calculatedPrice)}</span>
                                  <span className="text-[9.5px] text-zinc-450 font-semibold">+{fmt(calculatedPrice * TAX)} Imp.</span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="bg-zinc-50 border border-zinc-200/50 p-4 rounded-2xl flex items-start gap-2.5 text-[11.5px] leading-relaxed text-zinc-500 font-medium">
                  <Info size={14} className="text-zinc-400 shrink-0 mt-0.5" />
                  <div>
                    Los precios en la tabla muestran la tarifa neta por noche según las reglas en base de datos.
                    Se muestra en formato de letra chica el impuesto del <strong>19% (16% IVA + 3% ISH)</strong> que se añadirá en la cotización final de forma automática.
                  </div>
                </div>

              </div>
            )}

            {/* ── TEMPORADAS DEFAULT TAB ── */}
            {activeTab === 'temporadas' && (
              <div className="space-y-4">
                <p className="text-[13px] text-zinc-500 font-semibold pl-1">
                  Seasons del calendario estándar (Huatulco, México) usadas como fallback si no hay regla especial:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {SEASONS.map(s => (
                    <div key={s.id} className="bg-white border border-zinc-200 rounded-3xl p-5 shadow-sm space-y-3.5">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: s.color }} />
                          <h4 className="font-black text-[14.5px] uppercase tracking-wider" style={{ color: s.color }}>
                            Temporada {s.label}
                          </h4>
                        </div>
                      </div>

                      <div className="bg-zinc-50 border p-3 rounded-2xl text-[12.5px] font-semibold text-zinc-600">
                        {s.months}
                      </div>

                      <div className="text-[11.5px] leading-relaxed text-zinc-400 font-semibold">
                        Define la temporada automática para las cotizaciones en el simulador según la fecha de Check-in.
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
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
