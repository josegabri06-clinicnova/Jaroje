"use client";

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, CheckCircle2, AlertTriangle, Wrench, Sparkles, X, Edit2, Download, Trash2, Bell } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
}

const TYPE_CFG: Record<string, any> = {
  aviso:         { icon: Bell,          label: 'Aviso',         bg: 'bg-purple-50', text: 'text-purple-600' },
  limpieza:      { icon: Sparkles,      label: 'Limpieza',      bg: 'bg-amber-50', text: 'text-amber-600' },
  mantenimiento: { icon: Wrench,        label: 'Mantenimiento', bg: 'bg-rose-50', text: 'text-rose-600' },
  otro:          { icon: AlertTriangle, label: 'Otro',          bg: 'bg-blue-50', text: 'text-blue-600' },
};

const ROOMS = ['General', '101','102','103','104','105','106','107','201','202','203','204','205','206','301','302','303','304','305','306','401','402','Cocina', 'Recepción', 'Alberca'];

export default function MantenimientoPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filter
  const [filterStatus, setFilterStatus] = useState<'nuevo' | 'pendiente' | 'en_proceso' | 'resuelta'>('nuevo');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('todos');

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

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/tasks');
      const json = await res.json();
      if (json.success) setTasks(json.data);
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTasks();
    
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
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId);
      
      if (error) throw error;
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

      setShowResolutionModal(false);
      fetchTasks();
    } catch(e) {
      console.error(e);
      alert('Error al resolver la tarea.');
    }
    setIsSaving(false);
  };

  const handleSaveDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDesc) return;
    setIsSaving(true);

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
    } else {
      await supabase.from('tasks').insert([payload]);
    }

    setShowModal(false);
    fetchTasks();
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!editingTask || !confirm("¿Seguro que deseas eliminar esta tarea?")) return;
    setIsSaving(true);
    await supabase.from('tasks').delete().eq('id', editingTask.id);
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
      const q = searchQuery.toLowerCase();
      const matchesDesc = t.description.toLowerCase().includes(q);
      const matchesRoom = t.room.toLowerCase().includes(q);
      if (!matchesDesc && !matchesRoom) return false;
    }
    
    return true;
  });

  const exportToCSV = () => {
    if (filteredTasks.length === 0) return alert("No hay datos.");
    const headers = ["Fecha", "Estado", "Tipo", "Ubicación", "Descripción"];
    const csv = [
      headers.join(","),
      ...filteredTasks.map(t => [
        format(new Date(t.created_at), 'dd/MM/yyyy'),
        t.status,
        t.type,
        `"${t.room}"`,
        `"${t.description.replace(/"/g, '""')}"`
      ].join(","))
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Mantenimiento_Jaroje.csv`;
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

      {/* Tabs */}
      <div className="flex bg-zinc-200/60 p-1 rounded-2xl gap-1">
        {[
          { id: 'nuevo', label: 'Nuevos' },
          { id: 'pendiente', label: 'Pendientes' },
          { id: 'en_proceso', label: 'En Proceso' },
          { id: 'resuelta', label: 'Resueltos' },
        ].map(f => (
          <button 
            key={f.id}
            onClick={() => setFilterStatus(f.id as any)}
            className={`flex-1 py-2.5 text-[12px] font-bold rounded-xl transition-all ${filterStatus === f.id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            {f.label}
          </button>
        ))}
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

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-white border border-zinc-200 text-zinc-700 rounded-2xl px-4 py-2.5 outline-none text-[13px] font-bold shadow-sm focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-300 transition-all cursor-pointer"
        >
          <option value="todos">Todos los Tipos</option>
          <option value="aviso">Avisos</option>
          <option value="mantenimiento">Mtto.</option>
          <option value="limpieza">Limpieza</option>
          <option value="otro">Otros</option>
        </select>
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
                onClick={() => openModal(task)}
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
                    {task.photo_url && (
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
                      <button
                        onClick={() => handleUpdateStatus(task.id, 'pendiente')}
                        className="px-2.5 py-1 bg-zinc-900 text-white rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition-all active:scale-[0.96] hover:bg-zinc-800"
                      >
                        Revisar ✓
                      </button>
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
                    type="file"
                    accept="image/*"
                    onChange={e => setPhotoFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[13px] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[12px] file:font-semibold file:bg-zinc-900 file:text-white hover:file:bg-zinc-800 cursor-pointer"
                  />
                </div>
              )}

              {editingTask?.photo_url && (
                <div>
                  <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Foto Original</label>
                  <a href={editingTask.photo_url} target="_blank" rel="noreferrer">
                    <img src={editingTask.photo_url} alt="Incidencia" className="w-full h-32 object-cover rounded-xl border border-zinc-200" />
                  </a>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Ubicación</label>
                  <select 
                    value={formRoom} onChange={e => setFormRoom(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[15px] font-bold text-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                  >
                    {ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Estado</label>
                  <select 
                    value={formStatus} onChange={e => {
                      if (e.target.value === 'resuelta') {
                        if (editingTask) {
                          setShowModal(false);
                          handleOpenResolutionModal(editingTask);
                        } else {
                          alert("Para registrar una tarea como resuelta, primero créala en estado Nuevo/Pendiente/En Proceso y luego ciérrala con su evidencia correspondiente.");
                          setFormStatus('nuevo');
                        }
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

              {formStatus === 'resuelta' && (
                <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl animate-in fade-in slide-in-from-top-2">
                  <label className="block text-[12px] font-bold text-emerald-700 uppercase tracking-wider mb-2">Foto de Resolución (Opcional)</label>
                  {editingTask?.resolution_photo_url ? (
                    <a href={editingTask.resolution_photo_url} target="_blank" rel="noreferrer">
                      <img src={editingTask.resolution_photo_url} alt="Resolución" className="w-full h-32 object-cover rounded-xl border border-emerald-200 mb-2" />
                    </a>
                  ) : null}
                  <input 
                    type="file"
                    accept="image/*"
                    onChange={e => setResolutionPhotoFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-3 outline-none text-[13px] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[12px] file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer"
                  />
                  <p className="text-[11px] text-emerald-600 mt-2 font-medium">Puedes adjuntar una foto como evidencia del cierre (opcional).</p>
                </div>
              )}

              <div>
                <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Tipo de Tarea</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { id: 'aviso', label: 'Aviso', icon: Bell, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
                    { id: 'mantenimiento', label: 'Mtto.', icon: Wrench, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
                    { id: 'limpieza', label: 'Limp.', icon: Sparkles, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
                    { id: 'otro', label: 'Otro', icon: AlertTriangle, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' }
                  ].map(t => {
                    const Icon = t.icon;
                    const isActive = formType === t.id;
                    return (
                      <button
                        key={t.id} type="button"
                        onClick={() => setFormType(t.id)}
                        className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${isActive ? `${t.bg} ${t.border} ${t.color}` : 'border-zinc-100 bg-white text-zinc-400'}`}
                      >
                        <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                        <span className="text-[11px] font-bold">{t.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

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
                  type="file"
                  accept="image/*"
                  onChange={e => setResolvePhotoFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[13px] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[12px] file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer border-dashed border-2 border-zinc-200"
                />
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
    </div>
  );
}
