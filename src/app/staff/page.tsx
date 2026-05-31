"use client";

import { useEffect, useState, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  CheckCircle2, AlertTriangle, Wrench, Sparkles, BedDouble,
  ArrowDownLeft, Clock, Plus, X, Send,
  ChevronDown, CheckCheck, Camera, Bell, Package, Minus,
  RefreshCw, ShieldAlert, UserPlus
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { getActiveEmployee, clearActiveEmployee, Employee } from '@/lib/auth';
import EmployeeModal from '@/components/EmployeeModal';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Habitaciones físicas consistentes (101 a 402) según requerimiento de Jaroje OS
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

interface Reserva {
  id: string;
  room: string;
  guest_name?: string;
  check_in: string;
  check_out: string;
  checked_out?: boolean;
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
): 'disponible' | 'en_limpieza' | 'limpia' | 'sucio_checkout' | 'limpieza_programada' {
  // 1. Si está limpia (AZUL) o sucio_checkout (ROJO) por base de datos, respetar de inmediato
  if (dbStatus === 'limpia') return 'limpia'; // Azul
  if (dbStatus === 'sucio_checkout') return 'sucio_checkout'; // Rojo
  
  // 2. Si está disponible (VERDE) y fue actualizado hoy, respetar de inmediato (ya se limpió y aprobó hoy)
  const isUpdatedToday = lastUpdatedAt && lastUpdatedAt.startsWith(todayStr);
  if (dbStatus === 'disponible' && isUpdatedToday) return 'disponible'; // Verde
  
  // 2. Buscar si hay una reserva activa hoy
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
      return 'limpieza_programada'; // Amarillo automático por 3er día (Stayover cada 3er día de estancia)
    }
    if (isDailyRoom && dayOfStay >= 2) {
      return 'limpieza_programada'; // Amarillo automático diario durante estancia
    }
  }

  // 3. Buscar si tiene salida programada hoy y aún no entrega llaves
  const isSalidaHoy = activeReservations.some(r => {
    const rRoom = String(r.room || '').replace(/[\s()]/g, '');
    return rRoom.includes(roomNum) && r.check_out === todayStr && !r.checked_out;
  });

  if (isSalidaHoy) {
    return 'limpieza_programada'; // Amarillo automático por checkout pendiente
  }

  // 4. Si el estado explícito es 'en_limpieza', o no tiene reserva pero requiere limpieza
  return (dbStatus as any) || 'en_limpieza'; // Amarillo por defecto
}

export default function StaffPage() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [roomStatuses, setRoomStatuses] = useState<RoomStatus[]>([]);
  const [mainTab, setMainTab] = useState<'tareas' | 'housekeeping'>('tareas');
  const [taskTab, setTaskTab] = useState<'nuevos' | 'pendientes' | 'en_proceso' | 'resueltos'>('nuevos');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolvingTask, setResolvingTask] = useState<Task | null>(null);
  const [resolveComments, setResolveComments] = useState('');
  const [resolvePhotoFile, setResolvePhotoFile] = useState<File | null>(null);
  
  // Modales
  const [showForm, setShowForm] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  
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
  const todayStr = new Date().toISOString().split('T')[0];

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
        fetch('/api/reservas'),
        fetch('/api/tasks'),
        supabase.from('inventory').select('*').order('category').order('item_name'),
        fetch('/api/room-status'),
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
    fetchData();

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

  const llegadas = reservas.filter(r => r.check_in === todayStr);
  const salidas  = reservas.filter(r => r.check_out === todayStr);
  const ocupadas = reservas.filter(r => r.check_in <= todayStr && r.check_out > todayStr);

  const getScheduledCleanings = (): CleanTask[] => {
    const list: CleanTask[] = [];
    
    ROOMS.forEach(r => {
      const dbStatus = getRoomDbStatus(r, roomStatuses);
      const dbStatusObj = roomStatuses.find(rs => String(rs.room_number) === String(r));
      const operStatus = getRoomOperationalStatus(r, dbStatus, reservas, todayStr, dbStatusObj?.updated_at);
      
      // 1. Verificar si es salida hoy (Check-out)
      const salidaRes = reservas.find(res => {
        const rRoom = String(res.room || '').replace(/[\s()]/g, '');
        return rRoom.includes(r) && res.check_out === todayStr;
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
          isUpdatedToday: !!(dbStatusObj?.updated_at && dbStatusObj.updated_at.startsWith(todayStr))
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
        
        const isThreeDayRoom = ['101','102','103','104','105','106','107','201','202','203','204','205','206','501','402'].includes(r);
        const isDailyRoom = ['301','302','303','304','305','306','500','502','503','504','505','506','507'].includes(r);
        
        let requiresService = false;
        if (isThreeDayRoom && dayOfStay >= 3 && dayOfStay % 3 === 0) {
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
            isUpdatedToday: !!(dbStatusObj?.updated_at && dbStatusObj.updated_at.startsWith(todayStr))
          });
        }
      }

      // 3. Fallback Unificador: Si la habitación está en estado sucio o limpieza y no tiene una reserva activa hoy
      // registrada en la lista, se agrega de forma automática para mantener una sincronización visual del 100%.
      const alreadyAdded = list.some(item => item.room === r);
      if (!alreadyAdded && (
        operStatus === 'sucio_checkout' || 
        operStatus === 'en_limpieza' || 
        operStatus === 'limpieza_programada' ||
        dbStatus === 'limpia'
      )) {
        list.push({
          room: r,
          type: operStatus === 'sucio_checkout' ? 'checkout' : 'stayover',
          dbStatus,
          operStatus,
          guestName: operStatus === 'sucio_checkout' ? 'Aviso Check-Out' : 'Limpieza Programada',
          keysReturned: operStatus === 'sucio_checkout',
          reserva: null,
          isUpdatedToday: !!(dbStatusObj?.updated_at && dbStatusObj.updated_at.startsWith(todayStr))
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
    if (t.type === 'aviso' || t.type === 'otro') return true;
    if (isMantenimiento) return t.type === 'mantenimiento';
    if (isLimpieza) return t.type === 'limpieza';
    return true;
  });

  const nuevos      = roleFilteredTasks.filter(t => t.status === 'nuevo');
  const pendientes  = roleFilteredTasks.filter(t => t.status === 'pendiente');
  const enProceso   = roleFilteredTasks.filter(t => t.status === 'en_proceso');
  const resueltos   = roleFilteredTasks.filter(t => t.status === 'resuelta');

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
    return tasks.some(t => t.room.includes(roomNum) && t.type === 'limpieza' && t.status === 'resuelta' && t.created_at.startsWith(todayStr));
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

    const emp = getActiveEmployee(currentDept);
    const operatorName = emp ? `${emp.full_name} (${emp.employee_num})` : staffName;
    const finalImagePayload = imagePreviews.length > 0 ? JSON.stringify(imagePreviews) : imagePreview;

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

    setForm({ type: isMantenimiento ? 'mantenimiento' : 'limpieza', room: 'General', description: '' });
    setImagePreview(null);
    setImagePreviews([]);
    setShowForm(false);
    setSuccessMsg('¡Reporte enviado con éxito!');
    fetchData();
    setTimeout(() => setSuccessMsg(''), 3000);
    setSubmitting(false);
  };

  const openMaintenanceReport = () => {
    setForm({ type: 'mantenimiento', room: 'General', description: '' });
    setImagePreview(null);
    setImagePreviews([]);
    setShowForm(true);
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
              {isMantenimiento ? 'Mtto. Técnico' : 'Personal Operativo'}
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
        
        {/* Pestañas Principales Integradas */}
        <div className="flex bg-zinc-200/60 p-1 rounded-2xl">
          <button 
            onClick={() => setMainTab('tareas')} 
            className={`flex-1 py-3 text-[13px] font-black rounded-xl transition-all cursor-pointer ${mainTab === 'tareas' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
          >
            {isMantenimiento ? 'Mis Tareas' : 'Tareas de Hoy'}
          </button>
          
          {/* Ocultar pestaña Housekeeping al personal puramente técnico de mantenimiento */}
          {!isMantenimiento && (
            <button 
              onClick={() => setMainTab('housekeeping')} 
              className={`flex-1 py-3 text-[13px] font-black rounded-xl transition-all cursor-pointer ${mainTab === 'housekeeping' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
            >
              Habitaciones
            </button>
          )}
        </div>

        {/* ── SECCIÓN 1: TAREAS Y LIMPIEZA PROGRAMADA ── */}
        {mainTab === 'tareas' && (
          <div className="space-y-4">
            
            {/* KPI Cards */}
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: 'Llegan', value: llegadas.length, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
                { label: 'Salen', value: salidas.length, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-100' },
                { label: 'Ocupadas', value: ocupadas.length, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
              ].map((k, i) => (
                <div key={i} className={`bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col justify-center items-center ${k.bg}`}>
                  <p className={`text-2xl font-black ${k.color} leading-none mb-1`}>{k.value}</p>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{k.label}</p>
                </div>
              ))}
            </div>

            {/* ── ESTADO FÍSICO DE HABITACIONES (GRID INTERACTIVO PREMIUM EN TAREAS) ── */}
            {!isMantenimiento && (
              <div className="bg-white border border-zinc-200 rounded-[28px] p-5 shadow-sm space-y-4">
                <div>
                  <h3 className="text-[15px] font-black text-zinc-900">Estado de Habitaciones</h3>
                  <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">Sincronizado al instante mediante Supabase Realtime</p>
                </div>

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
                    <p className="text-[7.2px] font-black text-rose-600 uppercase tracking-wider mt-0.5">Aviso Check Out</p>
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
            )}

            {/* Llegadas de Hoy (Check-in) */}
            {!isMantenimiento && llegadas.length > 0 && (
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

            {/* LIMPIEZA PROGRAMADA (Check out + Servicios) */}
            {!isMantenimiento && (
              <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-600" strokeWidth={2.5} />
                  <span className="text-[13px] font-extrabold text-zinc-800">Limpieza Programada (Check-out + Servicios)</span>
                </div>
                
                {getScheduledCleanings().length === 0 ? (
                  <div className="p-6 text-center text-zinc-400 text-[13px] font-semibold">
                    No hay limpiezas programadas para hoy.
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {getScheduledCleanings().map((task) => {
                      const isFinished = task.dbStatus === 'limpia' || (task.dbStatus === 'disponible' && task.isUpdatedToday);
                      const inProgress = task.dbStatus === 'en_limpieza';

                      return (
                        <div key={task.room} className="p-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isFinished 
                                ? 'bg-emerald-50 text-emerald-600' 
                                : inProgress 
                                  ? 'bg-amber-50 border border-amber-100 text-amber-600 animate-pulse' 
                                  : task.type === 'checkout' && task.keysReturned
                                    ? 'bg-rose-50 border border-rose-100 text-rose-600 animate-pulse'
                                    : 'bg-zinc-50 border border-zinc-100 text-zinc-500'
                            }`}>
                              {isFinished ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[14px] font-bold text-zinc-900 leading-tight">
                                Hab. {task.room} <span className="text-[10px] font-black text-zinc-400 uppercase">({task.type === 'checkout' ? 'Salida' : 'Estancia'})</span>
                              </p>
                              {task.type === 'checkout' ? (
                                <>
                                  {isFinished ? (
                                    <p className="text-[12px] font-semibold text-emerald-600 mt-0.5">✓ Habitación Lista para Check-in</p>
                                  ) : task.keysReturned ? (
                                    <p className="text-[12px] font-extrabold text-rose-650 mt-0.5 flex items-center gap-1 animate-pulse">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                      Salida Confirmada · Vacía (Entrar ya)
                                    </p>
                                  ) : (
                                    <p className="text-[12px] font-bold text-rose-500/80 mt-0.5 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                      Ocupada · Esperando entrega de llaves
                                    </p>
                                  )}
                                </>
                              ) : (
                                <>
                                  {isFinished ? (
                                    <p className="text-[12px] font-semibold text-emerald-600 mt-0.5">✓ Servicio de Estancia Realizado</p>
                                  ) : (
                                    <p className="text-[12px] font-bold text-amber-600 mt-0.5 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-450 shrink-0" />
                                      Servicio de Estancia Programado para Hoy
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          
                          {isFinished ? (
                            <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 flex items-center gap-1">
                              ✓ Lista
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                if (task.type === 'checkout' && !task.keysReturned) {
                                  const force = window.confirm(
                                    `⚠️ ATENCIÓN DE SEGURIDAD OPERATIVA:\n\nEl huésped de la Habitación ${task.room} no ha entregado llaves formalmente en Recepción.\n\n¿Confirmas que la habitación ya está físicamente vacía y deseas forzar la firma de limpieza?`
                                  );
                                  if (!force) return;
                                }
                                runWithSignature(
                                  'room_status', 
                                  (payload) => changeRoomStatus(payload.room, payload.status), 
                                  { room: task.room, status: 'limpia' }
                                );
                              }}
                              className={`text-white text-[11px] font-black tracking-wide uppercase px-3 py-2 rounded-xl transition-all cursor-pointer shadow-sm active:scale-95 ${
                                task.type === 'checkout' && task.keysReturned
                                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-100'
                                  : inProgress
                                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-100' 
                                    : 'bg-zinc-500 hover:bg-zinc-650 shadow-zinc-100 opacity-90'
                              }`}
                            >
                              Marcar Lista
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TABLERO DE INCIDENCIAS (Filtrado para evitar ruido a Limpieza/Recepción) */}
            {(isMantenimiento || role === 'admin') ? (
              <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-zinc-600" />
                    <span className="text-[13px] font-extrabold text-zinc-800">Control de Incidencias</span>
                  </div>
                </div>

                <div className="p-2 bg-zinc-50 border-b border-zinc-100 grid grid-cols-4 gap-1">
                  <button 
                    onClick={() => setTaskTab('nuevos')} 
                    className={`py-2 text-[9px] font-black rounded-lg text-center transition-all ${taskTab === 'nuevos' ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/50' : 'text-zinc-400'}`}
                  >
                    NUEVOS ({nuevos.length})
                  </button>
                  <button 
                    onClick={() => setTaskTab('pendientes')} 
                    className={`py-2 text-[9px] font-black rounded-lg text-center transition-all ${taskTab === 'pendientes' ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/50' : 'text-zinc-400'}`}
                  >
                    PENDIENTES ({pendientes.length})
                  </button>
                  <button 
                    onClick={() => setTaskTab('en_proceso')} 
                    className={`py-2 text-[9px] font-black rounded-lg text-center transition-all ${taskTab === 'en_proceso' ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/50' : 'text-zinc-400'}`}
                  >
                    EN PROCESO ({enProceso.length})
                  </button>
                  <button 
                    onClick={() => setTaskTab('resueltos')} 
                    className={`py-2 text-[9px] font-black rounded-lg text-center transition-all ${taskTab === 'resueltos' ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/50' : 'text-zinc-400'}`}
                  >
                    RESUELTOS ({resueltos.length})
                  </button>
                </div>

                {taskTab === 'nuevos' && (
                  nuevos.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                      <CheckCircle2 size={24} className="text-emerald-500" />
                      <p className="text-[12px] font-semibold text-zinc-400">Sin nuevos reportes</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {nuevos.map((t) => {
                        const cfg = TYPE_CFG[t.type] || TYPE_CFG.otro;
                        const Icon = cfg.icon;
                        const taskImg = t.photo_url && t.photo_url !== 'null' ? t.photo_url : t.image_base64;
                        const dateStr = t.created_at ? format(new Date(t.created_at), 'dd/MM/yyyy HH:mm', { locale: es }) : '';
                        
                        return (
                          <div key={t.id} className="p-4 space-y-3 animate-in fade-in duration-155">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                                  <Icon size={14} className={cfg.text} />
                                </div>
                                <span className={`text-[12px] font-extrabold ${cfg.text}`}>{cfg.label}</span>
                                <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md">Hab. {t.room}</span>
                              </div>
                              <span className="text-[10px] font-bold text-zinc-400">{elapsed(t.created_at)}</span>
                            </div>

                            <p className="text-[13px] text-zinc-650 leading-relaxed pl-1 whitespace-pre-line font-medium">{t.description}</p>

                            <div className="flex items-center gap-2 text-[10.5px] font-bold text-zinc-400 pl-1">
                              <span className="bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">De: {t.reported_by || 'Admin'}</span>
                              <span>•</span>
                              <span>{dateStr}</span>
                            </div>

                            {renderTaskImagesCarousel(t)}

                            <div className="pt-1">
                              <button 
                                onClick={() => runWithSignature('resolve_task', (status) => updateTaskStatus(t.id, status), 'pendiente')}
                                className="w-full py-3 bg-zinc-900 text-white rounded-xl text-[11px] font-extrabold hover:bg-zinc-800 active:scale-[0.96] transition-all cursor-pointer shadow-md text-center"
                              >
                                MARCAR COMO REVISADO ✓
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {taskTab === 'pendientes' && (
                  pendientes.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                      <Clock size={24} className="text-zinc-300" />
                      <p className="text-[12px] font-semibold text-zinc-400">Sin reportes pendientes</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {pendientes.map((t) => {
                        const cfg = TYPE_CFG[t.type] || TYPE_CFG.otro;
                        const Icon = cfg.icon;
                        const taskImg = t.photo_url && t.photo_url !== 'null' ? t.photo_url : t.image_base64;
                        const dateStr = t.created_at ? format(new Date(t.created_at), 'dd/MM/yyyy HH:mm', { locale: es }) : '';

                        return (
                          <div key={t.id} className="p-4 space-y-3 animate-in fade-in duration-155">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                                  <Icon size={14} className={cfg.text} />
                                </div>
                                <span className={`text-[12px] font-extrabold ${cfg.text}`}>{cfg.label}</span>
                                <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md">Hab. {t.room}</span>
                              </div>
                              <span className="text-[10px] font-bold text-zinc-400">{elapsed(t.created_at)}</span>
                            </div>

                            <p className="text-[13px] text-zinc-650 leading-relaxed pl-1 whitespace-pre-line font-medium">{t.description}</p>

                            <div className="flex items-center gap-2 text-[10.5px] font-bold text-zinc-400 pl-1">
                              <span className="bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">De: {t.reported_by || 'Admin'}</span>
                              <span>•</span>
                              <span>{dateStr}</span>
                            </div>

                            {renderTaskImagesCarousel(t)}

                            <div className="pt-1">
                              <button 
                                onClick={() => runWithSignature('resolve_task', (status) => updateTaskStatus(t.id, status), 'en_proceso')}
                                className="w-full py-3 bg-amber-500 text-white rounded-xl text-[11px] font-extrabold hover:bg-amber-600 active:scale-[0.96] transition-all cursor-pointer shadow-md text-center"
                              >
                                INICIAR TRABAJO ⚡
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {taskTab === 'en_proceso' && (
                  enProceso.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                      <Clock size={24} className="text-zinc-300" />
                      <p className="text-[12px] font-semibold text-zinc-400">Sin trabajos en proceso</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {enProceso.map((t) => {
                        const cfg = TYPE_CFG[t.type] || TYPE_CFG.otro;
                        const Icon = cfg.icon;
                        const taskImg = t.photo_url && t.photo_url !== 'null' ? t.photo_url : t.image_base64;
                        const dateStr = t.created_at ? format(new Date(t.created_at), 'dd/MM/yyyy HH:mm', { locale: es }) : '';

                        return (
                          <div key={t.id} className="p-4 space-y-3 animate-in fade-in duration-155">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                                  <Icon size={14} className={cfg.text} />
                                </div>
                                <span className={`text-[12px] font-extrabold ${cfg.text}`}>{cfg.label}</span>
                                <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md">Hab. {t.room}</span>
                              </div>
                              <span className="text-[10px] font-bold text-zinc-400">{elapsed(t.created_at)}</span>
                            </div>

                            <p className="text-[13px] text-zinc-650 leading-relaxed pl-1 whitespace-pre-line font-medium">{t.description}</p>

                            <div className="flex items-center gap-2 text-[10.5px] font-bold text-zinc-400 pl-1">
                              <span className="bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">De: {t.reported_by || 'Admin'}</span>
                              <span>•</span>
                              <span>{dateStr}</span>
                            </div>

                            {renderTaskImagesCarousel(t)}

                            <div className="flex gap-2 pt-1">
                              <button 
                                onClick={() => runWithSignature('resolve_task', (status) => updateTaskStatus(t.id, status), 'pendiente')}
                                className="flex-1 py-2.5 rounded-xl text-[11px] font-black bg-zinc-100 border border-zinc-200 text-zinc-500 hover:bg-zinc-200 active:scale-[0.96] transition-all cursor-pointer text-center"
                              >
                                Regresar ↩
                              </button>
                              <button 
                                onClick={() => handleOpenResolveModal(t)}
                                className="flex-1 py-2.5 rounded-xl text-[11px] font-black bg-emerald-600 text-white hover:bg-emerald-500 active:scale-[0.96] transition-all cursor-pointer shadow-md text-center"
                              >
                                ✓ Terminar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {taskTab === 'resueltos' && (
                  resueltos.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                      <Clock size={24} className="text-zinc-300" />
                      <p className="text-[12px] font-semibold text-zinc-400">Historial vacío</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100 bg-zinc-50/50">
                      {resueltos.map((t) => {
                        const cfg = TYPE_CFG[t.type] || TYPE_CFG.otro;
                        const Icon = cfg.icon;
                        const originalImg = t.photo_url && t.photo_url !== 'null' ? t.photo_url : t.image_base64;
                        const dateStr = t.created_at ? format(new Date(t.created_at), 'dd/MM/yyyy HH:mm', { locale: es }) : '';
                        const resolvedStr = t.resolved_at ? format(new Date(t.resolved_at), 'dd/MM/yyyy HH:mm', { locale: es }) : '';

                        return (
                          <div key={t.id} className="p-4 space-y-2 opacity-85 animate-in fade-in duration-155">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-zinc-200 flex items-center justify-center shrink-0">
                                  <Icon size={12} className="text-zinc-650" />
                                </div>
                                <span className="text-[12px] font-bold text-zinc-650">{cfg.label}</span>
                                <span className="text-[11px] font-bold text-zinc-400 bg-white px-2 py-0.5 rounded-md border border-zinc-150">Hab. {t.room}</span>
                              </div>
                              <span className="text-[10px] font-semibold text-zinc-400">{elapsed(t.created_at)}</span>
                            </div>
                            <p className="text-[13px] text-zinc-650 pl-1 whitespace-pre-line leading-relaxed font-medium">{t.description}</p>
                            
                            <div className="flex items-center gap-2 text-[10.5px] font-bold text-zinc-400 pl-1">
                              <span className="bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">De: {t.reported_by || 'Admin'}</span>
                              <span>•</span>
                              <span>{dateStr}</span>
                            </div>

                            {/* Mostrar foto original si existe */}
                            {getTaskImages(t).length > 0 && (
                              <div className="space-y-1 pl-1">
                                <span className="text-[9.5px] font-black text-zinc-400 uppercase tracking-wider block">Foto Reportada</span>
                                {renderTaskImagesCarousel(t)}
                              </div>
                            )}
                            
                            {/* Mostrar foto de resolución si existe */}
                            {t.resolution_photo_url && (
                              <div className="space-y-1 pl-1">
                                <span className="text-[9.5px] font-black text-zinc-400 uppercase tracking-wider block">Evidencia de Cierre</span>
                                <div className="rounded-2xl overflow-hidden border border-zinc-200">
                                  <a href={t.resolution_photo_url} target="_blank" rel="noreferrer">
                                    <img src={t.resolution_photo_url} alt="Evidencia de Resolución" className="w-full max-h-40 object-cover" />
                                  </a>
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-1 text-[11px] font-black text-emerald-600 pl-1 pt-1">
                              <CheckCheck size={14} />
                              <span>Cerrado en: {resolvedStr}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            ) : (
              // BÁNNER INFORMATIVO SI ES CLEANER / RECEPCIÓN (ELIMINA EL RUIDO VISUAL)
              <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden border border-zinc-800">
                <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
                  <Wrench size={160} />
                </div>
                <div className="relative z-10 space-y-4">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <ShieldAlert size={20} className="text-rose-400" />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-black">Reporte de Daños Técnicos</h4>
                    <p className="text-[12px] text-zinc-400 leading-relaxed mt-1">
                      Si encuentras fugas de agua, fallos eléctricos, cerraduras rotas o cualquier anomalía, notifícalo directamente al administrador.
                    </p>
                  </div>
                  <button 
                    onClick={openMaintenanceReport}
                    className="bg-white text-zinc-950 text-[11px] font-black uppercase px-4 py-2.5 rounded-xl flex items-center gap-2 active:scale-95 transition-all cursor-pointer shadow-lg"
                  >
                    <Wrench size={12} strokeWidth={2.5} />
                    Reportar Incidencia
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SECCIÓN 2: TABLERO HOUSEKEEPING (Grid de Habitaciones 101 a 402 en tiempo real) ── */}
        {mainTab === 'housekeeping' && !isMantenimiento && (
          <div className="space-y-4">
            
            <div className="bg-white border border-zinc-200 rounded-3xl p-5 shadow-sm space-y-4">
              <div>
                <h3 className="text-[15px] font-black text-zinc-900">Estado de Habitaciones</h3>
                <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">Sincronizado al instante mediante Supabase Realtime</p>
              </div>

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
                  <p className="text-[7.2px] font-black text-rose-600 uppercase tracking-wider mt-0.5">Aviso Check Out</p>
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

      {/* ── MODAL REPORTE DE INCIDENCIA (CENTRADO PREMIUM COMO ADMIN) ── */}
      {showForm && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div onClick={() => setShowForm(false)} className="absolute inset-0" />
          <div className="relative bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 max-h-[90vh] overflow-y-auto mx-auto">
            
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

              {/* Foto Evidencia (Múltiple) */}
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

              {/* Botón de Envío */}
              <button 
                type="button"
                onClick={() => runWithSignature('report_task', () => submit())}
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
        const isDirty = operStatus === 'sucio_checkout' || operStatus === 'en_limpieza' || operStatus === 'limpieza_programada';

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
                  <div className="bg-amber-50 border border-amber-250 rounded-2xl p-4 space-y-3.5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
                        ⚠️
                      </div>
                      <div>
                        <p className="text-[12px] font-black text-amber-800 uppercase tracking-wider">
                          {operStatus === 'sucio_checkout' ? 'Check-Out (Pendiente Limpieza)' : 'Limpieza Programada'}
                        </p>
                        <p className="text-[10px] text-amber-600 font-bold">Se requiere servicio físico para habilitar la habitación.</p>
                      </div>
                    </div>
                    
                    <div className="border-t border-amber-200/40 pt-3 space-y-1.5 text-[12px] text-zinc-650 font-semibold">
                      {operStatus === 'sucio_checkout' ? (
                        <p className="leading-relaxed">
                          Huésped entregó llaves en Recepción. Por favor realiza la **limpieza profunda de salida** antes de reportar la finalización.
                        </p>
                      ) : (
                        <p className="leading-relaxed">
                          Servicio ordinario (Stayover diario o stayover cada 3er día) según calendario Beds24.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 pt-2">
                    <button
                      onClick={() => runWithSignature('room_status', (payload) => changeRoomStatus(payload.room, payload.status), { room: selectedRoom, status: 'limpia' })}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[13px] tracking-wide uppercase py-4 rounded-2xl transition-all cursor-pointer shadow-md shadow-blue-600/15 flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      <CheckCircle2 size={16} strokeWidth={2.5} />
                      <span>Finalizar Limpieza (Marcar en Azul)</span>
                    </button>
                    
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

                  <div className="pt-2">
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

    </div>
  );
}
