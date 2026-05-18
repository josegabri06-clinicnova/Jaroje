"use client";

import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, BedDouble, Sparkles, BarChart3, MessageCircle, History, TrendingUp, RefreshCw, AlertCircle, Users, Moon, Wallet, Package } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function PremiumDashboard() {
  const router = useRouter();
  const [reservas, setReservas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoy, setHoy] = useState<string>('');
  const [tokenError, setTokenError] = useState(false);
  const [activeChats, setActiveChats] = useState<number>(0);

  const fetchReservas = async () => {
    setIsLoading(true);
    setTokenError(false);
    try {
      const res = await fetch('/api/reservas');
      const json = await res.json();
      if (json.error === 'TOKEN_EXPIRED') { setTokenError(true); return; }
      if (json.success && json.data) {
        const sorted = json.data.sort((a: any, b: any) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime());
        setReservas(sorted);
      }
    } catch (e) {
      console.error("Error al cargar reservas en dashboard", e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations');
      const json = await res.json();
      if (json.success && json.data) {
        const active = json.data.filter((c: any) => !c.resolved).length;
        setActiveChats(active);
      }
    } catch (e) {
      console.error("Error al cargar conversaciones", e);
    }
  };

  useEffect(() => {
    setHoy(format(new Date(), "EEEE, d MMM yyyy", { locale: es }));
    fetchReservas();
    fetchConversations();
    
    // Polling cada 10 segundos para ver si hay mensajes nuevos
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];
  const llegadasHoy = reservas.filter(r => r.check_in === todayStr);
  const salidasHoy = reservas.filter(r => r.check_out === todayStr);
  const proximasLlegadas = reservas.filter(r => r.check_in > todayStr).slice(0, 3);

  // KPIs calculados de datos reales
  const totalNoches = reservas.reduce((s: number, r: any) => s + (r.nights || 0), 0);
  const revenueEstimado = reservas.reduce((s: number, r: any) => s + (r.price_estimate || 0), 0);
  const ocupacion = Math.min(100, Math.round((totalNoches / 30) * 100));

  return (
    <div className="space-y-6 flex flex-col h-full bg-[#fafafa]">
      
      {/* Header */}
      <div className="flex flex-col gap-1 mb-2">
        <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight">Centro de Control</h2>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[13px] font-medium text-zinc-500">{hoy}</span>
        </div>
      </div>

      {/* Token Error Banner */}
      {tokenError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-amber-800">⚠️ Token Beds24 caducado</p>
            <p className="text-[11px] text-amber-700 mt-0.5">Genera uno nuevo en Beds24 › Marketplace › API y actualiza el .env</p>
          </div>
        </div>
      )}

      {/* MÉTRICAS CALCULADAS DE BEDS24 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-zinc-200/80 p-5 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div className="flex justify-between items-start mb-3">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Ocupación</p>
            <BedDouble size={14} className="text-zinc-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <p className="text-3xl font-bold text-zinc-900 tracking-tighter">
              {isLoading ? <span className="animate-pulse text-zinc-300">--</span> : ocupacion}
            </p>
            <span className="text-[15px] font-medium text-zinc-500">%</span>
          </div>
          <div className="mt-2 w-full h-1 bg-zinc-100 rounded-full overflow-hidden">
            <div className="h-full bg-zinc-900 rounded-full transition-all duration-700" style={{ width: `${ocupacion}%` }} />
          </div>
        </div>
        <div className="bg-white border border-zinc-200/80 p-5 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div className="flex justify-between items-start mb-3">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Revenue</p>
            <Sparkles size={14} className="text-zinc-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-medium text-zinc-400">MX$</span>
            <p className="text-3xl font-bold text-zinc-900 tracking-tighter">
              {isLoading ? <span className="animate-pulse text-zinc-300">--</span> : revenueEstimado.toLocaleString('es-MX')}
            </p>
          </div>
          <p className="text-[11px] text-zinc-400 font-medium mt-1">{totalNoches} noches · @MX$80/noche</p>
        </div>
      </div>

      {/* HOY — LLEGADAS & SALIDAS (La función estrella que le falta a Beds24 mobile) */}
      {(llegadasHoy.length > 0 || salidasHoy.length > 0) && (
        <div className="pt-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest">Hoy</h3>
            <div className="flex items-center gap-2">
              {llegadasHoy.length > 0 && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                  {llegadasHoy.length} llegan
                </span>
              )}
              {salidasHoy.length > 0 && (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                  {salidasHoy.length} salen
                </span>
              )}
            </div>
          </div>
          <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] divide-y divide-zinc-100 overflow-hidden">
            {[...llegadasHoy.map(r => ({ ...r, tipo: 'llegada' })), ...salidasHoy.map(r => ({ ...r, tipo: 'salida' }))].map(r => (
              <div
                key={`${r.id}-${r.tipo}`}
                onClick={() => router.push('/reservas')}
                className="p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors cursor-pointer active:bg-zinc-100"
              >
                <div className="flex items-center gap-3.5">
                  <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 border ${
                    r.tipo === 'llegada' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                  }`}>
                    {r.tipo === 'llegada' ? <ArrowDownLeft size={16} strokeWidth={2.5} /> : <ArrowUpRight size={16} strokeWidth={2.5} />}
                  </div>
                  <div>
                    <span className="block text-[15px] font-semibold text-zinc-900 leading-tight mb-0.5">{r.guest_name}</span>
                    <span className="text-[12px] font-medium text-zinc-500">{r.room_name}</span>
                  </div>
                </div>
                <span className={`text-[11px] font-bold px-2 py-1 rounded-md ${
                  r.tipo === 'llegada' ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'
                }`}>
                  {r.tipo === 'llegada' ? 'Check-in' : 'Check-out'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRÓXIMAS LLEGADAS */}
      <div className="pt-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest">Próximas Llegadas</h3>
          <div className="flex items-center gap-2">
            <button onClick={fetchReservas} className={`text-zinc-400 hover:text-zinc-600 transition-colors ${isLoading && 'animate-spin'}`}>
              <RefreshCw size={13} />
            </button>
            <span className="text-[11px] font-semibold bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-md">{reservas.length} total</span>
          </div>
        </div>
        <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col divide-y divide-zinc-100 overflow-hidden min-h-[80px]">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin mx-auto" />
            </div>
          ) : proximasLlegadas.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">
              {reservas.length === 0 ? 'Sin reservas en Beds24.' : 'No hay reservas futuras.'}
            </div>
          ) : (
            proximasLlegadas.map(r => (
              <div
                key={r.id}
                onClick={() => router.push('/reservas')}
                className="p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors cursor-pointer active:bg-zinc-100"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-[10px] bg-zinc-100 text-zinc-600 flex items-center justify-center shrink-0 border border-zinc-200">
                    <Users size={14} strokeWidth={2.5} />
                  </div>
                  <div>
                    <span className="block text-[15px] font-semibold text-zinc-900 leading-tight mb-0.5">{r.guest_name}</span>
                    <span className="text-[12px] font-medium text-zinc-500">{r.room_name} <span className="mx-1 text-zinc-300">·</span> {r.channel}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[12px] font-semibold text-zinc-700 bg-zinc-100 px-2 py-1 rounded-md">
                    {r.check_in ? format(new Date(r.check_in), 'd MMM', { locale: es }) : '—'}
                  </span>
                  <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
                    <Moon size={9} /> {r.nights}n
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* QUICK LINKS */}
      <div className="pt-1">
        <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Herramientas</h3>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/analytics" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all cursor-pointer">
            <BarChart3 size={20} className="text-zinc-700" strokeWidth={2} />
            <div>
              <p className="text-[14px] font-semibold text-zinc-900 leading-tight">Analytics</p>
              <p className="text-[11px] text-zinc-400 font-medium mt-0.5">Revenue · Ocupación · Canales</p>
            </div>
          </Link>
          <Link href="/precios" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all cursor-pointer">
            <TrendingUp size={20} className="text-zinc-700" strokeWidth={2} />
            <div>
              <p className="text-[14px] font-semibold text-zinc-900 leading-tight">Precio Dinámico</p>
              <p className="text-[11px] text-emerald-500 font-medium mt-0.5">Automático activado</p>
            </div>
          </Link>
          <Link href="/bot" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all cursor-pointer relative overflow-hidden">
            {activeChats > 0 && (
              <div className="absolute top-3 right-3 bg-red-500 text-white text-[11px] font-bold px-1.5 min-w-[20px] h-[20px] rounded-full flex items-center justify-center shadow-sm animate-in fade-in zoom-in">
                {activeChats}
              </div>
            )}
            <MessageCircle size={20} className="text-zinc-700" strokeWidth={2} />
            <div>
              <p className="text-[14px] font-semibold text-zinc-900 leading-tight">Bot WhatsApp</p>
              <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
                {activeChats > 0 ? <span className="text-red-500">{activeChats} chats activos</span> : 'n8n Workflow Activo'}
              </p>
            </div>
          </Link>
          <Link href="/historial" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all cursor-pointer">
            <History size={20} className="text-zinc-700" strokeWidth={2} />
            <div>
              <p className="text-[14px] font-semibold text-zinc-900 leading-tight">Historial</p>
              <p className="text-[11px] text-zinc-400 font-medium mt-0.5">{isLoading ? '...' : reservas.length} movimientos</p>
            </div>
          </Link>
          <Link href="/finanzas" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all cursor-pointer">
            <Wallet size={20} className="text-zinc-700" strokeWidth={2} />
            <div>
              <p className="text-[14px] font-semibold text-zinc-900 leading-tight">Finanzas</p>
              <p className="text-[11px] text-emerald-500 font-medium mt-0.5">Caja</p>
            </div>
          </Link>
          <Link href="/equipo" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all cursor-pointer">
            <Users size={20} className="text-zinc-700" strokeWidth={2} />
            <div>
              <p className="text-[14px] font-semibold text-zinc-900 leading-tight">Equipo</p>
              <p className="text-[11px] text-blue-500 font-medium mt-0.5">Nóminas</p>
            </div>
          </Link>
          <Link href="/inventario" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all cursor-pointer">
            <Package size={20} className="text-zinc-700" strokeWidth={2} />
            <div>
              <p className="text-[14px] font-semibold text-zinc-900 leading-tight">Inventario</p>
              <p className="text-[11px] text-amber-500 font-medium mt-0.5">Stock</p>
            </div>
          </Link>
        </div>
      </div>

    </div>
  );
}
