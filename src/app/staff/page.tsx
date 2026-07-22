"use client";

import { useEffect, useState, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  CheckCircle2, AlertTriangle, Wrench, Sparkles, BedDouble,
  ArrowDownLeft, Clock, Plus, X, Send,
  ChevronDown, CheckCheck, Camera, Bell, Package, Minus,
  RefreshCw, ShieldAlert, UserPlus, Trash2, Download, Database, 
  History, ChevronLeft, Calendar, Moon, Users
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { getActiveEmployee, clearActiveEmployee, Employee, syncEmployeesFromServer, getOfficialEmployees } from '@/lib/auth';
import EmployeeModal from '@/components/EmployeeModal';
import { getSeason } from '@/lib/beds24';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const normalizeText = (text: string) => 
  (text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();


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
  const parenMatch = roomStr.match(/\(([^)]+)\)/);
  if (parenMatch) return parenMatch[1];
  const numMatch = roomStr.match(/(\d+)\s*$/);
  if (numMatch) return numMatch[1];
  return roomStr;
};

// Habitaciones físicas consistentes (101 a 402) según requerimiento de Jaroje OS
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

interface Reserva {
  id: string;
  room: string;
  room_name?: string;
  guest_name?: string;
  guest_phone?: string;
  guest_email?: string;
  check_in: string;
  check_out: string;
  checked_in?: boolean;
  checked_out?: boolean;
  nights?: number;
  price_estimate?: number;
  price_per_night?: number;
  num_adult?: number;
  num_child?: number;
  deposit?: number;
  balance?: number;
  notes?: string;
  channel?: string;
}

interface CleanTask {
  room: string;
  type: 'checkout' | 'stayover';
  dbStatus: string;
  operStatus: string;
  guestName?: string;
  keysReturned: boolean;
  reserva?: any;
  isUpdatedToday: boolean;
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
  photo_url?: string | null;
  resolution_photo_url?: string | null;
  resolved_at?: string | null;
}

interface RoomStatus {
  room_number: string;
  status: 'disponible' | 'en_limpieza' | 'limpia';
  updated_at: string;
  updated_by: string;
  guest_name?: string;
}

const TYPE_CFG: Record<string, any> = {
  limpieza:      { icon: Sparkles,      label: 'Limpieza',      bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  mantenimiento: { icon: Wrench,        label: 'Mantenimiento', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
  otro:          { icon: AlertTriangle, label: 'Otro',          bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  aviso:         { icon: Bell,          label: 'Aviso Admin',   bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },
};

const elapsed = (d: string) => {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'Ahora mismo';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
};

async function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 900;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = (h * MAX) / w; w = MAX; }
          else { w = (w * MAX) / h; h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
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
    if (dbStatus === 'limpieza_programada') return 'limpieza_programada'; // Amarillo (Programada manualmente hoy)
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

    const isTwoDayRoom = ['401'].includes(roomNum);
    const isThreeDayRoom = ['101','102','103','104','105','106','107','201','202','203','204','205','206','501','402'].includes(roomNum);
    const isDailyRoom = ['301','302','303','304','305','306','500','502','503','504','505','506','507'].includes(roomNum);

    if (isTwoDayRoom && dayOfStay >= 3 && (dayOfStay - 1) % 2 === 0) {
      return 'limpieza_programada'; // Amarillo automático cada 2 días (Stayover cada 2 días)
    }
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
    return rRoom.includes(roomNum) && r.check_out === todayStr && r.checked_in && !r.checked_out;
  });

  if (isSalidaHoy) {
    return 'salida_hoy'; // Rojo muy tenue por checkout programado hoy
  }

  if (hasResToday) {
    return 'ocupada';
  }

  // 3. Si no tiene salida ni estancia programada que requiera limpieza hoy, está disponible
  return 'disponible'; // Verde por defecto
}

export default function StaffPage() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [kpiModalType, setKpiModalType] = useState<'encasa' | 'llegan' | 'salen' | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [todayStr, setTodayStr] = useState('');

  const isDateToday = (dStr?: string) => {
    if (!dStr) return false;
    try {
      return getLocalDateStr(new Date(dStr)) === todayStr;
    } catch (e) {
      return dStr.startsWith(todayStr);
    }
  };

  const [inventory, setInventory] = useState<any[]>([]);
  const [roomStatuses, setRoomStatuses] = useState<RoomStatus[]>([]);
  const [mainTab, setMainTab] = useState<'tareas' | 'housekeeping'>('tareas');

  // Mantenimiento Programado Preventivo State
  const [viewMode, setViewMode] = useState<'tasks' | 'schedules'>('tasks');
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [schedRoom, setSchedRoom] = useState('General');
  const [schedDesc, setSchedDesc] = useState('');
  const [schedPeriod, setSchedPeriod] = useState('1 month');
  
  const [employeesList, setEmployeesList] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<Record<string, { employeeNum: string; notes: string }>>({});
  const [generalObservations, setGeneralObservations] = useState('');

  // Cargar recamareras oficiales y asignaciones guardadas en localStorage
  useEffect(() => {
    const loadEmps = async () => {
      const emps = await syncEmployeesFromServer();
      setEmployeesList(emps.filter(e => e.department === 'limpieza'));
    };
    loadEmps();

    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('jaroje_daily_assignments');
      if (saved) {
        try {
          setAssignments(JSON.parse(saved));
        } catch (e) {
          console.error('Error parseando jaroje_daily_assignments:', e);
        }
      }
      const savedObs = localStorage.getItem('jaroje_general_observations');
      if (savedObs) setGeneralObservations(savedObs);
    }
  }, []);

  const updateAssignment = (room: string, employeeNum: string, notes: string) => {
    setAssignments(prev => {
      const next = { ...prev, [room]: { employeeNum, notes } };
      localStorage.setItem('jaroje_daily_assignments', JSON.stringify(next));
      return next;
    });
  };

  const updateGeneralObservations = (text: string) => {
    setGeneralObservations(text);
    localStorage.setItem('jaroje_general_observations', text);
  };
  const [taskTab, setTaskTab] = useState<'nuevos' | 'pendientes' | 'en_proceso' | 'resueltos'>('nuevos');
  const [searchQuery, setSearchQuery] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolvingTask, setResolvingTask] = useState<Task | null>(null);
  const [resolveComments, setResolveComments] = useState('');
  const [resolvePhotoFile, setResolvePhotoFile] = useState<File | null>(null);
  
  // Modales
  const [showForm, setShowForm] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const openDetailsModal = (task: Task) => {
    setSelectedTaskForDetails(task);
    setShowDetailsModal(true);
  };

  const handleDeleteTask = async (task: Task) => {
    if (!confirm("⚠️ ¿Estás seguro de que deseas eliminar este reporte de mantenimiento? Esta acción no se puede deshacer.")) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks?id=${task.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar la tarea');
      
      alert('🗑️ Reporte eliminado exitosamente.');
      setShowDetailsModal(false);
      fetchData(); // recargar tareas
    } catch (e: any) {
      alert(`❌ Error al eliminar:\n\n${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };
  
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const resolvePhotoRef = useRef<HTMLInputElement>(null);
  
  const staffName = typeof window !== 'undefined' ? (localStorage.getItem('jaroje_staff_name') || 'Personal') : 'Personal';
  const role = typeof window !== 'undefined' ? (localStorage.getItem('jaroje_role') || 'staff_limpieza') : 'staff_limpieza';
  
  const isMantenimiento = role === 'staff_mantenimiento';
  const isLimpieza = role === 'staff_limpieza';
  const isRecepcionOrAdmin = role === 'reception' || role === 'admin';
  const canModifyStatus = isLimpieza || role === 'reception'; // Solo personal de limpieza y recepción modifican limpieza, Admin lee

  const currentDept = isMantenimiento ? 'mantenimiento' : 'limpieza';

  const getTaskImages = (t: Task) => {
    const list: string[] = [];
    if (t.photo_url && t.photo_url !== 'null' && t.photo_url.trim() !== '') {
      list.push(t.photo_url);
    }
    if (t.image_base64 && t.image_base64 !== 'null' && t.image_base64.trim() !== '') {
      const val = t.image_base64.trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            list.push(...parsed);
          } else {
            list.push(val);
          }
        } catch (e) {
          list.push(val);
        }
      } else {
        list.push(val);
      }
    }
    return list;
  };

  const [activeIndices, setActiveIndices] = useState<Record<string, number>>({});

  const handleScroll = (taskId: string, e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    if (width > 0) {
      const newIndex = Math.round(scrollLeft / width);
      setActiveIndices(prev => {
        if (prev[taskId] === newIndex) return prev;
        return { ...prev, [taskId]: newIndex };
      });
    }
  };

  const renderTaskImagesCarousel = (t: Task) => {
    const images = getTaskImages(t);
    if (images.length === 0) return null;
    const currentIndex = activeIndices[t.id] ?? 0;
    
    return (
      <div className="relative mt-2">
        <style dangerouslySetInnerHTML={{__html: `
          .no-scrollbar::-webkit-scrollbar {
            display: none !important;
          }
        `}} />
        <div 
          onScroll={(e) => handleScroll(t.id, e)}
          className="flex overflow-x-auto snap-x snap-mandatory gap-2 rounded-2xl border border-zinc-200 shadow-sm scroll-smooth no-scrollbar"
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {images.map((img, idx) => (
            <div key={idx} className="shrink-0 w-full aspect-video snap-center relative bg-zinc-100 flex items-center justify-center">
              <a href={img} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="w-full h-full">
                <img src={img} alt={`Evidencia ${idx}`} className="w-full h-full object-cover select-none" />
              </a>
              {images.length > 1 && (
                <span className="absolute bottom-2.5 right-2.5 bg-black/60 text-white text-[10px] font-black px-2.5 py-1 rounded-lg select-none tracking-wider z-10">
                  {currentIndex + 1} / {images.length}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Auditoría y Seguimiento de Empleados
  const [activeEmployee, setActiveEmployeeState] = useState<Employee | null>(null);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: 'room_status' | 'resolve_task' | 'report_task';
    payload?: any;
    callback: (...args: any[]) => void;
  } | null>(null);

  // Inicializar Empleado Activo según el rol
  useEffect(() => {
    const emp = getActiveEmployee(currentDept);
    setActiveEmployeeState(emp);
    if (!emp) {
      setShowEmployeeModal(true);
    }
  }, [role, isMantenimiento, currentDept]);

  // Interceptor de firma de empleado
  const runWithSignature = (
    type: 'room_status' | 'resolve_task' | 'report_task',
    callback: (...args: any[]) => void,
    payload?: any
  ) => {
    const emp = getActiveEmployee(currentDept);
    if (!emp) {
      setPendingAction({ type, payload, callback });
      setShowEmployeeModal(true);
    } else {
      callback(payload);
    }
  };

  const [form, setForm] = useState({ type: isMantenimiento ? 'mantenimiento' : 'limpieza', room: 'General', description: '' });

  // Lock body on modal open and hide bottom navigation bar
  useEffect(() => {
    const isAnyModalOpen = showForm || showStatusModal || showResolveModal || showEmployeeModal;
    if (isAnyModalOpen) {
      document.body.classList.add('overflow-hidden', 'panel-open');
    } else {
      document.body.classList.remove('overflow-hidden', 'panel-open');
    }
    return () => { 
      document.body.classList.remove('overflow-hidden', 'panel-open'); 
    };
  }, [showForm, showStatusModal, showResolveModal, showEmployeeModal]);

  const fetchData = async () => {
    try {
      const [r, t, inv, rs, chk] = await Promise.all([
        fetch('/api/reservas?t=' + Date.now()),
        fetch('/api/tasks?t=' + Date.now()),
        supabase.from('inventory').select('*').order('category').order('item_name'),
        fetch('/api/room-status?t=' + Date.now()),
        supabase.from('checkins').select('*')
      ]);
      
      const rj = await r.json();
      const tj = await t.json();
      const rsj = await rs.json();
      
      let checkinMap: Record<string, any> = {};
      if (chk.data) {
        chk.data.forEach(c => {
          checkinMap[String(c.reservation_id)] = c;
        });
      }
      
      if (rj.success && rj.data) {
        setReservas(rj.data.map((res: any) => ({
          ...res,
          room: res.room_name || res.room || 'Sin asignar',
          checked_in: checkinMap[String(res.id)]?.status === 'checked_in',
          checked_out: checkinMap[String(res.id)]?.status === 'checked_out'
        })));
      }
      if (tj.success) setTasks(tj.data);
      if (inv.data) setInventory(inv.data);
      if (rsj.success && rsj.data) setRoomStatuses(rsj.data);
    } catch (e) {
      console.error('Error al cargar datos en Staff:', e);
    }
  };

  useEffect(() => {
    setTodayStr(getLocalDateStr());
    fetchData();
    fetchSchedules();

    // ── SUPABASE REALTIME EN TIEMPO REAL PARA ROOM_STATUS ──
    const channel = supabase
      .channel('room_status_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_status' },
        (payload) => {
          console.log('Cambio en room_status recibido por Realtime:', payload);
          fetchData(); // Sincroniza al instante todos los datos sin recargar la página
        }
      )
      .subscribe();

    // Polling secundario de seguridad cada 15 segundos
    const iv = setInterval(fetchData, 15_000);
    
    return () => {
      clearInterval(iv);
      supabase.removeChannel(channel);
    };
  }, []);

  const llegadas = reservas.filter(r => r.check_out >= todayStr && r.check_in <= todayStr && !r.checked_in && !r.checked_out);
  const salidas  = reservas.filter(r => r.check_out === todayStr && !r.checked_out);
  const ocupadas = reservas.filter(r => r.check_out > todayStr && r.checked_in);

  const getScheduledCleanings = (): CleanTask[] => {
    const list: CleanTask[] = [];
    
    ROOMS.forEach(r => {
      const dbStatus = getRoomDbStatus(r, roomStatuses);
      const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
      const operStatus = getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);
      
      // 1. Verificar si es salida hoy (Check-out)
      const salidaRes = reservas.find(res => {
        const rRoom = String(res.room || '').replace(/[\s()]/g, '');
        return rRoom.includes(r) && res.check_out === todayStr && !res.checked_out;
      });
      
      if (salidaRes) {
        list.push({
          room: r,
          type: 'checkout',
          dbStatus,
          operStatus,
          guestName: salidaRes.guest_name,
          keysReturned: dbStatus === 'sucio_checkout' || salidaRes.checked_out || false,
          reserva: salidaRes,
          isUpdatedToday: isDateToday(dbStatusObj?.updated_at)
        });
        return;
      }
      
      // 2. Verificar si es stayover hoy (Servicio durante estancia)
      const stayoverRes = reservas.find(res => {
        const rRoom = String(res.room || '').replace(/[\s()]/g, '');
        return rRoom.includes(r) && res.check_in <= todayStr && res.check_out > todayStr;
      });
      
      if (stayoverRes && !stayoverRes.checked_out) {
        // Calcular si requiere servicio hoy por regla de días
        const checkInDate = new Date(stayoverRes.check_in + 'T12:00:00');
        const todayDate = new Date(todayStr + 'T12:00:00');
        const diffTime = Math.abs(todayDate.getTime() - checkInDate.getTime());
        const dayOfStay = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // Día 1, 2, 3...
        
        const isTwoDayRoom = ['401'].includes(r);
        const isThreeDayRoom = ['101','102','103','104','105','106','107','201','202','203','204','205','206','501','402'].includes(r);
        const isDailyRoom = ['301','302','303','304','305','306','500','502','503','504','505','506','507'].includes(r);
        
        let requiresService = false;
        if (isTwoDayRoom && dayOfStay >= 3 && (dayOfStay - 1) % 2 === 0) {
          requiresService = true;
        } else if (isThreeDayRoom && dayOfStay >= 3 && dayOfStay % 3 === 0) {
          requiresService = true;
        } else if (isDailyRoom && dayOfStay >= 2) {
          requiresService = true;
        }
        
        if (requiresService) {
          list.push({
            room: r,
            type: 'stayover',
            dbStatus,
            operStatus,
            guestName: stayoverRes.guest_name,
            keysReturned: false,
            reserva: stayoverRes,
            isUpdatedToday: isDateToday(dbStatusObj?.updated_at)
          });
        }
      }

      // 3. Fallback Unificador: Si la habitación está en estado sucio o limpieza y no tiene una reserva activa hoy
      // registrada en la lista, o si ya fue marcada como limpia (azul) o disponible (verde) hoy, se agrega.
      const alreadyAdded = list.some(item => item.room === r);
      const isDbStatusUpdatedToday = dbStatusObj?.updated_at ? isDateToday(dbStatusObj.updated_at) : false;
      if (!alreadyAdded && (
        operStatus === 'sucio_checkout' || 
        operStatus === 'en_limpieza' || 
        operStatus === 'limpieza_programada' ||
        ((dbStatus === 'sucio_checkout' || dbStatus === 'en_limpieza' || dbStatus === 'limpieza_programada') && isDbStatusUpdatedToday) ||
        (dbStatus === 'limpia' && isDbStatusUpdatedToday) ||
        (dbStatus === 'disponible' && isDbStatusUpdatedToday)
      )) {
        list.push({
          room: r,
          type: (operStatus === 'sucio_checkout' || dbStatus === 'sucio_checkout') ? 'checkout' : 'stayover',
          dbStatus,
          operStatus,
          guestName: (operStatus === 'sucio_checkout' || dbStatus === 'sucio_checkout') ? 'Check-Out' : (dbStatus === 'limpia' ? 'Limpia' : 'Servicio'),
          keysReturned: operStatus === 'sucio_checkout' || dbStatus === 'sucio_checkout',
          reserva: null,
          isUpdatedToday: isDbStatusUpdatedToday
        });
      }
    });
    
    // Ordenar: primero check-outs no terminados, luego stayovers no terminados, luego terminados.
    return list.sort((a, b) => {
      const aFinished = a.dbStatus === 'limpia' || (a.dbStatus === 'disponible' && a.isUpdatedToday);
      const bFinished = b.dbStatus === 'limpia' || (b.dbStatus === 'disponible' && b.isUpdatedToday);
      if (aFinished && !bFinished) return 1;
      if (!aFinished && bFinished) return -1;
      
      // Luego por tipo: checkout tiene prioridad sobre stayover
      if (a.type === 'checkout' && b.type !== 'checkout') return -1;
      if (a.type !== 'checkout' && b.type === 'checkout') return 1;
      
      // Luego por número de habitación
      return a.room.localeCompare(b.room, undefined, { numeric: true });
    });
  };

  const roleFilteredTasks = tasks.filter(t => {
    const descLower = (t.description || '').toLowerCase();
    const isCleanTask = t.type === 'limpieza' || 
                        descLower.includes('check-out completado') || 
                        descLower.includes('lista para limpieza') || 
                        descLower.includes('servicio de limpieza') || 
                        descLower.includes('limpieza programada');

    if (isMantenimiento) {
      // Si es mantenimiento, excluir estrictamente tareas que sean de limpieza
      if (isCleanTask) return false;
      return t.type === 'mantenimiento' || t.type === 'aviso' || t.type === 'otro';
    }

    if (isLimpieza) {
      // Si es limpieza, permitir las de limpieza y avisos/otros no de mantenimiento
      if (isCleanTask) return true;
      if (t.type === 'mantenimiento') return false;
      return t.type === 'limpieza' || t.type === 'aviso' || t.type === 'otro';
    }

    return true;
  });

  const nuevos      = roleFilteredTasks.filter(t => t.status === 'nuevo');
  const pendientes  = roleFilteredTasks.filter(t => t.status === 'pendiente');
  const enProceso   = roleFilteredTasks.filter(t => t.status === 'en_proceso');
  const resueltos   = roleFilteredTasks.filter(t => t.status === 'resuelta');

  const filterBySearch = (list: Task[]) => {
    if (!searchQuery.trim()) return list;
    const q = normalizeText(searchQuery).trim();
    return list.filter(t => 
      normalizeText(t.description).includes(q) || 
      normalizeText(t.room).includes(q)
    );
  };

  const filteredNuevos = filterBySearch(nuevos);
  const filteredPendientes = filterBySearch(pendientes);
  const filteredEnProceso = filterBySearch(enProceso);
  const filteredResueltos = filterBySearch(resueltos);

  const handleOpenResolveModal = (task: Task) => {
    setResolvingTask(task);
    setResolveComments('');
    setResolvePhotoFile(null);
    setShowResolveModal(true);
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveComments.trim()) {
      alert("Por favor ingresa los comentarios de resolución.");
      return;
    }
    if (!resolvingTask) return;
    
    setSubmitting(true);
    let finalResPhotoUrl = null;

    try {
      const emp = getActiveEmployee('mantenimiento');
      const operatorName = emp ? `${emp.full_name} (${emp.employee_num})` : staffName;

      // Subir foto de resolución si existe (Opcional)
      if (resolvePhotoFile) {
        const fileExt = resolvePhotoFile.name.split('.').pop();
        const fileName = `resolucion_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('maintenance_photos').upload(fileName, resolvePhotoFile);
        if (!uploadError) {
          const { data } = supabase.storage.from('maintenance_photos').getPublicUrl(fileName);
          finalResPhotoUrl = data.publicUrl;
        } else {
          console.error("Upload resolution photo error:", uploadError);
        }
      }

      // Concatenar comentarios de resolución a la descripción original de la tarea
      const formattedComments = `\n\n🛠️ Cierre: ${resolveComments.trim()}`;
      const newDescription = resolvingTask.description + formattedComments;

      const payload = {
        status: 'resuelta',
        description: newDescription,
        resolved_at: new Date().toISOString(),
        resolution_photo_url: finalResPhotoUrl
      };

      const { error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', resolvingTask.id);

      if (error) throw error;

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
              module: 'mantenimiento',
              action: 'resolve_task',
              room: resolvingTask.room || 'General',
              details: `Marcó como RESUELTA la tarea técnica en Habitación ${resolvingTask.room || 'General'}: ${resolvingTask.description || ''} - Cierre: ${resolveComments.trim()}`
            })
          });
        } catch (logErr) {
          console.error('Error logging resolve_task:', logErr);
        }
      }

      setShowResolveModal(false);
      fetchData();
      setSuccessMsg('¡Incidencia resuelta y cerrada!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch(e) {
      console.error(e);
      alert('Error al resolver la tarea.');
    }
    setSubmitting(false);
  };

  const updateTaskStatus = async (id: string, status: string) => {
    const emp = getActiveEmployee('mantenimiento');
    const operatorName = emp ? `${emp.full_name} (${emp.employee_num})` : staffName;

    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_status', id, status, operator: operatorName }),
    });

    // Registrar log de auditoría
    if (emp) {
      try {
        const targetTask = tasks.find(tk => tk.id === id);
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: emp.employee_num,
            employee_name: emp.full_name,
            department: emp.department,
            module: 'mantenimiento',
            action: status === 'resuelta' ? 'resolve_task' : 'start_task',
            room: targetTask?.room || 'General',
            details: status === 'resuelta' 
              ? `Marcó como RESUELTA la tarea técnica en Habitación ${targetTask?.room || 'General'}: ${targetTask?.description || ''}`
              : `Inició proceso ('En Proceso') de tarea técnica en Habitación ${targetTask?.room || 'General'}: ${targetTask?.description || ''}`
          })
        });
      } catch (e) {
        console.error('Error registrando log de tarea técnica:', e);
      }
    }

    fetchData();
  };

  const updateStock = async (id: string, currentStock: number, change: number) => {
    if (currentStock + change < 0) return;
    setInventory(prev => prev.map(item => item.id === id ? { ...item, stock: item.stock + change } : item));
    await supabase.from('inventory').update({ stock: currentStock + change, last_updated_by: staffName }).eq('id', id);
  };

  const changeRoomStatus = async (roomNumber: string, newStatus: 'disponible' | 'en_limpieza' | 'limpia') => {
    const emp = getActiveEmployee('limpieza');
    const operatorName = emp ? `${emp.full_name} (${emp.employee_num})` : staffName;

    // Si cambia a limpia, crear también una tarea resuelta en /api/tasks para mantener el registro
    if (newStatus === 'limpia') {
      const tempTask: Task = {
        id: Math.random().toString(),
        type: 'limpieza',
        room: roomNumber,
        description: 'Habitación limpia y lista para check-in (Tablero Staff).',
        status: 'resuelta',
        reported_by: operatorName,
        direction: 'staff_to_admin',
        created_at: new Date().toISOString()
      };
      setTasks(prev => [tempTask, ...prev]);

      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'limpieza',
          room: roomNumber,
          description: `Habitación limpia y lista para check-in · Reportado por ${operatorName}`,
          reported_by: operatorName,
          direction: 'staff_to_admin',
          status: 'resuelta'
        }),
      });
    }

    // Guardar en la tabla room_status de Supabase
    const res = await fetch('/api/room-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_number: roomNumber,
        status: newStatus,
        updated_by: operatorName
      }),
    });
    
    const json = await res.json();
    if (json.success) {
      setSuccessMsg(`Habitación ${roomNumber} marcada como ${newStatus}`);
      setTimeout(() => setSuccessMsg(''), 3000);
    }

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
            module: 'limpieza',
            action: 'change_room_status',
            room: roomNumber,
            details: `Cambió el estado de Habitación ${roomNumber} a '${newStatus}'`
          })
        });
      } catch (e) {
        console.error('Error registrando log de cambio de estado de cuarto:', e);
      }
    }
    
    setShowStatusModal(false);
    fetchData();
  };

  const isRoomClean = (roomName: string) => {
    // Extraer número de habitación para comparar
    const m = roomName.match(/(\d{3})/);
    const roomNum = m ? m[1] : roomName;
    const dbStatus = roomStatuses.find(rs => rs.room_number === roomNum);
    if (dbStatus) {
      return dbStatus.status === 'limpia' || dbStatus.status === 'disponible';
    }
    return tasks.some(t => t.room.includes(roomNum) && t.type === 'limpieza' && t.status === 'resuelta' && isDateToday(t.created_at));
  };

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const previews: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const b64 = await compressImage(files[i]);
      previews.push(b64);
    }
    setImagePreviews(prev => [...prev, ...previews]);
    if (previews.length > 0) {
      setImagePreview(previews[0]);
    }
  };

  const submit = async () => {
    if (!form.description.trim()) return;
    setSubmitting(true);

    const isEditing = !!editingTask;
    const emp = getActiveEmployee(currentDept);
    const operatorName = emp ? `${emp.full_name} (${emp.employee_num})` : staffName;
    const finalImagePayload = imagePreviews.length > 0 ? JSON.stringify(imagePreviews) : imagePreview;

    if (editingTask) {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingTask.id,
          description: form.description,
          room: form.room,
          type: form.type
        })
      });

      if (emp) {
        try {
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_num: emp.employee_num,
              employee_name: emp.full_name,
              department: emp.department,
              module: emp.department,
              action: 'edit_maintenance',
              room: form.room,
              details: `Editó reporte de incidencia en ${['General', 'Cocina', 'Recepción', 'Alberca'].includes(form.room) ? form.room : `Habitación ${form.room}`}. Nueva descripción: ${form.description}`
            })
          });
        } catch (e) {
          console.error('Error registrando log de edicion mtto:', e);
        }
      }
    } else {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, reported_by: operatorName, direction: 'staff_to_admin', image_base64: finalImagePayload }),
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
              module: emp.department,
              action: 'report_maintenance',
              room: form.room,
              details: `Reportó daño técnico/incidencia en ${['General', 'Cocina', 'Recepción', 'Alberca'].includes(form.room) ? form.room : `Habitación ${form.room}`}: ${form.description}`
            })
          });
        } catch (e) {
          console.error('Error registrando log de reporte mtto:', e);
        }
      }
    }

    const reportedForm = { ...form };
    const reportedOperator = operatorName;

    setForm({ type: isMantenimiento ? 'mantenimiento' : 'limpieza', room: 'General', description: '' });
    setImagePreview(null);
    setImagePreviews([]);
    setEditingTask(null);
    setShowForm(false);
    fetchData();
    setSubmitting(false);

    // Si es reporte NUEVO de MANTENIMIENTO → copiar al clipboard y abrir grupo WhatsApp MTTO
    if (!isEditing && reportedForm.type === 'mantenimiento') {
      const dateStr = format(new Date(), "EEEE, d 'de' MMMM · HH:mm", { locale: es });
      const isRoom = !['General', 'Cocina', 'Recepción', 'Alberca'].includes(reportedForm.room);
      const ubicacion = isRoom ? `Habitación ${reportedForm.room}` : reportedForm.room;

      const waText =
        `🔧 *REPORTE DE MANTENIMIENTO*\n` +
        `🏨 *Jaroje Condominios*\n` +
        `📅 *${dateStr.toUpperCase()}*\n\n` +
        `📍 *Ubicación:* ${ubicacion}\n` +
        `📝 *Descripción:* ${reportedForm.description}\n` +
        `👤 *Reportado por:* ${reportedOperator}\n\n` +
        `_Generado automáticamente desde Jaroje OS_`;

      navigator.clipboard.writeText(waText).then(() => {
        setSuccessMsg('🔧 ¡Reporte copiado! Abriendo grupo de Mantenimiento...');
        setTimeout(() => setSuccessMsg(''), 5000);
      }).catch(() => {
        setSuccessMsg('¡Reporte enviado con éxito!');
        setTimeout(() => setSuccessMsg(''), 3000);
      });

      // Abrir grupo de WhatsApp de Mantenimiento
      window.open('https://chat.whatsapp.com/0ZEzlGKFLdzEvqOOiAFhmq', '_blank');
    } else if (isEditing) {
      setSuccessMsg('✅ ¡Reporte actualizado con éxito!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } else {
      setSuccessMsg('¡Reporte enviado con éxito!');
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  };

  const openMaintenanceReport = () => {
    setForm({ type: 'mantenimiento', room: 'General', description: '' });
    setImagePreview(null);
    setImagePreviews([]);
    setShowForm(true);
  };

  const logEmployeeAction = async (action: string, room: string, details: string) => {
    try {
      const emp = getActiveEmployee('mantenimiento');
      const payload = {
        employee_num: emp?.employee_num || '000',
        employee_name: emp?.full_name || 'Admin',
        department: emp?.department || 'mantenimiento',
        module: 'mantenimiento',
        action,
        room: room || 'General',
        details
      };
      
      await fetch('/api/employee-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error("Error logging maintenance audit event:", e);
    }
  };

  const fetchSchedules = async () => {
    setLoadingSchedules(true);
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'maintenance_schedules')
        .maybeSingle();
      
      if (data && data.value) {
        const list = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        setSchedules(list || []);
        await checkAndTriggerSchedules(list || []);
      } else {
        setSchedules([]);
      }
    } catch (e) {
      console.error("Error al cargar programaciones:", e);
    } finally {
      setLoadingSchedules(false);
    }
  };

  const checkAndTriggerSchedules = async (schedulesList: any[]) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    let updated = false;
    const newSchedules = [...schedulesList];
    
    for (let i = 0; i < newSchedules.length; i++) {
      const item = newSchedules[i];
      const nextDate = new Date(item.next_trigger);
      nextDate.setHours(0,0,0,0);
      
      if (nextDate <= today) {
        console.log(`[Mantenimiento Programado] Executing scheduled recurrence task for Hab ${item.room}: ${item.description}`);
        
        const payload = {
          room: item.room,
          description: `[PROGRAMADO] ${item.description}`,
          type: 'mantenimiento',
          status: 'nuevo',
          reported_by: 'Sistema',
          direction: 'admin_to_staff'
        };
        
        try {
          const { data: insertData, error } = await supabase.from('tasks').insert([payload]).select();
          if (error) throw error;
          
          const insertedId = insertData?.[0]?.id || '';
          
          await logEmployeeAction(
            'report_maintenance_scheduled', 
            item.room, 
            `Tarea programada auto-creada en ${item.room}: ${item.description}`
          );
          
          const nowIso = new Date().toISOString();
          item.last_triggered = nowIso;
          
          const nextTriggerDate = new Date();
          const periodParts = item.period.split(' ');
          const val = parseInt(periodParts[0]) || 1;
          const unit = periodParts[1] || 'month';
          
          if (unit.startsWith('week')) {
            nextTriggerDate.setDate(nextTriggerDate.getDate() + (val * 7));
          } else if (unit.startsWith('month')) {
            nextTriggerDate.setMonth(nextTriggerDate.getMonth() + val);
          } else if (unit.startsWith('year')) {
            nextTriggerDate.setFullYear(nextTriggerDate.getFullYear() + val);
          } else if (unit.startsWith('day')) {
            nextTriggerDate.setDate(nextTriggerDate.getDate() + val);
          } else {
            nextTriggerDate.setMonth(nextTriggerDate.getMonth() + 1);
          }
          
          item.next_trigger = nextTriggerDate.toISOString();
          updated = true;
          
        } catch (err) {
          console.error("Error al disparar tarea programada:", err);
        }
      }
    }
    
    if (updated) {
      try {
        await supabase
          .from('settings')
          .upsert({ key: 'maintenance_schedules', value: JSON.stringify(newSchedules) }, { onConflict: 'key' });
        setSchedules(newSchedules);
      } catch (err) {
        console.error("Error al guardar programaciones actualizadas:", err);
      }
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedDesc.trim()) {
      alert("Por favor ingresa la descripción.");
      return;
    }
    
    const newSched = {
      id: Date.now().toString(),
      room: schedRoom,
      description: schedDesc,
      period: schedPeriod,
      next_trigger: new Date().toISOString(),
      last_triggered: null
    };
    
    const list = [...schedules, newSched];
    setSchedules(list);
    
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'maintenance_schedules', value: JSON.stringify(list) }, { onConflict: 'key' });
      
      if (error) throw error;
      
      alert("📅 Mantenimiento programado con éxito.");
      setSchedDesc('');
      fetchSchedules();
    } catch (err) {
      console.error(err);
      alert("Error al guardar la programación.");
    }
  };

  const forceExecuteSchedule = async (scheduleItem: any) => {
    if (!confirm(`¿Seguro que deseas forzar la ejecución de la tarea para ${scheduleItem.room} ahora mismo?`)) return;
    
    const payload = {
      room: scheduleItem.room,
      description: `[FORZADO MANUAL] ${scheduleItem.description}`,
      type: 'mantenimiento',
      status: 'nuevo',
      reported_by: 'Mantenimiento',
      direction: 'admin_to_staff'
    };
    
    try {
      const { data: insertData, error } = await supabase.from('tasks').insert([payload]).select();
      if (error) throw error;
      
      const insertedId = insertData?.[0]?.id || '';
      
      await logEmployeeAction(
        'report_maintenance_scheduled_forced', 
        scheduleItem.room, 
        `Tarea programada forzada manualmente en ${scheduleItem.room}: ${scheduleItem.description}`
      );
      
      const nowIso = new Date().toISOString();
      scheduleItem.last_triggered = nowIso;
      
      const nextTriggerDate = new Date();
      const periodParts = scheduleItem.period.split(' ');
      const val = parseInt(periodParts[0]) || 1;
      const unit = periodParts[1] || 'month';
      
      if (unit.startsWith('week')) {
        nextTriggerDate.setDate(nextTriggerDate.getDate() + (val * 7));
      } else if (unit.startsWith('month')) {
        nextTriggerDate.setMonth(nextTriggerDate.getMonth() + val);
      } else if (unit.startsWith('year')) {
        nextTriggerDate.setFullYear(nextTriggerDate.getFullYear() + val);
      } else if (unit.startsWith('day')) {
        nextTriggerDate.setDate(nextTriggerDate.getDate() + val);
      } else {
        nextTriggerDate.setMonth(nextTriggerDate.getMonth() + 1);
      }
      
      scheduleItem.next_trigger = nextTriggerDate.toISOString();
      
      const list = schedules.map(s => s.id === scheduleItem.id ? scheduleItem : s);
      
      await supabase
        .from('settings')
        .upsert({ key: 'maintenance_schedules', value: JSON.stringify(list) }, { onConflict: 'key' });
      
      alert("✅ Tarea creada con éxito y programación actualizada.");
      fetchSchedules();
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Error al forzar la ejecución de la programación.");
    }
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar esta programación recurrente?")) return;
    
    const list = schedules.filter(s => s.id !== id);
    setSchedules(list);
    
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'maintenance_schedules', value: JSON.stringify(list) }, { onConflict: 'key' });
      
      if (error) throw error;
      
      alert("🗑️ Programación eliminada.");
      fetchSchedules();
    } catch (err) {
      console.error(err);
      alert("Error al eliminar la programación.");
    }
  };

  const handleCopyReport = () => {
    const allRooms = getScheduledCleanings();
    const bpAssignment = assignments['Baños Públicos'] || { employeeNum: '', notes: '' };
    const hasBP = bpAssignment.employeeNum !== '';
    const hasGenObs = generalObservations.trim() !== '';

    if (allRooms.length === 0 && !hasBP && !hasGenObs) {
      alert("No hay limpiezas programadas ni observaciones generales para reportar hoy.");
      return;
    }

    const dateStr = format(new Date(), "EEEE, d 'de' MMMM · HH:mm 'hrs'", { locale: es });
    let text = `📋 *REPORTE DIARIO DE LIMPIEZA*\n🏨 *Jaroje Condominios*\n📅 *${dateStr.toUpperCase()}*\n\n`;

    if (allRooms.length > 0) {
      text += `*Habitaciones por Limpieza:*\n`;
      allRooms.forEach((task, idx) => {
        const isFinished = (task.dbStatus === 'limpia' || task.dbStatus === 'disponible') && task.isUpdatedToday;
        const typeLabel = task.type === 'checkout' ? 'Check Out 🔴' : 'Servicio 🟡';
        const statusLabel = isFinished 
          ? 'Limpia ✅' 
          : (task.type === 'checkout' && !task.keysReturned)
            ? 'Huésped en Hab. ⏳'
            : task.operStatus === 'en_limpieza' 
              ? 'En limpieza ⚡' 
              : 'Pendiente ❌';
        
        const assignment = assignments[task.room];
        const empNum = assignment?.employeeNum || '';
        const empName = getOfficialEmployees().find(e => e.employee_num === empNum)?.full_name || 'Sin asignar ❌';
        const notes = assignment?.notes?.trim() || 'Sin observaciones';

        text += `${idx + 1}. *Hab. ${task.room}*\n`;
        text += `   • *Tipo:* ${typeLabel}\n`;
        text += `   • *Estado:* ${statusLabel}\n`;
        text += `   • *Asignado:* ${empName}\n`;
        text += `   • *Observaciones:* ${notes}\n\n`;
      });
    }

    // Agregar Baños Públicos
    const bpEmpName = getOfficialEmployees().find(e => e.employee_num === bpAssignment.employeeNum)?.full_name || 'Sin asignar ❌';
    const bpNotes = bpAssignment.notes?.trim() || 'Sin observaciones';

    text += `*Áreas Públicas:*\n`;
    text += `• *Baños Públicos:*\n`;
    text += `   • *Asignado:* ${bpEmpName}\n`;
    text += `   • *Observaciones:* ${bpNotes}\n\n`;

    // Agregar Observaciones Generales
    if (generalObservations.trim()) {
      text += `*Observaciones Generales del Reporte:*\n`;
      text += `${generalObservations.trim()}\n\n`;
    }

    text += `_Generado automáticamente desde Jaroje OS_`;

    navigator.clipboard.writeText(text).then(() => {
      setSuccessMsg('📋 ¡Reporte copiado! Abriendo WhatsApp...');
      setTimeout(() => setSuccessMsg(''), 4000);
    }).catch(err => {
      console.error("Error al copiar al portapapeles:", err);
      alert("No se pudo copiar el reporte automáticamente. Por favor copia el texto manualmente.");
    });

    // Abrir de inmediato el enlace de invitación al grupo de WhatsApp
    window.open('https://chat.whatsapp.com/GB3Mz5s1unl6wZhp5kzv4X', '_blank');
  };

  // Obtener estado de una habitación
  const getRoomState = (roomNum: string) => {
    const dbStatus = roomStatuses.find(rs => rs.room_number === roomNum);
    return dbStatus || { room_number: roomNum, status: 'disponible' as const, updated_by: 'Sistema', updated_at: new Date().toISOString() };
  };

  return (
    <div className="min-h-screen bg-zinc-50 pb-24 text-zinc-800">
      
      {/* Header Fijo Premium */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-zinc-200/50 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h2 className="text-[20px] font-black text-zinc-900 tracking-tight leading-none">
              {isMantenimiento ? 'Mtto. Técnico' : 'LIMPIEZA'}
            </h2>
            <span className="text-[11px] font-black tracking-widest uppercase bg-zinc-900 text-white px-2 py-0.5 rounded-md scale-90">
              {role === 'staff_limpieza' ? 'Limpieza' : role === 'staff_mantenimiento' ? 'Mtto' : role}
            </span>
            
            {/* Badge de Empleado Firmado */}
            {activeEmployee ? (
              <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-full py-0.5 px-2 flex items-center gap-1 select-none animate-in fade-in duration-200">
                👤 {activeEmployee.full_name.split(' ')[0]} ({activeEmployee.employee_num})
                <button
                  onClick={() => {
                    clearActiveEmployee(currentDept);
                    setActiveEmployeeState(null);
                    setShowEmployeeModal(true);
                  }}
                  className="text-emerald-500 hover:text-emerald-700 font-extrabold text-[9px] ml-1 pl-1 border-l border-emerald-200 cursor-pointer"
                  title="Cambiar empleado"
                >
                  Cambiar
                </button>
              </span>
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
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-[12px] font-semibold text-zinc-500 capitalize">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })} · {activeEmployee ? activeEmployee.full_name : staffName}
            </p>
          </div>
        </div>

        {/* BOTÓN UNIFICADO DE REPORTE DE MANTENIMIENTO (LLAVE INGLESA) */}
        <button
          onClick={openMaintenanceReport}
          className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-extrabold tracking-wider uppercase py-2.5 px-4 rounded-xl shadow-md shadow-rose-200 active:scale-95 transition-all cursor-pointer"
        >
          <Wrench size={13} strokeWidth={2.5} />
          <span>Reportar Mtto.</span>
        </button>
      </header>

      <div className="max-w-md mx-auto px-4 mt-4 space-y-4">
        
        {/* KPI Cards */}
        {!isMantenimiento && (
          <div className="grid grid-cols-3 gap-2.5">
            <button 
              onClick={() => setKpiModalType('encasa')}
              className="bg-white border border-zinc-200/80 rounded-2xl p-3 text-center shadow-sm cursor-pointer hover:bg-zinc-50/50 hover:border-zinc-300 active:scale-95 transition-all outline-none"
            >
              <p className="text-[20px] font-bold text-zinc-900">{ocupadas.length}</p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">En casa</p>
            </button>
            <button 
              onClick={() => setKpiModalType('llegan')}
              className="bg-white border border-zinc-200/80 rounded-2xl p-3 text-center shadow-sm cursor-pointer hover:bg-zinc-50/50 hover:border-zinc-300 active:scale-95 transition-all outline-none"
            >
              <p className="text-[20px] font-bold text-emerald-600">{llegadas.length}</p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Llegan hoy</p>
            </button>
            <button 
              onClick={() => setKpiModalType('salen')}
              className="bg-white border border-zinc-200/80 rounded-2xl p-3 text-center shadow-sm cursor-pointer hover:bg-zinc-50/50 hover:border-zinc-300 active:scale-95 transition-all outline-none"
            >
              <p className="text-[20px] font-bold text-amber-500">
                {ROOMS.filter(r => {
                  const dbStatus = getRoomDbStatus(r, roomStatuses);
                  const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
                  const s = getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);
                  if (s === 'sucio_checkout' || s === 'salida_hoy' || dbStatus === 'sucio_checkout') return true;
                  return reservas.some(res => {
                    const rRoom = String(res.room || '').replace(/[\s()]/g, '');
                    return rRoom.includes(r) && res.check_out === todayStr;
                  });
                }).length}
              </p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Salen hoy</p>
            </button>
          </div>
        )}

        {/* VISTA DE LIMPIEZA / RECEPCIÓN */}
        {!isMantenimiento && (
          <div className="space-y-4">
            
            {/* ── ESTADO FÍSICO DE HABITACIONES (GRID INTERACTIVO PREMIUM) ── */}
            <div className="bg-white border border-zinc-200 rounded-[28px] p-5 shadow-sm space-y-4">
              <div>
                <h3 className="text-[15px] font-black text-zinc-900">Estado de Habitaciones</h3>
                <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">Sincronizado al instante mediante Supabase Realtime</p>
              </div>

              {/* Conteo por estados */}
              <div className="grid grid-cols-4 gap-1.5">
                <div className="bg-emerald-50/50 border-2 border-emerald-500 rounded-xl p-2 text-center shadow-sm">
                  <span className="text-[15px] font-black text-emerald-700">
                    {ROOMS.filter(r => {
                      if (['500','501','502','503','504','505','506','507'].includes(r)) return false; // Excluir 500-507 del indicador de disponibles
                      const dbStatus = getRoomDbStatus(r, roomStatuses);
                      const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
                      return getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at) === 'disponible';
                    }).length}
                  </span>
                  <p className="text-[7.2px] font-black text-emerald-600 uppercase tracking-wider mt-0.5">Disponibles</p>
                </div>
                <div className="bg-amber-50/50 border-2 border-amber-500 rounded-xl p-2 text-center shadow-sm">
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
                <div className="bg-rose-50/50 border-2 border-rose-500 rounded-xl p-2 text-center shadow-sm">
                  <span className="text-[15px] font-black text-rose-700">
                    {ROOMS.filter(r => {
                      const dbStatus = getRoomDbStatus(r, roomStatuses);
                      const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
                      const s = getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);
                      if (s === 'sucio_checkout' || s === 'salida_hoy' || dbStatus === 'sucio_checkout') return true;
                      return reservas.some(res => {
                        const rRoom = String(res.room || '').replace(/[\s()]/g, '');
                        return rRoom.includes(r) && res.check_out === todayStr;
                      });
                    }).length}
                  </span>
                  <p className="text-[7.2px] font-black text-rose-600 uppercase tracking-wider mt-0.5">Check Out</p>
                </div>
                <div className="bg-blue-50/50 border-2 border-blue-500 rounded-xl p-2 text-center shadow-sm">
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
                        const operStatus = getRoomOperationalStatus(roomNum, dbStatus, reservas, todayStr, (dbStatusObj as any)?.updated_at);

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
                          colorClasses = 'bg-rose-50 text-rose-700 border-rose-200 shadow-rose-50/20';
                          dotClass = 'bg-rose-400';
                        } else if (operStatus === 'en_limpieza' || operStatus === 'limpieza_programada') {
                          colorClasses = 'bg-amber-400 text-white border-amber-500 shadow-amber-100/30';
                          dotClass = 'bg-amber-250';
                        }

                        return (
                          <div
                            key={roomNum}
                            onClick={() => {
                              if (canModifyStatus) {
                                setSelectedRoom(roomNum);
                                setShowStatusModal(true);
                              }
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

            {/* Llegadas de Hoy (Check-in) */}
            {llegadas.length > 0 && (
              <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-2">
                  <ArrowDownLeft size={16} className="text-emerald-600" strokeWidth={2.5} />
                  <span className="text-[13px] font-extrabold text-zinc-800">Próximos Check-ins ({llegadas.length})</span>
                </div>
                <div className="divide-y divide-zinc-100">
                  {llegadas.map((r) => (
                    <div key={r.id} className="p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                          <BedDouble size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold text-zinc-900 leading-tight">Hab. {r.room || 'Sin asignar'}</p>
                          <p className="text-[12px] font-semibold text-zinc-400 truncate mt-0.5">{r.guest_name || 'Huésped'}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-md bg-emerald-100/70 text-emerald-700">Hoy</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── NUEVA SECCIÓN: REPORTE DIARIO DE LIMPIEZA ── */}
            <div className="bg-white border border-zinc-200 rounded-[28px] p-5 shadow-sm space-y-4 animate-in fade-in duration-200">
              <div>
                <h3 className="text-[15px] font-black text-zinc-900 tracking-tight">Reporte Diario de Limpieza</h3>
                <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">Asigna el personal de aseo y copia el reporte consolidado.</p>
              </div>

              {(() => {
                const allRooms = getScheduledCleanings();
                const bpAssignment = assignments['Baños Públicos'] || { employeeNum: '', notes: '' };

                return (
                  <div className="space-y-4">
                    <div className="overflow-x-auto -mx-5 px-5">
                      <table className="w-full min-w-[320px] text-left border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-100">
                            <th className="text-[10px] font-black text-zinc-400 uppercase tracking-wider pb-2 pr-2">HABITACIÓN</th>
                            <th className="text-[10px] font-black text-zinc-400 uppercase tracking-wider pb-2 pr-2">ESTADO</th>
                            <th className="text-[10px] font-black text-zinc-400 uppercase tracking-wider pb-2 pr-2">ASIGNADO</th>
                            <th className="text-[10px] font-black text-zinc-400 uppercase tracking-wider pb-2">OBSERVACIONES</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {allRooms.map(task => {
                            const assignment = assignments[task.room] || { employeeNum: '', notes: '' };
                            const isCheckout = task.type === 'checkout';
                            const isFinished = (task.dbStatus === 'limpia' || task.dbStatus === 'disponible') && task.isUpdatedToday;

                            return (
                              <tr key={task.room} className="align-middle">
                                {/* HABITACIÓN */}
                                <td className="py-2.5 pr-2">
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-zinc-900 text-white text-[12px] font-black select-none">
                                    {task.room}
                                  </span>
                                </td>

                                {/* ESTADO */}
                                <td className="py-2.5 pr-2">
                                  <div className="flex flex-col gap-1 items-start">
                                    <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-md border select-none ${
                                      isCheckout 
                                        ? 'bg-rose-50 text-rose-700 border-rose-100' 
                                        : 'bg-amber-50 text-amber-700 border-amber-100'
                                    }`}>
                                      {isCheckout ? 'Check Out' : 'Servicio'}
                                    </span>
                                    {isCheckout && !task.keysReturned && (
                                      <span className="inline-flex items-center gap-0.5 text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-750 border border-amber-200/60 select-none">
                                        En Habitación 👤
                                      </span>
                                    )}
                                    {isFinished ? (
                                      <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-150 select-none">
                                        Limpia ✓
                                      </span>
                                    ) : task.operStatus === 'en_limpieza' ? (
                                      <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-150 select-none animate-pulse">
                                        Aseo ⚡
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-200 select-none">
                                        Pendiente
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* ASIGNADO */}
                                <td className="py-2.5 pr-2">
                                  <select
                                    value={assignment.employeeNum}
                                    onChange={e => updateAssignment(task.room, e.target.value, assignment.notes)}
                                    className="w-full max-w-[110px] bg-zinc-50 border border-zinc-200 rounded-xl px-1.5 py-1.5 outline-none text-[10.5px] font-bold text-zinc-800 focus:ring-1 focus:ring-zinc-900/10 cursor-pointer"
                                  >
                                    <option value="">Seleccionar...</option>
                                    {employeesList.map(emp => (
                                      <option key={emp.employee_num} value={emp.employee_num}>
                                        {emp.full_name.split(' ')[0]} ({emp.employee_num})
                                      </option>
                                    ))}
                                  </select>
                                </td>

                                {/* OBSERVACIONES */}
                                <td className="py-2.5">
                                  <input
                                    type="text"
                                    value={assignment.notes}
                                    onChange={e => updateAssignment(task.room, assignment.employeeNum, e.target.value)}
                                    placeholder="Obs..."
                                    className="w-full min-w-[70px] bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 outline-none text-[10.5px] font-semibold text-zinc-900 focus:ring-1 focus:ring-zinc-900/10"
                                  />
                                </td>
                              </tr>
                            );
                          })}

                          {/* BAÑOS PÚBLICOS */}
                          <tr className="align-middle border-t border-zinc-100 bg-zinc-50/30">
                            {/* HABITACIÓN / ÁREA */}
                            <td className="py-3 pr-2">
                              <span className="inline-flex items-center justify-center px-2 py-1 rounded-lg bg-zinc-800 text-white text-[10px] font-black uppercase select-none">
                                BP
                              </span>
                            </td>

                            {/* ESTADO */}
                            <td className="py-3 pr-2">
                              <div className="flex flex-col gap-1 items-start">
                                <span className="inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-md border border-zinc-200 bg-zinc-100 text-zinc-600 select-none">
                                  Baños Públicos
                                </span>
                              </div>
                            </td>

                            {/* ASIGNADO */}
                            <td className="py-3 pr-2">
                              <select
                                value={bpAssignment.employeeNum}
                                onChange={e => updateAssignment('Baños Públicos', e.target.value, bpAssignment.notes)}
                                className="w-full max-w-[110px] bg-zinc-50 border border-zinc-200 rounded-xl px-1.5 py-1.5 outline-none text-[10.5px] font-bold text-zinc-800 focus:ring-1 focus:ring-zinc-900/10 cursor-pointer"
                              >
                                <option value="">Seleccionar...</option>
                                {employeesList.map(emp => (
                                  <option key={emp.employee_num} value={emp.employee_num}>
                                    {emp.full_name.split(' ')[0]} ({emp.employee_num})
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* OBSERVACIONES */}
                            <td className="py-3">
                              <input
                                type="text"
                                value={bpAssignment.notes}
                                onChange={e => updateAssignment('Baños Públicos', bpAssignment.employeeNum, e.target.value)}
                                placeholder="Obs..."
                                className="w-full min-w-[70px] bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 outline-none text-[10.5px] font-semibold text-zinc-900 focus:ring-1 focus:ring-zinc-900/10"
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Mensaje si no hay habitaciones programadas */}
                    {allRooms.length === 0 && (
                      <div className="p-4 text-center bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl flex items-center justify-center gap-1.5">
                        <span className="text-[11.5px] font-bold text-zinc-400">No hay habitaciones programadas para hoy.</span>
                      </div>
                    )}

                    {/* OBSERVACIONES GENERALES */}
                    <div className="space-y-1.5 pt-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Observaciones Generales</label>
                      <textarea
                        value={generalObservations}
                        onChange={e => updateGeneralObservations(e.target.value)}
                        placeholder="Escribe observaciones adicionales para el reporte del día aquí (opcional)..."
                        rows={2}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-3 py-2.5 outline-none text-[11.5px] font-semibold text-zinc-900 focus:ring-1 focus:ring-zinc-900/10 placeholder-zinc-400 resize-none"
                      />
                    </div>

                    <button
                      onClick={handleCopyReport}
                      className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-extrabold text-[12px] tracking-wide uppercase py-3.5 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 shadow-md shadow-zinc-100"
                    >
                      <Send size={13} strokeWidth={2.5} />
                      <span>MANDAR REPORTE</span>
                    </button>
                  </div>
                );
              })()}
            </div>

          </div>
        )}

        {/* TABLERO DE INCIDENCIAS (Rediseño Premium estilo /mantenimiento) */}
        {(isMantenimiento || role === 'admin') && (
          <div className="space-y-4">
            
            {/* Título de Sección Móvil */}
            <div>
              <h3 className="text-[15px] font-black text-zinc-900">Control de Incidencias</h3>
              <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">Gestión de Tareas y Reportes</p>
            </div>

            {/* Selector de Vista (Incidencias vs Programado) */}
            <div className="flex bg-zinc-100/80 p-1 rounded-2xl w-fit border border-zinc-200/50 shadow-inner mb-2 select-none">
              <button
                onClick={() => setViewMode('tasks')}
                className={`px-4 py-2 text-[11px] font-black rounded-xl transition-all cursor-pointer ${
                  viewMode === 'tasks' ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/20' : 'text-zinc-500 hover:text-zinc-800 bg-transparent'
                }`}
              >
                🔧 Incidencias
              </button>
              <button
                onClick={() => setViewMode('schedules')}
                className={`px-4 py-2 text-[11px] font-black rounded-xl transition-all cursor-pointer ${
                  viewMode === 'schedules' ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/20' : 'text-zinc-500 hover:text-zinc-800 bg-transparent'
                }`}
              >
                📅 Programado
              </button>
            </div>

            {viewMode === 'tasks' ? (
              <>
                {/* KPIs Grid 2x2 para Móviles */}
                <div className="grid grid-cols-2 gap-2.5 select-none">
                  {/* NUEVOS */}
                  <div 
                    onClick={() => setTaskTab('nuevos')}
                    className={`border rounded-2xl p-3.5 flex flex-col justify-between cursor-pointer active:scale-95 transition-all ${
                      taskTab === 'nuevos' 
                        ? 'bg-purple-50/10 border-purple-600 ring-2 ring-purple-500/10 shadow-md' 
                        : 'bg-white border-zinc-200/80 shadow-sm hover:bg-zinc-50/50'
                    }`}
                  >
                    <span className="text-[20px] font-black text-purple-650 leading-none">
                      {nuevos.length}
                    </span>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mt-1">Nuevos</p>
                  </div>

                  {/* PENDIENTES */}
                  <div 
                    onClick={() => setTaskTab('pendientes')}
                    className={`border rounded-2xl p-3.5 flex flex-col justify-between cursor-pointer active:scale-95 transition-all ${
                      taskTab === 'pendientes' 
                        ? 'bg-amber-50/10 border-amber-500 ring-2 ring-amber-500/10 shadow-md' 
                        : 'bg-white border-zinc-200/80 shadow-sm hover:bg-zinc-50/50'
                    }`}
                  >
                    <span className="text-[20px] font-black text-amber-500 leading-none">
                      {pendientes.length}
                    </span>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mt-1">Pendientes</p>
                  </div>

                  {/* EN PROCESO */}
                  <div 
                    onClick={() => setTaskTab('en_proceso')}
                    className={`border rounded-2xl p-3.5 flex flex-col justify-between cursor-pointer active:scale-95 transition-all ${
                      taskTab === 'en_proceso' 
                        ? 'bg-blue-50/10 border-blue-500 ring-2 ring-blue-500/10 shadow-md' 
                        : 'bg-white border-zinc-200/80 shadow-sm hover:bg-zinc-50/50'
                    }`}
                  >
                    <span className="text-[20px] font-black text-blue-500 leading-none">
                      {enProceso.length}
                    </span>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mt-1">En Proceso</p>
                  </div>

                  {/* RESUELTAS */}
                  <div 
                    onClick={() => setTaskTab('resueltos')}
                    className={`border rounded-2xl p-3.5 flex flex-col justify-between cursor-pointer active:scale-95 transition-all ${
                      taskTab === 'resueltos' 
                        ? 'bg-emerald-50/10 border-emerald-600 ring-2 ring-emerald-500/10 shadow-md' 
                        : 'bg-white border-zinc-200/80 shadow-sm hover:bg-zinc-50/50'
                    }`}
                  >
                    <span className="text-[20px] font-black text-emerald-650 leading-none">
                      {resueltos.filter(t => {
                        if (!t.resolved_at) return false;
                        const todayStr = new Date().toISOString().split('T')[0];
                        return t.resolved_at.split('T')[0] === todayStr;
                      }).length}
                    </span>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mt-1">Resueltos Hoy</p>
                  </div>
                </div>

                {/* Barra de Búsqueda Interactiva */}
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Buscar por descripción o habitación..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white border border-zinc-200 rounded-2xl pl-10 pr-4 py-2.5 outline-none text-[13px] font-medium text-zinc-900 placeholder-zinc-400 focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-300 transition-all shadow-sm"
                    />
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                    </div>
                    {searchQuery && (
                      <button 
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-400 hover:text-zinc-600 active:scale-95 transition-transform"
                      >
                        <X size={12} strokeWidth={3} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Listado de Incidencias */}
                <div className="bg-white border border-zinc-200/80 rounded-[28px] shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col divide-y divide-zinc-100 overflow-hidden">
                  {(() => {
                    const list = taskTab === 'nuevos' ? filteredNuevos
                               : taskTab === 'pendientes' ? filteredPendientes
                               : taskTab === 'en_proceso' ? filteredEnProceso
                               : filteredResueltos;

                    if (list.length === 0) {
                      return (
                        <div className="p-8 text-center text-zinc-400 text-[13px] font-semibold flex flex-col items-center justify-center gap-2">
                          <CheckCircle2 size={24} className="text-zinc-300" />
                          <span>No hay tareas en este estado.</span>
                        </div>
                      );
                    }

                    return list.map(t => {
                      const cfg = TYPE_CFG[t.type] || TYPE_CFG['otro'];
                      const isRoom = !['General', 'Cocina', 'Recepción', 'Alberca'].includes(t.room);
                      const displayRoom = isRoom ? `Habitación ${t.room}` : t.room;
                      const dateStr = format(new Date(t.created_at), "d MMM, HH:mm", { locale: es });
                      const resolvedStr = t.resolved_at ? format(new Date(t.resolved_at), "d MMM, HH:mm", { locale: es }) : '';

                      return (
                        <div 
                          key={t.id} 
                          className="p-4 flex flex-col gap-2.5 active:bg-zinc-50/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div 
                              onClick={() => openDetailsModal(t)}
                              className="flex-1 cursor-pointer"
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${cfg.bg} ${cfg.text} border border-zinc-100`}>
                                  <cfg.icon size={11} strokeWidth={2.5} />
                                  <span>{cfg.label}</span>
                                </span>
                                <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest">
                                  {dateStr}
                                </span>
                              </div>
                              
                              <p className="text-[12.5px] font-bold text-zinc-850 mt-2 leading-snug whitespace-pre-line text-left">
                                {t.description}
                              </p>
                            </div>

                            <div className="flex flex-col items-end gap-1.5 shrink-0 select-none">
                              <span className="text-[11px] font-black text-zinc-650 bg-zinc-100 border border-zinc-150 px-2 py-0.5 rounded-lg">
                                {displayRoom}
                              </span>
                              
                              {/* Botones de acción según estado */}
                              {taskTab === 'nuevos' && (
                                <button
                                  onClick={() => runWithSignature('resolve_task', (status) => updateTaskStatus(t.id, status), 'pendiente')}
                                  className="px-2.5 py-1.5 bg-purple-600 text-white rounded-xl text-[10.5px] font-extrabold shadow-sm active:scale-[0.96] hover:bg-purple-700 transition-all text-center"
                                >
                                  Aceptar ⚡
                                </button>
                              )}
                              {taskTab === 'pendientes' && (
                                <button
                                  onClick={() => runWithSignature('resolve_task', (status) => updateTaskStatus(t.id, status), 'en_proceso')}
                                  className="px-2.5 py-1.5 bg-amber-500 text-white rounded-xl text-[10.5px] font-extrabold shadow-sm active:scale-[0.96] hover:bg-amber-600 transition-all text-center"
                                >
                                  Iniciar ⚡
                                </button>
                              )}
                              {taskTab === 'en_proceso' && (
                                <>
                                  <button
                                    onClick={() => runWithSignature('resolve_task', (status) => updateTaskStatus(t.id, status), 'pendiente')}
                                    className="px-2 py-1.5 bg-zinc-100 border border-zinc-200 text-zinc-500 rounded-lg text-[10px] font-extrabold flex items-center transition-all active:scale-[0.96] hover:bg-zinc-250"
                                  >
                                    Regresar ↩
                                  </button>
                                  <button
                                    onClick={() => handleOpenResolveModal(t)}
                                    className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-xl text-[10.5px] font-extrabold shadow-sm active:scale-[0.96] hover:bg-emerald-700 transition-all text-center"
                                  >
                                    Terminar ✅
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {taskTab === 'resueltos' && (
                            <div className="flex items-center gap-1.5 text-[11px] font-black text-emerald-600 pl-1 pt-1.5 border-t border-zinc-100/50">
                              <CheckCheck size={13} />
                              <span>Cerrado: {resolvedStr}</span>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </>
            ) : (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Formulario para agregar programación */}
                <div className="bg-white border border-zinc-200/80 rounded-[28px] p-5 shadow-sm space-y-4">
                  <h4 className="text-[13px] font-black text-zinc-950 uppercase tracking-wider">Nueva Tarea Recurrente</h4>
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Ubicación</label>
                      <select 
                        value={schedRoom} 
                        onChange={e => setSchedRoom(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[14px] font-bold text-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
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

                    <div>
                      <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Frecuencia</label>
                      <select 
                        value={schedPeriod} 
                        onChange={e => setSchedPeriod(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[14px] font-bold text-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                      >
                        <option value="1 week">Cada Semana</option>
                        <option value="2 weeks">Cada 2 Semanas</option>
                        <option value="1 month">Cada Mes</option>
                        <option value="3 months">Cada 3 Meses</option>
                        <option value="6 months">Cada 6 Meses</option>
                        <option value="1 year">Cada Año</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Descripción de la Tarea</label>
                      <textarea 
                        value={schedDesc} 
                        onChange={e => setSchedDesc(e.target.value)}
                        placeholder="Ej. Revisar aire acondicionado y control remoto, cambio de focos..."
                        rows={3}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[13px] font-medium text-zinc-900 focus:ring-2 focus:ring-zinc-900/10 resize-none"
                      />
                    </div>

                    <button
                      onClick={handleSaveSchedule}
                      disabled={!schedDesc.trim() || loadingSchedules}
                      className="w-full bg-zinc-950 hover:bg-zinc-900 text-white font-extrabold py-3.5 px-4 rounded-xl text-[12px] transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98]"
                    >
                      <Plus size={14} />
                      <span>Agregar Tarea Recurrente</span>
                    </button>
                  </div>
                </div>

                {/* Listado de programaciones */}
                <div className="space-y-3">
                  <h4 className="text-[13px] font-black text-zinc-950 uppercase tracking-wider">Tareas Recurrentes Activas</h4>
                  {loadingSchedules ? (
                    <div className="p-8 text-center text-zinc-400 text-[12px] font-semibold">Cargando programaciones...</div>
                  ) : schedules.length === 0 ? (
                    <div className="bg-white border border-zinc-200/85 rounded-3xl p-8 text-center shadow-sm flex flex-col items-center justify-center gap-2">
                      <span className="text-[12px] font-bold text-zinc-400">No hay tareas recurrentes programadas.</span>
                    </div>
                  ) : (
                    schedules.map((item) => {
                      const nextExec = new Date(item.next_trigger);
                      const lastExec = item.last_triggered ? new Date(item.last_triggered) : null;
                      const isOverdue = nextExec <= new Date();
                      
                      const periodLabels: Record<string, string> = {
                        '1 week': 'Cada Semana',
                        '2 weeks': 'Cada 2 Semanas',
                        '1 month': 'Cada Mes',
                        '3 months': 'Cada 3 Meses',
                        '6 months': 'Cada 6 Meses',
                        '1 year': 'Cada Año'
                      };
                      const freqText = periodLabels[item.period] || item.period;

                      return (
                        <div key={item.id} className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm space-y-3 flex flex-col hover:border-zinc-300 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1 text-[9px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                              📍 {item.room}
                            </span>
                            <span className="text-[9.5px] font-bold text-zinc-400">
                              🔄 {freqText}
                            </span>
                          </div>
                          
                          <p className="text-[12px] font-bold text-zinc-800 leading-snug whitespace-pre-line text-left">
                            {item.description}
                          </p>
                          <div className="border-t border-zinc-100/70 pt-2.5 space-y-1 text-[10px] font-medium text-zinc-500">
                            <div className="flex justify-between">
                              <span>Último trigger:</span>
                              <span className="font-bold text-zinc-700">
                                {lastExec ? format(lastExec, "d MMM yyyy", { locale: es }) : 'Nunca ⏳'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Próximo trigger:</span>
                              <span className={`font-bold ${isOverdue ? 'text-rose-600 animate-pulse font-black' : 'text-zinc-700'}`}>
                                {format(nextExec, "d MMM yyyy", { locale: es })} {isOverdue && '⚠️'}
                              </span>
                            </div>
                          </div>

                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => forceExecuteSchedule(item)}
                              className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-250 font-bold text-[11px] py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
                            >
                              <span>⚙️ Forzar Hoy</span>
                            </button>
                            <button
                              onClick={() => deleteSchedule(item.id)}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-250 font-bold text-[11px] px-3 py-2 rounded-lg flex items-center justify-center transition-all active:scale-[0.98] cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── NOTIFICACIONES TOAST ── */}
      {successMsg && (
        <div className="fixed bottom-6 left-4 right-4 z-[9000] animate-in fade-in slide-in-from-bottom-5">
          <div className="bg-zinc-900 text-white text-[13px] font-bold px-5 py-3.5 rounded-2xl text-center shadow-xl flex items-center justify-center gap-2 max-w-md mx-auto border border-zinc-800">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div onClick={() => setShowForm(false)} className="absolute inset-0" />
          <div className="relative bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 max-h-[90vh] overflow-y-auto mx-auto">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                <Wrench size={20} className="text-rose-500 animate-pulse" />
                {editingTask ? 'Editar Reporte de MTTO' : 'Reportar MTTO'}
              </h3>
              <button 
                onClick={() => {
                  setShowForm(false);
                  setEditingTask(null);
                  setForm({ type: isMantenimiento ? 'mantenimiento' : 'limpieza', room: 'General', description: '' });
                }} 
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
                  placeholder="Ej. Fuga de agua en el baño..."
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

              {/* Foto Evidencia (Múltiple) - Solo si no está editando */}
              {!editingTask && (
                <div>
                  <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Foto de la Falla (Opcional - Múltiple)</label>
                  <input 
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImage}
                    className="hidden"
                  />
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex-1 py-3 px-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 active:scale-95 transition-all text-center text-[13px] flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Camera size={16} />
                      <span>Tomar Foto</span>
                    </button>
                    {imagePreviews.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setImagePreviews([]);
                          setImagePreview(null);
                        }}
                        className="px-4 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-2xl transition-colors font-bold text-[12px] border border-rose-200"
                      >
                        Limpiar Todo
                      </button>
                    )}
                  </div>
                  {imagePreviews.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 bg-zinc-50 border border-zinc-200/50 p-3 rounded-2xl">
                      {imagePreviews.map((img, idx) => (
                        <div key={idx} className="relative rounded-xl overflow-hidden border border-zinc-200 aspect-square">
                          <img src={img} alt={`Evidencia ${idx}`} className="w-full h-full object-cover" />
                          <button 
                            type="button"
                            onClick={() => {
                              const filtered = imagePreviews.filter((_, i) => i !== idx);
                              setImagePreviews(filtered);
                              if (filtered.length > 0) {
                                setImagePreview(filtered[0]);
                              } else {
                                setImagePreview(null);
                              }
                            }}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white cursor-pointer hover:bg-black/80 shadow"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Botón de Envío */}
              <button 
                type="button"
                onClick={() => runWithSignature('report_task', () => submit())}
                disabled={!form.description.trim() || submitting}
                className="w-full bg-zinc-950 hover:bg-zinc-900 text-white font-extrabold py-4 rounded-2xl text-[14px] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg active:scale-98"
              >
                <Send size={14} />
                <span>{submitting ? 'Guardando...' : (editingTask ? 'Actualizar Reporte ✓' : 'Enviar Reporte al Administrador')}</span>
              </button>

            </form>
          </div>
        </div>
      )}

      {/* ── MODAL DETALLES DE INCIDENCIA (GUEST/STAFF STYLE SHEET) ── */}
      {showDetailsModal && selectedTaskForDetails && (() => {
        const t = selectedTaskForDetails;
        const cfg = TYPE_CFG[t.type] || TYPE_CFG['otro'];
        const isRoom = !['General', 'Cocina', 'Recepción', 'Alberca'].includes(t.room);
        const displayRoom = isRoom ? `Habitación ${t.room}` : t.room;
        const dateStr = format(new Date(t.created_at), "d MMM, HH:mm", { locale: es });
        const hasPermission = role === 'admin' || role === 'staff_mantenimiento';

        return (
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div onClick={() => setShowDetailsModal(false)} className="absolute inset-0" />
            <div className="relative bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 max-h-[90vh] overflow-y-auto mx-auto space-y-6">
              
              {/* Header */}
              <div className="flex justify-between items-center pb-3 border-b border-zinc-100">
                <h3 className="text-lg font-bold text-zinc-900 font-extrabold">Detalles de Incidencia</h3>
                <button 
                  onClick={() => setShowDetailsModal(false)} 
                  className="w-8 h-8 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors"
                >
                  <X size={16} strokeWidth={3} />
                </button>
              </div>

              {/* Contenido */}
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-zinc-50 p-4 rounded-2xl border border-zinc-200/50">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-bold">Ubicación</span>
                    <span className="text-[15px] font-extrabold text-zinc-805">{displayRoom}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-bold">Estado</span>
                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg mt-1 inline-block ${
                      t.status === 'nuevo' ? 'bg-purple-50 border border-purple-100 text-purple-650' :
                      t.status === 'pendiente' ? 'bg-amber-50 border border-amber-100 text-amber-650' :
                      t.status === 'en_proceso' ? 'bg-blue-50 border border-blue-100 text-blue-650' :
                      'bg-emerald-50 border border-emerald-100 text-emerald-650'
                    }`}>
                      {t.status === 'nuevo' ? 'Nuevo' :
                       t.status === 'pendiente' ? 'Pendiente' :
                       t.status === 'en_proceso' ? 'En Proceso' : 'Resuelto'}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-bold mb-1">Descripción</span>
                  <p className="text-[13px] text-zinc-800 font-medium whitespace-pre-line bg-zinc-50/50 p-4 border border-zinc-200/40 rounded-2xl leading-relaxed text-left">
                    {t.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-[12px] pt-2 border-t border-zinc-100">
                  <div>
                    <span className="text-zinc-400 font-bold block text-[9px] uppercase tracking-wider">Reportado por</span>
                    <span className="font-extrabold text-zinc-700">{t.reported_by}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 font-bold block text-[9px] uppercase tracking-wider">Fecha</span>
                    <span className="font-extrabold text-zinc-700">{dateStr}</span>
                  </div>
                </div>

                {/* Foto Evidencia */}
                {renderTaskImagesCarousel(t)}
              </div>

              {/* Botones de acción del flujo + administración */}
              <div className="pt-4 border-t border-zinc-100 flex flex-col gap-2">
                
                {/* Flujo de Estados Operativos */}
                {t.status === 'nuevo' && (
                  <button
                    onClick={() => {
                      runWithSignature('resolve_task', (status) => updateTaskStatus(t.id, status), 'pendiente');
                      setShowDetailsModal(false);
                    }}
                    className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-2xl transition-all shadow-md text-[13px] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Aceptar Tarea ⚡</span>
                  </button>
                )}

                {t.status === 'pendiente' && (
                  <button
                    onClick={() => {
                      runWithSignature('resolve_task', (status) => updateTaskStatus(t.id, status), 'en_proceso');
                      setShowDetailsModal(false);
                    }}
                    className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded-2xl transition-all shadow-md text-[13px] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Iniciar Trabajo Activo ⚡</span>
                  </button>
                )}

                {t.status === 'en_proceso' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        runWithSignature('resolve_task', (status) => updateTaskStatus(t.id, status), 'pendiente');
                        setShowDetailsModal(false);
                      }}
                      className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 font-extrabold rounded-2xl transition-all text-[13px] flex items-center justify-center cursor-pointer"
                    >
                      <span>Pausar ↩</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowDetailsModal(false);
                        handleOpenResolveModal(t);
                      }}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl transition-all shadow-md text-[13px] flex items-center justify-center cursor-pointer"
                    >
                      <span>Terminar ✓</span>
                    </button>
                  </div>
                )}

                {/* Edición y Eliminación (ADMIN y MTTO) */}
                {hasPermission && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-zinc-100">
                    <button
                      onClick={() => {
                        setShowDetailsModal(false);
                        setEditingTask(t);
                        setForm({
                          type: t.type,
                          room: t.room,
                          description: t.description
                        });
                        setShowForm(true);
                      }}
                      className="flex-1 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl transition-all border border-blue-200 text-[13px] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      Editar ✏️
                    </button>
                    {role === 'admin' && (
                      <button
                        onClick={() => handleDeleteTask(t)}
                        className="flex-1 py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl transition-all border border-rose-200 text-[13px] flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        Eliminar 🗑️
                      </button>
                    )}
                  </div>
                )}

                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="w-full py-3 bg-zinc-50 hover:bg-zinc-100 text-zinc-550 font-bold rounded-xl transition-all border border-zinc-200/60 text-[13px] flex items-center justify-center cursor-pointer"
                >
                  Cerrar
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* ── MODAL DETALLE / FINALIZACIÓN DE LIMPIEZA (BOTTOM SHEET STAFF OPERATIVO CERRADO) ── */}
      {showStatusModal && selectedRoom && (() => {
        const dbStatus = getRoomDbStatus(selectedRoom, roomStatuses);
        const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(selectedRoom));
        const operStatus = getRoomOperationalStatus(selectedRoom, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);

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
        const isAvailable = operStatus === 'disponible';
        const isDirty = operStatus === 'sucio_checkout' || operStatus === 'en_limpieza' || operStatus === 'limpieza_programada' || operStatus === 'salida_hoy';

        return (
          <div className="fixed inset-0 z-[9999] flex flex-col justify-end bg-zinc-950/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div onClick={() => setShowStatusModal(false)} className="absolute inset-0" />
            <div className="relative bg-white rounded-t-[32px] shadow-2xl p-6 space-y-6 animate-in slide-in-from-bottom-8 duration-300 w-full max-w-md mx-auto">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                <div>
                  <h3 className="text-lg font-black text-zinc-900">Habitación {selectedRoom}</h3>
                  <p className="text-[11px] text-zinc-400 font-bold mt-0.5">
                    {isDirty ? 'Registro de Servicio Técnico / Limpieza' : 'Información de Estatus de Habitación'}
                  </p>
                </div>
                <button 
                  onClick={() => setShowStatusModal(false)} 
                  className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 cursor-pointer hover:bg-zinc-200"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>

              {/* Contenido Condicional */}
              {isDirty ? (
                // CASO DIRTY: Botón Único de "Finalizar Limpieza"
                <div className="space-y-5">
                  {(() => {
                    let containerClass = "bg-amber-50 border border-amber-250 text-amber-550";
                    let textClass = "text-amber-850";
                    let subTextClass = "text-amber-650";
                    let label = "Limpieza Programada";
                    let desc = "Servicio ordinario (Stayover diario o stayover cada 3er día) según calendario Beds24.";

                    if (operStatus === 'sucio_checkout') {
                      containerClass = "bg-rose-50 border border-rose-250 text-rose-550";
                      textClass = "text-rose-850";
                      subTextClass = "text-rose-650";
                      label = "Check-Out (Pendiente Limpieza)";
                      desc = "Huésped entregó llaves en Recepción. Por favor realiza la limpieza profunda de salida antes de reportar la finalización.";
                    } else if (operStatus === 'salida_hoy') {
                      containerClass = "bg-rose-50/50 border border-rose-200 text-rose-450";
                      textClass = "text-rose-850";
                      subTextClass = "text-rose-650";
                      label = "Esperando Salida (Check-Out Hoy)";
                      desc = "El huésped tiene salida programada para hoy. En espera de confirmar Check-Out en Recepción para iniciar la limpieza de salida.";
                    }

                    return (
                      <div className={`rounded-2xl p-4 space-y-3.5 shadow-sm border ${containerClass}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold bg-white/80`}>
                            ⚠️
                          </div>
                          <div>
                            <p className={`text-[12px] font-black uppercase tracking-wider ${textClass}`}>
                              {label}
                            </p>
                            <p className={`text-[10px] font-bold ${subTextClass}`}>Se requiere servicio físico para habilitar la habitación.</p>
                          </div>
                        </div>
                        
                        <div className="border-t border-black/5 pt-3 space-y-1.5 text-[12px] text-zinc-650 font-semibold">
                          <p className="leading-relaxed">
                            {desc}
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex flex-col gap-2.5 pt-2">
                    {operStatus !== 'salida_hoy' && (
                      <button
                        onClick={() => runWithSignature('room_status', (payload) => changeRoomStatus(payload.room, payload.status), { room: selectedRoom, status: 'limpia' })}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[13px] tracking-wide uppercase py-4 rounded-2xl transition-all cursor-pointer shadow-md shadow-blue-600/15 flex items-center justify-center gap-2 active:scale-[0.98]"
                      >
                        <CheckCircle2 size={16} strokeWidth={2.5} />
                        <span>Finalizar Limpieza (Marcar en Azul)</span>
                      </button>
                    )}
                    
                    <button
                      onClick={() => {
                        setShowStatusModal(false);
                        setForm({ type: 'mantenimiento', room: selectedRoom, description: '' });
                        setShowForm(true);
                      }}
                      className="w-full bg-rose-50 hover:bg-rose-100 text-rose-650 border border-rose-200 font-bold text-[12px] py-3.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Wrench size={14} />
                      <span>Reportar Falla o Avería Técnica (MTTO)</span>
                    </button>
                  </div>
                </div>
              ) : (
                // CASO RENDER INFORMATIVO (Verde o Azul): Solo Lectura
                <div className="space-y-5">
                  <div className="flex justify-center">
                    {(() => {
                      let bg = 'bg-zinc-150 text-zinc-700 border-zinc-200';
                      let label = 'Desconocido';
                      let desc = '';
                      
                      if (isAvailable) {
                        bg = 'bg-emerald-500 text-white border-emerald-600 shadow-lg shadow-emerald-500/10';
                        label = '🟢 Disponible';
                        desc = 'La habitación está limpia, ha sido aprobada físicamente por Recepción y se encuentra lista para renta.';
                      } else if (operStatus === 'ocupada') {
                        bg = 'bg-zinc-100 text-zinc-500 border-zinc-200';
                        label = '⚪ Ocupada / Reservada';
                        desc = 'La habitación cuenta con una estancia activa o una llegada programada para el día de hoy, por lo que no está disponible para nuevos walk-ins.';
                      } else if (isCleanTerminated) {
                        bg = 'bg-blue-500 text-white border-blue-600 shadow-lg shadow-blue-500/10';
                        label = '🔵 Limpieza Terminada';
                        desc = 'Has reportado la limpieza de esta habitación con éxito. Actualmente se encuentra esperando la inspección de Recepción para pasar a Verde.';
                      }

                      const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(selectedRoom));

                      return (
                        <div className="w-full space-y-4">
                          <div className={`p-4 border rounded-2xl text-center ${bg}`}>
                            <span className="text-[14px] font-black tracking-wide uppercase">{label}</span>
                          </div>
                          
                          <div className="bg-zinc-50 border border-zinc-200/60 rounded-2xl p-4 space-y-3">
                            <p className="text-[12px] text-zinc-500 font-semibold leading-relaxed">
                              {desc}
                            </p>
                            
                            {dbStatusObj && (dbStatusObj.updated_by || dbStatusObj.updated_at) && (
                              <div className="border-t border-zinc-200/40 pt-3 space-y-1.5 text-[11px] text-zinc-400 font-bold">
                                {dbStatusObj.updated_by && (
                                  <div className="flex justify-between">
                                    <span>Registrado por:</span>
                                    <span className="font-extrabold text-zinc-700">{dbStatusObj.updated_by}</span>
                                  </div>
                                )}
                                {dbStatusObj.updated_at && (
                                  <div className="flex justify-between">
                                    <span>Fecha/Hora:</span>
                                    <span className="font-bold text-zinc-700">{formatLastUpdated(dbStatusObj.updated_at)}</span>
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
                    {/* Botón especial: Programar limpieza en habitación ocupada o disponible */}
                    {(operStatus === 'ocupada' || operStatus === 'disponible') && (
                      <button
                        onClick={() => runWithSignature('room_status', (payload) => changeRoomStatus(payload.room, payload.status), { room: selectedRoom, status: 'limpieza_programada' })}
                        className="w-full bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 font-extrabold text-[13px] tracking-wide uppercase py-4 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]"
                      >
                        <span>🧹 Programar Limpieza Hoy</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowStatusModal(false);
                        setForm({ type: 'mantenimiento', room: selectedRoom, description: '' });
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

      {/* Modal táctil de finalización obligatoria (Cierre de MTTO) */}
      {showResolveModal && resolvingTask && (
        <div className="fixed inset-0 z-[9999] bg-zinc-950/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[32px] p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-8 duration-300 max-h-[82vh] overflow-y-auto border border-zinc-150 flex flex-col">
            <div className="flex justify-between items-center pb-1">
              <h3 className="text-lg font-black text-zinc-955 flex items-center gap-2">
                <CheckCircle2 className="text-emerald-600" size={22} />
                Finalizar Incidencia
              </h3>
              <button 
                onClick={() => setShowResolveModal(false)} 
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 cursor-pointer hover:bg-zinc-200"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </div>

            {/* Tarea Original Card */}
            <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-150 text-[13px] leading-relaxed text-zinc-700 space-y-2">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none">Tarea original</p>
              <p className="font-bold text-zinc-900 whitespace-pre-line leading-relaxed">{resolvingTask.description}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-black text-zinc-600 bg-white px-2 py-0.5 rounded border border-zinc-200">
                  Habitación: {resolvingTask.room}
                </span>
                <span className="text-[11px] font-black text-zinc-600 bg-white px-2 py-0.5 rounded border border-zinc-200">
                  De: {resolvingTask.reported_by || 'Admin'}
                </span>
              </div>
              
              {/* Mostrar fotos reportadas en el modal de resolución */}
              {getTaskImages(resolvingTask).length > 0 && (
                <div className="space-y-1 mt-2">
                  <p className="text-[9.5px] font-black text-zinc-400 uppercase tracking-wider block leading-none">Foto original</p>
                  {renderTaskImagesCarousel(resolvingTask)}
                </div>
              )}
            </div>

            <form onSubmit={handleResolveSubmit} className="space-y-4 flex-1">
              <div>
                <label className="block text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">
                  Detalles de la Resolución <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={resolveComments}
                  onChange={e => setResolveComments(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none text-[14px] font-semibold text-zinc-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none shadow-sm focus:bg-white transition-all leading-relaxed"
                  placeholder="Describe exactamente qué se reparó o solucionó..."
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">
                  Evidencia Fotográfica (Opcional)
                </label>
                <input
                  ref={resolvePhotoRef}
                  type="file"
                  accept="image/*"
                  onChange={e => setResolvePhotoFile(e.target.files ? e.target.files[0] : null)}
                  className="hidden"
                />
                {resolvePhotoFile ? (
                  <div className="space-y-2">
                    <div className="relative rounded-2xl overflow-hidden border border-zinc-200 aspect-video bg-zinc-100">
                      <img
                        src={URL.createObjectURL(resolvePhotoFile)}
                        alt="Evidencia resolución"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setResolvePhotoFile(null)}
                        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white cursor-pointer hover:bg-black/80 shadow"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <p className="text-[10px] text-emerald-600 font-bold pl-1">✓ Foto lista para adjuntar</p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => resolvePhotoRef.current?.click()}
                    className="w-full border-2 border-dashed border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 rounded-2xl py-6 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-emerald-600 hover:text-emerald-700 transition-colors"
                  >
                    <Camera size={24} className="text-emerald-500" />
                    <span className="text-[12px] font-bold">Tomar Foto / Seleccionar</span>
                  </button>
                )}
              </div>

              <div className="flex gap-2 pt-2 pb-1">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className="flex-1 py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition-all border border-zinc-200 text-[13px] active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl transition-all disabled:opacity-50 shadow-md text-[13px] flex items-center justify-center gap-1.5 active:scale-95"
                >
                  {submitting ? 'Guardando...' : 'Cerrar Incidencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal táctil de autenticación de empleado */}
      <EmployeeModal
        isOpen={showEmployeeModal}
        onClose={() => {
          const emp = getActiveEmployee(currentDept);
          if (!emp) {
            const currentRole = typeof window !== 'undefined' ? localStorage.getItem('jaroje_role') : null;
            if (currentRole === 'admin') {
              window.location.href = '/';
            } else {
              localStorage.removeItem('jaroje_role');
              window.location.href = '/login';
            }
          } else {
            setShowEmployeeModal(false);
            setPendingAction(null);
          }
        }}
        module={currentDept}
        onSuccess={(employee) => {
          setActiveEmployeeState(employee);
          if (pendingAction) {
            pendingAction.callback(pendingAction.payload);
            setPendingAction(null);
          }
        }}
      />

      {/* ── MODAL DETALLES DE KPI (SECURE FOR LIMPIEZA/STAFF) ── */}
      {kpiModalType && (() => {
        let title = 'Detalles';
        let badgeColor = 'bg-zinc-100 text-zinc-800';
        let filtered: any[] = [];

        if (kpiModalType === 'encasa') {
          title = 'Huéspedes En Casa';
          badgeColor = 'bg-zinc-900 text-white';
          filtered = ocupadas;
        } else if (kpiModalType === 'llegan') {
          title = 'Llegadas Hoy';
          badgeColor = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
          filtered = llegadas;
        } else if (kpiModalType === 'salen') {
          title = 'Pendientes por Salir';
          badgeColor = 'bg-amber-100 text-amber-800 border border-amber-200';
          filtered = salidas;
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
                        className="p-4 border border-zinc-150 rounded-2xl bg-zinc-50/20 space-y-2.5 select-none"
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
