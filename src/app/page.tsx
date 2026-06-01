"use client";

import { useEffect, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, BedDouble, Sparkles, BarChart3,
  MessageCircle, TrendingUp, RefreshCw, AlertCircle, Users, Moon,
  Wallet, Package, Plus, Lock, XCircle, History, Phone, Clock, CheckCircle2, Wrench
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, addDays, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@supabase/supabase-js';

// Inicializar Supabase cliente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AdminDashboard() {
  const router = useRouter();
  const [reservas, setReservas] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [roomStatuses, setRoomStatuses] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenError, setTokenError] = useState(false);
  const [hoy, setHoy] = useState('');
  const [financeBalance, setFinanceBalance] = useState(0);

  const fetchAll = async () => {
    setIsLoading(true);
    setTokenError(false);
    try {
      const [resRes, convRes, roomsRes, tasksRes] = await Promise.all([
        fetch('/api/reservas').catch(() => null),
        fetch('/api/conversations').catch(() => null),
        fetch('/api/room-status').catch(() => null),
        fetch('/api/tasks').catch(() => null),
      ]);

      if (resRes) {
        const resJson = await resRes.json();
        if (resJson.error === 'TOKEN_EXPIRED') {
          setTokenError(true);
        } else if (resJson.success) {
          setReservas(
            resJson.data.sort((a: any, b: any) =>
              new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
            )
          );
        }
      }

      if (convRes) {
        const convJson = await convRes.json();
        if (convJson.success) setConversations(convJson.data || []);
      }

      if (roomsRes) {
        const roomsJson = await roomsRes.json();
        if (roomsJson.success) setRoomStatuses(roomsJson.data || []);
      }

      if (tasksRes) {
        const tasksJson = await tasksRes.json();
        if (tasksJson.success) setTasks(tasksJson.data || []);
      }

      // Obtener el balance general real de finanzas (sobres y cuentas)
      const accRes = await supabase.from('accounts').select('balance');
      if (!accRes.error && accRes.data) {
        const total = accRes.data.reduce((sum: number, acc: any) => sum + (acc.balance || 0), 0);
        setFinanceBalance(total);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setHoy(format(new Date(), "EEEE, d MMM", { locale: es }));
    fetchAll();
    const interval = setInterval(() => {
      fetch('/api/conversations').then(r => r.json()).then(j => {
        if (j.success) setConversations(j.data || []);
      });
      // Poll tasks and rooms too to keep live metrics accurate
      fetch('/api/tasks').then(r => r.json()).then(j => {
        if (j.success) setTasks(j.data || []);
      });
      fetch('/api/room-status').then(r => r.json()).then(j => {
        if (j.success) setRoomStatuses(j.data || []);
      });
    }, 15000);
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

      {/* ── 1. WHATSAPP INBOX ────────────────────────────────────────── */}
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
            {chatsConUrgencia.slice(0, 3).map(c => {
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
            {chatsConUrgencia.length > 3 && (
              <Link href="/bot" className="block text-center text-[12px] font-bold text-blue-600 py-2">
                +{chatsConUrgencia.length - 3} conversaciones más →
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ── 2. LLEGADAS HOY ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <ArrowDownLeft size={13} className="text-emerald-500" />
            Llegadas Hoy
          </h3>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
            {llegadasHoy.length} llegan
          </span>
        </div>

        <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
            </div>
          ) : llegadasHoy.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">No hay llegadas programadas para hoy.</div>
          ) : (
            <>
              <div className="grid grid-cols-4 px-4 py-2 bg-zinc-50 border-b border-zinc-100">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Unidad</span>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Nombre</span>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Canal</span>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide text-right">Adeudo</span>
              </div>
              <div className="divide-y divide-zinc-100">
                {llegadasHoy.map(r => {
                  const unitMatch = (r.room_name || '').match(/\((\d+)\)/);
                  const unit = unitMatch ? unitMatch[1] : (r.room_name || '—').split(' ')[0];
                  return (
                    <div
                      key={r.id}
                      onClick={() => router.push(`/reservas?id=${r.id}`)}
                      className="grid grid-cols-4 px-4 py-3 items-center cursor-pointer hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" />
                        <span className="text-[13px] font-bold text-zinc-900">{unit}</span>
                      </div>
                      <span className="text-[12px] font-semibold text-zinc-800 truncate pr-1">{r.guest_name?.split(' ')[0] || '—'}</span>
                      <span className="text-[11px] font-medium text-zinc-500 truncate">{r.channel || 'Directo'}</span>
                      <span className="text-[12px] font-bold text-emerald-600 text-right">
                        {r.price_estimate ? `$${Math.round(r.price_estimate).toLocaleString()}` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 3. SALIDAS HOY ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <ArrowUpRight size={13} className="text-amber-500" />
            Salidas Hoy
          </h3>
          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
            {salidasHoy.length} salen
          </span>
        </div>

        <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
            </div>
          ) : salidasHoy.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">No hay salidas programadas para hoy.</div>
          ) : (
            <>
              <div className="grid grid-cols-4 px-4 py-2 bg-zinc-50 border-b border-zinc-100">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Unidad</span>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Nombre</span>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Canal</span>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide text-right">Contacto</span>
              </div>
              <div className="divide-y divide-zinc-100">
                {salidasHoy.map(r => {
                  const unitMatch = (r.room_name || '').match(/\((\d+)\)/);
                  const unit = unitMatch ? unitMatch[1] : (r.room_name || '—').split(' ')[0];
                  return (
                    <div
                      key={r.id}
                      onClick={() => router.push(`/reservas?id=${r.id}`)}
                      className="grid grid-cols-4 px-4 py-3 items-center cursor-pointer hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-400" />
                        <span className="text-[13px] font-bold text-zinc-900">{unit}</span>
                      </div>
                      <span className="text-[12px] font-semibold text-zinc-800 truncate pr-1">{r.guest_name?.split(' ')[0] || '—'}</span>
                      <span className="text-[11px] font-medium text-zinc-500 truncate">{r.channel || 'Directo'}</span>
                      <div className="text-right">
                        {r.guest_phone ? (
                          <a
                            href={`https://wa.me/${r.guest_phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-600 text-[10px] font-bold shadow-sm transition-all active:scale-95"
                          >
                            <MessageCircle size={10} className="fill-emerald-50 text-emerald-600" />
                            <span>WhatsApp</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-zinc-300 font-semibold">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 4. ACCIONES RÁPIDAS ───────────────────────────────────────── */}
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
          <Link href="/mantenimiento?action=new_task"
            className="bg-white border border-zinc-200 rounded-2xl p-4 flex flex-col items-center gap-2 text-center hover:bg-rose-50/50 active:scale-[0.97] transition-all shadow-sm group">
            <Wrench size={20} className="text-rose-500 group-hover:scale-110 transition-transform" strokeWidth={2.5} />
            <span className="text-[12px] font-bold text-zinc-800 leading-tight">Reportar MTTO</span>
          </Link>
        </div>
      </div>

      {/* ── 5. HERRAMIENTAS ───────────────────────────────────────────── */}
      <div>
        <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Herramientas</h3>
        <div className="grid grid-cols-2 gap-3">
          {/* FINANZAS */}
          <Link href="/finanzas" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all">
            <Wallet size={20} className="text-zinc-700" />
            <div>
              <p className="text-[14px] font-bold text-zinc-900 tracking-tight">FINANZAS</p>
              <p className="text-[11px] font-bold text-emerald-600 mt-0.5">MX${Math.round(financeBalance).toLocaleString('es-MX')}</p>
            </div>
          </Link>
          {/* MANTENIMIENTO */}
          <Link href="/mantenimiento" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all group">
            <div className="flex justify-between items-start w-full">
              <Wrench size={20} className="text-rose-500 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-bold text-blue-650 bg-blue-50 px-2 py-0.5 rounded-full">Ver Incidencias →</span>
            </div>
            <div>
              <p className="text-[14px] font-bold text-zinc-900 tracking-tight">MANTENIMIENTO</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-[11px] font-bold text-rose-600">
                  {tasks.filter(t => t.status === 'pendiente' || t.status === 'nuevo' || t.status === 'en_proceso').length} activos
                </p>
                <span className="text-zinc-300 text-[10px]">•</span>
                <p className="text-[11px] font-bold text-emerald-600">
                  {tasks.filter(t => t.status === 'resuelta' && t.resolved_at && t.resolved_at.split('T')[0] === todayStr).length} hoy
                </p>
              </div>
            </div>
          </Link>
          {/* INVENTARIO */}
          <Link href="/inventario" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all">
            <Package size={20} className="text-zinc-700" />
            <div>
              <p className="text-[14px] font-bold text-zinc-900 tracking-tight">INVENTARIO</p>
              <p className="text-[11px] font-medium text-amber-500 mt-0.5">Stock de Consumibles</p>
            </div>
          </Link>
          {/* ANALYTICS */}
          <Link href="/analytics" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all">
            <BarChart3 size={20} className="text-zinc-700" />
            <div>
              <p className="text-[14px] font-bold text-zinc-900 tracking-tight">ANALYTICS</p>
              <p className="text-[11px] font-medium text-zinc-400 mt-0.5">Revenue · Métricas</p>
            </div>
          </Link>
          {/* PRECIO DINÁMICO */}
          <Link href="/precios" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all">
            <TrendingUp size={20} className="text-zinc-700" />
            <div>
              <p className="text-[14px] font-bold text-zinc-900 tracking-tight">PRECIO DINÁMICO</p>
              <p className="text-[11px] font-bold text-emerald-500 mt-0.5">Algoritmo Activo</p>
            </div>
          </Link>
          {/* DEPURACIÓN DE DATOS */}
          <Link href="/limpieza" className="bg-white border border-zinc-200/80 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:border-zinc-300 active:scale-[0.98] transition-all group">
            <div className="flex justify-between items-start w-full">
              <Sparkles size={20} className="text-zinc-700 group-hover:scale-115 transition-transform duration-300" />
              <span className="text-[10px] font-bold text-zinc-650 bg-zinc-50 px-2 py-0.5 rounded-full">Depurar →</span>
            </div>
            <div>
              <p className="text-[14px] font-bold text-zinc-900 tracking-tight">DEPURACIÓN DE DATOS</p>
              <p className="text-[11px] font-medium text-zinc-400 mt-0.5">Limpieza y Archivo</p>
            </div>
          </Link>
        </div>
      </div>

      {/* ── 6. HABITACIONES DISPONIBLES / LIMPIAS ──────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <BedDouble size={13} className="text-blue-500" />
            Habitaciones Disponibles / Limpias
          </h3>
          <Link href="/recepcion" className="text-[11px] font-bold text-blue-600 hover:underline">Ir a Recepción →</Link>
        </div>

        <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm p-4 space-y-4">
          {/* Conteo por estados */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2 text-center">
              <span className="text-[16px] font-bold text-emerald-700">
                {roomStatuses.filter(r => r.status === 'disponible').length}
              </span>
              <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Disponibles</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-2 text-center">
              <span className="text-[16px] font-bold text-blue-700">
                {roomStatuses.filter(r => r.status === 'limpia').length}
              </span>
              <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Limpias</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-2 text-center">
              <span className="text-[16px] font-bold text-amber-700">
                {roomStatuses.filter(r => r.status === 'en_limpieza').length}
              </span>
              <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">En Limpieza</p>
            </div>
          </div>

          {/* Mini Grid visual */}
          {roomStatuses.length === 0 ? (
            <div className="text-center py-2 text-[11px] text-zinc-400 font-medium">Cargando estado físico...</div>
          ) : (
            <div className="grid grid-cols-6 gap-1.5 pt-1">
              {roomStatuses
                .sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), undefined, {numeric: true}))
                .map(room => {
                  let colorClasses = 'bg-zinc-100 text-zinc-500 border-zinc-200';
                  if (room.status === 'disponible') {
                    colorClasses = 'bg-emerald-500 text-white border-emerald-600 shadow-emerald-100';
                  } else if (room.status === 'limpia') {
                    colorClasses = 'bg-blue-500 text-white border-blue-600 shadow-blue-100';
                  } else if (room.status === 'en_limpieza') {
                    colorClasses = 'bg-amber-400 text-white border-amber-500 shadow-amber-100';
                  }
                  return (
                    <div
                      key={room.id}
                      onClick={() => router.push('/recepcion')}
                      className={`aspect-square rounded-xl border flex flex-col items-center justify-center cursor-pointer shadow-sm hover:scale-105 active:scale-95 transition-all text-center ${colorClasses}`}
                    >
                      <span className="text-[11px] font-bold tracking-tight leading-none">{room.room_number}</span>
                      <span className={`w-1.5 h-1.5 rounded-full border border-white mt-1 shrink-0 ${
                        room.status === 'disponible' ? 'bg-emerald-200' :
                        room.status === 'limpia' ? 'bg-blue-200' :
                        room.status === 'en_limpieza' ? 'bg-amber-200' : 'bg-zinc-300'
                      }`} />
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* ── 7. PRÓXIMAS RESERVAS ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <Users size={13} />
            Próximas Reservas
          </h3>
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
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                      <Users size={14} className="text-zinc-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-zinc-900 leading-tight truncate">{r.guest_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-medium text-zinc-500 flex-wrap leading-none">
                        <span className="truncate">{r.room_name}</span>
                        <span>•</span>
                        <span className="truncate">{r.channel}</span>
                        {r.guest_phone && (
                          <>
                            <span>•</span>
                            <a
                              href={`https://wa.me/${r.guest_phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-0.5 text-emerald-600 hover:text-emerald-700 font-bold transition-colors"
                            >
                              <Phone size={9} />
                              <span>{r.guest_phone}</span>
                            </a>
                          </>
                        )}
                      </div>
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


    </div>
  );
}
