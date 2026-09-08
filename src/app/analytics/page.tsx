"use client";

import { useEffect, useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  DollarSign, 
  RefreshCw, 
  Moon, 
  AlertCircle, 
  Download, 
  Copy, 
  Check, 
  Calendar, 
  User, 
  Briefcase,
  Layers,
  ChevronDown,
  Info,
  ShieldCheck,
  Percent
} from 'lucide-react';

// Helper: calcular ingresos prorrateados de una reserva en un periodo (Criterio de Devengo)
function getStayRevenueInPeriod(r: any, start: string, end: string) {
  if (!r.check_in || !r.check_out) return 0;
  if (r.status === 'cancelled' || r.status === '0') return 0;

  const rIn = new Date(r.check_in + 'T12:00:00');
  const rOut = new Date(r.check_out + 'T12:00:00');
  const sDate = start ? new Date(start + 'T12:00:00') : null;
  const eDate = end ? new Date(end + 'T12:00:00') : null;

  if (sDate && eDate) {
    if (rIn < eDate && rOut > sDate) {
      const overlapStart = new Date(Math.max(rIn.getTime(), sDate.getTime()));
      const overlapEnd = new Date(Math.min(rOut.getTime(), eDate.getTime()));
      const diff = (overlapEnd.getTime() - overlapStart.getTime()) / 86400000;
      const overlapNights = Math.max(0, Math.round(diff));

      if (overlapNights > 0) {
        const totalNightsOfBooking = Math.max(1, Math.round((rOut.getTime() - rIn.getTime()) / 86400000));
        const price = Number(r.price_estimate || r.price || 0);
        const pricePerNight = price / totalNightsOfBooking;
        return pricePerNight * overlapNights;
      }
    }
  }
  return 0;
}

// Helper: calcular comisiones prorrateadas de una reserva en un periodo
function getStayCommissionInPeriod(r: any, start: string, end: string) {
  if (!r.check_in || !r.check_out) return 0;
  if (r.status === 'cancelled' || r.status === '0') return 0;

  const rIn = new Date(r.check_in + 'T12:00:00');
  const rOut = new Date(r.check_out + 'T12:00:00');
  const sDate = start ? new Date(start + 'T12:00:00') : null;
  const eDate = end ? new Date(end + 'T12:00:00') : null;

  if (sDate && eDate) {
    if (rIn < eDate && rOut > sDate) {
      const overlapStart = new Date(Math.max(rIn.getTime(), sDate.getTime()));
      const overlapEnd = new Date(Math.min(rOut.getTime(), eDate.getTime()));
      const diff = (overlapEnd.getTime() - overlapStart.getTime()) / 86400000;
      const overlapNights = Math.max(0, Math.round(diff));

      if (overlapNights > 0) {
        const totalNightsOfBooking = Math.max(1, Math.round((rOut.getTime() - rIn.getTime()) / 86400000));
        const commission = Number(r.commission || 0);
        const commissionPerNight = commission / totalNightsOfBooking;
        return commissionPerNight * overlapNights;
      }
    }
  }
  return 0;
}

// Helper para parsear fechas de forma segura en zona horaria local
const parseLocalDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const cleanStr = dateStr.split('T')[0];
  const parts = cleanStr.split('-');
  if (parts.length < 3) return new Date(dateStr);
  const [y, m, d] = parts.map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

// ── COMPONENTE: GRÁFICA COMPARATIVA DE DOBLE COLUMNA (YoY) ──────────────────
function DoubleBarChart({
  title,
  description,
  prevYear,
  currYear,
  prevTotal,
  currTotal,
  data,
  isPercentage = false,
  bgClassPrev,
  bgClassCurr,
}: {
  title: string;
  description: string;
  prevYear: number;
  currYear: number;
  prevTotal: number;
  currTotal: number;
  data: { label: string; prevVal: number; currVal: number }[];
  isPercentage?: boolean;
  bgClassPrev: string;
  bgClassCurr: string;
}) {
  const formatValue = (v: number) => {
    if (isPercentage) return `${Math.round(v)}%`;
    return `MX$${Math.round(v).toLocaleString('es-MX')}`;
  };

  const formatCompactValue = (v: number) => {
    if (isPercentage) return `${Math.round(v)}%`;
    const absV = Math.abs(v);
    if (absV === 0) return 'MX$0';
    if (absV >= 1000000) return `${v < 0 ? '-' : ''}MX$${(absV / 1000000).toFixed(1)}M`;
    if (absV >= 1000) return `${v < 0 ? '-' : ''}MX$${Math.round(absV / 1000)}k`;
    return `${v < 0 ? '-' : ''}MX$${Math.round(absV)}`;
  };

  const maxVal = isPercentage ? 100 : Math.max(...data.map(d => Math.max(d.prevVal, d.currVal, 0)), 1);
  const minVal = isPercentage ? 0 : Math.min(...data.map(d => Math.min(d.prevVal, d.currVal, 0)), 0);
  const range = maxVal - minVal;

  const zeroPct = range > 0 ? (Math.abs(minVal) / range) * 100 : 0;

  const growth = isPercentage
    ? (currTotal - prevTotal)
    : (prevTotal !== 0 ? ((currTotal - prevTotal) / Math.abs(prevTotal)) * 100 : 0);

  const isPositiveGrowth = growth >= 0;
  const growthText = isPercentage
    ? `${isPositiveGrowth ? '+' : ''}${growth.toFixed(1)}%`
    : `${isPositiveGrowth ? '+' : ''}${growth.toFixed(1)}%`;

  const ticks = useMemo(() => {
    if (isPercentage) {
      return [100, 80, 60, 40, 20, 0];
    }
    const step = range / 4;
    return [
      maxVal,
      maxVal - step,
      maxVal - step * 2,
      maxVal - step * 3,
      minVal
    ];
  }, [maxVal, minVal, range, isPercentage]);

  return (
    <div className="bg-white border border-zinc-200/80 rounded-[32px] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-6 flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 select-none">
        <div>
          <h3 className="text-[15px] font-black text-zinc-950 tracking-tight uppercase">{title}</h3>
          <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">{description}</p>
        </div>
        
        <div className="bg-[#fafafa] border border-zinc-200/60 rounded-2xl p-3 flex items-center justify-between gap-4 min-w-[240px]">
          <div className="flex-1 space-y-1">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-[9px] text-zinc-400 font-extrabold uppercase">{prevYear}:</span>
              <span className="text-[12px] font-extrabold text-zinc-500">{formatValue(prevTotal)}</span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-[9px] text-zinc-400 font-extrabold uppercase">{currYear}:</span>
              <span className="text-[14px] font-black text-zinc-900">{formatValue(currTotal)}</span>
            </div>
          </div>
          
          <div className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black shrink-0 flex items-center gap-0.5 ${
            isPositiveGrowth ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
          }`}>
            {isPositiveGrowth ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {growthText}
          </div>
        </div>
      </div>

      <div className="w-full overflow-x-auto pb-2 -mx-2 px-2 scrollbar-thin">
        <div className="min-w-[650px] pt-6 flex flex-col relative">
          
          <div className="flex relative h-44">
            <div className="w-[70px] h-full relative pr-2 select-none">
              {ticks.map((tickVal, idx) => {
                const pct = range > 0 ? ((tickVal - minVal) / range) * 100 : 0;
                return (
                  <span 
                    key={idx} 
                    className="absolute right-2 text-[9px] font-bold text-zinc-400 whitespace-nowrap transition-all translate-y-1/2" 
                    style={{ bottom: `${pct}%` }}
                  >
                    {formatCompactValue(tickVal)}
                  </span>
                );
              })}
            </div>

            <div className="flex-1 h-full relative border-l border-r border-zinc-150 px-1">
              {ticks.map((tickVal, idx) => {
                const pct = range > 0 ? ((tickVal - minVal) / range) * 100 : 0;
                return (
                  <div 
                    key={idx} 
                    className="absolute inset-x-0 border-b border-zinc-100 pointer-events-none" 
                    style={{ bottom: `${pct}%` }} 
                  />
                );
              })}
              
              {zeroPct > 0 && zeroPct < 100 && (
                <div 
                  className="absolute inset-x-0 border-t-2 border-dashed border-zinc-300 pointer-events-none z-10"
                  style={{ bottom: `${zeroPct}%` }}
                />
              )}

              <div className="flex items-end justify-between h-full relative z-20">
                {data.map((item) => {
                  const prevHeight = range > 0 ? (Math.abs(item.prevVal) / range) * 100 : 0;
                  const currHeight = range > 0 ? (Math.abs(item.currVal) / range) * 100 : 0;

                  const prevIsNegative = item.prevVal < 0;
                  const currIsNegative = item.currVal < 0;

                  const prevStyle = prevIsNegative
                    ? { height: `${prevHeight}%`, top: `${100 - zeroPct}%`, bottom: 'auto' }
                    : { height: `${prevHeight}%`, bottom: `${zeroPct}%`, top: 'auto' };

                  const currStyle = currIsNegative
                    ? { height: `${currHeight}%`, top: `${100 - zeroPct}%`, bottom: 'auto' }
                    : { height: `${currHeight}%`, bottom: `${zeroPct}%`, top: 'auto' };

                  return (
                    <div key={item.label} className="flex-1 flex flex-col items-center group relative h-full">
                      <div className="w-full h-full relative">
                        <div 
                          className={`w-3.5 rounded-t-sm hover:opacity-85 transition-all cursor-pointer absolute ${bgClassPrev} ${
                            prevIsNegative ? 'rounded-b-sm rounded-t-none bg-rose-200 border border-rose-300' : ''
                          }`}
                          style={{ ...prevStyle, left: 'calc(50% - 16px)' }}
                        >
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-zinc-950 text-white text-[9px] font-bold px-2 py-1 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none">
                            {prevYear} · {item.label}: {formatValue(item.prevVal)}
                          </div>
                        </div>

                        <div 
                          className={`w-3.5 rounded-t-sm hover:opacity-85 transition-all cursor-pointer absolute ${bgClassCurr} ${
                            currIsNegative ? 'rounded-b-sm rounded-t-none bg-rose-500 border border-rose-600' : ''
                          }`}
                          style={{ ...currStyle, right: 'calc(50% - 16px)' }}
                        >
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-zinc-950 text-white text-[9px] font-bold px-2 py-1 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none">
                            {currYear} · {item.label}: {formatValue(item.currVal)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="w-[70px] h-full relative pl-2 select-none">
              {ticks.map((tickVal, idx) => {
                const pct = range > 0 ? ((tickVal - minVal) / range) * 100 : 0;
                return (
                  <span 
                    key={idx} 
                    className="absolute left-2 text-[9px] font-bold text-zinc-400 whitespace-nowrap transition-all translate-y-1/2" 
                    style={{ bottom: `${pct}%` }}
                  >
                    {formatCompactValue(tickVal)}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="flex">
            <div className="w-[70px] shrink-0 pr-2" />
            <div className="flex-1 flex justify-between mt-3 pt-2 border-t border-zinc-200/80 select-none px-1">
              {data.map(item => (
                <span key={item.label} className="flex-1 text-center text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">
                  {item.label}
                </span>
              ))}
            </div>
            <div className="w-[70px] shrink-0 pl-2" />
          </div>

        </div>
      </div>

      <div className="flex justify-center items-center gap-5 pt-2 select-none border-t border-zinc-150/60">
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500">
          <span className={`w-2.5 h-2.5 rounded-md ${bgClassPrev}`} /> {prevYear} (Año Anterior)
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-800">
          <span className={`w-2.5 h-2.5 rounded-md ${bgClassCurr}`} /> {currYear} (Año Seleccionado)
        </span>
      </div>

    </div>
  );
}

// ── COMPONENTE PRINCIPAL DE ANALYTICS ──────────────────────────────────────
export default function AnalyticsPage() {
  const [reservas, setReservas] = useState<any[]>([]);
  const [finanzas, setFinanzas] = useState<any[]>([]);
  const [summaryData, setSummaryData] = useState<{ totalReservas: number; totalFinances: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenError, setTokenError] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);

  // Estados de navegación y filtros
  const [activeTab, setActiveTab] = useState<'cantidades' | 'graficas'>('cantidades');
  const [sortField, setSortField] = useState<'roomName' | 'occupiedNights' | 'occupancyRate' | 'revenue' | 'adr'>('roomName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Inicializar rango de fechas por defecto: primer día del mes actual al último día del mes actual
  const { defaultStart, defaultEnd } = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      defaultStart: start.toISOString().split('T')[0],
      defaultEnd: end.toISOString().split('T')[0]
    };
  }, []);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  // Selector de año para YoY
  const currentActualYear = useMemo(() => new Date().getFullYear(), []);
  const [selectedYoYYear, setSelectedYoYYear] = useState<number>(currentActualYear);
  const previousYoYYear = useMemo(() => selectedYoYYear - 1, [selectedYoYYear]);

  // Carga de datos unificada desde el endpoint de alta velocidad /api/analytics/data
  const fetchData = async () => {
    setIsLoading(true);
    setTokenError(false);
    try {
      const res = await fetch('/api/analytics/data');
      const json = await res.json();
      if (json.error === 'TOKEN_EXPIRED') { 
        setTokenError(true); 
      } else if (json.success && json.data) {
        setReservas(json.data.reservas || []);
        setFinanzas(json.data.finances || []);
        setSummaryData(json.data.summary || null);
      }
    } catch (e) {
      console.error("Error al cargar datos en analytics:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // Sincronización con Beds24 (Rápida o Histórica Completa)
  const handleSync = async (mode: 'full' | 'recent' = 'full') => {
    setIsSyncing(true);
    setSyncProgress(mode === 'full' ? 'Sincronizando histórico multianual Beds24 (2024-2027)...' : 'Sincronizando reservas recientes...');
    try {
      const res = await fetch('/api/analytics/sync', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const json = await res.json();
      if (json.success) {
        alert(`✅ Sincronización con Beds24 completada.\n\nPeriodo: ${json.from} al ${json.to}\nTotal reservas importadas: ${json.count}`);
        await fetchData();
      } else {
        alert(`❌ Error en la sincronización: ${json.error}`);
      }
    } catch (err: any) {
      console.error("Error en sync:", err);
      alert(`❌ Ocurrió un error al conectar con el servidor de sincronización.`);
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  useEffect(() => { 
    fetchData(); 
  }, []);

  // ── PRESETS DE FECHAS RÁPIDOS ─────────────────────────────────────────────
  const setQuickRange = (type: 'this_month' | 'last_month' | 'this_year' | 'all') => {
    const now = new Date();
    if (type === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(end.toISOString().split('T')[0]);
    } else if (type === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(end.toISOString().split('T')[0]);
    } else if (type === 'this_year') {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(end.toISOString().split('T')[0]);
    } else if (type === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  // ── EXPORTADORES DE ARCHIVOS ──────────────────────────────────────────────
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
    } catch (error) {
      console.error('CSV export error:', error);
      alert('Error al exportar CSV.');
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
    } catch (error) {
      console.error('SQL export error:', error);
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

  const exportRoomPerformanceCSV = () => {
    if (roomPerformanceData.length === 0) {
      alert("No hay datos de rendimiento por habitación para exportar.");
      return;
    }
    const headers = ['Habitacion', 'Noches Ocupadas', 'Ocupacion %', 'Ingresos Proporcionales (MXN)', 'ADR (MXN)'];
    const rows = roomPerformanceData.map(r => [
      r.roomName,
      r.occupiedNights,
      `${r.occupancyRate}%`,
      r.revenue,
      r.adr
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `rendimiento_habitaciones_${startDate || 'todo'}_${endDate || 'todo'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── CÓMPUTO DE SECCIÓN 1: CANTIDADES (FILTRADO POR FECHAS) ────────────────
  const filteredFinanzas = useMemo(() => {
    return finanzas.filter(f => {
      if (!f.date) return false;
      const datePart = (f.date || '').substring(0, 10);
      const matchStart = startDate ? datePart >= startDate : true;
      const matchEnd = endDate ? datePart <= endDate : true;
      return matchStart && matchEnd;
    });
  }, [finanzas, startDate, endDate]);

  // Ingresos Devengados (Alojamiento real consumido por noche en el rango)
  const ingresosDevengados = useMemo(() => {
    return reservas
      .filter(r => r.status !== 'cancelled' && r.status !== '0')
      .reduce((sum, r) => sum + getStayRevenueInPeriod(r, startDate, endDate), 0);
  }, [reservas, startDate, endDate]);

  // Comisiones OTA estimadas/reales del periodo
  const comisionesOTAPeriodo = useMemo(() => {
    return reservas
      .filter(r => r.status !== 'cancelled' && r.status !== '0')
      .reduce((sum, r) => sum + getStayCommissionInPeriod(r, startDate, endDate), 0);
  }, [reservas, startDate, endDate]);

  // Ingresos Netos de Alojamiento (Devengados - Comisiones OTA)
  const ingresosNetos = useMemo(() => {
    return Math.max(0, ingresosDevengados - comisionesOTAPeriodo);
  }, [ingresosDevengados, comisionesOTAPeriodo]);

  // Egresos Operativos Jaroje (Caja/Banco local - categoría diferente de "Personal")
  const egresosJarojePeriodo = useMemo(() => {
    return filteredFinanzas
      .filter(f => f.type === 'gasto' && (f.category || '').trim().toLowerCase() !== 'personal')
      .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  }, [filteredFinanzas]);

  // Egresos Personales
  const egresosPersonalesPeriodo = useMemo(() => {
    return filteredFinanzas
      .filter(f => f.type === 'gasto' && (f.category || '').trim().toLowerCase() === 'personal')
      .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  }, [filteredFinanzas]);

  // Utilidad Bruta Operativa = Ingresos Devengados - Egresos Jaroje
  const utilidadBrutaPeriodo = useMemo(() => {
    return ingresosDevengados - egresosJarojePeriodo;
  }, [ingresosDevengados, egresosJarojePeriodo]);

  // Utilidad Neta Real = Ingresos Netos (post-comisiones) - Egresos Jaroje
  const utilidadNetaPeriodo = useMemo(() => {
    return ingresosNetos - egresosJarojePeriodo;
  }, [ingresosNetos, egresosJarojePeriodo]);

  // Ocupación calculada de forma dinámica en el rango (base 22 habitaciones físicas)
  const { ocupacionPeriodo, totalNochesPeriodo, totalPossibleNights } = useMemo(() => {
    let sDate: Date;
    let eDate: Date;
    
    if (!startDate || !endDate) {
      if (reservas.length === 0) return { ocupacionPeriodo: 0, totalNochesPeriodo: 0, totalPossibleNights: 0 };
      const checkIns = reservas.map(r => r.check_in).filter(Boolean).sort();
      const checkOuts = reservas.map(r => r.check_out).filter(Boolean).sort();
      if (checkIns.length === 0 || checkOuts.length === 0) return { ocupacionPeriodo: 0, totalNochesPeriodo: 0, totalPossibleNights: 0 };
      sDate = parseLocalDate(checkIns[0]);
      eDate = parseLocalDate(checkOuts[checkOuts.length - 1]);
    } else {
      sDate = parseLocalDate(startDate);
      eDate = parseLocalDate(endDate);
    }
    
    const rangeDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1);
    const totalPossibleRoomNights = 22 * rangeDays;

    let occupiedNights = 0;
    reservas.forEach(r => {
      if (!r.check_in || !r.check_out) return;
      if (r.status === 'cancelled' || r.status === '0') return;
      const rIn = parseLocalDate(r.check_in);
      const rOut = parseLocalDate(r.check_out);

      if (rIn < eDate && rOut > sDate) {
        const overlapStart = new Date(Math.max(rIn.getTime(), sDate.getTime()));
        const overlapEnd = new Date(Math.min(rOut.getTime(), eDate.getTime()));
        const diff = (overlapEnd.getTime() - overlapStart.getTime()) / 86400000;
        occupiedNights += Math.max(0, Math.round(diff));
      }
    });

    const rate = totalPossibleRoomNights > 0
      ? Math.min(100, Math.round((occupiedNights / totalPossibleRoomNights) * 100))
      : 0;

    return {
      ocupacionPeriodo: rate,
      totalNochesPeriodo: occupiedNights,
      totalPossibleNights: totalPossibleRoomNights
    };
  }, [reservas, startDate, endDate]);

  // Cómputo de KPIs Hoteleros (ADR, RevPAR, ALOS, Cancelación)
  const hotelMetrics = useMemo(() => {
    let sDate: Date;
    let eDate: Date;
    
    if (!startDate || !endDate) {
      if (reservas.length === 0) {
        return { adr: 0, revpar: 0, alos: '0.0', cancellationRate: 0, totalBookings: 0, activeBookings: 0, cancelledBookings: 0 };
      }
      const checkIns = reservas.map(r => r.check_in).filter(Boolean).sort();
      const checkOuts = reservas.map(r => r.check_out).filter(Boolean).sort();
      if (checkIns.length === 0 || checkOuts.length === 0) {
        return { adr: 0, revpar: 0, alos: '0.0', cancellationRate: 0, totalBookings: 0, activeBookings: 0, cancelledBookings: 0 };
      }
      sDate = parseLocalDate(checkIns[0]);
      eDate = parseLocalDate(checkOuts[checkOuts.length - 1]);
    } else {
      sDate = parseLocalDate(startDate);
      eDate = parseLocalDate(endDate);
    }
    
    const rangeDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1);
    const totalPossibleRoomNights = 22 * rangeDays;

    const totalBookingsInPeriod = reservas.filter(r => {
      if (!r.check_in || !r.check_out) return false;
      const rIn = parseLocalDate(r.check_in);
      const rOut = parseLocalDate(r.check_out);
      return rIn < eDate && rOut > sDate;
    });

    const activeBookings = totalBookingsInPeriod.filter(r => r.status !== 'cancelled' && r.status !== '0');
    const cancelledBookings = totalBookingsInPeriod.filter(r => r.status === 'cancelled' || r.status === '0');

    const alos = activeBookings.length > 0 
      ? (totalNochesPeriodo / activeBookings.length).toFixed(1) 
      : '0.0';

    const cancellationRate = totalBookingsInPeriod.length > 0
      ? Math.round((cancelledBookings.length / totalBookingsInPeriod.length) * 100)
      : 0;

    const adr = totalNochesPeriodo > 0 ? Math.round(ingresosDevengados / totalNochesPeriodo) : 0;
    const revpar = totalPossibleRoomNights > 0 ? Math.round(ingresosDevengados / totalPossibleRoomNights) : 0;

    return { 
      adr, 
      revpar, 
      alos, 
      cancellationRate,
      totalBookings: totalBookingsInPeriod.length,
      activeBookings: activeBookings.length,
      cancelledBookings: cancelledBookings.length
    };
  }, [reservas, startDate, endDate, totalNochesPeriodo, ingresosDevengados]);

  // Cómputo de rendimiento por habitación física (22 unidades)
  const roomPerformanceData = useMemo(() => {
    let sDate: Date;
    let eDate: Date;
    
    if (!startDate || !endDate) {
      if (reservas.length === 0) return [];
      const checkIns = reservas.map(r => r.check_in).filter(Boolean).sort();
      const checkOuts = reservas.map(r => r.check_out).filter(Boolean).sort();
      if (checkIns.length === 0 || checkOuts.length === 0) return [];
      sDate = parseLocalDate(checkIns[0]);
      eDate = parseLocalDate(checkOuts[checkOuts.length - 1]);
    } else {
      sDate = parseLocalDate(startDate);
      eDate = parseLocalDate(endDate);
    }
    const rangeDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1);

    const coreRooms = [
      '101', '102', '103', '104', '105', '106', '107',
      '201', '202', '203', '204', '205', '206',
      '301', '302', '303', '304', '305', '306',
      '401', '402'
    ];

    const statsMap: Record<string, { roomName: string; occupiedNights: number; revenue: number }> = {};
    coreRooms.forEach(roomName => {
      statsMap[roomName] = { roomName, occupiedNights: 0, revenue: 0 };
    });
    statsMap['Sin asignar'] = { roomName: 'Sin asignar', occupiedNights: 0, revenue: 0 };

    reservas.forEach(r => {
      if (!r.check_in || !r.check_out) return;
      if (r.status === 'cancelled' || r.status === '0') return;

      const rIn = parseLocalDate(r.check_in);
      const rOut = parseLocalDate(r.check_out);

      if (rIn < eDate && rOut > sDate) {
        const overlapStart = new Date(Math.max(rIn.getTime(), sDate.getTime()));
        const overlapEnd = new Date(Math.min(rOut.getTime(), eDate.getTime()));
        const diff = (overlapEnd.getTime() - overlapStart.getTime()) / 86400000;
        const overlapNights = Math.max(0, Math.round(diff));

        if (overlapNights > 0) {
          const totalNightsOfBooking = Math.max(1, Math.round((rOut.getTime() - rIn.getTime()) / 86400000));
          const price = Number(r.price_estimate || r.price || 0);
          const pricePerNight = price / totalNightsOfBooking;
          const proportionalRevenue = pricePerNight * overlapNights;

          let roomKey = String(r.room || '').trim();
          if (!roomKey || roomKey === '0') {
            roomKey = 'Sin asignar';
          }

          if (!statsMap[roomKey]) {
            statsMap[roomKey] = { roomName: roomKey, occupiedNights: 0, revenue: 0 };
          }

          statsMap[roomKey].occupiedNights += overlapNights;
          statsMap[roomKey].revenue += proportionalRevenue;
        }
      }
    });

    return Object.values(statsMap).map(s => {
      const isUnassigned = s.roomName === 'Sin asignar';
      const occupancyRate = (rangeDays > 0 && !isUnassigned)
        ? Math.min(100, Math.round((s.occupiedNights / rangeDays) * 100))
        : 0;
      const adr = s.occupiedNights > 0 ? Math.round(s.revenue / s.occupiedNights) : 0;

      return {
        roomName: s.roomName,
        occupiedNights: s.occupiedNights,
        occupancyRate,
        revenue: Math.round(s.revenue),
        adr
      };
    });
  }, [reservas, startDate, endDate]);

  const sortedRoomPerformance = useMemo(() => {
    return [...roomPerformanceData].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (sortField === 'roomName') {
        const aNum = parseInt(String(aVal), 10);
        const bNum = parseInt(String(bVal), 10);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }
        return sortDirection === 'asc' 
          ? String(aVal).localeCompare(String(bVal)) 
          : String(bVal).localeCompare(String(aVal));
      }

      return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [roomPerformanceData, sortField, sortDirection]);

  // ── CÓMPUTO DE SECCIÓN 2: GRÁFICAS HISTÓRICAS (AÑO SELECCIONADO VS ANTERIOR) ──
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    yearsSet.add(currentActualYear);
    yearsSet.add(currentActualYear - 1);
    yearsSet.add(currentActualYear - 2);
    
    reservas.forEach(r => {
      if (r.check_in) {
        const y = new Date(r.check_in + 'T12:00:00').getFullYear();
        if (!isNaN(y) && y >= 2020 && y <= 2030) yearsSet.add(y);
      }
    });

    finanzas.forEach(f => {
      if (f.date) {
        const y = new Date(f.date.substring(0, 10) + 'T12:00:00').getFullYear();
        if (!isNaN(y) && y >= 2020 && y <= 2030) yearsSet.add(y);
      }
    });

    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [reservas, finanzas, currentActualYear]);

  const yearlyComparisonData = useMemo(() => {
    const monthsNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    const calculateDataForYear = (year: number) => {
      const months = Array.from({ length: 12 }, (_, monthIdx) => {
        const startOfMonthStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
        const endOfMonthDate = new Date(year, monthIdx + 1, 0);
        const endOfMonthStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(endOfMonthDate.getDate()).padStart(2, '0')}`;

        // Filtrar transacciones del mes
        const monthFinances = finanzas.filter(f => {
          if (!f.date) return false;
          const datePart = (f.date || '').substring(0, 10);
          return datePart >= startOfMonthStr && datePart <= endOfMonthStr;
        });

        // Ingresos Devengados del mes
        const ingresos = reservas
          .filter(r => r.status !== 'cancelled' && r.status !== '0')
          .reduce((sum, r) => sum + getStayRevenueInPeriod(r, startOfMonthStr, endOfMonthStr), 0);

        // Comisiones del mes
        const comisiones = reservas
          .filter(r => r.status !== 'cancelled' && r.status !== '0')
          .reduce((sum, r) => sum + getStayCommissionInPeriod(r, startOfMonthStr, endOfMonthStr), 0);

        const ingresosNetosMes = Math.max(0, ingresos - comisiones);

        const egresosJaroje = monthFinances
          .filter(f => f.type === 'gasto' && (f.category || '').trim().toLowerCase() !== 'personal')
          .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

        const egresosPersonales = monthFinances
          .filter(f => f.type === 'gasto' && (f.category || '').trim().toLowerCase() === 'personal')
          .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

        const utilidad = ingresos - egresosJaroje;
        const utilidadNeta = ingresosNetosMes - egresosJaroje;

        // Ocupación del mes
        const daysInMonth = endOfMonthDate.getDate();
        const possibleRoomNights = 22 * daysInMonth;

        let occupiedNights = 0;
        reservas.forEach(r => {
          if (!r.check_in || !r.check_out) return;
          if (r.status === 'cancelled' || r.status === '0') return;
          const rIn = new Date(r.check_in + 'T12:00:00');
          const rOut = new Date(r.check_out + 'T12:00:00');

          const sDateM = new Date(startOfMonthStr + 'T12:00:00');
          const eDateM = new Date(endOfMonthStr + 'T12:00:00');

          if (rIn <= eDateM && rOut >= sDateM) {
            const overlapStart = new Date(Math.max(rIn.getTime(), sDateM.getTime()));
            const overlapEnd = new Date(Math.min(rOut.getTime(), eDateM.getTime()));
            const diff = (overlapEnd.getTime() - overlapStart.getTime()) / 86400000;
            occupiedNights += Math.max(0, Math.round(diff));
          }
        });

        const ocupacion = possibleRoomNights > 0
          ? Math.min(100, Math.round((occupiedNights / possibleRoomNights) * 100))
          : 0;

        return {
          ingresos,
          ingresosNetos: ingresosNetosMes,
          comisiones,
          egresosJaroje,
          egresosPersonales,
          utilidad,
          utilidadNeta,
          ocupacion
        };
      });

      // Calcular totales anuales consolidados
      const ingresosTotal = months.reduce((s, m) => s + m.ingresos, 0);
      const ingresosNetosTotal = months.reduce((s, m) => s + m.ingresosNetos, 0);
      const comisionesTotal = months.reduce((s, m) => s + m.comisiones, 0);
      const egresosJarojeTotal = months.reduce((s, m) => s + m.egresosJaroje, 0);
      const egresosPersonalesTotal = months.reduce((s, m) => s + m.egresosPersonales, 0);
      const utilidadTotal = ingresosTotal - egresosJarojeTotal;
      const utilidadNetaTotal = ingresosNetosTotal - egresosJarojeTotal;

      // Ocupación promedio anual
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      const daysInYear = isLeap ? 366 : 365;
      const possibleNightsYear = 22 * daysInYear;

      const startOfYear = new Date(`${year}-01-01T12:00:00`);
      const endOfYear = new Date(`${year}-12-31T12:00:00`);

      let occupiedYear = 0;
      reservas.forEach(r => {
        if (!r.check_in || !r.check_out) return;
        if (r.status === 'cancelled' || r.status === '0') return;
        const rIn = new Date(r.check_in + 'T12:00:00');
        const rOut = new Date(r.check_out + 'T12:00:00');

        if (rIn <= endOfYear && rOut >= startOfYear) {
          const overlapStart = new Date(Math.max(rIn.getTime(), startOfYear.getTime()));
          const overlapEnd = new Date(Math.min(rOut.getTime(), endOfYear.getTime()));
          const diff = (overlapEnd.getTime() - overlapStart.getTime()) / 86400000;
          occupiedYear += Math.max(0, Math.round(diff));
        }
      });

      const ocupacionTotal = possibleNightsYear > 0
        ? Math.min(100, Math.round((occupiedYear / possibleNightsYear) * 100))
        : 0;

      return {
        months,
        totals: {
          ingresos: ingresosTotal,
          ingresosNetos: ingresosNetosTotal,
          comisiones: comisionesTotal,
          egresosJaroje: egresosJarojeTotal,
          egresosPersonales: egresosPersonalesTotal,
          utilidad: utilidadTotal,
          utilidadNeta: utilidadNetaTotal,
          ocupacion: ocupacionTotal
        }
      };
    };

    const prevData = calculateDataForYear(previousYoYYear);
    const currData = calculateDataForYear(selectedYoYYear);

    const generateChartData = (key: 'ingresos' | 'egresosJaroje' | 'egresosPersonales' | 'utilidad' | 'utilidadNeta' | 'ocupacion') => {
      return monthsNames.map((name, idx) => ({
        label: name,
        prevVal: prevData.months[idx][key],
        currVal: currData.months[idx][key]
      }));
    };

    return {
      prevData,
      currData,
      charts: {
        utilidad: generateChartData('utilidad'),
        utilidadNeta: generateChartData('utilidadNeta'),
        ingresos: generateChartData('ingresos'),
        egresosJaroje: generateChartData('egresosJaroje'),
        egresosPersonales: generateChartData('egresosPersonales'),
        ocupacion: generateChartData('ocupacion')
      }
    };
  }, [finanzas, reservas, selectedYoYYear, previousYoYYear]);

  // ── SECCIÓN AUXILIAR: BREAKDOWN DE CANALES BEDS24 (FILTRADO POR RANGO) ────
  const { channelData, totalNochesCanales, reservasRevenuePeriodo } = useMemo(() => {
    let sDate = startDate ? new Date(startDate + 'T12:00:00') : null;
    let eDate = endDate ? new Date(endDate + 'T12:00:00') : null;

    if (!sDate || !eDate) {
      if (reservas.length === 0) return { channelData: [], totalNochesCanales: 0, reservasRevenuePeriodo: 0 };
      const checkIns = reservas.map(r => r.check_in).filter(Boolean).sort();
      const checkOuts = reservas.map(r => r.check_out).filter(Boolean).sort();
      sDate = checkIns.length > 0 ? new Date(checkIns[0] + 'T12:00:00') : new Date();
      eDate = checkOuts.length > 0 ? new Date(checkOuts[checkOuts.length - 1] + 'T12:00:00') : new Date();
    }

    let totalN = 0;
    let totalRev = 0;
    const channelMap: Record<string, { nights: number; grossRevenue: number; commission: number; netRevenue: number; bookingsCount: number }> = {};

    reservas.forEach(r => {
      if (!r.check_in || !r.check_out) return;
      if (r.status === 'cancelled' || r.status === '0') return;

      const rIn = new Date(r.check_in + 'T12:00:00');
      const rOut = new Date(r.check_out + 'T12:00:00');

      if (rIn < eDate! && rOut > sDate!) {
        const overlapStart = new Date(Math.max(rIn.getTime(), sDate!.getTime()));
        const overlapEnd = new Date(Math.min(rOut.getTime(), eDate!.getTime()));
        const diff = (overlapEnd.getTime() - overlapStart.getTime()) / 86400000;
        const overlapNights = Math.max(0, Math.round(diff));

        if (overlapNights > 0) {
          totalN += overlapNights;

          const totalNightsOfBooking = Math.max(1, Math.round((rOut.getTime() - rIn.getTime()) / 86400000));
          const price = Number(r.price_estimate || r.price || 0);
          const commission = Number(r.commission || 0);
          
          const pricePerNight = price / totalNightsOfBooking;
          const commissionPerNight = commission / totalNightsOfBooking;

          const proportionalGross = pricePerNight * overlapNights;
          const proportionalCommission = commissionPerNight * overlapNights;
          const proportionalNet = Math.max(0, proportionalGross - proportionalCommission);

          totalRev += proportionalGross;

          const ch = r.channel || 'Directo';
          if (!channelMap[ch]) {
            channelMap[ch] = { nights: 0, grossRevenue: 0, commission: 0, netRevenue: 0, bookingsCount: 0 };
          }
          channelMap[ch].nights += overlapNights;
          channelMap[ch].grossRevenue += proportionalGross;
          channelMap[ch].commission += proportionalCommission;
          channelMap[ch].netRevenue += proportionalNet;
          channelMap[ch].bookingsCount += 1;
        }
      }
    });

    const data = Object.entries(channelMap)
      .map(([name, d]) => ({
        name,
        nights: d.nights,
        grossRevenue: Math.round(d.grossRevenue),
        commission: Math.round(d.commission),
        netRevenue: Math.round(d.netRevenue),
        bookingsCount: d.bookingsCount,
        pct: totalN > 0 ? Math.round((d.nights / totalN) * 100) : 0,
        color: name.includes('Airbnb') ? '#FF5A5F' : name.includes('Booking') ? '#003580' : name.includes('Expedia') ? '#FFC000' : name.includes('WhatsApp') ? '#25D366' : '#111827'
      }))
      .sort((a, b) => b.grossRevenue - a.grossRevenue);

    return { 
      channelData: data, 
      totalNochesCanales: totalN, 
      reservasRevenuePeriodo: Math.round(totalRev) 
    };
  }, [reservas, startDate, endDate]);

  const Skeleton = () => <div className="h-7 bg-zinc-150 rounded-lg animate-pulse w-24" />;

  return (
    <div className="space-y-6 pb-24 bg-[#fafafa]">
      
      {/* ── CABECERA DEL MÓDULO ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 select-none">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[22px] font-black text-zinc-950 tracking-tight uppercase">Analytics & Reportes</h2>
            <span className="bg-blue-50 text-blue-700 border border-blue-200/80 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase">
              Beds24 BI
            </span>
          </div>
          <p className="text-[12px] font-semibold text-zinc-400 mt-0.5">
            Auditoría Contable, Ocupación y Análisis Histórico Multianual
          </p>
        </div>

        {/* Acciones de Sincronización y Recarga */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => handleSync('full')}
            disabled={isSyncing || isLoading}
            className={`px-3.5 py-2.5 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-200 disabled:text-zinc-400 rounded-xl shadow-sm transition-all ${
              isSyncing ? 'animate-pulse' : 'active:scale-95'
            } cursor-pointer`}
            title="Sincronizar todo el historial de Beds24 (2024-2027)"
          >
            <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Histórico Beds24'}</span>
          </button>

          <button
            onClick={() => handleSync('recent')}
            disabled={isSyncing || isLoading}
            className={`px-3 py-2.5 flex items-center gap-1.5 text-[11px] font-bold text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200/80 disabled:opacity-50 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer`}
            title="Sincronización rápida de los últimos 60 días"
          >
            <RefreshCw size={12} />
            <span className="hidden md:inline">Sync Rápido</span>
          </button>

          <button
            onClick={fetchData}
            disabled={isLoading || isSyncing}
            className={`w-10 h-10 flex items-center justify-center text-zinc-500 bg-white hover:bg-zinc-50 border border-zinc-200/80 rounded-xl shadow-sm transition-all ${
              isLoading ? 'opacity-50' : 'active:scale-95'
            } cursor-pointer`}
            title="Recargar vista local"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Banner de progreso de sincronización */}
      {syncProgress && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3 animate-in fade-in duration-200 text-blue-900">
          <RefreshCw size={16} className="animate-spin text-blue-600 shrink-0" />
          <p className="text-[12px] font-bold">{syncProgress}</p>
        </div>
      )}

      {/* Error de token Beds24 */}
      {tokenError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in duration-200">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[13px] font-semibold text-amber-800">Token Beds24 vencido o no configurado. Revisa tus credenciales en el archivo de entorno.</p>
        </div>
      )}

      {/* Resumen de Base de Datos */}
      {summaryData && (
        <div className="flex items-center gap-4 text-[11px] font-bold text-zinc-400 bg-white border border-zinc-200/60 px-4 py-2 rounded-2xl select-none">
          <span>Total Reservas en BI: <strong className="text-zinc-800">{summaryData.totalReservas.toLocaleString('es-MX')}</strong></span>
          <span>•</span>
          <span>Movimientos Financieros: <strong className="text-zinc-800">{summaryData.totalFinances.toLocaleString('es-MX')}</strong></span>
        </div>
      )}

      {/* ── NAVEGADOR DE PESTAÑAS (TABS) ──────────────────────────────────── */}
      <div className="flex bg-zinc-100 p-1 border border-zinc-200/50 rounded-2xl shadow-sm select-none">
        <button
          onClick={() => setActiveTab('cantidades')}
          className={`flex-1 py-3 text-[13px] font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'cantidades' 
              ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/20' 
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <DollarSign size={15} />
          Cantidades & KPIs
        </button>
        <button
          onClick={() => setActiveTab('graficas')}
          className={`flex-1 py-3 text-[13px] font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'graficas' 
              ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/20' 
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <BarChart3 size={15} />
          Gráficas Históricas (YoY)
        </button>
      </div>

      {/* ────────────────── CONTENIDO: PESTAÑA CANTIDADES ────────────────── */}
      {activeTab === 'cantidades' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Selector de Rango de Fechas & Presets */}
          <div className="bg-white border border-zinc-200/80 p-5 rounded-[28px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col gap-4 select-none">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-zinc-50 rounded-xl border border-zinc-200 flex items-center justify-center text-zinc-700">
                  <Calendar size={18} />
                </div>
                <div>
                  <h3 className="text-[13px] font-extrabold text-zinc-900 tracking-tight uppercase">Rango de Fechas</h3>
                  <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">Filtrado interactivo de métricas y contabilidad</p>
                </div>
              </div>

              {/* Presets Rápidos */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setQuickRange('this_month')}
                  className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-[10px] font-extrabold uppercase transition-all"
                >
                  Este Mes
                </button>
                <button
                  onClick={() => setQuickRange('last_month')}
                  className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-[10px] font-extrabold uppercase transition-all"
                >
                  Mes Anterior
                </button>
                <button
                  onClick={() => setQuickRange('this_year')}
                  className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-[10px] font-extrabold uppercase transition-all"
                >
                  Año Actual
                </button>
                <button
                  onClick={() => setQuickRange('all')}
                  className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-[10px] font-extrabold uppercase transition-all"
                >
                  Todo
                </button>
              </div>
            </div>

            {/* Inputs de Fechas */}
            <div className="flex flex-row items-center gap-3 flex-wrap md:flex-nowrap pt-2 border-t border-zinc-100">
              <div className="relative flex-1 bg-[#fafafa] border border-zinc-200/80 p-2 rounded-2xl shadow-sm flex items-center justify-between gap-2 px-3.5 min-w-[140px] cursor-pointer hover:bg-zinc-50 transition-colors">
                <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest">Desde</span>
                <span className="text-[12px] font-black text-zinc-800 pr-0.5">
                  {startDate ? startDate : 'Seleccionar'}
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
              <div className="relative flex-1 bg-[#fafafa] border border-zinc-200/80 p-2 rounded-2xl shadow-sm flex items-center justify-between gap-2 px-3.5 min-w-[140px] cursor-pointer hover:bg-zinc-50 transition-colors">
                <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest">Hasta</span>
                <span className="text-[12px] font-black text-zinc-800 pr-0.5">
                  {endDate ? endDate : 'Seleccionar'}
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
              {(startDate !== '' || endDate !== '') && (
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 rounded-xl text-[11px] font-extrabold transition-all active:scale-95 cursor-pointer shrink-0"
                >
                  Restablecer
                </button>
              )}
            </div>
          </div>

          {/* Tarjetas Principales de Cantidades */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* 1. UTILIDAD NETA OPERATIVA */}
            <div className="bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-850 text-white p-6 rounded-[32px] shadow-[0_6px_20px_rgba(55,48,163,0.1)] flex flex-col justify-between relative overflow-hidden group min-h-[160px]">
              <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Utilidad Neta Periodo</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black ${
                  utilidadNetaPeriodo >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {utilidadNetaPeriodo >= 0 ? '+' : '-'} Ingresos Netos - Egresos
                </span>
              </div>
              <div>
                {isLoading ? <Skeleton /> : (
                  <p className="text-3xl font-black tracking-tight">
                    MX${utilidadNetaPeriodo.toLocaleString('es-MX')}
                  </p>
                )}
                <p className="text-[10px] text-indigo-300 font-bold mt-2">
                  Ingresos Netos (Beds24 post-comisión) - Egresos Operativos
                </p>
              </div>
            </div>

            {/* 2. INGRESOS DEVENGADOS (ESTANCIA BEDS24) */}
            <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[160px] hover:border-zinc-300 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Ingresos Devengados (Beds24)</span>
                <TrendingUp size={16} className="text-emerald-500" />
              </div>
              <div>
                {isLoading ? <Skeleton /> : (
                  <p className="text-3xl font-black text-zinc-950 tracking-tight">
                    MX${Math.round(ingresosDevengados).toLocaleString('es-MX')}
                  </p>
                )}
                <p className="text-[10px] text-zinc-400 font-bold mt-2">
                  Tarifas devengadas por noches de estancia en el periodo
                </p>
              </div>
            </div>

            {/* 3. COMISIONES OTA DEDUCIDAS */}
            <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[160px] hover:border-zinc-300 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Comisiones Canales (OTA)</span>
                <Percent size={16} className="text-amber-500" />
              </div>
              <div>
                {isLoading ? <Skeleton /> : (
                  <p className="text-3xl font-black text-zinc-950 tracking-tight">
                    MX${Math.round(comisionesOTAPeriodo).toLocaleString('es-MX')}
                  </p>
                )}
                <p className="text-[10px] text-zinc-400 font-bold mt-2">
                  Booking (17.5%), Airbnb (3%), Expedia deducidos
                </p>
              </div>
            </div>

            {/* 4. EGRESOS JAROJE (OPERATIVOS) */}
            <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[160px] hover:border-zinc-300 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Egresos Operativos Jaroje</span>
                <Briefcase size={16} className="text-rose-500" />
              </div>
              <div>
                {isLoading ? <Skeleton /> : (
                  <p className="text-3xl font-black text-zinc-950 tracking-tight">
                    MX${Math.round(egresosJarojePeriodo).toLocaleString('es-MX')}
                  </p>
                )}
                <p className="text-[10px] text-zinc-400 font-bold mt-2">Gastos operativos (Excluye retiros personales)</p>
              </div>
            </div>

            {/* 5. EGRESOS PERSONALES */}
            <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[160px] hover:border-zinc-300 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Egresos Personales</span>
                <User size={16} className="text-purple-500" />
              </div>
              <div>
                {isLoading ? <Skeleton /> : (
                  <p className="text-3xl font-black text-zinc-950 tracking-tight">
                    MX${Math.round(egresosPersonalesPeriodo).toLocaleString('es-MX')}
                  </p>
                )}
                <p className="text-[10px] text-zinc-400 font-bold mt-2">Retiros privados (Categoría: &quot;Personal&quot;)</p>
              </div>
            </div>

            {/* 6. OCUPACIÓN HOTELERA */}
            <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[160px] hover:border-zinc-300 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Porcentaje Ocupación</span>
                <span className="text-[11px] font-bold text-zinc-500 flex items-center gap-1">
                  <Moon size={11} /> {totalNochesPeriodo} noches
                </span>
              </div>
              <div>
                {isLoading ? <Skeleton /> : (
                  <p className="text-3xl font-black text-zinc-950 tracking-tight">
                    {ocupacionPeriodo}%
                  </p>
                )}
                <div className="mt-2.5 w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div className="h-full bg-zinc-900 rounded-full transition-all duration-700" style={{ width: `${ocupacionPeriodo}%` }} />
                </div>
                <p className="text-[10px] text-zinc-400 font-bold mt-2">Basado en 22 habitaciones físicas ({totalPossibleNights} noches disp.)</p>
              </div>
            </div>

            {/* 7. ADR (TARIFA PROMEDIO DIARIA) */}
            <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[160px] hover:border-zinc-300 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">ADR (Tarifa Promedio)</span>
                <DollarSign size={16} className="text-zinc-600" />
              </div>
              <div>
                {isLoading ? <Skeleton /> : (
                  <p className="text-3xl font-black text-zinc-950 tracking-tight">
                    MX${hotelMetrics.adr.toLocaleString('es-MX')}
                  </p>
                )}
                <p className="text-[10px] text-zinc-400 font-bold mt-2">Tarifa promedio diaria generada por noche ocupada</p>
              </div>
            </div>

            {/* 8. RevPAR (REVENUE POR HABITACIÓN DISPONIBLE) */}
            <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[160px] hover:border-zinc-300 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">RevPAR (Hab. Disponible)</span>
                <BarChart3 size={16} className="text-zinc-600" />
              </div>
              <div>
                {isLoading ? <Skeleton /> : (
                  <p className="text-3xl font-black text-zinc-950 tracking-tight">
                    MX${hotelMetrics.revpar.toLocaleString('es-MX')}
                  </p>
                )}
                <p className="text-[10px] text-zinc-400 font-bold mt-2">Ingreso promedio sobre las 22 habitaciones totales</p>
              </div>
            </div>

            {/* 9. ESTANCIA PROMEDIO (ALOS) & CANCELACIONES */}
            <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[160px] hover:border-zinc-300 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Estancia Media (ALOS)</span>
                <span className="text-[10px] font-bold text-rose-500 flex items-center gap-1">
                  Cancelación: {hotelMetrics.cancellationRate}%
                </span>
              </div>
              <div>
                {isLoading ? <Skeleton /> : (
                  <p className="text-3xl font-black text-zinc-950 tracking-tight">
                    {hotelMetrics.alos} <span className="text-lg font-bold text-zinc-400">noches</span>
                  </p>
                )}
                <p className="text-[10px] text-zinc-400 font-bold mt-2">
                  {hotelMetrics.activeBookings} activas de {hotelMetrics.totalBookings} reservas totales
                </p>
              </div>
            </div>

          </div>

          {/* Desglose por Canal de Venta (Beds24 Reports) */}
          {channelData.length > 0 ? (
            <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-between mb-5 select-none">
                <div>
                  <h3 className="text-[14px] font-extrabold text-zinc-950 uppercase tracking-wider">Desglose por Canal de Venta (Beds24)</h3>
                  <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">Ingresos brutos, comisiones deducidas y cuota de mercado</p>
                </div>
                <span className="text-[10px] font-extrabold text-zinc-500 flex items-center gap-1">
                  <Moon size={11} /> {totalNochesCanales} noches totales
                </span>
              </div>
              <div className="space-y-4">
                {channelData.map(ch => (
                  <div key={ch.name} className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ch.color }} />
                    <div className="flex-1">
                      <div className="flex justify-between mb-1.5 select-none">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold text-zinc-800">{ch.name}</span>
                          <span className="text-[11px] text-zinc-400 font-semibold">({ch.nights} noches)</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[13px] font-black text-zinc-950">MX${ch.grossRevenue.toLocaleString('es-MX')}</span>
                          {ch.commission > 0 && (
                            <span className="text-[10px] text-rose-500 font-bold ml-2">(-MX${ch.commission.toLocaleString('es-MX')})</span>
                          )}
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${ch.pct}%`, backgroundColor: ch.color }}
                        />
                      </div>
                    </div>
                    <span className="text-[11px] font-extrabold text-zinc-400 w-8 text-right shrink-0 select-none">{ch.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : !isLoading && (
            <div className="bg-white border border-zinc-200/60 border-dashed rounded-3xl p-8 text-center">
              <BarChart3 size={24} className="text-zinc-300 mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-[13px] font-medium text-zinc-500">Sin datos de canales para este rango de fechas.</p>
            </div>
          )}

          {/* Rendimiento por Habitación Física (BI Hotelero) */}
          <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 select-none">
              <div>
                <h3 className="text-[14px] font-extrabold text-zinc-950 uppercase tracking-wider">Rendimiento por Habitación (22 Unidades)</h3>
                <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">Métricas de ocupación, ingresos devengados y ADR por unidad física</p>
              </div>
              <button
                onClick={exportRoomPerformanceCSV}
                className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-sm self-start sm:self-auto"
              >
                <Download size={12} />
                <span>Exportar Reporte</span>
              </button>
            </div>

            <div className="overflow-x-auto border border-zinc-150 rounded-2xl">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-150 select-none">
                    <th 
                      onClick={() => {
                        if (sortField === 'roomName') {
                          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('roomName');
                          setSortDirection('asc');
                        }
                      }}
                      className="p-4 text-[10px] font-black uppercase text-zinc-400 tracking-wider cursor-pointer hover:bg-zinc-100/80 transition-colors"
                    >
                      Habitación {sortField === 'roomName' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      onClick={() => {
                        if (sortField === 'occupiedNights') {
                          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('occupiedNights');
                          setSortDirection('desc');
                        }
                      }}
                      className="p-4 text-[10px] font-black uppercase text-zinc-400 tracking-wider cursor-pointer hover:bg-zinc-100/80 transition-colors"
                    >
                      Noches Ocupadas {sortField === 'occupiedNights' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      onClick={() => {
                        if (sortField === 'occupancyRate') {
                          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('occupancyRate');
                          setSortDirection('desc');
                        }
                      }}
                      className="p-4 text-[10px] font-black uppercase text-zinc-400 tracking-wider cursor-pointer hover:bg-zinc-100/80 transition-colors"
                    >
                      Ocupación % {sortField === 'occupancyRate' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      onClick={() => {
                        if (sortField === 'revenue') {
                          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('revenue');
                          setSortDirection('desc');
                        }
                      }}
                      className="p-4 text-[10px] font-black uppercase text-zinc-400 tracking-wider cursor-pointer hover:bg-zinc-100/80 transition-colors"
                    >
                      Ingreso Devengado {sortField === 'revenue' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      onClick={() => {
                        if (sortField === 'adr') {
                          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('adr');
                          setSortDirection('desc');
                        }
                      }}
                      className="p-4 text-[10px] font-black uppercase text-zinc-400 tracking-wider cursor-pointer hover:bg-zinc-100/80 transition-colors"
                    >
                      ADR Promedio {sortField === 'adr' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-[13px] font-semibold text-zinc-700">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-zinc-400 animate-pulse uppercase text-[11px] font-black tracking-widest">
                        Cargando métricas de unidades...
                      </td>
                    </tr>
                  ) : sortedRoomPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-zinc-400 font-medium">
                        No hay reservas activas en este periodo para las habitaciones.
                      </td>
                    </tr>
                  ) : sortedRoomPerformance.map(r => (
                    <tr key={r.roomName} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="p-4 font-bold text-zinc-900">
                        Habitación {r.roomName}
                      </td>
                      <td className="p-4">
                        {r.occupiedNights} noches
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="w-10 tabular-nums">{r.occupancyRate}%</span>
                          <div className="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden shrink-0">
                            <div 
                              className="h-full bg-zinc-800 rounded-full transition-all duration-500" 
                              style={{ width: `${r.occupancyRate}%` }} 
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-extrabold text-zinc-950 tabular-nums">
                        MX${r.revenue.toLocaleString('es-MX')}
                      </td>
                      <td className="p-4 tabular-nums">
                        MX${r.adr.toLocaleString('es-MX')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ────────────────── CONTENIDO: PESTAÑA GRÁFICAS (YoY) ─────────────── */}
      {activeTab === 'graficas' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Barra de Control de Años YoY */}
          <div className="bg-zinc-900 border border-zinc-950 p-5 rounded-[28px] shadow-sm select-none text-white flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-xl border border-white/10 flex items-center justify-center text-zinc-200">
                <BarChart3 size={18} />
              </div>
              <div>
                <h3 className="text-[13px] font-black tracking-wider uppercase text-zinc-100">Gráficas Comparativas Históricas</h3>
                <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">
                  Comparativa de 12 meses: Año {selectedYoYYear} vs Año Anterior {previousYoYYear}
                </p>
              </div>
            </div>

            {/* Selector de Año */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Año a Comparar:</span>
              <div className="relative">
                <select
                  value={selectedYoYYear}
                  onChange={e => setSelectedYoYYear(Number(e.target.value))}
                  className="bg-zinc-800 text-white border border-zinc-700 font-black text-[13px] rounded-xl px-4 py-2 pr-8 appearance-none cursor-pointer focus:outline-none focus:border-blue-500"
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>
                      {year} (vs {year - 1})
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <div className="bg-white border border-zinc-200/80 p-8 rounded-[32px] h-60 animate-pulse" />
              <div className="bg-white border border-zinc-200/80 p-8 rounded-[32px] h-60 animate-pulse" />
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* 1. UTILIDAD NETA */}
              <DoubleBarChart
                title="UTILIDAD NETA ANUAL"
                description={`Ingresos Netos (post-comisiones Beds24) - Egresos Operativos (${selectedYoYYear} vs ${previousYoYYear})`}
                prevYear={previousYoYYear}
                currYear={selectedYoYYear}
                prevTotal={yearlyComparisonData.prevData.totals.utilidadNeta}
                currTotal={yearlyComparisonData.currData.totals.utilidadNeta}
                data={yearlyComparisonData.charts.utilidadNeta}
                bgClassPrev="bg-emerald-300 border border-emerald-400"
                bgClassCurr="bg-emerald-600 border border-emerald-700"
              />

              {/* 2. INGRESOS DEVENGADOS */}
              <DoubleBarChart
                title="INGRESOS DEVENGADOS (ESTANCIAS BEDS24)"
                description={`Total de valor de alojamiento devengado por mes (${selectedYoYYear} vs ${previousYoYYear})`}
                prevYear={previousYoYYear}
                currYear={selectedYoYYear}
                prevTotal={yearlyComparisonData.prevData.totals.ingresos}
                currTotal={yearlyComparisonData.currData.totals.ingresos}
                data={yearlyComparisonData.charts.ingresos}
                bgClassPrev="bg-zinc-300 border border-zinc-400"
                bgClassCurr="bg-zinc-900 border border-zinc-950"
              />

              {/* 3. EGRESOS OPERATIVOS JAROJE */}
              <DoubleBarChart
                title="EGRESOS OPERATIVOS JAROJE"
                description={`Gastos del negocio en Supabase (excluye retiros personales) (${selectedYoYYear} vs ${previousYoYYear})`}
                prevYear={previousYoYYear}
                currYear={selectedYoYYear}
                prevTotal={yearlyComparisonData.prevData.totals.egresosJaroje}
                currTotal={yearlyComparisonData.currData.totals.egresosJaroje}
                data={yearlyComparisonData.charts.egresosJaroje}
                bgClassPrev="bg-rose-200 border border-rose-300"
                bgClassCurr="bg-rose-500 border border-rose-600"
              />

              {/* 4. EGRESOS PERSONALES */}
              <DoubleBarChart
                title="EGRESOS PERSONALES"
                description={`Retiros y gastos de categoría "Personal" (${selectedYoYYear} vs ${previousYoYYear})`}
                prevYear={previousYoYYear}
                currYear={selectedYoYYear}
                prevTotal={yearlyComparisonData.prevData.totals.egresosPersonales}
                currTotal={yearlyComparisonData.currData.totals.egresosPersonales}
                data={yearlyComparisonData.charts.egresosPersonales}
                bgClassPrev="bg-purple-200 border border-purple-300"
                bgClassCurr="bg-purple-600 border border-purple-700"
              />

              {/* 5. % OCUPACIÓN */}
              <DoubleBarChart
                title="% OCUPACIÓN DE HABITACIONES"
                description={`Tasa de ocupación mensual (sobre 22 unidades físicas) (${selectedYoYYear} vs ${previousYoYYear})`}
                prevYear={previousYoYYear}
                currYear={selectedYoYYear}
                prevTotal={yearlyComparisonData.prevData.totals.ocupacion}
                currTotal={yearlyComparisonData.currData.totals.ocupacion}
                data={yearlyComparisonData.charts.ocupacion}
                isPercentage={true}
                bgClassPrev="bg-blue-200 border border-blue-300"
                bgClassCurr="bg-blue-600 border border-blue-700"
              />
            </div>
          )}

        </div>
      )}

      {/* ────────────────── PANEL DE EXPORTACIÓN & POWER QUERY ─────────────── */}
      <div className="bg-zinc-900 rounded-[32px] p-6 space-y-4 shadow-[0_4px_16px_rgba(0,0,0,0.06)] select-none">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] font-bold text-white uppercase tracking-wider">Exportación & Power Query</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">Exportación de datos de Reservas de Jaroje</p>
          </div>
          <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full tracking-wider">LIVE</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={exportCSV}
            disabled={exportLoading || isLoading}
            className="w-full flex flex-col items-center justify-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/10 text-white rounded-xl px-4 py-3 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            <Download size={18} className={`mb-1 ${exportLoading ? 'animate-bounce' : ''}`} />
            <p className="text-[13px] font-bold leading-tight">Archivo CSV</p>
            <p className="text-[10px] text-zinc-400 font-normal">Excel / Spreadsheets</p>
          </button>

          <button
            onClick={exportSQL}
            disabled={exportLoading || isLoading}
            className="w-full flex flex-col items-center justify-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/10 text-white rounded-xl px-4 py-3 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            <Download size={18} className={`mb-1 text-blue-400 ${exportLoading ? 'animate-bounce' : ''}`} />
            <p className="text-[13px] font-bold leading-tight text-blue-100">Scripts SQL</p>
            <p className="text-[10px] text-blue-300/70 font-normal">Base de Datos</p>
          </button>
        </div>

        <div className="bg-white/5 border border-white/8 rounded-2xl p-4">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Conexión en vivo (Excel → Power Query)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] text-zinc-300 font-mono truncate bg-black/30 px-3 py-2 rounded-lg">
              /api/export?format=json
            </code>
            <button
              onClick={copyJSONUrl}
              className="shrink-0 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-[12px] font-semibold px-3 py-2 rounded-lg transition-all active:scale-95 cursor-pointer"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
            En Excel: <span className="text-zinc-400 font-medium">Datos → Obtener datos → Desde la web</span> → pega la URL.
          </p>
        </div>
      </div>

    </div>
  );
}
