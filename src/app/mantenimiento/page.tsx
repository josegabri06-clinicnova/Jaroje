"use client";

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, CheckCircle2, AlertTriangle, Wrench, Sparkles, X, Edit2, Download, Trash2, Bell, Camera, Image as ImageIcon } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

import { getActiveEmployee } from '@/lib/auth';

const normalizeText = (text: string) => 
  (text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();


interface Task {
  id: string;
  type: string;
  room: string;
  description: string;
  status: string;
  reported_by: string;
  direction: string;
  created_at: string;
  resolved_at: string | null;
  photo_url?: string | null;
  resolution_photo_url?: string | null;
  image_base64?: string | null;
}

const TYPE_CFG: Record<string, any> = {
  aviso:         { icon: Bell,          label: 'Aviso',         bg: 'bg-purple-50', text: 'text-purple-600' },
  limpieza:      { icon: Sparkles,      label: 'Limpieza',      bg: 'bg-amber-50', text: 'text-amber-600' },
  mantenimiento: { icon: Wrench,        label: 'Mantenimiento', bg: 'bg-rose-50', text: 'text-rose-600' },
  otro:          { icon: AlertTriangle, label: 'Otro',          bg: 'bg-blue-50', text: 'text-blue-600' },
};

const ROOMS = ['General', '101','102','103','104','105','106','107','201','202','203','204','205','206','301','302','303','304','305','306','401','402','500','501','502','503','504','505','506','Cocina', 'Recepción', 'Alberca'];

export default function MantenimientoPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const role = typeof window !== 'undefined' ? (localStorage.getItem('jaroje_role') || null) : null;
  
  // Filter
  const [filterStatus, setFilterStatus] = useState<'nuevo' | 'pendiente' | 'en_proceso' | 'resuelta'>('nuevo');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('todos');

  // Mantenimiento Programado Preventivo State
  const [viewMode, setViewMode] = useState<'tasks' | 'schedules'>('tasks');
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [schedRoom, setSchedRoom] = useState('General');
  const [schedDesc, setSchedDesc] = useState('');
  const [schedPeriod, setSchedPeriod] = useState('1 month');

  // Edit/Create Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  
  const [formRoom, setFormRoom] = useState('General');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState('mantenimiento');
  const [formStatus, setFormStatus] = useState('nuevo');
  const [isSaving, setIsSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [resolutionPhotoFile, setResolutionPhotoFile] = useState<File | null>(null);

  // Resolution Modal State
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [resolvingTask, setResolvingTask] = useState<Task | null>(null);
  const [resolveComments, setResolveComments] = useState('');
  const [resolvePhotoFile, setResolvePhotoFile] = useState<File | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resolutionFileInputRef = useRef<HTMLInputElement>(null);
  const editResolutionFileInputRef = useRef<HTMLInputElement>(null);

  // Read-only Details Drawer State
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<Task | null>(null);

  const openDetailsModal = (task: Task) => {
    setSelectedTaskForDetails(task);
    setShowDetailsModal(true);
  };

  const handleDeleteTask = async (task: Task) => {
    if (!confirm("⚠️ ¿Estás seguro de que deseas eliminar esta tarea? Esta acción no se puede deshacer.")) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/tasks?id=${task.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar la tarea');
      
      await logAudit(
        'eliminacion_tarea', 
        task.room, 
        JSON.stringify({
          text: `Tarea eliminada desde los detalles por el usuario. Descripción original: ${task.description}`,
          mantenimiento: {
            taskId: task.id,
            room: task.room,
            description: task.description,
            status: 'eliminada'
          }
        })
      );
      
      alert('🗑️ Tarea eliminada exitosamente.');
      setShowDetailsModal(false);
      fetchTasks();
    } catch (e: any) {
      alert(`Error al eliminar: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const logAudit = async (action: string, room: string, details: string) => {
    try {
      const activeEmp = getActiveEmployee('mantenimiento');
      const payload = {
        employee_num: activeEmp?.employee_num || '000',
        employee_name: activeEmp?.full_name || 'Admin',
        department: 'mantenimiento',
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

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/tasks');
      const json = await res.json();
      if (json.success) {
        // Filtrar tareas que correspondan puramente al módulo de limpieza
        const maintenanceTasks = (json.data || []).filter((t: any) => {
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
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
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
        console.log(`[Mantenimiento Programado] Ejecutando tarea automática para Hab ${item.room}: ${item.description}`);
        
        // 1. Insertar tarea en Supabase
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
          
          // Registrar log de auditoría
          await logAudit(
            'report_maintenance_scheduled', 
            item.room, 
            JSON.stringify({
              text: `Tarea programada auto-creada en ${item.room}: ${item.description}`,
              mantenimiento: {
                taskId: insertedId,
                room: item.room,
                description: item.description,
                status: 'nuevo',
                type: 'mantenimiento',
                reported_by: 'Sistema'
              }
            })
          );
          
          // 2. Actualizar el registro del item en la programación
          const nowIso = new Date().toISOString();
          item.last_triggered = nowIso;
          
          // Calcular la siguiente ejecución
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

  useEffect(() => {
    fetchTasks();
    fetchSchedules();
    
    // Abrir automáticamente el modal si viene desde el botón FAB (+)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('action') === 'new_task') {
        openModal();
      }
    }
  }, []);

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    setIsLoading(true);
    try {
      const taskToUpdate = tasks.find(t => t.id === taskId);
      const oldStatus = taskToUpdate ? taskToUpdate.status : 'desconocido';
      const roomName = taskToUpdate ? taskToUpdate.room : 'General';
      const description = taskToUpdate ? taskToUpdate.description : '';

      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId);
      
      if (error) throw error;

      await logAudit(
        'cambio_estado_tarea', 
        roomName, 
        JSON.stringify({
          text: `Cambio de estado: ${oldStatus} -> ${newStatus}. Descripción: ${description}`,
          mantenimiento: {
            taskId,
            room: roomName,
            description,
            status: newStatus,
            oldStatus
          }
        })
      );

      fetchTasks();
    } catch (e) {
      console.error(e);
      alert('Error al actualizar el estado de la tarea.');
      setIsLoading(false);
    }
  };

  const handleOpenResolutionModal = (task: Task) => {
    setResolvingTask(task);
    setResolveComments('');
    setResolvePhotoFile(null);
    setShowResolutionModal(true);
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveComments.trim()) {
      alert("Por favor ingresa los comentarios de resolución.");
      return;
    }
    if (!resolvingTask) return;
    
    setIsSaving(true);
    let finalResPhotoUrl = null;

    try {
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
        resolution_photo_url: finalResPhotoUrl || resolvingTask.resolution_photo_url
      };

      const { error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', resolvingTask.id);

      if (error) throw error;

      await logAudit(
        'resolucion_mantenimiento', 
        resolvingTask.room, 
        JSON.stringify({
          text: `Incidencia resuelta. Comentarios de cierre: ${resolveComments.trim()}`,
          mantenimiento: {
            taskId: resolvingTask.id,
            room: resolvingTask.room,
            description: resolvingTask.description,
            status: 'resuelta',
            resolutionComments: resolveComments.trim(),
            photo_url: resolvingTask.photo_url,
            resolution_photo_url: finalResPhotoUrl
          }
        })
      );

      setShowResolutionModal(false);
      fetchTasks();
    } catch(e) {
      console.error(e);
      alert('Error al resolver la tarea.');
    }
    setIsSaving(false);
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedDesc.trim()) return alert("Ingresa una descripción.");
    
    // Calcular primera ejecución: hoy + periodo
    const nextTriggerDate = new Date();
    const periodParts = schedPeriod.split(' ');
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
    }
    
    const newSchedule = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
      room: schedRoom,
      description: schedDesc.trim(),
      period: schedPeriod,
      last_triggered: null,
      next_trigger: nextTriggerDate.toISOString()
    };
    
    const updatedSchedules = [...schedules, newSchedule];
    
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'maintenance_schedules', value: JSON.stringify(updatedSchedules) }, { onConflict: 'key' });
        
      if (error) throw error;
      
      setSchedules(updatedSchedules);
      setSchedDesc('');
      alert("📅 Mantenimiento programado con éxito.");
    } catch (err) {
      console.error(err);
      alert("Error al guardar la programación.");
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar esta programación recurrente?")) return;
    
    const updatedSchedules = schedules.filter(s => s.id !== id);
    
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'maintenance_schedules', value: JSON.stringify(updatedSchedules) }, { onConflict: 'key' });
        
      if (error) throw error;
      
      setSchedules(updatedSchedules);
    } catch (err) {
      console.error(err);
      alert("Error al eliminar la programación.");
    }
  };

  const handleForceTriggerSchedule = async (scheduleItem: any) => {
    if (!confirm(`¿Deseas generar la tarea "${scheduleItem.description}" en la lista de NUEVOS inmediatamente?`)) return;
    
    const payload = {
      room: scheduleItem.room,
      description: `[PROGRAMADO] ${scheduleItem.description}`,
      type: 'mantenimiento',
      status: 'nuevo',
      reported_by: 'Sistema',
      direction: 'admin_to_staff'
    };
    
    try {
      const { data: insertData, error: insError } = await supabase.from('tasks').insert([payload]).select();
      if (insError) throw insError;
      
      const insertedId = insertData?.[0]?.id || '';
      
      // Registrar log de auditoría
      await logAudit(
        'report_maintenance_scheduled_forced', 
        scheduleItem.room, 
        JSON.stringify({
          text: `Tarea programada forzada manualmente en ${scheduleItem.room}: ${scheduleItem.description}`,
          mantenimiento: {
            taskId: insertedId,
            room: scheduleItem.room,
            description: scheduleItem.description,
            status: 'nuevo',
            type: 'mantenimiento',
            reported_by: 'Sistema'
          }
        })
      );
      
      // Actualizar fechas
      const nowIso = new Date().toISOString();
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
      }
      
      const updatedSchedules = schedules.map(s => {
        if (s.id === scheduleItem.id) {
          return {
            ...s,
            last_triggered: nowIso,
            next_trigger: nextTriggerDate.toISOString()
          };
        }
        return s;
      });
      
      const { error: saveError } = await supabase
        .from('settings')
        .upsert({ key: 'maintenance_schedules', value: JSON.stringify(updatedSchedules) }, { onConflict: 'key' });
        
      if (saveError) throw saveError;
      
      setSchedules(updatedSchedules);
      fetchTasks();
      alert("✅ Tarea creada con éxito y programación actualizada.");
    } catch (err) {
      console.error(err);
      alert("Error al forzar la ejecución de la programación.");
    }
  };

  const handleSaveDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDesc) return;
    setIsSaving(true);

    // Abrir ventana ANTES de los awaits (el navegador bloquea window.open después de async)
    // Solo para nuevas tareas de mantenimiento
    const isNewMtto = !editingTask && formType === 'mantenimiento';
    const waWindow = isNewMtto ? window.open('about:blank', '_blank') : null;

    let finalPhotoUrl = editingTask?.photo_url;
    let finalResPhotoUrl = editingTask?.resolution_photo_url;

    // Subir foto inicial si existe
    if (photoFile) {
      const fileExt = photoFile.name.split('.').pop();
      const fileName = `incidencia_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('maintenance_photos').upload(fileName, photoFile);
      if (!uploadError) {
        const { data } = supabase.storage.from('maintenance_photos').getPublicUrl(fileName);
        finalPhotoUrl = data.publicUrl;
      }
    }

    // Subir foto de resolución si existe y el estado es resuelta (Opcional)
    if (formStatus === 'resuelta' && resolutionPhotoFile) {
      const fileExt = resolutionPhotoFile.name.split('.').pop();
      const fileName = `resolucion_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('maintenance_photos').upload(fileName, resolutionPhotoFile);
      if (!uploadError) {
        const { data } = supabase.storage.from('maintenance_photos').getPublicUrl(fileName);
        finalResPhotoUrl = data.publicUrl;
      }
    }

    const payload = {
      room: formRoom,
      description: formDesc,
      type: formType,
      status: formStatus,
      reported_by: editingTask ? editingTask.reported_by : 'Admin',
      direction: editingTask ? editingTask.direction : 'admin_to_staff',
      photo_url: finalPhotoUrl,
      resolution_photo_url: finalResPhotoUrl
    };

    if (editingTask) {
      await supabase.from('tasks').update(payload).eq('id', editingTask.id);
      await logAudit(
        'actualizacion_tarea', 
        payload.room, 
        JSON.stringify({
          text: `Tarea actualizada por el administrador. Nuevo estado: ${payload.status}. Descripción: ${payload.description}`,
          mantenimiento: {
            taskId: editingTask.id,
            room: payload.room,
            description: payload.description,
            status: payload.status,
            type: payload.type,
            reported_by: payload.reported_by
          }
        })
      );
    } else {
      const { data: insertData } = await supabase.from('tasks').insert([payload]).select();
      const insertedId = insertData?.[0]?.id || '';
      await logAudit(
        'report_maintenance', 
        payload.room, 
        JSON.stringify({
          text: `Nueva tarea creada en ${payload.room}: ${payload.description}`,
          mantenimiento: {
            taskId: insertedId,
            room: payload.room,
            description: payload.description,
            status: payload.status,
            type: payload.type,
            reported_by: payload.reported_by
          }
        })
      );

      // Copiar reporte al clipboard y redirigir la ventana ya abierta al grupo de WhatsApp
      const dateStr = format(new Date(), "EEEE, d 'de' MMMM · HH:mm", { locale: es });
      const isRoom = !['General', 'Cocina', 'Recepción', 'Alberca'].includes(payload.room);
      const ubicacion = isRoom ? `Habitación ${payload.room}` : payload.room;
      const waText =
        `🔧 *REPORTE DE MANTENIMIENTO*\n` +
        `🏨 *Jaroje Condominios*\n` +
        `📅 *${dateStr.toUpperCase()}*\n\n` +
        `📍 *Ubicación:* ${ubicacion}\n` +
        `📝 *Descripción:* ${payload.description}\n` +
        `👤 *Reportado por:* ${payload.reported_by}\n\n` +
        `_Generado automáticamente desde Jaroje OS_`;

      navigator.clipboard.writeText(waText).catch(() => {});
      // Redirigir la ventana ya abierta (evita bloqueo del navegador)
      if (waWindow) {
        waWindow.location.href = 'https://chat.whatsapp.com/0ZEzlGKFLdzEvqOOiAFhmq';
      }
    }

    setShowModal(false);
    fetchTasks();
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!editingTask || !confirm("¿Seguro que deseas eliminar esta tarea?")) return;
    setIsSaving(true);
    await supabase.from('tasks').delete().eq('id', editingTask.id);
    await logAudit(
      'eliminacion_tarea', 
      editingTask.room, 
      JSON.stringify({
        text: `Tarea eliminada por el administrador. Descripción original: ${editingTask.description}`,
        mantenimiento: {
          taskId: editingTask.id,
          room: editingTask.room,
          description: editingTask.description,
          status: 'eliminada'
        }
      })
    );
    setShowModal(false);
    fetchTasks();
    setIsSaving(false);
  };

  const openModal = (t?: Task) => {
    if (t) {
      setEditingTask(t);
      setFormRoom(t.room);
      setFormDesc(t.description);
      setFormType(t.type);
      setFormStatus(t.status);
    } else {
      setEditingTask(null);
      setFormRoom('General');
      setFormDesc('');
      setFormType('mantenimiento');
      setFormStatus('nuevo');
    }
    setPhotoFile(null);
    setResolutionPhotoFile(null);
    setShowModal(true);
  };

  const filteredTasks = tasks.filter(t => {
    // Status filter
    if (t.status !== filterStatus) return false;
    
    // Type filter
    if (filterType !== 'todos' && t.type !== filterType) return false;
    
    // Search query (matches description or room)
    if (searchQuery.trim()) {
      const q = normalizeText(searchQuery);
      const matchesDesc = normalizeText(t.description).includes(q);
      const matchesRoom = normalizeText(t.room).includes(q);
      if (!matchesDesc && !matchesRoom) return false;
    }
    
    return true;
  });

  const exportToCSV = () => {
    if (tasks.length === 0) return alert("No hay datos para exportar.");
    const headers = ["Fecha", "Estado", "Tipo", "Ubicación", "Reportado por", "Descripción", "Fecha de Resolución"];
    const csv = [
      headers.join(","),
      ...tasks.map(t => [
        format(new Date(t.created_at), 'dd/MM/yyyy'),
        t.status,
        t.type,
        `"${t.room}"`,
        `"${(t.reported_by || '').replace(/"/g, '""')}"`,
        `"${t.description.replace(/"/g, '""')}"`,
        t.resolved_at ? format(new Date(t.resolved_at), 'dd/MM/yyyy') : '""'
      ].join(","))
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Reporte_Mantenimiento_Completo_Jaroje.csv`;
    link.click();
  };

  return (
    <div className="space-y-6 flex flex-col min-h-screen bg-[#fafafa] pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight">Mantenimiento</h2>
          <p className="text-[13px] font-medium text-zinc-500">Gestión de Tareas y Reportes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportToCSV} className="w-10 h-10 bg-white border border-zinc-200 text-zinc-700 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform">
            <Download size={18} strokeWidth={2.5} />
          </button>
          <button onClick={() => openModal()} className="w-10 h-10 bg-zinc-900 text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform">
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Selector de Vista (Incidencias vs Programado) */}
      <div className="flex bg-zinc-100/80 p-1.5 rounded-2xl w-fit border border-zinc-200/50 shadow-inner mb-2 select-none">
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
          📅 Mantenimiento Programado
        </button>
      </div>

      {viewMode === 'tasks' ? (
        <>
          {/* KPIs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 select-none">
        {/* NUEVOS */}
        <div 
          onClick={() => setFilterStatus('nuevo')}
          className={`border rounded-2xl p-3.5 flex flex-col justify-between cursor-pointer active:scale-95 transition-all ${
            filterStatus === 'nuevo' 
              ? 'bg-purple-50/10 border-purple-600 ring-2 ring-purple-500/10 shadow-md' 
              : 'bg-white border-zinc-200/85 shadow-sm hover:bg-zinc-50/50'
          }`}
        >
          <span className="text-[20px] font-black text-purple-650 leading-none">
            {tasks.filter(t => t.status === 'nuevo').length}
          </span>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mt-1">Nuevos</p>
        </div>

        {/* PENDIENTES */}
        <div 
          onClick={() => setFilterStatus('pendiente')}
          className={`border rounded-2xl p-3.5 flex flex-col justify-between cursor-pointer active:scale-95 transition-all ${
            filterStatus === 'pendiente' 
              ? 'bg-amber-50/10 border-amber-500 ring-2 ring-amber-500/10 shadow-md' 
              : 'bg-white border-zinc-200/85 shadow-sm hover:bg-zinc-50/50'
          }`}
        >
          <span className="text-[20px] font-black text-amber-500 leading-none">
            {tasks.filter(t => t.status === 'pendiente').length}
          </span>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mt-1">Pendientes</p>
        </div>

        {/* EN PROCESO */}
        <div 
          onClick={() => setFilterStatus('en_proceso')}
          className={`border rounded-2xl p-3.5 flex flex-col justify-between cursor-pointer active:scale-95 transition-all ${
            filterStatus === 'en_proceso' 
              ? 'bg-blue-50/10 border-blue-500 ring-2 ring-blue-500/10 shadow-md' 
              : 'bg-white border-zinc-200/85 shadow-sm hover:bg-zinc-50/50'
          }`}
        >
          <span className="text-[20px] font-black text-blue-500 leading-none">
            {tasks.filter(t => t.status === 'en_proceso').length}
          </span>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mt-1">En Proceso</p>
        </div>

        {/* RESUELTAS */}
        <div 
          onClick={() => setFilterStatus('resuelta')}
          className={`border rounded-2xl p-3.5 flex flex-col justify-between cursor-pointer active:scale-95 transition-all ${
            filterStatus === 'resuelta' 
              ? 'bg-emerald-50/10 border-emerald-600 ring-2 ring-emerald-500/10 shadow-md' 
              : 'bg-white border-zinc-200/85 shadow-sm hover:bg-zinc-50/50'
          }`}
        >
          <span className="text-[20px] font-black text-emerald-650 leading-none">
            {tasks.filter(t => t.status === 'resuelta' && t.resolved_at && t.resolved_at.split('T')[0] === new Date().toISOString().split('T')[0]).length}
          </span>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mt-1">Resueltos Hoy</p>
        </div>
      </div>

      {/* Search and Filters Bar */}
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

        {/* Tipo de tarea simplificado: Todos los reportes son para Mantenimiento */}
      </div>

      {/* List */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col divide-y divide-zinc-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center"><div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin mx-auto" /></div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">No hay tareas en este estado.</div>
        ) : (
          filteredTasks.map(task => {
            const cfg = TYPE_CFG[task.type] || TYPE_CFG['otro'];
            const Icon = cfg.icon;
            return (
              <div 
                key={task.id} 
                onClick={() => {
                  if (filterStatus === 'resuelta') {
                    openModal(task);
                  } else {
                    openDetailsModal(task);
                  }
                }}
                className="p-4 flex flex-col gap-3 hover:bg-zinc-50 transition-colors cursor-pointer group"
              >
                <div className="flex gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.text}`}>
                    <Icon size={20} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-[14px] font-bold text-zinc-900 leading-tight group-hover:text-zinc-600 transition-colors whitespace-pre-line">
                        {task.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 mt-1 pt-2.5 border-t border-zinc-100/60">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600">
                      Ubi: {task.room}
                    </span>
                    <span className="text-[11px] font-medium text-zinc-400">
                      {format(new Date(task.created_at), 'd MMM', { locale: es })}
                    </span>
                    {(task.photo_url || task.image_base64) && (
                      <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-100 flex items-center gap-0.5">
                        📷 Foto
                      </span>
                    )}
                    {task.resolution_photo_url && (
                      <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100 flex items-center gap-0.5">
                        ✅ Evidencia
                      </span>
                    )}
                  </div>
                  
                  {/* Action buttons */}
                  <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {filterStatus === 'nuevo' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(task.id, 'pendiente')}
                          className="px-2.5 py-1 bg-purple-600 text-white rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition-all active:scale-[0.96] hover:bg-purple-700 shadow-sm"
                        >
                          Aprobar ⏳
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(task.id, 'en_proceso')}
                          className="px-2.5 py-1 bg-amber-500 text-white rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition-all active:scale-[0.96] hover:bg-amber-600 shadow-sm"
                        >
                          Iniciar ⚡
                        </button>
                      </>
                    )}
                    {filterStatus === 'pendiente' && (
                      <button
                        onClick={() => handleUpdateStatus(task.id, 'en_proceso')}
                        className="px-2.5 py-1 bg-amber-500 text-white rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition-all active:scale-[0.96] hover:bg-amber-600 shadow-sm"
                      >
                        Iniciar Trabajo ⚡
                      </button>
                    )}
                    {filterStatus === 'en_proceso' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(task.id, 'pendiente')}
                          className="px-2 py-1 bg-zinc-100 text-zinc-500 rounded-lg text-[10px] font-extrabold flex items-center gap-0.5 transition-all active:scale-[0.96] hover:bg-zinc-200 border border-zinc-200"
                          title="Regresar a Pendientes"
                        >
                          Regresar ↩
                        </button>
                        <button
                          onClick={() => handleOpenResolutionModal(task)}
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition-all active:scale-[0.96] hover:bg-emerald-700 shadow-sm"
                        >
                          Terminar ✅
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  ) : (
      // VISTA DE MANTENIMIENTO PROGRAMADO
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          
          {/* Formulario Agregar Programación */}
          <div className="bg-white border border-zinc-200/80 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4">
            <div>
              <h3 className="text-[16px] font-black text-zinc-900 uppercase tracking-wide">Nueva Programación</h3>
              <p className="text-[11px] text-zinc-400 font-bold mt-0.5">Define una tarea de mantenimiento preventiva recurrente</p>
            </div>
            
            <form onSubmit={handleAddSchedule} className="space-y-4">
              {/* Habitación / Ubicación */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-550 uppercase tracking-widest pl-0.5 block">Ubicación</label>
                <select
                  value={schedRoom}
                  onChange={e => setSchedRoom(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-zinc-900 font-bold text-[13px] outline-none focus:ring-2 focus:ring-zinc-950/5 transition-all cursor-pointer"
                >
                  <option value="General">📍 General (Áreas Comunes)</option>
                  <option value="Alberca">🏊 Alberca</option>
                  <option value="Cocina">🍳 Cocina / Terraza</option>
                  <option value="Recepción">🛎️ Recepción</option>
                  <optgroup label="Habitaciones">
                    {['101','102','103','104','105','106','107','201','202','203','204','205','206','301','302','303','304','305','306','401','402','501','502','503','504','505','506','507'].map(rm => (
                      <option key={rm} value={rm}>Habitación {rm}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Frecuencia / Periodo */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-550 uppercase tracking-widest pl-0.5 block">Frecuencia de Ejecución</label>
                <select
                  value={schedPeriod}
                  onChange={e => setSchedPeriod(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-zinc-900 font-bold text-[13px] outline-none focus:ring-2 focus:ring-zinc-950/5 transition-all cursor-pointer"
                >
                  <option value="1 week">Cada Semana ⏳</option>
                  <option value="2 weeks">Cada 2 Semanas 🗓️</option>
                  <option value="1 month">Cada Mes 📅</option>
                  <option value="3 months">Cada 3 Meses 🗓️</option>
                  <option value="6 months">Cada 6 Meses 🔄</option>
                  <option value="1 year">Cada Año 🎯</option>
                </select>
              </div>

              {/* Descripción */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-555 uppercase tracking-widest pl-0.5 block">Descripción de la Tarea</label>
                <textarea
                  rows={3}
                  required
                  value={schedDesc}
                  onChange={e => setSchedDesc(e.target.value)}
                  placeholder="Ej. Limpieza de filtros de aire acondicionado, revisión de pintura..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none text-[13px] focus:ring-2 focus:ring-zinc-950/5 resize-none font-semibold text-zinc-900 leading-relaxed"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-950 text-white font-extrabold text-[12.5px] uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Programar Pendiente 📅</span>
              </button>
            </form>
          </div>

          {/* Listado de Programaciones */}
          <div className="md:col-span-2 space-y-3.5">
            <div className="flex items-center justify-between pl-1">
              <div>
                <h3 className="text-[15px] font-black text-zinc-900 uppercase tracking-wide">Tareas Recurrentes Activas</h3>
                <p className="text-[11px] text-zinc-400 font-bold mt-0.5">
                  {schedules.length} programación{schedules.length !== 1 ? 'es' : ''} registrada{schedules.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {schedules.length === 0 ? (
              <div className="bg-white border border-zinc-200/80 rounded-3xl p-12 text-center shadow-[0_2px_12px_rgba(0,0,0,0.01)] flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 bg-zinc-50 border border-zinc-100 rounded-2xl flex items-center justify-center text-zinc-400 text-lg">
                  📅
                </div>
                <div>
                  <h4 className="text-[14px] font-bold text-zinc-800">No hay tareas recurrentes programadas</h4>
                  <p className="text-[11.5px] text-zinc-400 font-bold mt-1">Usa el panel de la izquierda para agregar la primera.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {schedules.map((item) => {
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
                    <div 
                      key={item.id}
                      className="bg-white border border-zinc-200/80 rounded-2xl p-4.5 shadow-[0_2px_10px_rgba(0,0,0,0.015)] flex flex-col justify-between space-y-4 hover:border-zinc-300 transition-colors"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 text-[9.5px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                            📍 {item.room}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-400">
                            🔄 {freqText}
                          </span>
                        </div>
                        
                        <p className="text-[13px] font-bold text-zinc-850 leading-snug whitespace-pre-line">
                          {item.description}
                        </p>
                      </div>

                      <div className="border-t border-zinc-100/70 pt-3 space-y-1.5 text-[11px] font-medium text-zinc-500">
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
                        
                        <div className="flex gap-2 pt-2 border-t border-zinc-100/50 mt-1">
                          <button
                            onClick={() => handleForceTriggerSchedule(item)}
                            className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          >
                            ⚡ Lanzar Ya
                          </button>
                          <button
                            onClick={() => handleDeleteSchedule(item.id)}
                            className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                            title="Eliminar Programación"
                          >
                            <Trash2 size={13} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )}

      {/* Edit/Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-zinc-900">
                {editingTask ? 'Editar Tarea' : 'Nueva Tarea'}
              </h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-500">
                <X size={16} strokeWidth={3} />
              </button>
            </div>
            
            <form onSubmit={handleSaveDirect} className="space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Descripción de la Tarea</label>
                <textarea 
                  required rows={3}
                  value={formDesc} onChange={e => setFormDesc(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none text-[15px] focus:ring-2 focus:ring-zinc-900/10 resize-none font-medium text-zinc-900"
                  placeholder="Ej. Cambiar filtro de aire..."
                />
              </div>

              {!editingTask && (
                <div>
                  <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Foto de la Incidencia (Opcional)</label>
                  <input 
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={e => setPhotoFile(e.target.files ? e.target.files[0] : null)}
                    className="hidden"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 py-3 px-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 active:scale-95 transition-all text-center text-[13px] flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Camera size={16} />
                      <span>Tomar Foto</span>
                    </button>
                    {photoFile && (
                      <button
                        type="button"
                        onClick={() => setPhotoFile(null)}
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
              )}

              {(editingTask?.photo_url || editingTask?.image_base64) && (
                <div>
                  <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Foto Original</label>
                  {(() => {
                    const srcUrl = editingTask.photo_url || editingTask.image_base64 || '';
                    const isBase64 = srcUrl.startsWith('data:');
                    return (
                      <a href={isBase64 ? undefined : srcUrl} target="_blank" rel="noreferrer" className={isBase64 ? '' : 'cursor-pointer'}>
                        <img src={srcUrl} alt="Incidencia" className="w-full h-32 object-cover rounded-xl border border-zinc-200" />
                      </a>
                    );
                  })()}
                </div>
              )}

              {editingTask ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Ubicación</label>
                    <select 
                      value={formRoom} onChange={e => setFormRoom(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[15px] font-bold text-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                    >
                      {ROOMS.map(r => {
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
                    <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Estado</label>
                    <select 
                      value={formStatus} onChange={e => {
                        if (e.target.value === 'resuelta') {
                          setShowModal(false);
                          handleOpenResolutionModal(editingTask);
                        } else {
                          setFormStatus(e.target.value);
                        }
                      }}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[15px] font-bold text-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                    >
                      <option value="nuevo">Nuevo</option>
                      <option value="pendiente">Pendiente</option>
                      <option value="en_proceso">En Proceso</option>
                      <option value="resuelta">Resuelta</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Ubicación</label>
                  <select 
                    value={formRoom} onChange={e => setFormRoom(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[15px] font-bold text-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                  >
                    {ROOMS.map(r => {
                      const isRoom = !['General', 'Cocina', 'Recepción', 'Alberca'].includes(r);
                      return (
                        <option key={r} value={r}>
                          {isRoom ? `Habitación ${r}` : r}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {editingTask && formStatus === 'resuelta' && (
                <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl animate-in fade-in slide-in-from-top-2">
                  <label className="block text-[12px] font-bold text-emerald-700 uppercase tracking-wider mb-2">Foto de Resolución (Opcional)</label>
                  {editingTask?.resolution_photo_url ? (
                    <a href={editingTask.resolution_photo_url} target="_blank" rel="noreferrer">
                      <img src={editingTask.resolution_photo_url} alt="Resolución" className="w-full h-32 object-cover rounded-xl border border-emerald-200 mb-2" />
                    </a>
                  ) : null}
                  <input 
                    ref={editResolutionFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={e => setResolutionPhotoFile(e.target.files ? e.target.files[0] : null)}
                    className="hidden"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => editResolutionFileInputRef.current?.click()}
                      className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl active:scale-95 transition-all text-center text-[13px] flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Camera size={16} />
                      <span>Tomar Foto</span>
                    </button>
                    {resolutionPhotoFile && (
                      <button
                        type="button"
                        onClick={() => setResolutionPhotoFile(null)}
                        className="px-4 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-2xl transition-colors font-bold text-[12px] border border-rose-200"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                  {resolutionPhotoFile && (
                    <p className="text-[12px] text-zinc-500 mt-2 font-medium bg-zinc-50 border border-zinc-200/50 p-2.5 rounded-xl truncate">
                      ✓ Seleccionado: <span className="font-bold text-zinc-800">{resolutionPhotoFile.name}</span>
                    </p>
                  )}
                  <p className="text-[11px] text-emerald-600 mt-2 font-medium">Puedes adjuntar una foto como evidencia del cierre (opcional).</p>
                </div>
              )}

              <div className="pt-4 flex gap-2">
                {editingTask && (
                  <button 
                    type="button" 
                    onClick={handleDelete}
                    disabled={isSaving}
                    className="w-14 shrink-0 bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center rounded-xl transition-colors disabled:opacity-50 border border-rose-200"
                  >
                    <Trash2 size={20} strokeWidth={2.5} />
                  </button>
                )}
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-1 py-4 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-colors disabled:opacity-50 shadow-lg text-[15px]"
                >
                  {isSaving ? 'Guardando...' : (editingTask ? 'Actualizar Tarea' : 'Crear Tarea')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mandatory Resolution / Closing Comments Modal */}
      {showResolutionModal && resolvingTask && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 max-h-[90vh] overflow-y-auto border border-zinc-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                <CheckCircle2 className="text-emerald-600" size={24} />
                Finalizar Incidencia
              </h3>
              <button onClick={() => setShowResolutionModal(false)} className="w-8 h-8 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-500">
                <X size={16} strokeWidth={3} />
              </button>
            </div>

            <div className="mb-4 bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Tarea original</p>
              <p className="text-[14px] font-medium text-zinc-800 whitespace-pre-line">{resolvingTask.description}</p>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-200/50">
                <span className="text-[11px] font-black uppercase bg-white px-2 py-0.5 rounded-md border border-zinc-200 text-zinc-600">
                  Ubicación: {resolvingTask.room}
                </span>
              </div>
            </div>

            <form onSubmit={handleResolveSubmit} className="space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                  Detalles de la Resolución <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={resolveComments}
                  onChange={e => setResolveComments(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none text-[15px] focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none font-medium text-zinc-900"
                  placeholder="Ej. Se cambió el empaque de la válvula y se verificó que no tuviera fugas..."
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                  Evidencia Fotográfica (Opcional)
                </label>
                <input
                  ref={resolutionFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={e => setResolvePhotoFile(e.target.files ? e.target.files[0] : null)}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => resolutionFileInputRef.current?.click()}
                    className="flex-1 py-3 px-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 active:scale-95 transition-all text-center text-[13px] flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Camera size={16} />
                    <span>Tomar Foto / Seleccionar Imagen</span>
                  </button>
                  {resolvePhotoFile && (
                    <button
                      type="button"
                      onClick={() => setResolvePhotoFile(null)}
                      className="px-4 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-2xl transition-colors font-bold text-[12px] border border-rose-200"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                {resolvePhotoFile && (
                  <p className="text-[12px] text-zinc-500 mt-2 font-medium bg-zinc-50 border border-zinc-200/50 p-2.5 rounded-xl truncate">
                    ✓ Seleccionado: <span className="font-bold text-zinc-800">{resolvePhotoFile.name}</span>
                  </p>
                )}
                <p className="text-[11px] text-zinc-400 mt-2 font-medium">Puedes adjuntar una foto del trabajo terminado.</p>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowResolutionModal(false)}
                  className="flex-1 py-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition-colors border border-zinc-200 text-[15px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 shadow-lg text-[15px] flex items-center justify-center gap-1.5"
                >
                  {isSaving ? 'Guardando...' : 'Cerrar Incidencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Read-Only Details Task Sheet Modal */}
      {showDetailsModal && selectedTaskForDetails && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowDetailsModal(false)}>
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 max-h-[90vh] overflow-y-auto border border-zinc-100 space-y-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-3 border-b border-zinc-100">
              <h3 className="text-lg font-bold text-zinc-900">Detalles de la Tarea</h3>
              <button 
                onClick={() => setShowDetailsModal(false)} 
                className="w-8 h-8 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors"
              >
                <X size={16} strokeWidth={3} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Ubicación y Estado */}
              <div className="flex justify-between items-center bg-zinc-50 p-4 rounded-2xl border border-zinc-200/50">
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Ubicación</span>
                  <span className="text-[15px] font-extrabold text-zinc-800">{selectedTaskForDetails.room}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Estado Actual</span>
                  <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded mt-1 inline-block ${
                    selectedTaskForDetails.status === 'nuevo' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                    selectedTaskForDetails.status === 'pendiente' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                    selectedTaskForDetails.status === 'en_proceso' ? 'bg-purple-50 text-purple-600 border border-purple-100' :
                    'bg-emerald-50 text-emerald-600 border border-emerald-100'
                  }`}>
                    {selectedTaskForDetails.status === 'nuevo' ? 'Nuevo Reporte' :
                     selectedTaskForDetails.status === 'pendiente' ? 'Pendiente' :
                     selectedTaskForDetails.status === 'en_proceso' ? 'En Proceso' : 'Resuelto'}
                  </span>
                </div>
              </div>

              {/* Descripción */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Descripción del Daño</span>
                <p className="text-[14px] text-zinc-850 font-medium whitespace-pre-line bg-zinc-50/50 p-4 border border-zinc-200/40 rounded-2xl leading-relaxed text-zinc-800">
                  {selectedTaskForDetails.description}
                </p>
              </div>

              {/* Información de Registro */}
              <div className="grid grid-cols-2 gap-4 text-[12px] border-t border-zinc-100 pt-4">
                <div>
                  <span className="text-zinc-450 font-semibold block text-[10px] uppercase">Reportado por</span>
                  <span className="font-bold text-zinc-700">{selectedTaskForDetails.reported_by}</span>
                </div>
                <div>
                  <span className="text-zinc-450 font-semibold block text-[10px] uppercase">Fecha de reporte</span>
                  <span className="font-bold text-zinc-700">
                    {format(new Date(selectedTaskForDetails.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                  </span>
                </div>
              </div>

              {/* Foto si existe */}
              {(selectedTaskForDetails.photo_url || selectedTaskForDetails.image_base64) && (
                <div className="space-y-2 pt-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Evidencia Fotográfica</span>
                  {(() => {
                    const srcUrl = selectedTaskForDetails.photo_url || selectedTaskForDetails.image_base64 || '';
                    const isBase64 = srcUrl.startsWith('data:');
                    return (
                      <a href={isBase64 ? undefined : srcUrl} target="_blank" rel="noreferrer" className={`block overflow-hidden rounded-2xl border border-zinc-200 ${isBase64 ? '' : 'hover:opacity-95 transition-opacity'}`}>
                        <img 
                          src={srcUrl} 
                          alt="Evidencia inicial" 
                          className="w-full h-48 object-cover"
                        />
                      </a>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Botones de acción del flujo estrictos */}
            <div className="pt-4 border-t border-zinc-100 flex flex-col gap-2">
              {selectedTaskForDetails.status === 'nuevo' && (
                <button
                  onClick={async () => {
                    await handleUpdateStatus(selectedTaskForDetails.id, 'pendiente');
                    setShowDetailsModal(false);
                  }}
                  className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all shadow-lg text-[14px] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Revisar y Validar Tarea ✓</span>
                </button>
              )}

              {selectedTaskForDetails.status === 'pendiente' && (
                <button
                  onClick={async () => {
                    await handleUpdateStatus(selectedTaskForDetails.id, 'en_proceso');
                    setShowDetailsModal(false);
                  }}
                  className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-lg text-[14px] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Iniciar Trabajo Activo ⚡</span>
                </button>
              )}

              {selectedTaskForDetails.status === 'en_proceso' && (
                <div className="flex gap-2.5">
                  <button
                    onClick={async () => {
                      await handleUpdateStatus(selectedTaskForDetails.id, 'pendiente');
                      setShowDetailsModal(false);
                    }}
                    className="flex-1 py-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition-all border border-zinc-200 text-[14px] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Pausar / Regresar ↩</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowDetailsModal(false);
                      handleOpenResolutionModal(selectedTaskForDetails);
                    }}
                    className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-lg text-[14px] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Terminar y Cerrar ✅</span>
                  </button>
                </div>
              )}

              {(role === 'admin' || role === 'staff_mantenimiento') && (
                <div className="flex gap-2.5 mt-2 pt-2 border-t border-zinc-100">
                  <button
                    onClick={() => {
                      setShowDetailsModal(false);
                      openModal(selectedTaskForDetails);
                    }}
                    className="flex-1 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl transition-all border border-blue-200 text-[13px] flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    Editar ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteTask(selectedTaskForDetails)}
                    className="flex-1 py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl transition-all border border-rose-200 text-[13px] flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    Eliminar 🗑️
                  </button>
                </div>
              )}

              <button
                onClick={() => setShowDetailsModal(false)}
                className="w-full py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-500 font-bold rounded-xl transition-colors text-[13px] cursor-pointer"
              >
                Volver a la Lista
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
