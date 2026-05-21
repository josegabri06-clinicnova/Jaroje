"use client";

import { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
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
  '401','402'
];

interface Reserva {
  id: string;
  room: string;
  guest_name?: string;
  check_in: string;
  check_out: string;
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

export default function StaffPage() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [roomStatuses, setRoomStatuses] = useState<RoomStatus[]>([]);
  const [mainTab, setMainTab] = useState<'tareas' | 'housekeeping' | 'inventario'>('tareas');
  const [taskTab, setTaskTab] = useState<'activas' | 'historial'>('activas');
  
  // Modales
  const [showForm, setShowForm] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  
  const staffName = typeof window !== 'undefined' ? (localStorage.getItem('jaroje_staff_name') || 'Personal') : 'Personal';
  const role = typeof window !== 'undefined' ? (localStorage.getItem('jaroje_role') || 'staff_limpieza') : 'staff_limpieza';
  
  const isMantenimiento = role === 'staff_mantenimiento';
  const isLimpieza = role === 'staff_limpieza';
  const isRecepcionOrAdmin = role === 'reception' || role === 'admin';
  const canModifyStatus = isLimpieza || role === 'reception'; // Solo personal de limpieza y recepción modifican limpieza, Admin lee

  const currentDept = isMantenimiento ? 'mantenimiento' : 'limpieza';

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

  const [form, setForm] = useState({ type: isMantenimiento ? 'mantenimiento' : 'limpieza', room: ROOMS[0], description: '' });
  const todayStr = new Date().toISOString().split('T')[0];

  // Lock body on modal open
  useEffect(() => {
    if (showForm || showStatusModal) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => { document.body.classList.remove('overflow-hidden'); };
  }, [showForm, showStatusModal]);

  const fetchData = async () => {
    try {
      const [r, t, inv, rs] = await Promise.all([
        fetch('/api/reservas'),
        fetch('/api/tasks'),
        supabase.from('inventory').select('*').order('category').order('item_name'),
        fetch('/api/room-status')
      ]);
      
      const rj = await r.json();
      const tj = await t.json();
      const rsj = await rs.json();
      
      if (rj.success && rj.data) setReservas(rj.data);
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

  const roleFilteredTasks = tasks.filter(t => {
    if (t.type === 'aviso' || t.type === 'otro') return true;
    if (isMantenimiento) return t.type === 'mantenimiento';
    if (isLimpieza) return t.type === 'limpieza';
    return true;
  });

  const activas   = roleFilteredTasks.filter(t => t.status !== 'resuelta');
  const historial  = roleFilteredTasks.filter(t => t.status === 'resuelta');

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

    // Guardar en la tabla room_status de Supabase (las marcadas como 'limpia' pasan automáticamente a 'disponible')
    const statusToSave = newStatus === 'limpia' ? 'disponible' : newStatus;
    const res = await fetch('/api/room-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_number: roomNumber,
        status: statusToSave,
        updated_by: operatorName
      }),
    });
    
    const json = await res.json();
    if (json.success) {
      setSuccessMsg(`Habitación ${roomNumber} marcada como ${statusToSave}`);
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
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await compressImage(file);
    setImagePreview(b64);
  };

  const submit = async () => {
    if (!form.description.trim()) return;
    setSubmitting(true);

    const emp = getActiveEmployee(currentDept);
    const operatorName = emp ? `${emp.full_name} (${emp.employee_num})` : staffName;

    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, reported_by: operatorName, direction: 'staff_to_admin', image_base64: imagePreview }),
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
            details: `Reportó daño técnico/incidencia en Habitación ${form.room}: ${form.description}`
          })
        });
      } catch (e) {
        console.error('Error registrando log de reporte mtto:', e);
      }
    }

    setForm({ type: isMantenimiento ? 'mantenimiento' : 'limpieza', room: ROOMS[0], description: '' });
    setImagePreview(null);
    setShowForm(false);
    setSuccessMsg('¡Reporte enviado con éxito!');
    fetchData();
    setTimeout(() => setSuccessMsg(''), 3000);
    setSubmitting(false);
  };

  const openMaintenanceReport = () => {
    setForm({ type: 'mantenimiento', room: ROOMS[0], description: '' });
    setImagePreview(null);
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

          <button 
            onClick={() => setMainTab('inventario')} 
            className={`flex-1 py-3 text-[13px] font-black rounded-xl transition-all cursor-pointer ${mainTab === 'inventario' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
          >
            Inventario
          </button>
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

            {/* Salidas de Hoy / Limpiezas Requeridas */}
            {!isMantenimiento && (
              <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-600" strokeWidth={2.5} />
                  <span className="text-[13px] font-extrabold text-zinc-800">Limpiezas Programadas (Check-outs)</span>
                </div>
                
                {salidas.length === 0 ? (
                  <div className="p-6 text-center text-zinc-400 text-[13px] font-semibold">
                    No hay salidas programadas para hoy.
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {salidas.map((r) => {
                      const cleaned = isRoomClean(r.room || '');
                      
                      // Extraer número de habitación de forma robusta
                      const m = (r.room || '').match(/(\d{3})/);
                      const roomNum = m ? m[1] : (r.room || '');
                      const dbStatus = roomStatuses.find(rs => rs.room_number === roomNum);
                      const currentStatus = dbStatus?.status || 'disponible';
                      const checkoutDone = currentStatus === 'en_limpieza';

                      return (
                        <div key={r.id} className="p-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              cleaned 
                                ? 'bg-emerald-50 text-emerald-600' 
                                : checkoutDone 
                                  ? 'bg-emerald-50 border border-emerald-100 text-emerald-600 animate-pulse' 
                                  : 'bg-amber-50 text-amber-600'
                            }`}>
                              {cleaned ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[14px] font-bold text-zinc-900 leading-tight">Hab. {r.room || 'Sin asignar'}</p>
                              {cleaned ? (
                                <p className="text-[12px] font-semibold text-emerald-600 mt-0.5">✓ Habitación Lista para Check-in</p>
                              ) : checkoutDone ? (
                                <p className="text-[12px] font-extrabold text-emerald-600 mt-0.5 flex items-center gap-1 animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  Salida Confirmada · Vacía (Entrar ya)
                                </p>
                              ) : (
                                <p className="text-[12px] font-bold text-rose-500 mt-0.5 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                                  Ocupada · Esperando entrega de llaves
                                </p>
                              )}
                            </div>
                          </div>
                          
                          {cleaned ? (
                            <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 flex items-center gap-1">
                              ✓ Lista
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                if (!checkoutDone) {
                                  const force = window.confirm(
                                    `⚠️ ATENCIÓN DE SEGURIDAD OPERATIVA:\n\nEl huésped de la Habitación ${roomNum} no ha entregado llaves formalmente en Recepción.\n\n¿Confirmas que la habitación ya está físicamente vacía y deseas forzar la firma de limpieza?`
                                  );
                                  if (!force) return;
                                }
                                runWithSignature(
                                  'room_status', 
                                  (payload) => changeRoomStatus(payload.room, payload.status), 
                                  { room: r.room, status: 'limpia' }
                                );
                              }}
                              className={`text-white text-[11px] font-black tracking-wide uppercase px-3 py-2 rounded-xl transition-all cursor-pointer shadow-sm active:scale-95 ${
                                checkoutDone 
                                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-100' 
                                  : 'bg-zinc-400 hover:bg-zinc-500 shadow-zinc-100 opacity-80'
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

                <div className="p-3 bg-zinc-50 border-b border-zinc-100 flex gap-2">
                  <button 
                    onClick={() => setTaskTab('activas')} 
                    className={`flex-1 py-2 text-[11px] font-black rounded-lg transition-all ${taskTab === 'activas' ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/50' : 'text-zinc-400'}`}
                  >
                    Activas ({activas.length})
                  </button>
                  <button 
                    onClick={() => setTaskTab('historial')} 
                    className={`flex-1 py-2 text-[11px] font-black rounded-lg transition-all ${taskTab === 'historial' ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/50' : 'text-zinc-400'}`}
                  >
                    Historial ({historial.length})
                  </button>
                </div>

                {taskTab === 'activas' ? (
                  activas.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                      <CheckCircle2 size={24} className="text-emerald-500" />
                      <p className="text-[12px] font-semibold text-zinc-400">Sin incidencias técnicas activas</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {activas.map((t) => {
                        const cfg = TYPE_CFG[t.type] || TYPE_CFG.otro;
                        const Icon = cfg.icon;
                        return (
                          <div key={t.id} className="p-4 space-y-3">
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

                            <p className="text-[13px] text-zinc-650 leading-relaxed pl-1">{t.description}</p>

                            {t.image_base64 && (
                              <div className="rounded-2xl overflow-hidden border border-zinc-200">
                                <img src={t.image_base64} alt="Evidencia" className="w-full max-h-48 object-cover" />
                              </div>
                            )}

                            <div className="flex gap-2 pt-1">
                              <button 
                                onClick={() => runWithSignature('resolve_task', (status) => updateTaskStatus(t.id, status), 'en_proceso')}
                                className={`flex-1 py-2 rounded-xl text-[11px] font-black border transition-all cursor-pointer ${t.status === 'en_proceso' ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-zinc-200 text-zinc-500'}`}
                              >
                                En Proceso
                              </button>
                              <button 
                                onClick={() => runWithSignature('resolve_task', (status) => updateTaskStatus(t.id, status), 'resuelta')}
                                className="flex-1 py-2 rounded-xl text-[11px] font-black bg-emerald-600 text-white hover:bg-emerald-500 transition-all cursor-pointer"
                              >
                                ✓ Resolver
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  historial.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                      <Clock size={24} className="text-zinc-300" />
                      <p className="text-[12px] font-semibold text-zinc-400">Historial vacío</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100 bg-zinc-50/50">
                      {historial.map((t) => {
                        const cfg = TYPE_CFG[t.type] || TYPE_CFG.otro;
                        const Icon = cfg.icon;
                        return (
                          <div key={t.id} className="p-4 space-y-2 opacity-85">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-zinc-200 flex items-center justify-center shrink-0">
                                  <Icon size={12} className="text-zinc-600" />
                                </div>
                                <span className="text-[12px] font-bold text-zinc-650">{cfg.label}</span>
                                <span className="text-[11px] font-bold text-zinc-400 bg-white px-2 py-0.5 rounded-md border border-zinc-150">Hab. {t.room}</span>
                              </div>
                              <span className="text-[10px] font-semibold text-zinc-400">{elapsed(t.created_at)}</span>
                            </div>
                            <p className="text-[12px] text-zinc-400 italic pl-1">{t.description}</p>
                            <div className="flex items-center gap-1 text-[11px] font-black text-emerald-600 pl-1">
                              <CheckCheck size={14} />
                              <span>Resuelto por {t.reported_by}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            ) : (
              // BÁNNER INFORMATIVO Y HERMOSO SI ES CLEANER / RECEPCIÓN (ELIMINA EL RUIDO VISUAL)
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

              {/* Leyenda de Estados */}
              <div className="flex gap-2 flex-wrap text-[10px] font-black tracking-wide uppercase">
                <span className="px-2 py-1 rounded bg-zinc-100 border border-zinc-200 text-zinc-600">Disponible</span>
                <span className="px-2 py-1 rounded bg-amber-50 border border-amber-200 text-amber-700 animate-pulse">En Limpieza</span>
                <span className="px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-700">Limpia</span>
              </div>

              {/* Grid Interactivo */}
              <div className="grid grid-cols-3 gap-2">
                {ROOMS.map((r) => {
                  const stateInfo = getRoomState(r);
                  let stateStyle = 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50';
                  let badge = '';

                  if (stateInfo.status === 'en_limpieza') {
                    stateStyle = 'bg-gradient-to-br from-amber-50 to-orange-50/70 border-amber-200 text-amber-700 shadow-sm shadow-amber-50';
                    badge = 'bg-amber-500';
                  } else if (stateInfo.status === 'limpia') {
                    stateStyle = 'bg-gradient-to-br from-emerald-50 to-teal-50/70 border-emerald-200 text-emerald-700 shadow-sm shadow-emerald-50';
                    badge = 'bg-emerald-500';
                  }

                  return (
                    <button
                      key={r}
                      onClick={() => {
                        if (canModifyStatus) {
                          setSelectedRoom(r);
                          setShowStatusModal(true);
                        }
                      }}
                      disabled={!canModifyStatus}
                      className={`relative border rounded-2xl p-3 flex flex-col justify-between h-20 text-left transition-all ${stateStyle} ${canModifyStatus ? 'active:scale-95 cursor-pointer' : 'opacity-90 cursor-default'}`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[14px] font-black leading-none">{r}</span>
                        {badge && (
                          <span className="relative flex h-2 w-2">
                            {stateInfo.status === 'en_limpieza' && (
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            )}
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${badge}`}></span>
                          </span>
                        )}
                      </div>

                      <div className="space-y-0.5">
                        <p className="text-[9px] font-black uppercase opacity-80 leading-none truncate">
                          {stateInfo.status === 'en_limpieza' ? 'En Limpieza' : stateInfo.status === 'limpia' ? 'Limpia' : 'Disponible'}
                        </p>
                        {stateInfo.guest_name && (
                          <p className="text-[8px] font-bold text-zinc-400 truncate leading-none max-w-[80px]">
                            {stateInfo.guest_name}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── SECCIÓN 3: CONTROL DE INVENTARIO ── */}
        {mainTab === 'inventario' && (
          <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-2">
              <Package size={16} className="text-zinc-650" />
              <span className="text-[13px] font-extrabold text-zinc-800">Control de Insumos</span>
            </div>

            <div className="divide-y divide-zinc-150">
              {inventory.map((item, index) => {
                const isLow = item.stock <= item.min_stock;
                return (
                  <div key={item.id} className={`p-4 flex items-center justify-between gap-3 ${isLow ? 'bg-rose-50/60' : 'bg-white'}`}>
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-zinc-900 leading-tight">{item.item_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-md border border-zinc-200/50 uppercase">{item.category}</span>
                        <p className={`text-[11px] font-bold ${isLow ? 'text-rose-600' : 'text-zinc-400'}`}>
                          Stock: {item.stock} <span className="opacity-60">(Min: {item.min_stock})</span>
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 bg-zinc-100 p-1.5 rounded-xl border border-zinc-200/60 shrink-0">
                      <button 
                        onClick={() => updateStock(item.id, item.stock, -1)} 
                        disabled={item.stock === 0} 
                        className="w-8 h-8 rounded-lg bg-white border border-zinc-200 text-zinc-600 flex items-center justify-center cursor-pointer active:scale-90 transition-transform disabled:opacity-40"
                      >
                        <Minus size={14} strokeWidth={2.5} />
                      </button>
                      <span className="w-8 text-center text-sm font-black text-zinc-950">{item.stock}</span>
                      <button 
                        onClick={() => updateStock(item.id, item.stock, 1)} 
                        className="w-8 h-8 rounded-lg bg-zinc-950 text-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
                      >
                        <Plus size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── NOTIFICACIONES TOAST ── */}
      {successMsg && (
        <div className="fixed bottom-6 left-4 right-4 z-[9000] animate-in fade-in slide-in-from-bottom-5">
          <div className="bg-zinc-900 text-white text-[13px] font-bold px-5 py-3.5 rounded-2xl text-center shadow-xl flex items-center justify-center gap-2 max-w-md mx-auto border border-zinc-800">
            <CheckCheck size={16} className="text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        </div>
      )}

      {/* ── MODAL REPORTE DE INCIDENCIA (BOTTOM SHEET PREMIUM) ── */}
      {showForm && (
        <div className="fixed inset-0 z-[9999] flex flex-col justify-end bg-zinc-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div onClick={() => setShowForm(false)} className="absolute inset-0" />
          <div className="relative bg-white rounded-t-[32px] shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-300 w-full max-w-md mx-auto">
            
            {/* Tirador */}
            <div className="flex justify-center py-3 flex-shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-zinc-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 pb-4 border-b border-zinc-100 flex-shrink-0">
              <h3 className="text-lg font-black text-zinc-900 flex items-center gap-2">
                <Wrench size={18} className="text-rose-600" />
                Reportar Daño Técnico
              </h3>
              <button 
                onClick={() => setShowForm(false)} 
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 cursor-pointer hover:bg-zinc-200"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </div>

            {/* Contenido Scrollable */}
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              
              {/* Tipo de Tarea */}
              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2.5">Tipo de Incidencia</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {(['limpieza', 'mantenimiento', 'otro'] as const).map((k) => {
                    const cfg = TYPE_CFG[k];
                    const Icon = cfg.icon;
                    const active = form.type === k;
                    return (
                      <button 
                        key={k}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, type: k }))}
                        className={`flex flex-col items-center gap-2 py-3 rounded-2xl border-2 transition-all cursor-pointer ${active ? `${cfg.bg} ${cfg.border} ${cfg.text}` : 'border-zinc-100 bg-zinc-50/50 text-zinc-400'}`}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${active ? 'bg-white shadow-sm' : 'bg-zinc-100'}`}>
                          <Icon size={15} className={active ? cfg.text : 'text-zinc-400'} />
                        </div>
                        <span className="text-[11px] font-black">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Habitación */}
              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Habitación / Ubicación</label>
                <div className="relative">
                  <select 
                    value={form.room} 
                    onChange={e => setForm(f => ({ ...f, room: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-3.5 px-4 pr-10 text-[14px] font-bold text-zinc-900 outline-none appearance-none focus:ring-2 focus:ring-zinc-950/5"
                  >
                    {ROOMS.map(r => <option key={r} value={r}>Habitación {r}</option>)}
                  </select>
                  <ChevronDown size={16} className="text-zinc-450 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Descripción del Daño</label>
                <textarea 
                  required
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detalla qué está fallando (ej. gotea grifo del baño)..."
                  rows={3}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-3.5 px-4 text-[14px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-950/5 resize-none leading-relaxed"
                />
              </div>

              {/* Foto Evidencia */}
              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Foto de la Falla (Opcional)</label>
                <input 
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImage}
                  className="hidden"
                />
                {imagePreview ? (
                  <div className="relative rounded-2xl overflow-hidden border border-zinc-200">
                    <img src={imagePreview} alt="Evidencia" className="w-full h-40 object-cover" />
                    <button 
                      type="button"
                      onClick={() => setImagePreview(null)}
                      className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white cursor-pointer hover:bg-black/80"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button 
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full border-2 border-dashed border-zinc-200 bg-zinc-50 hover:bg-zinc-100/50 rounded-2xl py-5 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-zinc-500 transition-colors"
                  >
                    <Camera size={20} className="text-zinc-450" />
                    <span className="text-[12px] font-bold">Tomar foto o subir de galería</span>
                  </button>
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

            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CAMBIAR ESTADO DE HABITACIÓN (BOTTOM SHEET SELECCIÓN RÁPIDA) ── */}
      {showStatusModal && selectedRoom && (
        <div className="fixed inset-0 z-[9999] flex flex-col justify-end bg-zinc-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div onClick={() => setShowStatusModal(false)} className="absolute inset-0" />
          <div className="relative bg-white rounded-t-[32px] shadow-2xl p-6 space-y-6 animate-in slide-in-from-bottom-8 duration-300 w-full max-w-md mx-auto">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-zinc-900">Habitación {selectedRoom}</h3>
                <p className="text-[11px] text-zinc-450 font-bold mt-0.5">Asignar estatus operativo real</p>
              </div>
              <button 
                onClick={() => setShowStatusModal(false)} 
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-505 cursor-pointer hover:bg-zinc-200"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </div>

            {/* Opciones */}
            <div className="space-y-3">
              {[
                { id: 'disponible', title: 'Disponible', desc: 'Habitación limpia, lista para huéspedes y libre de detalles.', color: 'border-zinc-200 hover:bg-zinc-50 text-zinc-800' },
                { id: 'en_limpieza', title: 'En Limpieza', desc: 'El personal de limpieza está trabajando actualmente en la unidad.', color: 'border-amber-200 bg-amber-50/10 hover:bg-amber-50/30 text-amber-800' },
                { id: 'limpia', title: 'Limpia (Inspeccionada)', desc: 'Unidad completamente aseada, sanitizada e inspeccionada.', color: 'border-emerald-200 bg-emerald-50/10 hover:bg-emerald-50/30 text-emerald-800' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => runWithSignature('room_status', (payload) => changeRoomStatus(payload.room, payload.status), { room: selectedRoom, status: opt.id as any })}
                  className={`w-full text-left p-4 border-2 rounded-2xl flex flex-col justify-center transition-all cursor-pointer active:scale-[0.99] ${opt.color}`}
                >
                  <span className="text-[14px] font-black leading-tight">{opt.title}</span>
                  <span className="text-[11px] opacity-75 font-semibold mt-1 leading-snug">{opt.desc}</span>
                </button>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* Modal táctil de autenticación de empleado */}
      <EmployeeModal
        isOpen={showEmployeeModal}
        onClose={() => {
          setShowEmployeeModal(false);
          setPendingAction(null);
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
