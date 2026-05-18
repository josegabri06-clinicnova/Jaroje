"use client";

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, BarChart3, DollarSign, BedDouble, RefreshCw, Moon, Users, AlertCircle, Download, ExternalLink, Copy, Check } from 'lucide-react';

export default function AnalyticsPage() {
  const [reservas, setReservas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenError, setTokenError] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchReservas = async () => {
    setIsLoading(true);
    setTokenError(false);
    try {
      const res = await fetch('/api/reservas');
      const json = await res.json();
      if (json.error === 'TOKEN_EXPIRED') { setTokenError(true); return; }
      if (json.success && json.data) setReservas(json.data);
    } catch (e) {
      console.error("Error en analytics", e);
    } finally {
      setIsLoading(false);
    }
  };

  const exportCSV = async () => {
    setExportLoading(true);
    try {
      const res = await fetch('/api/export?format=csv');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `jaroje_reservas_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Error al exportar. Verifica que el token de Beds24 esté activo.');
    } finally {
      setExportLoading(false);
    }
  };

  const exportSQL = async () => {
    setExportLoading(true);
    try {
      const res = await fetch('/api/export?format=sql');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `jaroje_reservas_${new Date().toISOString().split('T')[0]}.sql`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Error al exportar SQL.');
    } finally {
      setExportLoading(false);
    }
  };


  const copyJSONUrl = () => {
    const url = `${window.location.origin}/api/export?format=json`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => { fetchReservas(); }, []);

  // ── Calcular métricas reales ──────────────────────────────────────────────
  const totalNoches = reservas.reduce((s, r) => s + (r.nights || 0), 0);
  const revenueTotal = reservas.reduce((s, r) => s + (r.price_estimate || 0), 0);
  const adr = totalNoches > 0 ? Math.round(revenueTotal / totalNoches) : 0;
  const ocupacion = Math.min(100, Math.round((totalNoches / 30) * 100));

  // Canal breakdown
  const channelMap: Record<string, { nights: number; revenue: number }> = {};
  reservas.forEach(r => {
    const ch = r.channel || 'Directo';
    if (!channelMap[ch]) channelMap[ch] = { nights: 0, revenue: 0 };
    channelMap[ch].nights += r.nights || 0;
    channelMap[ch].revenue += r.price_estimate || 0;
  });
  const channelData = Object.entries(channelMap)
    .map(([name, data]) => ({
      name,
      nights: data.nights,
      revenue: data.revenue,
      pct: totalNoches > 0 ? Math.round((data.nights / totalNoches) * 100) : 0,
      color: name.includes('Airbnb') ? '#FF5A5F' : name.includes('Booking') ? '#003580' : name.includes('WhatsApp') ? '#25D366' : '#111827'
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Reservas por mes para la gráfica
  const monthMap: Record<string, number> = {};
  reservas.forEach(r => {
    if (!r.check_in) return;
    const m = r.check_in.substring(0, 7); // YYYY-MM
    if (!monthMap[m]) monthMap[m] = 0;
    monthMap[m] += r.price_estimate || 0;
  });
  const monthData = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, revenue]) => ({
      label: new Date(month + '-01').toLocaleDateString('es-MX', { month: 'short' }),
      revenue
    }));
  const maxRevenue = Math.max(...monthData.map(m => m.revenue), 1);

  const Skeleton = () => <div className="h-8 bg-zinc-100 rounded-lg animate-pulse w-20" />;

  return (
    <div className="space-y-5 pb-24 bg-[#fafafa]">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight">Analytics</h2>
          <p className="text-[13px] font-medium text-zinc-500 mt-0.5">Datos reales de Beds24</p>
        </div>
        <button
          onClick={fetchReservas}
          disabled={isLoading}
          className={`w-9 h-9 flex items-center justify-center text-zinc-500 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl shadow-sm transition-all ${isLoading ? 'opacity-50' : 'active:scale-95'}`}
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Token Error */}
      {tokenError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[13px] font-semibold text-amber-800">Token Beds24 caducado. Actualiza el .env y reinicia.</p>
        </div>
      )}

      {/* ── PANEL DE EXPORTACIÓN ────────────────────────────────────────────── */}
      <div className="bg-zinc-900 rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] font-bold text-white">Exportar datos</p>
            <p className="text-[12px] text-zinc-400 mt-0.5">Power Query · Excel · SQL</p>
          </div>
          <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full tracking-wider">LIVE</span>
        </div>

        {/* Botones de Exportación Directa */}
        <div className="grid grid-cols-2 gap-3">
          {/* CSV */}
          <button
            onClick={exportCSV}
            disabled={exportLoading || isLoading}
            className="w-full flex flex-col items-center justify-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/10 text-white rounded-xl px-4 py-3 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <Download size={18} className={`mb-1 ${exportLoading ? 'animate-bounce' : ''}`} />
            <p className="text-[13px] font-semibold leading-tight">Archivo CSV</p>
            <p className="text-[10px] text-zinc-400 font-normal">Excel / Spreadsheets</p>
          </button>

          {/* SQL */}
          <button
            onClick={exportSQL}
            disabled={exportLoading || isLoading}
            className="w-full flex flex-col items-center justify-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/10 text-white rounded-xl px-4 py-3 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <Download size={18} className={`mb-1 text-blue-400 ${exportLoading ? 'animate-bounce' : ''}`} />
            <p className="text-[13px] font-semibold leading-tight text-blue-100">Scripts SQL</p>
            <p className="text-[10px] text-blue-300/70 font-normal">Base de Datos</p>
          </button>
        </div>


        {/* Power Query Live URL */}
        <div className="bg-white/5 border border-white/8 rounded-xl p-3.5">
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Conexión en vivo (Power Query → From Web)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] text-zinc-300 font-mono truncate bg-black/30 px-2.5 py-1.5 rounded-lg">
              /api/export?format=json
            </code>
            <button
              onClick={copyJSONUrl}
              className="shrink-0 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
            En Excel: <span className="text-zinc-400 font-medium">Datos → Obtener datos → Desde la web</span> → pega la URL completa de tu servidor.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Revenue</span>
            <TrendingUp size={14} className="text-emerald-500" />
          </div>
          {isLoading ? <Skeleton /> : (
            <p className="text-2xl font-bold text-zinc-900 tracking-tighter">MX${revenueTotal.toLocaleString('es-MX')}</p>
          )}
          <p className="text-[11px] font-medium text-zinc-400 mt-1.5">estimado total</p>
        </div>

        <div className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Ocupación</span>
            <BedDouble size={14} className="text-zinc-400" />
          </div>
          {isLoading ? <Skeleton /> : (
            <p className="text-2xl font-bold text-zinc-900 tracking-tighter">{ocupacion}%</p>
          )}
          <div className="mt-2 w-full h-1 bg-zinc-100 rounded-full overflow-hidden">
            <div className="h-full bg-zinc-900 rounded-full transition-all duration-700" style={{ width: `${ocupacion}%` }} />
          </div>
        </div>

        <div className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">ADR</span>
            <DollarSign size={14} className="text-zinc-400" />
          </div>
          {isLoading ? <Skeleton /> : (
            <p className="text-2xl font-bold text-zinc-900 tracking-tighter">MX${adr}</p>
          )}
          <p className="text-[11px] font-medium text-zinc-400 mt-1.5">precio medio/noche</p>
        </div>

        <div className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Reservas</span>
            <Users size={14} className="text-zinc-400" />
          </div>
          {isLoading ? <Skeleton /> : (
            <p className="text-2xl font-bold text-zinc-900 tracking-tighter">{reservas.length}</p>
          )}
          <p className="text-[11px] font-medium text-zinc-400 mt-1.5 flex items-center gap-1">
            <Moon size={9} /> {totalNoches} noches totales
          </p>
        </div>
      </div>

      {/* Revenue por Mes */}
      {monthData.length > 0 && (
        <div className="bg-white border border-zinc-200/80 p-5 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
          <h3 className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-5">Revenue por Mes</h3>
          <div className="flex items-end gap-2 h-28">
            {monthData.map((m, i) => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                  <div
                    className={`w-full rounded-lg transition-all ${i === monthData.length - 1 ? 'bg-zinc-900' : 'bg-zinc-200'}`}
                    style={{ height: `${Math.max(4, (m.revenue / maxRevenue) * 80)}px` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-zinc-400">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Canal Breakdown */}
      {channelData.length > 0 ? (
        <div className="bg-white border border-zinc-200/80 p-5 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
          <h3 className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-5">Por Canal</h3>
          <div className="space-y-4">
            {channelData.map(ch => (
              <div key={ch.name} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ch.color }} />
                <div className="flex-1">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-[13px] font-semibold text-zinc-800">{ch.name}</span>
                    <span className="text-[13px] font-bold text-zinc-900">MX${ch.revenue.toLocaleString('es-MX')}</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${ch.pct}%`, backgroundColor: ch.color }}
                    />
                  </div>
                </div>
                <span className="text-[11px] font-bold text-zinc-400 w-8 text-right shrink-0">{ch.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : !isLoading && (
        <div className="bg-white border border-zinc-200/60 border-dashed rounded-2xl p-8 text-center">
          <BarChart3 size={24} className="text-zinc-300 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-[14px] font-medium text-zinc-500">Sin datos suficientes para Analytics.</p>
          <p className="text-[12px] text-zinc-400 mt-1">Haz reservas de prueba via WhatsApp para ver los datos aquí.</p>
        </div>
      )}
    </div>
  );
}
