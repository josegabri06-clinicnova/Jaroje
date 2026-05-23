"use client";

import { useState, useMemo } from 'react';
import { Calculator, Calendar, Tag, ChevronDown, TrendingUp, Zap } from 'lucide-react';

// ─── DATOS DE TARIFAS REALES ──────────────────────────────────────────────────
const ROOMS = [
  { id: '679077', name: 'Habitación DOBLE - 2 camas dobles', icon: '🛏️', capacity: 2 },
  { id: '679087', name: 'Apartamento Premier de 1 dormitorio', icon: '🏠', capacity: 4 },
  { id: '679091', name: 'Apartamento Premier de 2 dormitorios', icon: '🏡', capacity: 6 },
  { id: '679092', name: 'Apartamento Premier de 3 dormitorios', icon: '🏘️', capacity: 8 },
  { id: '679093', name: 'Casa Vacacional de 3 dormitorios', icon: '💎', capacity: 12 },
];

const PRICES: Record<string, Record<string, number>> = {
  '679077': { baja: 1600, media: 1900, media_alta: 2000, alta: 2200 },
  '679087': { baja: 2400, media: 2850, media_alta: 3000, alta: 3300 },
  '679091': { baja: 3200, media: 3800, media_alta: 4000, alta: 4400 },
  '679092': { baja: 4800, media: 5700, media_alta: 6000, alta: 6600 },
  '679093': { baja: 6400, media: 7600, media_alta: 8000, alta: 8800 },
};

const CHANNELS = [
  { id: 'directo',  label: 'Directo / WhatsApp', multiplier: 1.00, color: '#2563eb' },
  { id: 'booking',  label: 'Booking.com',         multiplier: 1.10, color: '#003580' },
  { id: 'airbnb',   label: 'Airbnb',              multiplier: 1.25, color: '#ff5a5f' },
];

const TAX = 0.19; // 16% IVA + 3% estatal

const SEASONS = [
  { id: 'baja',       label: 'Baja',        color: '#3b82f6', bg: '#eff6ff', months: 'May · Jun · Sep' },
  { id: 'media',      label: 'Media',       color: '#f59e0b', bg: '#fffbeb', months: 'Ene · Feb · Mar · Oct · Nov' },
  { id: 'media_alta', label: 'Media-Alta',  color: '#f97316', bg: '#fff7ed', months: 'Jul · Ago · Dic (1-19) · Nov 1-5' },
  { id: 'alta',       label: 'Alta',        color: '#ef4444', bg: '#fef2f2', months: 'Dic 20-31 · Ene 1-6 · Abr 1-14' },
];

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
  return 'MX$' + n.toLocaleString('es-MX');
}

const todayStr = new Date().toISOString().split('T')[0];
const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();

export default function PreciosPage() {
  // Simulator state
  const [roomId, setRoomId] = useState('679091');
  const [checkIn, setCheckIn] = useState(todayStr);
  const [checkOut, setCheckOut] = useState(tomorrowStr);
  const [channelId, setChannelId] = useState('directo');
  const [activeTab, setActiveTab] = useState<'simulador' | 'tabla' | 'temporadas'>('simulador');

  const channel = CHANNELS.find(c => c.id === channelId)!;
  const season = getSeason(checkIn);
  const seasonData = SEASONS.find(s => s.id === season)!;

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 1;
    const diff = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000;
    return Math.max(1, Math.round(diff));
  }, [checkIn, checkOut]);

  const basePricePerNight = PRICES[roomId]?.[season] ?? 0;
  const priceWithChannel = Math.round(basePricePerNight * channel.multiplier);
  const tax = Math.round(priceWithChannel * TAX);
  const totalPerNight = priceWithChannel + tax;
  const totalStay = totalPerNight * nights;
  const room = ROOMS.find(r => r.id === roomId)!;

  return (
    <div style={{ background: '#fafafa', minHeight: '100vh', paddingBottom: 100, fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 100%)', padding: '40px 20px 28px', borderRadius: '0 0 28px 28px', marginBottom: 20 }}>
        <p style={{ color: '#a5b4fc', fontSize: 12, fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Jaroje OS</p>
        <h1 style={{ color: 'white', fontSize: 26, fontWeight: 800, margin: '0 0 4px' }}>Tarifas & Precios</h1>
        <p style={{ color: '#c7d2fe', fontSize: 13, margin: 0 }}>Simulador · Tabla de temporadas · Canal</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px', marginBottom: 20 }}>
        {[
          { id: 'simulador',   label: 'Simulador',   icon: <Calculator size={14} /> },
          { id: 'tabla',       label: 'Tabla',       icon: <Tag size={14} /> },
          { id: 'temporadas',  label: 'Temporadas',  icon: <Calendar size={14} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              flex: 1,
              padding: '10px 4px',
              borderRadius: 12,
              border: activeTab === tab.id ? '2px solid #3730a3' : '2px solid #e4e4e7',
              background: activeTab === tab.id ? '#eef2ff' : 'white',
              color: activeTab === tab.id ? '#3730a3' : '#71717a',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 16px' }}>

        {/* ── TAB: SIMULADOR ── */}
        {activeTab === 'simulador' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Room selector */}
            <div style={{ background: 'white', borderRadius: 20, padding: 16, border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Habitación</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ROOMS.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setRoomId(r.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: roomId === r.id ? '2px solid #3730a3' : '2px solid #f4f4f5',
                      background: roomId === r.id ? '#eef2ff' : '#fafafa',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{r.icon}</span>
                      <span>
                        <p style={{ fontSize: 14, fontWeight: 700, color: roomId === r.id ? '#3730a3' : '#18181b', margin: 0 }}>{r.name}</p>
                        <p style={{ fontSize: 11, color: '#71717a', margin: 0 }}>Hasta {r.capacity} personas</p>
                      </span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: roomId === r.id ? '#3730a3' : '#71717a' }}>
                      {fmt(PRICES[r.id].baja)}+
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div style={{ background: 'white', borderRadius: 20, padding: 16, border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Fechas de Estancia</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <p style={{ fontSize: 11, color: '#71717a', fontWeight: 600, margin: '0 0 4px' }}>CHECK-IN</p>
                  <input
                    type="date" value={checkIn}
                    onChange={e => setCheckIn(e.target.value)}
                    style={{ width: '100%', border: '2px solid #e4e4e7', borderRadius: 10, padding: '10px 10px', fontSize: 14, fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <p style={{ fontSize: 11, color: '#71717a', fontWeight: 600, margin: '0 0 4px' }}>CHECK-OUT</p>
                  <input
                    type="date" value={checkOut}
                    onChange={e => setCheckOut(e.target.value)}
                    style={{ width: '100%', border: '2px solid #e4e4e7', borderRadius: 10, padding: '10px 10px', fontSize: 14, fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            {/* Channel */}
            <div style={{ background: 'white', borderRadius: 20, padding: 16, border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Canal de Venta</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {CHANNELS.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => setChannelId(ch.id)}
                    style={{
                      flex: 1,
                      padding: '10px 4px',
                      borderRadius: 12,
                      border: channelId === ch.id ? `2px solid ${ch.color}` : '2px solid #e4e4e7',
                      background: channelId === ch.id ? ch.color + '10' : '#fafafa',
                      cursor: 'pointer',
                    }}
                  >
                    <p style={{ fontSize: 12, fontWeight: 800, color: channelId === ch.id ? ch.color : '#71717a', margin: 0 }}>
                      {ch.id === 'directo' ? 'Directo' : ch.id === 'booking' ? 'Booking' : 'Airbnb'}
                    </p>
                    <p style={{ fontSize: 10, color: channelId === ch.id ? ch.color : '#a1a1aa', margin: 0, fontWeight: 600 }}>
                      {ch.multiplier === 1 ? 'Sin comisión' : `×${ch.multiplier.toFixed(2)}`}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Result Card */}
            <div style={{
              background: `linear-gradient(135deg, ${seasonData.color}15, ${seasonData.color}05)`,
              border: `2px solid ${seasonData.color}30`,
              borderRadius: 20,
              padding: 20,
              boxShadow: `0 4px 20px ${seasonData.color}20`,
            }}>
              {/* Season badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ background: seasonData.color, color: 'white', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Temporada {seasonData.label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#71717a' }}>{nights} noche{nights !== 1 ? 's' : ''}</span>
              </div>

              {/* Main price */}
              <div style={{ marginBottom: 16, padding: '16px 0', borderBottom: `1px solid ${seasonData.color}20` }}>
                <p style={{ fontSize: 12, color: '#71717a', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase' }}>
                  {room.icon} {room.name} · {channel.label}
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 38, fontWeight: 900, color: '#18181b', letterSpacing: '-0.03em' }}>{fmt(totalPerNight)}</span>
                  <span style={{ fontSize: 14, color: '#71717a', fontWeight: 500 }}>/noche</span>
                </div>
              </div>

              {/* Price breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: '#71717a' }}>Precio base ({seasonData.label})</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#18181b' }}>{fmt(basePricePerNight)}</span>
                </div>
                {channel.multiplier > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: '#71717a' }}>Ajuste canal ({channel.label})</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f97316' }}>+{fmt(priceWithChannel - basePricePerNight)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: '#71717a' }}>Impuestos (16% IVA + 3%)</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#18181b' }}>{fmt(tax)}</span>
                </div>
                <div style={{ height: 1, background: `${seasonData.color}20`, margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#18181b' }}>TOTAL {nights} noche{nights !== 1 ? 's' : ''}</span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: seasonData.color }}>{fmt(totalStay)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: TABLA ── */}
        {activeTab === 'tabla' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Channel filter */}
            <div style={{ display: 'flex', gap: 6 }}>
              {CHANNELS.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => setChannelId(ch.id)}
                  style={{
                    flex: 1,
                    padding: '9px 4px',
                    borderRadius: 10,
                    border: channelId === ch.id ? `2px solid ${ch.color}` : '2px solid #e4e4e7',
                    background: channelId === ch.id ? ch.color : 'white',
                    color: channelId === ch.id ? 'white' : '#71717a',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {ch.id === 'directo' ? 'Directo' : ch.id === 'booking' ? 'Booking' : 'Airbnb'}
                </button>
              ))}
            </div>

            <p style={{ fontSize: 12, color: '#71717a', textAlign: 'center', margin: '0' }}>
              Precios base SIN impuestos · Canal: <strong>{channel.label}</strong>
              {channel.multiplier > 1 ? ` (×${channel.multiplier.toFixed(2)})` : ''}
            </p>

            {/* Season headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 4 }}>
              {SEASONS.map(s => (
                <div key={s.id} style={{ background: s.bg, border: `1px solid ${s.color}30`, borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: s.color, margin: '0 auto 4px' }} />
                  <p style={{ fontSize: 10, fontWeight: 800, color: s.color, margin: 0, textTransform: 'uppercase' }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Room rows */}
            {ROOMS.map(r => (
              <div key={r.id} style={{ background: 'white', borderRadius: 16, border: '1px solid #f0f0f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ padding: '12px 14px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{r.icon}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 800, color: '#18181b', margin: 0 }}>{r.name}</p>
                    <p style={{ fontSize: 11, color: '#71717a', margin: 0 }}>Hasta {r.capacity} personas</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  {SEASONS.map((s, i) => {
                    const base = PRICES[r.id][s.id];
                    const adjusted = Math.round(base * channel.multiplier);
                    return (
                      <div key={s.id} style={{ padding: '12px 8px', textAlign: 'center', borderRight: i < 3 ? '1px solid #f0f0f0' : 'none', background: s.bg + '60' }}>
                        <p style={{ fontSize: 11, fontWeight: 800, color: s.color, margin: '0 0 2px', textTransform: 'uppercase' }}>{s.label}</p>
                        <p style={{ fontSize: 14, fontWeight: 900, color: '#18181b', margin: 0 }}>
                          {fmt(adjusted)}
                        </p>
                        <p style={{ fontSize: 10, color: '#a1a1aa', margin: 0 }}>/noche</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div style={{ background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 12, padding: 12, marginTop: 4 }}>
              <p style={{ fontSize: 11, color: '#71717a', margin: 0, lineHeight: 1.6 }}>
                ⚠️ Precios base SIN impuestos. Al precio público añadir <strong>19%</strong> (16% IVA + 3% estatal).
                El precio con impuestos se calcula automáticamente en el Simulador.
              </p>
            </div>
          </div>
        )}

        {/* ── TAB: TEMPORADAS ── */}
        {activeTab === 'temporadas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <p style={{ fontSize: 13, color: '#71717a', fontWeight: 500, margin: 0 }}>
              Calendario de temporadas para Huatulco, Oaxaca — México
            </p>

            {SEASONS.map(s => (
              <div key={s.id} style={{ background: 'white', borderRadius: 16, border: `2px solid ${s.color}25`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ background: `linear-gradient(135deg, ${s.color}15, ${s.color}05)`, padding: '14px 16px', borderBottom: `1px solid ${s.color}20`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 6, background: s.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: s.color, margin: 0 }}>Temporada {s.label}</p>
                    <p style={{ fontSize: 12, color: '#71717a', margin: 0 }}>{s.months}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: '#a1a1aa', margin: '0 0 1px', fontWeight: 600 }}>Hab. Estándar</p>
                    <p style={{ fontSize: 14, fontWeight: 800, color: s.color, margin: 0 }}>{fmt(PRICES['679077'][s.id])}</p>
                  </div>
                </div>
                <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {ROOMS.slice(1).map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: s.bg + '50', borderRadius: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#52525b' }}>{r.icon} {r.name.replace('Condominio ', 'Condo ')}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#18181b' }}>{fmt(PRICES[r.id][s.id])}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Current season highlight */}
            <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #3730a3)', borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Zap size={16} color="#a5b4fc" />
                <p style={{ fontSize: 13, fontWeight: 700, color: '#a5b4fc', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Temporada Actual</p>
              </div>
              <p style={{ fontSize: 20, fontWeight: 900, color: 'white', margin: '0 0 4px' }}>
                Temporada {SEASONS.find(s => s.id === getSeason(todayStr))?.label}
              </p>
              <p style={{ fontSize: 13, color: '#c7d2fe', margin: 0 }}>
                Hoy: {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
