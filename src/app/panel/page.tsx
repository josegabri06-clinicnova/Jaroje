"use client";

import { useEffect, useState, useMemo } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, BedDouble, Sparkles, BarChart3,
  MessageCircle, TrendingUp, RefreshCw, AlertCircle, Users, Moon,
  Wallet, Package, Plus, Lock, XCircle, History, Phone, Clock, CheckCircle2, Wrench, X, CircleDot
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, addDays, formatDistanceToNow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@supabase/supabase-js';
import { getSeason } from '@/lib/beds24';

// Inicializar Supabase cliente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const ROOMS = [
  '101', '102', '103', '104', '105', '106', '107',
  '201', '202', '203', '204', '205', '206',
  '301', '302', '303', '304', '305', '306',
  '401', '402',
  '500', '501', '502', '503', '504', '505', '506', '507'
];

const ROOM_ROWS = [
  { label: 'Apartamentos de 3 dormitorios (101-107)', rooms: ['101', '102', '103', '104', '105', '106', '107'] },
  { label: 'Apartamentos de 2 dormitorios (201-206)', rooms: ['201', '202', '203', '204', '205', '206'] },
  { label: 'Unidades Especiales (401-402)', rooms: ['401', '402'] },
  { label: 'Habitaciones Dobles (301-306)', rooms: ['301', '302', '303', '304', '305', '306'] },
  { label: 'Apartamentos Nuevos (500-507)', rooms: ['500', '501', '502', '503', '504', '505', '506', '507'], isLocal: true }
];


function getLocalDateStr(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  } catch (e) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

const getUnitDisplay = (roomStr: string) => {
  if (!roomStr) return '';
  // 1. Try parentheses format: "Habitación Doble (101)" → "101"
  const parenMatch = roomStr.match(/\(([^)]+)\)/);
  if (parenMatch) return parenMatch[1];
  // 2. Extract trailing number: "Habitación 504" → "504"
  const numMatch = roomStr.match(/(\d+)\s*$/);
  if (numMatch) return numMatch[1];
  // 3. Fallback: return the whole string
  return roomStr;
};

function getRoomDbStatus(roomNum: string, roomStatuses: any[]): string {
  const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(roomNum));
  return dbStatusObj ? dbStatusObj.status : 'disponible';
}

const BEDS24_ROOM_MAP: Record<string, string> = {
  '685321': '101', '685322': '102', '685323': '103', '685324': '104', '685325': '105', '685326': '106', '685327': '107',
  '685312': '201', '685318': '202', '685314': '203', '685315': '204', '685316': '205', '685317': '206',
  '685531': '301', '685532': '302', '685533': '303', '685534': '304', '685535': '305', '685536': '306',
  '679093': '401', '679008': '401', '679087': '402'
};

const BEDS24_UNIT_MAP: Record<string, Record<string, string>> = {
  '679077': { '1': '301', '2': '302', '3': '303', '4': '304', '5': '305', '6': '306' },
  '679087': { '1': '402' },
  '679091': { '1': '201', '2': '202', '3': '203', '4': '204', '5': '205', '6': '206' },
  '679092': { '1': '101', '2': '102', '3': '103', '4': '104', '5': '105', '6': '106', '7': '107' },
  '679093': { '1': '401' },
  '679008': { '1': '401' }
};

const LOCAL_UNIT_MAP: Record<string, string> = {
  '1': '500', '2': '501', '3': '502', '4': '503',
  '5': '504', '6': '505', '7': '506', '8': '507'
};

function matchesRoomNumber(r: any, roomNum: string): boolean {
  if (!r || !roomNum) return false;

  const roomIdStr = String(r.roomId || r.room_id || '');
  const unitIdStr = String(r.unitId || r.unit_id || '');

  // 1. Mapeo directo por roomId individual Beds24 (685321 -> 101, 679093 -> 401, 679008 -> 401)
  if (roomIdStr && BEDS24_ROOM_MAP[roomIdStr]) {
    if (BEDS24_ROOM_MAP[roomIdStr] === roomNum) return true;
  }

  // 2. Mapeo explícito Beds24 (roomId + unitId)
  if (roomIdStr && unitIdStr && BEDS24_UNIT_MAP[roomIdStr]?.[unitIdStr]) {
    if (BEDS24_UNIT_MAP[roomIdStr][unitIdStr] === roomNum) return true;
  }

  // 3. Mapeo habitaciones locales 500-507 (unitId)
  if (unitIdStr && LOCAL_UNIT_MAP[unitIdStr]) {
    if (LOCAL_UNIT_MAP[unitIdStr] === roomNum) return true;
  }
  if (unitIdStr && unitIdStr === roomNum) return true;

  // 4. Evaluar campos room o room_name limpiando rangos de categoría como 500-507, 301-306, (101-107)
  const cleanStr = (str: string) => str.replace(/\(?\d{3}\s*-\s*\d{3}\)?/g, '');

  const roomStr = cleanStr(String(r.room || ''));
  const roomNameStr = cleanStr(String(r.room_name || ''));

  const regex = new RegExp(`\\b${roomNum}\\b`);
  if (regex.test(roomStr)) return true;
  if (regex.test(roomNameStr)) return true;

  // 5. Caso especial para Casa Vacacional (401)
  if (roomNum === '401') {
    const combinedStr = (roomStr + ' ' + roomNameStr).toLowerCase();
    if (combinedStr.includes('casa') || combinedStr.includes('vacacional') || roomIdStr === '679093' || roomIdStr === '679008') {
      return true;
    }
  }

  // 6. Si la reserva tiene habitaciones de grupo asignadas
  if (Array.isArray(r.groupRooms)) {
    const matchedInGroup = r.groupRooms.some((gr: any) => {
      const gRoomId = String(gr.roomId || gr.room_id || '');
      const gUnitId = String(gr.unitId || gr.unit_id || '');
      if (gRoomId && BEDS24_ROOM_MAP[gRoomId]) {
        if (BEDS24_ROOM_MAP[gRoomId] === roomNum) return true;
      }
      if (gRoomId && gUnitId && BEDS24_UNIT_MAP[gRoomId]?.[gUnitId]) {
        if (BEDS24_UNIT_MAP[gRoomId][gUnitId] === roomNum) return true;
      }
      const grStr = cleanStr(String(gr.name || gr.roomId || gr.unitId || ''));
      if (regex.test(grStr)) return true;
      if (roomNum === '401' && (grStr.toLowerCase().includes('casa') || gRoomId === '679093' || gRoomId === '679008')) return true;
      return false;
    });
    if (matchedInGroup) return true;
  }

  return false;
}

function getRoomOperationalStatus(
  roomNum: string,
  dbStatus: string, // 'disponible' | 'en_limpieza' | 'limpia' | 'sucio_checkout'
  activeReservations: any[],
  todayStr: string,
  lastUpdatedAt?: string
): 'disponible' | 'en_limpieza' | 'limpia' | 'sucio_checkout' | 'limpieza_programada' | 'ocupada' | 'salida_hoy' {
  const updateDateStr = lastUpdatedAt ? (lastUpdatedAt || '').split('T')[0].split(' ')[0] : '';
  const isCleanedToday = (updateDateStr === todayStr) && dbStatus === 'limpia';
  const isEnLimpiezaToday = (dbStatus === 'en_limpieza');
  const isUpdatedToday = (updateDateStr === todayStr);

  // Sobrescribimiento Manual del Administrador hoy (fuerza el color seleccionado por Rolando):
  if (isUpdatedToday && dbStatus === 'sucio_checkout') {
    return 'sucio_checkout';
  }
  if (isUpdatedToday && dbStatus === 'en_limpieza') {
    return 'en_limpieza';
  }

  // 1. FLUJO 2: Evaluar si la habitación tiene SALIDA HOY (Check-out)
  const salidaRes = activeReservations.find(r => {
    if (r.status === 'cancelled' || r.status === 'cancelado') return false;
    const cOut = (r.check_out || r.departure || '').split('T')[0].split(' ')[0];
    return matchesRoomNumber(r, roomNum) && cOut === todayStr;
  });

  if (salidaRes) {
    // Si el huésped AÚN NO HACE CHECK-OUT -> ROJO CLARO (salida_hoy)
    if (!salidaRes.checked_out) {
      if (isEnLimpiezaToday) return 'en_limpieza';
      return 'salida_hoy'; // Rojo claro (salida hoy pendiente)
    }

    // Si ya registró checkout (checked_out === true):
    // ¿Ya se realizó la limpieza post-checkout hoy?
    if (isCleanedToday) {
      // ¿Hay una nueva reserva que llega hoy y aún no hace check-in?
      const incomingRes = activeReservations.find(r => {
        if (r.status === 'cancelled' || r.status === 'cancelado') return false;
        const cIn = (r.check_in || r.arrival || '').split('T')[0].split(' ')[0];
        return matchesRoomNumber(r, roomNum) && cIn === todayStr && !r.checked_in;
      });
      if (incomingRes) {
        return 'limpia'; // Azul (check-in pendiente)
      } else {
        return 'disponible'; // Verde (disponible libre)
      }
    }

    // Check-out registrado pero sucia -> ROJO FUERTE
    if (isEnLimpiezaToday) return 'en_limpieza';
    return 'sucio_checkout'; // Rojo fuerte
  }

  // 2. FLUJO 1 & FLUJO 3/4: Buscar si hay una reserva activa en estancia o que entra hoy
  const currentRes = activeReservations.find(r => {
    if (r.status === 'cancelled' || r.status === 'cancelado') return false;
    const cIn = (r.check_in || r.arrival || '').split('T')[0].split(' ')[0];
    const cOut = (r.check_out || r.departure || '').split('T')[0].split(' ')[0];
    return matchesRoomNumber(r, roomNum) && (r.checked_in || (cIn <= todayStr && cOut > todayStr));
  });

  if (currentRes) {
    const cIn = (currentRes.check_in || currentRes.arrival || '').split('T')[0].split(' ')[0];
    const isTodayArrival = (cIn === todayStr);

    // CASO A: Entra HOY y el huésped AÚN NO HACE CHECK-IN -> AZUL (Check-in pendiente / Llegada hoy)
    if (isTodayArrival && !currentRes.checked_in) {
      if (isCleanedToday || dbStatus === 'limpia' || dbStatus === 'disponible') {
        return 'limpia'; // Azul
      }
      return 'sucio_checkout'; // Rojo fuerte si falta limpiar antes de llegada
    }

    // CASO B: EL HUÉSPED YA HIZO CHECK-IN O ESTÁ EN ESTANCIA EN CURSO (Gris u Amarillo)
    // Evaluar si le corresponde Limpieza Programada hoy (Flujo 4):
    if (isRoomStayoverServiceScheduled(roomNum, activeReservations, todayStr)) {
      if (!isCleanedToday) {
        return 'limpieza_programada'; // Amarillo
      }
    }

    return 'ocupada'; // GRIS (No disponible / Ocupada)
  }

  // 3. Si fue marcada sucio_checkout previamente en DB
  if (dbStatus === 'sucio_checkout' && !isCleanedToday) {
    return 'sucio_checkout';
  }
  if (isEnLimpiezaToday) {
    return 'en_limpieza';
  }

  // 4. Si la habitación está totalmente libre y sin reservas activas -> VERDE (Disponible)
  return 'disponible';
}

function isRoomStayoverServiceScheduled(roomNum: string, activeReservations: any[], todayStr: string): boolean {
  const currentRes = activeReservations.find(r => {
    if (r.status === 'cancelled' || r.status === 'cancelado') return false;
    const cIn = (r.check_in || r.arrival || '').split('T')[0].split(' ')[0];
    const cOut = (r.check_out || r.departure || '').split('T')[0].split(' ')[0];
    return matchesRoomNumber(r, roomNum) && (r.checked_in || (cIn <= todayStr && cOut > todayStr)) && !r.checked_out;
  });

  if (!currentRes) return false;

  const cIn = (currentRes.check_in || currentRes.arrival || '').split('T')[0].split(' ')[0];
  if (!cIn || cIn.length !== 10) return false;

  const cInDate = new Date(cIn + 'T12:00:00');
  const tDate = new Date(todayStr + 'T12:00:00');
  const diffDays = Math.round((tDate.getTime() - cInDate.getTime()) / (1000 * 60 * 60 * 24));

  const isThreeDayRoom = ['101','102','103','104','105','106','107','201','202','203','204','205','206','401','402'].includes(roomNum);
  const isDailyRoom = ['301','302','303','304','305','306','500','501','502','503','504','505','506','507'].includes(roomNum);

  if (isThreeDayRoom) {
    return diffDays >= 2 && diffDays % 2 === 0;
  } else if (isDailyRoom) {
    return diffDays >= 1;
  }

  return false;
}

function getRoomCategoryLabel(roomNum: string): string {
  return ROOM_ROWS.find(row => row.rooms.includes(roomNum))?.label || `Habitación ${roomNum}`;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [reservas, setReservas] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [roomStatuses, setRoomStatuses] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenError, setTokenError] = useState<false | 'TOKEN_EXPIRED' | 'REFRESH_TOKEN_EXPIRED'>(false);
  const [newRefreshToken, setNewRefreshToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [hoy, setHoy] = useState('');
  const [todayStr, setTodayStr] = useState('');
  const [financeBalance, setFinanceBalance] = useState(0);

  const [showRoomStatusModal, setShowRoomStatusModal] = useState(false);
  const [selectedRoomForStatus, setSelectedRoomForStatus] = useState<any | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [kpiModalType, setKpiModalType] = useState<'encasa' | 'llegan' | 'salen' | 'disponibles' | 'programada' | 'checkout' | 'terminada' | null>(null);
  const [toastMsg, setToastMsg] = useState('');

  const fetchAll = async (silent = false, bypassCache = false) => {
    if (!silent) setIsLoading(true);
    setTokenError(false);
    try {
      const [resRes, convRes, roomsRes, tasksRes, chkRes] = await Promise.all([
        fetch(`/api/reservas?bypassCache=${bypassCache ? 'true' : 'false'}&t=` + Date.now()).catch(() => null),
        fetch('/api/conversations?t=' + Date.now()).catch(() => null),
        fetch('/api/room-status?t=' + Date.now()).catch(() => null),
        fetch('/api/tasks?t=' + Date.now()).catch(() => null),
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
        if (resJson.error === 'REFRESH_TOKEN_EXPIRED') {
          setTokenError('REFRESH_TOKEN_EXPIRED');
        } else if (resJson.error === 'TOKEN_EXPIRED') {
          setTokenError('TOKEN_EXPIRED');
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
              dni_image: checkinMap[String(res.id)]?.document_url
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
        if (tasksJson.success) {
          const rawTasks = tasksJson.data || [];
          const maintenanceTasks = rawTasks.filter((t: any) => {
            const desc = (t.description || '').toLowerCase();
            const isClean = t.type === 'limpieza' ||
              desc.includes('check-out completado') ||
              desc.includes('lista para limpieza') ||
              desc.includes('servicio de limpieza') ||
              desc.includes('limpieza programada');
            return !isClean;
          });
          setTasks(maintenanceTasks);
        }
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
            details: `Habitación ${selectedRoomForStatus.room_number} - Cambió el estado a '${newStatus}' desde el Dashboard de Administración.`
          })
        });

        // Actualizar estados locales de inmediato
        const roomsRes = await fetch('/api/room-status?t=' + Date.now());
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

  const handleCopyDailyReport = async () => {
    if (reservas.length === 0) {
      alert("No hay datos de reservaciones cargados para generar el reporte.");
      return;
    }

    const dateStr = format(new Date(), "EEEE, d 'de' MMMM", { locale: es });
    const llegan = reservas.filter(r => r.check_in === todayStr && r.status !== 'cancelled');
    const salen = reservas.filter(r => r.check_out === todayStr && r.status !== 'cancelled');
    const enCasa = reservas.filter(r => r.check_out > todayStr && r.checked_in && r.status !== 'cancelled');

    let text = `📋 *RESUMEN DIARIO DE OPERACIONES*\n🏨 *Condominios Jaroje*\n📅 *${dateStr.toUpperCase()}*\n\n`;

    // --- LLEGAN HOY ---
    text += `🚪 *LLEGAN HOY (${llegan.length})*\n`;
    if (llegan.length === 0) {
      text += `   _Sin llegadas programadas_\n`;
    } else {
      llegan.forEach((r, idx) => {
        const room = getUnitDisplay(r.room_name || r.room || '');
        const paxTotal = (r.num_adult || 1) + (r.num_child || 0);
        
        // Si es una OTA (Airbnb, Booking.com, Expedia), el cobro lo maneja la plataforma (por lo tanto, para recepción está Pagado)
        const isOTA = ['booking.com', 'airbnb', 'expedia'].some(c => (r.channel || '').toLowerCase().includes(c));
        const balanceVal = r.balance !== undefined ? r.balance : ((r.price_estimate || 0) - (r.deposit || 0));
        const balanceStr = isOTA ? `(Pagado ✓)` : (balanceVal > 0 ? `(Adeuda: $${balanceVal.toLocaleString('es-MX')})` : `(Pagado ✓)`);
        
        text += `   ${idx + 1}. *Hab ${room}* - ${r.guest_name || 'Sin nombre'} (${paxTotal} pax) - Canal: ${r.channel || 'Directo'} ${balanceStr}\n`;
      });
    }
    text += `\n`;

    // --- SALEN HOY ---
    text += `🚪 *SALEN HOY (${salen.length})*\n`;
    if (salen.length === 0) {
      text += `   _Sin salidas programadas_\n`;
    } else {
      salen.forEach((r, idx) => {
        const room = getUnitDisplay(r.room_name || r.room || '');
        const status = r.checked_out ? 'Salida completada ✓' : 'Pendiente ⏳';
        text += `   ${idx + 1}. *Hab ${room}* - ${r.guest_name || 'Sin nombre'} - Estado: ${status}\n`;
      });
    }
    text += `\n`;

    // --- EN CASA ---
    text += `🏠 *EN CASA (${enCasa.length})*\n`;
    if (enCasa.length === 0) {
      text += `   _Sin huéspedes hospedados_\n`;
    } else {
      enCasa.forEach((r, idx) => {
        const room = getUnitDisplay(r.room_name || r.room || '');
        let checkoutText = r.check_out;
        try {
          checkoutText = format(new Date(r.check_out + 'T12:00:00'), 'dd MMM', { locale: es });
        } catch (e) { }
        text += `   ${idx + 1}. *Hab ${room}* - ${r.guest_name || 'Sin nombre'} - Sale: ${checkoutText}\n`;
      });
    }
    text += `\n`;

    // --- TARIFAS ESTACIONALES DINÁMICAS ---
    const todayISO = getLocalDateStr(new Date());
    const currentSeason = getSeason(todayISO);
    const seasonLabels: Record<string, string> = {
      baja: 'BAJA',
      media: 'MEDIA',
      media_alta: 'MEDIA-ALTA',
      alta: 'ALTA'
    };

    // Tarifas de fallback por defecto (con impuestos +19% e indexadas por temporada)
    let doublePrice = 2000;
    let cond1Price = 3000;
    let cond2Price = 4000;
    let cond3Price = 6000;
    let casaPrice = 8000;

    const seasonFallbacks: Record<string, { double: number; cond1: number; cond2: number; cond3: number; casa: number }> = {
      baja: { double: 1600, cond1: 2400, cond2: 3200, cond3: 4800, casa: 6400 },
      media: { double: 1900, cond1: 2850, cond2: 3800, cond3: 5700, casa: 7600 },
      media_alta: { double: 2000, cond1: 3000, cond2: 4000, cond3: 6000, casa: 8000 },
      alta: { double: 2200, cond1: 3300, cond2: 4400, cond3: 6600, casa: 8800 }
    };

    const fallbacks = seasonFallbacks[currentSeason] || seasonFallbacks.media_alta;
    doublePrice = fallbacks.double;
    cond1Price = fallbacks.cond1;
    cond2Price = fallbacks.cond2;
    cond3Price = fallbacks.cond3;
    casaPrice = fallbacks.casa;

    try {
      const resPrices = await fetch('/api/beds24-prices?t=' + Date.now());
      const jsonPrices = await resPrices.json();
      if (jsonPrices.success && Array.isArray(jsonPrices.rooms)) {
        const getPriceForToday = (roomId: string) => {
          const roomObj = jsonPrices.rooms.find((r: any) => r.id === roomId);
          if (roomObj && Array.isArray(roomObj.seasonBlocks)) {
            const matchedBlock = roomObj.seasonBlocks.find((b: any) => todayISO >= b.from && todayISO <= b.to);
            if (matchedBlock) return matchedBlock.priceDirecto;
            
            const seasonBlock = roomObj.seasonBlocks.find((b: any) => b.season === currentSeason);
            if (seasonBlock) return seasonBlock.priceDirecto;
          }
          return null;
        };

        doublePrice = getPriceForToday('679077') || doublePrice;
        cond1Price = getPriceForToday('679087') || cond1Price;
        cond2Price = getPriceForToday('679091') || cond2Price;
        cond3Price = getPriceForToday('679092') || cond3Price;
        casaPrice = getPriceForToday('679093') || casaPrice;
      }
    } catch (e) {
      console.warn("No se pudieron cargar tarifas de Ajustes, usando fallback:", e);
    }

    const label = seasonLabels[currentSeason] || 'MEDIA-ALTA';
    text += `💰 *TARIFA TEMP ${label}*\n`;
    text += `• Habitación doble: $${doublePrice}\n`;
    text += `• Condominio 1 dormitorio: $${cond1Price}\n`;
    text += `• Condominio 2 dormitorios: $${cond2Price}\n`;
    text += `• Condominio 3 dormitorios: $${cond3Price}\n`;
    text += `• Casa vacacional: $${casaPrice}\n\n`;

    text += `_Generado automáticamente desde Jaroje OS para contingencia offline_`;

    navigator.clipboard.writeText(text).then(() => {
      setToastMsg('📋 ¡Reporte copiado! Pegar en WhatsApp');
      setTimeout(() => setToastMsg(''), 4000);
    }).catch(err => {
      console.error("Error al copiar al portapapeles:", err);
      alert("No se pudo copiar el reporte automáticamente. Por favor copia el texto manualmente.");
    });

    window.open('https://chat.whatsapp.com/BiuXSGpiTVL92fjPEsHbma?s=hd&p=i&ilr=0', '_blank');
  };

  useEffect(() => {
    const today = getLocalDateStr();
    setTodayStr(today);
    setHoy(format(new Date(), "EEEE, d MMM", { locale: es }));
    fetchAll(false);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchAll(false);
      }
    }, 45000);
    return () => clearInterval(interval);
  }, []);
  const llegadasHoy = useMemo(() => {
    return reservas
      .filter(r => r.check_out >= todayStr && r.check_in <= todayStr && !r.checked_in && !r.checked_out && r.status !== 'cancelled')
      .sort((a, b) => {
        const roomA = getUnitDisplay(a.room_name || a.room || '');
        const roomB = getUnitDisplay(b.room_name || b.room || '');
        const numA = parseInt(roomA.replace(/\D/g, ''), 10) || 9999;
        const numB = parseInt(roomB.replace(/\D/g, ''), 10) || 9999;
        return numA - numB;
      });
  }, [reservas, todayStr]);

  const todasLlegadasHoy = useMemo(() => {
    return reservas
      .filter(r => r.status !== 'cancelled' && r.check_in === todayStr)
      .sort((a, b) => {
        const roomA = getUnitDisplay(a.room_name || a.room || '');
        const roomB = getUnitDisplay(b.room_name || b.room || '');
        const numA = parseInt(roomA.replace(/\D/g, ''), 10) || 9999;
        const numB = parseInt(roomB.replace(/\D/g, ''), 10) || 9999;
        return numA - numB;
      });
  }, [reservas, todayStr]);

  const salidasHoy = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() - 5);
    const limitStr = limit.toISOString().split('T')[0];
    return reservas
      .filter(r => r.check_out <= todayStr && r.check_out >= limitStr && r.checked_in && !r.checked_out && r.status !== 'cancelled')
      .sort((a, b) => {
        const roomA = getUnitDisplay(a.room_name || a.room || '');
        const roomB = getUnitDisplay(b.room_name || b.room || '');
        const numA = parseInt(roomA.replace(/\D/g, ''), 10) || 9999;
        const numB = parseInt(roomB.replace(/\D/g, ''), 10) || 9999;
        return numA - numB;
      });
  }, [reservas, todayStr]);

  const todasSalidasHoy = useMemo(() => {
    return reservas
      .filter(r => r.status !== 'cancelled' && r.check_out === todayStr)
      .sort((a, b) => {
        const roomA = getUnitDisplay(a.room_name || a.room || '');
        const roomB = getUnitDisplay(b.room_name || b.room || '');
        const numA = parseInt(roomA.replace(/\D/g, ''), 10) || 9999;
        const numB = parseInt(roomB.replace(/\D/g, ''), 10) || 9999;
        return numA - numB;
      });
  }, [reservas, todayStr]);
  const proximasLlegadas = reservas.filter(r => r.check_in > todayStr && r.status !== 'cancelled').slice(0, 5);

  // WhatsApp — semáforo de urgencia
  const findAllReservationsForContact = (phone: string, name: string) => {
    const clean = (p: string) => p.replace(/\D/g, '');
    const pClean = clean(phone || '');
    
    const today = new Date().toLocaleDateString('sv-SE');
    const activeFuture = reservas.filter(r => r.check_out >= today && r.status !== 'cancelled');
    
    const matched = activeFuture.filter(r => {
      const rPhone = clean(r.phone || r.mobile || r.guest_phone || '');
      if (pClean.length < 7 || rPhone.length < 7) return false;
      // Comparación flexible de los últimos dígitos según el tamaño del número más corto (máximo 10 dígitos)
      const minLen = Math.min(pClean.length, rPhone.length, 10);
      const lastP = pClean.slice(-minLen);
      const lastR = rPhone.slice(-minLen);
      return lastP === lastR;
    });

    return matched;
  };

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
    .sort((a, b) => a.minutesSince - b.minutesSince); // más recientes primero

  const getUrgencyColor = (mins: number) => {
    if (mins > 120) return { dot: 'bg-red-500', bg: 'bg-red-50 border-red-100', text: 'text-red-700', label: 'Sin respuesta' };
    if (mins > 30) return { dot: 'bg-amber-400', bg: 'bg-amber-50 border-amber-100', text: 'text-amber-700', label: 'Pendiente' };
    return { dot: 'bg-emerald-500', bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700', label: 'Activo' };
  };

  const totalRevenue = reservas.reduce((s, r) => s + (r.price_estimate || 0), 0);
  const activeNow = reservas.filter(r => r.check_out > todayStr && r.checked_in).length;

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
        <button onClick={() => fetchAll(false, true)} disabled={isLoading}
          className="w-9 h-9 flex items-center justify-center bg-white border border-zinc-200 rounded-xl shadow-sm hover:bg-zinc-50 active:scale-95 transition-all">
          <RefreshCw size={15} className={`text-zinc-500 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Token error banner */}
      {tokenError && (
        <div className={`border rounded-2xl p-4 space-y-3 ${tokenError === 'REFRESH_TOKEN_EXPIRED'
          ? 'bg-rose-50 border-rose-200'
          : 'bg-amber-50 border-amber-200'
          }`}>
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className={`shrink-0 mt-0.5 ${tokenError === 'REFRESH_TOKEN_EXPIRED' ? 'text-rose-600' : 'text-amber-600'}`} />
            <div className="flex-1">
              {tokenError === 'REFRESH_TOKEN_EXPIRED' ? (
                <>
                  <p className="text-[13px] font-bold text-rose-800">🔴 Refresh token de Beds24 caducado</p>
                  <p className="text-[11px] text-rose-700 mt-1">
                    El token de renovación automática ha expirado. Necesitas generar uno nuevo en Beds24:
                  </p>
                  <ol className="text-[11px] text-rose-700 mt-1.5 space-y-0.5 list-decimal list-inside">
                    <li>Ve a <strong>Beds24 → Marketplace → API</strong></li>
                    <li>Genera un nuevo <strong>Refresh Token</strong></li>
                    <li>Pégalo aquí abajo y guarda</li>
                  </ol>
                </>
              ) : (
                <>
                  <p className="text-[13px] font-bold text-amber-800">⚠️ Token Beds24 caducado</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">Intentando renovar automáticamente...</p>
                </>
              )}
            </div>
            {tokenError === 'TOKEN_EXPIRED' && (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/beds24-auth/refresh', { method: 'POST' });
                    const json = await res.json();
                    if (json.success) {
                      setTokenError(false);
                      fetchAll();
                    } else if (json.error === 'REFRESH_TOKEN_EXPIRED' || json.error?.includes('REFRESH')) {
                      setTokenError('REFRESH_TOKEN_EXPIRED');
                    } else {
                      alert('Error al intentar renovar el token: ' + (json.error || 'Error desconocido') + '\n\nPor favor intenta de nuevo.');
                    }
                  } catch (e: any) {
                    alert('Error de red al intentar renovar el token:\n' + (e.message || 'Error de conexión') + '\n\nPor favor intenta de nuevo.');
                  }
                }}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-extrabold rounded-xl shrink-0 cursor-pointer transition-colors"
              >
                Reintentar
              </button>
            )}
          </div>

          {/* Campo para pegar nuevo refresh token */}
          {tokenError === 'REFRESH_TOKEN_EXPIRED' && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Pega aquí el nuevo Refresh Token de Beds24..."
                value={newRefreshToken}
                onChange={e => setNewRefreshToken(e.target.value)}
                className="w-full px-3 py-2.5 text-[12px] font-mono border border-rose-200 bg-white rounded-xl outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 placeholder:text-zinc-300"
              />
              <button
                disabled={!newRefreshToken.trim() || savingToken}
                onClick={async () => {
                  setSavingToken(true);
                  try {
                    const res = await fetch('/api/beds24-auth/update-token', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ refreshToken: newRefreshToken.trim() }),
                    });
                    const json = await res.json();
                    if (json.success) {
                      setTokenError(false);
                      setNewRefreshToken('');
                      fetchAll();
                    } else {
                      alert('Error al guardar el token:\n' + json.error);
                    }
                  } catch (e) {
                    alert('Error de red al guardar el token.');
                  } finally {
                    setSavingToken(false);
                  }
                }}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-[12px] font-extrabold rounded-xl cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                {savingToken ? 'Guardando...' : '💾 Guardar nuevo token y reconectar'}
              </button>
            </div>
          )}
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
          <p className="text-[20px] font-bold text-emerald-600">
            {todasLlegadasHoy.length}
          </p>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Llegan hoy</p>
        </button>
        <button
          onClick={() => setKpiModalType('salen')}
          className="bg-white border border-zinc-200/80 rounded-2xl p-3 text-center shadow-sm cursor-pointer hover:bg-zinc-50/50 hover:border-zinc-300 active:scale-95 transition-all outline-none"
        >
          <p className="text-[20px] font-bold text-amber-500">
            {todasSalidasHoy.length}
          </p>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Salen hoy</p>
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
              const convRes = findAllReservationsForContact(c.guest_phone, c.guest_name);
              const primaryRes = convRes[0] || null;
              const displayName = primaryRes ? primaryRes.guest_name : c.guest_name;
              const hasDifferentWaName = primaryRes && c.guest_name && primaryRes.guest_name.toLowerCase() !== c.guest_name.toLowerCase();

              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/bot?chatId=${c.id}`)}
                  className={`border rounded-2xl p-4 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-all ${urgency.bg}`}
                >
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-white border border-zinc-200 flex items-center justify-center">
                      <span className="text-[13px] font-bold text-zinc-700">
                        {(displayName || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${urgency.dot}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[14px] font-bold text-zinc-900 truncate flex items-center gap-1.5">
                        <span className="truncate">{displayName}</span>
                        {hasDifferentWaName && (
                          <span className="text-[11px] text-zinc-400 font-normal truncate max-w-[90px] shrink-0">
                            ({c.guest_name})
                          </span>
                        )}
                      </p>
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
          <div className="flex items-center gap-3">
            <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <ArrowDownLeft size={13} className="text-emerald-500" />
              Pendientes Check-In
            </h3>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-100">
              {llegadasHoy.length} pendientes
            </span>
          </div>
        </div>

        <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
            </div>
          ) : llegadasHoy.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">No hay check-ins pendientes.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/30">
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Unidad</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Acción</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Huésped</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Canal</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Teléfono</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Pax</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Noches</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Total</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Tarifa</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Adeudo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {llegadasHoy.map(r => {
                    const paxTotal = (r.num_adult || 1) + (r.num_child || 0);
                    const unit = getUnitDisplay(r.room || r.room_name || '');
                    const dailyRate = r.price_per_night || (r.price_estimate && r.nights ? Math.round(r.price_estimate / r.nights) : 0);
                    const balanceVal = r.balance !== undefined ? r.balance : ((r.price_estimate || 0) - (r.deposit || 0));
                    const isOTA = ['booking.com', 'airbnb', 'expedia'].some(c => (r.channel || '').toLowerCase().includes(c));
                    return (
                      <tr
                        key={r.id}
                        onClick={() => router.push(`/reservas?id=${r.id}`)}
                        className="hover:bg-zinc-50/50 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center justify-center font-extrabold text-[12px] bg-zinc-900 text-white rounded-lg px-2.5 py-1 min-w-[36px]">
                            {unit}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {r.checked_in ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-100">
                              <CheckCircle2 size={12} /> En Casa
                            </span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/recepcion?checkin=${r.id}`);
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] py-1.5 px-3 rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                            >
                              Check-In
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4 font-semibold text-zinc-950 text-[13px] max-w-[140px] truncate">
                          {r.guest_name}
                        </td>
                        <td className="py-3 px-4">
                          {(() => {
                            const ch = (r.channel || '').toLowerCase();
                            if (ch.includes('airbnb')) return <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 whitespace-nowrap">🏠 Airbnb</span>;
                            if (ch.includes('booking')) return <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">🔵 Booking</span>;
                            if (ch.includes('expedia')) return <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 whitespace-nowrap">✈️ Expedia</span>;
                            return <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">✅ Directa</span>;
                          })()}
                        </td>
                        <td className="py-3 px-4 text-[12px] text-zinc-500 font-medium">
                          {r.guest_phone ? (
                            <a
                              href={`https://wa.me/${r.guest_phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 hover:text-emerald-600 transition-colors"
                            >
                              <Phone size={11} className="text-emerald-500" />
                              {r.guest_phone}
                            </a>
                          ) : (
                            <span className="text-zinc-300">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center text-[12px] font-semibold text-zinc-700">
                          <span className="inline-flex items-center gap-1">
                            <Users size={12} className="text-zinc-400" />
                            {paxTotal}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-[12px] font-semibold text-zinc-700">
                          <span className="inline-flex items-center gap-1">
                            <Moon size={12} className="text-zinc-400" />
                            {r.nights || 1}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-zinc-900 text-[13px]">
                          ${r.price_estimate?.toLocaleString('es-MX') || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-zinc-600 text-[13px]">
                          ${dailyRate.toLocaleString('es-MX') || '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-[13px]">
                          {isOTA ? (
                            <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                              $0.00
                            </span>
                          ) : balanceVal > 0 ? (
                            <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                              ${balanceVal.toLocaleString('es-MX')}
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                              $0.00
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. SALIDAS HOY ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <ArrowUpRight size={13} className="text-amber-500" />
              Pendientes por Salir
            </h3>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-100">
              {salidasHoy.length} pendientes
            </span>
          </div>
        </div>

        <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
            </div>
          ) : salidasHoy.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">
              No hay salidas pendientes para hoy.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/30">
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Unidad</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Acción</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Huésped</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Teléfono</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Noches</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Total</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Tarifa</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {salidasHoy.map(r => {
                    const unit = getUnitDisplay(r.room || r.room_name || '');
                    const isPending = !r.checked_out;
                    const dailyRate = r.price_per_night || (r.price_estimate && r.nights ? Math.round(r.price_estimate / r.nights) : 0);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => router.push(`/reservas?id=${r.id}`)}
                        className="hover:bg-zinc-50/50 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center justify-center font-extrabold text-[12px] bg-zinc-900 text-white rounded-lg px-2.5 py-1 min-w-[36px]">
                            {unit}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isPending ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/recepcion?checkout=${r.id}`);
                              }}
                              className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[11px] py-1.5 px-3 rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                            >
                              Dar Salida
                            </button>
                          ) : (
                            <span className="text-[11px] text-zinc-400 font-bold">Listo ✓</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-semibold text-zinc-950 text-[13px] max-w-[140px] truncate">
                          {r.guest_name}
                        </td>
                        <td className="py-3 px-4 text-[12px] text-zinc-500 font-medium">
                          {r.guest_phone ? (
                            <a
                              href={`https://wa.me/${r.guest_phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 hover:text-emerald-600 transition-colors"
                            >
                              <Phone size={11} className="text-emerald-500" />
                              {r.guest_phone}
                            </a>
                          ) : (
                            <span className="text-zinc-300">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center text-[12px] font-semibold text-zinc-700">
                          {r.nights || 1}n
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-zinc-900 text-[13px]">
                          ${r.price_estimate?.toLocaleString('es-MX') || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-zinc-600 text-[13px]">
                          ${dailyRate.toLocaleString('es-MX') || '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {r.checked_out ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-xl border border-zinc-200">
                              Completado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-100">
                              <CircleDot size={10} className="animate-pulse" /> Pendiente Out
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
          <button
            onClick={handleCopyDailyReport}
            className="bg-white border border-zinc-200 rounded-2xl p-4 flex flex-col items-center gap-2 text-center hover:bg-zinc-50 hover:border-emerald-200 active:scale-[0.97] transition-all shadow-sm group cursor-pointer outline-none"
          >
            <MessageCircle size={20} className="text-emerald-600 group-hover:scale-110 transition-transform" strokeWidth={2.5} />
            <span className="text-[12px] font-bold text-zinc-800 leading-tight">Resumen Diario</span>
          </button>
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
            {/* DISPONIBLES: habitaciones con checkout hoy pero SIN reserva por llegar → número fijo del día */}
            <div 
              onClick={() => setKpiModalType('disponibles')}
              className="bg-emerald-50/50 border-2 border-emerald-500 rounded-xl p-2 text-center shadow-sm cursor-pointer hover:bg-emerald-100/60 active:scale-95 transition-all"
            >
              <span className="text-[15px] font-black text-emerald-700">
                {ROOMS.filter(r => {
                  if (r === '500') return false;
                  const dbStatus = getRoomDbStatus(r, roomStatuses);
                  const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
                  const s = getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);
                  return s === 'disponible';
                }).length}
              </span>
              <p className="text-[7.2px] font-black text-emerald-600 uppercase tracking-wider mt-0.5">Disponibles</p>
            </div>
            {/* LIMP PROGRAMADA: habitaciones con limpieza de estancia programada hoy → número fijo del día */}
            <div 
              onClick={() => setKpiModalType('programada')}
              className="bg-amber-50/50 border-2 border-amber-500 rounded-xl p-2 text-center shadow-sm cursor-pointer hover:bg-amber-100/60 active:scale-95 transition-all"
            >
              <span className="text-[15px] font-black text-amber-700">
                {ROOMS.filter(r => {
                  if (r === '500') return false;
                  const dbStatus = getRoomDbStatus(r, roomStatuses);
                  const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
                  const s = getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);
                  return s === 'limpieza_programada';
                }).length}
              </span>
              <p className="text-[7.2px] font-black text-amber-600 uppercase tracking-wider mt-0.5">Limp. Programada</p>
            </div>
            {/* CHECK OUT: habitaciones pendientes de checkout o checkout registrado (rojo claro + rojo fuerte) → decremental */}
            <div 
              onClick={() => setKpiModalType('checkout')}
              className="bg-rose-50/50 border-2 border-rose-500 rounded-xl p-2 text-center shadow-sm cursor-pointer hover:bg-rose-100/60 active:scale-95 transition-all"
            >
              <span className="text-[15px] font-black text-rose-700">
                {ROOMS.filter(r => {
                  if (r === '500') return false;
                  const dbStatus = getRoomDbStatus(r, roomStatuses);
                  const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
                  const s = getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);
                  return s === 'sucio_checkout' || s === 'salida_hoy';
                }).length}
              </span>
              <p className="text-[7.2px] font-black text-rose-600 uppercase tracking-wider mt-0.5">Check Out</p>
            </div>
            {/* LIMP TERMINADA: habitaciones en estado limpia (azul) → incremental durante el día */}
            <div 
              onClick={() => setKpiModalType('terminada')}
              className="bg-blue-50/50 border-2 border-blue-500 rounded-xl p-2 text-center shadow-sm cursor-pointer hover:bg-blue-100/60 active:scale-95 transition-all"
            >
              <span className="text-[15px] font-black text-blue-700">
                {ROOMS.filter(r => {
                  if (r === '500') return false;
                  const dbStatus = getRoomDbStatus(r, roomStatuses);
                  const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
                  const s = getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);
                  // Limpieza terminada = azul: limpia de checkout CON reserva entrante pendiente de check-in
                  return s === 'limpia';
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
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-none">
                      {row.label}
                    </span>
                    {row.isLocal && (
                      <span className="text-[8px] font-black bg-blue-50 text-blue-600 border border-blue-150 px-1 py-0.5 rounded uppercase tracking-wider leading-none">
                        Local
                      </span>
                    )}
                  </div>
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
                      colorClasses = 'bg-blue-600 text-white border-blue-700 shadow-blue-100/30 font-extrabold';
                      dotClass = 'bg-blue-250';
                    } else if (operStatus === 'sucio_checkout') {
                      colorClasses = 'bg-red-600 text-white border-red-700 shadow-red-200/50 font-black';
                      dotClass = 'bg-red-300';
                    } else if (operStatus === 'salida_hoy') {
                      colorClasses = 'bg-rose-100 text-rose-800 border-rose-300 shadow-rose-50/20 font-bold';
                      dotClass = 'bg-rose-400';
                    } else if (operStatus === 'en_limpieza' || operStatus === 'limpieza_programada') {
                      colorClasses = 'bg-amber-400 text-amber-950 border-amber-500 shadow-amber-100/30 font-extrabold';
                      dotClass = 'bg-amber-250';
                    } else if (operStatus === 'ocupada') {
                      colorClasses = 'bg-zinc-100 text-zinc-800 border-zinc-300 shadow-sm font-extrabold hover:bg-zinc-200';
                      dotClass = 'bg-zinc-400';
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
                        className={`aspect-square rounded-2xl border-[3px] flex flex-col items-center justify-center cursor-pointer shadow-sm hover:scale-[1.06] active:scale-[0.94] transition-all text-center ${colorClasses}`}
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
                        const activeRes = reservas.find(r => {
                          const rRoom = String(r.room || '').replace(/[\s()]/g, '');
                          const matches = rRoom.includes(selectedRoomForStatus.room_number);
                          const isActiveToday = (r.check_in <= todayStr && r.check_out > todayStr) || (r.check_in === todayStr);
                          return matches && isActiveToday && !r.checked_out;
                        });

                        if (activeRes) {
                          const checkInFormatted = activeRes.check_in ? format(new Date(activeRes.check_in + 'T12:00:00'), 'd MMM', { locale: es }) : '—';
                          const checkOutFormatted = activeRes.check_out ? format(new Date(activeRes.check_out + 'T12:00:00'), 'd MMM', { locale: es }) : '—';

                          return (
                            <div className="w-full border border-zinc-200/80 rounded-[24px] p-5 space-y-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] bg-white text-left font-sans">
                              {/* Fila 1: Nombre y Habitación */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h4 className="text-[17px] font-black text-zinc-900 leading-tight truncate">{activeRes.guest_name}</h4>
                                  <p className="text-[11px] font-extrabold text-zinc-400 mt-0.5 uppercase tracking-wider leading-none">ID: {activeRes.id}</p>
                                </div>
                                <span className="bg-zinc-950 text-white font-bold text-[12px] px-3.5 py-2 rounded-xl text-right inline-block max-w-[170px] truncate leading-none">
                                  {activeRes.room_name || activeRes.room}
                                </span>
                              </div>

                              {/* Fila 2: Estancia y Canal */}
                              <div className="grid grid-cols-2 gap-4 border-t border-zinc-100 pt-4">
                                <div>
                                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 block">Estancia</span>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="bg-zinc-50 border border-zinc-200/80 px-2.5 py-1.5 rounded-lg text-[13px] font-bold text-zinc-800 leading-none">
                                      {checkInFormatted}
                                    </span>
                                    <span className="text-zinc-400 font-bold">→</span>
                                    <span className="bg-zinc-50 border border-zinc-200/80 px-2.5 py-1.5 rounded-lg text-[13px] font-bold text-zinc-800 leading-none">
                                      {checkOutFormatted}
                                    </span>
                                    <span className="bg-zinc-950 text-white font-black text-[10.5px] px-2 py-0.5 rounded-full shrink-0 leading-none">
                                      {activeRes.nights}n
                                    </span>
                                  </div>
                                </div>

                                <div>
                                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 block">Canal / Origen</span>
                                  <span className="bg-zinc-50 border border-zinc-200/80 px-3.5 py-1.5 rounded-full text-[13px] font-bold text-zinc-800 inline-block leading-none">
                                    {activeRes.channel || 'Directo'}
                                  </span>
                                </div>
                              </div>

                              {/* Fila 3: Acciones (WhatsApp) */}
                              {activeRes.guest_phone && (
                                <div className="flex justify-end pt-1">
                                  <a
                                    href={`https://wa.me/${activeRes.guest_phone.replace(/\D/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="border border-emerald-250 hover:bg-emerald-50 text-emerald-600 font-bold text-[12.5px] px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                                  >
                                    <Phone size={13} className="text-emerald-500 fill-emerald-500/10" />
                                    <span>WhatsApp</span>
                                  </a>
                                </div>
                              )}
                            </div>
                          );
                        }

                        bg = 'bg-zinc-100 text-zinc-500 border-zinc-200';
                        label = '⚪ Ocupada / Reservada';
                        desc = 'La habitación cuenta con una estancia activa o una llegada programada para el día de hoy, por lo que no está disponible para nuevos walk-ins.';
                      } else if (operStatus === 'salida_hoy') {
                        bg = 'bg-rose-50/90 text-rose-700 border-rose-200';
                        label = '🔴 Esperando Salida (Check-Out Hoy)';
                        desc = 'El huésped tiene salida programada para hoy. En espera de confirmar Check-Out en Recepción para iniciar limpieza profunda de salida.';
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
                    {/* Botones rápidos de control de estatus para el Administrador */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleUpdateRoomStatus('disponible')}
                        className="py-3 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>🟢 Marcar Disponible</span>
                      </button>
                      <button
                        onClick={() => handleUpdateRoomStatus('limpia')}
                        className="py-3 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-bold text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>🔵 Marcar Limpia (Azul)</span>
                      </button>
                      <button
                        onClick={() => handleUpdateRoomStatus('en_limpieza')}
                        className="py-3 px-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl font-bold text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>🟡 Iniciar Limpieza</span>
                      </button>
                      <button
                        onClick={() => handleUpdateRoomStatus('sucio_checkout')}
                        className="py-3 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>🔴 Marcar Sucio / Check Out</span>
                      </button>
                    </div>

                    {/* Botón especial: Programar limpieza en habitación ocupada o disponible */}
                    {(operStatus === 'ocupada' || operStatus === 'disponible') && (
                      <button
                        onClick={() => handleUpdateRoomStatus('limpieza_programada')}
                        className="w-full py-3.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 rounded-xl font-extrabold text-[12px] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.98]"
                      >
                        <span>🧹 Programar Limpieza Hoy</span>
                      </button>
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
        let roomFiltered: string[] = [];
        let isCleaningKpi = false;

        if (kpiModalType === 'encasa') {
          title = 'Huéspedes En Casa';
          badgeColor = 'bg-zinc-900 text-white';
          filtered = reservas.filter(r => r.check_out > todayStr && r.checked_in);
        } else if (kpiModalType === 'llegan') {
          title = 'Llegadas Hoy';
          badgeColor = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
          filtered = todasLlegadasHoy;
        } else if (kpiModalType === 'salen') {
          title = 'Salidas Hoy';
          badgeColor = 'bg-zinc-150 text-zinc-700 border border-zinc-200';
          filtered = todasSalidasHoy;
        } else if (kpiModalType === 'disponibles') {
          title = 'Habitaciones Disponibles';
          badgeColor = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
          isCleaningKpi = true;
          roomFiltered = ROOMS.filter(r => {
            if (r === '500') return false;
            const dbStatus = getRoomDbStatus(r, roomStatuses);
            const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
            const s = getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);
            return s === 'disponible';
          });
        } else if (kpiModalType === 'programada') {
          title = 'Limpiezas Programadas';
          badgeColor = 'bg-amber-100 text-amber-800 border border-amber-200';
          isCleaningKpi = true;
          roomFiltered = ROOMS.filter(r => {
            if (r === '500') return false;
            const dbStatus = getRoomDbStatus(r, roomStatuses);
            const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
            const s = getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);
            return s === 'limpieza_programada';
          });
        } else if (kpiModalType === 'checkout') {
          title = 'Check Out / Salidas';
          badgeColor = 'bg-rose-100 text-rose-800 border border-rose-200';
          isCleaningKpi = true;
          roomFiltered = ROOMS.filter(r => {
            if (r === '500') return false;
            const dbStatus = getRoomDbStatus(r, roomStatuses);
            const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
            const s = getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);
            return s === 'sucio_checkout' || s === 'salida_hoy';
          });
        } else if (kpiModalType === 'terminada') {
          title = 'Limpiezas Terminadas';
          badgeColor = 'bg-blue-100 text-blue-800 border border-blue-200';
          isCleaningKpi = true;
          roomFiltered = ROOMS.filter(r => {
            if (r === '500') return false;
            const dbStatus = getRoomDbStatus(r, roomStatuses);
            const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
            const s = getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);
            return s === 'limpia';
          });
        }

        // Ordenar el listado por número de habitación estrictamente numérico
        const sortedFiltered = [...filtered].sort((a, b) => {
          const roomA = getUnitDisplay(a.room_name || a.room || '');
          const roomB = getUnitDisplay(b.room_name || b.room || '');
          return roomA.localeCompare(roomB, undefined, { numeric: true });
        });

        const sortedRooms = [...roomFiltered].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const totalCount = isCleaningKpi ? sortedRooms.length : sortedFiltered.length;

        return (
          <div className="fixed inset-0 z-[9999] flex flex-col justify-end bg-zinc-950/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div onClick={() => setKpiModalType(null)} className="absolute inset-0" />
            <div className="relative bg-white rounded-t-[32px] shadow-2xl p-6 space-y-4 animate-in slide-in-from-bottom-8 duration-300 w-full max-w-md mx-auto max-h-[85vh] flex flex-col">

              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-zinc-900">{title}</h3>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${badgeColor}`}>
                    {totalCount}
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
                {isCleaningKpi ? (
                  sortedRooms.length === 0 ? (
                    <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">
                      No hay habitaciones en esta categoría para hoy.
                    </div>
                  ) : (
                    sortedRooms.map(roomNum => {
                      const dbStatus = getRoomDbStatus(roomNum, roomStatuses);
                      const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(roomNum));
                      const operStatus = getRoomOperationalStatus(roomNum, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);
                      const categoryLabel = getRoomCategoryLabel(roomNum);

                      let statusBadge = {
                        label: 'Disponible',
                        classes: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-black',
                        dot: 'bg-emerald-500'
                      };
                      if (operStatus === 'salida_hoy') {
                        statusBadge = { label: 'Salida Hoy (Pendiente)', classes: 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold', dot: 'bg-rose-500' };
                      } else if (operStatus === 'sucio_checkout') {
                        statusBadge = { label: 'Check Out Registrado', classes: 'bg-red-600 text-white border-red-700 font-black', dot: 'bg-white' };
                      } else if (operStatus === 'limpieza_programada' || isRoomStayoverServiceScheduled(roomNum, reservas, todayStr)) {
                        statusBadge = { label: 'Limpieza Programada', classes: 'bg-amber-400 text-amber-950 border-amber-500 font-black', dot: 'bg-amber-900' };
                      } else if (operStatus === 'limpia') {
                        statusBadge = { label: 'Limpieza Finalizada', classes: 'bg-blue-600 text-white border-blue-700 font-extrabold', dot: 'bg-white' };
                      }

                      return (
                        <div
                          key={roomNum}
                          onClick={() => {
                            setKpiModalType(null);
                            setSelectedRoomForStatus({
                              room: roomNum,
                              room_number: roomNum,
                              operStatus: operStatus,
                              status: operStatus,
                              updated_at: dbStatusObj?.updated_at,
                              updated_by: dbStatusObj?.updated_by
                            });
                            setShowRoomStatusModal(true);
                          }}
                          className="p-4 border border-zinc-150 rounded-2xl hover:border-zinc-300 hover:bg-zinc-50/50 transition-all cursor-pointer flex items-center justify-between"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[15px] font-black text-zinc-900">Habitación {roomNum}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusBadge.classes}`}>
                                {statusBadge.label}
                              </span>
                            </div>
                            <p className="text-[11px] font-medium text-zinc-500">{categoryLabel}</p>
                          </div>
                          <span className="text-[12px] font-bold text-blue-600 hover:underline">Ver detalle →</span>
                        </div>
                      );
                    })
                  )
                ) : (
                  sortedFiltered.map(r => {
                    const roomNum = getUnitDisplay(r.room_name || r.room || '');
                    const dbStatus = getRoomDbStatus(roomNum, roomStatuses);
                    const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(roomNum));
                    const operStatus = getRoomOperationalStatus(roomNum, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);

                    let statusBadge = {
                      label: 'En Casa',
                      classes: 'bg-zinc-100 text-zinc-800 border-zinc-300 font-extrabold',
                      dot: 'bg-zinc-400'
                    };
                    if (operStatus === 'salida_hoy') {
                      statusBadge = { label: 'Pendiente check out', classes: 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold', dot: 'bg-rose-500' };
                    } else if (operStatus === 'sucio_checkout') {
                      statusBadge = { label: 'Check out registrado', classes: 'bg-red-600 text-white border-red-700 font-black', dot: 'bg-white' };
                    } else if (operStatus === 'limpieza_programada' || isRoomStayoverServiceScheduled(roomNum, reservas, todayStr)) {
                      statusBadge = { label: 'Limpieza programada', classes: 'bg-amber-400 text-amber-950 border-amber-500 font-black', dot: 'bg-amber-900' };
                    } else if (operStatus === 'limpia' || operStatus === 'disponible') {
                      statusBadge = { label: 'Limpieza finalizada', classes: 'bg-blue-600 text-white border-blue-700 font-extrabold', dot: 'bg-white' };
                    }

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
                          <span className="text-[12px] font-black bg-zinc-900 text-white px-3 py-1 rounded-xl shadow-sm">
                            Hab {roomNum || 'Sin asign'}
                          </span>
                        </div>

                        {/* Botón / Badge de Estado del Mapa de Limpieza */}
                        <div className="pt-0.5">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-xl border shadow-2xs ${statusBadge.classes}`}>
                            <span className={`w-2 h-2 rounded-full ${statusBadge.dot}`} />
                            <span>{statusBadge.label}</span>
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-[12px] pt-1.5 border-t border-zinc-100">
                          <div>
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Estancia</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[11px] font-bold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                                {format(new Date(r.check_in + 'T12:00:00'), 'dd MMM', { locale: es })}
                              </span>
                              <span className="text-zinc-400 text-[10px] font-bold">➔</span>
                              <span className="text-[11px] font-bold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                                {format(new Date(r.check_out + 'T12:00:00'), 'dd MMM', { locale: es })}
                              </span>
                              <span className="text-[9px] font-black bg-zinc-900 text-white px-2 py-0.5 rounded-full">
                                {nightsVal}n
                              </span>
                            </div>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Canal / Origen</span>
                            <p className="font-bold text-zinc-800 bg-zinc-100/50 border border-zinc-100 px-2.5 py-0.5 rounded-xl w-fit">
                              {r.channel || 'Directo'}
                            </p>
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

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] bg-zinc-900/95 text-white text-[13px] font-bold py-3.5 px-6 rounded-2xl shadow-2xl backdrop-blur-md border border-zinc-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

    </div>
  );
}
