"use client";

import { useEffect, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, BedDouble, Sparkles, BarChart3,
  MessageCircle, TrendingUp, RefreshCw, AlertCircle, Users, Moon,
  Wallet, Package, Plus, Lock, XCircle, History, Phone, Clock, CheckCircle2, Wrench, X
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, addDays, formatDistanceToNow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@supabase/supabase-js';

// Inicializar Supabase cliente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const ROOMS = [
  '101','102','103','104','105','106','107',
  '201','202','203','204','205','206',
  '301','302','303','304','305','306',
  '401','402',
  '500','501','502','503','504','505','506'
];

const ROOM_ROWS = [
  { label: 'Apartamentos Premier 3 Recámaras (101-107)', rooms: ['101','102','103','104','105','106','107'] },
  { label: 'Apartamentos Premier 2 Recámaras (201-206)', rooms: ['201','202','203','204','205','206'] },
  { label: 'Unidades Especiales (401-402)', rooms: ['401','402'] },
  { label: 'Habitaciones Dobles (301-306)', rooms: ['301','302','303','304','305','306'] },
  { label: 'Apartamentos Nuevos (500-506)', rooms: ['500','501','502','503','504','505','506'] }
];


function getLocalDateStr(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRoomDbStatus(roomNum: string, roomStatuses: any[]): string {
  const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(roomNum));
  return dbStatusObj ? dbStatusObj.status : 'disponible';
}

function getRoomOperationalStatus(
  roomNum: string,
  dbStatus: string, // 'disponible' | 'en_limpieza' | 'limpia' | 'sucio_checkout'
  activeReservations: any[],
  todayStr: string,
  lastUpdatedAt?: string
): 'disponible' | 'en_limpieza' | 'limpia' | 'sucio_checkout' | 'limpieza_programada' | 'ocupada' {
  const isUpdatedToday = lastUpdatedAt && lastUpdatedAt.startsWith(todayStr);

  const hasResToday = activeReservations.some(r => {
    const rRoom = String(r.room || '').replace(/[\s()]/g, '');
    const matches = rRoom.includes(roomNum);
    const isActiveToday = (r.check_in <= todayStr && r.check_out > todayStr) || (r.check_in === todayStr);
    return matches && isActiveToday && !r.checked_out;
  });

  // 1. Si el estatus en base de datos fue actualizado HOY, respetar de inmediato si es limpieza/sucio
  if (isUpdatedToday) {
    if (dbStatus === 'sucio_checkout') return 'sucio_checkout'; // Rojo (Aviso Check Out)
    if (dbStatus === 'en_limpieza') return 'en_limpieza'; // Amarillo (En limpieza)
    if (dbStatus === 'limpia') {
      return hasResToday ? 'ocupada' : 'limpia'; // Si está reservada hoy, no se muestra limpia/disponible
    }
    if (dbStatus === 'disponible') {
      return hasResToday ? 'ocupada' : 'disponible';
    }
  }

  // 2. Si es de ayer o antes (estatus obsoleto), calcular fresh de Beds24 para hoy:

  // Buscar si hay una reserva activa hoy para estancia (Stayover)
  const currentRes = activeReservations.find(r => {
    const rRoom = String(r.room || '').replace(/[\s()]/g, '');
    return rRoom.includes(roomNum) && r.check_in <= todayStr && r.check_out > todayStr;
  });

  if (currentRes && !currentRes.checked_out) {
    // Calcular días de estancia transcurridos
    const checkInDate = new Date(currentRes.check_in + 'T12:00:00');
    const todayDate = new Date(todayStr + 'T12:00:00');
    const diffTime = Math.abs(todayDate.getTime() - checkInDate.getTime());
    const dayOfStay = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // Día 1, 2, 3...

    const isThreeDayRoom = ['101','102','103','104','105','106','107','201','202','203','204','205','206','501','402'].includes(roomNum);
    const isDailyRoom = ['301','302','303','304','305','306','500','502','503','504','505','506','507'].includes(roomNum);

    if (isThreeDayRoom && dayOfStay >= 3 && dayOfStay % 3 === 0) {
      return 'limpieza_programada'; // Amarillo automático por 3er día (Stayover cada 3er día)
    }
    if (isDailyRoom && dayOfStay >= 2) {
      return 'limpieza_programada'; // Amarillo automático diario durante estancia
    }
  }

  // Buscar si tiene salida programada hoy (Check-out)
  const isSalidaHoy = activeReservations.some(r => {
    const rRoom = String(r.room || '').replace(/[\s()]/g, '');
    return rRoom.includes(roomNum) && r.check_out === todayStr && !r.checked_out;
  });

  if (isSalidaHoy) {
    return 'limpieza_programada'; // Amarillo automático por checkout programado hoy
  }

  // Si no necesita limpieza, y está reservada/ocupada hoy, se muestra sin color (ocupada)
  if (hasResToday) {
    return 'ocupada';
  }

  // 3. Si no tiene salida ni estancia programada que requiera limpieza hoy, está disponible
  return 'disponible'; // Verde por defecto
}

export default function AdminDashboard() {
  const router = useRouter();
  const [reservas, setReservas] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [roomStatuses, setRoomStatuses] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenError, setTokenError] = useState(false);
  const [hoy, setHoy] = useState('');
  const [todayStr, setTodayStr] = useState('');
  const [financeBalance, setFinanceBalance] = useState(0);

  const [showRoomStatusModal, setShowRoomStatusModal] = useState(false);
  const [selectedRoomForStatus, setSelectedRoomForStatus] = useState<any | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [kpiModalType, setKpiModalType] = useState<'encasa' | 'llegan' | 'salen' | null>(null);

  const fetchAll = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setTokenError(false);
    try {
      const [resRes, convRes, roomsRes, tasksRes, chkRes] = await Promise.all([
        fetch('/api/reservas').catch(() => null),
        fetch('/api/conversations').catch(() => null),
        fetch('/api/room-status').catch(() => null),
        fetch('/api/tasks').catch(() => null),
        supabase.from('checkins').select('*')
      ]);

      let checkinMap: Record<string, any> = {};
      if (chkRes && chkRes.data) {
        chkRes.data.forEach((c: any) => {
          checkinMap[String(c.reservation_id)] = c;
        });
      }

      if (resRes) {
        const resJson = await resRes.json();
        if (resJson.error === 'TOKEN_EXPIRED') {
          setTokenError(true);
        } else if (resJson.success) {
          const sorted = resJson.data.sort((a: any, b: any) =>
            new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
          );
          setReservas(
            sorted.map((res: any) => ({
              ...res,
              room: res.room_name || res.room || 'Sin asignar',
              checked_in: checkinMap[String(res.id)]?.status === 'checked_in',
              checked_out: checkinMap[String(res.id)]?.status === 'checked_out',
              dni_image: checkinMap[String(res.id)]?.dni_image
            }))
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
      if (!silent) setIsLoading(false);
    }
  };

  const handleUpdateRoomStatus = async (newStatus: string) => {
    if (!selectedRoomForStatus) return;
    setStatusUpdating(true);

    try {
      const res = await fetch('/api/room-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_number: selectedRoomForStatus.room_number,
          status: newStatus,
          updated_by: 'Administrador'
        }),
      });
      const json = await res.json();
      if (json.success) {
        // Registrar log de auditoría
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: 'ADMIN',
            employee_name: 'Administrador',
            department: 'recepcion',
            module: 'recepcion',
            action: 'change_room_status',
            room: selectedRoomForStatus.room_number,
            details: `Cambió el estado de Habitación ${selectedRoomForStatus.room_number} a '${newStatus}' desde el Dashboard de Administración`
          })
        });

        // Actualizar estados locales de inmediato
        const roomsRes = await fetch('/api/room-status');
        const roomsJson = await roomsRes.json();
        if (roomsJson.success) setRoomStatuses(roomsJson.data || []);
        
        setShowRoomStatusModal(false);
      } else {
        alert('Error al actualizar el estado: ' + json.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión');
    } finally {
      setStatusUpdating(false);
    }
  };

  useEffect(() => {
    const today = getLocalDateStr();
    setTodayStr(today);
    setHoy(format(new Date(), "EEEE, d MMM", { locale: es }));
    fetchAll(false);
    const interval = setInterval(() => {
      fetchAll(true);
    }, 15000);
    return () => clearInterval(interval);
  }, []);
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
        <button onClick={() => fetchAll()} disabled={isLoading}
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
        <button 
          onClick={() => setKpiModalType('encasa')}
          className="bg-white border border-zinc-200/80 rounded-2xl p-3 text-center shadow-sm cursor-pointer hover:bg-zinc-50/50 hover:border-zinc-300 active:scale-95 transition-all outline-none"
        >
          <p className="text-[20px] font-bold text-zinc-900">{activeNow}</p>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">En casa</p>
        </button>
        <button 
          onClick={() => setKpiModalType('llegan')}
          className="bg-white border border-zinc-200/80 rounded-2xl p-3 text-center shadow-sm cursor-pointer hover:bg-zinc-50/50 hover:border-zinc-300 active:scale-95 transition-all outline-none"
        >
          <p className="text-[20px] font-bold text-emerald-600">{llegadasHoy.length}</p>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Llegan</p>
        </button>
        <button 
          onClick={() => setKpiModalType('salen')}
          className="bg-white border border-zinc-200/80 rounded-2xl p-3 text-center shadow-sm cursor-pointer hover:bg-zinc-50/50 hover:border-zinc-300 active:scale-95 transition-all outline-none"
        >
          <p className="text-[20px] font-bold text-amber-500">{salidasHoy.length}</p>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Salen</p>
        </button>
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

        <div className="bg-white border border-zinc-200/80 rounded-[28px] shadow-sm p-5 space-y-4">
          {/* Conteo por estados (4 columnas igual que recepción) */}
          <div className="grid grid-cols-4 gap-1.5">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2 text-center shadow-sm">
              <span className="text-[15px] font-black text-emerald-700">
                {ROOMS.filter(r => {
                  const dbStatus = getRoomDbStatus(r, roomStatuses);
                  const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
                  return getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at) === 'disponible';
                }).length}
              </span>
              <p className="text-[7.2px] font-black text-emerald-600 uppercase tracking-wider mt-0.5">Disponibles</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-2 text-center shadow-sm">
              <span className="text-[15px] font-black text-amber-700">
                {ROOMS.filter(r => {
                  const dbStatus = getRoomDbStatus(r, roomStatuses);
                  const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
                  const s = getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);
                  return s === 'en_limpieza' || s === 'limpieza_programada';
                }).length}
              </span>
              <p className="text-[7.2px] font-black text-amber-600 uppercase tracking-wider mt-0.5">Limp. Programada</p>
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-2 text-center shadow-sm">
              <span className="text-[15px] font-black text-rose-700">
                {ROOMS.filter(r => {
                  const dbStatus = getRoomDbStatus(r, roomStatuses);
                  const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
                  return getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at) === 'sucio_checkout';
                }).length}
              </span>
              <p className="text-[7.2px] font-black text-rose-600 uppercase tracking-wider mt-0.5">Check Out</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-2 text-center shadow-sm">
              <span className="text-[15px] font-black text-blue-700">
                {ROOMS.filter(r => {
                  const dbStatus = getRoomDbStatus(r, roomStatuses);
                  const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
                  return getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at) === 'limpia';
                }).length}
              </span>
              <p className="text-[7.2px] font-black text-blue-600 uppercase tracking-wider mt-0.5">Limp. Terminada</p>
            </div>
          </div>

          {/* Grid visual premium agrupado por Renglones/Filas */}
          <div className="space-y-4 pt-1">
            {ROOM_ROWS.map((row) => (
              <div key={row.label} className="space-y-2 border-b border-zinc-100 pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-none">
                    {row.label}
                  </span>
                  <span className="text-[8px] font-extrabold bg-zinc-50 border border-zinc-150 px-1.5 py-0.5 rounded text-zinc-400">
                    {row.rooms.length} HAB
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {row.rooms.map((roomNum) => {
                    const dbStatus = getRoomDbStatus(roomNum, roomStatuses);
                    const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(roomNum)) || { room_number: roomNum, id: roomNum };
                    const operStatus = getRoomOperationalStatus(roomNum, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);

                    let colorClasses = 'bg-zinc-100 text-zinc-500 border-zinc-200';
                    let dotClass = 'bg-zinc-300';
                    if (operStatus === 'disponible') {
                      colorClasses = 'bg-emerald-500 text-white border-emerald-600 shadow-emerald-100/30';
                      dotClass = 'bg-emerald-250';
                    } else if (operStatus === 'limpia') {
                      colorClasses = 'bg-blue-500 text-white border-blue-600 shadow-blue-100/30';
                      dotClass = 'bg-blue-250';
                    } else if (operStatus === 'sucio_checkout') {
                      colorClasses = 'bg-rose-500 text-white border-rose-600 shadow-rose-100/30';
                      dotClass = 'bg-rose-250';
                    } else if (operStatus === 'en_limpieza' || operStatus === 'limpieza_programada') {
                      colorClasses = 'bg-amber-400 text-white border-amber-500 shadow-amber-100/30';
                      dotClass = 'bg-amber-250';
                    }

                    return (
                      <div
                        key={roomNum}
                        onClick={() => {
                          setSelectedRoomForStatus({
                            room_number: roomNum,
                            status: dbStatus,
                            id: dbStatusObj.id || roomNum,
                            updated_by: dbStatusObj.updated_by || null,
                            updated_at: dbStatusObj.updated_at || null,
                            operStatus: operStatus
                          });
                          setShowRoomStatusModal(true);
                        }}
                        className={`aspect-square rounded-2xl border flex flex-col items-center justify-center cursor-pointer shadow-sm hover:scale-[1.06] active:scale-[0.94] transition-all text-center ${colorClasses}`}
                      >
                        <span className="text-[11px] font-black tracking-tight leading-none">{roomNum}</span>
                        <span className={`w-1.5 h-1.5 rounded-full border border-white mt-1 shrink-0 ${dotClass}`} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
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

      {/* ── MODAL DETALLE / INSPECCIÓN DE HABITACIÓN EN ADMIN (INTERACTIVO COMPACTO) ── */}
      {showRoomStatusModal && selectedRoomForStatus && (() => {
        const operStatus = selectedRoomForStatus.operStatus;

        // Formateador de fecha/hora de la última actualización
        const formatLastUpdated = (dateStr?: string) => {
          if (!dateStr) return '—';
          try {
            return format(parseISO(dateStr), "d 'de' MMMM, h:mm a", { locale: es });
          } catch (e) {
            return dateStr;
          }
        };

        const isCleanTerminated = operStatus === 'limpia';

        return (
          <div className="fixed inset-0 z-[9999] flex flex-col justify-end bg-zinc-950/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div onClick={() => setShowRoomStatusModal(false)} className="absolute inset-0" />
            <div className="relative bg-white rounded-t-[32px] shadow-2xl p-6 space-y-6 animate-in slide-in-from-bottom-8 duration-300 w-full max-w-md mx-auto">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-zinc-900">Habitación {selectedRoomForStatus.room_number}</h3>
                    {isCleanTerminated && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        Inspección Pendiente
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 font-bold mt-0.5">
                    {isCleanTerminated ? 'Control de Calidad y Aprobación de Renta' : 'Información Operativa de la Habitación'}
                  </p>
                </div>
                <button 
                  onClick={() => setShowRoomStatusModal(false)} 
                  className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 cursor-pointer hover:bg-zinc-200"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>

              {/* Contenido Condicional */}
              {isCleanTerminated ? (
                // CASO AZUL: Inspección y Aprobación
                <div className="space-y-5">
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-3.5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
                        🧹
                      </div>
                      <div>
                        <p className="text-[12px] font-black text-blue-800 uppercase tracking-wider">Limpieza Finalizada</p>
                        <p className="text-[10px] text-blue-600 font-bold">La habitación está lista para control físico.</p>
                      </div>
                    </div>
                    
                    <div className="border-t border-blue-200/40 pt-3 space-y-2 text-[12px]">
                      <div className="flex justify-between items-center text-zinc-700">
                        <span className="font-bold text-zinc-400">Limpiado por:</span>
                        <span className="font-extrabold text-blue-900">{selectedRoomForStatus.updated_by || 'Personal de Limpieza'}</span>
                      </div>
                      <div className="flex justify-between items-center text-zinc-700">
                        <span className="font-bold text-zinc-400">Hora de término:</span>
                        <span className="font-bold text-zinc-800">{formatLastUpdated(selectedRoomForStatus.updated_at)}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[12px] text-zinc-500 font-medium leading-relaxed bg-zinc-50 border border-zinc-200/60 p-3.5 rounded-xl">
                    ℹ️ **Instrucciones de Administrador:** Puedes aprobar directamente la inspección para habilitarla o reportar algún detalle técnico a mantenimiento si no cumple el estándar.
                  </p>

                  <div className="flex flex-col gap-2.5 pt-2">
                    <button
                      onClick={() => handleUpdateRoomStatus('disponible')}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[13px] tracking-wide uppercase py-4 rounded-2xl transition-all cursor-pointer shadow-md shadow-emerald-600/15 flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      <CheckCircle2 size={16} strokeWidth={2.5} />
                      <span>Aprobar Inspección (Marcar Disponible)</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        setShowRoomStatusModal(false);
                        router.push(`/mantenimiento?action=new_task&room=${selectedRoomForStatus.room_number}`);
                      }}
                      className="w-full bg-rose-50 hover:bg-rose-100 text-rose-650 border border-rose-200 font-bold text-[12px] py-3.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Wrench size={14} />
                      <span>Reportar Daño o Detalle Técnico (MTTO)</span>
                    </button>
                  </div>
                </div>
              ) : (
                // CASO RESTO (Verde, Amarillo, Rojo): Tarjeta Informativa e interactiva con botones rápidos
                <div className="space-y-5">
                  <div className="flex justify-center">
                    {(() => {
                      let bg = 'bg-zinc-150 text-zinc-700 border-zinc-200';
                      let label = 'Desconocido';
                      let desc = '';
                      
                      if (operStatus === 'disponible') {
                        bg = 'bg-emerald-500 text-white border-emerald-600 shadow-lg shadow-emerald-500/10';
                        label = '🟢 Disponible';
                        desc = 'La habitación se encuentra limpia, inspeccionada y lista para recibir huéspedes de check-in inmediato.';
                      } else if (operStatus === 'ocupada') {
                        bg = 'bg-zinc-100 text-zinc-500 border-zinc-200';
                        label = '⚪ Ocupada / Reservada';
                        desc = 'La habitación cuenta con una estancia activa o una llegada programada para el día de hoy, por lo que no está disponible para nuevos walk-ins.';
                      } else if (operStatus === 'sucio_checkout') {
                        bg = 'bg-rose-500 text-white border-rose-600 shadow-lg shadow-rose-500/10';
                        label = '🔴 Check Out';
                        desc = 'Se ha dado salida al huésped. El cuarto requiere una limpieza profunda de salida para volver a rentarse.';
                      } else if (operStatus === 'en_limpieza' || operStatus === 'limpieza_programada') {
                        bg = 'bg-amber-400 text-white border-amber-500 shadow-lg shadow-amber-450/10';
                        label = '🟡 Limpieza Programada';
                        desc = 'Se requiere limpieza ordinaria (Stayover diario, cada 3er día o checkout programado para hoy) basada en reservas de Beds24.';
                      }

                      return (
                        <div className="w-full space-y-4">
                          <div className={`p-4 border rounded-2xl text-center ${bg}`}>
                            <span className="text-[14px] font-black tracking-wide uppercase">{label}</span>
                          </div>
                          
                          <div className="bg-zinc-50 border border-zinc-200/60 rounded-2xl p-4 space-y-3">
                            <p className="text-[12px] text-zinc-500 font-semibold leading-relaxed">
                              {desc}
                            </p>
                            
                            {(selectedRoomForStatus.updated_by || selectedRoomForStatus.updated_at) && (
                              <div className="border-t border-zinc-200/40 pt-3 space-y-1.5 text-[11px] text-zinc-400 font-bold">
                                {selectedRoomForStatus.updated_by && (
                                  <div className="flex justify-between">
                                    <span>Última acción por:</span>
                                    <span className="font-extrabold text-zinc-700">{selectedRoomForStatus.updated_by}</span>
                                  </div>
                                )}
                                {selectedRoomForStatus.updated_at && (
                                  <div className="flex justify-between">
                                    <span>Fecha/Hora:</span>
                                    <span className="font-bold text-zinc-700">{formatLastUpdated(selectedRoomForStatus.updated_at)}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="pt-2 space-y-2">
                    {/* Botones rápidos de control de estatus */}
                    {operStatus !== 'ocupada' && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleUpdateRoomStatus('disponible')}
                          className="py-3 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>Marcar Disponible</span>
                        </button>
                        <button
                          onClick={() => handleUpdateRoomStatus('limpia')}
                          className="py-3 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-bold text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>Marcar Limpia (Azul)</span>
                        </button>
                        <button
                          onClick={() => handleUpdateRoomStatus('en_limpieza')}
                          className="py-3 px-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl font-bold text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>Iniciar Limpieza</span>
                        </button>
                        <button
                          onClick={() => handleUpdateRoomStatus('sucio_checkout')}
                          className="py-3 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>Marcar Check Out</span>
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => {
                        setShowRoomStatusModal(false);
                        router.push(`/mantenimiento?action=new_task&room=${selectedRoomForStatus.room_number}`);
                      }}
                      className="w-full mt-1 bg-zinc-900 hover:bg-zinc-950 text-white font-extrabold text-[12px] tracking-wide uppercase py-3.5 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98]"
                    >
                      <Wrench size={14} />
                      <span>Reportar Incidencia de Mantenimiento</span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        );
      })()}

      {/* ── MODAL DETALLES DE KPI (GUEST LIST) ── */}
      {kpiModalType && (() => {
        let title = 'Detalles';
        let badgeColor = 'bg-zinc-100 text-zinc-800';
        let filtered: any[] = [];

        if (kpiModalType === 'encasa') {
          title = 'Huéspedes En Casa';
          badgeColor = 'bg-zinc-900 text-white';
          filtered = reservas.filter(r => r.check_in <= todayStr && r.check_out > todayStr);
        } else if (kpiModalType === 'llegan') {
          title = 'Llegadas Hoy';
          badgeColor = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
          filtered = llegadasHoy;
        } else if (kpiModalType === 'salen') {
          title = 'Salidas Hoy';
          badgeColor = 'bg-amber-100 text-amber-800 border border-amber-200';
          filtered = salidasHoy;
        }

        return (
          <div className="fixed inset-0 z-[9999] flex flex-col justify-end bg-zinc-950/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div onClick={() => setKpiModalType(null)} className="absolute inset-0" />
            <div className="relative bg-white rounded-t-[32px] shadow-2xl p-6 space-y-4 animate-in slide-in-from-bottom-8 duration-300 w-full max-w-md mx-auto max-h-[85vh] flex flex-col">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-zinc-900">{title}</h3>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${badgeColor}`}>
                    {filtered.length}
                  </span>
                </div>
                <button 
                  onClick={() => setKpiModalType(null)} 
                  className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 cursor-pointer hover:bg-zinc-200"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>

              {/* List body */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1">
                {filtered.length === 0 ? (
                  <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">
                    No hay huéspedes en este grupo para el día de hoy.
                  </div>
                ) : (
                  filtered.map(r => {
                    const nightsVal = r.nights || 1;
                    const cleanPhone = r.guest_phone ? r.guest_phone.replace(/\D/g, '') : '';
                    
                    return (
                      <div 
                        key={r.id} 
                        onClick={() => {
                          setKpiModalType(null);
                          router.push(`/reservas?id=${r.id}`);
                        }}
                        className="p-4 border border-zinc-150 rounded-2xl hover:border-zinc-300 hover:bg-zinc-50/50 transition-all cursor-pointer space-y-2.5"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-[14px] font-black text-zinc-950 leading-tight">{r.guest_name || 'Huésped Sin Nombre'}</h4>
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">ID: {r.id}</span>
                          </div>
                          <span className="text-[11px] font-extrabold bg-zinc-900 text-white px-2.5 py-1 rounded-lg">
                            {r.room_name || r.room || 'Sin asign'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-[12px] pt-1.5 border-t border-zinc-100">
                          <div>
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Estancia</span>
                            <p className="font-semibold text-zinc-800 truncate">
                              {r.check_in} al {r.check_out} ({nightsVal}n)
                            </p>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Canal / Origen</span>
                            <p className="font-semibold text-zinc-800">{r.channel || 'Directo'}</p>
                          </div>
                        </div>

                        {cleanPhone && (
                          <div className="pt-2 flex justify-end gap-2">
                            <a
                              href={`https://wa.me/${cleanPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-[11px] font-extrabold transition-all active:scale-95 shadow-sm"
                            >
                              <MessageCircle size={12} className="text-emerald-600" />
                              WhatsApp
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
}
