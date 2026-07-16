"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Bell, CheckCheck, Wrench, Sparkles, AlertTriangle, X, Clock,
  Plus, Send, ChevronDown, Image as ImageIcon,
  BedDouble, Lock, MessageCircle, Wallet, ArrowDownLeft, ArrowUpRight,
  CheckCircle2, UserCheck, Package, Search, Calendar, ChevronRight,
  SlidersHorizontal, AlertCircle, RefreshCw
} from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type EventType = 'checkin' | 'checkout' | 'booking' | 'block' | 'conflict' | 'bot' | 'finanzas' | 'tarea' | 'sesion' | 'inventario';

interface Task {
  id: string;
  type: string;
  room: string;
  description: string;
  status: string;
  reported_by: string;
  direction: string;
  created_at: string;
  resolved_at?: string;
  image_base64?: string;
}

interface HistoryEvent {
  id: string;
  type: EventType;
  title: string;
  desc: string;
  time: string;
  date: string;
  rawDate: string;
  module: string;
  employee_name: string;
  details: string;
  room?: string;
  rawLog: any;
  parsed?: any;
}

const TYPE_CONFIG: Record<string, { label: string; dot: string; textColor: string; bgColor: string; borderColor: string }> = {
  limpieza:      { label: 'Limpieza',      dot: '#f59e0b', textColor: '#b45309', bgColor: '#fffbeb', borderColor: '#fde68a' },
  mantenimiento: { label: 'Mantenimiento', dot: '#ef4444', textColor: '#b91c1c', bgColor: '#fef2f2', borderColor: '#fecaca' },
  otro:          { label: 'Otro',          dot: '#3b82f6', textColor: '#1d4ed8', bgColor: '#eff6ff', borderColor: '#bfdbfe' },
  aviso:         { label: 'Aviso Admin',   dot: '#8b5cf6', textColor: '#6d28d9', bgColor: '#f5f3ff', borderColor: '#ddd6fe' },
};

const LOG_CFG: Record<string, { label: string; dot: string; textColor: string; bgColor: string; borderColor: string; icon: React.ElementType }> = {
  checkin:    { label: 'Check-In',      dot: '#10b981', textColor: '#047857', bgColor: '#ecfdf5', borderColor: '#a7f3d0', icon: ArrowDownLeft },
  checkout:   { label: 'Check-Out',     dot: '#6b7280', textColor: '#374151', bgColor: '#f9fafb', borderColor: '#e5e7eb', icon: ArrowUpRight },
  booking:    { label: 'Reserva',       dot: '#3b82f6', textColor: '#1d4ed8', bgColor: '#eff6ff', borderColor: '#bfdbfe', icon: BedDouble },
  block:      { label: 'Bloqueo',       dot: '#ef4444', textColor: '#b91c1c', bgColor: '#fef2f2', borderColor: '#fecaca', icon: Lock },
  conflict:   { label: 'Conflicto',     dot: '#ef4444', textColor: '#b91c1c', bgColor: '#fef2f2', borderColor: '#fecaca', icon: AlertTriangle },
  bot:        { label: 'Jaroje Bot',    dot: '#8b5cf6', textColor: '#6d28d9', bgColor: '#f5f3ff', borderColor: '#ddd6fe', icon: MessageCircle },
  finanzas:   { label: 'Contabilidad',  dot: '#10b981', textColor: '#047857', bgColor: '#ecfdf5', borderColor: '#a7f3d0', icon: Wallet },
  tarea:      { label: 'Incidencia',    dot: '#ef4444', textColor: '#b91c1c', bgColor: '#fef2f2', borderColor: '#fecaca', icon: Wrench },
  sesion:     { label: 'Sesión / Firma',dot: '#3b82f6', textColor: '#1d4ed8', bgColor: '#eff6ff', borderColor: '#bfdbfe', icon: UserCheck },
  inventario: { label: 'Almacén',       dot: '#f59e0b', textColor: '#b45309', bgColor: '#fffbeb', borderColor: '#fde68a', icon: Package },
};

const ICONS: Record<string, React.ElementType> = {
  limpieza: Sparkles, mantenimiento: Wrench, otro: AlertTriangle, aviso: Bell,
};

const ROOMS = ['General', '101','102','103','104','105','106','107','201','202','203','204','205','206','301','302','303','304','305','306','401','402','500','501','502','503','504','505','506'];

function elapsed(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1)  return 'Ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `hace ${hrs}h` : `hace ${Math.floor(hrs / 24)}d`;
}

function parseLogDetails(detailsStr: string | null | undefined): { text: string; parsed: any } {
  if (!detailsStr) return { text: '', parsed: null };
  const trimmed = detailsStr.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);
      return {
        text: obj.text || detailsStr,
        parsed: obj
      };
    } catch (e) {
      // Fallback
    }
  }
  
  const lowerDetails = detailsStr.toLowerCase();
  if (lowerDetails.includes('movimiento contable') || lowerDetails.includes('traspaso') || lowerDetails.includes('pago')) {
    const isIngreso = lowerDetails.includes('ingreso') || lowerDetails.includes('recibió pago') || lowerDetails.includes('recibido');
    const isGasto = lowerDetails.includes('gasto') || lowerDetails.includes('enviado');
    const isTraspaso = lowerDetails.includes('traspaso');
    let type = isIngreso ? 'ingreso' : isGasto ? 'gasto' : isTraspaso ? 'traspaso' : 'gasto';
    
    const amountMatch = detailsStr.match(/\$(\d+(?:\.\d+)?)/);
    const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;
    
    let account = 'General';
    const accMatch = detailsStr.match(/(?:cuenta|desde|sobre)\s+([A-Za-záéíóúüñ0-9\s]+?)(?:\s+\(|,|\.|\s+a\s+|$)/i);
    if (accMatch) account = accMatch[1].trim();
    
    let category = 'Ajuste';
    const catMatch = detailsStr.match(/\(([A-Za-záéíóúüñ\s]+)\)/);
    if (catMatch) category = catMatch[1].trim();
    
    return {
      text: detailsStr,
      parsed: {
        finance: { type, amount, account, category, description: detailsStr }
      }
    };
  }
  
  if (lowerDetails.includes('tarea') || lowerDetails.includes('incidencia') || lowerDetails.includes('daño técnico')) {
    const isResuelta = lowerDetails.includes('resuelta') || lowerDetails.includes('resolución') || lowerDetails.includes('resuel');
    const isEnProceso = lowerDetails.includes('proceso') || lowerDetails.includes('inició');
    const isPendiente = lowerDetails.includes('pendiente');
    let status = isResuelta ? 'resuelta' : isEnProceso ? 'en_proceso' : isPendiente ? 'pendiente' : 'nuevo';
    
    let comments = '';
    const commentsMatch = detailsStr.match(/(?:cierre|comentarios de cierre:)\s*(.+)/i);
    if (commentsMatch) comments = commentsMatch[1].trim();
    
    return {
      text: detailsStr,
      parsed: {
        task: { status, comments, description: detailsStr }
      }
    };
  }

  if (lowerDetails.includes('walk-in') || lowerDetails.includes('check-in') || lowerDetails.includes('check-out') || lowerDetails.includes('reserva')) {
    const isCheckIn = lowerDetails.includes('check-in') || lowerDetails.includes('checkin');
    const isCheckOut = lowerDetails.includes('check-out') || lowerDetails.includes('checkout');
    const isWalkIn = lowerDetails.includes('walk-in');
    
    return {
      text: detailsStr,
      parsed: {
        reserva: {
          guestName: detailsStr.replace(/Registró (?:Walk-In|Check-In|Check-Out) de\s*/i, '').trim(),
          isCheckIn,
          isCheckOut,
          isWalkIn,
          channel: isWalkIn ? 'Recepción' : 'Directo'
        }
      }
    };
  }
  
  return { text: detailsStr, parsed: null };
}

const mapLogsToEvents = (logsData: any[]): HistoryEvent[] => {
  return logsData.map((log: any) => {
    const actionLower = (log.action || '').toLowerCase();
    const moduleLower = (log.module || '').toLowerCase();
    
    let type: EventType = 'booking';
    if (actionLower.includes('checkin') || actionLower.includes('check-in')) {
      type = 'checkin';
    } else if (actionLower.includes('checkout') || actionLower.includes('check-out')) {
      type = 'checkout';
    } else if (actionLower.includes('finan') || actionLower.includes('movimiento') || actionLower.includes('transac') || actionLower.includes('pago') || actionLower.includes('nomina')) {
      type = 'finanzas';
    } else if (actionLower.includes('incidencia') || actionLower.includes('limpieza') || actionLower.includes('mantenimiento') || actionLower.includes('tarea')) {
      type = 'tarea';
    } else if (actionLower.includes('sesion') || actionLower.includes('turno') || actionLower.includes('firma')) {
      type = 'sesion';
    } else if (moduleLower.includes('inventario') || actionLower.includes('stock') || actionLower.includes('articulo') || actionLower.includes('almacen')) {
      type = 'inventario';
    } else if (actionLower.includes('bloqueo') || actionLower.includes('block')) {
      type = 'block';
    } else if (actionLower.includes('bot') || moduleLower.includes('bot') || moduleLower.includes('webhook')) {
      type = 'bot';
    } else if (actionLower.includes('conflicto') || actionLower.includes('canal') || actionLower.includes('error')) {
      type = 'conflict';
    }
    
    const d = new Date(log.created_at);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    let dateStr = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    if (d.toDateString() === today.toDateString()) {
      dateStr = 'Hoy';
    } else if (d.toDateString() === yesterday.toDateString()) {
      dateStr = 'Ayer';
    }
    
    const timeStr = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
    const rawDateStr = log.created_at.split('T')[0];
    
    let rawAction = log.action;
    const friendlyActions: Record<string, string> = {
      // Sesiones y Turnos
      'inicio_sesion_turno': 'Inicio de Turno',
      'inicio_sesion': 'Inicio de Sesión',
      'start_new_chat': 'Chat Iniciado 💬',
      // Reservas
      'check_in': 'Check-In Procesado 🔑',
      'check_in_procesado': 'Check-In Guardado 🔑',
      'check_out': 'Check-Out Procesado 🚪',
      'revert_checkin': 'Check-In Revertido ↩️',
      'reserva_creada': 'Nueva Reserva Manual 📅',
      'reserva_creada_webhook': 'Nueva Reserva Recibida 📥',
      'reserva_modificada': 'Reserva Modificada ✏️',
      'reserva_modificada_admin': 'Reserva Modificada (Admin) ✏️',
      'reserva_cancelada': 'Reserva Cancelada ✕',
      'reserva_enterado': 'Reserva Enterada ✅',
      'reasignacion_habitacion': 'Habitación Reasignada 🔁',
      'bloqueo_habitacion': 'Bloqueo Físico de Unidad 🔒',
      'walk_in': 'Reserva Walk-In Registrada 🚶',
      // Finanzas y Caja
      'movimiento_financiero': 'Movimiento de Caja 💵',
      'payment_received': 'Pago Registrado 💰',
      'abono_registrado': 'Abono Registrado 💰',
      'abono_grupal_registrado': 'Abono Grupal Registrado 💰',
      'payment_reconciled': 'Pago Conciliado ✅',
      'renombrar_cuenta': 'Cuenta Renombrada ✏️',
      // Estancias
      'estancia_extendida': 'Estancia Extendida ⏳',
      'estancia_extendida_admin': 'Estancia Extendida (Admin) ⏳',
      // Mantenimiento
      'incidencia_mantenimiento': 'Incidencia Reportada 🛠',
      'report_maintenance': 'Daño Técnico Reportado 🛠',
      'cambio_estado_tarea': 'Estado de Tarea Modificado ⚙️',
      'cambio_estado_incidencia': 'Incidencia Actualizada ⚙️',
      'actualizacion_tarea': 'Tarea Actualizada ⚙️',
      'resolucion_mantenimiento': 'Incidencia Resuelta ✅',
      'eliminacion_tarea': 'Tarea Eliminada ✕',
      // Inventario
      'ajuste_stock': 'Ajuste de Almacén 📦',
      'nuevo_articulo': 'Artículo Creado 📦',
      'actualizacion_articulo': 'Parámetros Actualizados 📦',
      'eliminar_articulo': 'Artículo Eliminado ✕',
      // Otros / Bot
      'human_mode_activated': 'Ayuda Requerida (Bot Off) ⚠️',
      'toggle_archive': 'Chat Archivado/Desarchivado 📁',
      'toggle_mode': 'Modo Bot Alternado 🤖',
      'webhook_received': 'Notificación Recibida 📥',
      'change_room_status': 'Estado de Habitación Cambiado 🧹',
    };
    const friendlyTitle = friendlyActions[rawAction] || rawAction.replace(/_/g, ' ');

    let title = friendlyTitle;
    if (log.employee_name) {
      title = `${friendlyTitle} · ${log.employee_name}`;
    }
    
    const parsedInfo = parseLogDetails(log.details);
    
    let desc = parsedInfo.text || `${log.department || 'Sistema'} · Módulo: ${log.module}`;
    if (log.room && !desc.toLowerCase().includes('habitación') && !desc.toLowerCase().includes('habitacion')) {
      desc = `Habitación ${log.room} · ${desc}`;
    }
    
    return {
      id: String(log.id),
      type,
      title,
      desc,
      time: timeStr,
      date: dateStr,
      rawDate: rawDateStr,
      module: log.module || 'recepcion',
      employee_name: log.employee_name || 'Sistema',
      details: log.details || '',
      room: log.room || undefined,
      rawLog: log,
      parsed: parsedInfo.parsed
    };
  });
}

const resolveDeepLink = (log: any) => {
  const actionLower = (log.action || '').toLowerCase();
  const moduleLower = (log.module || '').toLowerCase();
  const detailsLower = (log.details || '').toLowerCase();
  
  const idMatch = log.details?.match(/(?:id|reserva|beds24|id_reserva)\s*#?[:\-]?\s*(\d{5,12})/i);
  
  if (
    actionLower.includes('sesion') || 
    actionLower.includes('turno') || 
    actionLower.includes('firma') || 
    actionLower.includes('inicio_sesion')
  ) {
    return null;
  }

  // SI TIENE UN ID DE RESERVA, PRIORIZAR ABRIR LA RESERVA ESPECÍFICA
  if (idMatch && idMatch[1]) {
    return `/reservas?id=${idMatch[1]}`;
  }

  if (
    moduleLower === 'mantenimiento' || 
    actionLower.includes('mantenimiento') || 
    actionLower.includes('maintenance') || 
    actionLower.includes('incidencia') || 
    actionLower.includes('tarea') || 
    actionLower.includes('task') ||
    detailsLower.includes('daño técnico') ||
    detailsLower.includes('mantenimiento')
  ) {
    return '/mantenimiento';
  }

  // Detección de Finanzas (se agrega 'payment' y 'abono')
  if (
    moduleLower === 'finanzas' || 
    actionLower.includes('finan') || 
    actionLower.includes('pago') || 
    actionLower.includes('payment') || 
    actionLower.includes('abono') || 
    actionLower.includes('transac')
  ) {
    return '/finanzas';
  }

  if (moduleLower === 'limpieza' || actionLower.includes('limpieza') || actionLower.includes('cambio_estado')) {
    return '/recepcion';
  }
  if (moduleLower === 'inventario' || actionLower.includes('inventario') || actionLower.includes('stock')) {
    return '/inventario';
  }
  if (moduleLower === 'equipo') {
    return '/equipo';
  }
  if (moduleLower === 'bot' || actionLower.includes('bot') || actionLower.includes('whatsapp')) {
    return '/bot';
  }
  
  // checkin/checkout/reserva general
  if (actionLower.includes('check') || actionLower.includes('reserv') || moduleLower === 'recepcion') {
    return '/reservas';
  }
  
  return null;
};

function lockBody() {
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.width = '100%';
}
function unlockBody() {
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.width = '';
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen]           = useState(false);
  const [tab, setTab]             = useState<'incidents' | 'history'>('history');
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [unread, setUnread]       = useState(0);
  const [resolving, setResolving] = useState<string | null>(null);
  const [mounted, setMounted]     = useState(false);
  const [sheetHeight, setSheetHeight] = useState<number | undefined>(undefined);
  const [logs, setLogs]           = useState<any[]>([]);
  const [events, setEvents]       = useState<HistoryEvent[]>([]);

  // Filtros reactivos
  const [searchQuery, setSearchQuery]     = useState('');
  const [moduleFilter, setModuleFilter]   = useState('todos');
  const [dateRangePill, setDateRangePill] = useState('todos');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Event Details Modal State
  const [selectedEventForModal, setSelectedEventForModal] = useState<HistoryEvent | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open) lockBody(); else unlockBody();
    return () => unlockBody();
  }, [open]);

  const playPremiumLogSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = ctx.currentTime;
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.type = 'sine';
      osc2.type = 'sine';
      
      osc1.frequency.setValueAtTime(659.25, now); // E5
      osc2.frequency.setValueAtTime(880.00, now + 0.12); // A5
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start(now);
      osc1.stop(now + 0.15);
      
      osc2.start(now + 0.1);
      osc2.stop(now + 0.5);
    } catch {}
  };

  const fetchTasks = useCallback(async () => {
    try {
      const res  = await fetch('/api/tasks');
      const json = await res.json();
      if (json.success) {
        setTasks(json.data);
      }
    } catch {}
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/employee-logs');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setLogs(json.data);
        setEvents(mapLogsToEvents(json.data));
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchLogs();

    const taskChannel = supabase
      .channel('tasks_bell_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    const logsChannel = supabase
      .channel('notification_bell_logs_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'employee_logs' },
        (payload: any) => {
          const newLog = payload.new;
          
          setLogs(prev => {
            if (prev.some(item => String(item.id) === String(newLog.id))) return prev;
            const updated = [newLog, ...prev];
            setEvents(mapLogsToEvents(updated));
            return updated;
          });

          setOpen(isOpen => {
            if (!isOpen) {
              setUnread(count => count + 1);
              playPremiumLogSound();
            }
            return isOpen;
          });
        }
      )
      .subscribe();

    const iv = setInterval(() => {
      fetchTasks();
      fetchLogs();
    }, 15_000);

    return () => {
      clearInterval(iv);
      supabase.removeChannel(taskChannel);
      supabase.removeChannel(logsChannel);
    };
  }, [fetchTasks, fetchLogs]);

  const handleOpen = () => {
    setSheetHeight(window.innerHeight * 0.85);
    setOpen(true);
    setTab('history');
    setUnread(0);
  };

  const resolve = async (id: string) => {
    setResolving(id);
    await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_status', id, status: 'resuelta' }),
    });
    await fetchTasks();
    setResolving(null);
  };

  const openEventDetails = (ev: HistoryEvent) => {
    setSelectedEventForModal(ev);
    setShowEventModal(true);
  };

  const incidentTasks = tasks.filter(t => t.direction === 'staff_to_admin' && t.status !== 'resuelta');

  // Filtros interactivos del historial
  const filteredEvents = events.filter(ev => {
    // 1. Filtro de Texto
    let matchText = true;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      matchText = 
        ev.title.toLowerCase().includes(q) ||
        ev.desc.toLowerCase().includes(q) ||
        ev.employee_name.toLowerCase().includes(q) ||
        ev.details.toLowerCase().includes(q) ||
        (ev.room && ev.room.includes(q)) ||
        ev.type.toLowerCase().includes(q);
    }

    // 2. Filtro de Módulo
    let matchModule = true;
    if (moduleFilter !== 'todos') {
      matchModule = ev.module.toLowerCase() === moduleFilter.toLowerCase() || ev.type === moduleFilter;
      if (moduleFilter === 'finanzas' && ev.type === 'finanzas') matchModule = true;
      if (moduleFilter === 'mantenimiento' && (ev.type === 'tarea' || ev.module === 'mantenimiento')) matchModule = true;
      if (moduleFilter === 'recepcion' && (ev.type === 'checkin' || ev.type === 'checkout' || ev.type === 'booking')) matchModule = true;
      if (moduleFilter === 'inventario' && (ev.type === 'inventario' || ev.module === 'inventario')) matchModule = true;
      if (moduleFilter === 'bot' && (ev.type === 'bot' || ev.module === 'bot')) matchModule = true;
    }

    // 3. Filtro de Fecha
    let matchDate = true;
    const evDate = new Date(ev.rawDate + 'T12:00:00Z');
    const today = new Date();
    today.setHours(12,0,0,0);

    if (dateRangePill === 'hoy') {
      matchDate = evDate.toDateString() === today.toDateString();
    } else if (dateRangePill === 'ayer') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      matchDate = evDate.toDateString() === yesterday.toDateString();
    } else if (dateRangePill === 'personalizado') {
      if (customStartDate) {
        const start = new Date(customStartDate + 'T12:00:00Z');
        matchDate = matchDate && (evDate >= start);
      }
      if (customEndDate) {
        const end = new Date(customEndDate + 'T12:00:00Z');
        matchDate = matchDate && (evDate <= end);
      }
    }

    return matchText && matchModule && matchDate;
  });

  const s = {
    overlay: { position: 'fixed' as const, inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column' as const, justifyContent: 'flex-end' },
    backdrop: { position: 'absolute' as const, inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' },
    panel: { position: 'relative' as const, background: 'white', borderRadius: '24px 24px 0 0', height: sheetHeight ? `${sheetHeight}px` : '85vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 -8px 40px rgba(0,0,0,0.15)', overflow: 'hidden' },
    handle: { display: 'flex', justifyContent: 'center', padding: '12px 0 4px', flexShrink: 0 as const },
    handleBar: { width: 40, height: 4, borderRadius: 9999, background: '#e4e4e7' },
  };

  const renderEventCard = (ev: HistoryEvent) => {
    const parsed = ev.parsed;
    
    // 1. Tarjeta Premium de Finanzas
    if (parsed?.finance) {
      const fin = parsed.finance;
      const isIngreso = fin.type === 'ingreso';
      const isTraspaso = fin.type === 'traspaso';
      const isReconciled = fin.type === 'reconciled';
      
      let bgCircle = 'bg-rose-50 text-rose-600 border-rose-100';
      let IconComponent = <ArrowUpRight size={16} strokeWidth={2.5} />;
      let amountColor = 'text-zinc-900';
      let prefix = '-';
      
      if (isIngreso) {
        bgCircle = 'bg-emerald-50 text-emerald-600 border-emerald-100';
        IconComponent = <ArrowDownLeft size={16} strokeWidth={2.5} />;
        amountColor = 'text-emerald-600';
        prefix = '+';
      } else if (isTraspaso) {
        bgCircle = 'bg-indigo-50 text-indigo-600 border-indigo-100';
        IconComponent = <RefreshCw size={14} strokeWidth={2.5} className="animate-spin duration-[10s]" />;
        amountColor = 'text-indigo-600';
        prefix = '';
      } else if (isReconciled) {
        bgCircle = 'bg-amber-50 text-amber-600 border-amber-100';
        IconComponent = <CheckCircle2 size={14} strokeWidth={2.5} />;
        amountColor = 'text-amber-600';
        prefix = '';
      }

      const rawDetailsText = typeof fin.description === 'string' ? fin.description : ev.desc;
      const cleanDetailsText = rawDetailsText.replace(/\[Synced:\s*B24\]/gi, '').replace(/\[Pending\s*Sync:\s*B24\]/gi, '').trim();

      return (
        <div
          key={ev.id}
          onClick={() => openEventDetails(ev)}
          className="p-3.5 flex flex-col gap-2 hover:bg-zinc-50/80 transition-colors cursor-pointer group border border-zinc-100 rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${bgCircle}`}>
                {IconComponent}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
                  <span className="text-[13px] font-bold text-zinc-900 leading-tight capitalize truncate">
                    {fin.category || (isTraspaso ? 'Traspaso de Fondos' : isReconciled ? 'Conciliación Beds24' : 'Finanzas')}
                  </span>
                  <span className="text-[9px] font-black uppercase bg-zinc-100 text-zinc-500 border border-zinc-200 px-1.5 py-0.5 rounded">
                    {fin.account || 'Caja'}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-zinc-500 line-clamp-1 leading-normal">
                  {cleanDetailsText}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col items-end shrink-0 ml-2">
              <span className={`text-[13px] font-black tracking-tight ${amountColor}`}>
                {prefix}MX${Math.round(fin.amount || 0).toLocaleString('es-MX')}
              </span>
              <span className="text-[9px] font-semibold text-zinc-400 mt-0.5">
                {ev.time}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-zinc-400 font-bold border-t border-zinc-100/50 pt-1.5">
            <span className="flex items-center gap-1">
              👤 Firma: <span className="text-zinc-650 capitalize truncate max-w-[80px]">{ev.employee_name}</span>
            </span>
            <span className="text-[8px] text-zinc-300 font-black tracking-wider uppercase">FINANZAS</span>
          </div>
        </div>
      );
    }

    // 2. Tarjeta Premium de Mantenimiento
    if (parsed?.mantenimiento || ev.type === 'tarea') {
      const mtto = parsed?.mantenimiento || { status: 'pendiente', description: ev.desc, resolutionComments: '' };
      const isResuelta = mtto.status === 'resuelta';
      const isEnProceso = mtto.status === 'en_proceso';
      const isPendiente = mtto.status === 'pendiente';
      const isEliminada = mtto.status === 'eliminada';
      
      let statusPill = 'bg-purple-50 text-purple-600 border-purple-100';
      let statusLabel = 'Nuevo';
      
      if (isResuelta) {
        statusPill = 'bg-emerald-50 text-emerald-600 border-emerald-100';
        statusLabel = 'Resuelta ✓';
      } else if (isEnProceso) {
        statusPill = 'bg-blue-50 text-blue-600 border-blue-100';
        statusLabel = 'En Proceso ⚡';
      } else if (isPendiente) {
        statusPill = 'bg-amber-50 text-amber-600 border-amber-100';
        statusLabel = 'Pendiente';
      } else if (isEliminada) {
        statusPill = 'bg-rose-50 text-rose-600 border-rose-100';
        statusLabel = 'Eliminada ✕';
      }

      return (
        <div
          key={ev.id}
          onClick={() => openEventDetails(ev)}
          className="p-3.5 flex flex-col gap-2.5 hover:bg-zinc-50/80 transition-colors cursor-pointer group border border-zinc-100 rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0">
              <Wrench size={16} strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${statusPill}`}>
                    {statusLabel}
                  </span>
                  <span className="text-[8px] font-black uppercase bg-zinc-100 text-zinc-550 border border-zinc-200 px-1.5 py-0.5 rounded">
                    Hab: {ev.room || 'Gral'}
                  </span>
                </div>
                <span className="text-[9px] font-semibold text-zinc-400">
                  {ev.time}
                </span>
              </div>
              
              <p className="text-[12px] font-bold text-zinc-900 leading-snug truncate">
                {mtto.description || ev.desc}
              </p>
              
              {mtto.resolutionComments && (
                <div className="mt-1.5 bg-emerald-50/40 border border-emerald-100/50 p-2 rounded-xl text-[10px] font-semibold text-emerald-800 leading-snug flex items-start gap-1">
                  <span className="shrink-0">🛠️</span>
                  <span><strong>Cierre:</strong> {mtto.resolutionComments}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-zinc-400 font-bold border-t border-zinc-100/50 pt-1.5">
            <span className="flex items-center gap-1">
              👤 Operador: <span className="text-zinc-650 capitalize truncate max-w-[80px]">{ev.employee_name}</span>
            </span>
            <span className="text-[8px] text-zinc-300 font-black tracking-wider uppercase">MANTENIMIENTO</span>
          </div>
        </div>
      );
    }

    // 3. Tarjeta Premium de Reservas
    if (parsed?.reserva || ev.type === 'booking' || ev.type === 'checkin' || ev.type === 'checkout' || ev.type === 'block') {
      const res = parsed?.reserva || { guestName: ev.desc, channel: 'Directo', isBlock: ev.type === 'block', price: 0, checkIn: '', checkOut: '' };
      const isBlock = res.isBlock || ev.type === 'block';
      
      let sourceBg = 'bg-zinc-100 text-zinc-800 border-zinc-200';
      if (res.channel === 'Airbnb') {
        sourceBg = 'bg-rose-50 text-rose-600 border-rose-100';
      } else if (res.channel === 'Booking.com') {
        sourceBg = 'bg-blue-50 text-blue-600 border-blue-100';
      } else if (res.channel === 'WhatsApp' || res.channel === 'WhatsApp Bot') {
        sourceBg = 'bg-emerald-50 text-emerald-600 border-emerald-100';
      }

      return (
        <div
          key={ev.id}
          onClick={() => openEventDetails(ev)}
          className="p-3.5 flex flex-col gap-2 hover:bg-zinc-50/80 transition-colors cursor-pointer group border border-zinc-100 rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${isBlock ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-indigo-50 border-indigo-100 text-indigo-600'}`}>
                <BedDouble size={16} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
                  <span className="text-[13px] font-bold text-zinc-900 leading-tight truncate max-w-[180px]">
                    {ev.title.split(' · ')[0]}
                  </span>
                  {!isBlock && (
                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${sourceBg}`}>
                      {res.channel}
                    </span>
                  )}
                  {isBlock && (
                    <span className="text-[8px] font-black uppercase bg-rose-100 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded">
                      Bloqueo Físico
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-medium text-zinc-500 block mt-0.5 truncate leading-tight">
                  {ev.desc}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col items-end shrink-0 ml-2">
              {!isBlock && res.price > 0 ? (
                <span className="text-[13px] font-black text-indigo-650">
                  MX${Math.round(res.price).toLocaleString('es-MX')}
                </span>
              ) : (
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  —
                </span>
              )}
              <span className="text-[9px] font-semibold text-zinc-400 mt-0.5">
                {ev.time}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-zinc-400 font-bold border-t border-zinc-100/50 pt-1.5">
            <span className="flex items-center gap-1">
              👤 Operador: <span className="text-zinc-650 capitalize truncate max-w-[80px]">{ev.employee_name}</span>
            </span>
            <span className="text-[8px] text-zinc-300 font-black tracking-wider uppercase">RECEPCIÓN</span>
          </div>
        </div>
      );
    }

    // 4. Tarjeta Fallback
    const cfg = LOG_CFG[ev.type] || LOG_CFG.booking;
    const Icon = cfg.icon;

    return (
      <div
        key={ev.id}
        onClick={() => openEventDetails(ev)}
        className="p-3.5 flex items-center gap-3 hover:bg-zinc-50/80 transition-colors cursor-pointer group border border-zinc-100 rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${cfg.bgColor} ${cfg.borderColor}`}>
          <Icon size={16} color={cfg.textColor} strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 justify-between">
            <p className="text-[13px] font-bold text-zinc-900 leading-tight truncate">{ev.title.split(' · ')[0]}</p>
            <span className="text-[9px] font-semibold text-zinc-400 shrink-0">{ev.time}</span>
          </div>
          <p className="text-[11px] font-medium text-zinc-500 mt-0.5 truncate">{ev.desc}</p>
        </div>
        <ChevronRight size={14} className="text-zinc-300 group-hover:translate-x-0.5 transition-transform" />
      </div>
    );
  };

  const sheet = open && (
    <div style={s.overlay}>
      <div onClick={() => setOpen(false)} style={s.backdrop} />
      <div style={s.panel}>
        <div style={s.handle}><div style={s.handleBar} /></div>

        {/* Header */}
        <div style={{ padding: '16px 20px 16px', borderBottom: '1px solid #f4f4f5', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#18181b', margin: 0 }}>Centro de Actividad & Notificaciones</p>
            <button onClick={() => setOpen(false)} style={{ width: 32, height: 32, borderRadius: 10, background: '#f4f4f5', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={15} color="#71717a" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: tab === 'history' ? 0 : '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── TAB: Incidencias del staff ── */}
          {tab === 'incidents' && (
            incidentTasks.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCheck size={24} color="#22c55e" />
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#3f3f46', margin: 0 }}>Todo en orden</p>
                <p style={{ fontSize: 12, color: '#a1a1aa', margin: 0 }}>Sin incidencias del personal</p>
              </div>
            ) : (
              incidentTasks.map(task => {
                const cfg = TYPE_CONFIG[task.type] || TYPE_CONFIG.otro;
                const Icon = ICONS[task.type] || AlertTriangle;
                return (
                  <div key={task.id} style={{ borderRadius: 16, border: `1.5px solid ${cfg.borderColor}`, background: cfg.bgColor, overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{ height: 3, background: cfg.dot }} />
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 10, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                          <Icon size={14} color={cfg.textColor} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: cfg.textColor }}>{cfg.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#71717a', background: 'white', padding: '2px 8px', borderRadius: 999, border: '1px solid #e4e4e7' }}>Hab. {task.room}</span>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={10} color="#a1a1aa" />
                          <span style={{ fontSize: 10, color: '#a1a1aa' }}>{elapsed(task.created_at)}</span>
                        </div>
                      </div>
                      {task.description && (
                        <p style={{ fontSize: 13, color: '#52525b', lineHeight: 1.5, margin: '0 0 10px', paddingLeft: 38 }}>{task.description}</p>
                      )}
                      {task.image_base64 && (
                        <div style={{ paddingLeft: 38, marginBottom: 10 }}>
                          <img src={task.image_base64} alt="Foto incidencia" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 12, border: '1px solid #e4e4e7' }} />
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 20, height: 20, borderRadius: 999, background: '#e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#52525b', textTransform: 'uppercase' as const }}>
                            {task.reported_by.charAt(0)}
                          </div>
                          <span style={{ fontSize: 11, color: '#a1a1aa' }}>{task.reported_by}</span>
                        </div>
                        <button onClick={() => resolve(task.id)} disabled={resolving === task.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#22c55e', color: 'white', fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', opacity: resolving === task.id ? 0.6 : 1, marginLeft: 'auto' }}>
                          <CheckCheck size={13} />
                          {resolving === task.id ? 'Resolviendo...' : 'Resolver'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          )}

          {/* ── TAB: Historial de Actividad (Rico en Filtros sticky y Tarjetas SaaS) ── */}
          {tab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              {/* STICKY FILTERS PANEL */}
              <div className="sticky top-0 bg-white border-b border-zinc-100 p-4 space-y-3.5 z-20 flex-shrink-0 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                
                {/* Search query input */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar auditoría (habitación, firma, acción)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-8 py-2 outline-none text-[12px] font-medium text-zinc-900 focus:ring-2 focus:ring-zinc-900/10 placeholder-zinc-400 transition-all"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Modules horizontal carousel tabs */}
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }} className="no-scrollbar">
                  {[
                    { id: 'todos', label: 'Todos' },
                    { id: 'finanzas', label: 'Finanzas' },
                    { id: 'mantenimiento', label: 'Mantenimiento' },
                    { id: 'recepcion', label: 'Recepción' },
                    { id: 'inventario', label: 'Almacén' },
                    { id: 'bot', label: 'WhatsApp' }
                  ].map(pill => {
                    const active = moduleFilter === pill.id;
                    return (
                      <button
                        key={pill.id}
                        onClick={() => setModuleFilter(pill.id)}
                        style={{
                          whiteSpace: 'nowrap',
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '6px 12px',
                          borderRadius: 8,
                          border: active ? '1.5px solid transparent' : '1.5px solid #e4e4e7',
                          background: active ? '#18181b' : 'white',
                          color: active ? 'white' : '#52525b',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {pill.label}
                      </button>
                    );
                  })}
                </div>

                {/* Date range filter pills + Custom date fields */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { id: 'todos', label: 'Cualquier Fecha' },
                    { id: 'hoy', label: 'Hoy' },
                    { id: 'personalizado', label: 'Personalizado' }
                  ].map(dp => {
                    const active = dateRangePill === dp.id;
                    return (
                      <button
                        key={dp.id}
                        onClick={() => setDateRangePill(dp.id)}
                        className={`text-[9px] font-bold px-2 py-1 rounded-full border transition-all ${
                          active
                            ? 'bg-zinc-150 border-zinc-300 text-zinc-900'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-500'
                        }`}
                      >
                        {dp.label}
                      </button>
                    );
                  })}

                  {dateRangePill === 'personalizado' && (
                    <div className="flex gap-1.5 items-center w-full pt-1.5 animate-in slide-in-from-top-1 duration-150">
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-[10px] font-bold text-zinc-700 outline-none flex-1"
                      />
                      <span className="text-[9px] font-bold text-zinc-400">a</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-[10px] font-bold text-zinc-700 outline-none flex-1"
                      />
                    </div>
                  )}
                </div>

              </div>

              {/* FILTERED LIST */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredEvents.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, gap: 10 }}>
                    <Clock size={20} color="#a1a1aa" />
                    <p style={{ fontSize: 11, color: '#71717a', margin: 0 }}>Sin actividad que coincida</p>
                  </div>
                ) : (
                  filteredEvents.map(event => renderEventCard(event))
                )}
              </div>

            </div>
          )}

        </div>
      </div>

      {/* Modal Detalle Electrónico Táctil */}
      {showEventModal && selectedEventForModal && (
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowEventModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-[24px] p-5 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 max-h-[85vh] overflow-y-auto border border-zinc-100 space-y-4" onClick={(e) => e.stopPropagation()}>
            
            <div className="flex justify-between items-center pb-2.5 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900">Auditoría Electrónica</h3>
              <button 
                onClick={() => setShowEventModal(false)} 
                className="w-7 h-7 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors"
              >
                <X size={14} strokeWidth={3} />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Concept header */}
              {(() => {
                const cfg = LOG_CFG[selectedEventForModal.type] || LOG_CFG.booking;
                const Icon = cfg.icon;
                return (
                  <div className="flex items-center gap-3 bg-zinc-50 p-3.5 rounded-xl border border-zinc-200/50">
                    <div className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 border ${cfg.bgColor} ${cfg.borderColor}`}>
                      <Icon size={15} color={cfg.textColor} strokeWidth={2.5} />
                    </div>
                    <div>
                      <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest block">Concepto</span>
                      <span className="text-[13px] font-black text-zinc-800 leading-tight">
                        {selectedEventForModal.title.split(' · ')[0]}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Description body */}
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block">Detalle de Actividad</span>
                <p className="text-[12px] text-zinc-800 font-medium whitespace-pre-line bg-zinc-50/50 p-3.5 border border-zinc-200/30 rounded-xl leading-relaxed">
                  {selectedEventForModal.desc}
                </p>
              </div>

              {/* Metadata Grid */}
              <div className="bg-zinc-50/30 border border-zinc-100 p-3.5 rounded-xl space-y-2.5 text-[11px]">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block border-b border-zinc-100 pb-1.5">Firma y Auditoría</span>
                
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 font-medium">
                  <div>
                    <span className="text-zinc-400 block text-[9px] uppercase">Operador</span>
                    <span className="font-bold text-zinc-800 truncate block capitalize">{selectedEventForModal.employee_name}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[9px] uppercase">No. Empleado</span>
                    <span className="font-bold text-zinc-800 block">{selectedEventForModal.rawLog.employee_num || '—'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[9px] uppercase">Departamento</span>
                    <span className="font-bold text-zinc-800 uppercase block">{selectedEventForModal.rawLog.department || 'SISTEMA'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[9px] uppercase">Módulo</span>
                    <span className="font-bold text-zinc-800 uppercase block">{selectedEventForModal.module}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[9px] uppercase">Ubicación</span>
                    <span className="font-bold text-zinc-800 block">{selectedEventForModal.room || 'General'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[9px] uppercase">Registro Servidor</span>
                    <span className="font-bold text-zinc-650 block text-[10px]">
                      {format(new Date(selectedEventForModal.rawLog.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* Actions button with deep link redirection */}
            <div className="pt-3 border-t border-zinc-100 flex flex-col gap-2">
              {resolveDeepLink(selectedEventForModal.rawLog) && (
                <button
                  onClick={() => {
                    const link = resolveDeepLink(selectedEventForModal.rawLog);
                    if (link) {
                      router.push(link);
                      setShowEventModal(false);
                      setOpen(false); // Cierra también el drawer de la campana
                    }
                  }}
                  className="w-full py-3 bg-zinc-950 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all shadow-md text-[12px] flex items-center justify-center gap-1 cursor-pointer animate-pulse"
                >
                  <span>Ir a la Sección Relacionada ↗</span>
                </button>
              )}
              
              <button
                onClick={() => setShowEventModal(false)}
                className="w-full py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-500 font-bold rounded-xl transition-colors text-[11px] cursor-pointer"
              >
                Cerrar Detalle
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <button onClick={handleOpen} style={{ position: 'relative', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: 'transparent', border: 'none', cursor: 'pointer' }} aria-label="Notificaciones">
        <Bell size={20} strokeWidth={2} color="#52525b" />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 999, background: '#ef4444', color: 'white', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', outline: '2px solid white' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {mounted && createPortal(sheet, document.body)}
    </>
  );
}
