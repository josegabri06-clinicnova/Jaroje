"use client";

import { useEffect, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, BedDouble, Sparkles, BarChart3,
  MessageCircle, TrendingUp, RefreshCw, AlertCircle, Users, Moon,
  Wallet, Package, Plus, Lock, XCircle, History, Phone, Clock, CheckCircle2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, addDays, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function AdminDashboard() {
  const router = useRouter();
  const [reservas, setReservas] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenError, setTokenError] = useState(false);
  const [hoy, setHoy] = useState('');

  const fetchAll = async () => {
    setIsLoading(true);
    setTokenError(false);
    try {
      const [resRes, convRes] = await Promise.all([
        fetch('/api/reservas'),
        fetch('/api/conversations'),
      ]);
      const resJson = await resRes.json();
      const convJson = await convRes.json();

      if (resJson.error === 'TOKEN_EXPIRED') { setTokenError(true); }
      else if (resJson.success) {
        setReservas(
          resJson.data.sort((a: any, b: any) =>
            new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
          )
        );
      }
      if (convJson.success) setConversations(convJson.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setHoy(format(new Date(), "EEEE, d MMM", { locale: es }));
    fetchAll();
    const interval = setInterval(() => fetch('/api/conversations').then(r => r.json()).then(j => {
      if (j.success) setConversations(j.data || []);
    }), 15000);
    return () => clearInterval(interval);
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];
  const llegadasHoy = reservas.filter(r => r.check_in === todayStr);
  const salidasHoy = reservas.filter(r => r.check_out === todayStr);
  const proximasLlegadas = reservas.filter(r => r.check_in > todayStr).slice(0, 5);

  // WhatsApp — semáforo de urgencia
  const now = Date.now();
  const chatsConUrgencia = conversations
    .filter(c => !c.resolved)
    .map(c => {
      const lastMsg = c.messages?.[c.messages.length - 1];
      const lastTime = lastMsg?.timestamp ? new Date(lastMsg.timestamp).getTime() : new Date(c.timestamp).getTime();
      const minutesSince = (now - lastTime) / 60000;
      const lastText = lastMsg?.role_guest || lastMsg?.role_bot || '(sin texto)';
      return { ...c, minutesSince, lastText, lastTime };
    })
    .sort((a, b) => b.minutesSince - a.minutesSince); // más urgentes primero

  const getUrgencyColor = (mins: number) => {
    if (mins > 120) return { dot: 'bg-red-500', bg: 'bg-red-50 border-red-100', text: 'text-red-700', label: 'Sin respuesta' };
    if (mins > 30) return { dot: 'bg-amber-400', bg: 'bg-amber-50 border-amber-100', text: 'text-amber-700', label: 'Pendiente' };
    return { dot: 'bg-emerald-500', bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700', label: 'Activo' };
  };

  const totalRevenue = reservas.reduce((s, r) => s + (r.price_estimate || 0), 0);
  const activeNow = reservas.filter(r => r.check_in <= todayStr && r.check_out > todayStr).length;

  return (
    <div className="space-y-6 pb-28 bg-[#fafafa] min-h-screen">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-bold text-zinc-900 tracking-tight">Centro de Control</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[13px] font-medium text-zinc-500 capitalize">{hoy}</span>
          </div>
        </div>
        <button onClick={fetchAll} disabled={isLoading}
          className="w-9 h-9 flex items-center justify-center bg-white border border-zinc-200 rounded-xl shadow-sm hover:bg-zinc-50 active:scale-95 transition-all">
          <RefreshCw size={15} className={`text-zinc-500 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Token error */}
      {tokenError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-amber-800">⚠️ Token Beds24 caducado</p>
            <p className="text-[11px] text-amber-700 mt-0.5">Genera uno nuevo en Beds24 › Marketplace › API</p>
          </div>
        </div>
      )}

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-3 text-center shadow-sm">
          <p className="text-[20px] font-bold text-zinc-900">{activeNow}</p>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">En casa</p>
        </div>
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-3 text-center shadow-sm">
          <p className="text-[20px] font-bold text-emerald-600">{llegadasHoy.length}</p>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Llegan</p>
        </div>
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-3 text-center shadow-sm">
          <p className="text-[20px] font-bold text-amber-500">{salidasHoy.length}</p>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Salen</p>
        </div>
      </div>

      {/* ── 1. WHATSAPP INBOX — PRIMERA PRIORIDAD ─────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <MessageCircle size={13} />
            WhatsApp Inbox
          </h3>
          <div className="flex items-center gap-2">
            {chatsConUrgencia.filter(c => c.minutesSince > 120).length > 0 && (
              <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full animate-pulse">
                {chatsConUrgencia.filter(c => c.minutesSince > 120).length} sin respuesta
              </span>
            )}
            <Link href="/bot" className="text-[11px] font-bold text-blue-600 hover:underline">Ver todo →</Link>
          </div>
        </div>

        {chatsConUrgencia.length === 0 ? (
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 text-center">
            <CheckCircle2 size={24} className="text-emerald-400 mx-auto mb-2" />
            <p className="text-[13px] font-semibold text-zinc-500">Bandeja limpia — sin chats activos</p>
          </div>
        ) : (
          <div className="space-y-2">
            {chatsConUrgencia.slice(0, 4).map(c => {
              const urgency = getUrgencyColor(c.minutesSince);
              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/bot?chatId=${c.id}`)}
                  className={`border rounded-2xl p-4 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-all ${urgency.bg}`}
                >
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-white border border-zinc-200 flex items-center justify-center">
                      <span className="text-[13px] font-bold text-zinc-700">
                        {(c.guest_name || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${urgency.dot}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[14px] font-bold text-zinc-900 truncate">{c.guest_name || c.guest_phone}</p>
                      <span className={`text-[10px] font-bold shrink-0 ml-2 ${urgency.text}`}>
                        {c.minutesSince < 60
                          ? `${Math.round(c.minutesSince)}m`
                          : `${Math.round(c.minutesSince / 60)}h`}
                      </span>
                    </div>
                    <p className="text-[12px] text-zinc-500 truncate font-medium">{c.lastText.slice(0, 60)}</p>
                  </div>
                </div>
              );
            })}
            {chatsConUrgencia.length > 4 && (
              <Link href="/bot" className="block text-center text-[12px] font-bold text-blue-600 py-2">
                +{chatsConUrgencia.length - 4} conversaciones más →
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ── 2. CHECK-INS DE HOY — 4 columnas ─────────────────────────── */}
      {(llegadasHoy.length > 0 || salidasHoy.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest">Movimientos de Hoy</h3>
            <div className="flex gap-2">
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

          <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-4 px-4 py-2 bg-zinc-50 border-b border-zinc-100">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Unidad</span>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Nombre</span>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Teléfono</span>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide text-right">Adeudo</span>
            </div>
            {/* Rows */}
            {[...llegadasHoy.map(r => ({ ...r, tipo: 'llegada' })), ...salidasHoy.map(r => ({ ...r, tipo: 'salida' }))].map(r => {
              // Extract room number from room_name
              const unitMatch = (r.room_name || '').match(/\((\d+)\)/);
              const unit = unitMatch ? unitMatch[1] : (r.room_name || '—').split(' ')[0];
              return (
                <div
                  key={`${r.id}-${r.tipo}`}
                  onClick={() => router.push(`/reservas?id=${r.id}`)}
                  className="grid grid-cols-4 px-4 py-3 border-b border-zinc-100 last:border-b-0 items-center cursor-pointer hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.tipo === 'llegada' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    <span className="text-[13px] font-bold text-zinc-900">{unit}</span>
                  </div>
                  <span className="text-[12px] font-semibold text-zinc-800 truncate pr-1">{r.guest_name?.split(' ')[0]}</span>
                  <span className="text-[11px] font-medium text-zinc-500 truncate">
                    {r.guest_phone
                      ? <span className="flex items-center gap-1"><Phone size={9} />{r.guest_phone}</span>
                      : <span className="text-zinc-300">—</span>}
                  </span>
                  <span className="text-[12px] font-bold text-emerald-600 text-right">
                    {r.price_estimate ? `$${r.price_estimate.toLocaleString()}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. BOTONES DE ACCIÓN DIRECTA ──────────────────────────────── */}
      <div>
        <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Acciones Rápidas</h3>
        <div className="grid grid-cols-3 gap-2">
          <Link href="/nueva"
            className="bg-zinc-900 hover:bg-black text-white rounded-2xl p-4 flex flex-col items-center gap-2 text-center active:scale-[0.97] transition-all shadow-sm">
            <Plus size={20} strokeWidth={2.5} />
            <span className="text-[12px] font-bold leading-tight">Nueva Reserva</span>
          </Link>
          <Link href="/nueva?mode=bloqueo"
            className="bg-white border border-zinc-200 rounded-2xl p-4 flex flex-col items-center gap-2 text-center hover:bg-zinc-50 active:scale-[0.97] transition-all shadow-sm">
            <Lock size={20} className="text-zinc-700" strokeWidth={2.5} />
            <span className="text-[12px] font-bold text-zinc-800 leading-tight">Aplicar Bloqueo</span>
          </Link>
          <button
            onClick={() => alert('Cancelación: busca la reserva en el listado y pulsa Cancelar.')}
            className="bg-white border border-zinc-200 rounded-2xl p-4 flex flex-col items-center gap-2 text-center hover:bg-zinc-50 active:scale-[0.97] transition-all shadow-sm">
            <XCircle size={20} className="text-red-500" strokeWidth={2.5} />
            <span className="text-[12px] font-bold text-zinc-800 leading-tight">Cancelar Reserva</span>
          </button>
        </div>
      </div>

      {/* ── 4. PRÓXIMAS LLEGADAS ───────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest">Próximas Llegadas</h3>
          <span className="text-[11px] font-semibold bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-md">{reservas.length} total</span>
        </div>
        <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
            </div>
          ) : proximasLlegadas.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">Sin próximas llegadas.</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {proximasLlegadas.map(r => (
                <div
                  key={r.id}
                  onClick={() => router.push(`/reservas?id=${r.id}`)}
                  className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                      <Users size={14} className="text-zinc-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-zinc-900 leading-tight truncate">{r.guest_name}</p>
                      <p className="text-[11px] font-medium text-zinc-500 truncate">{r.room_name} · {r.channel}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                    <span className="text-[12px] font-bold text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded-lg">
                      {r.check_in ? format(new Date(r.check_in + 'T12:00:00'), 'd MMM', { locale: es }) : '—'}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-0.5">
                      <Moon size={9} /> {r.nights}n
                    </span>
                  </div>
                </div>
              ))}
              <Link href="/reservas" className="block text-center text-[12px] font-bold text-blue-600 py-3 hover:bg-zinc-50">
                Ver todas →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── 5. HERRAMIENTAS ───────────────────────────────────────────── */}
      <div>
        <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Herramientas</h3>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/analytics" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all">
            <BarChart3 size={20} className="text-zinc-700" />
            <div>
              <p className="text-[14px] font-semibold text-zinc-900">Analytics</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">Revenue · Ocupación</p>
            </div>
          </Link>
          <Link href="/finanzas" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all">
            <Wallet size={20} className="text-zinc-700" />
            <div>
              <p className="text-[14px] font-semibold text-zinc-900">Finanzas</p>
              <p className="text-[11px] text-emerald-500 mt-0.5">MX${totalRevenue.toLocaleString()}</p>
            </div>
          </Link>
          <Link href="/equipo" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all">
            <Users size={20} className="text-zinc-700" />
            <div>
              <p className="text-[14px] font-semibold text-zinc-900">Equipo</p>
              <p className="text-[11px] text-blue-500 mt-0.5">Nóminas</p>
            </div>
          </Link>
          <Link href="/inventario" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all">
            <Package size={20} className="text-zinc-700" />
            <div>
              <p className="text-[14px] font-semibold text-zinc-900">Inventario</p>
              <p className="text-[11px] text-amber-500 mt-0.5">Stock</p>
            </div>
          </Link>
          <Link href="/historial" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all">
            <History size={20} className="text-zinc-700" />
            <div>
              <p className="text-[14px] font-semibold text-zinc-900">Historial</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">{reservas.length} registros</p>
            </div>
          </Link>
          <Link href="/precios" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all">
            <TrendingUp size={20} className="text-zinc-700" />
            <div>
              <p className="text-[14px] font-semibold text-zinc-900">Precio Dinámico</p>
              <p className="text-[11px] text-emerald-500 mt-0.5">Automático activo</p>
            </div>
          </Link>
        </div>
      </div>

    </div>
  );
}
