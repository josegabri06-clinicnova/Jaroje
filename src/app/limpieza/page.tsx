"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Trash2, Download, Database, Sparkles, Clock, 
  Wrench, History, AlertTriangle, CheckCircle2, X, ChevronLeft, Calendar
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { format, subDays, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';

// Inicializar cliente de Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type DataType = 'logs' | 'tasks';

export default function LimpiezaDatosPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DataType>('logs');
  const [logs, setLogs] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Confirmación Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [backedUpConfirmed, setBackedUpConfirmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Éxito / Feedback
  const [toastMessage, setToastMessage] = useState('');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [logsRes, tasksRes] = await Promise.all([
        fetch('/api/employee-logs'),
        fetch('/api/tasks?status=resuelta')
      ]);

      const logsJson = await logsRes.json();
      const tasksJson = await tasksRes.json();

      if (logsJson.success) setLogs(logsJson.data || []);
      if (tasksJson.success) {
        // Asegurarnos de mostrar solo tareas con estado resuelta
        setTasks((tasksJson.data || []).filter((t: any) => t.status === 'resuelta'));
      }
    } catch (e) {
      console.error("Error al cargar datos históricos para limpieza:", e);
    } finally {
      setIsLoading(false);
      setSelectedIds(new Set());
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const activeData = activeTab === 'logs' ? logs : tasks;

  // Manejo de Selección de Fila
  const handleToggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Checkbox Maestro (Seleccionar todo / nada)
  const handleToggleAll = () => {
    if (selectedIds.size === activeData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeData.map(item => String(item.id))));
    }
  };

  // Botones Rápidos de Selección por Antigüedad
  const handleQuickSelect = (days: number) => {
    const cutoffDate = subDays(new Date(), days);
    const matched = activeData.filter(item => {
      const itemDate = new Date(item.created_at || item.resolved_at);
      return isBefore(itemDate, cutoffDate);
    });

    if (matched.length === 0) {
      setToastMessage(`⚠️ Ningún registro tiene más de ${days} días.`);
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    setSelectedIds(new Set(matched.map(item => String(item.id))));
    setToastMessage(`✓ Seleccionados ${matched.length} registros anteriores a ${days} días.`);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(activeData.map(item => String(item.id))));
  };

  // Exportar a JSON
  const handleExportJSON = () => {
    if (selectedIds.size === 0) {
      alert("Selecciona al menos un registro para descargar.");
      return;
    }

    const itemsToExport = activeData.filter(item => selectedIds.has(String(item.id)));
    const filename = `respaldo_jaroje_${activeTab}_${format(new Date(), 'yyyy-MM-dd')}.json`;
    const jsonStr = JSON.stringify(itemsToExport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setToastMessage("📥 ¡Respaldo JSON descargado con éxito!");
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Exportar a CSV
  const handleExportCSV = () => {
    if (selectedIds.size === 0) {
      alert("Selecciona al menos un registro para descargar.");
      return;
    }

    const itemsToExport = activeData.filter(item => selectedIds.has(String(item.id)));
    let csvContent = "";

    if (activeTab === 'logs') {
      const headers = ["ID", "Fecha", "Empleado", "Módulo", "Acción", "Habitación", "Detalles"];
      csvContent = [
        headers.join(","),
        ...itemsToExport.map(item => [
          item.id,
          format(new Date(item.created_at), 'yyyy-MM-dd HH:mm'),
          `"${(item.employee_name || 'Sistema').replace(/"/g, '""')}"`,
          `"${(item.module || 'recepcion').replace(/"/g, '""')}"`,
          `"${(item.action || '').replace(/"/g, '""')}"`,
          `"${(item.room || 'General').replace(/"/g, '""')}"`,
          `"${(item.details || '').replace(/"/g, '""')}"`
        ].join(","))
      ].join("\n");
    } else {
      const headers = ["ID", "Fecha Reporte", "Fecha Resolución", "Ubicación", "Reportado Por", "Descripción"];
      csvContent = [
        headers.join(","),
        ...itemsToExport.map(item => [
          item.id,
          format(new Date(item.created_at), 'yyyy-MM-dd HH:mm'),
          item.resolved_at ? format(new Date(item.resolved_at), 'yyyy-MM-dd HH:mm') : '—',
          `"${(item.room || 'General').replace(/"/g, '""')}"`,
          `"${(item.reported_by || 'Staff').replace(/"/g, '""')}"`,
          `"${(item.description || '').replace(/"/g, '""')}"`
        ].join(","))
      ].join("\n");
    }

    const filename = `respaldo_jaroje_${activeTab}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setToastMessage("📥 ¡Respaldo CSV descargado con éxito!");
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Procesar Borrado Físico
  const handlePurgeSubmit = async () => {
    if (!backedUpConfirmed) {
      alert("Por favor, confirma que has descargado un respaldo de los datos.");
      return;
    }

    setIsDeleting(true);
    try {
      const idsArray = Array.from(selectedIds);
      const url = activeTab === 'logs' ? '/api/employee-logs' : '/api/tasks';

      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsArray })
      });

      const json = await res.json();
      if (json.success) {
        setToastMessage(`🔥 Se eliminaron permanentemente ${idsArray.length} registros.`);
        setTimeout(() => setToastMessage(''), 4000);
        setShowConfirmModal(false);
        setBackedUpConfirmed(false);
        fetchData();
      } else {
        throw new Error(json.error || "Error en el servidor");
      }
    } catch (e: any) {
      console.error(e);
      alert(`Error al eliminar datos: ${e.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 flex flex-col min-h-screen bg-[#fafafa] pb-24 px-4 sm:px-6">
      
      {/* Header Premium con Botón de Regresar */}
      <div className="flex flex-col gap-2 mt-4">
        <Link href="/" className="inline-flex items-center gap-1 text-[13px] font-bold text-zinc-500 hover:text-zinc-950 transition-colors w-fit">
          <ChevronLeft size={14} strokeWidth={2.5} />
          <span>Volver al Dashboard</span>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
              <Database size={22} className="text-zinc-700" />
              Depuración y Limpieza
            </h2>
            <p className="text-[13px] font-medium text-zinc-500">Gobernanza de Datos Históricos de Jaroje Hotel OS</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-zinc-200/60 p-1 rounded-2xl gap-1">
        <button 
          onClick={() => { setActiveTab('logs'); setSelectedIds(new Set()); }}
          className={`flex-1 py-2.5 text-[12px] font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'logs' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
        >
          <History size={14} />
          <span>Historial de Auditoría ({logs.length})</span>
        </button>
        <button 
          onClick={() => { setActiveTab('tasks'); setSelectedIds(new Set()); }}
          className={`flex-1 py-2.5 text-[12px] font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'tasks' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
        >
          <Wrench size={14} />
          <span>Mantenimiento Resuelto ({tasks.length})</span>
        </button>
      </div>

      {/* Caja de Herramientas de Depuración */}
      <div className="bg-white border border-zinc-200 rounded-[24px] p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles size={12} /> Acciones por Lote
          </span>
          <p className="text-[11px] text-zinc-400 font-semibold">Selecciona datos antiguos para procesar de forma masiva.</p>
        </div>

        {/* Botones de Selección Rápida */}
        <div className="flex items-center gap-2 flex-wrap border-b border-zinc-100 pb-4">
          <span className="text-[11px] font-extrabold text-zinc-500 mr-1">Antigüedad:</span>
          <button 
            onClick={() => handleQuickSelect(30)}
            className="px-3 py-1.5 bg-zinc-550 border border-zinc-200 text-zinc-700 hover:bg-zinc-100 rounded-xl text-[11px] font-bold transition-all"
          >
            &gt; 30 días
          </button>
          <button 
            onClick={() => handleQuickSelect(90)}
            className="px-3 py-1.5 bg-zinc-550 border border-zinc-200 text-zinc-700 hover:bg-zinc-100 rounded-xl text-[11px] font-bold transition-all"
          >
            &gt; 90 días
          </button>
          <button 
            onClick={handleSelectAll}
            className="px-3 py-1.5 bg-zinc-550 border border-zinc-200 text-zinc-700 hover:bg-zinc-100 rounded-xl text-[11px] font-bold transition-all"
          >
            Seleccionar Todos
          </button>
        </div>

        {/* Acciones principales basadas en la selección */}
        <div className="flex items-center justify-between gap-4 flex-wrap pt-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-zinc-800">
              Seleccionados: <span className="text-zinc-950 font-black">{selectedIds.size}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Exportar JSON */}
            <button
              onClick={handleExportJSON}
              disabled={selectedIds.size === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 disabled:opacity-50 rounded-xl text-[12px] font-extrabold transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
            >
              <Download size={14} className="text-zinc-600" />
              <span>Respaldo JSON</span>
            </button>
            {/* Exportar CSV */}
            <button
              onClick={handleExportCSV}
              disabled={selectedIds.size === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 disabled:opacity-50 rounded-xl text-[12px] font-extrabold transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
            >
              <Download size={14} className="text-zinc-600" />
              <span>Respaldo CSV</span>
            </button>

            {/* Eliminar permanentemente */}
            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={selectedIds.size === 0}
              className="inline-flex items-center gap-1.5 px-4.5 py-2.5 bg-rose-650 hover:bg-rose-600 text-white disabled:opacity-40 rounded-xl text-[12px] font-black tracking-wide shadow-sm active:scale-[0.97] transition-all cursor-pointer"
            >
              <Trash2 size={14} />
              <span>Purgar Selección</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de Datos Interactiva */}
      <div className="bg-white border border-zinc-200 rounded-[28px] shadow-sm overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="p-16 flex justify-center items-center">
            <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
          </div>
        ) : activeData.length === 0 ? (
          <div className="p-16 text-center text-zinc-400 text-[13px] font-medium">
            No hay registros disponibles en esta sección.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-150">
                  <th className="p-4 w-12 text-center">
                    <input 
                      type="checkbox"
                      checked={selectedIds.size === activeData.length}
                      onChange={handleToggleAll}
                      className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                    />
                  </th>
                  <th className="p-4 text-[10.5px] font-bold text-zinc-400 uppercase tracking-wider">Fecha</th>
                  {activeTab === 'logs' ? (
                    <>
                      <th className="p-4 text-[10.5px] font-bold text-zinc-400 uppercase tracking-wider">Empleado</th>
                      <th className="p-4 text-[10.5px] font-bold text-zinc-400 uppercase tracking-wider">Módulo</th>
                      <th className="p-4 text-[10.5px] font-bold text-zinc-400 uppercase tracking-wider">Acción</th>
                      <th className="p-4 text-[10.5px] font-bold text-zinc-400 uppercase tracking-wider">Habitación</th>
                      <th className="p-4 text-[10.5px] font-bold text-zinc-400 uppercase tracking-wider">Detalles</th>
                    </>
                  ) : (
                    <>
                      <th className="p-4 text-[10.5px] font-bold text-zinc-400 uppercase tracking-wider">Ubicación</th>
                      <th className="p-4 text-[10.5px] font-bold text-zinc-400 uppercase tracking-wider">Reportado Por</th>
                      <th className="p-4 text-[10.5px] font-bold text-zinc-400 uppercase tracking-wider">Descripción</th>
                      <th className="p-4 text-[10.5px] font-bold text-zinc-400 uppercase tracking-wider">Resolución</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {activeData.map((item) => {
                  const isChecked = selectedIds.has(String(item.id));
                  const itemDateStr = format(new Date(item.created_at), 'dd MMM yyyy HH:mm', { locale: es });
                  
                  return (
                    <tr 
                      key={item.id}
                      onClick={() => handleToggleRow(String(item.id))}
                      className={`hover:bg-zinc-50/50 transition-colors cursor-pointer ${isChecked ? 'bg-zinc-50/80' : ''}`}
                    >
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleRow(String(item.id))}
                          className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                        />
                      </td>
                      <td className="p-4 text-[12px] font-bold text-zinc-700 whitespace-nowrap">{itemDateStr}</td>
                      
                      {activeTab === 'logs' ? (
                        <>
                          <td className="p-4 text-[13px] font-bold text-zinc-900 capitalize">{item.employee_name || 'Sistema'}</td>
                          <td className="p-4 text-[11px] font-black uppercase text-zinc-500">
                            <span className="bg-zinc-100 px-1.5 py-0.5 border border-zinc-200 rounded">
                              {item.module}
                            </span>
                          </td>
                          <td className="p-4 text-[12px] font-semibold text-zinc-800 whitespace-nowrap">{item.action?.replace(/_/g, ' ')}</td>
                          <td className="p-4 text-[12px] font-extrabold text-zinc-650">{item.room || 'General'}</td>
                          <td className="p-4 text-[12px] text-zinc-500 max-w-xs truncate font-medium">{item.details}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-4 text-[12px] font-extrabold text-zinc-650">{item.room}</td>
                          <td className="p-4 text-[13px] font-bold text-zinc-950">{item.reported_by}</td>
                          <td className="p-4 text-[12px] text-zinc-500 max-w-xs truncate font-medium">{item.description}</td>
                          <td className="p-4 text-[11px] font-semibold text-emerald-600 whitespace-nowrap flex items-center gap-1 mt-2.5">
                            <CheckCircle2 size={12} />
                            <span>Resuelta</span>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Advertencia Seguro (Doble Confirmación) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 border border-rose-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                <AlertTriangle className="text-rose-600 animate-bounce" size={24} />
                Confirmación de Purga Permanente
              </h3>
              <button onClick={() => setShowConfirmModal(false)} className="w-8 h-8 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors">
                <X size={16} strokeWidth={3} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-rose-50 border border-rose-150 p-4.5 rounded-2xl">
                <p className="text-[13px] font-semibold text-rose-800 leading-relaxed">
                  ⚠️ <strong>¡CUIDADO!</strong> Estás a punto de eliminar de forma permanente <span className="font-black text-rose-900 underline">{selectedIds.size} registros</span> de la sección <strong>{activeTab === 'logs' ? 'Historial de Auditoría' : 'Mantenimiento Resuelto'}</strong> de la base de datos de Supabase.
                </p>
                <p className="text-[11.5px] text-rose-700 mt-2 font-medium">
                  Esta acción es física, inmediata e irreversible. Los datos no podrán recuperarse.
                </p>
              </div>

              {/* Checkbox de Confirmación */}
              <label className="flex items-start gap-3 p-3.5 border border-zinc-200 hover:border-zinc-300 rounded-2xl cursor-pointer select-none transition-colors">
                <input 
                  type="checkbox"
                  checked={backedUpConfirmed}
                  onChange={(e) => setBackedUpConfirmed(e.target.checked)}
                  className="w-5 h-5 rounded border-zinc-300 text-rose-650 focus:ring-rose-600 mt-0.5 shrink-0"
                />
                <div className="text-[12px] font-bold text-zinc-800 leading-tight">
                  <span>Confirmo que he descargado una copia de seguridad en JSON o CSV y la he guardado en mi equipo local para futuras referencias.</span>
                </div>
              </label>

              {/* Botones de acción final */}
              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isDeleting}
                  className="flex-1 py-3.5 bg-zinc-100 border border-zinc-200 text-zinc-700 font-bold rounded-2xl hover:bg-zinc-200 transition-all text-center text-[13px] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handlePurgeSubmit}
                  disabled={!backedUpConfirmed || isDeleting}
                  className="flex-1 py-3.5 bg-rose-600 disabled:opacity-40 hover:bg-rose-700 text-white font-extrabold rounded-2xl transition-all text-center text-[13px] flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  {isDeleting ? 'Borrando...' : `Purgar permanentemente ✓`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-4 right-4 z-[9999] animate-in fade-in slide-in-from-bottom-5">
          <div className="bg-zinc-900 text-white text-[13.5px] font-bold px-5 py-4 rounded-2xl text-center shadow-2xl flex items-center justify-center gap-2.5 max-w-md mx-auto border border-zinc-800">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

    </div>
  );
}
