"use client";

import { useEffect, useState, useRef } from 'react';
import { format, addDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  CheckCircle2, ArrowDownLeft, ArrowUpRight, BedDouble,
  UserPlus, Camera, Upload, Wallet, X, Plus, Sparkles, Wrench, AlertTriangle, Send, Package, Minus,
  ShieldAlert, Lock, Unlock, Phone, Calendar, Moon, Users, CircleDot, ChevronDown
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import LiveAvailabilityWidget from '@/components/LiveAvailabilityWidget';
import { useSearchParams, useRouter } from 'next/navigation';
import { getActiveEmployee, clearActiveEmployee, Employee } from '@/lib/auth';
import EmployeeModal from '@/components/EmployeeModal';
import InventarioPage from '../inventario/page';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Reserva {
  id: string;
  room: string;
  unit_id?: string;
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
  num_adult?: number;
  num_child?: number;
  deposit?: number;
  balance?: number;
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
  '500','501','502','503','504','505','506'
];

const ROOM_ROWS = [
  { label: 'Apartamentos Premier 3 Recámaras (101-107)', rooms: ['101','102','103','104','105','106','107'] },
  { label: 'Apartamentos Premier 2 Recámaras (201-206)', rooms: ['201','202','203','204','205','206'] },
  { label: 'Unidades Especiales (401-402)', rooms: ['401','402'] },
  { label: 'Habitaciones Dobles (301-306)', rooms: ['301','302','303','304','305','306'] },
  { label: 'Apartamentos Nuevos (500-506)', rooms: ['500','501','502','503','504','505','506'] }
];

const MTTO_LOCATIONS = [
  'General',
  ...ROOMS,
  'Cocina',
  'Recepción',
  'Alberca'
];

const BEDS24_ROOMS = [
  { id: '679077', name: 'Habitación DOBLE - 2 camas dobles' },
  { id: '679087', name: 'Apartamento Premier de 1 dormitorio' },
  { id: '679091', name: 'Apartamento Premier de 2 dormitorios' },
  { id: '679092', name: 'Apartamento Premier de 3 dormitorios' },
  { id: '679093', name: 'Casa Vacacional de 3 dormitorios' }
];

const PRICES: Record<string, Record<string, number>> = {
  '679077': { baja: 1600, media: 1900, media_alta: 2000, alta: 2200 },
  '679087': { baja: 2400, media: 2850, media_alta: 3000, alta: 3300 },
  '679091': { baja: 3200, media: 3800, media_alta: 4000, alta: 4400 },
  '679092': { baja: 4800, media: 5700, media_alta: 6000, alta: 6600 },
  '679093': { baja: 6400, media: 7600, media_alta: 8000, alta: 8800 },
};

function getSeason(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  if (month === 12 && day >= 20) return 'alta';
  if (month === 1 && day <= 10) return 'alta';
  if (month === 3 || month === 4) return 'media_alta';
  if (month === 7 || month === 8) return 'media';
  return 'baja';
}

function getLocalDateStr(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
): 'disponible' | 'en_limpieza' | 'limpia' | 'sucio_checkout' | 'limpieza_programada' {
  const isUpdatedToday = lastUpdatedAt && lastUpdatedAt.startsWith(todayStr);

  // 1. Si el estatus en base de datos fue actualizado HOY, respetar de inmediato
  if (isUpdatedToday) {
    if (dbStatus === 'limpia') return 'limpia'; // Azul (Limpieza terminada)
    if (dbStatus === 'sucio_checkout') return 'sucio_checkout'; // Rojo (Aviso Check Out)
    if (dbStatus === 'en_limpieza') return 'en_limpieza'; // Amarillo (En limpieza)
    if (dbStatus === 'disponible') return 'disponible'; // Verde (Disponible)
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
    return 'limpieza_programada'; // Amarillo automático por checkout programado hoy
  }

  // 3. Si no tiene salida ni estancia programada que requiera limpieza hoy, está disponible
  return 'disponible'; // Verde por defecto
}

export default function RecepcionPage() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
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
  const [selectedReserva, setSelectedReserva] = useState<Reserva | null>(null);
  const [dniPreview, setDniPreview] = useState<string | null>(null);
  const [dniFile, setDniFile] = useState<File | null>(null);
  const [paymentMode, setPaymentMode] = useState<'efectivo' | 'tarjeta' | 'transferencia' | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isPriceUnlocked, setIsPriceUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);

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
      const targetRoom = walkinRoom || '679077';
      const targetDate = walkinDate || todayStr;
      const nextDay = getNextDayStr(targetDate);
      setRoomInventory([]);
      setSelectedReserva({
        id: 'walkin',
        room: targetRoom,
        unit_id: walkinUnit || undefined,
        check_in: targetDate,
        check_out: nextDay,
        guest_name: ''
      });
      setShowCheckInModal(true);
      fetchAvailability(targetDate, nextDay);

      // Limpiar URL
      router.replace('/recepcion');
    }
  }, [searchParams, todayStr]);

  useEffect(() => {
    if (selectedReserva?.id === 'walkin' && selectedReserva.room && selectedReserva.check_in && selectedReserva.check_out && !isPriceUnlocked) {
      const season = getSeason(selectedReserva.check_in);
      const basePrice = PRICES[selectedReserva.room]?.[season] || 2000;
      const diffTime = Math.abs(new Date(selectedReserva.check_out).getTime() - new Date(selectedReserva.check_in).getTime());
      const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

      const priceWithChannel = Math.round(basePrice * 1.0);
      const tax = Math.round(priceWithChannel * 0.19);
      const totalPerNight = priceWithChannel + tax;
      const totalStay = totalPerNight * nights;

      setPaymentAmount(totalStay.toString());
    }
  }, [selectedReserva?.room, selectedReserva?.check_in, selectedReserva?.check_out, isPriceUnlocked]);

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
      const balanceVal = selectedReserva.balance !== undefined
        ? selectedReserva.balance
        : (selectedReserva.price_estimate || 0) - (selectedReserva.deposit || 0);
      
      if (balanceVal > 0) {
        setPaymentAmount(balanceVal.toString());
      } else {
        setPaymentAmount('');
      }
    }
  }, [showCheckInModal, selectedReserva]);

  const handleUnlockPrice = () => {
    if (pinInput === '1234') {
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
      const res = await fetch(`/api/availability?checkIn=${checkIn}&checkOut=${checkOut}`);
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
      const [r, t, inv, chk, acc, rms] = await Promise.all([
        fetch('/api/reservas'),
        fetch('/api/tasks'),
        supabase.from('inventory').select('*').order('category').order('item_name'),
        supabase.from('checkins').select('*'),
        supabase.from('accounts').select('*').order('sort_index', { ascending: true }).order('name', { ascending: true }),
        supabase.from('room_status').select('*')
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
              dni_image: checkinMap[String(res.id)]?.dni_image
            };
          });
        });
      }
      if (tj.success) setTasks(tj.data);
      if (inv.data) setInventory(inv.data);
      if (acc.data) setAccounts(acc.data);
      if (rms.data) setRoomStatuses(rms.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Sintetizador de AudioContext nativo para sonido de notificación premium
  const playPremiumNotificationSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
    };
  }, []);

  const llegadas = reservas.filter(r => r.check_in === todayStr);
  const salidas = reservas.filter(r => r.check_out === todayStr);

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
    let actualBookId = selectedReserva.id;

    // Si es walkin, crear en Beds24 primero
    if (selectedReserva.id === 'walkin') {
      try {
        const bgRes = await fetch('/api/reservas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: selectedReserva.room || '679077',
            unitId: selectedReserva.unit_id || '1',
            checkIn: todayStr,
            checkOut: selectedReserva.check_out || todayStr,
            guestName: selectedReserva.guest_name || 'Walk-In',
            isBlock: false,
            price: Number(paymentAmount || 0)
          })
        });
        const resData = await bgRes.json();
        if (!bgRes.ok) {
          alert('Error al sincronizar con Beds24: ' + (resData.error || 'Error desconocido'));
          setSubmitting(false);
          return;
        }

        const b24Array = resData.data;
        const beds24AssignedId = (Array.isArray(b24Array) && b24Array[0]?.new?.id)
          ? String(b24Array[0].new.id)
          : (resData.data && resData.data.id ? String(resData.data.id) : `b24-${Date.now()}`);

        actualBookId = beds24AssignedId;

        const baseRoomName = BEDS24_ROOMS.find(r => r.id === selectedReserva.room)?.name || selectedReserva.room;
        let finalRoomName = baseRoomName;
        if (selectedReserva.unit_id && roomInventory.length > 0) {
          const matchedGroup = roomInventory.find((g: any) => g.roomId === selectedReserva.room);
          if (matchedGroup) {
            const matchedUnit = matchedGroup.units.find((u: any) => u.unitId === selectedReserva.unit_id);
            if (matchedUnit) finalRoomName = `${baseRoomName} (${matchedUnit.name})`;
          }
        }
        const roomNameHuman = finalRoomName;

        let finalDniUrl = null;
        if (dniFile) {
          const fileExt = dniFile.name.split('.').pop() || 'jpg';
          const fileName = `dni_${beds24AssignedId}_${Date.now()}.${fileExt}`;
          const { data, error } = await supabase.storage.from('dni_images').upload(fileName, dniFile);
          if (!error && data) {
            const { data: publicUrlData } = supabase.storage.from('dni_images').getPublicUrl(data.path);
            finalDniUrl = publicUrlData.publicUrl;
          }
        }

        const { error: upsertErr } = await supabase.from('checkins').upsert({
          reservation_id: beds24AssignedId,
          guest_name: selectedReserva.guest_name,
          room: roomNameHuman,
          check_in_date: todayStr,
          check_out_date: selectedReserva.check_out || todayStr,
          status: 'checked_in',
          checked_in_by: operatorName,
          dni_image: finalDniUrl || null,
          document_url: finalDniUrl || null
        }, { onConflict: 'reservation_id' });

        if (upsertErr) console.error("Supabase Walkin Upsert Error:", upsertErr);

        setReservas(prev => [...prev, {
          id: beds24AssignedId,
          guest_name: selectedReserva.guest_name,
          room: roomNameHuman,
          check_in: todayStr,
          check_out: selectedReserva.check_out || todayStr,
          checked_in: true,
          dni_image: finalDniUrl || undefined
        }]);

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
              action: 'walk_in',
              room: roomNameHuman,
              details: `Registró Walk-In de ${selectedReserva.guest_name || 'Huésped'}`
            })
          });
        }

      } catch (err: any) {
        alert('Fallo de conexión al enviar reserva a Beds24: ' + err.message);
        setSubmitting(false);
        return;
      }
    } else {
      // Check-in de reserva existente
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

      const { error: upsertErr } = await supabase.from('checkins').upsert({
        reservation_id: String(selectedReserva.id),
        guest_name: selectedReserva.guest_name,
        room: selectedReserva.room,
        check_in_date: selectedReserva.check_in,
        check_out_date: selectedReserva.check_out,
        status: 'checked_in',
        checked_in_by: operatorName,
        dni_image: finalDniUrl || null,
        document_url: finalDniUrl || null
      }, { onConflict: 'reservation_id' });

      if (upsertErr) console.error("Supabase Checkin Error:", upsertErr);

      setReservas(prev => prev.map(r => r.id === selectedReserva.id ? { ...r, checked_in: true, dni_image: finalDniUrl || undefined } : r));

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
            action: 'check_in',
            room: selectedReserva.room,
            details: `Registró Check-In de ${selectedReserva.guest_name || 'Huésped'}`
          })
        });
      }
    }

    // Registrar pago si corresponde
    if (paymentMode && paymentAmount) {
      const amountNum = Number(paymentAmount);
      const baseDesc = `Cobro Check-in ${selectedReserva.guest_name || 'Huésped'} - Hab ${selectedReserva.room} (Operado por: ${operatorName}) [Reserva B24: ${actualBookId}]`;

      // 1. Insertar transacción local en Supabase con tag de pendiente
      const { data: insertedRows, error: insertErr } = await supabase.from('finances').insert({
        type: 'ingreso',
        amount: amountNum,
        category: 'Reserva Directa',
        description: `${baseDesc} [Pending Sync: B24]`,
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

      // 2. Sincronizar pago con Beds24 en tiempo real
      let syncedSuccess = false;
      try {
        const b24PayRes = await fetch('/api/reservas/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookId: actualBookId,
            amount: amountNum,
            paymentMethod: paymentMode,
            employeeNum: emp?.employee_num || null
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

      // 3. Si fue exitoso, actualizar tag a sincronizado
      if (syncedSuccess && insertedRecordId) {
        await supabase.from('finances').update({
          description: `${baseDesc} [Synced: B24]`
        }).eq('id', insertedRecordId);
      }

      // Log de cobro
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
            details: `Recibió pago de $${paymentAmount} vía ${paymentMode} para Habitación ${selectedReserva.room} (Depositado en sobre: ${matchedAccName})`
          })
        });
      }
    }

    setShowCheckInModal(false);
    setSelectedReserva(null);
    setDniPreview(null);
    setDniFile(null);
    setPaymentMode(null);
    setPaymentAmount('');
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
          details: `Procesó Check-Out de ${r.guest_name || 'Huésped'}. Habitación ${roomNumber} marcada en limpieza.`
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
    const match = (roomStr || '').match(/\(([^)]+)\)/);
    return match ? match[1] : roomStr.split(' ')[0];
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

          {/* ── BOTONES DE ACCIÓN RÁPIDA ─────────────────────────────────── */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setRoomInventory([]);
                setSelectedReserva({ id: 'walkin', room: '101', check_in: todayStr, check_out: tomorrowStr, guest_name: '' });
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
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                <h3 className="text-[12px] font-extrabold text-zinc-800 uppercase tracking-wider">Llegadas Hoy</h3>
              </div>
              <span className="text-[11px] font-bold bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-100">
                {llegadas.length} llegadas
              </span>
            </div>

            {llegadas.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">
                No hay llegadas programadas para hoy.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50/30">
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Unidad</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Huésped</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Teléfono</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Pax</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Noches</th>
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
                            ${r.price_estimate?.toLocaleString('es-MX') || '—'}
                          </td>
                          <td className="py-4 px-4 text-right text-[13px]">
                            {r.checked_in ? (
                              <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                $0.00
                              </span>
                            ) : (
                              <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                                ${r.price_estimate?.toLocaleString('es-MX') || '—'}
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
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <h3 className="text-[12px] font-extrabold text-zinc-800 uppercase tracking-wider">Salidas Hoy</h3>
              </div>
              <span className="text-[11px] font-bold bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full border border-amber-100">
                {salidas.length} salidas
              </span>
            </div>

            {salidas.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">
                No hay salidas programadas para hoy.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50/30">
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Unidad</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Huésped</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Noches</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Tarifa Total</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Estado</th>
                      <th className="py-3.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {salidas.map(r => {
                      const unit = getUnitDisplay(r.room);
                      const isPending = !r.checked_out;
                      return (
                        <tr key={r.id} className="hover:bg-zinc-50/30 transition-colors">
                          <td className="py-4 px-4">
                            <span className="inline-flex items-center justify-center font-extrabold text-[12px] bg-zinc-900 text-white rounded-lg px-2.5 py-1 min-w-[36px]">
                              {unit}
                            </span>
                          </td>
                          <td className="py-4 px-4 font-semibold text-zinc-950 text-[13px]">
                            {r.guest_name}
                          </td>
                          <td className="py-4 px-4 text-center text-[12px] font-semibold text-zinc-700">
                            {r.nights || 1}n
                          </td>
                          <td className="py-4 px-4 text-right font-bold text-zinc-900 text-[13px]">
                            ${r.price_estimate?.toLocaleString('es-MX') || '—'}
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
                                onClick={() => runWithSignature('checkout', (reserva) => processCheckOut(reserva), r)}
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
                  {selectedReserva.id === 'walkin' ? 'Registrar Walk-In' : 'Proceso de Check-In'}
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
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              
              {selectedReserva.id === 'walkin' ? (
                // Lógica de Walk-In
                <div className="bg-zinc-50 border border-zinc-200/60 rounded-2xl p-4 space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Nombre del Huésped</label>
                    <input
                      type="text"
                      value={selectedReserva.guest_name}
                      onChange={e => setSelectedReserva({ ...selectedReserva, guest_name: e.target.value })}
                      placeholder="Ej. Carlos Slim"
                      className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-[14px] font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-zinc-900"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Check-In (Entrada)</label>
                      <input
                        key={todayStr ? `walkin-in-${todayStr}` : 'walkin-in-loading'}
                        type="date"
                        min={todayStr}
                        value={selectedReserva.check_in}
                        onChange={e => {
                          let newIn = e.target.value;
                          if (newIn && newIn < todayStr) {
                            newIn = todayStr;
                          }
                          // Recalcular el check-out manteniendo las noches actuales
                          const currentNights = getNightsBetweenDates(selectedReserva.check_in, selectedReserva.check_out);
                          const newOut = addDaysToDateStr(newIn, currentNights);
                          
                          setSelectedReserva({ ...selectedReserva, check_in: newIn, check_out: newOut, room: '', unit_id: '' });
                          fetchAvailability(newIn, newOut);
                        }}
                        className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-[14px] font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-zinc-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Noches</label>
                      <div className="flex items-center bg-white border border-zinc-200 rounded-xl px-2 py-1 h-[42px] justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            const currentNights = getNightsBetweenDates(selectedReserva.check_in, selectedReserva.check_out);
                            if (currentNights > 1) {
                              const newNights = currentNights - 1;
                              const newOut = addDaysToDateStr(selectedReserva.check_in, newNights);
                              setSelectedReserva({ ...selectedReserva, check_out: newOut, room: '', unit_id: '' });
                              fetchAvailability(selectedReserva.check_in, newOut);
                            }
                          }}
                          className="w-8 h-8 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-zinc-600 transition-all active:scale-90"
                          disabled={getNightsBetweenDates(selectedReserva.check_in, selectedReserva.check_out) <= 1}
                        >
                          <Minus size={14} strokeWidth={2.5} />
                        </button>
                        <span className="text-[14px] font-bold text-zinc-900 px-2 min-w-[24px] text-center">
                          {getNightsBetweenDates(selectedReserva.check_in, selectedReserva.check_out)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const currentNights = getNightsBetweenDates(selectedReserva.check_in, selectedReserva.check_out);
                            const newNights = currentNights + 1;
                            const newOut = addDaysToDateStr(selectedReserva.check_in, newNights);
                            setSelectedReserva({ ...selectedReserva, check_out: newOut, room: '', unit_id: '' });
                            fetchAvailability(selectedReserva.check_in, newOut);
                          }}
                          className="w-8 h-8 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 rounded-lg text-zinc-600 transition-all active:scale-90"
                        >
                          <Plus size={14} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {selectedReserva.check_out && (
                    <div className="flex items-center gap-2.5 bg-zinc-100/60 border border-zinc-200/40 rounded-xl px-3 py-2 text-zinc-600 animate-in fade-in duration-200">
                      <Calendar size={13} className="text-zinc-400 shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Check-Out (Salida):</span>
                      <span className="text-[12px] font-black text-zinc-800">
                        {format(parseISO(selectedReserva.check_out), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
                      </span>
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                      Seleccionar Habitación Libre {checkingAvail && '· buscando...'}
                    </label>

                    {roomInventory.length > 0 ? (
                      <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1">
                        {roomInventory.map((roomGroup: any) => (
                          <div key={roomGroup.roomId} className="space-y-1">
                            <p className="text-[11px] font-bold text-zinc-700">{roomGroup.name}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {roomGroup.units.map((u: any) => {
                                const isSelected = selectedReserva.room === roomGroup.roomId && selectedReserva.unit_id === u.unitId;
                                return (
                                  <button
                                    key={u.unitId}
                                    disabled={!u.isAvailable}
                                    onClick={() => setSelectedReserva({ ...selectedReserva, room: roomGroup.roomId, unit_id: u.unitId })}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                      !u.isAvailable
                                        ? 'bg-zinc-100 border-zinc-200 text-zinc-300 line-through cursor-not-allowed'
                                        : isSelected
                                        ? 'bg-zinc-900 border-zinc-900 text-white shadow-sm'
                                        : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
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
                      <div className="bg-white border border-zinc-200/80 p-3 rounded-xl text-center">
                        <p className="text-[11px] text-zinc-400 font-medium">Ingresa fechas válidas para buscar disponibilidad.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // Información Reserva Existente
                <div className="bg-zinc-50 border border-zinc-200/60 rounded-2xl p-4">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Huésped</span>
                  <p className="text-[16px] font-bold text-zinc-950 leading-tight">{selectedReserva.guest_name}</p>
                  
                  <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-zinc-200/40">
                    <div>
                      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Habitación</span>
                      <p className="text-[13px] font-bold text-zinc-900">{selectedReserva.room}</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Salida (Out)</span>
                      <p className="text-[13px] font-bold text-zinc-900">
                        {selectedReserva.check_out ? format(parseISO(selectedReserva.check_out), 'dd MMM yyyy', { locale: es }) : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

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

              {/* Adeudo por Pagar */}
              {(() => {
                const balanceVal = selectedReserva.id === 'walkin'
                  ? Number(paymentAmount || 0)
                  : (selectedReserva.balance !== undefined
                      ? selectedReserva.balance
                      : (selectedReserva.price_estimate || 0) - (selectedReserva.deposit || 0));

                const depositVal = selectedReserva.id === 'walkin' ? 0 : (selectedReserva.deposit || 0);
                const totalVal = selectedReserva.id === 'walkin'
                  ? Number(paymentAmount || 0)
                  : (selectedReserva.price_estimate || 0);

                if (balanceVal <= 0) {
                  return (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in fade-in duration-300">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-widest block">
                          Estancia Liquidada
                        </span>
                        <p className="text-[11px] text-emerald-600 font-medium">
                          Total: ${totalVal.toLocaleString('es-MX')} | Anticipos: ${depositVal.toLocaleString('es-MX')} (100% Pagado)
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[20px] font-black text-emerald-700">
                          $0.00 MXN
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in fade-in duration-300">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-extrabold text-rose-800 uppercase tracking-widest block">
                        Adeudo por Pagar
                      </span>
                      {selectedReserva.id !== 'walkin' ? (
                        <p className="text-[10px] text-rose-600 font-medium leading-tight">
                          Total: ${totalVal.toLocaleString('es-MX')} | Anticipos: ${depositVal.toLocaleString('es-MX')}
                        </p>
                      ) : (
                        <p className="text-[11px] text-rose-600 font-medium">
                          Monto total a cobrar por la estancia.
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[20px] font-black text-rose-700">
                        ${balanceVal.toLocaleString('es-MX')} MXN
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Registro de Pago */}
              <div className="space-y-3 pt-2">
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
                    {selectedReserva.id === 'walkin' && (
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">Monto a cobrar</span>
                        <button
                          type="button"
                          onClick={() => isPriceUnlocked ? setIsPriceUnlocked(false) : setShowPinModal(true)}
                          className="text-[10px] font-extrabold text-blue-600 flex items-center gap-1 bg-none border-none hover:underline cursor-pointer"
                        >
                          {isPriceUnlocked ? <Unlock size={11} /> : <Lock size={11} />}
                          {isPriceUnlocked ? 'BLOQUEAR PRECIO' : 'MODIFICAR PRECIO'}
                        </button>
                      </div>
                    )}
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-base">$</span>
                      <input
                        type="number"
                        value={paymentAmount}
                        onChange={e => setPaymentAmount(e.target.value)}
                        placeholder="0.00"
                        readOnly={selectedReserva.id === 'walkin' && !isPriceUnlocked}
                        className={`w-full bg-white border border-zinc-200 rounded-xl py-2.5 pl-8 pr-4 font-bold text-[15px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-zinc-900 ${
                          (selectedReserva.id === 'walkin' && !isPriceUnlocked) ? 'bg-zinc-100/60 text-zinc-400 cursor-not-allowed' : ''
                        }`}
                      />
                    </div>

                    {/* Selector de cuenta/sobre */}
                    <div className="space-y-1.5 pt-1">
                      <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">
                        ¿A qué sobre va el dinero?
                      </label>
                      <select
                        value={selectedAccountId}
                        onChange={e => setSelectedAccountId(e.target.value)}
                        required
                        className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 text-[13px] font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 cursor-pointer animate-in slide-in-from-top-1 duration-200"
                      >
                        <option value="" disabled>Selecciona un sobre...</option>
                        {accounts
                          .filter(acc => {
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
                          })
                          .map(acc => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Acción de Envío */}
            <div className="p-5 border-t border-zinc-100 bg-zinc-50 flex flex-col gap-2">
              <button
                onClick={() => runWithSignature('checkin', () => processCheckIn())}
                disabled={(() => {
                  if (submitting) return true;
                  
                  // Validación DNI obligatoria para reservas existentes
                  if (selectedReserva.id !== 'walkin' && !dniPreview) return true;

                  // Validación campos Walk-in obligatorios
                  if (selectedReserva.id === 'walkin' && (!selectedReserva.guest_name || !selectedReserva.unit_id)) return true;

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
                {submitting ? 'Registrando...' : 'Completar Check-In'}
              </button>
            </div>
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

                    setForm({ type: 'mantenimiento', room: 'General', description: '' });
                    setPhotoFile(null);
                    setPhotoBase64(null);
                    setShowForm(false);
                    alert('¡Incidencia de mantenimiento reportada con éxito!');
                    setSubmitting(false);
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

    </div>
  );
}

