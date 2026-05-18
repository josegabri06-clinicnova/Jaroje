"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell, CheckCheck, Wrench, Sparkles, AlertTriangle, X, Clock,
  Plus, Send, ChevronDown, Image as ImageIcon
} from 'lucide-react';

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

const TYPE_CONFIG: Record<string, { label: string; dot: string; textColor: string; bgColor: string; borderColor: string }> = {
  limpieza:      { label: 'Limpieza',      dot: '#f59e0b', textColor: '#b45309', bgColor: '#fffbeb', borderColor: '#fde68a' },
  mantenimiento: { label: 'Mantenimiento', dot: '#ef4444', textColor: '#b91c1c', bgColor: '#fef2f2', borderColor: '#fecaca' },
  otro:          { label: 'Otro',          dot: '#3b82f6', textColor: '#1d4ed8', bgColor: '#eff6ff', borderColor: '#bfdbfe' },
  aviso:         { label: 'Aviso Admin',   dot: '#8b5cf6', textColor: '#6d28d9', bgColor: '#f5f3ff', borderColor: '#ddd6fe' },
};

const ICONS: Record<string, React.ElementType> = {
  limpieza: Sparkles, mantenimiento: Wrench, otro: AlertTriangle, aviso: Bell,
};

const ROOMS = ['General','A1','A2','A3','A4','A5','B1','B2','B3','B4','B5','C1','C2','C3','C4','C5','D1','D2','D3','D4','D5'];

function elapsed(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1)  return 'Ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `hace ${hrs}h` : `hace ${Math.floor(hrs / 24)}d`;
}

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
  const [open, setOpen]           = useState(false);
  const [tab, setTab]             = useState<'incidents' | 'create' | 'history'>('incidents');
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [unread, setUnread]       = useState(0);
  const [resolving, setResolving] = useState<string | null>(null);
  const [mounted, setMounted]     = useState(false);
  const [sheetHeight, setSheetHeight] = useState<number | undefined>(undefined);

  // Admin create form
  const [form, setForm]         = useState({ type: 'aviso', room: 'General', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent]         = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open) lockBody(); else unlockBody();
    return () => unlockBody();
  }, [open]);

  const fetchTasks = useCallback(async () => {
    try {
      const res  = await fetch('/api/tasks');
      const json = await res.json();
      if (json.success) {
        setTasks(json.data);
        setUnread(json.unread);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchTasks();
    const iv = setInterval(fetchTasks, 10_000);
    return () => clearInterval(iv);
  }, [fetchTasks]);

  const handleOpen = () => {
    setSheetHeight(window.innerHeight * 0.85); // Capture 85% of window height before keyboard opens
    setOpen(true);
    setTab('incidents');
    setUnread(0);
    fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read' }),
    });
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

  const sendAdminTask = async () => {
    if (!form.description.trim()) return;
    setSubmitting(true);
    await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, reported_by: 'Administración', direction: 'admin_to_staff' }),
    });
    setForm({ type: 'aviso', room: 'General', description: '' });
    setSent(true);
    setTimeout(() => { setSent(false); setTab('incidents'); fetchTasks(); }, 1500);
    setSubmitting(false);
  };

  const incidentTasks = tasks.filter(t => t.direction === 'staff_to_admin' && t.status !== 'resuelta');
  const historyTasks = tasks.filter(t => t.status === 'resuelta');

  const s = {
    overlay: { position: 'fixed' as const, inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column' as const, justifyContent: 'flex-end' },
    backdrop: { position: 'absolute' as const, inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' },
    panel: { position: 'relative' as const, background: 'white', borderRadius: '24px 24px 0 0', height: sheetHeight ? `${sheetHeight}px` : '85vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 -8px 40px rgba(0,0,0,0.15)', overflow: 'hidden' },
    handle: { display: 'flex', justifyContent: 'center', padding: '12px 0 4px', flexShrink: 0 as const },
    handleBar: { width: 40, height: 4, borderRadius: 9999, background: '#e4e4e7' },
  };

  const sheet = open && (
    <div style={s.overlay}>
      <div onClick={() => setOpen(false)} style={s.backdrop} />
      <div style={s.panel}>
        <div style={s.handle}><div style={s.handleBar} /></div>

        {/* Header */}
        <div style={{ padding: '8px 20px 12px', borderBottom: '1px solid #f4f4f5', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#18181b', margin: 0 }}>Panel de Incidencias</p>
            <button onClick={() => setOpen(false)} style={{ width: 32, height: 32, borderRadius: 10, background: '#f4f4f5', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={15} color="#71717a" strokeWidth={2.5} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, background: '#f4f4f5', padding: 4, borderRadius: 12 }}>
            {[
              { key: 'incidents', label: `Activas${incidentTasks.length > 0 ? ` (${incidentTasks.length})` : ''}` },
              { key: 'history',   label: `Historial${historyTasks.length > 0 ? ` (${historyTasks.length})` : ''}` }
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)} style={{
                flex: 1, padding: '8px 2px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, transition: 'all 0.15s',
                background: tab === t.key ? 'white' : 'transparent',
                color: tab === t.key ? '#18181b' : '#71717a',
                boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

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
                        <button onClick={() => resolve(task.id)} disabled={resolving === task.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#22c55e', color: 'white', fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', opacity: resolving === task.id ? 0.6 : 1 }}>
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

          {/* ── TAB: Historial ── */}
          {tab === 'history' && (
            historyTasks.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                <Clock size={24} color="#a1a1aa" />
                <p style={{ fontSize: 13, color: '#71717a', margin: 0 }}>Aún no hay incidencias resueltas</p>
              </div>
            ) : (
              historyTasks.map(task => {
                const cfg = TYPE_CONFIG[task.type] || TYPE_CONFIG.otro;
                const Icon = ICONS[task.type] || AlertTriangle;
                return (
                  <div key={task.id} style={{ borderRadius: 16, border: `1.5px solid #f4f4f5`, background: '#fafafa', overflow: 'hidden', opacity: 0.85, flexShrink: 0 }}>
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 8, background: '#e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={12} color="#71717a" />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#52525b' }}>{cfg.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa', background: 'white', padding: '2px 8px', borderRadius: 999, border: '1px solid #e4e4e7' }}>Hab. {task.room}</span>
                      </div>
                      {task.description && (
                        <p style={{ fontSize: 12, color: '#a1a1aa', lineHeight: 1.5, margin: '0 0 10px', paddingLeft: 34 }}>{task.description}</p>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 10, borderTop: '1px solid #f4f4f5' }}>
                        <CheckCheck size={14} color="#22c55e" />
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e' }}>Resuelta {task.resolved_at ? elapsed(task.resolved_at) : 'recientemente'}</span>
                        <span style={{ fontSize: 11, color: '#a1a1aa', marginLeft: 'auto' }}>por {task.reported_by}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          )}


        </div>
      </div>
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
