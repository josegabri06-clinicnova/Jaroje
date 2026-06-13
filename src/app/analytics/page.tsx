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
  Briefcase
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

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

  // Encontrar el valor máximo y mínimo para escalar verticalmente (soportando negativos)
  const maxVal = Math.max(...data.map(d => Math.max(d.prevVal, d.currVal, 0)), 1);
  const minVal = Math.min(...data.map(d => Math.min(d.prevVal, d.currVal, 0)), 0);
  const range = maxVal - minVal;

  // Posición de la línea cero en porcentaje desde la parte inferior de la gráfica
  const zeroPct = range > 0 ? (Math.abs(minVal) / range) * 100 : 0;

  // Calcular crecimiento/diferencia anual
  const growth = isPercentage
    ? (currTotal - prevTotal)
    : (prevTotal !== 0 ? ((currTotal - prevTotal) / Math.abs(prevTotal)) * 100 : 0);

  const isPositiveGrowth = growth >= 0;
  const growthText = isPercentage
    ? `${isPositiveGrowth ? '+' : ''}${growth.toFixed(1)}%`
    : `${isPositiveGrowth ? '+' : ''}${growth.toFixed(1)}%`;

  // Generar las marcas del eje Y (ticks)
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
      {/* Cabecera del gráfico */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 select-none">
        <div>
          <h3 className="text-[15px] font-black text-zinc-950 tracking-tight uppercase">{title}</h3>
          <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">{description}</p>
        </div>
        
        {/* Banner de resumen anual YoY */}
        <div className="bg-[#fafafa] border border-zinc-200/50 rounded-2xl p-3.5 flex items-center justify-between gap-4 min-w-[240px]">
          <div className="flex-1 space-y-1">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-[9px] text-zinc-400 font-extrabold uppercase">{prevYear}:</span>
              <span className="text-[12px] font-extrabold text-zinc-550">{formatValue(prevTotal)}</span>
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

      {/* Área de columnas */}
      <div className="w-full overflow-x-auto pb-2 -mx-2 px-2 scrollbar-thin">
        <div className="min-w-[650px] pt-6 flex flex-col relative">
          
          <div className="flex relative h-40">
            {/* Eje Y (Etiquetas) */}
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

            {/* Área de la gráfica (Líneas y barras) */}
            <div className="flex-1 h-full relative border-l border-zinc-150 pl-1">
              
              {/* Líneas auxiliares horizontales */}
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
              
              {/* Línea base cero si existen valores negativos (ej. pérdida en utilidad) */}
              {zeroPct > 0 && zeroPct < 100 && (
                <div 
                  className="absolute inset-x-0 border-t-2 border-dashed border-zinc-300 pointer-events-none z-10"
                  style={{ bottom: `${zeroPct}%` }}
                />
              )}

              {/* Columnas comparativas */}
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
                      
                      {/* Contenedor de barras dobles */}
                      <div className="w-full h-full relative">
                        
                        {/* Barra Año Anterior */}
                        <div 
                          className={`w-3.5 rounded-t-sm hover:opacity-85 transition-all cursor-pointer absolute ${bgClassPrev} ${
                            prevIsNegative ? 'rounded-b-sm rounded-t-none bg-rose-200 border border-rose-300' : ''
                          }`}
                          style={{ ...prevStyle, left: 'calc(50% - 16px)' }}
                        >
                          {/* Tooltip flotante */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-zinc-950 text-white text-[9px] font-bold px-2 py-1 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none">
                            {prevYear} · {item.label}: {formatValue(item.prevVal)}
                          </div>
                        </div>

                        {/* Barra Año Actual */}
                        <div 
                          className={`w-3.5 rounded-t-sm hover:opacity-85 transition-all cursor-pointer absolute ${bgClassCurr} ${
                            currIsNegative ? 'rounded-b-sm rounded-t-none bg-rose-500 border border-rose-600' : ''
                          }`}
                          style={{ ...currStyle, right: 'calc(50% - 16px)' }}
                        >
                          {/* Tooltip flotante */}
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
          </div>

          {/* Eje X (Meses) */}
          <div className="flex">
            <div className="w-[70px] shrink-0 pr-2" />
            <div className="flex-1 flex justify-between mt-3 pt-2 border-t border-zinc-200/80 select-none pl-1">
              {data.map(item => (
                <span key={item.label} className="flex-1 text-center text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">
                  {item.label}
                </span>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Leyenda de la gráfica */}
      <div className="flex justify-center items-center gap-5 pt-2 select-none border-t border-zinc-150/60">
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500">
          <span className={`w-2.5 h-2.5 rounded-md ${bgClassPrev}`} /> {prevYear} (Año Anterior)
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-800">
          <span className={`w-2.5 h-2.5 rounded-md ${bgClassCurr}`} /> {currYear} (Año Actual)
        </span>
      </div>

    </div>
  );
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────
export default function AnalyticsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [reservas, setReservas] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [finanzas, setFinanzas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenError, setTokenError] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Estados de navegación y filtros
  const [activeTab, setActiveTab] = useState<'cantidades' | 'graficas'>('cantidades');

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

  const fetchData = async () => {
    setIsLoading(true);
    setTokenError(false);
    try {
      // 1. Fetch de reservas desde Beds24 + Locales
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

  useEffect(() => { 
    fetchData(); 
  }, []);

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

  // ── CÓMPUTO DE SECCIÓN 1: CANTIDADES (FILTRADO POR FECHAS) ────────────────
  const filteredFinanzas = useMemo(() => {
    return finanzas.filter(f => {
      if (!f.date) return false;
      return f.date >= startDate && f.date <= endDate;
    });
  }, [finanzas, startDate, endDate]);

  // Ingresos totales del periodo en finances
  const ingresosPeriodo = useMemo(() => {
    return filteredFinanzas
      .filter(f => f.type === 'ingreso')
      .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  }, [filteredFinanzas]);

  // Egresos Jaroje (totales - categoría "Personal")
  const egresosJarojePeriodo = useMemo(() => {
    return filteredFinanzas
      .filter(f => f.type === 'gasto' && (f.category || '').trim().toLowerCase() !== 'personal')
      .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  }, [filteredFinanzas]);

  // Egresos Personales (categoría "Personal")
  const egresosPersonalesPeriodo = useMemo(() => {
    return filteredFinanzas
      .filter(f => f.type === 'gasto' && (f.category || '').trim().toLowerCase() === 'personal')
      .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  }, [filteredFinanzas]);

  // Utilidad = Ingresos - Egresos Jaroje
  const utilidadPeriodo = useMemo(() => {
    return ingresosPeriodo - egresosJarojePeriodo;
  }, [ingresosPeriodo, egresosJarojePeriodo]);

  // Ocupación calculada de forma dinámica en el rango
  const { ocupacionPeriodo, totalNochesPeriodo } = useMemo(() => {
    if (!startDate || !endDate) return { ocupacionPeriodo: 0, totalNochesPeriodo: 0 };
    const sDate = new Date(startDate + 'T12:00:00');
    const eDate = new Date(endDate + 'T12:00:00');
    const rangeDays = Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1;
    const totalPossibleRoomNights = 22 * rangeDays; // 22 Habitaciones físicas

    let occupiedNights = 0;
    reservas.forEach(r => {
      if (!r.check_in || !r.check_out) return;
      const rIn = new Date(r.check_in + 'T12:00:00');
      const rOut = new Date(r.check_out + 'T12:00:00');

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
      totalNochesPeriodo: occupiedNights
    };
  }, [reservas, startDate, endDate]);

  // ── CÓMPUTO DE SECCIÓN 2: GRÁFICAS HISTÓRICAS (AÑO ACTUAL VS ANTERIOR) ─────
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const previousYear = useMemo(() => currentYear - 1, [currentYear]);

  const yearlyComparisonData = useMemo(() => {
    const monthsNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    const calculateDataForYear = (year: number) => {
      const months = Array.from({ length: 12 }, (_, monthIdx) => {
        // Filtrar transacciones del mes
        const monthFinances = finanzas.filter(f => {
          if (!f.date) return false;
          const fDate = new Date(f.date + 'T12:00:00');
          return fDate.getFullYear() === year && fDate.getMonth() === monthIdx;
        });

        const ingresos = monthFinances
          .filter(f => f.type === 'ingreso')
          .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

        const egresosJaroje = monthFinances
          .filter(f => f.type === 'gasto' && (f.category || '').trim().toLowerCase() !== 'personal')
          .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

        const egresosPersonales = monthFinances
          .filter(f => f.type === 'gasto' && (f.category || '').trim().toLowerCase() === 'personal')
          .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

        const utilidad = ingresos - egresosJaroje;

        // Ocupación del mes
        const startOfMonth = new Date(year, monthIdx, 1);
        const endOfMonth = new Date(year, monthIdx + 1, 0);
        const daysInMonth = endOfMonth.getDate();
        const possibleRoomNights = 22 * daysInMonth;

        let occupiedNights = 0;
        reservas.forEach(r => {
          if (!r.check_in || !r.check_out) return;
          const rIn = new Date(r.check_in + 'T12:00:00');
          const rOut = new Date(r.check_out + 'T12:00:00');

          if (rIn < endOfMonth && rOut > startOfMonth) {
            const overlapStart = new Date(Math.max(rIn.getTime(), startOfMonth.getTime()));
            const overlapEnd = new Date(Math.min(rOut.getTime(), endOfMonth.getTime()));
            const diff = (overlapEnd.getTime() - overlapStart.getTime()) / 86400000;
            occupiedNights += Math.max(0, Math.round(diff));
          }
        });

        const ocupacion = possibleRoomNights > 0
          ? Math.min(100, Math.round((occupiedNights / possibleRoomNights) * 100))
          : 0;

        return {
          ingresos,
          egresosJaroje,
          egresosPersonales,
          utilidad,
          ocupacion
        };
      });

      // Calcular totales anuales consolidados
      const ingresosTotal = months.reduce((s, m) => s + m.ingresos, 0);
      const egresosJarojeTotal = months.reduce((s, m) => s + m.egresosJaroje, 0);
      const egresosPersonalesTotal = months.reduce((s, m) => s + m.egresosPersonales, 0);
      const utilidadTotal = ingresosTotal - egresosJarojeTotal;

      // Ocupación promedio del año completo
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 12, 0);
      const daysInYear = Math.round((endOfYear.getTime() - startOfYear.getTime()) / 86400000) + 1;
      const possibleNightsYear = 22 * daysInYear;

      let occupiedYear = 0;
      reservas.forEach(r => {
        if (!r.check_in || !r.check_out) return;
        const rIn = new Date(r.check_in + 'T12:00:00');
        const rOut = new Date(r.check_out + 'T12:00:00');

        if (rIn < endOfYear && rOut > startOfYear) {
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
          egresosJaroje: egresosJarojeTotal,
          egresosPersonales: egresosPersonalesTotal,
          utilidad: utilidadTotal,
          ocupacion: ocupacionTotal
        }
      };
    };

    const prevData = calculateDataForYear(previousYear);
    const currData = calculateDataForYear(currentYear);

    // Formatear arreglos para gráficas
    const generateChartData = (key: 'ingresos' | 'egresosJaroje' | 'egresosPersonales' | 'utilidad' | 'ocupacion') => {
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
        ingresos: generateChartData('ingresos'),
        egresosJaroje: generateChartData('egresosJaroje'),
        egresosPersonales: generateChartData('egresosPersonales'),
        ocupacion: generateChartData('ocupacion')
      }
    };
  }, [finanzas, reservas, currentYear, previousYear]);

  // ── SECCIÓN AUXILIAR: BREAKDOWN DE CANALES BEDS24 (FILTRADO POR RANGO) ────
  const { channelData, totalNochesCanales } = useMemo(() => {
    // Filtrar reservas que caen en el rango de fechas
    const rangeReservas = reservas.filter(r => {
      if (!r.check_in) return false;
      return r.check_in >= startDate && r.check_in <= endDate;
    });

    const totalN = rangeReservas.reduce((s, r) => s + (r.nights || 0), 0);
    const channelMap: Record<string, { nights: number; revenue: number }> = {};
    
    rangeReservas.forEach(r => {
      const ch = r.channel || 'Directo';
      if (!channelMap[ch]) channelMap[ch] = { nights: 0, revenue: 0 };
      channelMap[ch].nights += r.nights || 0;
      channelMap[ch].revenue += r.price_estimate || 0;
    });

    const data = Object.entries(channelMap)
      .map(([name, d]) => ({
        name,
        nights: d.nights,
        revenue: d.revenue,
        pct: totalN > 0 ? Math.round((d.nights / totalN) * 100) : 0,
        color: name.includes('Airbnb') ? '#FF5A5F' : name.includes('Booking') ? '#003580' : name.includes('Expedia') ? '#FFC000' : name.includes('WhatsApp') ? '#25D366' : '#111827'
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return { channelData: data, totalNochesCanales: totalN };
  }, [reservas, startDate, endDate]);

  const Skeleton = () => <div className="h-7 bg-zinc-150 rounded-lg animate-pulse w-24" />;

  return (
    <div className="space-y-6 pb-24 bg-[#fafafa]">
      
      {/* Cabecera del Módulo */}
      <div className="flex items-center justify-between select-none">
        <div>
          <h2 className="text-[22px] font-black text-zinc-950 tracking-tight uppercase">Analytics</h2>
          <p className="text-[12px] font-semibold text-zinc-400 mt-0.5">Módulos de Auditoría Contable y Ocupación</p>
        </div>
        <button
          onClick={fetchData}
          disabled={isLoading}
          className={`w-10 h-10 flex items-center justify-center text-zinc-500 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl shadow-sm transition-all ${isLoading ? 'opacity-50' : 'active:scale-95'}`}
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Error de token Beds24 */}
      {tokenError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in duration-200">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[13px] font-semibold text-amber-800">Token Beds24 vencido. Actualiza las variables de entorno.</p>
        </div>
      )}

      {/* Navegador de Pestañas (Tabs) Premium */}
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
          Cantidades
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
          
          {/* Selector de Rango de Fechas */}
          <div className="bg-white border border-zinc-200/80 p-5 rounded-[28px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col md:flex-row md:items-center md:justify-between gap-4 select-none">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-zinc-50 rounded-xl border border-zinc-200 flex items-center justify-center text-zinc-700">
                <Calendar size={18} />
              </div>
              <div>
                <h3 className="text-[13px] font-extrabold text-zinc-900 tracking-tight uppercase">Rango de Fechas</h3>
                <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">Filtrado interactivo de cantidades</p>
              </div>
            </div>
            <div className="flex flex-row items-center gap-3">
              <div className="flex-1 bg-[#fafafa] border border-zinc-200/80 p-2 rounded-2xl shadow-sm flex items-center justify-between gap-2 px-3.5">
                <span className="text-[9px] font-extrabold text-zinc-450 uppercase tracking-widest">Desde</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="bg-transparent border-none text-[12px] font-black text-zinc-800 outline-none cursor-pointer p-0.5 text-right"
                />
              </div>
              <div className="flex-1 bg-[#fafafa] border border-zinc-200/80 p-2 rounded-2xl shadow-sm flex items-center justify-between gap-2 px-3.5">
                <span className="text-[9px] font-extrabold text-zinc-450 uppercase tracking-widest">Hasta</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="bg-transparent border-none text-[12px] font-black text-zinc-800 outline-none cursor-pointer p-0.5 text-right"
                />
              </div>
            </div>
          </div>

          {/* Tarjetas de Cantidades */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* 1. UTILIDAD */}
            <div className="bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-850 text-white p-6 rounded-[32px] shadow-[0_6px_20px_rgba(55,48,163,0.1)] flex flex-col justify-between relative overflow-hidden group min-h-[160px]">
              <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Utilidad Periodo</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black ${
                  utilidadPeriodo >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {utilidadPeriodo >= 0 ? '+' : '-'} Ingresos - Egresos Jaroje
                </span>
              </div>
              <div>
                {isLoading ? <Skeleton /> : (
                  <p className="text-3xl font-black tracking-tight">
                    MX${utilidadPeriodo.toLocaleString('es-MX')}
                  </p>
                )}
                <p className="text-[10px] text-indigo-300 font-bold mt-2">Negocio Condominios Jaroje (Caja)</p>
              </div>
            </div>

            {/* 2. INGRESOS */}
            <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[160px] hover:border-zinc-300 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Ingresos Totales</span>
                <TrendingUp size={16} className="text-emerald-500" />
              </div>
              <div>
                {isLoading ? <Skeleton /> : (
                  <p className="text-3xl font-black text-zinc-950 tracking-tight">
                    MX${ingresosPeriodo.toLocaleString('es-MX')}
                  </p>
                )}
                <p className="text-[10px] text-zinc-400 font-bold mt-2">Suma de entradas en Libro Contable</p>
              </div>
            </div>

            {/* 3. EGRESOS JAROJE */}
            <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[160px] hover:border-zinc-300 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Egresos Jaroje</span>
                <Briefcase size={16} className="text-rose-500" />
              </div>
              <div>
                {isLoading ? <Skeleton /> : (
                  <p className="text-3xl font-black text-zinc-950 tracking-tight">
                    MX${egresosJarojePeriodo.toLocaleString('es-MX')}
                  </p>
                )}
                <p className="text-[10px] text-zinc-400 font-bold mt-2">Egresos operativos (Excluye personal)</p>
              </div>
            </div>

            {/* 4. EGRESOS PERSONALES */}
            <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[160px] hover:border-zinc-300 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Egresos Personales</span>
                <User size={16} className="text-purple-500" />
              </div>
              <div>
                {isLoading ? <Skeleton /> : (
                  <p className="text-3xl font-black text-zinc-950 tracking-tight">
                    MX${egresosPersonalesPeriodo.toLocaleString('es-MX')}
                  </p>
                )}
                <p className="text-[10px] text-zinc-400 font-bold mt-2">Retiros privados (Categoría: &quot;Personal&quot;)</p>
              </div>
            </div>

            {/* 5. OCUPACIÓN */}
            <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[160px] hover:border-zinc-300 hover:shadow-sm transition-all duration-300 md:col-span-2 lg:col-span-1">
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
                <p className="text-[10px] text-zinc-400 font-bold mt-2">Basado en 22 habitaciones físicas</p>
              </div>
            </div>

          </div>

          {/* Por Canal (Beds24) - Conservado */}
          {channelData.length > 0 ? (
            <div className="bg-white border border-zinc-200/80 p-6 rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-between mb-5 select-none">
                <div>
                  <h3 className="text-[14px] font-extrabold text-zinc-950 uppercase tracking-wider">Por Canal (Beds24)</h3>
                  <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">Reservas filtradas por fecha</p>
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
                        <span className="text-[13px] font-bold text-zinc-800">{ch.name}</span>
                        <span className="text-[13px] font-black text-zinc-950">MX${ch.revenue.toLocaleString('es-MX')}</span>
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

        </div>
      )}

      {/* ────────────────── CONTENIDO: PESTAÑA GRÁFICAS ────────────────── */}
      {activeTab === 'graficas' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          <div className="bg-zinc-900 border border-zinc-950 p-5 rounded-[28px] shadow-sm select-none text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-xl border border-white/10 flex items-center justify-center text-zinc-200">
                <BarChart3 size={18} />
              </div>
              <div>
                <h3 className="text-[13px] font-black tracking-wider uppercase text-zinc-100">Gráficas Comparativas Históricas</h3>
                <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">Comparativa del Año Actual ({currentYear}) contra el Año Anterior ({previousYear})</p>
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
              {/* 1. UTILIDAD */}
              <DoubleBarChart
                title="UTILIDAD NETAS"
                description="Ingresos consolidados - egresos de Jaroje (excluye gastos personales)"
                prevYear={previousYear}
                currYear={currentYear}
                prevTotal={yearlyComparisonData.prevData.totals.utilidad}
                currTotal={yearlyComparisonData.currData.totals.utilidad}
                data={yearlyComparisonData.charts.utilidad}
                bgClassPrev="bg-emerald-250 border border-emerald-350"
                bgClassCurr="bg-emerald-600 border border-emerald-700"
              />

              {/* 2. INGRESOS */}
              <DoubleBarChart
                title="INGRESOS TOTALES"
                description="Total de entradas de dinero contables en Supabase"
                prevYear={previousYear}
                currYear={currentYear}
                prevTotal={yearlyComparisonData.prevData.totals.ingresos}
                currTotal={yearlyComparisonData.currData.totals.ingresos}
                data={yearlyComparisonData.charts.ingresos}
                bgClassPrev="bg-zinc-200 border border-zinc-300"
                bgClassCurr="bg-zinc-900 border border-zinc-950"
              />

              {/* 3. EGRESOS JAROJE */}
              <DoubleBarChart
                title="EGRESOS JAROJE"
                description="Gastos operativos del negocio (no incluye retiros de categoría 'Personal')"
                prevYear={previousYear}
                currYear={currentYear}
                prevTotal={yearlyComparisonData.prevData.totals.egresosJaroje}
                currTotal={yearlyComparisonData.currData.totals.egresosJaroje}
                data={yearlyComparisonData.charts.egresosJaroje}
                bgClassPrev="bg-rose-200 border border-rose-300"
                bgClassCurr="bg-rose-500 border border-rose-600"
              />

              {/* 4. EGRESOS PERSONALES */}
              <DoubleBarChart
                title="EGRESOS PERSONALES"
                description="Retiros y gastos privados exclusivamente etiquetados como 'Personal'"
                prevYear={previousYear}
                currYear={currentYear}
                prevTotal={yearlyComparisonData.prevData.totals.egresosPersonales}
                currTotal={yearlyComparisonData.currData.totals.egresosPersonales}
                data={yearlyComparisonData.charts.egresosPersonales}
                bgClassPrev="bg-purple-200 border border-purple-300"
                bgClassCurr="bg-purple-600 border border-purple-700"
              />

              {/* 5. % OCUPACIÓN */}
              <DoubleBarChart
                title="% OCUPACIÓN DE HABITACIONES"
                description="Ocupación promedio de habitaciones (22 unidades físicas)"
                prevYear={previousYear}
                currYear={currentYear}
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

      {/* ────────────────── PANEL DE EXPORTACIÓN (CONSERVADO) ────────────────── */}
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
