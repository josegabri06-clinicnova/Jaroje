"use client";

import { useEffect, useState, useRef, useMemo } from 'react';
import { format, addDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  CheckCircle2, ArrowDownLeft, ArrowUpRight, BedDouble,
  User, UserPlus, Camera, Upload, Wallet, X, Plus, Sparkles, Wrench, AlertTriangle, Send, Package, Minus,
  ShieldAlert, Lock, Unlock, Phone, Calendar, Moon, Users, CircleDot, ChevronDown
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import LiveAvailabilityWidget from '@/components/LiveAvailabilityWidget';
import { useSearchParams, useRouter } from 'next/navigation';
import { getActiveEmployee, clearActiveEmployee, Employee, getAdminPin } from '@/lib/auth';
import EmployeeModal from '@/components/EmployeeModal';
import InventarioPage from '../inventario/page';
import { getParentMapping, getBeds24RoomIdAndUnit, getDirectTotalForStay, getCapacityRules, computeOtaSplit } from '@/lib/beds24';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Contexto de audio global compartido para la página de recepción
let sharedAudioCtx: AudioContext | null = null;

interface Reserva {
  id: string;
  room: string;
  unit_id?: string;
  daily_rate?: string;
  guest_name?: string;
  guest_phone?: string;
  guest_email?: string;
  check_in: string;
  check_out: string;
  checked_in?: boolean;
  checked_out?: boolean;
  dni_image?: string;
  nights?: number;
  price_estimate?: number;
  price_per_night?: number;
  num_adult?: number;
  num_child?: number;
  deposit?: number;
  balance?: number;
  notes?: string;
  groupRooms?: { roomId: string; unitId: string; name: string }[];
  extra_guest_surcharge?: string;
  channel?: string;
  status?: string;
  taxes?: {
    iva: number;
    ish: number;
    otros: number;
    total: number;
  };
  expected_payout?: number;
  host_fee?: number;
}

interface Task {
  id: string;
  type: string;
  room: string;
  description: string;
  status: string;
  reported_by: string;
  direction: string;
  created_at: string;
  image_base64?: string;
}

const ROOMS = [
  '101','102','103','104','105','106','107',
  '201','202','203','204','205','206',
  '301','302','303','304','305','306',
  '401','402',
  '500','501','502','503','504','505','506','507'
];

const ROOM_ROWS = [
  { label: 'Apartamentos de 3 dormitorios (101-107)', rooms: ['101','102','103','104','105','106','107'] },
  { label: 'Apartamentos de 2 dormitorios (201-206)', rooms: ['201','202','203','204','205','206'] },
  { label: 'Unidades Especiales (401-402)', rooms: ['401','402'] },
  { label: 'Habitaciones Dobles (301-306)', rooms: ['301','302','303','304','305','306'] },
  { label: 'Apartamentos Nuevos (500-507)', rooms: ['500','501','502','503','504','505','506','507'], isLocal: true }
];

const MTTO_LOCATIONS = [
  'General',
  ...ROOMS,
  'Cocina',
  'Recepción',
  'Alberca'
];

const BEDS24_ROOMS = [
  { id: '679077', name: 'Habitación Doble' },
  { id: '679087', name: 'Apartamento de 1 dormitorio' },
  { id: '679091', name: 'Apartamento de 2 dormitorios' },
  { id: '679092', name: 'Apartamento de 3 dormitorios' },
  { id: '679093', name: 'Casa Vacacional de 3 dormitorios' }
];

const PRICES: Record<string, Record<string, number>> = {
  '679077': { baja: 1345, media: 1597, media_alta: 1681, alta: 1849 },
  '679087': { baja: 2017, media: 2395, media_alta: 2521, alta: 2773 },
  '679091': { baja: 2689, media: 3193, media_alta: 3361, alta: 3697 },
  '679092': { baja: 4034, media: 4790, media_alta: 5042, alta: 5546 },
  '679093': { baja: 5378, media: 6387, media_alta: 6723, alta: 7395 },
};

const PHYSICAL_ROOM_GROUPS = [
  {
    category: 'Apartamentos de 3 dormitorios (101-107)',
    rooms: ['101', '102', '103', '104', '105', '106', '107']
  },
  {
    category: 'Apartamentos de 2 dormitorios (201-206)',
    rooms: ['201', '202', '203', '204', '205', '206']
  },
  {
    category: 'Unidades Especiales (401-402)',
    rooms: ['401', '402']
  },
  {
    category: 'Habitaciones Dobles (301-306)',
    rooms: ['301', '302', '303', '304', '305', '306']
  },
  {
    category: 'Apartamentos Nuevos (500-507)',
    rooms: ['500', '501', '502', '503', '504', '505', '506', '507']
  }
];


function getSeason(dateStr: string): string {
  if (!dateStr) return 'media';

  // 1. Rangos específicos definidos por el usuario para 2025-2027
  // TEMPORADA ALTA
  if (
    (dateStr >= '2025-12-20' && dateStr <= '2026-01-10') ||
    (dateStr >= '2026-03-27' && dateStr <= '2026-04-11') ||
    (dateStr >= '2026-12-20' && dateStr <= '2027-01-10') ||
    (dateStr >= '2027-03-19' && dateStr <= '2027-04-03') ||
    (dateStr >= '2027-12-20' && dateStr <= '2028-01-10')
  ) {
    return 'alta';
  }

  // TEMPORADA MEDIA-ALTA
  if (
    (dateStr >= '2025-12-15' && dateStr <= '2025-12-19') ||
    (dateStr >= '2026-07-15' && dateStr <= '2026-08-16') ||
    (dateStr >= '2026-12-15' && dateStr <= '2026-12-19') ||
    (dateStr >= '2027-07-15' && dateStr <= '2027-08-16') ||
    (dateStr >= '2027-12-15' && dateStr <= '2027-12-19')
  ) {
    return 'media_alta';
  }

  // TEMPORADA MEDIA
  if (
    (dateStr >= '2026-01-11' && dateStr <= '2026-03-26') ||
    (dateStr >= '2026-08-17' && dateStr <= '2026-08-31') ||
    (dateStr >= '2026-09-12' && dateStr <= '2026-09-15') ||
    (dateStr >= '2026-11-01' && dateStr <= '2026-12-14') ||
    (dateStr >= '2027-01-11' && dateStr <= '2027-03-18') ||
    (dateStr >= '2027-08-17' && dateStr <= '2027-08-31') ||
    (dateStr >= '2027-09-12' && dateStr <= '2027-09-15') ||
    (dateStr >= '2027-11-01' && dateStr <= '2027-12-14')
  ) {
    return 'media';
  }

  // Si es del periodo 2025-2027 y no cayó en ninguna de las anteriores, es BAJA ("Resto del año")
  if (dateStr >= '2025-01-01' && dateStr <= '2027-12-31') {
    return 'baja';
  }

  // 2. Fallback genérico mensual para otros años futuros (2028+)
  const d = new Date(dateStr + 'T12:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();

  if ((month === 12 && day >= 20) || (month === 1 && day <= 10)) return 'alta';
  if ((month === 3 && day >= 22) || (month === 4 && day <= 7)) return 'alta';
  if ((month === 7 && day >= 15) || (month === 8 && day <= 16)) return 'media_alta';
  if (month === 12 && day >= 15 && day <= 19) return 'media_alta';
  if (month === 1 && day >= 11) return 'media';
  if (month === 2) return 'media';
  if (month === 3 && day < 22) return 'media';
  if (month === 8 && day >= 17 && day <= 31) return 'media';
  if (month === 9 && day >= 12 && day <= 15) return 'media';
  if (month === 11 || (month === 12 && day <= 14)) return 'media';
  return 'baja';
}

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

function getNextDayStr(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return getLocalDateStr(d);
}

function addDaysToDateStr(dateStr: string, days: number): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return getLocalDateStr(d);
}

function getNightsBetweenDates(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 1;
  const d1 = new Date(checkIn + 'T12:00:00');
  const d2 = new Date(checkOut + 'T12:00:00');
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
}


async function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 900;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) {
            h = (h * MAX) / w;
            w = MAX;
          } else {
            w = (w * MAX) / h;
            h = MAX;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
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
): 'disponible' | 'en_limpieza' | 'limpia' | 'sucio_checkout' | 'limpieza_programada' | 'ocupada' | 'salida_hoy' {
  let isUpdatedToday = false;
  if (lastUpdatedAt) {
    try {
      isUpdatedToday = getLocalDateStr(new Date(lastUpdatedAt)) === todayStr;
    } catch (e) {
      isUpdatedToday = lastUpdatedAt.startsWith(todayStr);
    }
  }

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

  // 2. Si es de ayer o antes (estatus obsoleto), ignorar la DB y calcular fresh de Beds24 para hoy:

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
    return 'salida_hoy'; // Rojo muy tenue por checkout programado hoy
  }

  // Si no necesita limpieza, y está reservada/ocupada hoy, se muestra sin color (ocupada)
  if (hasResToday) {
    return 'ocupada';
  }

  // 3. Si no tiene salida ni estancia programada que requiera limpieza hoy, está disponible
  return 'disponible'; // Verde por defecto
}

function getUnitNumberFromInventory(roomId: string, unitId: string, roomInventory: any[]): string {
  if (roomInventory && roomInventory.length > 0) {
    const group = roomInventory.find((g: any) => g.roomId === roomId);
    if (group) {
      const unit = group.units.find((u: any) => u.unitId === unitId);
      if (unit) return unit.name;
    }
  }
  const staticMap: Record<string, Record<string, string>> = {
    '679077': { '1': '301', '2': '302', '3': '303', '4': '304', '5': '305', '6': '306' },
    '679087': { '1': '402' },
    '679091': { '1': '201', '2': '202', '3': '203', '4': '204', '5': '205', '6': '206' },
    '679092': { '1': '101', '2': '102', '3': '103', '4': '104', '5': '105', '6': '106', '7': '107' },
    '679093': { '1': '401' }
  };
  return staticMap[roomId]?.[unitId] || unitId;
}

function getFriendlyRoomName(roomId: string, unitId: string, roomInventory: any[]): string {
  const base = BEDS24_ROOMS.find(r => r.id === roomId)?.name || roomId;
  const num = getUnitNumberFromInventory(roomId, unitId, roomInventory);
  return `${base} (${num})`;
}

function fmtCurrency(amount: number, guestName?: string) {
  const isUSD = guestName?.toUpperCase().includes('(US DOLLARS)');
  const rounded = Math.ceil((amount || 0) * 100) / 100;
  return (isUSD ? 'USD$' : 'MX$') + rounded.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RecepcionPage() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [pricingSettings, setPricingSettings] = useState<Record<string, any>>({}); // Multiplicadores por roomId desde Beds24/Supabase
  const [capacitySettings, setCapacitySettings] = useState<Record<string, { base: number; max: number }> | null>(null);
  const [cleanToast, setCleanToast] = useState<{ room: string; by: string } | null>(null);
  const [mainTab, setMainTab] = useState<'recepcion' | 'inventario'>('recepcion');
  const staffName = 'Recepción';
  const [todayStr, setTodayStr] = useState('');
  const [tomorrowStr, setTomorrowStr] = useState('');

  useEffect(() => {
    const today = getLocalDateStr();
    setTodayStr(today);
    setTomorrowStr(getNextDayStr(today));
  }, []);

  const searchParams = useSearchParams();
  const router = useRouter();

  // Auditoría de Empleados
  const [activeEmployee, setActiveEmployeeState] = useState<Employee | null>(null);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: 'checkin' | 'checkout' | 'mantenimiento' | 'room_status';
    payload?: any;
    callback: (...args: any[]) => void;
  } | null>(null);

  // Inicializar Empleado Activo
  useEffect(() => {
    const emp = getActiveEmployee('recepcion');
    setActiveEmployeeState(emp);
    if (!emp) {
      setShowEmployeeModal(true);
    }
  }, []);

  // Interceptor de firma de empleado
  const runWithSignature = (
    type: 'checkin' | 'checkout' | 'mantenimiento' | 'room_status',
    callback: (...args: any[]) => void,
    payload?: any
  ) => {
    const emp = getActiveEmployee('recepcion');
    if (!emp) {
      setPendingAction({ type, payload, callback });
      setShowEmployeeModal(true);
    } else {
      callback(payload);
    }
  };

  // Modal Check-In / Walk-In
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [kpiModalType, setKpiModalType] = useState<'encasa' | 'llegan' | 'salen' | null>(null);
  const [selectedReserva, setSelectedReserva] = useState<Reserva | null>(null);

  // Estados para reasignar y editar reservas existentes en Recepción
  const [editedPhone, setEditedPhone] = useState('');
  const [editedAdults, setEditedAdults] = useState(1);
  const [editedChildren, setEditedChildren] = useState(0);
  const [editedPrice, setEditedPrice] = useState('');
  const [editedDailyRate, setEditedDailyRate] = useState('');
  const [editedDeposit, setEditedDeposit] = useState('');
  const [editedNotes, setEditedNotes] = useState('');
  const [groupRoomRates, setGroupRoomRates] = useState<Record<string, string>>({});
  const [abonoPaymentMode, setAbonoPaymentMode] = useState<'efectivo' | 'tarjeta' | 'transferencia' | null>(null);
  const [abonoAccountId, setAbonoAccountId] = useState('');
  const [registerAbonoInFinances, setRegisterAbonoInFinances] = useState(true);
  const [availableRooms, setAvailableRooms] = useState<Record<string, boolean>>({});
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const [targetRoomName, setTargetRoomName] = useState('');
  const [reassignLoading, setReassignLoading] = useState(false);
  const [isSavingChanges, setIsSavingChanges] = useState(false);

  // Estados para abono dedicado en Recepción
  const [showAbonoFlow, setShowAbonoFlow] = useState(false);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoFlowPaymentMethod, setAbonoFlowPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia' | null>(null);
  const [abonoFlowAccountId, setAbonoFlowAccountId] = useState('');
  const [abonoFlowLoading, setAbonoFlowLoading] = useState(false);
  const [abonoGrupalMode, setAbonoGrupalMode] = useState(false); // true = distribuir entre grupo

  // Estados para extensión de estancia
  const [showExtensionFlow, setShowExtensionFlow] = useState(false);
  const [extensionNights, setExtensionNights] = useState(1);
  const [extensionCustomPrice, setExtensionCustomPrice] = useState('');
  const [extensionRegisterPayment, setExtensionRegisterPayment] = useState(true);
  const [extensionPaymentMethod, setExtensionPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia' | null>(null);
  const [extensionAccountId, setExtensionAccountId] = useState('');
  const [extensionLoading, setExtensionLoading] = useState(false);

  // Inicializar estados editados al cambiar de reserva
  useEffect(() => {
    setGroupRoomRates({});
    setPayGroupConsolidated(false);
    if (selectedReserva) {
      if (selectedReserva.id === 'walkin') {
        setPaymentAmount('0');
      }
      setPaymentDescription('');
      setEditedPhone(selectedReserva.guest_phone || '');
      setEditedAdults(Number(selectedReserva.num_adult || 1));
      setEditedChildren(Number(selectedReserva.num_child || 0));
      const priceEstimate = selectedReserva.price_estimate || 0;
      const nights = selectedReserva.nights || 1;
      setEditedPrice(String(priceEstimate));
      setEditedDailyRate(String(Math.round(priceEstimate / nights)));
      setEditedDeposit(String(selectedReserva.deposit || '0'));
      setEditedNotes(selectedReserva.notes || '');
      setIsReassigning(false);
      setTargetRoomName('');
      setAbonoPaymentMode(null);
      setAbonoAccountId('');
      setRegisterAbonoInFinances(true);

      setShowAbonoFlow(false);
      setAbonoAmount('');
      setAbonoFlowPaymentMethod(null);
      setAbonoFlowAccountId('');

      setShowExtensionFlow(false);
      setExtensionNights(1);
      setExtensionCustomPrice('');
      setExtensionRegisterPayment(true);
      setExtensionPaymentMethod(null);
      setExtensionAccountId('');
      setExtensionLoading(false);
    } else {
      setPaymentAmount('');
      setPaymentDescription('');
      setEditedPhone('');
      setEditedAdults(1);
      setEditedChildren(0);
      setEditedPrice('');
      setEditedDailyRate('');
      setEditedDeposit('');
      setEditedNotes('');
      setIsReassigning(false);
      setTargetRoomName('');
      setAbonoPaymentMode(null);
      setAbonoAccountId('');
      setRegisterAbonoInFinances(true);

      setShowAbonoFlow(false);
      setAbonoAmount('');
      setAbonoFlowPaymentMethod(null);
      setAbonoFlowAccountId('');

      setShowExtensionFlow(false);
      setExtensionNights(1);
      setExtensionCustomPrice('');
      setExtensionRegisterPayment(true);
      setExtensionPaymentMethod(null);
      setExtensionAccountId('');
      setExtensionLoading(false);
    }
  }, [selectedReserva]);

  // Sincronizar editedAdults y editedChildren con selectedReserva (por ejemplo, al cambiar en steppers de walk-in)
  useEffect(() => {
    if (selectedReserva) {
      setEditedAdults(Number(selectedReserva.num_adult || 1));
      setEditedChildren(Number(selectedReserva.num_child || 0));
    }
  }, [selectedReserva?.num_adult, selectedReserva?.num_child]);

  // Bloquear el scroll del body principal cuando el modal de check-in está abierto (evita fugas de scroll en móviles)
  useEffect(() => {
    if (showCheckInModal && selectedReserva) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [showCheckInModal, selectedReserva]);

  // Auto-seleccionar primer sobre compatible para abono de anticipo
  useEffect(() => {
    if (!abonoPaymentMode) {
      setAbonoAccountId('');
      return;
    }
    const compatible = accounts.filter(acc => {
      const isUSD = selectedReserva?.guest_name?.toUpperCase().includes('(US DOLLARS)');
      if (isUSD) {
        const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
        if (!isUSDAcc) return false;
        
        const name = acc.name.trim().toUpperCase();
        if (abonoPaymentMode === 'efectivo') {
          return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
        }
        return !name.includes('EFE') && !name.includes('CASH');
      } else {
        const name = acc.name.trim().toUpperCase();
        if (abonoPaymentMode === 'efectivo') {
          return name === 'EFECTIVO';
        }
        if (abonoPaymentMode === 'tarjeta') {
          return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
        }
        if (abonoPaymentMode === 'transferencia') {
          return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
        }
        return false;
      }
    });

    if (compatible.length > 0) {
      setAbonoAccountId(compatible[0].id);
    } else {
      setAbonoAccountId('');
    }
  }, [abonoPaymentMode, accounts, selectedReserva]);

  // Auto-seleccionar primer sobre compatible para el abono de flujo en Recepción
  useEffect(() => {
    if (!abonoFlowPaymentMethod) {
      setAbonoFlowAccountId('');
      return;
    }
    const compatible = accounts.filter(acc => {
      const isUSD = selectedReserva?.guest_name?.toUpperCase().includes('(US DOLLARS)');
      if (isUSD) {
        const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
        if (!isUSDAcc) return false;
        
        const name = acc.name.trim().toUpperCase();
        if (abonoFlowPaymentMethod === 'efectivo') {
          return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
        }
        return !name.includes('EFE') && !name.includes('CASH');
      } else {
        const name = acc.name.trim().toUpperCase();
        if (abonoFlowPaymentMethod === 'efectivo') {
          return name === 'EFECTIVO';
        }
        if (abonoFlowPaymentMethod === 'tarjeta') {
          return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
        }
        if (abonoFlowPaymentMethod === 'transferencia') {
          return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
        }
        return false;
      }
    });

    if (compatible.length > 0) {
      setAbonoFlowAccountId(compatible[0].id);
    } else {
      setAbonoFlowAccountId('');
    }
  }, [abonoFlowPaymentMethod, accounts, selectedReserva]);

  const suggestedPrice = useMemo(() => {
    if (!selectedReserva || selectedReserva.id === 'walkin') return 0;
    const originalPax = (selectedReserva.num_adult || 1) + (selectedReserva.num_child || 0);
    const originalExtraGuests = Math.max(0, originalPax - getCapacityRules(selectedReserva.room, capacitySettings || undefined).base);
    const newExtraGuests = Math.max(0, (editedAdults + editedChildren) - getCapacityRules(selectedReserva.room, capacitySettings || undefined).base);
    const diffExtra = newExtraGuests - originalExtraGuests;
    const extraGuestPrice = capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500;
    const priceAdjustment = Math.round(diffExtra * extraGuestPrice * (selectedReserva.nights || 1));
    return Math.round(Number(selectedReserva.price_estimate || 0) + priceAdjustment);
  }, [selectedReserva, editedAdults, editedChildren, capacitySettings]);

  // Sincronizar el precio editado cuando cambia el precio sugerido
  useEffect(() => {
    if (selectedReserva && selectedReserva.id !== 'walkin') {
      setEditedPrice(String(suggestedPrice));
    }
  }, [suggestedPrice]);

  useEffect(() => {
    if (isReassigning && selectedReserva?.check_in && selectedReserva?.check_out) {
      const fetchReassignAvailability = async () => {
        setLoadingAvailability(true);
        try {
          const res = await fetch(`/api/availability?checkIn=${selectedReserva.check_in}&checkOut=${selectedReserva.check_out}&t=${Date.now()}`);
          const json = await res.json();
          if (json.success && json.inventory) {
            const availMap: Record<string, boolean> = {};
            json.inventory.forEach((cat: any) => {
              cat.units.forEach((u: any) => {
                availMap[String(u.name)] = u.isAvailable;
              });
            });
            setAvailableRooms(availMap);
          }
        } catch (err) {
          console.error("Error al obtener disponibilidad para reasignar:", err);
        } finally {
          setLoadingAvailability(false);
        }
      };
      fetchReassignAvailability();
    }
  }, [isReassigning, selectedReserva]);

  const handleSaveChanges = async () => {
    if (!selectedReserva) return;

    // Validar capacidad máxima de la habitación
    const rules = getCapacityRules(selectedReserva.room, capacitySettings || undefined);
    const totalGuests = Number(editedAdults) + Number(editedChildren);
    if (totalGuests > rules.max) {
      alert(`⚠️ La capacidad máxima de la habitación ${selectedReserva.room} es de ${rules.max} personas. Has ingresado ${totalGuests} personas. Por favor, ajusta la cantidad de huéspedes.`);
      return;
    }

    setIsSavingChanges(true);
    try {
      const res = await fetch('/api/reservas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedReserva.id,
          phone: editedPhone,
          numAdult: editedAdults,
          numChild: editedChildren,
          price: Number(editedPrice),
          deposit: Number(editedDeposit),
          notes: editedNotes
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar los cambios');
      
      setAbonoPaymentMode(null);
      setAbonoAccountId('');
      setRegisterAbonoInFinances(true);
      
      alert('✅ Cambios guardados con éxito.');
      
      try {
        const emp = getActiveEmployee('recepcion');
        const employeeNum = emp?.employee_num || '999';
        const employeeName = emp?.full_name || 'Administrador';
        const employeeDept = emp?.department || 'recepcion';
        
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: employeeNum,
            employee_name: employeeName,
            department: employeeDept,
            module: 'recepcion',
            action: 'reserva_modificada',
            room: selectedReserva.room || 'General',
            details: JSON.stringify({
              text: `${selectedReserva.guest_name} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room || 'General'} - Modificó la reserva (Pax: ${editedAdults}A/${editedChildren}N, Tel: ${editedPhone}, Total: MX$${editedPrice}, Anticipo: MX$${editedDeposit}).`,
              modificacion: {
                bookingId: selectedReserva.id,
                guestName: selectedReserva.guest_name,
                phone: editedPhone,
                numAdult: editedAdults,
                numChild: editedChildren,
                price: Number(editedPrice),
                deposit: Number(editedDeposit),
                notes: editedNotes
              }
            })
          })
        });
      } catch (logErr) {
        console.error("Error registrando log de modificación:", logErr);
      }

      setSelectedReserva((prev: any) => ({
        ...prev,
        guest_phone: editedPhone,
        num_adult: editedAdults,
        num_child: editedChildren,
        price_estimate: Number(editedPrice),
        deposit: Number(editedDeposit),
        balance: Number(editedPrice) - Number(editedDeposit),
        notes: editedNotes
      }));

      setReservas(prev => prev.map(r => String(r.id) === String(selectedReserva.id) ? {
        ...r,
        guest_phone: editedPhone,
        num_adult: editedAdults,
        num_child: editedChildren,
        price_estimate: Number(editedPrice),
        deposit: Number(editedDeposit),
        balance: Number(editedPrice) - Number(editedDeposit),
        notes: editedNotes
      } : r));

      
      // Retrasar consulta de Beds24 para dar tiempo a que se propague el cambio
      setTimeout(() => {
        fetchData();
      }, 3000);
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al guardar cambios:\n\n${err.message}`);
    } finally {
      setIsSavingChanges(false);
    }
  };

  const handleRegisterAbono = async () => {
    if (!selectedReserva || !abonoAmount || !abonoFlowPaymentMethod || !abonoFlowAccountId) return;
    setAbonoFlowLoading(true);
    try {
      const amountNum = Number(abonoAmount);
      const oldDeposit = selectedReserva.deposit || 0;
      const newDeposit = oldDeposit + amountNum;

      // 1. Modificar depósito en Beds24 llamando a la API PUT /api/reservas
      const res = await fetch('/api/reservas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedReserva.id,
          deposit: newDeposit
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar el anticipo en Beds24');

      // 2. Registrar en Supabase finances
      const baseDesc = `Anticipo Directo de ${selectedReserva.guest_name} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room}`;
      const todayStr = new Date().toLocaleDateString('sv-SE');

      const { error: financeErr } = await supabase.from('finances').insert({
        type: 'ingreso',
        amount: amountNum,
        category: 'Alojamiento',
        description: baseDesc,
        payment_method: abonoFlowPaymentMethod,
        account_id: abonoFlowAccountId,
        date: todayStr
      });

      if (financeErr) {
        console.error("Error al registrar finanzas para anticipo:", financeErr);
        alert(`⚠️ Se guardó el anticipo en Beds24, pero hubo un error al registrar en Finanzas: ${financeErr.message}`);
      } else {
        // 3. Actualizar balance de la cuenta
        const matchedAcc = accounts.find(a => a.id === abonoFlowAccountId);
        if (matchedAcc) {
          const newBalance = matchedAcc.balance + amountNum;
          const { error: accErr } = await supabase.from('accounts').update({ balance: newBalance }).eq('id', abonoFlowAccountId);
          if (accErr) {
            console.error("Error al actualizar balance de cuenta para anticipo:", accErr);
          } else {
            setAccounts(prev => prev.map(a => a.id === abonoFlowAccountId ? { ...a, balance: newBalance } : a));
          }
        }
      }

      // Registrar log de anticipo
      try {
        const emp = getActiveEmployee('recepcion');
        const employeeNum = emp?.employee_num || '999';
        const employeeName = emp?.full_name || 'Administrador';
        const employeeDept = emp?.department || 'recepcion';

        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: employeeNum,
            employee_name: employeeName,
            department: employeeDept,
            module: 'recepcion',
            action: 'abono_registrado',
            room: selectedReserva.room || 'General',
            details: JSON.stringify({
              text: `${selectedReserva.guest_name} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room || 'General'} - Registró abono directo de MX$${amountNum} (Cuenta: ${abonoFlowAccountId}, Método: ${abonoFlowPaymentMethod}).`,
              abono: {
                bookingId: selectedReserva.id,
                amount: amountNum,
                paymentMethod: abonoFlowPaymentMethod,
                accountId: abonoFlowAccountId
              }
            })
          })
        });
      } catch (logErr) {
        console.error("Error registrando log de abono:", logErr);
      }

      // 4. Actualizar estados locales reactivos
      setSelectedReserva((prev: any) => ({
        ...prev,
        deposit: newDeposit,
        balance: (prev.price_estimate || 0) - newDeposit
      }));

      setReservas(prev => prev.map(r => String(r.id) === String(selectedReserva.id) ? {
        ...r,
        deposit: newDeposit,
        balance: (r.price_estimate || 0) - newDeposit
      } : r));

      setShowAbonoFlow(false);
      alert('✅ Anticipo registrado exitosamente.');

      // Refrescar en segundo plano tras delay
      setTimeout(() => {
        fetchData();
      }, 3000);
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al registrar anticipo:\n\n${err.message}`);
    } finally {
      setAbonoFlowLoading(false);
    }
  };

  const handleExtendStay = async () => {
    if (!selectedReserva) return;
    
    // 1. Validar fechas de salida
    const originalCheckOut = selectedReserva.check_out;
    const newCheckOut = addDaysToDateStr(originalCheckOut, extensionNights);
    
    // 2. Validar colisión (overbooking) local
    const isOccupied = reservas.some(r => 
      r.id !== selectedReserva.id && 
      r.status !== 'cancelled' && 
      r.room === selectedReserva.room && 
      r.check_in < newCheckOut && 
      r.check_out > originalCheckOut
    );
    
    if (isOccupied) {
      alert(`⚠️ Conflicto de Disponibilidad: La habitación ${selectedReserva.room} ya se encuentra reservada u ocupada por otro huésped entre el ${originalCheckOut} y el ${newCheckOut}. Por favor, selecciona menos noches o gestiona una reasignación primero.`);
      return;
    }
    
    setExtensionLoading(true);
    try {
      const originalPrice = Number(selectedReserva.price_estimate || 0);
      const originalNights = Number(selectedReserva.nights || 1);
      const dailyRate = Math.round(originalPrice / originalNights);
      const extraCost = extensionCustomPrice !== '' ? Number(extensionCustomPrice) : (dailyRate * extensionNights);
      const newPrice = originalPrice + extraCost;
      
      const paymentAmountNum = extensionRegisterPayment ? extraCost : 0;
      const oldDeposit = Number(selectedReserva.deposit || 0);
      const newDeposit = oldDeposit + paymentAmountNum;
      
      // A. Llamar a la API PUT /api/reservas
      const res = await fetch('/api/reservas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedReserva.id,
          checkOut: newCheckOut,
          price: newPrice,
          deposit: newDeposit
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar la reserva en el servidor');
      
      // B. Si se registra pago en caja, insertar en Supabase finances y actualizar balance de la cuenta
      if (extensionRegisterPayment && paymentAmountNum > 0 && extensionAccountId && extensionPaymentMethod) {
        const baseDesc = `Pago Extensión Stay de ${selectedReserva.guest_name} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} (+${extensionNights} noches)`;
        const todayStr = new Date().toLocaleDateString('sv-SE');
        
        const { error: financeErr } = await supabase.from('finances').insert({
          type: 'ingreso',
          amount: paymentAmountNum,
          category: 'Alojamiento',
          description: baseDesc,
          payment_method: extensionPaymentMethod,
          account_id: extensionAccountId,
          date: todayStr
        });
        
        if (financeErr) {
          console.error("Error al registrar finanzas de la extensión:", financeErr);
          alert(`⚠️ Se actualizó la reserva, pero hubo un error al registrar el ingreso en Finanzas: ${financeErr.message}`);
        } else {
          // Actualizar balance de la cuenta
          const matchedAcc = accounts.find(a => a.id === extensionAccountId);
          if (matchedAcc) {
            const newBalance = matchedAcc.balance + paymentAmountNum;
            const { error: accErr } = await supabase.from('accounts').update({ balance: newBalance }).eq('id', extensionAccountId);
            if (accErr) {
              console.error("Error al actualizar balance de cuenta:", accErr);
            } else {
              setAccounts(prev => prev.map(a => a.id === extensionAccountId ? { ...a, balance: newBalance } : a));
            }
          }
        }
      }
      
      // C. Registrar Log de Empleado
      try {
        const emp = getActiveEmployee('recepcion');
        const employeeNum = emp?.employee_num || '999';
        const employeeName = emp?.full_name || 'Administrador';
        const employeeDept = emp?.department || 'recepcion';
        
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: employeeNum,
            employee_name: employeeName,
            department: employeeDept,
            module: 'recepcion',
            action: 'estancia_extendida',
            room: selectedReserva.room || 'General',
            details: JSON.stringify({
              text: `${selectedReserva.guest_name} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room || 'General'} - Extendió estancia +${extensionNights} noches (Check-Out: ${newCheckOut}, Cobro: MX$${extraCost}).`,
              extension: {
                bookingId: selectedReserva.id,
                extraNights: extensionNights,
                extraCost: extraCost,
                newCheckOut: newCheckOut,
                paymentRegistered: extensionRegisterPayment,
                paymentMethod: extensionPaymentMethod,
                accountId: extensionAccountId
              }
            })
          })
        });
      } catch (logErr) {
        console.error("Error registrando log de extensión:", logErr);
      }
      
      // D. Actualizar estados locales reactivos
      setSelectedReserva((prev: any) => ({
        ...prev,
        check_out: newCheckOut,
        departure: newCheckOut,
        nights: originalNights + extensionNights,
        price_estimate: newPrice,
        deposit: newDeposit,
        balance: newPrice - newDeposit
      }));
      
      setReservas(prev => prev.map(r => String(r.id) === String(selectedReserva.id) ? {
        ...r,
        check_out: newCheckOut,
        departure: newCheckOut,
        nights: originalNights + extensionNights,
        price_estimate: newPrice,
        deposit: newDeposit,
        balance: newPrice - newDeposit
      } : r));
      
      setShowExtensionFlow(false);
      alert(`✅ Estancia extendida con éxito hasta el ${newCheckOut}.`);
      
      // E. Refrescar datos en segundo plano
      setTimeout(() => {
        fetchData();
      }, 3000);
      
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al extender la estancia:\n\n${err.message}`);
    } finally {
      setExtensionLoading(false);
    }
  };

  // Registrar anticipo grupal proporcional
  const handleRegisterAbonoGrupal = async () => {
    if (!selectedReserva || !abonoAmount || !abonoFlowPaymentMethod || !abonoFlowAccountId) return;
    if (directGroupBookings.length === 0) return;
    setAbonoFlowLoading(true);
    try {
      const totalAmount = Number(abonoAmount);
      const totalBalance = directGroupTotalBalance;
      const todayStr = new Date().toLocaleDateString('sv-SE');
      const emp = getActiveEmployee('recepcion');
      const employeeNum = emp?.employee_num || '999';
      const employeeName = emp?.full_name || 'Administrador';

      // Procesar cada habitación del grupo proporcionalmente
      for (const booking of directGroupBookings) {
        const bookingBalance = booking.balance !== undefined
          ? booking.balance
          : Math.max(0, (booking.price_estimate || 0) - (booking.deposit || 0));

        // Proporción: si el balance total es 0, distribuir en partes iguales
        const proportion = totalBalance > 0
          ? bookingBalance / totalBalance
          : 1 / directGroupBookings.length;

        const bookingAmount = Math.round(totalAmount * proportion * 100) / 100;
        if (bookingAmount <= 0) continue;

        const newDeposit = (booking.deposit || 0) + bookingAmount;

        // 1. Actualizar depósito en Beds24
        const res = await fetch('/api/reservas', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: booking.id, deposit: newDeposit })
        });
        if (!res.ok) {
          console.error(`Error actualizando depósito de reserva ${booking.id}`);
          continue;
        }

        // 2. Registrar en Finanzas
        await supabase.from('finances').insert({
          type: 'ingreso',
          amount: bookingAmount,
          category: 'Alojamiento',
          description: `Anticipo Grupal – ${booking.guest_name} (ID: ${booking.id}) Hab ${booking.room}`,
          payment_method: abonoFlowPaymentMethod,
          account_id: abonoFlowAccountId,
          date: todayStr
        });

        // 4. Log de auditoría por habitación
        try {
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_num: employeeNum,
              employee_name: employeeName,
              department: emp?.department || 'recepcion',
              module: 'recepcion',
              action: 'abono_grupal_registrado',
              room: booking.room || 'General',
              details: JSON.stringify({
                text: `Anticipo grupal de MX$${bookingAmount} aplicado a ${booking.guest_name} Hab ${booking.room} (proporcional del total MX$${totalAmount})`,
                abono: { bookingId: booking.id, amount: bookingAmount, method: abonoFlowPaymentMethod, accountId: abonoFlowAccountId }
              })
            })
          });
        } catch (e) { console.error('Error log abono grupal:', e); }

        // 5. Actualizar estado local de la reserva
        setReservas(prev => prev.map(r => String(r.id) === String(booking.id) ? {
          ...r,
          deposit: newDeposit,
          balance: Math.max(0, (r.price_estimate || 0) - newDeposit)
        } : r));
      }

      // Actualizar balance de la cuenta destino (una sola vez al final)
      const matchedAcc = accounts.find(a => a.id === abonoFlowAccountId);
      if (matchedAcc) {
        const newBalance = matchedAcc.balance + totalAmount;
        const { error: accErr } = await supabase.from('accounts').update({ balance: newBalance }).eq('id', abonoFlowAccountId);
        if (!accErr) setAccounts(prev => prev.map(a => a.id === abonoFlowAccountId ? { ...a, balance: newBalance } : a));
      }

      // Actualizar selectedReserva
      const mainBooking = directGroupBookings.find(b => String(b.id) === String(selectedReserva.id));
      if (mainBooking) {
        const mainBalance = mainBooking.balance !== undefined ? mainBooking.balance : Math.max(0, (mainBooking.price_estimate || 0) - (mainBooking.deposit || 0));
        const mainProportion = totalBalance > 0 ? mainBalance / totalBalance : 1 / directGroupBookings.length;
        const mainAmount = Math.round(totalAmount * mainProportion * 100) / 100;
        const newMainDeposit = (selectedReserva.deposit || 0) + mainAmount;
        setSelectedReserva((prev: any) => ({
          ...prev,
          deposit: newMainDeposit,
          balance: Math.max(0, (prev.price_estimate || 0) - newMainDeposit)
        }));
      }

      setShowAbonoFlow(false);
      setAbonoGrupalMode(false);
      setAbonoAmount('');
      setAbonoFlowPaymentMethod(null);
      setAbonoFlowAccountId('');
      alert(`✅ Anticipo grupal de ${fmtCurrency(totalAmount, selectedReserva.guest_name)} distribuido en ${directGroupBookings.length} habitaciones.`);

      setTimeout(() => { fetchData(); }, 3000);
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al registrar anticipo grupal:\n\n${err.message}`);
    } finally {
      setAbonoFlowLoading(false);
    }
  };

  const handleReassignRoom = async () => {
    if (!selectedReserva || !targetRoomName) return;

    // Validar capacidad máxima de la nueva habitación
    const totalGuests = Number(selectedReserva.num_adult || 1) + Number(selectedReserva.num_child || 0);
    const rules = getCapacityRules(targetRoomName, capacitySettings || undefined);
    if (totalGuests > rules.max) {
      alert(`⚠️ No se puede reasignar a la habitación ${targetRoomName} porque la capacidad máxima es de ${rules.max} personas y la reserva tiene ${totalGuests} huéspedes.`);
      return;
    }
    
    const confirmChange = confirm(`⚠️ ¿Estás seguro de que deseas reasignar la reserva de ${selectedReserva.guest_name} a la habitación ${targetRoomName}?\n\nEsto actualizará la asignación en Beds24 y sincronizará la habitación en tu registro local de Supabase.`);
    if (!confirmChange) return;

    setReassignLoading(true);
    try {
      const res = await fetch('/api/reservas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedReserva.id,
          roomName: targetRoomName
        })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Error al reasignar la habitación');

      alert(`✅ Habitación reasignada exitosamente a la ${targetRoomName}.`);

      try {
        const emp = getActiveEmployee('recepcion');
        const employeeNum = emp?.employee_num || '999';
        const employeeName = emp?.full_name || 'Administrador';
        const employeeDept = emp?.department || 'recepcion';
        
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: employeeNum,
            employee_name: employeeName,
            department: employeeDept,
            module: 'recepcion',
            action: 'reasignacion_habitacion',
            room: targetRoomName,
            details: JSON.stringify({
              text: `${selectedReserva.guest_name} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room || 'Sin asignar'} - Reasignó la habitación a ${targetRoomName}.`,
              reasignacion: {
                bookingId: selectedReserva.id,
                guestName: selectedReserva.guest_name,
                fromRoom: selectedReserva.room || 'Sin asignar',
                toRoom: targetRoomName
              }
            })
          })
        });
      } catch (logErr) {
        console.error("Error registrando log de reasignación:", logErr);
      }

      setIsReassigning(false);
      setTargetRoomName('');
      
      const updatedRoomName = data.room_name || `Habitación ${targetRoomName}`;
      setSelectedReserva((prev: any) => ({ ...prev, room: updatedRoomName }));
      setReservas(prev => prev.map(r => String(r.id) === String(selectedReserva.id) ? { ...r, room: updatedRoomName, room_name: updatedRoomName } : r));
      
      // Retrasar consulta de Beds24 para dar tiempo a que se propague el cambio
      setTimeout(() => {
        fetchData();
      }, 3000);
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al reasignar habitación:\n\n${err.message}`);
    } finally {
      setReassignLoading(false);
    }
  };
  const [dniPreview, setDniPreview] = useState<string | null>(null);
  const [dniFile, setDniFile] = useState<File | null>(null);
  const [paymentMode, setPaymentMode] = useState<'efectivo' | 'tarjeta' | 'transferencia' | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [checkInNotes, setCheckInNotes] = useState('');
  const [payGroupConsolidated, setPayGroupConsolidated] = useState(false);
  const [isPriceUnlocked, setIsPriceUnlocked] = useState(false);
  const [isDailyRateEdited, setIsDailyRateEdited] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [typedNights, setTypedNights] = useState<string>('');

  useEffect(() => {
    if (selectedReserva?.check_in && selectedReserva?.check_out) {
      setTypedNights(String(getNightsBetweenDates(selectedReserva.check_in, selectedReserva.check_out)));
    } else {
      setTypedNights('');
    }
  }, [selectedReserva?.check_in, selectedReserva?.check_out]);

  // Inicializar notas editables al abrir el modal de check-in
  useEffect(() => {
    if (selectedReserva) {
      setCheckInNotes(selectedReserva.notes || '');
    }
  }, [selectedReserva?.id]);

  // Buscar reservas del mismo grupo (mismo check_in, no checked_in, mismo nombre o teléfono)
  const siblingBookings = useMemo(() => {
    if (!selectedReserva || selectedReserva.id === 'walkin') return [];
    
    const cleanStr = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
    const mainName = cleanStr(selectedReserva.guest_name || '');
    const mainPhone = (selectedReserva.guest_phone || '').trim();
    
    return reservas.filter(r => {
      if (r.check_in !== selectedReserva.check_in || r.id === selectedReserva.id || r.checked_in || r.checked_out) {
        return false;
      }
      
      const samePhone = mainPhone && r.guest_phone && r.guest_phone.trim() === mainPhone;
      const sameName = mainName && r.guest_name && (cleanStr(r.guest_name).includes(mainName) || mainName.includes(cleanStr(r.guest_name)));
      
      return samePhone || sameName;
    });
  }, [selectedReserva, reservas]);

  const groupBookings = useMemo(() => {
    if (!selectedReserva) return [];
    return [selectedReserva, ...siblingBookings];
  }, [selectedReserva, siblingBookings]);

  const isOtaRoom = (r: Reserva) => ['Airbnb', 'Booking.com'].includes(r.channel || '');

  const directGroupBookings = useMemo(() => {
    return groupBookings.filter(r => !isOtaRoom(r));
  }, [groupBookings]);

  const directGroupTotalBalance = useMemo(() => {
    return directGroupBookings.reduce((sum, r) => {
      const bal = r.balance !== undefined ? r.balance : Math.max(0, (r.price_estimate || 0) - (r.deposit || 0));
      return sum + bal;
    }, 0);
  }, [directGroupBookings]);

  // Modal Mtto
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'mantenimiento', room: 'General', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  // Estados del Grid Físico de Habitaciones
  const [roomStatuses, setRoomStatuses] = useState<any[]>([]);
  const [selectedRoomForStatus, setSelectedRoomForStatus] = useState<any | null>(null);
  const [showRoomStatusModal, setShowRoomStatusModal] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Availability check for Walk-In
  const [roomInventory, setRoomInventory] = useState<any[]>([]);
  const [checkingAvail, setCheckingAvail] = useState(false);

  const { walkinMaxCapacity, walkinBaseCapacity } = useMemo(() => {
    if (!selectedReserva || selectedReserva.id !== 'walkin') return { walkinMaxCapacity: 0, walkinBaseCapacity: 0 };
    const group = selectedReserva.groupRooms && selectedReserva.groupRooms.length > 0
      ? selectedReserva.groupRooms
      : [{ roomId: selectedReserva.room, unitId: selectedReserva.unit_id || '', name: getUnitNumberFromInventory(selectedReserva.room, selectedReserva.unit_id || '', roomInventory) }];
    
    let totalMax = 0;
    let totalBase = 0;
    group.forEach((rm: any) => {
      if (!rm.roomId && !rm.room) return;
      const cap = getCapacityRules(rm.roomId || rm.room, capacitySettings || undefined);
      totalMax += cap.max;
      totalBase += cap.base;
    });
    return { walkinMaxCapacity: totalMax, walkinBaseCapacity: totalBase };
  }, [selectedReserva?.groupRooms, selectedReserva?.room, selectedReserva?.unit_id, roomInventory, capacitySettings]);

  const fileRef = useRef<HTMLInputElement>(null);
  const mttoPhotoRef = useRef<HTMLInputElement>(null);

  const handleMttoImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await compressImage(file);
    setPhotoFile(file);
    setPhotoBase64(b64);
  };

  const handleUpdateRoomStatus = async (newStatus: string) => {
    if (!selectedRoomForStatus) return;
    setStatusUpdating(true);
    
    const emp = getActiveEmployee('recepcion');
    const operatorName = emp ? `${emp.full_name} (${emp.employee_num})` : 'Recepción';

    try {
      const res = await fetch('/api/room-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_number: selectedRoomForStatus.room_number,
          status: newStatus,
          updated_by: operatorName
        }),
      });
      const json = await res.json();
      if (json.success) {
        // Registrar log de auditoría
        if (emp) {
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_num: emp.employee_num,
              employee_name: emp.full_name,
              department: emp.department,
              module: 'recepcion',
              action: 'change_room_status',
              room: selectedRoomForStatus.room_number,
              details: `Cambió el estado de Habitación ${selectedRoomForStatus.room_number} a '${newStatus}' desde Recepción`
            })
          });
        }
        fetchData();
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

  // Lock body scroll and hide BottomNav when any modal is open
  useEffect(() => {
    const isAnyModalOpen = showCheckInModal || showForm || showEmployeeModal || showPinModal;
    if (isAnyModalOpen) {
      document.body.classList.add('overflow-hidden', 'panel-open');
    } else {
      document.body.classList.remove('overflow-hidden', 'panel-open');
    }
    return () => {
      document.body.classList.remove('overflow-hidden', 'panel-open');
    };
  }, [showCheckInModal, showForm, showEmployeeModal, showPinModal]);

  useEffect(() => {
    if (!todayStr) return; // Esperar a que todayStr se inicialice en el cliente
    
    // Interceptar URL para Walk-in desde el Calendario o Widget
    const isWalkin = searchParams.get('walkin');
    const walkinRoom = searchParams.get('room');
    const walkinUnit = searchParams.get('unit');
    const walkinDate = searchParams.get('date');

    if (isWalkin) {
      const targetRoom = walkinRoom || '';
      const targetDate = walkinDate || todayStr;
      const nextDay = getNextDayStr(targetDate);
      setRoomInventory([]);
      const targetUnit = walkinUnit || '';
      const initialGroup = targetRoom && targetUnit ? [{
        roomId: targetRoom,
        unitId: targetUnit,
        name: getUnitNumberFromInventory(targetRoom, targetUnit, [])
      }] : [];
      setSelectedReserva({
        id: 'walkin',
        room: targetRoom,
        unit_id: targetUnit || undefined,
        groupRooms: initialGroup,
        check_in: targetDate,
        check_out: nextDay,
        guest_name: '',
        guest_phone: '',
        num_adult: 1,
        num_child: 0,
        notes: '',
        extra_guest_surcharge: ''
      });
      setShowCheckInModal(true);
      fetchAvailability(targetDate, nextDay);

      // Limpiar URL
      router.replace('/recepcion');
    }
  }, [searchParams, todayStr]);

  // Interceptar URL para Check-in / Check-out automáticos desde Admin Dashboard
  useEffect(() => {
    if (reservas.length === 0) return;
    const paramCheckin = searchParams.get('checkin');
    const paramCheckout = searchParams.get('checkout');
    if (paramCheckin) {
      const match = reservas.find(r => String(r.id) === String(paramCheckin));
      if (match && !match.checked_in) {
        setSelectedReserva(match);
        setShowCheckInModal(true);
      }
      router.replace('/recepcion');
    } else if (paramCheckout) {
      const match = reservas.find(r => String(r.id) === String(paramCheckout));
      if (match && !match.checked_out) {
        runWithSignature('checkout', (reserva) => processCheckOut(reserva), match);
      }
      router.replace('/recepcion');
    }
  }, [searchParams, reservas]);

  const distributeGuestsInRooms = (rooms: any[], numAdults: number, numChildren: number) => {
    let adultsLeft = Math.max(0, numAdults);
    let childrenLeft = Math.max(0, numChildren);
    
    const roomsWithCap = rooms.map(rm => {
      const cap = getCapacityRules(rm.roomId || rm.room, capacitySettings || undefined);
      return {
        roomId: rm.roomId || rm.room,
        unitId: rm.unitId || rm.unit_id || '',
        name: rm.name || 'Habitación',
        max: cap.max,
        base: cap.base,
        adults: 0,
        children: 0
      };
    });
    
    // Paso 1: Cada habitación seleccionada requiere al menos 1 adulto si hay adultos disponibles
    roomsWithCap.forEach(r => {
      if (adultsLeft > 0) {
        r.adults = 1;
        adultsLeft--;
      }
    });
    
    // Paso 2: Distribuir adultos hasta el límite BASE de cada habitación
    for (let r of roomsWithCap) {
      const currentTotal = r.adults + r.children;
      const spaceToBase = r.base - currentTotal;
      if (spaceToBase > 0 && adultsLeft > 0) {
        const toAdd = Math.min(spaceToBase, adultsLeft);
        r.adults += toAdd;
        adultsLeft -= toAdd;
      }
    }
    
    // Paso 3: Distribuir niños hasta el límite BASE de cada habitación
    for (let r of roomsWithCap) {
      const currentTotal = r.adults + r.children;
      const spaceToBase = r.base - currentTotal;
      if (spaceToBase > 0 && childrenLeft > 0) {
        const toAdd = Math.min(spaceToBase, childrenLeft);
        r.children += toAdd;
        childrenLeft -= toAdd;
      }
    }
    
    // Paso 4: Si todavía quedan adultos, distribuirlos hasta el límite MAX de cada habitación
    for (let r of roomsWithCap) {
      const currentTotal = r.adults + r.children;
      const spaceToMax = r.max - currentTotal;
      if (spaceToMax > 0 && adultsLeft > 0) {
        const toAdd = Math.min(spaceToMax, adultsLeft);
        r.adults += toAdd;
        adultsLeft -= toAdd;
      }
    }
    
    // Paso 5: Si todavía quedan niños, distribuirlos hasta el límite MAX de cada habitación
    for (let r of roomsWithCap) {
      const currentTotal = r.adults + r.children;
      const spaceToMax = r.max - currentTotal;
      if (spaceToMax > 0 && childrenLeft > 0) {
        const toAdd = Math.min(spaceToMax, childrenLeft);
        r.children += toAdd;
        childrenLeft -= toAdd;
      }
    }
    
    // Paso 6: Si quedan excedentes por sobrecupo, sumarlos a la última habitación
    if (adultsLeft > 0 && roomsWithCap.length > 0) {
      roomsWithCap[roomsWithCap.length - 1].adults += adultsLeft;
    }
    if (childrenLeft > 0 && roomsWithCap.length > 0) {
      roomsWithCap[roomsWithCap.length - 1].children += childrenLeft;
    }
    
    return roomsWithCap;
  };

  const calculateWalkinPrices = (res: Reserva) => {
    if (!res.check_in || !res.check_out) {
      return { totalStay: 0, roomDetails: [], suggestedDailyRate: 0 };
    }
    const diffTime = Math.abs(new Date(res.check_out).getTime() - new Date(res.check_in).getTime());
    const computedNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    
    const group = res.groupRooms && res.groupRooms.length > 0
      ? res.groupRooms
      : [{ roomId: res.room, unitId: res.unit_id || '', name: getUnitNumberFromInventory(res.room, res.unit_id || '', roomInventory) }];
    
    const distributedGuests = distributeGuestsInRooms(group, Number(res.num_adult || 1), Number(res.num_child || 0));

    let totalExtraGuests = 0;
    const roomExtraGuestsList = group.map((rm, index) => {
      const dist = distributedGuests[index] || { adults: 1, children: 0 };
      const numGuests = dist.adults + dist.children;
      const capRules = getCapacityRules(rm.roomId, capacitySettings || undefined);
      const extraGuests = Math.max(0, numGuests - capRules.base);
      totalExtraGuests += extraGuests;
      return { roomId: rm.roomId, unitId: rm.unitId || '', extraGuests };
    });

    const extraGuestPrice = capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500;
    const defaultSurchargeTotal = totalExtraGuests * extraGuestPrice;
    const activeSurchargeTotal = res.extra_guest_surcharge !== '' && res.extra_guest_surcharge !== undefined
      ? (Number(res.extra_guest_surcharge) || 0)
      : defaultSurchargeTotal;

    let totalStay = 0;
    let sumSuggestedRates = 0;

    const roomDetails = group.map((rm, index) => {
      const dist = distributedGuests[index] || { adults: 1, children: 0 };
      const numGuests = dist.adults + dist.children;
      
      const roomExtraObj = roomExtraGuestsList.find(x => x.roomId === rm.roomId && x.unitId === (rm.unitId || ''));
      const extraGuests = roomExtraObj ? roomExtraObj.extraGuests : 0;
      
      let surchargePerNight = 0;
      if (totalExtraGuests > 0) {
        surchargePerNight = (extraGuests / totalExtraGuests) * activeSurchargeTotal;
      } else if (activeSurchargeTotal > 0 && group.length > 0) {
        surchargePerNight = activeSurchargeTotal / group.length;
      }

      // Buscar tarifa dinámica en roomInventory
      const roomGroup = roomInventory.find(g => g.roomId === rm.roomId);
      const unit = roomGroup?.units?.find((u: any) => u.unitId === rm.unitId);
      const dynamicPrice = (unit && unit.price !== undefined && unit.price > 0) ? unit.price : 0;
      
      let suggestedTotalRoom = 0;
      for (let i = 0; i < computedNights; i++) {
        const curr = new Date(res.check_in + 'T12:00:00');
        curr.setDate(curr.getDate() + i);
        const dateStr = curr.toISOString().split('T')[0];
        
        const specialRule = rules.find(rule => 
          rule.room_type_id === rm.roomId && 
          rule.rule_type === 'special' && 
          rule.start_date <= dateStr && 
          rule.end_date >= dateStr
        );
        
        const seasonalRule = rules.find(rule => 
          rule.room_type_id === rm.roomId && 
          rule.rule_type === 'seasonal' && 
          rule.start_date <= dateStr && 
          rule.end_date >= dateStr
        );
        
        const baseRule = rules.find(rule => 
          rule.room_type_id === rm.roomId && 
          rule.rule_type === 'base'
        );
        
        let priceUsed = 0;
        if (dynamicPrice > 0) {
          priceUsed = dynamicPrice;
        } else if (specialRule) {
          priceUsed = Number(specialRule.price);
        } else if (seasonalRule) {
          priceUsed = Number(seasonalRule.price);
        } else if (baseRule) {
          priceUsed = Number(baseRule.price);
        } else {
          const fallbackSeason = getSeason(dateStr);
          const parentRoom = getParentMapping(rm.roomId, rm.unitId);
          priceUsed = PRICES[parentRoom.roomId]?.[fallbackSeason] || 2000;
        }
        
        let discountMult = 1.0;
        if (dynamicPrice <= 0) {
          if (computedNights >= 30) discountMult = 0.60;
          else if (computedNights >= 15) discountMult = 0.75;
          else if (computedNights >= 7) discountMult = 0.85;
        }

        const nightBase = Math.round(priceUsed * discountMult * 100) / 100;
        const nightWithChannel = Math.round(nightBase * 1.0 * 100) / 100;
        const nightTax = Math.round(nightWithChannel * 0.19 * 100) / 100;
        suggestedTotalRoom += Math.round(nightWithChannel + nightTax) + surchargePerNight;
      }
      
      const suggestedDailyRate = computedNights > 0 ? Math.round(suggestedTotalRoom / computedNights) : 0;
      sumSuggestedRates += suggestedDailyRate;

      // Detectar si el usuario modificó manualmente esta habitación específica
      const key = `${rm.roomId}_${rm.unitId || ''}`;
      const userPrice = groupRoomRates[key];
      const dailyRate = userPrice !== undefined && userPrice !== '' ? Number(userPrice) : suggestedDailyRate;
      const roomTotal = dailyRate * computedNights;
      
      totalStay += roomTotal;
      
      return {
        roomId: rm.roomId,
        unitId: rm.unitId || '',
        name: rm.name || 'Habitación',
        suggestedDailyRate,
        dailyRate,
        roomTotal,
        adults: dist.adults,
        children: dist.children
      };
    });
    
    const suggestedDailyRate = group.length > 0 ? Math.round(sumSuggestedRates / group.length) : 0;
    
    return {
      totalStay,
      roomDetails,
      suggestedDailyRate
    };
  };

  const suggestedWalkinDailyRate = useMemo(() => {
    if (!selectedReserva || selectedReserva.id !== 'walkin') return 0;
    const { suggestedDailyRate } = calculateWalkinPrices(selectedReserva);
    return suggestedDailyRate;
  }, [
    selectedReserva?.room,
    selectedReserva?.groupRooms,
    selectedReserva?.check_in,
    selectedReserva?.check_out,
    selectedReserva?.num_adult,
    selectedReserva?.num_child,
    selectedReserva?.extra_guest_surcharge,
    rules,
    groupRoomRates
  ]);

  // Recalcular precio estimado en base a la edición manual o automática
  useEffect(() => {
    if (selectedReserva?.id !== 'walkin' || !selectedReserva.check_in || !selectedReserva.check_out) return;

    const { totalStay } = calculateWalkinPrices(selectedReserva);
    
    setSelectedReserva(prev => {
      if (!prev) return null;
      if (prev.price_estimate === totalStay) return prev;
      return {
        ...prev,
        price_estimate: totalStay
      };
    });
  }, [
    selectedReserva?.room,
    selectedReserva?.groupRooms,
    selectedReserva?.check_in,
    selectedReserva?.check_out,
    selectedReserva?.num_adult,
    selectedReserva?.num_child,
    selectedReserva?.extra_guest_surcharge,
    rules,
    groupRoomRates
  ]);

  // Resetear ediciones manuales cuando cambien las habitaciones seleccionadas
  useEffect(() => {
    setIsDailyRateEdited(false);
    setIsPriceUnlocked(false);
  }, [selectedReserva?.room, selectedReserva?.unit_id, selectedReserva?.groupRooms]);

  useEffect(() => {
    if (!paymentMode) {
      setSelectedAccountId('');
      return;
    }
    // Filtrar sobres/cuentas compatibles según reglas estrictas del cliente
    const compatible = accounts.filter(acc => {
      const name = acc.name.trim().toUpperCase();
      if (paymentMode === 'efectivo') {
        return name === 'EFECTIVO';
      }
      if (paymentMode === 'tarjeta') {
        return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
      }
      if (paymentMode === 'transferencia') {
        return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
      }
      return false;
    });
    // Auto-seleccionar la primera compatible
    if (compatible.length > 0) {
      setSelectedAccountId(compatible[0].id);
    } else {
      setSelectedAccountId('');
    }
  }, [paymentMode, accounts]);

  useEffect(() => {
    if (showCheckInModal && selectedReserva && selectedReserva.id !== 'walkin') {
      if (payGroupConsolidated) {
        if (directGroupTotalBalance > 0) {
          setPaymentAmount(directGroupTotalBalance.toString());
        } else {
          setPaymentAmount('');
        }
      } else {
        const balanceVal = selectedReserva.balance !== undefined
          ? selectedReserva.balance
          : (selectedReserva.price_estimate || 0) - (selectedReserva.deposit || 0);
        
        if (balanceVal > 0) {
          setPaymentAmount(balanceVal.toString());
        } else {
          setPaymentAmount('');
        }
      }
    }
  }, [showCheckInModal, selectedReserva, payGroupConsolidated, directGroupTotalBalance]);

  useEffect(() => {
    if (selectedReserva && selectedReserva.id === 'walkin') {
      const { totalStay } = calculateWalkinPrices(selectedReserva);
      setPaymentAmount(totalStay.toString());
    }
  }, [
    selectedReserva?.room,
    selectedReserva?.groupRooms,
    selectedReserva?.check_in,
    selectedReserva?.check_out,
    selectedReserva?.num_adult,
    selectedReserva?.num_child,
    rules,
    groupRoomRates
  ]);

  const handleUnlockPrice = () => {
    if (pinInput === getAdminPin()) {
      setIsPriceUnlocked(true);
      setShowPinModal(false);
      setPinInput('');
    } else {
      alert('PIN Incorrecto');
    }
  };

  const fetchAvailability = async (checkIn: string, checkOut: string) => {
    if (!checkIn || !checkOut || checkIn >= checkOut) return;
    setCheckingAvail(true);
    try {
      const res = await fetch(`/api/availability?checkIn=${checkIn}&checkOut=${checkOut}&t=` + Date.now());
      const data = await res.json();
      if (data.success && data.inventory) {
        setRoomInventory(data.inventory);
      }
    } catch (e) {
      console.error('Error checking availability:', e);
    } finally {
      setCheckingAvail(false);
    }
  };

  const fetchData = async () => {
    try {
      const [r, t, inv, chk, acc, rms, prc, psRes, capRes] = await Promise.all([
        fetch('/api/reservas?t=' + Date.now()),
        fetch('/api/tasks?t=' + Date.now()),
        supabase.from('inventory').select('*').order('category').order('item_name'),
        supabase.from('checkins').select('*'),
        supabase.from('accounts').select('*').order('sort_index', { ascending: true }).order('name', { ascending: true }),
        supabase.from('room_status').select('*'),
        fetch('/api/precios?t=' + Date.now()).then(res => res.json()).catch(() => ({ success: false, data: [] })),
        supabase.from('settings').select('value').eq('key', 'pricing_unit_settings').maybeSingle(),
        supabase.from('settings').select('value').eq('key', 'capacity_settings').maybeSingle()
      ]);
      const rj = await r.json();
      const tj = await t.json();

      let checkinMap: Record<string, any> = {};
      if (chk.data) {
        chk.data.forEach(c => {
          checkinMap[String(c.reservation_id)] = c;
        });
      }

      if (rj.success && rj.data) {
        setReservas(prevReservas => {
          return rj.data.map((res: any) => {
            const alreadyCheckedIn = prevReservas.find(p => String(p.id) === String(res.id))?.checked_in;
            return {
              ...res,
              room: res.room_name || res.room || 'Sin asignar',
              checked_in: alreadyCheckedIn || checkinMap[String(res.id)]?.status === 'checked_in',
              checked_out: checkinMap[String(res.id)]?.status === 'checked_out',
              dni_image: checkinMap[String(res.id)]?.document_url
            };
          });
        });
      }
      if (tj.success) setTasks(tj.data);
      if (inv.data) setInventory(inv.data);
      if (acc.data) setAccounts(acc.data);
      if (rms.data) setRoomStatuses(rms.data);
      if (prc.success && prc.data) setRules(prc.data);

      // Cargar multiplicadores de canal desde Supabase (configurados en módulo de Precios)
      if (psRes.data && psRes.data.value) {
        try {
          const parsed = typeof psRes.data.value === 'string' ? JSON.parse(psRes.data.value) : psRes.data.value;
          setPricingSettings(parsed || {});
        } catch (e) {
          console.error('Error al parsear pricing_unit_settings:', e);
        }
      }

      // Cargar configuracion de capacidades desde Supabase
      if (capRes.data && capRes.data.value) {
        try {
          const parsed = typeof capRes.data.value === 'string' ? JSON.parse(capRes.data.value) : capRes.data.value;
          setCapacitySettings(parsed || null);
        } catch (e) {
          console.error('Error al parsear capacity_settings:', e);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Sintetizador de AudioContext nativo para sonido de notificación premium
  const playPremiumNotificationSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      if (!sharedAudioCtx) {
        sharedAudioCtx = new AudioContextClass();
      }
      
      const ctx = sharedAudioCtx;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const now = ctx.currentTime;
      
      // Nota 1 (C5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.12);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      
      // Nota 2 (E5) con ligero retraso
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.08);
      osc2.frequency.exponentialRampToValueAtTime(783.99, now + 0.22);
      gain2.gain.setValueAtTime(0.08, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      
      osc1.start(now);
      osc1.stop(now + 0.35);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.45);
    } catch (e) {
      console.warn('AudioContext no soportado o bloqueado por el navegador:', e);
    }
  };

  // Temporizador para auto-ocultar la notificación toast en recepción
  useEffect(() => {
    if (cleanToast) {
      const timer = setTimeout(() => setCleanToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [cleanToast]);

  useEffect(() => {
    // Desbloquear AudioContext en la primera interacción
    const unlock = () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          if (!sharedAudioCtx) {
            sharedAudioCtx = new AudioContextClass();
          }
          if (sharedAudioCtx.state === 'suspended') {
            sharedAudioCtx.resume();
          }
        }
      } catch (e) {}
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('touchstart', unlock);

    fetchData();
    const iv = setInterval(fetchData, 15000);

    // Suscripción Realtime en Supabase para cambios de estado de cuartos
    const channel = supabase
      .channel('room_status_changes_recepcion')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_status' },
        (payload) => {
          console.log('Cambio en room_status en tiempo real (Recepción):', payload);
          const updated = payload.new as any;
          if (updated && (updated.status === 'limpia' || updated.status === 'disponible')) {
            setCleanToast({
              room: updated.room_number,
              by: updated.updated_by || 'Personal'
            });
            playPremiumNotificationSound();
            fetchData(); // Sincronizar datos de inmediato sin recargar
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(iv);
      supabase.removeChannel(channel);
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  const llegadas = useMemo(() => {
    return reservas.filter(r => r.check_out > todayStr && r.check_in <= todayStr && !r.checked_in);
  }, [reservas, todayStr]);

  const salidas = useMemo(() => {
    return reservas.filter(r => r.check_out === todayStr && !r.checked_out);
  }, [reservas, todayStr]);

  const handleDniUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await compressImage(file);
    setDniPreview(b64);
    setDniFile(file);
  };

  const processCheckIn = async () => {
    if (!selectedReserva) return;
    setSubmitting(true);

    const emp = getActiveEmployee('recepcion');
    const operatorName = emp ? `${emp.full_name} (${emp.employee_num})` : 'Recepcion';

    if (selectedReserva.id === 'walkin') {
      try {
        const group = selectedReserva.groupRooms && selectedReserva.groupRooms.length > 0
          ? selectedReserva.groupRooms
          : [{ roomId: selectedReserva.room, unitId: selectedReserva.unit_id || '', name: getUnitNumberFromInventory(selectedReserva.room, selectedReserva.unit_id || '', roomInventory) }];
        
        let totalMaxCapacity = 0;
        group.forEach((rm: any) => {
          if (!rm.roomId && !rm.room) return;
          const cap = getCapacityRules(rm.roomId || rm.room, capacitySettings || undefined);
          totalMaxCapacity += cap.max;
        });

        const totalGuests = Number(selectedReserva.num_adult || 1) + Number(selectedReserva.num_child || 0);
        if (totalGuests > totalMaxCapacity) {
          alert(`⚠️ No se puede registrar la reserva porque la capacidad máxima total de las habitaciones seleccionadas es de ${totalMaxCapacity} personas. Has ingresado ${totalGuests} personas.`);
          setSubmitting(false);
          return;
        }

        const { totalStay, roomDetails } = calculateWalkinPrices(selectedReserva);
        const totalRooms = roomDetails.length;
        const totalPayment = Number(paymentAmount || 0);
        const depositPerRoom = totalRooms > 0 ? Math.round(totalPayment / totalRooms) : 0;

        const roomNamesList = roomDetails.map(r => r.name).join(', ');

        let finalDniUrl = null;
        if (dniFile) {
          const fileExt = dniFile.name.split('.').pop() || 'jpg';
          const fileName = `dni_walkin_group_${Date.now()}.${fileExt}`;
          const { data, error } = await supabase.storage.from('dni_images').upload(fileName, dniFile);
          if (!error && data) {
            const { data: publicUrlData } = supabase.storage.from('dni_images').getPublicUrl(data.path);
            finalDniUrl = publicUrlData.publicUrl;
          }
        }

        const bookedBeds24Ids: string[] = [];
        const bookedReservas: any[] = [];

        for (const room of roomDetails) {
          const bgRes = await fetch('/api/reservas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomId: room.roomId,
              unitId: room.unitId,
              checkIn: selectedReserva.check_in || todayStr,
              checkOut: selectedReserva.check_out || todayStr,
              guestName: selectedReserva.guest_name || 'Walk-In',
              isBlock: false,
              price: room.roomTotal,
              deposit: depositPerRoom,
              phone: selectedReserva.guest_phone || '',
              numAdult: room.adults,
              numChild: room.children,
              notes: selectedReserva.id === 'walkin'
                ? `${paymentDescription || ''}${roomDetails.length > 1 ? ` (Grupo: Habs ${roomNamesList})` : ''}`
                : `${selectedReserva.notes || ''}${roomDetails.length > 1 ? ` (Grupo: Habs ${roomNamesList})` : ''}`
            })
          });

          const resData = await bgRes.json();
          if (!bgRes.ok) {
            alert(`Error al registrar habitación ${room.name} en Beds24: ` + (resData.error || 'Error desconocido'));
            setSubmitting(false);
            return;
          }

          const b24Array = resData.data;
          const beds24AssignedId = (Array.isArray(b24Array) && b24Array[0]?.new?.id)
            ? String(b24Array[0].new.id)
            : (resData.data && resData.data.id ? String(resData.data.id) : `b24-${Date.now()}`);

          bookedBeds24Ids.push(beds24AssignedId);

          const roomNameHuman = getFriendlyRoomName(room.roomId, room.unitId, roomInventory);

          const { error: upsertErr } = await supabase.from('checkins').upsert({
            reservation_id: beds24AssignedId,
            guest_name: selectedReserva.guest_name,
            room: roomNameHuman,
            check_in_date: selectedReserva.check_in || todayStr,
            check_out_date: selectedReserva.check_out || todayStr,
            status: 'checked_in',
            checked_in_by: operatorName,
            document_url: finalDniUrl || null
          }, { onConflict: 'reservation_id' });

          if (upsertErr) {
            console.error(`Supabase Walkin Upsert Error para Hab ${room.name}:`, upsertErr);
            alert(`Error al registrar check-in local en Supabase para Habitación ${room.name}: ` + upsertErr.message);
            setSubmitting(false);
            return;
          }

          bookedReservas.push({
            id: beds24AssignedId,
            guest_name: selectedReserva.guest_name,
            room: roomNameHuman,
            check_in: selectedReserva.check_in || todayStr,
            check_out: selectedReserva.check_out || todayStr,
            checked_in: true,
            dni_image: finalDniUrl || undefined
          });

          if (emp) {
            await fetch('/api/employee-logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                employee_num: emp.employee_num,
                employee_name: emp.full_name,
                department: emp.department,
                module: 'recepcion',
                action: 'walk_in',
                room: roomNameHuman,
                details: `${selectedReserva.guest_name || 'Huésped'} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (Grupo: ${roomNamesList}) (ID: ${beds24AssignedId}) - Registró Walk-In.`
              })
            });
          }
        }

        setReservas(prev => [...prev, ...bookedReservas]);

        if (paymentMode && totalPayment > 0) {
          const baseDesc = `Cobro Check-in Grupo ${selectedReserva.guest_name || 'Huésped'} - Habs ${roomNamesList} (Operado por: ${operatorName}) [Reservas B24: ${bookedBeds24Ids.join(', ')}]`;

          const { data: insertedRows } = await supabase.from('finances').insert({
            type: 'ingreso',
            amount: totalPayment,
            category: 'Reserva Directa',
            description: paymentDescription ? `${paymentDescription} - ${baseDesc} [Pending Sync: B24]` : `${baseDesc} [Pending Sync: B24]`,
            payment_method: paymentMode,
            account_id: selectedAccountId || null,
            date: todayStr
          }).select();

          const insertedRecordId = insertedRows?.[0]?.id;

          if (selectedAccountId) {
            const matchedAcc = accounts.find(a => a.id === selectedAccountId);
            if (matchedAcc) {
              const newBalance = matchedAcc.balance + totalPayment;
              await supabase.from('accounts').update({ balance: newBalance }).eq('id', selectedAccountId);
            }
          }

          let allSynced = true;
          let syncErrors: string[] = [];

          for (let i = 0; i < bookedBeds24Ids.length; i++) {
            const bookId = bookedBeds24Ids[i];
            const splitAmount = i === bookedBeds24Ids.length - 1
              ? totalPayment - (depositPerRoom * (bookedBeds24Ids.length - 1))
              : depositPerRoom;

            try {
              const b24PayRes = await fetch('/api/reservas/payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bookId: bookId,
                  amount: splitAmount,
                  paymentMethod: paymentMode,
                  employeeNum: emp?.employee_num || null,
                  description: paymentDescription || null
                })
              });
              const payData = await b24PayRes.json();
              if (!b24PayRes.ok || !payData.success) {
                allSynced = false;
                syncErrors.push(`Hab ${roomDetails[i].name}: ${payData.error || 'Error desconocido'}`);
              }
            } catch (payErr: any) {
              allSynced = false;
              syncErrors.push(`Hab ${roomDetails[i].name}: ${payErr.message || payErr}`);
            }
          }

          if (allSynced && insertedRecordId) {
            await supabase.from('finances').update({
              description: paymentDescription ? `${paymentDescription} - ${baseDesc} [Synced: B24]` : `${baseDesc} [Synced: B24]`
            }).eq('id', insertedRecordId);
          } else {
            alert(`⚠️ Sincronización Beds24 incompleta:\nEl cobro local se registró con éxito en Supabase, pero Beds24 no pudo procesar los pagos de algunas habitaciones.\nDetalles:\n${syncErrors.join('\n')}\nPodrás reintentar la conciliación desde el panel de Finanzas.`);
          }

          if (emp) {
            const matchedAccName = accounts.find(a => a.id === selectedAccountId)?.name || 'Desconocido';
            await fetch('/api/employee-logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                employee_num: emp.employee_num,
                employee_name: emp.full_name,
                department: emp.department,
                module: 'recepcion',
                action: 'payment_received',
                room: `Grupo: ${roomNamesList}`,
                details: `${selectedReserva.guest_name || 'Huésped'} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (Grupo: ${roomNamesList}) (ID: ${bookedBeds24Ids.join(', ')}) - Recibió pago total de $${totalPayment} vía ${paymentMode} (Depositado en sobre: ${matchedAccName}).`
              })
            });
          }
        }

      } catch (err: any) {
        alert('Fallo de conexión al procesar reservas de grupo en Beds24: ' + err.message);
        setSubmitting(false);
        return;
      }
    } else {
      let finalDniUrl = null;
      if (dniFile) {
        const fileExt = dniFile.name.split('.').pop() || 'jpg';
        const fileName = `dni_${selectedReserva.id}_${Date.now()}.${fileExt}`;
        const { data, error } = await supabase.storage.from('dni_images').upload(fileName, dniFile);
        if (!error && data) {
          const { data: publicUrlData } = supabase.storage.from('dni_images').getPublicUrl(data.path);
          finalDniUrl = publicUrlData.publicUrl;
        }
      }

      if (payGroupConsolidated) {
        // --- PROCESO GRUPAL CONSOLIDADO ---
        const amountNum = Number(paymentAmount || 0);
        const sortedDirectRooms = [...directGroupBookings].filter(r => r.id !== selectedReserva.id);
        let allocatedSum = 0;
        const paymentSplits: Record<string, number> = {};

        sortedDirectRooms.forEach(r => {
          const rBal = r.balance !== undefined ? r.balance : Math.max(0, (r.price_estimate || 0) - (r.deposit || 0));
          const rShare = directGroupTotalBalance > 0 
            ? Math.round(amountNum * (rBal / directGroupTotalBalance)) 
            : 0;
          paymentSplits[r.id] = rShare;
          allocatedSum += rShare;
        });
        paymentSplits[selectedReserva.id] = Math.max(0, amountNum - allocatedSum);

        for (const r of groupBookings) {
          // A. Guardar check-in local en Supabase
          const { error: upsertErr } = await supabase.from('checkins').upsert({
            reservation_id: String(r.id),
            guest_name: r.guest_name,
            room: r.room,
            check_in_date: r.check_in,
            check_out_date: r.check_out,
            status: 'checked_in',
            checked_in_by: operatorName,
            document_url: finalDniUrl || null
          }, { onConflict: 'reservation_id' });

          if (upsertErr) {
            console.error(`Supabase Checkin Error para Habitación ${r.room}:`, upsertErr);
            alert(`Error al registrar check-in local para Habitación ${r.room}: ` + upsertErr.message);
            continue;
          }

          // B. Sincronizar notas si es la principal y cambiaron
          if (r.id === selectedReserva.id && checkInNotes !== (selectedReserva.notes || '')) {
            try {
              await fetch('/api/reservas', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: r.id,
                  phone: r.guest_phone || '',
                  numAdult: r.num_adult || 1,
                  numChild: r.num_child || 0,
                  price: r.price_estimate || 0,
                  deposit: r.deposit || 0,
                  notes: checkInNotes
                })
              });
            } catch (notesErr) {
              console.error('No se pudieron sincronizar notas a Beds24:', notesErr);
            }
          }

          // C. Registrar logs del empleado para check-in
          if (emp) {
            await fetch('/api/employee-logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                employee_num: emp.employee_num,
                employee_name: emp.full_name,
                department: emp.department,
                module: 'recepcion',
                action: 'check_in',
                room: r.room,
                details: `${r.guest_name || 'Huésped'} ${r.num_adult || 1}/${r.num_child || 0} (ID: ${r.id}) de la Habitación ${r.room} (Grupo Consolidado) - Registró Check-In.`
              })
            });
          }

          // D. Procesar pago
          const channel = r.channel || '';
          const isOtaAutomated = ['Airbnb', 'Booking.com'].includes(channel);

          if (isOtaAutomated) {
            let netAcc = null;
            let commAcc = null;

            if (channel === 'Airbnb') {
              netAcc = accounts.find(a => {
                const name = a.name.toUpperCase();
                return name === 'HSBC' || name === 'HSBC FISCAL' || name.includes('HSBC');
              });
              commAcc = accounts.find(a => {
                const name = a.name.toUpperCase();
                return (name.includes('COMISIO') || name.includes('COMISIÓ')) && name.includes('AIRBNB');
              });
            } else if (channel === 'Booking.com') {
              netAcc = accounts.find(a => {
                const name = a.name.toUpperCase();
                return name === 'BOOKING' || (name.includes('BOOKING') && !name.includes('COMISIO') && !name.includes('COMISIÓ'));
              });
              commAcc = accounts.find(a => {
                const name = a.name.toUpperCase();
                return (name.includes('COMISIO') || name.includes('COMISIÓ')) && name.includes('BOOKING');
              });
            }

            let netRevenue = r.expected_payout || 0;
            let commission = r.host_fee || 0;

            if (netRevenue === 0 && commission === 0) {
              const balanceVal = r.balance !== undefined
                ? r.balance
                : (r.price_estimate || 0) - (r.deposit || 0);

              const otaSplit = computeOtaSplit(
                balanceVal > 0 ? balanceVal : (r.price_estimate || 0),
                channel,
                r.room,
                r.check_in,
                r.check_out,
                rules
              );
              netRevenue = otaSplit.netRevenue;
              commission = otaSplit.commission;
            }

            const baseDesc = `${r.guest_name || 'Huésped'} (ID: ${r.id}) - Hab ${r.room} - Cobro Check-in Automático (${channel}) (Operado por: ${operatorName})`;
            let netRecordId = null;
            const netDesc = `${baseDesc} | Ingreso Neto`;

            if (netRevenue > 0) {
              const { data: netRows } = await supabase.from('finances').insert({
                type: 'ingreso',
                amount: netRevenue,
                category: 'Reserva Directa',
                description: `${netDesc} [Pending Sync: B24]`,
                payment_method: 'transferencia',
                account_id: netAcc?.id || null,
                date: todayStr
              }).select();

              netRecordId = netRows?.[0]?.id;

              if (netAcc) {
                const newBalance = netAcc.balance + netRevenue;
                await supabase.from('accounts').update({ balance: newBalance }).eq('id', netAcc.id);
              }
            }

            if (commission > 0) {
              const commDesc = `${r.guest_name || 'Huésped'} (ID: ${r.id}) - Hab ${r.room} - Comisión ${channel}`;
              await supabase.from('finances').insert({
                type: 'gasto',
                amount: commission,
                category: 'Comisiones',
                description: commDesc,
                payment_method: 'transferencia',
                account_id: commAcc?.id || null,
                date: todayStr
              });

              if (commAcc) {
                const newCommBalance = commAcc.balance + commission;
                await supabase.from('accounts').update({ balance: newCommBalance }).eq('id', commAcc.id);
              }
            }

            const totalAmount = netRevenue + commission;
            let syncedSuccess = false;
            try {
              const b24PayRes = await fetch('/api/reservas/payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bookId: r.id,
                  amount: totalAmount,
                  paymentMethod: 'transferencia',
                  employeeNum: emp?.employee_num || null,
                  description: `Cobro Check-in Automático ${channel}`
                })
              });
              const payData = await b24PayRes.json();
              if (b24PayRes.ok && payData.success) {
                syncedSuccess = true;
              }
            } catch (payErr) {
              console.error("Fallo de conexión al sincronizar pago con Beds24:", payErr);
            }

            if (syncedSuccess && netRecordId) {
              await supabase.from('finances').update({
                description: `${netDesc} [Synced: B24]`
              }).eq('id', netRecordId);
            }

            if (emp) {
              const matchedAccName = netAcc?.name || 'Desconocido';
              if (netRevenue > 0) {
                await fetch('/api/employee-logs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    employee_num: emp.employee_num,
                    employee_name: emp.full_name,
                    department: emp.department,
                    module: 'recepcion',
                    action: 'payment_received',
                    room: r.room,
                    details: JSON.stringify({
                      text: `${r.guest_name || 'Huésped'} ${r.num_adult || 1}/${r.num_child || 0} (ID: ${r.id}) de la Habitación ${r.room} - Recibió pago neto OTA (${channel})`,
                      finance: {
                        type: 'ingreso',
                        amount: netRevenue,
                        category: 'Reserva Directa',
                        account: matchedAccName,
                        description: `${r.guest_name || 'Huésped'} (ID: ${r.id}) - Hab ${r.room} - Ingreso Neto OTA (${channel})`
                      }
                    })
                  })
                });
              }

              if (commission > 0) {
                const commAccName = commAcc?.name || 'COMISIÓN AIRBNB';
                await fetch('/api/employee-logs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    employee_num: emp.employee_num,
                    employee_name: emp.full_name,
                    department: emp.department,
                    module: 'recepcion',
                    action: 'payment_received',
                    room: r.room,
                    details: JSON.stringify({
                      text: `${r.guest_name || 'Huésped'} (ID: ${r.id}) de la Habitación ${r.room} - Egreso de Comisión OTA (${channel})`,
                      finance: {
                        type: 'gasto',
                        amount: commission,
                        category: 'Comisiones',
                        account: commAccName,
                        description: `${r.guest_name || 'Huésped'} (ID: ${r.id}) - Hab ${r.room} - Comisión Egreso OTA (${channel})`
                      }
                    })
                  })
                });
              }
            }
          } else if (paymentMode) {
            // --- RESERVA DIRECTA EN GRUPO ---
            const splitAmt = paymentSplits[r.id] || 0;
            if (splitAmt > 0) {
              const baseDesc = `${r.guest_name || 'Huésped'} (ID: ${r.id}) - Hab ${r.room} - Cobro Check-in Grupo (Operado por: ${operatorName})`;
              const otaSplit = computeOtaSplit(
                splitAmt,
                r.channel || '',
                r.room,
                r.check_in,
                r.check_out,
                rules
              );

              if (otaSplit.isOTA) {
                const netDesc = `${baseDesc} | Ingreso Neto (sin comisión ${otaSplit.channelLabel})`;
                const { data: netRows } = await supabase.from('finances').insert({
                  type: 'ingreso',
                  amount: otaSplit.netRevenue,
                  category: 'Reserva Directa',
                  description: paymentDescription ? `${paymentDescription} - ${netDesc} [Pending Sync: B24]` : `${netDesc} [Pending Sync: B24]`,
                  payment_method: 'transferencia',
                  account_id: selectedAccountId || null,
                  date: todayStr
                }).select();

                const netRecordId = netRows?.[0]?.id;

                if (selectedAccountId) {
                  const matchedAcc = accounts.find(a => a.id === selectedAccountId);
                  if (matchedAcc) {
                    const newBalance = matchedAcc.balance + otaSplit.netRevenue;
                    await supabase.from('accounts').update({ balance: newBalance }).eq('id', selectedAccountId);
                  }
                }

                const commissionAcc = accounts.find(a =>
                  a.name.toUpperCase().replace(/\s+/g, ' ').includes(otaSplit.channelLabel.toUpperCase().replace('.COM', '').replace('.', '').trim())
                );

                if (otaSplit.commission > 0) {
                  await supabase.from('finances').insert({
                    type: 'gasto',
                    amount: otaSplit.commission,
                    category: 'Comisiones',
                    description: `${r.guest_name || 'Huésped'} (ID: ${r.id}) - Hab ${r.room} - Comisión ${otaSplit.channelLabel}`,
                    payment_method: 'transferencia',
                    account_id: commissionAcc?.id || null,
                    date: todayStr
                  });

                  if (commissionAcc) {
                    const newCommBalance = commissionAcc.balance + otaSplit.commission;
                    await supabase.from('accounts').update({ balance: newCommBalance }).eq('id', commissionAcc.id);
                  }
                }

                let syncedSuccess = false;
                try {
                  const b24PayRes = await fetch('/api/reservas/payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      bookId: r.id,
                      amount: splitAmt,
                      paymentMethod: paymentMode,
                      employeeNum: emp?.employee_num || null,
                      description: paymentDescription || null
                    })
                  });
                  const payData = await b24PayRes.json();
                  if (b24PayRes.ok && payData.success) {
                    syncedSuccess = true;
                  }
                } catch (payErr) {
                  console.error("Fallo de conexión al sincronizar pago con Beds24:", payErr);
                }

                if (syncedSuccess && netRecordId) {
                  await supabase.from('finances').update({
                    description: paymentDescription ? `${paymentDescription} - ${netDesc} [Synced: B24]` : `${netDesc} [Synced: B24]`
                  }).eq('id', netRecordId);
                }

                if (emp) {
                  const matchedAccName = accounts.find(a => a.id === selectedAccountId)?.name || 'Desconocido';
                  if (otaSplit.netRevenue > 0) {
                    await fetch('/api/employee-logs', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        employee_num: emp.employee_num,
                        employee_name: emp.full_name,
                        department: emp.department,
                        module: 'recepcion',
                        action: 'payment_received',
                        room: r.room,
                        details: JSON.stringify({
                          text: `${r.guest_name || 'Huésped'} ${r.num_adult || 1}/${r.num_child || 0} (ID: ${r.id}) de la Habitación ${r.room} (Grupo Consolidado) - Recibió pago neto OTA (${otaSplit.channelLabel})`,
                          finance: {
                            type: 'ingreso',
                            amount: otaSplit.netRevenue,
                            category: 'Reserva Directa',
                            account: matchedAccName,
                            description: `${r.guest_name || 'Huésped'} (ID: ${r.id}) - Hab ${r.room} - Ingreso Neto OTA (${otaSplit.channelLabel})`
                          }
                        })
                      })
                    });
                  }

                  if (otaSplit.commission > 0) {
                    const commAccName = commissionAcc?.name || 'COMISIÓN AIRBNB';
                    await fetch('/api/employee-logs', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        employee_num: emp.employee_num,
                        employee_name: emp.full_name,
                        department: emp.department,
                        module: 'recepcion',
                        action: 'payment_received',
                        room: r.room,
                        details: JSON.stringify({
                          text: `${r.guest_name || 'Huésped'} (ID: ${r.id}) de la Habitación ${r.room} (Grupo Consolidado) - Egreso de Comisión OTA (${otaSplit.channelLabel})`,
                          finance: {
                            type: 'gasto',
                            amount: otaSplit.commission,
                            category: 'Comisiones',
                            account: commAccName,
                            description: `${r.guest_name || 'Huésped'} (ID: ${r.id}) - Hab ${r.room} - Comisión Egreso OTA (${otaSplit.channelLabel})`
                          }
                        })
                      })
                    });
                  }
                }
              } else {
                // Directo puro
                const { data: insertedRows } = await supabase.from('finances').insert({
                  type: 'ingreso',
                  amount: splitAmt,
                  category: 'Reserva Directa',
                  description: paymentDescription ? `${paymentDescription} - ${baseDesc} [Pending Sync: B24]` : `${baseDesc} [Pending Sync: B24]`,
                  payment_method: paymentMode,
                  account_id: selectedAccountId || null,
                  date: todayStr
                }).select();

                const insertedRecordId = insertedRows?.[0]?.id;

                if (selectedAccountId) {
                  const matchedAcc = accounts.find(a => a.id === selectedAccountId);
                  if (matchedAcc) {
                    const newBalance = matchedAcc.balance + splitAmt;
                    await supabase.from('accounts').update({ balance: newBalance }).eq('id', selectedAccountId);
                  }
                }

                let syncedSuccess = false;
                try {
                  const b24PayRes = await fetch('/api/reservas/payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      bookId: r.id,
                      amount: splitAmt,
                      paymentMethod: paymentMode,
                      employeeNum: emp?.employee_num || null,
                      description: paymentDescription || null
                    })
                  });
                  const payData = await b24PayRes.json();
                  if (b24PayRes.ok && payData.success) {
                    syncedSuccess = true;
                  }
                } catch (payErr) {
                  console.error("Fallo de conexión al sincronizar pago con Beds24:", payErr);
                }

                if (syncedSuccess && insertedRecordId) {
                  await supabase.from('finances').update({
                    description: paymentDescription ? `${paymentDescription} - ${baseDesc} [Synced: B24]` : `${baseDesc} [Synced: B24]`
                  }).eq('id', insertedRecordId);
                }

                if (emp) {
                  const matchedAccName = accounts.find(a => a.id === selectedAccountId)?.name || 'Desconocido';
                  await fetch('/api/employee-logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      employee_num: emp.employee_num,
                      employee_name: emp.full_name,
                      department: emp.department,
                      module: 'recepcion',
                      action: 'payment_received',
                      room: r.room,
                      details: `${r.guest_name || 'Huésped'} ${r.num_adult || 1}/${r.num_child || 0} (ID: ${r.id}) de la Habitación ${r.room} (Grupo Consolidado) - Recibió pago de $${splitAmt} vía ${paymentMode} (Depositado en sobre: ${matchedAccName}).`
                    })
                  });
                }
              }
            }
          }
        }

        const groupIds = groupBookings.map(g => g.id);
        setReservas(prev => prev.map(r => groupIds.includes(r.id) ? { ...r, checked_in: true, dni_image: finalDniUrl || undefined, notes: r.id === selectedReserva.id ? checkInNotes : r.notes } : r));
      } else {
        // --- PROCESO INDIVIDUAL ESTÁNDAR ---
        const { error: upsertErr } = await supabase.from('checkins').upsert({
          reservation_id: String(selectedReserva.id),
          guest_name: selectedReserva.guest_name,
          room: selectedReserva.room,
          check_in_date: selectedReserva.check_in,
          check_out_date: selectedReserva.check_out,
          status: 'checked_in',
          checked_in_by: operatorName,
          document_url: finalDniUrl || null
        }, { onConflict: 'reservation_id' });

        if (upsertErr) {
          console.error("Supabase Checkin Error:", upsertErr);
          alert("Fallo al guardar el Check-In en la base de datos: " + upsertErr.message);
          setSubmitting(false);
          return;
        }

        if (checkInNotes !== (selectedReserva.notes || '')) {
          try {
            await fetch('/api/reservas', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: selectedReserva.id,
                phone: selectedReserva.guest_phone || '',
                numAdult: selectedReserva.num_adult || 1,
                numChild: selectedReserva.num_child || 0,
                price: selectedReserva.price_estimate || 0,
                deposit: selectedReserva.deposit || 0,
                notes: checkInNotes
              })
            });
          } catch (notesErr) {
            console.error('No se pudieron sincronizar notas a Beds24:', notesErr);
          }
        }

        setReservas(prev => prev.map(r => r.id === selectedReserva.id ? { ...r, checked_in: true, dni_image: finalDniUrl || undefined, notes: checkInNotes } : r));

        if (emp) {
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_num: emp.employee_num,
              employee_name: emp.full_name,
              department: emp.department,
              module: 'recepcion',
              action: 'check_in',
              room: selectedReserva.room,
              details: `${selectedReserva.guest_name || 'Huésped'} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room} - Registró Check-In.`
            })
          });
        }

        const channel = selectedReserva.channel || '';
        const isOtaAutomated = ['Airbnb', 'Booking.com'].includes(channel);

        if (isOtaAutomated) {
          let netAcc = null;
          let commAcc = null;

          if (channel === 'Airbnb') {
            netAcc = accounts.find(a => {
              const name = a.name.toUpperCase();
              return name === 'HSBC' || name === 'HSBC FISCAL' || name.includes('HSBC');
            });
            commAcc = accounts.find(a => {
              const name = a.name.toUpperCase();
              return (name.includes('COMISIO') || name.includes('COMISIÓ')) && name.includes('AIRBNB');
            });
          } else if (channel === 'Booking.com') {
            netAcc = accounts.find(a => {
              const name = a.name.toUpperCase();
              return name === 'BOOKING' || (name.includes('BOOKING') && !name.includes('COMISIO') && !name.includes('COMISIÓ'));
            });
            commAcc = accounts.find(a => {
              const name = a.name.toUpperCase();
              return (name.includes('COMISIO') || name.includes('COMISIÓ')) && name.includes('BOOKING');
            });
          }

          let netRevenue = selectedReserva.expected_payout || 0;
          let commission = selectedReserva.host_fee || 0;

          if (netRevenue === 0 && commission === 0) {
            const balanceVal = selectedReserva.balance !== undefined
              ? selectedReserva.balance
              : (selectedReserva.price_estimate || 0) - (selectedReserva.deposit || 0);

            const otaSplit = computeOtaSplit(
              balanceVal > 0 ? balanceVal : (selectedReserva.price_estimate || 0),
              channel,
              selectedReserva.room,
              selectedReserva.check_in,
              selectedReserva.check_out,
              rules
            );
            netRevenue = otaSplit.netRevenue;
            commission = otaSplit.commission;
          }

          const baseDesc = `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Cobro Check-in Automático (${channel}) (Operado por: ${operatorName})`;

          let netRecordId = null;
          const netDesc = `${baseDesc} | Ingreso Neto`;

          if (netRevenue > 0) {
            const { data: netRows } = await supabase.from('finances').insert({
              type: 'ingreso',
              amount: netRevenue,
              category: 'Reserva Directa',
              description: `${netDesc} [Pending Sync: B24]`,
              payment_method: 'transferencia',
              account_id: netAcc?.id || null,
              date: todayStr
            }).select();

            netRecordId = netRows?.[0]?.id;

            if (netAcc) {
              const newBalance = netAcc.balance + netRevenue;
              await supabase.from('accounts').update({ balance: newBalance }).eq('id', netAcc.id);
            }
          }

          if (commission > 0) {
            const commDesc = `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Comisión ${channel}`;
            await supabase.from('finances').insert({
              type: 'gasto',
              amount: commission,
              category: 'Comisiones',
              description: commDesc,
              payment_method: 'transferencia',
              account_id: commAcc?.id || null,
              date: todayStr
            });

            if (commAcc) {
              const newCommBalance = commAcc.balance + commission;
              await supabase.from('accounts').update({ balance: newCommBalance }).eq('id', commAcc.id);
            }
          }

          const totalAmount = netRevenue + commission;
          let syncedSuccess = false;
          try {
            const b24PayRes = await fetch('/api/reservas/payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bookId: selectedReserva.id,
                amount: totalAmount,
                paymentMethod: 'transferencia',
                employeeNum: emp?.employee_num || null,
                description: `Cobro Check-in Automático ${channel}`
              })
            });
            const payData = await b24PayRes.json();
            if (b24PayRes.ok && payData.success) {
              syncedSuccess = true;
            }
          } catch (payErr) {
            console.error("Fallo de conexión al sincronizar pago con Beds24:", payErr);
          }

          if (syncedSuccess && netRecordId) {
            await supabase.from('finances').update({
              description: `${netDesc} [Synced: B24]`
            }).eq('id', netRecordId);
          }

          if (emp) {
            const matchedAccName = netAcc?.name || 'Desconocido';
            if (netRevenue > 0) {
              await fetch('/api/employee-logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  employee_num: emp.employee_num,
                  employee_name: emp.full_name,
                  department: emp.department,
                  module: 'recepcion',
                  action: 'payment_received',
                  room: selectedReserva.room,
                  details: JSON.stringify({
                    text: `${selectedReserva.guest_name || 'Huésped'} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room} - Recibió pago neto OTA (${channel})`,
                    finance: {
                      type: 'ingreso',
                      amount: netRevenue,
                      category: 'Reserva Directa',
                      account: matchedAccName,
                      description: `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Ingreso Neto OTA (${channel})`
                    }
                  })
                })
              });
            }

            if (commission > 0) {
              const commAccName = commAcc?.name || 'COMISIÓN AIRBNB';
              await fetch('/api/employee-logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  employee_num: emp.employee_num,
                  employee_name: emp.full_name,
                  department: emp.department,
                  module: 'recepcion',
                  action: 'payment_received',
                  room: selectedReserva.room,
                  details: JSON.stringify({
                    text: `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room} - Egreso de Comisión OTA (${channel})`,
                    finance: {
                      type: 'gasto',
                      amount: commission,
                      category: 'Comisiones',
                      account: commAccName,
                      description: `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Comisión Egreso OTA (${channel})`
                    }
                  })
                })
              });
            }
          }
        } else if (paymentMode && paymentAmount) {
          const amountNum = Number(paymentAmount);
          const baseDesc = `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Cobro Check-in (Operado por: ${operatorName})`;

          const otaSplit = computeOtaSplit(
            amountNum,
            selectedReserva.channel || '',
            selectedReserva.room,
            selectedReserva.check_in,
            selectedReserva.check_out,
            rules
          );

          if (otaSplit.isOTA) {
            const netDesc = `${baseDesc} | Ingreso Neto (sin comisión ${otaSplit.channelLabel})`;
            const { data: netRows } = await supabase.from('finances').insert({
              type: 'ingreso',
              amount: otaSplit.netRevenue,
              category: 'Reserva Directa',
              description: paymentDescription ? `${paymentDescription} - ${netDesc} [Pending Sync: B24]` : `${netDesc} [Pending Sync: B24]`,
              payment_method: 'transferencia',
              account_id: selectedAccountId || null,
              date: todayStr
            }).select();

            const netRecordId = netRows?.[0]?.id;

            if (selectedAccountId) {
              const matchedAcc = accounts.find(a => a.id === selectedAccountId);
              if (matchedAcc) {
                const newBalance = matchedAcc.balance + otaSplit.netRevenue;
                await supabase.from('accounts').update({ balance: newBalance }).eq('id', selectedAccountId);
              }
            }

            const commissionAcc = accounts.find(a =>
              a.name.toUpperCase().replace(/\s+/g, ' ').includes(otaSplit.channelLabel.toUpperCase().replace('.COM', '').replace('.', '').trim())
            );

            if (otaSplit.commission > 0) {
              await supabase.from('finances').insert({
                type: 'gasto',
                amount: otaSplit.commission,
                category: 'Comisiones',
                description: `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Comisión ${otaSplit.channelLabel}`,
                payment_method: 'transferencia',
                account_id: commissionAcc?.id || null,
                date: todayStr
              });

              if (commissionAcc) {
                const newCommBalance = commissionAcc.balance + otaSplit.commission;
                await supabase.from('accounts').update({ balance: newCommBalance }).eq('id', commissionAcc.id);
              }
            }

            let syncedSuccess = false;
            try {
              const b24PayRes = await fetch('/api/reservas/payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bookId: selectedReserva.id,
                  amount: amountNum,
                  paymentMethod: paymentMode,
                  employeeNum: emp?.employee_num || null,
                  description: paymentDescription || null
                })
              });
              const payData = await b24PayRes.json();
              if (b24PayRes.ok && payData.success) {
                syncedSuccess = true;
              } else {
                console.error("Fallo de sincronización Beds24 de pago:", payData.error || 'Error desconocido');
                alert(`⚠️ Sincronización Beds24 incompleta:\nEl cobro local se registró con éxito en Supabase, pero Beds24 no pudo procesar el pago.\nDetalle: ${payData.error || 'Error desconocido'}.\nPodrás reintentar la conciliación desde el panel de Finanzas.`);
              }
            } catch (payErr: any) {
              console.error("Fallo de conexión al sincronizar pago con Beds24:", payErr);
              alert(`⚠️ Error de Red / Conexión Beds24:\nEl cobro local se registró correctamente en Supabase, pero falló el envío a Beds24 debido a problemas de red.\nDetalle: ${payErr.message || payErr}.\nPodrás reintentar la conciliación desde el panel de Finanzas.`);
            }

            if (syncedSuccess && netRecordId) {
              await supabase.from('finances').update({
                description: paymentDescription ? `${paymentDescription} - ${netDesc} [Synced: B24]` : `${netDesc} [Synced: B24]`
              }).eq('id', netRecordId);
            }

            if (emp) {
              const matchedAccName = accounts.find(a => a.id === selectedAccountId)?.name || 'Desconocido';
              if (otaSplit.netRevenue > 0) {
                await fetch('/api/employee-logs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    employee_num: emp.employee_num,
                    employee_name: emp.full_name,
                    department: emp.department,
                    module: 'recepcion',
                    action: 'payment_received',
                    room: selectedReserva.room,
                    details: JSON.stringify({
                      text: `${selectedReserva.guest_name || 'Huésped'} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room} - Recibió pago neto OTA (${otaSplit.channelLabel})`,
                      finance: {
                        type: 'ingreso',
                        amount: otaSplit.netRevenue,
                        category: 'Reserva Directa',
                        account: matchedAccName,
                        description: `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Ingreso Neto OTA (${otaSplit.channelLabel})`
                      }
                    })
                  })
                });
              }

              if (otaSplit.commission > 0) {
                const commAccName = commissionAcc?.name || 'COMISIÓN AIRBNB';
                await fetch('/api/employee-logs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    employee_num: emp.employee_num,
                    employee_name: emp.full_name,
                    department: emp.department,
                    module: 'recepcion',
                    action: 'payment_received',
                    room: selectedReserva.room,
                    details: JSON.stringify({
                      text: `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room} - Egreso de Comisión OTA (${otaSplit.channelLabel})`,
                      finance: {
                        type: 'gasto',
                        amount: otaSplit.commission,
                        category: 'Comisiones',
                        account: commAccName,
                        description: `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Comisión Egreso OTA (${otaSplit.channelLabel})`
                      }
                    })
                  })
                });
              }
            }
          } else {
            const { data: insertedRows } = await supabase.from('finances').insert({
              type: 'ingreso',
              amount: amountNum,
              category: 'Reserva Directa',
              description: paymentDescription ? `${paymentDescription} - ${baseDesc} [Pending Sync: B24]` : `${baseDesc} [Pending Sync: B24]`,
              payment_method: paymentMode,
              account_id: selectedAccountId || null,
              date: todayStr
            }).select();

            const insertedRecordId = insertedRows?.[0]?.id;

            if (selectedAccountId) {
              const matchedAcc = accounts.find(a => a.id === selectedAccountId);
              if (matchedAcc) {
                const newBalance = matchedAcc.balance + amountNum;
                await supabase.from('accounts').update({ balance: newBalance }).eq('id', selectedAccountId);
              }
            }

            let syncedSuccess = false;
            try {
              const b24PayRes = await fetch('/api/reservas/payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bookId: selectedReserva.id,
                  amount: amountNum,
                  paymentMethod: paymentMode,
                  employeeNum: emp?.employee_num || null,
                  description: paymentDescription || null
                })
              });
              const payData = await b24PayRes.json();
              if (b24PayRes.ok && payData.success) {
                syncedSuccess = true;
              } else {
                console.error("Fallo de sincronización Beds24 de pago:", payData.error || 'Error desconocido');
                alert(`⚠️ Sincronización Beds24 incompleta:\nEl cobro local se registró con éxito en Supabase, pero Beds24 no pudo procesar el pago.\nDetalle: ${payData.error || 'Error desconocido'}.\nPodrás reintentar la conciliación desde el panel de Finanzas.`);
              }
            } catch (payErr: any) {
              console.error("Fallo de conexión al sincronizar pago con Beds24:", payErr);
              alert(`⚠️ Error de Red / Conexión Beds24:\nEl cobro local se registró correctamente en Supabase, pero falló el envío a Beds24 debido a problemas de red.\nDetalle: ${payErr.message || payErr}.\nPodrás reintentar la conciliación desde el panel de Finanzas.`);
            }

            if (syncedSuccess && insertedRecordId) {
              await supabase.from('finances').update({
                description: paymentDescription ? `${paymentDescription} - ${baseDesc} [Synced: B24]` : `${baseDesc} [Synced: B24]`
              }).eq('id', insertedRecordId);
            }

            if (emp) {
              const matchedAccName = accounts.find(a => a.id === selectedAccountId)?.name || 'Desconocido';
              await fetch('/api/employee-logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  employee_num: emp.employee_num,
                  employee_name: emp.full_name,
                  department: emp.department,
                  module: 'recepcion',
                  action: 'payment_received',
                  room: selectedReserva.room,
                  details: `${selectedReserva.guest_name || 'Huésped'} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room} - Recibió pago de $${paymentAmount} vía ${paymentMode} (Depositado en sobre: ${matchedAccName}).`
                })
              });
            }
          }
        }
      }
    }

    setShowCheckInModal(false);
    setSelectedReserva(null);
    setDniPreview(null);
    setDniFile(null);
    setPaymentMode(null);
    setPaymentAmount('');
    setPaymentDescription('');
    setCheckInNotes('');
    setSelectedAccountId('');
    setSubmitting(false);
    fetchData();
  };

  const processCheckOut = async (r: Reserva) => {
    // Marcar como checked_out localmente
    setReservas(prev => prev.map(res => res.id === r.id ? { ...res, checked_out: true } : res));

    const emp = getActiveEmployee('recepcion');
    const operatorName = emp ? `${emp.full_name} (${emp.employee_num})` : 'Recepcion';

    const { error } = await supabase.from('checkins').upsert({
      reservation_id: String(r.id),
      guest_name: r.guest_name,
      room: r.room,
      check_in_date: r.check_in,
      check_out_date: r.check_out,
      status: 'checked_out',
      checked_in_by: operatorName
    }, { onConflict: 'reservation_id' });

    if (error) {
      alert('Error al guardar Check-Out en base de datos: ' + error.message);
      return;
    }

    // ── TRIGGER LIMPIEZA ROBUSTO ──
    const parenMatch = (r.room || '').match(/\(([^)]+)\)/);
    let roomNumber = parenMatch ? parenMatch[1] : null;
    if (!roomNumber) {
      const genericMatch = (r.room || '').match(/([A-Z]?\d+)/i);
      roomNumber = genericMatch ? genericMatch[1] : (r.room || 'General');
    }

    if (roomNumber) {
      await fetch('/api/room-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_number: roomNumber,
          status: 'sucio_checkout',
          updated_by: operatorName,
          checkout_reservation_id: String(r.id),
          guest_name: r.guest_name,
        }),
      });
    }

    // Crear tarea de limpieza automática
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'limpieza',
        room: r.room || 'General',
        description: `Check-out completado. Habitación ${r.room} lista para limpieza.`,
        reported_by: operatorName,
        direction: 'staff_to_staff',
        status: 'pendiente'
      }),
    });

    // Registrar log en Supabase
    if (emp) {
      await fetch('/api/employee-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_num: emp.employee_num,
          employee_name: emp.full_name,
          department: emp.department,
          module: 'recepcion',
          action: 'check_out',
          room: r.room,
          details: `${r.guest_name || 'Huésped'} ${r.num_adult || 1}/${r.num_child || 0} (ID: ${r.id}) de la Habitación ${r.room || 'General'} - Procesó Check-Out.`
        })
      });
    }

    fetchData();
    alert(`Check-out de ${r.guest_name} completado. Habitación ${roomNumber} marcada en limpieza.`);
  };

  const updateStock = async (id: string, currentStock: number, change: number) => {
    if (currentStock + change < 0) return;
    setInventory(prev => prev.map(item => item.id === id ? { ...item, stock: item.stock + change } : item));
    await supabase.from('inventory').update({ stock: currentStock + change, last_updated_by: staffName }).eq('id', id);
  };

  // Extraer la habitación/unidad para mostrarla elegante
  const getUnitDisplay = (roomStr: string) => {
    if (!roomStr) return '';
    const parenMatch = roomStr.match(/\(([^)]+)\)/);
    if (parenMatch) return parenMatch[1];
    const numMatch = roomStr.match(/(\d+)\s*$/);
    if (numMatch) return numMatch[1];
    return roomStr;
  };

  return (
    <div className="space-y-6 pb-28 bg-[#fafafa] min-h-screen">

      {/* Floating Realtime Clean Notification Toast */}
      {cleanToast && (
        <div className="fixed top-6 right-6 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300 max-w-sm w-full bg-zinc-950 text-white rounded-2xl shadow-2xl border border-zinc-800 p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
            <Sparkles size={20} className="animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-black text-white">Habitación Limpia</p>
              <button onClick={() => setCleanToast(null)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
            <p className="text-[12px] text-zinc-300 mt-1 leading-relaxed">
              La **Habitación {cleanToast.room}** ha sido marcada como limpia y está **lista para check-in inmediato**.
            </p>
            <div className="flex items-center gap-1.5 mt-2 text-[10px] font-black text-emerald-400 uppercase tracking-wider">
              <CheckCircle2 size={11} />
              <span>Por {cleanToast.by}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-[22px] font-bold text-zinc-900 tracking-tight">Recepción</h2>
            
            {/* Header Badge de Empleado Activo */}
            {activeEmployee ? (
              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-full py-1 px-3 shadow-sm transition-all duration-300 hover:bg-emerald-100/50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-bold text-emerald-800 tracking-tight">
                  👤 {activeEmployee.full_name.split(' ')[0]} ({activeEmployee.employee_num})
                </span>
                <button
                  onClick={() => {
                    clearActiveEmployee('recepcion');
                    setActiveEmployeeState(null);
                    setShowEmployeeModal(true);
                  }}
                  className="text-emerald-500 hover:text-emerald-700 font-extrabold text-[10px] ml-1.5 pl-1.5 border-l border-emerald-200 transition-colors cursor-pointer"
                  title="Cerrar turno de recepcionista"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowEmployeeModal(true)}
                className="inline-flex items-center gap-1.5 bg-white text-zinc-700 hover:text-zinc-950 border border-zinc-200 hover:border-zinc-300 text-[11px] font-bold py-1.5 px-3.5 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-sm hover:shadow duration-150 select-none"
              >
                <UserPlus size={13} strokeWidth={2.2} className="text-emerald-500" />
                <span>Firmar Turno</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
            <span className="text-[13px] font-medium text-zinc-500 capitalize">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}
            </span>
          </div>
        </div>
        <button
          onClick={() => {
            setForm({ type: 'mantenimiento', room: 'General', description: '' });
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-extrabold tracking-wider uppercase py-2.5 px-4 rounded-xl shadow-md shadow-rose-200 active:scale-95 transition-all cursor-pointer"
        >
          <Wrench size={13} strokeWidth={2.5} />
          <span>Reportar Mtto.</span>
        </button>
      </div>

      {/* ── MAIN TABS ───────────────────────────────────────────────────── */}
      <div className="bg-zinc-100 p-1 rounded-2xl flex gap-1.5 max-w-sm">
        <button
          onClick={() => setMainTab('recepcion')}
          className={`flex-1 py-2.5 text-[13px] font-bold rounded-xl transition-all ${
            mainTab === 'recepcion'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Check-in / Check-out
        </button>
        <button
          onClick={() => setMainTab('inventario')}
          className={`flex-1 py-2.5 text-[13px] font-bold rounded-xl transition-all ${
            mainTab === 'inventario'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Inventario
        </button>
      </div>

      {mainTab === 'recepcion' && (
        <div className="space-y-6">

          {/* ── KPIs DE HOY (Replicado de Admin pero seguro) ────────────────── */}
          <div className="grid grid-cols-3 gap-2">
            <button 
              onClick={() => setKpiModalType('encasa')}
              className="bg-white border border-zinc-200/80 rounded-2xl p-3 text-center shadow-sm cursor-pointer hover:bg-zinc-50/50 hover:border-zinc-300 active:scale-95 transition-all outline-none"
            >
              <p className="text-[20px] font-bold text-zinc-900">
                {reservas.filter(r => r.check_out > todayStr && r.checked_in).length}
              </p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">En casa</p>
            </button>
            <button 
              onClick={() => setKpiModalType('llegan')}
              className="bg-white border border-zinc-200/80 rounded-2xl p-3 text-center shadow-sm cursor-pointer hover:bg-zinc-50/50 hover:border-zinc-300 active:scale-95 transition-all outline-none"
            >
              <p className="text-[20px] font-bold text-emerald-600">
                {reservas.filter(r => r.check_in === todayStr).length}
              </p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Llegan hoy</p>
            </button>
            <button 
              onClick={() => setKpiModalType('salen')}
              className="bg-white border border-zinc-200/80 rounded-2xl p-3 text-center shadow-sm cursor-pointer hover:bg-zinc-50/50 hover:border-zinc-300 active:scale-95 transition-all outline-none"
            >
              <p className="text-[20px] font-bold text-amber-500">
                {reservas.filter(r => r.check_out === todayStr).length}
              </p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Salen hoy</p>
            </button>
          </div>

          {/* ── BOTONES DE ACCIÓN RÁPIDA ─────────────────────────────────── */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setRoomInventory([]);
                setSelectedReserva({
                  id: 'walkin',
                  room: '',
                  unit_id: '',
                  groupRooms: [],
                  check_in: todayStr,
                  check_out: tomorrowStr,
                  guest_name: '',
                  guest_phone: '',
                  num_adult: 1,
                  num_child: 0,
                  notes: '',
                  extra_guest_surcharge: ''
                });
                setShowCheckInModal(true);
                fetchAvailability(todayStr, tomorrowStr);
              }}
              className="flex-1 bg-zinc-900 hover:bg-black text-white rounded-2xl p-4 flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] shadow-md cursor-pointer"
            >
              <UserPlus size={18} strokeWidth={2.5} />
              <span className="text-[14px] font-black tracking-tight">Registrar Walk-In</span>
            </button>
          </div>

          {/* ── TABLA DE LLEGADAS DE HOY (7 Columnas Requeridas) ────────────────── */}
          <div className="bg-white border border-zinc-200/80 rounded-[24px] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50/50">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                  <h3 className="text-[12px] font-extrabold text-zinc-800 uppercase tracking-wider">
                    Pendientes Check-In
                  </h3>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-100">
                  {llegadas.length} pendientes
                </span>
              </div>
            </div>

            {llegadas.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">
                No hay check-ins pendientes.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[850px]">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50/30">
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Unidad</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Huésped</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Teléfono</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Pax</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Noches</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Total</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Tarifa</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Adeudo</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {llegadas.map(r => {
                      const paxTotal = (r.num_adult || 1) + (r.num_child || 0);
                      const unit = getUnitDisplay(r.room);
                      const isPending = !r.checked_in;
                      const dailyRate = r.price_per_night || (r.price_estimate && r.nights ? Math.round(r.price_estimate / r.nights) : 0);
                      const balanceVal = r.balance !== undefined ? r.balance : ((r.price_estimate || 0) - (r.deposit || 0));
                      return (
                        <tr
                          key={r.id}
                          onClick={() => {
                            if (isPending) {
                              setSelectedReserva(r);
                              setShowCheckInModal(true);
                            }
                          }}
                          className={`hover:bg-zinc-50/50 transition-colors ${
                            isPending ? 'cursor-pointer' : ''
                          }`}
                        >
                          <td className="py-4 px-4">
                            <span className="inline-flex items-center justify-center font-extrabold text-[12px] bg-zinc-900 text-white rounded-lg px-2.5 py-1 min-w-[36px]">
                              {unit}
                            </span>
                          </td>
                          <td className="py-4 px-4 font-semibold text-zinc-950 text-[13px] max-w-[140px] truncate">
                            {r.guest_name}
                          </td>
                          <td className="py-4 px-4 text-[12px] text-zinc-500 font-medium">
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
                          <td className="py-4 px-4 text-center text-[12px] font-semibold text-zinc-700">
                            <span className="inline-flex items-center gap-1">
                              <Users size={12} className="text-zinc-400" />
                              {paxTotal}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-center text-[12px] font-semibold text-zinc-700">
                            <span className="inline-flex items-center gap-1">
                              <Moon size={12} className="text-zinc-400" />
                              {r.nights || 1}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right font-bold text-zinc-900 text-[13px]">
                            {r.price_estimate !== undefined ? fmtCurrency(r.price_estimate, r.guest_name) : '—'}
                          </td>
                          <td className="py-4 px-4 text-right font-semibold text-zinc-600 text-[13px]">
                            {dailyRate !== undefined ? fmtCurrency(dailyRate, r.guest_name) : '—'}
                          </td>
                          <td className="py-4 px-4 text-right text-[13px]">
                            {balanceVal > 0 ? (
                              <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                                {fmtCurrency(balanceVal, r.guest_name)}
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                {fmtCurrency(0, r.guest_name)}
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-center">
                            {r.checked_in ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-100">
                                <CheckCircle2 size={12} /> En Casa
                              </span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedReserva(r);
                                  setShowCheckInModal(true);
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] py-1.5 px-3 rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                              >
                                Check-In
                              </button>
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

          {/* ── TABLA DE CHECK-OUTS DE HOY ─────────────────────────────── */}
          <div className="bg-white border border-zinc-200/80 rounded-[24px] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50/50">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <h3 className="text-[12px] font-extrabold text-zinc-800 uppercase tracking-wider">
                    Pendientes por Salir
                  </h3>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-100">
                  {salidas.length} pendientes
                </span>
              </div>
            </div>

            {salidas.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">
                No hay salidas pendientes para hoy.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[850px]">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50/30">
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Unidad</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Huésped</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Teléfono</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Noches</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Total</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Tarifa</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Estado</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {salidas.map(r => {
                      const unit = getUnitDisplay(r.room);
                      const isPending = !r.checked_out;
                      const dailyRate = r.price_per_night || (r.price_estimate && r.nights ? Math.round(r.price_estimate / r.nights) : 0);
                      return (
                        <tr 
                          key={r.id} 
                          onClick={() => {
                            setSelectedReserva(r);
                            setShowCheckInModal(true);
                          }}
                          className="hover:bg-zinc-50/30 cursor-pointer transition-colors"
                        >
                          <td className="py-4 px-4">
                            <span className="inline-flex items-center justify-center font-extrabold text-[12px] bg-zinc-900 text-white rounded-lg px-2.5 py-1 min-w-[36px]">
                              {unit}
                            </span>
                          </td>
                          <td className="py-4 px-4 font-semibold text-zinc-950 text-[13px] max-w-[140px] truncate">
                            {r.guest_name}
                          </td>
                          <td className="py-4 px-4 text-[12px] text-zinc-500 font-medium">
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
                          <td className="py-4 px-4 text-center text-[12px] font-semibold text-zinc-700">
                            {r.nights || 1}n
                          </td>
                          <td className="py-4 px-4 text-right font-bold text-zinc-900 text-[13px]">
                            {r.price_estimate !== undefined ? fmtCurrency(r.price_estimate, r.guest_name) : '—'}
                          </td>
                          <td className="py-4 px-4 text-right font-semibold text-zinc-600 text-[13px]">
                            {dailyRate !== undefined ? fmtCurrency(dailyRate, r.guest_name) : '—'}
                          </td>
                          <td className="py-4 px-4 text-center">
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
                          <td className="py-4 px-4 text-center">
                            {isPending ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  runWithSignature('checkout', (reserva) => processCheckOut(reserva), r);
                                }}
                                className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[11px] py-1.5 px-3 rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                              >
                                Dar Salida
                              </button>
                            ) : (
                              <span className="text-[11px] text-zinc-400 font-bold">Listo ✓</span>
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

          {/* ── ESTADO FÍSICO DE HABITACIONES (GRID INTERACTIVO PREMIUM) ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <BedDouble size={14} className="text-blue-500" />
                Habitaciones Disponibles / Limpias
              </h3>
            </div>

            <div className="bg-white border border-zinc-200/80 rounded-[28px] shadow-sm p-5 space-y-4">
              {/* Conteo por estados */}
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
                          colorClasses = 'bg-blue-500 text-white border-blue-600 shadow-blue-100/30';
                          dotClass = 'bg-blue-250';
                        } else if (operStatus === 'sucio_checkout') {
                          colorClasses = 'bg-rose-500 text-white border-rose-600 shadow-rose-100/30';
                          dotClass = 'bg-rose-250';
                        } else if (operStatus === 'salida_hoy') {
                          colorClasses = 'bg-rose-50/90 text-rose-700 border-rose-200 shadow-rose-50/20';
                          dotClass = 'bg-rose-400';
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
                              } as any);
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

        </div>
      )}

      {/* ── VISTA INVENTARIO ────────────────────────────────────────────── */}
      {mainTab === 'inventario' && (
        <InventarioPage />
      )}

      {/* ── MODAL PROCESO CHECK-IN / WALK-IN ───────────────────────────── */}
      {showCheckInModal && selectedReserva && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white w-full sm:w-[420px] rounded-t-[32px] sm:rounded-[32px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-300">
            {/* Header Modal */}
            <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/30">
              <div>
                <h3 className="text-[16px] font-bold text-zinc-950">
                  {selectedReserva.id === 'walkin' 
                    ? 'Registrar Walk-In' 
                    : selectedReserva.checked_in 
                      ? 'Detalles de Reserva' 
                      : 'Proceso de Check-In'}
                </h3>
                {selectedReserva.id !== 'walkin' && (
                  <p className="text-[11px] font-semibold text-zinc-400 mt-0.5 uppercase tracking-wider">ID: {selectedReserva.id}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setShowCheckInModal(false);
                  setDniPreview(null);
                  setDniFile(null);
                }}
                className="w-8 h-8 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 rounded-full text-zinc-500 transition-colors active:scale-95 cursor-pointer"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </div>

            {/* Contenido Modal */}
            <div className="flex-1 overflow-y-auto overscroll-y-contain p-6 space-y-5">
              
              {selectedReserva.id === 'walkin' ? (
                // Lógica de Walk-In
                <div className="space-y-5">
                  
                  {/* 1. Fechas y Noches */}
                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5 block">Check-In (Entrada)</label>
                      <input
                        key={todayStr ? `walkin-in-${todayStr}` : 'walkin-in-loading'}
                        type="date"
                        value={selectedReserva.check_in}
                        onChange={e => {
                          const newIn = e.target.value;
                          // Recalcular el check-out manteniendo las noches actuales
                          const currentNights = getNightsBetweenDates(selectedReserva.check_in, selectedReserva.check_out);
                          const newOut = addDaysToDateStr(newIn, currentNights);
                          
                          setSelectedReserva({ 
                            ...selectedReserva, 
                            check_in: newIn, 
                            check_out: newOut, 
                            room: '', 
                            unit_id: '',
                            groupRooms: [] 
                          });
                          fetchAvailability(newIn, newOut);
                        }}
                        className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none block"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5 block">Noches</label>
                      <div className="relative flex items-center w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl h-14 focus-within:bg-white focus-within:border-zinc-400 focus-within:ring-4 focus-within:ring-zinc-900/5 transition-all">
                        <button
                          type="button"
                          onClick={() => {
                            const current = Number(typedNights) || 1;
                            const num = Math.max(1, current - 1);
                            setTypedNights(String(num));
                            const newOut = addDaysToDateStr(selectedReserva.check_in, num);
                            setSelectedReserva({ ...selectedReserva, check_out: newOut, room: '', unit_id: '', groupRooms: [] });
                            fetchAvailability(selectedReserva.check_in, newOut);
                          }}
                          className="w-12 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-r border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-l-xl select-none"
                        >
                          <Minus size={16} strokeWidth={2.5} />
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={typedNights}
                          onChange={e => {
                            const val = e.target.value;
                            setTypedNights(val);
                            const num = Number(val);
                            if (num > 0) {
                              const newOut = addDaysToDateStr(selectedReserva.check_in, num);
                              setSelectedReserva({ ...selectedReserva, check_out: newOut, room: '', unit_id: '', groupRooms: [] });
                              fetchAvailability(selectedReserva.check_in, newOut);
                            }
                          }}
                          onBlur={() => {
                            const num = Math.max(1, Number(typedNights) || 1);
                            setTypedNights(String(num));
                            const newOut = addDaysToDateStr(selectedReserva.check_in, num);
                            setSelectedReserva({ ...selectedReserva, check_out: newOut, room: '', unit_id: '', groupRooms: [] });
                            fetchAvailability(selectedReserva.check_in, newOut);
                          }}
                          className="flex-1 min-w-0 h-full text-center bg-transparent border-0 text-zinc-900 font-semibold text-[16px] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const current = Number(typedNights) || 1;
                            const num = current + 1;
                            setTypedNights(String(num));
                            const newOut = addDaysToDateStr(selectedReserva.check_in, num);
                            setSelectedReserva({ ...selectedReserva, check_out: newOut, room: '', unit_id: '', groupRooms: [] });
                            fetchAvailability(selectedReserva.check_in, newOut);
                          }}
                          className="w-12 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-l border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-r-xl select-none"
                        >
                          <Plus size={16} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {selectedReserva.check_out && (
                    <div className="text-[12px] font-medium text-zinc-500 bg-zinc-50 border border-zinc-200/60 p-3.5 rounded-xl flex items-center gap-2 animate-in fade-in duration-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                      <span className="font-semibold uppercase tracking-wider text-[10px] text-zinc-400">Check-Out (Salida):</span>
                      <span className="font-bold text-zinc-800">
                        {format(parseISO(selectedReserva.check_out), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
                      </span>
                    </div>
                  )}

                  {/* 2. Seleccionar Habitación */}
                  <div className="space-y-3 pt-2">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Seleccionar Habitación Libre {checkingAvail && '· buscando...'}</label>

                    {roomInventory.length > 0 ? (
                      <div className="space-y-4">
                        {roomInventory.map((roomGroup: any) => (
                          <div key={roomGroup.roomId} className="bg-zinc-50 border border-zinc-200/60 rounded-xl p-3">
                            <h4 className="text-[12px] font-bold text-zinc-700 mb-2">{roomGroup.name}</h4>
                            <div className="flex flex-wrap gap-2">
                              {roomGroup.units.map((u: any) => {
                                const isSelected = selectedReserva.groupRooms?.some(gr => gr.roomId === roomGroup.roomId && gr.unitId === u.unitId) || (selectedReserva.room === roomGroup.roomId && selectedReserva.unit_id === u.unitId);
                                return (
                                  <button
                                    key={u.unitId}
                                    type="button"
                                    disabled={!u.isAvailable}
                                    onClick={() => {
                                      const currentGroup = selectedReserva.groupRooms || [];
                                      let baseGroup = currentGroup;
                                      if (baseGroup.length === 0 && selectedReserva.room && selectedReserva.unit_id) {
                                        baseGroup = [{
                                          roomId: selectedReserva.room,
                                          unitId: selectedReserva.unit_id,
                                          name: getUnitNumberFromInventory(selectedReserva.room, selectedReserva.unit_id, roomInventory)
                                        }];
                                      }

                                      const exists = baseGroup.some(gr => gr.roomId === roomGroup.roomId && gr.unitId === u.unitId);
                                      let newGroup;
                                      if (exists) {
                                        newGroup = baseGroup.filter(gr => !(gr.roomId === roomGroup.roomId && gr.unitId === u.unitId));
                                      } else {
                                        newGroup = [...baseGroup, { roomId: roomGroup.roomId, unitId: u.unitId, name: u.name }];
                                      }
                                      
                                      const last = newGroup[newGroup.length - 1];
                                      setSelectedReserva({
                                        ...selectedReserva,
                                        groupRooms: newGroup,
                                        room: last ? last.roomId : '',
                                        unit_id: last ? last.unitId : ''
                                      });
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                                      !u.isAvailable
                                        ? 'bg-zinc-200/50 text-zinc-400 cursor-not-allowed line-through'
                                        : isSelected
                                        ? 'bg-zinc-900 text-white shadow-md scale-105'
                                        : 'bg-white border border-zinc-200 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100'
                                    }`}
                                  >
                                    {u.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[13px] text-zinc-500 bg-zinc-50 p-4 rounded-xl border border-zinc-200">Ingresa fechas válidas para buscar disponibilidad.</div>
                    )}
                  </div>

                  {selectedReserva.groupRooms && selectedReserva.groupRooms.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200/60 rounded-xl p-3 space-y-1.5 animate-in fade-in duration-200">
                      <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest block">Habitaciones Seleccionadas ({selectedReserva.groupRooms.length})</span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedReserva.groupRooms.map(gr => (
                          <span key={`${gr.roomId}_${gr.unitId}`} className="px-2.5 py-1 bg-white border border-blue-200 text-blue-800 text-[11px] font-black rounded-lg shadow-sm flex items-center gap-1">
                            {gr.name}
                            <button
                              type="button"
                              onClick={() => {
                                const newGroup = selectedReserva.groupRooms!.filter(x => !(x.roomId === gr.roomId && x.unitId === gr.unitId));
                                const last = newGroup[newGroup.length - 1];
                                setSelectedReserva({
                                  ...selectedReserva,
                                  groupRooms: newGroup,
                                  room: last ? last.roomId : '',
                                  unit_id: last ? last.unitId : ''
                                });
                              }}
                              className="w-3.5 h-3.5 rounded-full hover:bg-zinc-100 flex items-center justify-center text-blue-500 hover:text-blue-700 transition-colors"
                            >
                              <X size={10} strokeWidth={3} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. Datos del Huésped (se muestran solo tras seleccionar una habitación) */}
                  {((selectedReserva.groupRooms && selectedReserva.groupRooms.length > 0) || selectedReserva.unit_id) && (
                    <div className="space-y-5 pt-2 animate-in fade-in slide-in-from-top-4 duration-300">
                      <div>
                        <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5 block">Nombre del Huésped</label>
                        <input
                          type="text"
                          value={selectedReserva.guest_name}
                          onChange={e => setSelectedReserva({ ...selectedReserva, guest_name: e.target.value })}
                          placeholder="Ej. Carlos Slim"
                          className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none placeholder:font-medium placeholder:text-zinc-400"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5 block">N. Móvil</label>
                        <input
                          type="text"
                          value={selectedReserva.guest_phone || ''}
                          onChange={e => setSelectedReserva({ ...selectedReserva, guest_phone: e.target.value })}
                          placeholder="Ej. +52 55 1234 5678"
                          className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none placeholder:font-medium placeholder:text-zinc-400"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3.5">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 block">Adultos</label>
                          <div className="flex items-center w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl h-14 focus-within:bg-white focus-within:border-zinc-400 focus-within:ring-4 focus-within:ring-zinc-900/5 transition-all">
                            <button
                              type="button"
                              onClick={() => {
                                const val = Math.max(1, Number(selectedReserva.num_adult === undefined ? 1 : selectedReserva.num_adult) - 1);
                                setSelectedReserva({ ...selectedReserva, num_adult: val });
                              }}
                              className="w-12 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-r border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-l-xl select-none"
                            >
                              <Minus size={16} strokeWidth={2.5} />
                            </button>
                            <input 
                              type="number" 
                              required
                              min={1}
                              className="flex-1 min-w-0 h-full text-center bg-transparent border-0 text-zinc-900 font-semibold text-[16px] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={selectedReserva.num_adult === undefined ? 1 : selectedReserva.num_adult}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === '') {
                                  setSelectedReserva({ ...selectedReserva, num_adult: '' as any });
                                  return;
                                }
                                const num = Number(val);
                                if (isNaN(num)) return;
                                setSelectedReserva({ ...selectedReserva, num_adult: num });
                              }}
                              onBlur={() => {
                                const num = Math.max(1, Number(selectedReserva.num_adult) || 1);
                                setSelectedReserva({ ...selectedReserva, num_adult: num });
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const val = Number(selectedReserva.num_adult === undefined ? 1 : selectedReserva.num_adult) + 1;
                                setSelectedReserva({ ...selectedReserva, num_adult: val });
                              }}
                              className="w-12 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-l border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-r-xl select-none"
                            >
                              <Plus size={16} strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 block">Niños</label>
                          <div className="flex items-center w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl h-14 focus-within:bg-white focus-within:border-zinc-400 focus-within:ring-4 focus-within:ring-zinc-900/5 transition-all">
                            <button
                              type="button"
                              onClick={() => {
                                const val = Math.max(0, Number(selectedReserva.num_child === undefined ? 0 : selectedReserva.num_child) - 1);
                                setSelectedReserva({ ...selectedReserva, num_child: val });
                              }}
                              className="w-12 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-r border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-l-xl select-none"
                            >
                              <Minus size={16} strokeWidth={2.5} />
                            </button>
                            <input 
                              type="number" 
                              required
                              min={0}
                              className="flex-1 min-w-0 h-full text-center bg-transparent border-0 text-zinc-900 font-semibold text-[16px] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={selectedReserva.num_child === undefined ? 0 : selectedReserva.num_child}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === '') {
                                  setSelectedReserva({ ...selectedReserva, num_child: '' as any });
                                  return;
                                }
                                const num = Number(val);
                                if (isNaN(num)) return;
                                setSelectedReserva({ ...selectedReserva, num_child: num });
                              }}
                              onBlur={() => {
                                const num = Math.max(0, Number(selectedReserva.num_child) || 0);
                                setSelectedReserva({ ...selectedReserva, num_child: num });
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const val = Number(selectedReserva.num_child === undefined ? 0 : selectedReserva.num_child) + 1;
                                setSelectedReserva({ ...selectedReserva, num_child: val });
                              }}
                              className="w-12 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-l border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-r-xl select-none"
                            >
                              <Plus size={16} strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {walkinMaxCapacity > 0 && (
                        <div className={`text-[12px] font-bold mt-1.5 pl-0.5 ${
                          (Number(selectedReserva.num_adult || 1) + Number(selectedReserva.num_child || 0)) > walkinMaxCapacity
                            ? 'text-rose-600 animate-pulse'
                            : 'text-emerald-600'
                        }`}>
                          {(Number(selectedReserva.num_adult || 1) + Number(selectedReserva.num_child || 0)) > walkinMaxCapacity
                            ? `⚠️ Límite de capacidad excedido. Máximo permitido: ${walkinMaxCapacity} personas.`
                            : walkinMaxCapacity > walkinBaseCapacity
                              ? `✓ Capacidad permitida. Incluidas: ${walkinBaseCapacity} · Adicionales con cargo: ${walkinMaxCapacity - walkinBaseCapacity} (Máx: ${walkinMaxCapacity} personas).`
                              : `✓ Capacidad permitida: ${walkinMaxCapacity} personas (sin cargos adicionales).`}
                        </div>
                      )}

                      {selectedReserva.id !== 'walkin' && (
                        <div>
                          <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5 block">Nota / Comentarios (Opcional)</label>
                          <textarea
                            value={selectedReserva.notes || ''}
                            onChange={e => setSelectedReserva({ ...selectedReserva, notes: e.target.value })}
                            placeholder="Ej. Requiere factura, check-in temprano..."
                            className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none placeholder:font-medium placeholder:text-zinc-400 h-20 resize-none"
                          />
                        </div>
                      )}

                      {/* Pricing Section (Walk-In) */}
                      {selectedReserva.id === 'walkin' ? (() => {
                        const { roomDetails, totalStay } = calculateWalkinPrices(selectedReserva);

                        const group = selectedReserva.groupRooms && selectedReserva.groupRooms.length > 0
                          ? selectedReserva.groupRooms
                          : [{ roomId: selectedReserva.room, unitId: selectedReserva.unit_id || '', name: getUnitNumberFromInventory(selectedReserva.room, selectedReserva.unit_id || '', roomInventory) }];
                        
                        const distributedGuests = distributeGuestsInRooms(group, Number(selectedReserva.num_adult || 1), Number(selectedReserva.num_child || 0));
                        let totalExtra = 0;
                        group.forEach((rm) => {
                          const dist = distributedGuests.find(d => d.roomId === rm.roomId && d.unitId === rm.unitId) || { adults: 1, children: 0 };
                          const capRules = getCapacityRules(rm.roomId, capacitySettings || undefined);
                          const totalGuests = dist.adults + dist.children;
                          const extraGuests = Math.max(0, totalGuests - capRules.base);
                          totalExtra += extraGuests;
                        });
                        const extraGuestPrice = capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500;
                        const defaultSurchargeTotal = totalExtra * extraGuestPrice;
                        const hasExtraGuests = totalExtra > 0 || (selectedReserva.extra_guest_surcharge !== '' && Number(selectedReserva.extra_guest_surcharge) !== 0);

                        return (
                          <div className="space-y-4 pt-1">
                            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5 block">
                              Tarifas por Habitación
                            </label>
                            <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                              {roomDetails.map((room) => {
                                const key = `${room.roomId}_${room.unitId}`;
                                return (
                                  <div 
                                    key={key} 
                                    className="flex items-center justify-between gap-3 p-3.5 bg-white border border-zinc-200/80 rounded-2xl hover:border-zinc-300 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.015)]"
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-[13px] font-bold text-zinc-800 leading-snug">{room.name}</span>
                                      <span className="text-[10px] text-zinc-500 font-medium mt-0.5">
                                        Sugerido: ${room.suggestedDailyRate.toLocaleString('es-MX')} · ({room.adults}A / {room.children}N)
                                      </span>
                                    </div>
                                    <div className="relative w-32 shrink-0">
                                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-zinc-400">$</span>
                                      <input
                                        type="number"
                                        placeholder={String(room.suggestedDailyRate)}
                                        className="w-full bg-[#fafafa] border border-zinc-200/80 focus:bg-white focus:border-zinc-400 rounded-xl py-2 pl-7 pr-3 text-right text-[15px] font-bold text-zinc-900 transition-all outline-none"
                                        value={groupRoomRates[key] !== undefined ? groupRoomRates[key] : ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setGroupRoomRates(prev => ({
                                            ...prev,
                                            [key]: val
                                          }));
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Cargos por Personas Adicionales */}
                            {hasExtraGuests && (
                              <div className="space-y-1.5 animate-in fade-in duration-200">
                                <div className="flex justify-between items-center pr-1">
                                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">
                                    Cargos Personas Adicionales (Total por Noche, Impuestos Incluidos)
                                  </label>
                                  {selectedReserva.extra_guest_surcharge !== '' && (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedReserva(prev => prev ? { ...prev, extra_guest_surcharge: '' } : null)}
                                      className="text-[10px] font-bold text-blue-600 hover:underline"
                                    >
                                      Restablecer a sugerido
                                    </button>
                                  )}
                                </div>
                                <div className="relative">
                                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                                  <input
                                    type="number"
                                    placeholder={String(defaultSurchargeTotal)}
                                    className="w-full bg-white border border-blue-400 focus:ring-4 focus:ring-blue-900/10 text-zinc-900 shadow-sm rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none"
                                    value={selectedReserva.extra_guest_surcharge || ''}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setSelectedReserva(prev => prev ? { ...prev, extra_guest_surcharge: val } : null);
                                    }}
                                  />
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-3.5 pt-1">
                              {/* Noches */}
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 block">Noches</label>
                                <input 
                                  type="text" 
                                  readOnly 
                                  className="w-full bg-zinc-100 border border-zinc-200/80 text-zinc-650 cursor-not-allowed rounded-xl p-3.5 text-[15px] font-semibold transition-all outline-none"
                                  value={`${Math.ceil(Math.abs(new Date(selectedReserva.check_out).getTime() - new Date(selectedReserva.check_in).getTime()) / (1000 * 60 * 60 * 24)) || 1} Noches`}
                                />
                              </div>
                              {/* Tarifa Total */}
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 block">Tarifa Total</label>
                                <div className="relative">
                                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                                  <input 
                                    type="number" 
                                    placeholder="0.00"
                                    readOnly
                                    className="w-full bg-zinc-100 border border-zinc-200/80 text-zinc-650 cursor-not-allowed rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none"
                                    value={totalStay || 0}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })() : (
                        <div className="grid grid-cols-2 gap-3.5 pt-1">
                          {/* Tarifa Diaria */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center pr-1">
                              <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Tarifa Diaria (x Hab)</label>
                              <button 
                                type="button" 
                                onClick={() => isPriceUnlocked ? setIsPriceUnlocked(false) : setShowPinModal(true)}
                                className="text-[10px] font-bold text-blue-600 flex items-center gap-1"
                              >
                                {isPriceUnlocked ? <Unlock size={12} /> : <Lock size={12} />}
                                {isPriceUnlocked ? 'Bloquear' : 'Modificar'}
                              </button>
                            </div>
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                              <input 
                                type="number" 
                                placeholder="0.00"
                                readOnly={!isPriceUnlocked}
                                className={`w-full border rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none ${
                                  isPriceUnlocked
                                    ? 'bg-white border-blue-400 focus:ring-4 focus:ring-blue-900/10 text-zinc-900 shadow-sm' 
                                    : 'bg-zinc-100 border-zinc-200/80 text-zinc-650 cursor-not-allowed'
                                }`}
                                value={selectedReserva.daily_rate || ''}
                                onChange={e => {
                                  setIsDailyRateEdited(true);
                                  setSelectedReserva({ ...selectedReserva, daily_rate: e.target.value });
                                }}
                              />
                            </div>
                          </div>

                          {/* Tarifa Total */}
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Tarifa Total</label>
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                              <input 
                                type="number" 
                                placeholder="0.00"
                                readOnly
                                className="w-full bg-zinc-100 border border-zinc-200/80 text-zinc-650 cursor-not-allowed rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none"
                                value={selectedReserva.price_estimate || 0}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                // Información Reserva Existente (Editable)
                <div className="space-y-4 text-left">
                  {/* 1. Nombre del huésped (No. Huéspedes) */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div className="w-9 h-9 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center justify-center shrink-0">
                      <User size={16} className="text-blue-600" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Nombre del Huésped (Huéspedes)</span>
                      <h4 className="text-[14px] font-bold text-zinc-900 leading-tight">
                        {selectedReserva.guest_name} 
                        <span className="text-zinc-500 font-medium text-[12px] ml-1.5">
                          ({selectedReserva.num_adult || 1}A{Number(selectedReserva.num_child) > 0 ? ` / ${selectedReserva.num_child}N` : ''})
                        </span>
                      </h4>
                    </div>
                  </div>

                  {/* Huéspedes Steppers for Existing Reservation */}
                  {(() => {
                    const rules = getCapacityRules(selectedReserva.room, capacitySettings || undefined);
                    return (
                      <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl space-y-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] text-left">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Editar Número de Huéspedes</span>
                        <div className="grid grid-cols-2 gap-3.5">
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 block">Adultos</label>
                            <div className="flex items-center w-full bg-white border border-zinc-200/80 rounded-xl h-12 focus-within:border-zinc-400 focus-within:ring-4 focus-within:ring-zinc-900/5 transition-all">
                              <button
                                type="button"
                                onClick={() => setEditedAdults(prev => Math.max(1, prev - 1))}
                                className="w-10 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-r border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-l-xl select-none"
                              >
                                <Minus size={14} strokeWidth={2.5} />
                              </button>
                              <input 
                                type="number" 
                                required
                                min={1}
                                className="flex-1 min-w-0 h-full text-center bg-transparent border-0 text-zinc-900 font-semibold text-[15px] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                value={editedAdults}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (val === '') {
                                    setEditedAdults('' as any);
                                    return;
                                  }
                                  const num = Number(val);
                                  if (isNaN(num)) return;
                                  const maxAllowed = Math.max(1, rules.max - Number(editedChildren || 0));
                                  setEditedAdults(Math.min(maxAllowed, Math.max(1, num)));
                                }}
                                onBlur={() => {
                                  const num = Math.max(1, Number(editedAdults) || 1);
                                  const maxAllowed = Math.max(1, rules.max - Number(editedChildren || 0));
                                  setEditedAdults(Math.min(maxAllowed, num));
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => setEditedAdults(prev => (prev + Number(editedChildren || 0) < rules.max ? prev + 1 : prev))}
                                className="w-10 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-l border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-r-xl select-none"
                              >
                                <Plus size={14} strokeWidth={2.5} />
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 block">Niños</label>
                            <div className="flex items-center w-full bg-white border border-zinc-200/80 rounded-xl h-12 focus-within:border-zinc-400 focus-within:ring-4 focus-within:ring-zinc-900/5 transition-all">
                              <button
                                type="button"
                                onClick={() => setEditedChildren(prev => Math.max(0, prev - 1))}
                                className="w-10 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-r border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-l-xl select-none"
                              >
                                <Minus size={14} strokeWidth={2.5} />
                              </button>
                              <input 
                                type="number" 
                                required
                                min={0}
                                className="flex-1 min-w-0 h-full text-center bg-transparent border-0 text-zinc-900 font-semibold text-[15px] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                value={editedChildren}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (val === '') {
                                    setEditedChildren('' as any);
                                    return;
                                  }
                                  const num = Number(val);
                                  if (isNaN(num)) return;
                                  const maxAllowed = Math.max(0, rules.max - Number(editedAdults || 0));
                                  setEditedChildren(Math.min(maxAllowed, Math.max(0, num)));
                                }}
                                onBlur={() => {
                                  const num = Math.max(0, Number(editedChildren) || 0);
                                  const maxAllowed = Math.max(0, rules.max - Number(editedAdults || 0));
                                  setEditedChildren(Math.min(maxAllowed, num));
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => setEditedChildren(prev => (Number(editedAdults || 0) + prev < rules.max ? prev + 1 : prev))}
                                className="w-10 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-l border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-r-xl select-none"
                              >
                                <Plus size={14} strokeWidth={2.5} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 2. Teléfono */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Teléfono</span>
                      {selectedReserva.guest_phone ? (
                        <a 
                          href={`https://wa.me/${selectedReserva.guest_phone.replace(/\D/g, '')}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[13px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1.5 cursor-pointer mt-0.5 w-fit"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>{selectedReserva.guest_phone}</span>
                          <svg className="w-2.5 h-2.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                          </svg>
                        </a>
                      ) : (
                        <p className="text-[13px] font-medium text-zinc-500 mt-0.5">Sin teléfono</p>
                      )}
                    </div>
                  </div>

                  {/* 3. Habitación asignada */}
                  <div className="space-y-2">
                    <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex items-center justify-between shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Habitación asignada</span>
                        <p className="text-[14px] font-bold text-zinc-900 mt-0.5">{selectedReserva.room || 'Sin asignar'}</p>
                      </div>
                      {selectedReserva.status !== 'cancelled' && !selectedReserva.checked_out && !isReassigning && (
                        <button
                          onClick={() => setIsReassigning(true)}
                          className="text-[11px] font-bold text-blue-650 hover:text-blue-700 bg-blue-50/50 hover:bg-blue-100/50 border border-blue-100 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer"
                        >
                          Reasignar 🔀
                        </button>
                      )}
                    </div>

                    {isReassigning && (() => {
                      const LOCAL_ROOMS = ['500','501','502','503','504','505','506','507'];
                      const isLocalBooking = LOCAL_ROOMS.some(lr => (selectedReserva.room || '').includes(lr));
                      const filteredGroups = PHYSICAL_ROOM_GROUPS
                        .map(group => ({
                          ...group,
                          rooms: group.rooms.filter(r => isLocalBooking ? LOCAL_ROOMS.includes(r) : !LOCAL_ROOMS.includes(r))
                        }))
                        .filter(group => group.rooms.length > 0);
                      return (
                      <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-2xl space-y-3 animate-in slide-in-from-top-2 duration-200 text-left">
                        <div>
                          <label className="block text-[10px] font-extrabold text-blue-800 uppercase tracking-widest mb-1.5">
                            Seleccionar Nueva Habitación {isLocalBooking ? '(Local)' : '(Filtro de Disponibilidad)'}
                          </label>
                          <select
                            value={targetRoomName}
                            onChange={e => setTargetRoomName(e.target.value)}
                            disabled={loadingAvailability}
                            className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 outline-none text-[13px] font-semibold text-zinc-900 focus:ring-2 focus:ring-blue-600/10 cursor-pointer shadow-sm disabled:opacity-50"
                          >
                            <option value="" disabled>
                              {loadingAvailability ? '⏳ Buscando disponibilidad...' : 'Selecciona habitación...'}
                            </option>
                            {filteredGroups.map(group => (
                              <optgroup key={group.category} label={group.category}>
                                {group.rooms.map(roomNum => {
                                  const isAvail = availableRooms[roomNum];
                                  return (
                                    <option key={roomNum} value={roomNum}>
                                      Habitación {roomNum} {isAvail ? '🟢 (Disponible)' : '🔴 (Ocupada)'}
                                    </option>
                                  );
                                })}
                              </optgroup>
                            ))}
                          </select>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => { setIsReassigning(false); setTargetRoomName(''); }}
                            className="flex-1 py-2 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-600 text-[12px] font-bold rounded-xl transition-all cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleReassignRoom}
                            disabled={reassignLoading || !targetRoomName}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/10 cursor-pointer"
                          >
                            Confirmar
                          </button>
                        </div>
                      </div>
                    ); })()}
                  </div>

                  {/* 4. Canal reservado (directo, Airbnb, Booking) */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Canal reservado</span>
                      <span className="px-2.5 py-1 bg-blue-50 border border-blue-100 text-blue-700 font-bold rounded-lg text-[11px] uppercase tracking-wide inline-block mt-1">
                        {selectedReserva.channel || 'Directo'}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold border ${
                      selectedReserva.status === 'confirmed' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                      selectedReserva.status === 'cancelled' ? 'bg-rose-50 border-rose-100 text-rose-700' :
                      'bg-zinc-100 border-zinc-200 text-zinc-650'
                    }`}>
                      {selectedReserva.status === 'confirmed' ? 'Confirmada' : selectedReserva.status === 'cancelled' ? 'Cancelada' : selectedReserva.status || 'Activa'}
                    </span>
                  </div>

                  {/* 5. Tarifa diaria */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Tarifa diaria</span>
                      <p className="text-[15px] font-extrabold text-zinc-900 mt-0.5">
                        {fmtCurrency(
                          selectedReserva.id === 'walkin'
                            ? (selectedReserva.price_per_night || 0)
                            : Math.round(Number(editedPrice !== '' ? editedPrice : (selectedReserva.price_estimate || 0)) / (selectedReserva.nights || 1)),
                          selectedReserva.guest_name
                        )}
                      </p>
                    </div>
                  </div>

                  {/* 6. Total de la reserva */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Total de la reserva</span>
                      <p className="text-[15px] font-black text-zinc-950 mt-0.5">
                        {fmtCurrency(
                          selectedReserva.id === 'walkin'
                            ? (selectedReserva.price_estimate || 0)
                            : Number(editedPrice !== '' ? editedPrice : (selectedReserva.price_estimate || 0)),
                          selectedReserva.guest_name
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Desglose de Impuestos (Mapeado desde Invoice Beds24) */}
                  {selectedReserva.taxes && selectedReserva.taxes.total > 0 && (
                    <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)] space-y-2.5">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Impuestos (Factura Beds24)</span>
                      
                      <div className="flex justify-between items-center text-[13px]">
                        <span className="text-zinc-500 font-semibold">IVA (16%):</span>
                        <span className="font-extrabold text-zinc-900">
                          {fmtCurrency(selectedReserva.taxes.iva, selectedReserva.guest_name)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-[13px]">
                        <span className="text-zinc-500 font-semibold">ISH (3%):</span>
                        <span className="font-extrabold text-zinc-900">
                          {fmtCurrency(selectedReserva.taxes.ish, selectedReserva.guest_name)}
                        </span>
                      </div>

                      {selectedReserva.taxes.otros > 0 && (
                        <div className="flex justify-between items-center text-[13px]">
                          <span className="text-zinc-500 font-semibold">Otros Impuestos:</span>
                          <span className="font-extrabold text-zinc-900">
                            {fmtCurrency(selectedReserva.taxes.otros, selectedReserva.guest_name)}
                          </span>
                        </div>
                      )}

                      <div className="border-t border-zinc-200/60 pt-2.5 flex justify-between items-center text-[13px] font-black">
                        <span className="text-zinc-700">Total Impuestos:</span>
                        <span className="text-zinc-950">
                          {fmtCurrency(selectedReserva.taxes.total, selectedReserva.guest_name)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 7. Anticipo depositado */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Anticipo depositado</span>
                      <p className="text-[15px] font-extrabold text-emerald-600 mt-0.5">
                        {fmtCurrency(
                          selectedReserva.id === 'walkin'
                            ? 0
                            : Number(editedDeposit !== '' ? editedDeposit : (selectedReserva.deposit || 0)),
                          selectedReserva.guest_name
                        )}
                      </p>
                    </div>
                  </div>

                  {/* 8. Adeudo Pendiente */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Adeudo Pendiente</span>
                      <p className={`text-[15px] font-black mt-0.5 ${
                        (selectedReserva.id === 'walkin'
                          ? Math.max(0, (selectedReserva.price_estimate || 0) - Number(paymentAmount || 0))
                          : Math.max(0, Number(editedPrice !== '' ? editedPrice : (selectedReserva.price_estimate || 0)) - Number(editedDeposit !== '' ? editedDeposit : (selectedReserva.deposit || 0)))) > 0 ? 'text-amber-600' : 'text-zinc-650'
                      }`}>
                        {fmtCurrency(
                          selectedReserva.id === 'walkin'
                            ? Math.max(0, (selectedReserva.price_estimate || 0) - Number(paymentAmount || 0))
                            : Math.max(0, Number(editedPrice !== '' ? editedPrice : (selectedReserva.price_estimate || 0)) - Number(editedDeposit !== '' ? editedDeposit : (selectedReserva.deposit || 0))),
                          selectedReserva.guest_name
                        )}
                      </p>
                    </div>
                  </div>

                  {/* 9. Fecha check in- días de estancia- fecha check Out */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Check-in · Estancia · Check-out</span>
                    <div className="flex items-center justify-between text-[13px] font-semibold text-zinc-900 mt-1 bg-white border border-zinc-150 p-3 rounded-xl">
                      <span>{selectedReserva.check_in ? format(parseISO(selectedReserva.check_in), 'dd MMM yyyy', { locale: es }) : '—'}</span>
                      <span className="bg-zinc-100 text-zinc-700 px-2.5 py-0.5 rounded-lg font-bold text-[11px] shrink-0 border border-zinc-200">
                        {selectedReserva.nights || 0} noche{selectedReserva.nights !== 1 ? 's' : ''}
                      </span>
                      <span>{selectedReserva.check_out ? format(parseISO(selectedReserva.check_out), 'dd MMM yyyy', { locale: es }) : '—'}</span>
                    </div>
                  </div>
                  {/* Notas del Huésped */}
                  {/* Notas del Huésped — editable durante el check-in */}
                  {selectedReserva.id !== 'walkin' && (
                    <div className="bg-amber-50/40 border border-amber-100 p-4 rounded-2xl mt-1">
                                           {showExtensionFlow ? (
                        <div className="bg-zinc-50 border border-zinc-200 p-4.5 rounded-2xl space-y-4 text-left animate-in fade-in duration-205">
                          <div className="flex justify-between items-center pb-2 border-b border-zinc-200">
                            <h4 className="text-[12px] font-extrabold text-zinc-800 uppercase tracking-wider">🗓️ Extender Estancia</h4>
                            <button 
                              onClick={() => { setShowExtensionFlow(false); }}
                              className="text-[11px] font-bold text-zinc-500 hover:text-zinc-700 cursor-pointer"
                            >
                              ✕ Cancelar
                            </button>
                          </div>

                          {/* Stepper de noches adicionales */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-0.5 block">Noches Adicionales</label>
                            <div className="flex items-center w-full bg-white border border-zinc-200 rounded-xl h-12 focus-within:border-zinc-400 transition-all">
                              <button
                                type="button"
                                onClick={() => setExtensionNights(prev => Math.max(1, prev - 1))}
                                className="w-12 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 border-r border-zinc-100 cursor-pointer"
                              >
                                <Minus size={15} strokeWidth={2.5} />
                              </button>
                              <span className="flex-1 text-center font-bold text-[14px] text-zinc-900 select-none">
                                {extensionNights} Noche{extensionNights !== 1 ? 's' : ''}
                              </span>
                              <button
                                type="button"
                                onClick={() => setExtensionNights(prev => prev + 1)}
                                className="w-12 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 border-l border-zinc-100 cursor-pointer"
                              >
                                <Plus size={15} strokeWidth={2.5} />
                              </button>
                            </div>
                            <span className="text-[10px] text-zinc-500 pl-0.5 block">
                              Nueva Salida: <span className="font-bold text-zinc-700">{format(parseISO(addDaysToDateStr(selectedReserva.check_out, extensionNights)), "dd MMM yyyy", { locale: es })}</span>
                            </span>
                          </div>

                          {/* Costo de noches adicionales */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-0.5 block">Costo Adicional</label>
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-sm">$</span>
                              <input
                                type="number"
                                placeholder={String(Math.round(Number(selectedReserva.price_estimate || 0) / (selectedReserva.nights || 1)) * extensionNights)}
                                value={extensionCustomPrice}
                                onChange={e => setExtensionCustomPrice(e.target.value)}
                                className="w-full bg-white border border-zinc-200 rounded-xl py-2.5 pl-7 pr-4 font-bold text-[14px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-zinc-900"
                              />
                            </div>
                            <span className="text-[9px] text-zinc-450 pl-0.5 block leading-normal">
                              * Basado en la tarifa promedio de {fmtCurrency(Math.round(Number(selectedReserva.price_estimate || 0) / (selectedReserva.nights || 1)), selectedReserva.guest_name)}/noche. Deja en blanco para usar la sugerida.
                            </span>
                          </div>

                          {/* Toggle registrar pago en caja */}
                          <div className="flex items-center gap-2 py-1 pl-0.5">
                            <input
                              type="checkbox"
                              id="regExtensionPayment"
                              checked={extensionRegisterPayment}
                              onChange={e => setExtensionRegisterPayment(e.target.checked)}
                              className="w-4.5 h-4.5 text-blue-600 border-zinc-300 rounded focus:ring-blue-500 cursor-pointer"
                            />
                            <label htmlFor="regExtensionPayment" className="text-[12px] font-bold text-zinc-700 select-none cursor-pointer">
                              Registrar Pago de Extensión en Caja
                            </label>
                          </div>

                          {/* Flujo de pago */}
                          {extensionRegisterPayment && (
                            <div className="space-y-3.5 pt-1.5 border-t border-zinc-200/50 animate-in fade-in duration-200">
                              <div className="space-y-1.5">
                                <span className="text-[9px] font-bold text-zinc-455 uppercase tracking-widest block pl-0.5">Método de Pago</span>
                                <div className="flex gap-1.5">
                                  {[
                                    { id: 'efectivo', label: 'Efectivo', icon: Wallet },
                                    { id: 'tarjeta', label: 'Tarjeta', icon: BedDouble },
                                    { id: 'transferencia', label: 'Transf.', icon: Send }
                                  ].map(m => (
                                    <button
                                      key={m.id}
                                      type="button"
                                      onClick={() => setExtensionPaymentMethod(m.id as any)}
                                      className={`flex-1 py-1.5 px-2 border rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                        extensionPaymentMethod === m.id
                                          ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                                          : 'border-zinc-200 bg-white text-zinc-650 hover:bg-zinc-50'
                                      }`}
                                    >
                                      <m.icon size={11} />
                                      <span className="text-[10px] font-bold">{m.label}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {extensionPaymentMethod && (
                                <div className="space-y-1.5 animate-in fade-in duration-150">
                                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block pl-0.5">
                                    Sobre / Cuenta Destino
                                  </label>
                                  <select
                                    value={extensionAccountId}
                                    onChange={e => setExtensionAccountId(e.target.value)}
                                    required
                                    className="w-full bg-white border border-zinc-200 rounded-lg p-2.5 text-zinc-900 font-semibold text-[12px] focus:border-zinc-400 transition-all outline-none cursor-pointer"
                                  >
                                    <option value="" disabled>Selecciona un sobre...</option>
                                    {accounts
                                      .filter(acc => {
                                        const isUSD = selectedReserva?.guest_name?.toUpperCase().includes('(US DOLLARS)');
                                        if (isUSD) {
                                          const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
                                          if (!isUSDAcc) return false;
                                          
                                          const name = acc.name.trim().toUpperCase();
                                          if (extensionPaymentMethod === 'efectivo') {
                                            return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
                                          }
                                          return !name.includes('EFE') && !name.includes('CASH');
                                        } else {
                                          const name = acc.name.trim().toUpperCase();
                                          if (extensionPaymentMethod === 'efectivo') {
                                            return name === 'EFECTIVO';
                                          }
                                          if (extensionPaymentMethod === 'tarjeta') {
                                            return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
                                          }
                                          if (extensionPaymentMethod === 'transferencia') {
                                            return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
                                          }
                                          return false;
                                        }
                                      })
                                      .map(acc => (
                                        <option key={acc.id} value={acc.id}>
                                          {acc.name}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          )}

                          {(() => {
                            const newCheckOut = addDaysToDateStr(selectedReserva.check_out, extensionNights);
                            const isColliding = reservas.some(r => 
                              String(r.id) !== String(selectedReserva.id) && 
                              r.status !== 'cancelled' && 
                              r.room === selectedReserva.room && 
                              r.check_in < newCheckOut && 
                              r.check_out > selectedReserva.check_out
                            );
                            if (!isColliding) return null;
                            const userRole = typeof window !== 'undefined' ? localStorage.getItem('jaroje_role') : null;
                            return (
                              <div className="bg-rose-50 border border-rose-100 text-rose-800 text-[11px] font-bold p-3 rounded-xl leading-snug animate-in fade-in duration-200 mt-2 mb-2 text-left">
                                ⚠️ Conflicto de Disponibilidad: Esta habitación ya está reservada para las nuevas fechas. 
                                {userRole === 'admin' 
                                  ? ' Como administrador, puedes confirmar y luego reasignar la otra reserva o cambiar de habitación al huésped.'
                                  : ' Solo un administrador puede confirmar extensiones con conflicto.'}
                              </div>
                            );
                          })()}

                          <button
                            onClick={handleExtendStay}
                            disabled={
                              extensionLoading || 
                              (extensionRegisterPayment && (!extensionPaymentMethod || !extensionAccountId)) ||
                              (() => {
                                const newCheckOut = addDaysToDateStr(selectedReserva.check_out, extensionNights);
                                const isColliding = reservas.some(r => 
                                  String(r.id) !== String(selectedReserva.id) && 
                                  r.status !== 'cancelled' && 
                                  r.room === selectedReserva.room && 
                                  r.check_in < newCheckOut && 
                                  r.check_out > selectedReserva.check_out
                                );
                                const userRole = typeof window !== 'undefined' ? localStorage.getItem('jaroje_role') : null;
                                return isColliding && userRole !== 'admin';
                              })()
                            }
                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[12.5px] rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            {extensionLoading ? 'Procesando...' : 'Confirmar Extensión de Estancia'}
                          </button>
                        </div>
                      ) : showAbonoFlow ? (
                        <div className="bg-zinc-50 border border-zinc-200 p-4.5 rounded-2xl space-y-4 text-left">
                          <div className="flex justify-between items-center pb-2 border-b border-zinc-200">
                            <h4 className="text-[12px] font-extrabold text-zinc-855 uppercase tracking-wider">💰 Registrar Nuevo Anticipo</h4>
                            <button 
                              onClick={() => { setShowAbonoFlow(false); setAbonoGrupalMode(false); }}
                              className="text-[11px] font-bold text-zinc-500 hover:text-zinc-755"
                            >
                              ✕ Cancelar
                            </button>
                          </div>

                          <div>
                            <label className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5 block">Monto de Anticipo</label>
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-sm">$</span>
                              <input
                                type="number"
                                value={abonoAmount}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (val === '') { setAbonoAmount(''); return; }
                                  const maxBal = abonoGrupalMode
                                    ? directGroupTotalBalance
                                    : Math.max(0, Number(editedPrice || 0) - Number(editedDeposit || 0));
                                  if (Number(val) > maxBal) setAbonoAmount(String(maxBal));
                                  else setAbonoAmount(val);
                                }}
                                placeholder="0.00"
                                className="w-full bg-white border border-zinc-200 rounded-xl py-2.5 pl-7 pr-4 font-bold text-[14px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-zinc-900"
                              />
                            </div>
                            <span className="text-[10px] text-zinc-500 mt-1 block pl-0.5 font-medium">
                              * Monto máximo: {fmtCurrency(
                                abonoGrupalMode
                                  ? directGroupTotalBalance
                                  : Math.max(0, Number(editedPrice || 0) - Number(editedDeposit || 0)),
                                selectedReserva.guest_name
                              )}
                            </span>
                          </div>

                          {/* Toggle Grupal — solo si hay hermanas de grupo */}
                          {siblingBookings.length > 0 && (
                            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-2.5 animate-in fade-in duration-200">
                              <p className="text-[11px] font-bold text-blue-800 leading-snug">
                                🏨 Grupo detectado: <span className="font-extrabold">{siblingBookings.length + 1} habitaciones</span> (Hab. {groupBookings.map(b => b.room).join(', ')})
                              </p>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => { setAbonoGrupalMode(false); setAbonoAmount(''); }}
                                  className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-extrabold border transition-all cursor-pointer ${!abonoGrupalMode ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-650 border-zinc-200 hover:bg-zinc-50'}`}
                                >
                                  Solo esta hab.
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setAbonoGrupalMode(true); setAbonoAmount(''); }}
                                  className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-extrabold border transition-all cursor-pointer ${abonoGrupalMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-zinc-650 border-zinc-200 hover:bg-zinc-50'}`}
                                >
                                  Distribuir en grupo ({siblingBookings.length + 1} hab.)
                                </button>
                              </div>

                              {/* Desglose proporcional */}
                              {abonoGrupalMode && abonoAmount && Number(abonoAmount) > 0 && (
                                <div className="space-y-1.5 pt-1 border-t border-blue-200/60 animate-in fade-in duration-150">
                                  <p className="text-[9px] font-extrabold text-blue-600 uppercase tracking-widest">Distribución proporcional al balance</p>
                                  {directGroupBookings.map(b => {
                                    const bBal = b.balance !== undefined ? b.balance : Math.max(0, (b.price_estimate || 0) - (b.deposit || 0));
                                    const prop = directGroupTotalBalance > 0 ? bBal / directGroupTotalBalance : 1 / directGroupBookings.length;
                                    const amt = Math.round(Number(abonoAmount) * prop * 100) / 100;
                                    return (
                                      <div key={b.id} className="flex justify-between items-center text-[10px]">
                                        <span className="font-bold text-blue-800">Hab. {b.room}</span>
                                        <span className="font-extrabold text-blue-900">{fmtCurrency(amt, b.guest_name)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <span className="text-[9px] font-bold text-zinc-450 uppercase tracking-widest block">Método de Pago</span>
                            <div className="flex gap-1.5">
                              {[
                                { id: 'efectivo', label: 'Efectivo', icon: Wallet },
                                { id: 'tarjeta', label: 'Tarjeta', icon: BedDouble },
                                { id: 'transferencia', label: 'Transf.', icon: Send }
                              ].map(m => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => setAbonoFlowPaymentMethod(m.id as any)}
                                  className={`flex-1 py-1.5 px-2 border rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                    abonoFlowPaymentMethod === m.id
                                      ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                                      : 'border-zinc-200 bg-white text-zinc-655 hover:bg-zinc-50'
                                  }`}
                                >
                                  <m.icon size={11} />
                                  <span className="text-[10px] font-bold">{m.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {abonoFlowPaymentMethod && (
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">
                                Sobre / Cuenta Destino
                              </label>
                              <select
                                value={abonoFlowAccountId}
                                onChange={e => setAbonoFlowAccountId(e.target.value)}
                                required
                                className="w-full bg-white border border-zinc-200 rounded-lg p-2.5 text-zinc-900 font-semibold text-[12px] focus:border-zinc-400 transition-all outline-none cursor-pointer"
                              >
                                <option value="" disabled>Selecciona un sobre...</option>
                                {accounts
                                  .filter(acc => {
                                    const isUSD = selectedReserva?.guest_name?.toUpperCase().includes('(US DOLLARS)');
                                    if (isUSD) {
                                      const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
                                      if (!isUSDAcc) return false;
                                      
                                      const name = acc.name.trim().toUpperCase();
                                      if (abonoFlowPaymentMethod === 'efectivo') {
                                        return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
                                      }
                                      return !name.includes('EFE') && !name.includes('CASH');
                                    } else {
                                      const name = acc.name.trim().toUpperCase();
                                      if (abonoFlowPaymentMethod === 'efectivo') {
                                        return name === 'EFECTIVO';
                                      }
                                      if (abonoFlowPaymentMethod === 'tarjeta') {
                                        return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
                                      }
                                      if (abonoFlowPaymentMethod === 'transferencia') {
                                        return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
                                      }
                                      return false;
                                    }
                                  })
                                  .map(acc => (
                                    <option key={acc.id} value={acc.id}>
                                      {acc.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}

                          <button
                            onClick={abonoGrupalMode ? handleRegisterAbonoGrupal : handleRegisterAbono}
                            disabled={abonoFlowLoading || !abonoAmount || Number(abonoAmount) <= 0 || !abonoFlowPaymentMethod || !abonoFlowAccountId}
                            className={`w-full py-3 text-white font-extrabold text-[12px] rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 ${abonoGrupalMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                          >
                            {abonoFlowLoading ? 'Procesando...' : abonoGrupalMode ? `Distribuir en ${directGroupBookings.length} habitaciones` : 'Confirmar Registro de Anticipo'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2 w-full pt-1.5 border-t border-zinc-100">
                          <button
                            onClick={() => {
                              setAbonoAmount('');
                              setAbonoFlowPaymentMethod(null);
                              setAbonoFlowAccountId('');
                              setShowAbonoFlow(true);
                              setShowExtensionFlow(false);
                            }}
                            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[13px] rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-md shadow-emerald-600/10 cursor-pointer"
                          >
                            💰 Registrar Anticipo
                          </button>
                          <button
                            onClick={() => {
                              setExtensionNights(1);
                              setExtensionCustomPrice('');
                              setExtensionRegisterPayment(true);
                              setExtensionPaymentMethod(null);
                              setExtensionAccountId('');
                              setShowExtensionFlow(true);
                              setShowAbonoFlow(false);
                            }}
                            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[13px] rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-md shadow-blue-600/10 cursor-pointer"
                          >
                            🗓️ Extender Estancia
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {!selectedReserva.checked_in && (
                <>
                  {/* DNI Scanner */}
                  <div className="space-y-2">
                    <h4 className="text-[12px] font-extrabold text-zinc-900 uppercase tracking-wider">Identificación (DNI/Pasaporte)</h4>
                    {!dniPreview ? (
                      <div
                        onClick={() => fileRef.current?.click()}
                        className="border-2 border-dashed border-zinc-200 hover:border-zinc-400 bg-zinc-50 hover:bg-zinc-100 rounded-2xl h-24 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Camera size={20} className="text-zinc-400" />
                        <span className="text-[12px] font-bold text-zinc-500">Tomar foto / Cargar archivo</span>
                        <input
                          type="file" accept="image/*"
                          ref={fileRef} onChange={handleDniUpload} className="hidden"
                        />
                      </div>
                    ) : (
                      <div className="relative rounded-2xl overflow-hidden border border-zinc-200 shadow-sm">
                        <img src={dniPreview} alt="DNI Preview" className="w-full h-36 object-cover" />
                        <button
                          onClick={() => { setDniPreview(null); setDniFile(null); }}
                          className="absolute top-2.5 right-2.5 w-7 h-7 bg-black/60 hover:bg-black text-white flex items-center justify-center rounded-full transition-all cursor-pointer shadow"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Resumen de Huéspedes (Igual que se maneja en Reservas) */}
                  {(() => {
                    if (selectedReserva.id === 'walkin') return null;
                    const rules = getCapacityRules(selectedReserva.room, capacitySettings || undefined);
                    const totalGuests = Number(editedAdults || 0) + Number(editedChildren || 0);
                    const extraGuests = Math.max(0, totalGuests - rules.base);
                    const extraGuestPrice = capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500;
                    const costPerNight = extraGuests * extraGuestPrice;
                    const totalCost = costPerNight * (selectedReserva.nights || 1);

                    return (
                      <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4 space-y-2 text-left shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Resumen de Huéspedes</span>
                          <span className="text-[10px] font-bold text-zinc-500 bg-zinc-200/60 px-2 py-0.5 rounded-full">
                            {rules.max > rules.base 
                              ? `Incluidas: ${rules.base} | Con cargo: ${rules.max - rules.base} (Máx: ${rules.max})` 
                              : `Permitidas: ${rules.base}`}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[13px] font-semibold text-zinc-800">
                          <span>Total Huéspedes:</span>
                          <span>{totalGuests} ({editedAdults}A / {editedChildren}N)</span>
                        </div>
                        {extraGuests > 0 && (
                          <div className="border-t border-zinc-200/60 pt-2 flex justify-between items-center text-[12px] text-amber-600 font-bold">
                            <span>Huéspedes adicionales con costo ({extraGuests}):</span>
                            <span>${costPerNight.toLocaleString('es-MX')}/noche (Total: ${totalCost.toLocaleString('es-MX')})</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Detección de Reserva Grupal y Adeudo Global */}
                  {siblingBookings.length > 0 && (
                    <div className="bg-zinc-900/5 border border-zinc-200/50 rounded-2xl p-4 space-y-3 text-left shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users size={16} className="text-zinc-700" />
                          <span className="text-[11px] font-extrabold text-zinc-700 uppercase tracking-widest block">
                            Reserva Grupal Detectada
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-500 bg-zinc-200/80 px-2 py-0.5 rounded-full">
                          {groupBookings.length} habitaciones
                        </span>
                      </div>
                      
                      {/* Desglose de Habitaciones del Grupo */}
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {groupBookings.map((r) => {
                          const isMain = r.id === selectedReserva.id;
                          const bal = r.balance !== undefined ? r.balance : Math.max(0, (r.price_estimate || 0) - (r.deposit || 0));
                          const ota = isOtaRoom(r);
                          return (
                            <div 
                              key={r.id} 
                              className={`flex justify-between items-center text-[12px] p-2.5 rounded-xl transition-all ${
                                isMain 
                                  ? 'bg-zinc-900/10 border border-zinc-900/20' 
                                  : 'bg-white/60 border border-zinc-200/40'
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-bold text-zinc-800 flex items-center">
                                  Hab {r.room} {isMain && <span className="text-[9px] font-extrabold text-blue-600 bg-blue-100 px-1 py-0.5 rounded ml-1.5">Principal</span>}
                                </span>
                                <span className="text-[10px] text-zinc-500 truncate max-w-[150px]">
                                  {r.guest_name}
                                </span>
                              </div>
                              <div className="text-right">
                                {ota ? (
                                  <span className="text-[10px] font-extrabold text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                                    {r.channel}
                                  </span>
                                ) : bal > 0 ? (
                                  <span className="font-bold text-rose-600">
                                    {fmtCurrency(bal, r.guest_name)}
                                  </span>
                                ) : (
                                  <span className="font-bold text-emerald-600">
                                    Liquidado
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Totales y Checkbox */}
                      {directGroupTotalBalance > 0 && (
                        <div className="border-t border-zinc-200/80 pt-3 space-y-2">
                          <div className="flex justify-between items-center text-[13px] font-bold text-zinc-800">
                            <span>Total Directo Pendiente:</span>
                            <span className="text-rose-600 font-extrabold">{fmtCurrency(directGroupTotalBalance, selectedReserva.guest_name)}</span>
                          </div>

                          <label className="flex items-center gap-2.5 cursor-pointer bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl p-3 select-none transition-all active:scale-[0.98] w-full">
                            <input 
                              type="checkbox"
                              checked={payGroupConsolidated}
                              onChange={(e) => setPayGroupConsolidated(e.target.checked)}
                              className="w-4 h-4 rounded text-blue-600 border-zinc-300 focus:ring-blue-500 cursor-pointer"
                            />
                            <div className="flex flex-col">
                              <span className="text-[12px] font-bold text-zinc-800">
                                Liquidar adeudo total del grupo
                              </span>
                              <span className="text-[10px] text-zinc-500 leading-tight">
                                Consolidar pago en una sola transacción y registrar check-in para todas las habitaciones.
                              </span>
                            </div>
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Adeudo por Pagar */}
                  {(() => {
                    const totalVal = selectedReserva.id === 'walkin'
                      ? (selectedReserva.price_estimate || 0)
                      : Number(editedPrice !== '' ? editedPrice : (selectedReserva.price_estimate || 0));
                    const depositVal = selectedReserva.id === 'walkin'
                      ? Number(paymentAmount || 0)
                      : Number(editedDeposit !== '' ? editedDeposit : (selectedReserva.deposit || 0));
                    
                    const balanceVal = payGroupConsolidated
                      ? directGroupTotalBalance
                      : Math.max(0, totalVal - depositVal);

                    if (balanceVal <= 0) {
                      return (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in fade-in duration-300">
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-widest block">
                              {payGroupConsolidated ? "Grupo Liquidado" : "Estancia Liquidada"}
                            </span>
                            <p className="text-[11px] text-emerald-600 font-medium">
                              {payGroupConsolidated 
                                ? "Todas las habitaciones directas están al corriente."
                                : `Total: ${fmtCurrency(totalVal, selectedReserva.guest_name)} | Anticipos: ${fmtCurrency(depositVal, selectedReserva.guest_name)} (100% Pagado)`}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-[20px] font-black text-emerald-700">
                              {fmtCurrency(0, selectedReserva.guest_name)}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in fade-in duration-300">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-extrabold text-rose-800 uppercase tracking-widest block">
                            {payGroupConsolidated ? "Adeudo Global del Grupo" : "Adeudo por Pagar"}
                          </span>
                          {payGroupConsolidated ? (
                            <p className="text-[10px] text-rose-600 font-medium leading-tight">
                              Consolidado de {directGroupBookings.length} habitaciones directas.
                            </p>
                          ) : selectedReserva.id !== 'walkin' ? (
                            <p className="text-[10px] text-rose-600 font-medium leading-tight">
                              Total: {fmtCurrency(totalVal, selectedReserva.guest_name)} | Anticipos: {fmtCurrency(depositVal, selectedReserva.guest_name)}
                            </p>
                          ) : (
                            <p className="text-[11px] text-rose-600 font-medium">
                              Monto total a cobrar por la estancia.
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-[20px] font-black text-rose-700">
                            {fmtCurrency(balanceVal, selectedReserva.guest_name)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Registro de Pago */}
                  <div className="space-y-3 pt-2">
                    {['Airbnb', 'Booking.com'].includes(selectedReserva.channel || '') ? (
                      (() => {
                        const channel = selectedReserva.channel || '';
                        const netAccName = channel === 'Airbnb' ? 'HSBC FISCAL' : 'BOOKING';
                        const commAccName = channel === 'Airbnb' ? 'COMISIÓN AIRBNB' : 'COMISIÓN BOOKING';

                        const balanceVal = selectedReserva.balance !== undefined
                          ? selectedReserva.balance
                          : (selectedReserva.price_estimate || 0) - (selectedReserva.deposit || 0);

                        let expectedPayout = selectedReserva.expected_payout || 0;
                        let hostFee = selectedReserva.host_fee || 0;

                        if (expectedPayout === 0 && hostFee === 0) {
                          const otaSplit = computeOtaSplit(
                            balanceVal > 0 ? balanceVal : (selectedReserva.price_estimate || 0),
                            channel,
                            selectedReserva.room,
                            selectedReserva.check_in,
                            selectedReserva.check_out,
                            rules
                          );
                          expectedPayout = otaSplit.netRevenue;
                          hostFee = otaSplit.commission;
                        }

                        return (
                          <div className="bg-zinc-50 border border-zinc-200/85 rounded-2xl p-4 shadow-sm animate-in fade-in duration-300 text-left">
                            <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest block mb-2">
                              Dispersión de Pago Automatizada ({channel})
                            </span>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center text-[13px]">
                                <span className="font-semibold text-zinc-600">Depósito Neto a {netAccName}:</span>
                                <span className="font-bold text-zinc-900">{fmtCurrency(expectedPayout, selectedReserva.guest_name)}</span>
                              </div>
                              <div className="flex justify-between items-center text-[13px] pt-1.5 border-t border-zinc-200">
                                <span className="font-semibold text-zinc-600">Comisión a {commAccName}:</span>
                                <span className="font-bold text-zinc-900">{fmtCurrency(hostFee, selectedReserva.guest_name)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <>
                        <h4 className="text-[12px] font-extrabold text-zinc-900 uppercase tracking-wider">Registrar Pago (Opcional)</h4>
                        <div className="flex gap-2">
                          {[
                            { id: 'efectivo', label: 'Efectivo', icon: Wallet },
                            { id: 'tarjeta', label: 'Tarjeta', icon: BedDouble },
                            { id: 'transferencia', label: 'Transferencia', icon: Send }
                          ].map(m => (
                            <button
                              key={m.id}
                              onClick={() => setPaymentMode(m.id as any)}
                              className={`flex-1 py-3 border-[2px] rounded-xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                                paymentMode === m.id
                                  ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                                  : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                              }`}
                            >
                              <m.icon size={15} />
                              <span className="text-[11px] font-bold">{m.label}</span>
                            </button>
                          ))}
                        </div>

                        {paymentMode && (
                          <div className="space-y-2.5 p-3.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl animate-in fade-in duration-200">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">
                                {selectedReserva.id === 'walkin' ? 'Pago Actual (Anticipo)' : 'Monto a cobrar'}
                              </span>
                            </div>
                            <div className="relative text-left">
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                              <input
                                type="number"
                                value={paymentAmount}
                                onChange={e => {
                                  if (selectedReserva.id !== 'walkin') {
                                    setPaymentAmount(e.target.value);
                                  }
                                }}
                                readOnly={selectedReserva.id === 'walkin'}
                                placeholder="0.00"
                                className={`w-full border rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none ${
                                  selectedReserva.id === 'walkin'
                                    ? 'bg-zinc-100 border-zinc-200/80 text-zinc-500 cursor-not-allowed'
                                    : 'bg-[#fafafa] border border-zinc-200/80 focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 text-zinc-900 shadow-sm'
                                }`}
                              />
                            </div>

                            {/* Selector de cuenta/sobre */}
                            <div className="space-y-1.5 pt-1 text-left">
                              <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5 block">
                                ¿A qué sobre va el dinero?
                              </label>
                              <select
                                value={selectedAccountId}
                                onChange={e => setSelectedAccountId(e.target.value)}
                                required
                                className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none cursor-pointer"
                              >
                                <option value="" disabled>Selecciona un sobre...</option>
                                {accounts
                                  .filter(acc => {
                                    const isUSD = selectedReserva?.guest_name?.toUpperCase().includes('(US DOLLARS)');
                                    if (isUSD) {
                                      const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
                                      if (!isUSDAcc) return false;

                                      const name = acc.name.trim().toUpperCase();
                                      if (paymentMode === 'efectivo') {
                                        return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
                                      }
                                      return !name.includes('EFE') && !name.includes('CASH');
                                    } else {
                                      const name = acc.name.trim().toUpperCase();
                                      if (paymentMode === 'efectivo') {
                                        return name === 'EFECTIVO';
                                      }
                                      if (paymentMode === 'tarjeta') {
                                        return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
                                      }
                                      if (paymentMode === 'transferencia') {
                                        return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
                                      }
                                      return false;
                                    }
                                  })
                                  .map(acc => (
                                    <option key={acc.id} value={acc.id}>
                                      {acc.name}
                                    </option>
                                  ))}
                              </select>
                            </div>

                            {/* Descripción opcional */}
                            <div className="space-y-1.5 pt-1 text-left">
                              <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5 block">
                                Descripción (opcional)
                              </label>
                              <input
                                type="text"
                                value={paymentDescription}
                                onChange={e => setPaymentDescription(e.target.value)}
                                placeholder="Ej. S07 -EP, referencia de transferencia..."
                                className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[15px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}

            </div>

            {/* Acción de Envío */}
            {!selectedReserva.checked_in && (
              <div className="p-5 border-t border-zinc-100 bg-zinc-50 flex flex-col gap-2">
                <button
                  onClick={() => runWithSignature('checkin', () => processCheckIn())}
                  disabled={(() => {
                    const todayStr = new Date().toLocaleDateString('sv-SE');
                    const isFuture = selectedReserva.id !== 'walkin' && selectedReserva.check_in && selectedReserva.check_in > todayStr;
                    if (isFuture) return true;

                    if (submitting) return true;

                    // Validación DNI obligatoria para todas las reservas y walk-ins
                    if (!dniPreview) return true;

                    // Validación campos Walk-in obligatorios
                    if (selectedReserva.id === 'walkin') {
                      const hasRoomSelected = (selectedReserva.groupRooms && selectedReserva.groupRooms.length > 0) || selectedReserva.unit_id;
                      if (
                        !selectedReserva.guest_name || 
                        !hasRoomSelected || 
                        !selectedReserva.guest_phone || 
                        (selectedReserva.num_adult || 0) < 1
                      ) return true;
                    }

                    if (payGroupConsolidated) {
                      if (directGroupTotalBalance > 0) {
                        const currentPayment = Number(paymentAmount || 0);
                        if (!paymentMode) return true;
                        if (!selectedAccountId) return true;
                        if (currentPayment < directGroupTotalBalance) return true;
                      }
                      return false;
                    }

                    const isAirbnbOrBooking = ['Airbnb', 'Booking.com'].includes(selectedReserva.channel || '');
                    if (isAirbnbOrBooking) return false;

                    // Calcular balance pendiente
                    const pendingBalance = selectedReserva.id === 'walkin'
                      ? Number(paymentAmount || 0)
                      : (selectedReserva.balance !== undefined
                          ? selectedReserva.balance
                          : (selectedReserva.price_estimate || 0) - (selectedReserva.deposit || 0));

                    if (pendingBalance > 0) {
                      const currentPayment = Number(paymentAmount || 0);
                      // Si hay adeudo, se requiere método de pago, cuenta/sobre y que el monto cubra el adeudo
                      if (!paymentMode) return true;
                      if (!selectedAccountId) return true;
                      if (currentPayment < pendingBalance) return true;
                    }

                    return false;
                  })()}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[14px] py-3.5 rounded-xl transition-all cursor-pointer shadow-md shadow-blue-600/15 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {submitting 
                    ? 'Registrando...' 
                    : (selectedReserva.id !== 'walkin' && selectedReserva.check_in && selectedReserva.check_in > new Date().toLocaleDateString('sv-SE'))
                      ? `No disponible hasta el ${format(parseISO(selectedReserva.check_in), 'dd MMM yyyy', { locale: es })}`
                      : 'Completar Check-In'}
                </button>
              </div>
            )}

            {selectedReserva.checked_in && (
              <div className="p-5 border-t border-zinc-100 bg-zinc-50 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setExtensionNights(1);
                    setExtensionCustomPrice('');
                    setExtensionRegisterPayment(true);
                    setExtensionPaymentMethod(null);
                    setExtensionAccountId('');
                    setShowExtensionFlow(true);
                    setShowAbonoFlow(false);
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[14px] py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-md shadow-emerald-600/10 cursor-pointer animate-in fade-in duration-200"
                >
                  <CheckCircle2 size={18} /> En Casa (Extender Estancia 🗓️)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal PIN */}
      {showPinModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl space-y-4">
            <div className="text-center space-y-1.5">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2 border border-blue-100">
                <Lock size={18} />
              </div>
              <h3 className="font-bold text-[16px] text-zinc-900">Desbloquear Tarifa</h3>
              <p className="text-[11px] text-zinc-400 font-medium">Introduce el PIN de administrador para editar la tarifa.</p>
            </div>
            <input
              type="password"
              placeholder="PIN de 4 dígitos"
              maxLength={4}
              value={pinInput}
              onChange={e => setPinInput(e.target.value)}
              className="w-full text-center text-3xl font-extrabold border-2 border-zinc-200 rounded-2xl py-2 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10 tracking-widest text-zinc-900"
            />
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setShowPinModal(false); setPinInput(''); }}
                className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-[12px] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleUnlockPrice}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-[12px] transition-colors cursor-pointer"
              >
                Desbloquear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reporte de Mantenimiento desde Recepción (Centrado Premium como Admin) */}
      {showForm && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div onClick={() => setShowForm(false)} className="absolute inset-0" />
          <div className="relative bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 max-h-[90vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                <Wrench size={20} className="text-rose-500 animate-pulse" />
                Reportar MTTO
              </h3>
              <button 
                onClick={() => setShowForm(false)} 
                className="w-8 h-8 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors"
              >
                <X size={16} strokeWidth={3} />
              </button>
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
              {/* Descripción */}
              <div>
                <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Descripción del Daño</label>
                <textarea 
                  required
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Ej. Fuga de agua en el lavabo..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none text-[15px] focus:ring-2 focus:ring-zinc-900/10 resize-none font-medium text-zinc-900"
                />
              </div>

              {/* Habitación */}
              <div>
                <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Ubicación</label>
                <select 
                  value={form.room} 
                  onChange={e => setForm(f => ({ ...f, room: e.target.value }))}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[15px] font-bold text-zinc-900 focus:ring-2 focus:ring-zinc-900/10 cursor-pointer"
                >
                  {MTTO_LOCATIONS.map(r => {
                    const isRoom = !['General', 'Cocina', 'Recepción', 'Alberca'].includes(r);
                    return (
                      <option key={r} value={r}>
                        {isRoom ? `Habitación ${r}` : r}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Foto Evidencia (Opcional) */}
              <div>
                <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Foto de la Incidencia (Opcional)</label>
                <input 
                  ref={mttoPhotoRef}
                  type="file"
                  accept="image/*"
                  onChange={handleMttoImageUpload}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => mttoPhotoRef.current?.click()}
                    className="flex-1 py-3 px-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 active:scale-95 transition-all text-center text-[13px] flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Camera size={16} />
                    <span>Tomar Foto</span>
                  </button>
                  {photoFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoBase64(null);
                      }}
                      className="px-4 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-2xl transition-colors font-bold text-[12px] border border-rose-200"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                {photoFile && (
                  <p className="text-[12px] text-zinc-500 mt-2 font-medium bg-zinc-50 border border-zinc-200/50 p-2.5 rounded-xl truncate">
                    ✓ Seleccionado: <span className="font-bold text-zinc-800">{photoFile.name}</span>
                  </p>
                )}
              </div>

              {/* Botón de Envío */}
              <button 
                type="button"
                onClick={() => {
                  if (!form.description.trim()) return;
                  runWithSignature('mantenimiento', async () => {
                    setSubmitting(true);
                    const emp = getActiveEmployee('recepcion');
                    const operatorName = emp ? `${emp.full_name} (${emp.employee_num})` : 'Recepción';
                    
                    await fetch('/api/tasks', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        ...form, 
                        reported_by: operatorName, 
                        direction: 'staff_to_admin',
                        image_base64: photoBase64 || undefined
                      }),
                    });

                    // Registrar log de auditoría
                    if (emp) {
                      try {
                        await fetch('/api/employee-logs', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            employee_num: emp.employee_num,
                            employee_name: emp.full_name,
                            department: emp.department,
                            module: 'recepcion',
                            action: 'report_maintenance',
                            room: form.room,
                            details: `Reportó daño técnico en ${['General', 'Cocina', 'Recepción', 'Alberca'].includes(form.room) ? form.room : `Habitación ${form.room}`}: ${form.description}`
                          })
                        });
                      } catch (e) {
                        console.error('Error registrando log de mantenimiento:', e);
                      }
                    }

                    const reportedRoom = form.room;
                    const reportedDesc = form.description;

                    setForm({ type: 'mantenimiento', room: 'General', description: '' });
                    setPhotoFile(null);
                    setPhotoBase64(null);
                    setShowForm(false);
                    setSubmitting(false);

                    // Copiar reporte al clipboard y abrir grupo WhatsApp de Mantenimiento
                    const dateStr = format(new Date(), "EEEE, d 'de' MMMM · HH:mm", { locale: es });
                    const isRoom = !['General', 'Cocina', 'Recepción', 'Alberca'].includes(reportedRoom);
                    const ubicacion = isRoom ? `Habitación ${reportedRoom}` : reportedRoom;
                    const waText =
                      `🔧 *REPORTE DE MANTENIMIENTO*\n` +
                      `🏨 *Jaroje Condominios*\n` +
                      `📅 *${dateStr.toUpperCase()}*\n\n` +
                      `📍 *Ubicación:* ${ubicacion}\n` +
                      `📝 *Descripción:* ${reportedDesc}\n` +
                      `👤 *Reportado por:* ${operatorName}\n\n` +
                      `_Generado automáticamente desde Jaroje OS_`;

                    navigator.clipboard.writeText(waText).catch(() => {});
                    window.open('https://chat.whatsapp.com/0ZEzlGKFLdzEvqOOiAFhmq', '_blank');
                  });
                }}
                disabled={!form.description.trim() || submitting}
                className="w-full bg-zinc-950 hover:bg-zinc-900 text-white font-extrabold py-4 rounded-2xl text-[14px] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg active:scale-98"
              >
                <Send size={14} />
                <span>{submitting ? 'Enviando Reporte...' : 'Enviar Reporte al Administrador'}</span>
              </button>
            </form>

          </div>
        </div>
      )}

      {/* Modal táctil de autenticación de empleado */}
      <EmployeeModal
        isOpen={showEmployeeModal}
        onClose={() => {
          const emp = getActiveEmployee('recepcion');
          if (!emp) {
            const currentRole = typeof window !== 'undefined' ? localStorage.getItem('jaroje_role') : null;
            if (currentRole === 'admin') {
              router.push('/');
            } else {
              localStorage.removeItem('jaroje_role');
              router.push('/login');
            }
          } else {
            setShowEmployeeModal(false);
            setPendingAction(null);
          }
        }}
        module="recepcion"
        onSuccess={(employee) => {
          setActiveEmployeeState(employee);
          if (pendingAction) {
            pendingAction.callback(pendingAction.payload);
            setPendingAction(null);
          }
        }}
      />

      {/* ── MODAL DETALLE / INSPECCIÓN DE HABITACIÓN (BOTTOM SHEET OPERATIVO CERRADO) ── */}
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
                    ℹ️ **Instrucciones:** Antes de habilitar la habitación, el recepcionista en turno debe verificar físicamente que el cuarto cumpla con los estándares de limpieza y amenidades.
                  </p>

                  <div className="flex flex-col gap-2.5 pt-2">
                    <button
                      onClick={() => runWithSignature('room_status', () => handleUpdateRoomStatus('disponible'))}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[13px] tracking-wide uppercase py-4 rounded-2xl transition-all cursor-pointer shadow-md shadow-emerald-600/15 flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      <CheckCircle2 size={16} strokeWidth={2.5} />
                      <span>Aprobar Inspección (Marcar Disponible)</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        setShowRoomStatusModal(false);
                        setForm({ type: 'mantenimiento', room: selectedRoomForStatus.room_number, description: '' });
                        setShowForm(true);
                      }}
                      className="w-full bg-rose-50 hover:bg-rose-100 text-rose-650 border border-rose-200 font-bold text-[12px] py-3.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Wrench size={14} />
                      <span>Reportar Daño o Detalle Técnico (MTTO)</span>
                    </button>
                  </div>
                </div>
              ) : (
                // CASO RESTO (Verde, Amarillo, Rojo): Tarjeta Informativa de Solo Lectura
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
                      } else if (operStatus === 'salida_hoy') {
                        bg = 'bg-rose-50/90 text-rose-700 border-rose-200';
                        label = '🔴 Esperando Salida (Check-Out Hoy)';
                        desc = 'El huésped tiene salida programada para hoy. En espera de confirmar Check-Out en Recepción para iniciar la limpieza profunda de salida.';
                      } else if (operStatus === 'sucio_checkout') {
                        bg = 'bg-rose-500 text-white border-rose-600 shadow-lg shadow-rose-500/10';
                        label = '🔴 Check Out';
                        desc = 'El recepcionista ha dado salida al huésped. El cuarto requiere una limpieza profunda de salida para volver a rentarse.';
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
                    {(operStatus === 'sucio_checkout' || operStatus === 'en_limpieza' || operStatus === 'limpieza_programada') && (
                      <button
                        onClick={() => runWithSignature('room_status', () => handleUpdateRoomStatus('limpia'))}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[12px] tracking-wide uppercase py-4 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md active:scale-[0.98]"
                      >
                        <Sparkles size={14} />
                        <span>Finalizar Limpieza (Marcar en Azul)</span>
                      </button>
                    )}
                    
                    <button
                      onClick={() => {
                        setShowRoomStatusModal(false);
                        setForm({ type: 'mantenimiento', room: selectedRoomForStatus.room_number, description: '' });
                        setShowForm(true);
                      }}
                      className="w-full bg-zinc-900 hover:bg-zinc-950 text-white font-extrabold text-[12px] tracking-wide uppercase py-3.5 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98]"
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

      {/* ── MODAL DETALLES DE KPI (SECURE FOR RECEPCION) ── */}
      {kpiModalType && (() => {
        let title = 'Detalles';
        let badgeColor = 'bg-zinc-100 text-zinc-800';
        let filtered: any[] = [];

        if (kpiModalType === 'encasa') {
          title = 'Huéspedes En Casa';
          badgeColor = 'bg-zinc-900 text-white';
          filtered = reservas.filter(r => r.check_out > todayStr && r.checked_in);
        } else if (kpiModalType === 'llegan') {
          title = 'Llegadas Hoy';
          badgeColor = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
          filtered = reservas.filter(r => r.check_in === todayStr);
        } else if (kpiModalType === 'salen') {
          title = 'Salidas Hoy';
          badgeColor = 'bg-zinc-150 text-zinc-700 border border-zinc-200';
          filtered = reservas.filter(r => r.check_out === todayStr);
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
                    return (
                      <div 
                        key={r.id} 
                        onClick={() => {
                          setSelectedReserva(r);
                          setShowCheckInModal(true);
                          setKpiModalType(null);
                        }}
                        className="p-4 border border-zinc-150 rounded-2xl bg-zinc-50/20 space-y-2.5 cursor-pointer hover:bg-zinc-100/50 hover:border-zinc-300 transition-all active:scale-[0.98] select-none"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-[14px] font-black text-zinc-950 leading-tight">{r.guest_name || 'Huésped Sin Nombre'}</h4>
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Reserva ID: {r.id}</span>
                          </div>
                          <span className="text-[11px] font-extrabold bg-zinc-900 text-white px-2.5 py-1 rounded-lg">
                            {getUnitDisplay(r.room || r.room_name || '')}
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
