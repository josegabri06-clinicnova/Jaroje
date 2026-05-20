"use client";

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, BarChart3, DollarSign, BedDouble, RefreshCw, Moon, Users, AlertCircle, Download, Copy, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function AnalyticsPage() {
  const [reservas, setReservas] = useState<any[]>([]);
  const [finanzas, setFinanzas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenError, setTokenError] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    setTokenError(false);
    try {
      // 1. Fetch de reservas desde Beds24
      const res = await fetch('/api/reservas');
      const json = await res.json();
      if (json.error === 'TOKEN_EXPIRED') { 
        setTokenError(true); 
      } else if (json.success && json.data) {
        setReservas(json.data);
      }

      // 2. Fetch de movimientos financieros desde Supabase
      const { data: finData, error: finErr } = await supabase
        .from('finances')
        .select('*');
      
      if (!finErr && finData) {
        setFinanzas(finData);
      }
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

  useEffect(() => { 
    fetchData(); 
  }, []);

  // ── Calcular métricas en tiempo real ───────────────────────────────────────
  const totalNoches = reservas.reduce((s, r) => s + (r.nights || 0), 0);
  const revenueTotal = reservas.reduce((s, r) => s + (r.price_estimate || 0), 0);
  
  // ADR (Average Daily Rate) es estrictamente un KPI de habitación (Room revenue / Nights)
  // por ende se calcula únicamente sobre el revenueTotal bruto de camas de Beds24.
  const adr = totalNoches > 0 ? Math.round(revenueTotal / totalNoches) : 0;
  const ocupacion = Math.min(100, Math.round((totalNoches / 30) * 100));

  // Egresos reales desde Supabase
  const totalGastos = finanzas
    .filter(f => f.type === 'gasto')
    .reduce((s, f) => s + (Number(f.amount) || 0), 0);

  // Ingresos manuales reales desde Supabase (Tours, mini-bar, late checkouts, depósitos, etc.)
  const ingresosManuales = finanzas
    .filter(f => f.type === 'ingreso')
    .reduce((s, f) => s + (Number(f.amount) || 0), 0);

  // Ingresos Consolidados Totales
  const ingresosConsolidados = revenueTotal + ingresosManuales;

  // Utilidad Neta (Net Profit) Consolidada
  const utilidadNeta = ingresosConsolidados - totalGastos;

  // Canal breakdown (Beds24)
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

  // Ingresos consolidados agrupados por mes (Beds24 + Supabase type === 'ingreso')
  const monthMap: Record<string, number> = {};
  reservas.forEach(r => {
    if (!r.check_in) return;
    const m = r.check_in.substring(0, 7); // YYYY-MM
    if (!monthMap[m]) monthMap[m] = 0;
    monthMap[m] += r.price_estimate || 0;
  });

  finanzas.forEach(f => {
    if (!f.date) return;
    const m = f.date.substring(0, 7); // YYYY-MM
    if (!monthMap[m]) monthMap[m] = 0;
    if (f.type === 'ingreso') {
      monthMap[m] += Number(f.amount) || 0;
    }
  });

  // Egresos agrupados por mes (Supabase)
  const expenseMonthMap: Record<string, number> = {};
  finanzas.forEach(f => {
    if (!f.date) return;
    const m = f.date.substring(0, 7); // YYYY-MM
    if (!expenseMonthMap[m]) expenseMonthMap[m] = 0;
    if (f.type === 'gasto') {
      expenseMonthMap[m] += Number(f.amount) || 0;
    }
  });

  // Consolidación de últimos 6 meses
  const allMonths = Array.from(new Set([
    ...Object.keys(monthMap),
    ...Object.keys(expenseMonthMap)
  ])).sort().slice(-6);

  const monthlyComparison = allMonths.map(m => {
    const revenue = monthMap[m] || 0;
    const expense = expenseMonthMap[m] || 0;
    const profit = revenue - expense;
    return {
      label: new Date(m + '-02').toLocaleDateString('es-MX', { month: 'short' }),
      revenue,
      expense,
      profit
    };
  });

  const maxVal = Math.max(
    ...monthlyComparison.map(m => Math.max(m.revenue, m.expense)),
    1
  );

  const Skeleton = () => <div className="h-8 bg-zinc-100 rounded-lg animate-pulse w-20" />;

  return (
    <div className="space-y-5 pb-24 bg-[#fafafa]">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight">Analytics</h2>
          <p className="text-[13px] font-medium text-zinc-500 mt-0.5">Métricas reales integradas · Beds24 + Supabase</p>
        </div>
        <button
          onClick={fetchData}
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

      {/* Panel de exportación */}
      <div className="bg-zinc-900 rounded-2xl p-5 space-y-4 shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] font-bold text-white">Exportar datos</p>
            <p className="text-[12px] text-zinc-400 mt-0.5">Power Query · Excel · SQL</p>
          </div>
          <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full tracking-wider">LIVE</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={exportCSV}
            disabled={exportLoading || isLoading}
            className="w-full flex flex-col items-center justify-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/10 text-white rounded-xl px-4 py-3 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <Download size={18} className={`mb-1 ${exportLoading ? 'animate-bounce' : ''}`} />
            <p className="text-[13px] font-semibold leading-tight">Archivo CSV</p>
            <p className="text-[10px] text-zinc-400 font-normal">Excel / Spreadsheets</p>
          </button>

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
            En Excel: <span className="text-zinc-400 font-medium">Datos → Obtener datos → Desde la web</span> → pega la URL completa.
          </p>
        </div>
      </div>

      {/* Utilidad Neta Highlights */}
      <div className="bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-850 text-white p-5 rounded-3xl shadow-[0_6px_20px_rgba(55,48,163,0.15)] flex flex-col gap-1.5 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl" />
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-bold text-indigo-200 uppercase tracking-widest">Utilidad Neta (Net Profit)</span>
          <span className={`flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${utilidadNeta >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
            {utilidadNeta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {utilidadNeta >= 0 ? 'Positivo' : 'Déficit'}
          </span>
        </div>
        {isLoading ? (
          <div className="h-10 bg-white/10 rounded-lg animate-pulse w-48 mt-1" />
        ) : (
          <p className="text-3xl font-extrabold tracking-tight">MX${utilidadNeta.toLocaleString('es-MX')}</p>
        )}
        <div className="flex items-center justify-between text-[11px] text-indigo-300 font-medium mt-3 border-t border-indigo-500/20 pt-2.5">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Ingreso: MX${ingresosConsolidados.toLocaleString('es-MX')}</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Egreso: MX${totalGastos.toLocaleString('es-MX')}</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Ingresos</span>
              <TrendingUp size={14} className="text-emerald-500" />
            </div>
            {isLoading ? <Skeleton /> : (
              <p className="text-xl font-bold text-zinc-900 tracking-tight">MX${ingresosConsolidados.toLocaleString('es-MX')}</p>
            )}
          </div>
          <p className="text-[10px] font-medium text-zinc-400 mt-2">
            Beds24: MX${revenueTotal.toLocaleString('es-MX')} + Caja: MX${ingresosManuales.toLocaleString('es-MX')}
          </p>
        </div>

        <div className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Egresos</span>
              <TrendingDown size={14} className="text-rose-500" />
            </div>
            {isLoading ? <Skeleton /> : (
              <p className="text-xl font-bold text-zinc-900 tracking-tight">MX${totalGastos.toLocaleString('es-MX')}</p>
            )}
          </div>
          <p className="text-[10px] font-medium text-zinc-400 mt-2">Caja Supabase</p>
        </div>

        <div className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Ocupación</span>
            <BedDouble size={14} className="text-zinc-400" />
          </div>
          {isLoading ? <Skeleton /> : (
            <p className="text-xl font-bold text-zinc-900 tracking-tight">{ocupacion}%</p>
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
            <p className="text-xl font-bold text-zinc-900 tracking-tight">MX${adr}</p>
          )}
          <p className="text-[10px] font-medium text-zinc-400 mt-1.5">precio medio/noche</p>
        </div>

        <div className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] col-span-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Estadísticas de Estancia</span>
            <Users size={14} className="text-zinc-400" />
          </div>
          <div className="flex items-baseline justify-between">
            {isLoading ? <Skeleton /> : (
              <p className="text-xl font-bold text-zinc-900 tracking-tight">{reservas.length} Reservas</p>
            )}
            <p className="text-[11px] font-medium text-zinc-500 flex items-center gap-1">
              <Moon size={10} /> {totalNoches} noches totales operadas
            </p>
          </div>
        </div>
      </div>

      {/* Gráfico Comparativo: Ingresos vs Egresos */}
      {monthlyComparison.length > 0 && (
        <div className="bg-white border border-zinc-200/80 p-5 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest">Ingresos vs Egresos</h3>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-800">
                <span className="w-2 h-2 bg-zinc-900 rounded-full" /> Ingresos
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500">
                <span className="w-2 h-2 bg-rose-500 rounded-full" /> Egresos
              </span>
            </div>
          </div>
          
          <div className="flex items-end gap-3 h-36 pt-2">
            {monthlyComparison.map((m) => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex justify-center items-end gap-1 h-24">
                  {/* Barra Ingresos */}
                  <div className="w-3.5 flex flex-col justify-end h-full">
                    <div 
                      className="w-full bg-zinc-900 rounded-t-sm hover:opacity-85 transition-all cursor-pointer relative group"
                      style={{ height: `${Math.max(2, (m.revenue / maxVal) * 96)}px` }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-zinc-950 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        MX${m.revenue.toLocaleString('es-MX')}
                      </div>
                    </div>
                  </div>
                  {/* Barra Egresos */}
                  <div className="w-3.5 flex flex-col justify-end h-full">
                    <div 
                      className="w-full bg-rose-500 rounded-t-sm hover:opacity-85 transition-all cursor-pointer relative group"
                      style={{ height: `${Math.max(2, (m.expense / maxVal) * 96)}px` }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-zinc-950 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        MX${m.expense.toLocaleString('es-MX')}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Balance tag */}
                <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${m.profit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {m.profit >= 0 ? '+' : ''}{Math.round(m.profit / 1000)}k
                </div>
                
                <span className="text-[10px] font-semibold text-zinc-400">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráfico de Beneficio Neto */}
      {monthlyComparison.length > 0 && (
        <div className="bg-white border border-zinc-200/80 p-5 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest">Beneficio Neto Mensual</h3>
              <p className="text-[10px] text-zinc-400 font-medium mt-0.5">Ingresos Consolidados - Egresos Totales</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-800">
                <span className="w-2 h-2 bg-emerald-500 rounded-full" /> Ganancia
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500">
                <span className="w-2 h-2 bg-rose-500 rounded-full" /> Pérdida
              </span>
            </div>
          </div>
          
          <div className="flex items-end gap-3 h-36 pt-2">
            {monthlyComparison.map((m) => {
              const maxProfitVal = Math.max(
                ...monthlyComparison.map(x => Math.abs(x.profit)),
                1
              );
              const barHeight = Math.max(2, (Math.abs(m.profit) / maxProfitVal) * 96);
              
              return (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex justify-center items-end h-24">
                    <div 
                      className={`w-5 ${m.profit >= 0 ? 'bg-emerald-500/90 hover:bg-emerald-500' : 'bg-rose-500/90 hover:bg-rose-500'} rounded-t-md transition-all cursor-pointer relative group`}
                      style={{ height: `${barHeight}px` }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-zinc-950 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        {m.profit >= 0 ? '+' : '-'}MX${Math.abs(m.profit).toLocaleString('es-MX')}
                      </div>
                    </div>
                  </div>
                  
                  {/* Balance text */}
                  <span className={`text-[10px] font-extrabold ${m.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {m.profit >= 0 ? '+' : '-'}${Math.abs(Math.round(m.profit / 1000))}k
                  </span>
                  
                  <span className="text-[10px] font-semibold text-zinc-400">{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Canal Breakdown */}
      {channelData.length > 0 ? (
        <div className="bg-white border border-zinc-200/80 p-5 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
          <h3 className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-5">Por Canal (Beds24)</h3>
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
