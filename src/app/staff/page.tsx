"use client";

import { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  CheckCircle2, AlertTriangle, Wrench, Sparkles, BedDouble,
  ArrowDownLeft, ArrowUpRight, Clock, Plus, X, Send,
  ChevronDown, CheckCheck, Camera, Bell, Package, Minus
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Reserva { id: string; room: string; guest_name?: string; check_in: string; check_out: string; }
interface Task { id: string; type: string; room: string; description: string; status: string; reported_by: string; direction: string; created_at: string; image_base64?: string; }

const ROOMS = ['A1','A2','A3','A4','A5','B1','B2','B3','B4','B5','C1','C2','C3','C4','C5','D1','D2','D3','D4','D5'];
const TYPE_CFG: Record<string, any> = {
  limpieza:      { icon: Sparkles,      label: 'Limpieza',      bg: '#fffbeb', border: '#fde68a', text: '#b45309', dot: '#f59e0b' },
  mantenimiento: { icon: Wrench,        label: 'Mantenimiento', bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', dot: '#ef4444' },
  otro:          { icon: AlertTriangle, label: 'Otro',          bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', dot: '#3b82f6' },
  aviso:         { icon: Bell,          label: 'Aviso Admin',   bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9', dot: '#8b5cf6' },
};
const elapsed = (d: string) => { const m = Math.floor((Date.now()-new Date(d).getTime())/60000); if(m<1)return'Ahora mismo'; if(m<60)return`${m} min`; const h=Math.floor(m/60); return h<24?`${h}h`:`${Math.floor(h/24)}d`; };

async function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 900; let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { if (w > h) { h = (h*MAX)/w; w=MAX; } else { w=(w*MAX)/h; h=MAX; } }
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
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [taskTab, setTaskTab]   = useState<'activas' | 'historial'>('activas');
  const [mainTab, setMainTab]   = useState<'tareas' | 'inventario'>('tareas');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const staffName = typeof window !== 'undefined' ? (localStorage.getItem('jaroje_staff_name') || 'Personal') : 'Personal';
  const role = typeof window !== 'undefined' ? localStorage.getItem('jaroje_role') : 'staff';
  const isMantenimiento = role === 'staff_mantenimiento';
  const isLimpieza = role === 'staff_limpieza';
  const [form, setForm] = useState({ type: isMantenimiento ? 'mantenimiento' : 'limpieza', room: ROOMS[0], description: '' });
  const todayStr = new Date().toISOString().split('T')[0];

  // Lock body on modal open
  useEffect(() => {
    if (showForm) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
    return () => { document.body.style.overflow=''; document.body.style.position=''; document.body.style.width=''; };
  }, [showForm]);

  const fetchData = async () => {
    try {
      const [r, t, inv] = await Promise.all([
        fetch('/api/reservas'), 
        fetch('/api/tasks'),
        supabase.from('inventory').select('*').order('category').order('item_name')
      ]);
      const rj = await r.json(); const tj = await t.json();
      if (rj.success && rj.data) setReservas(rj.data);
      if (tj.success) setTasks(tj.data);
      if (inv.data) setInventory(inv.data);
    } catch {}
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 10_000);
    return () => clearInterval(iv);
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
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_status', id, status }),
    });
    fetchData();
  };

  const updateStock = async (id: string, currentStock: number, change: number) => {
    if (currentStock + change < 0) return;
    setInventory(prev => prev.map(item => item.id === id ? { ...item, stock: item.stock + change } : item));
    await supabase.from('inventory').update({ stock: currentStock + change, last_updated_by: staffName }).eq('id', id);
  };

  const markAsClean = async (room: string) => {
    // Prevent double clicking by adding a temporary optimistic task
    const tempTask: Task = { id: Math.random().toString(), type: 'limpieza', room, description: 'Habitación limpia y lista para check-in.', status: 'resuelta', reported_by: staffName, direction: 'staff_to_admin', created_at: new Date().toISOString() };
    setTasks(prev => [tempTask, ...prev]);
    
    await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'limpieza', room, description: 'Habitación limpia y lista para check-in.', reported_by: staffName, direction: 'staff_to_admin', status: 'resuelta' }),
    });
    fetchData();
  };

  const isRoomClean = (roomName: string) => {
    return tasks.some(t => t.room === roomName && t.type === 'limpieza' && t.status === 'resuelta' && t.created_at.startsWith(todayStr));
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
    await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, reported_by: staffName, direction: 'staff_to_admin', image_base64: imagePreview }),
    });
    setForm({ type: 'limpieza', room: ROOMS[0], description: '' });
    setImagePreview(null);
    setShowForm(false);
    setSuccessMsg('¡Incidencia enviada!');
    fetchData();
    setTimeout(() => setSuccessMsg(''), 3000);
    setSubmitting(false);
  };

  const Card = ({ children, borderColor = '#f4f4f5' }: any) => (
    <div style={{ background: 'white', borderRadius: 18, border: `1px solid ${borderColor}`, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>{children}</div>
  );
  const SectionHead = ({ icon, title, count, color = '#52525b', onAction, actionLabel }: any) => (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', borderBottom:'1px solid #f9f9f9' }}>
      <div style={{ width:26, height:26, borderRadius:8, background:'#f4f4f5', display:'flex', alignItems:'center', justifyContent:'center' }}>{icon}</div>
      <span style={{ fontSize:14, fontWeight:700, color:'#18181b' }}>{title}</span>
      {count > 0 && <span style={{ fontSize:11, fontWeight:700, color, background: color+'22', padding:'2px 8px', borderRadius:999 }}>{count}</span>}
      {onAction && (
        <button onClick={onAction} style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, background:'#2563eb', color:'white', fontSize:12, fontWeight:700, padding:'8px 14px', borderRadius:10, border:'none', cursor:'pointer' }}>
          <Plus size={12}/>{actionLabel}
        </button>
      )}
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#f5f5f7', paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg, #2563eb, #1d4ed8)', padding:'20px 20px 32px' }}>
        <p style={{ color:'#93c5fd', fontSize:12, fontWeight:500, margin:'0 0 4px', textTransform:'capitalize' }}>
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}
        </p>
        <h1 style={{ color:'white', fontSize:24, fontWeight:800, margin:'0 0 2px' }}>
          {isMantenimiento ? 'Mantenimiento' : 'Limpieza'}
        </h1>
        <p style={{ color:'#93c5fd', fontSize:13, margin:0 }}>Bienvenido/a, {staffName}</p>
      </div>

      <div style={{ padding:'0 16px', marginTop:-16, display:'flex', flexDirection:'column', gap:14 }}>
        
        {/* Main Tabs */}
        <div style={{ display: 'flex', gap: 8, background: '#e4e4e7', padding: 4, borderRadius: 12, marginBottom: 4 }}>
          <button onClick={() => setMainTab('tareas')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 800, background: mainTab === 'tareas' ? 'white' : 'transparent', color: mainTab === 'tareas' ? '#18181b' : '#71717a', boxShadow: mainTab === 'tareas' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none', cursor: 'pointer', transition: 'all 0.15s' }}>{isMantenimiento ? 'Incidencias' : 'Tareas & Limpieza'}</button>
          <button onClick={() => setMainTab('inventario')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 800, background: mainTab === 'inventario' ? 'white' : 'transparent', color: mainTab === 'inventario' ? '#18181b' : '#71717a', boxShadow: mainTab === 'inventario' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none', cursor: 'pointer', transition: 'all 0.15s' }}>Inventario</button>
        </div>

        {mainTab === 'tareas' ? (
          <>
            {/* KPIs */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {[
            { label:'Llegan', value:llegadas.length, color:'#22c55e' },
            { label:'Salen',  value:salidas.length,  color:'#ef4444' },
            { label:'Ocupadas',value:ocupadas.length, color:'#3b82f6' },
          ].map((k,i)=>(
            <div key={i} style={{ background:'white', borderRadius:16, padding:'14px 12px', border:'1px solid #f4f4f5', boxShadow:'0 1px 6px rgba(0,0,0,0.05)' }}>
              <p style={{ fontSize:26, fontWeight:800, color:'#18181b', margin:'0 0 2px' }}>{k.value}</p>
              <p style={{ fontSize:11, fontWeight:700, color:'#a1a1aa', textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{k.label}</p>
            </div>
          ))}
        </div>

        {/* Llegadas */}
        {(!isMantenimiento && llegadas.length > 0) && (
          <Card>
            <SectionHead icon={<ArrowDownLeft size={13} color="#16a34a"/>} title="Check-in hoy" count={llegadas.length} color="#16a34a"/>
            {llegadas.map((r,i)=>(
              <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom: i<llegadas.length-1?'1px solid #f9f9f9':'none' }}>
                <div style={{ width:38, height:38, borderRadius:12, background:'#f0fdf4', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <BedDouble size={16} color="#16a34a"/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:14, fontWeight:700, color:'#18181b', margin:'0 0 2px' }}>{r.room||'Sin asignar'}</p>
                  <p style={{ fontSize:12, color:'#a1a1aa', margin:0 }}>{r.guest_name||'Huésped'}</p>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:'#16a34a', background:'#f0fdf4', border:'1px solid #bbf7d0', padding:'5px 10px', borderRadius:10 }}>Hoy</span>
              </div>
            ))}
          </Card>
        )}

        {/* Salidas */}
        {!isMantenimiento && (
          <Card>
            <SectionHead icon={<Sparkles size={13} color="#d97706"/>} title="Limpieza requerida hoy" count={salidas.length} color="#d97706"/>
            {salidas.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#a1a1aa', margin: 0 }}>No hay check-outs programados para hoy.</p>
              </div>
            ) : (
              salidas.map((r,i) => {
                const cleaned = isRoomClean(r.room || '');
                return (
                  <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom: i<salidas.length-1?'1px solid #f9f9f9':'none' }}>
                    <div style={{ width:38, height:38, borderRadius:12, background: cleaned ? '#f0fdf4' : '#fffbeb', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      {cleaned ? <CheckCircle2 size={16} color="#16a34a"/> : <Sparkles size={16} color="#d97706"/>}
                    </div>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:14, fontWeight:700, color:'#18181b', margin:'0 0 2px' }}>{r.room||'Sin asignar'}</p>
                      <p style={{ fontSize:12, color:'#a1a1aa', margin:0 }}>{cleaned ? 'Habitación lista' : 'Sale hoy · Preparar habitación'}</p>
                    </div>
                    {cleaned ? (
                      <span style={{ fontSize:11, fontWeight:700, color:'#16a34a', background:'#f0fdf4', padding:'6px 12px', borderRadius:10, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={12} /> Lista
                      </span>
                    ) : (
                      <button 
                        onClick={() => markAsClean(r.room || '')}
                        className="active:scale-95"
                        style={{ fontSize:11, fontWeight:700, color:'white', background:'#d97706', border:'none', padding:'8px 14px', borderRadius:10, cursor: 'pointer', transition: 'all 0.1s' }}
                      >
                        Marcar Lista
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </Card>
        )}

        {/* Mis incidencias */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #f9f9f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={13} color="#52525b" />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#18181b' }}>Mis incidencias</span>
            </div>
            <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2563eb', color: 'white', fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer' }}>
              <Plus size={12} /> Reportar
            </button>
          </div>

          <div style={{ padding: '8px 16px', background: '#fafafa', borderBottom: '1px solid #f4f4f5' }}>
            <div style={{ display: 'flex', gap: 8, background: '#e4e4e7', padding: 4, borderRadius: 10 }}>
              <button onClick={() => setTaskTab('activas')} style={{ flex: 1, padding: '6px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, background: taskTab === 'activas' ? 'white' : 'transparent', color: taskTab === 'activas' ? '#18181b' : '#71717a', boxShadow: taskTab === 'activas' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: 'all 0.15s' }}>Activas ({activas.length})</button>
              <button onClick={() => setTaskTab('historial')} style={{ flex: 1, padding: '6px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, background: taskTab === 'historial' ? 'white' : 'transparent', color: taskTab === 'historial' ? '#18181b' : '#71717a', boxShadow: taskTab === 'historial' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: 'all 0.15s' }}>Historial ({historial.length})</button>
            </div>
          </div>

          {taskTab === 'activas' ? (
            activas.length === 0 ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 16px', gap:10 }}>
                <CheckCircle2 size={28} color="#22c55e"/>
                <p style={{ fontSize:13, color:'#71717a', margin:0 }}>Sin incidencias activas</p>
              </div>
            ) : (
              activas.map((t,i) => {
                const cfg = TYPE_CFG[t.type] || TYPE_CFG.otro;
                const Icon = cfg.icon;
                return (
                  <div key={t.id} style={{ padding:'16px', borderBottom: i<activas.length-1?'1px solid #f9f9f9':'none' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <div style={{ width:28, height:28, borderRadius:9, background:cfg.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Icon size={13} color={cfg.text}/>
                      </div>
                      <span style={{ fontSize:13, fontWeight:700, color:cfg.text }}>{cfg.label}</span>
                      <span style={{ fontSize:11, fontWeight:600, color:'#71717a', background:'#f4f4f5', padding:'2px 8px', borderRadius:999 }}>{t.room === 'General' ? 'Todos' : `Hab. ${t.room}`}</span>
                      <span style={{ marginLeft:'auto', fontSize:10, color:'#a1a1aa' }}>{elapsed(t.created_at)}</span>
                    </div>
                    {t.description && <p style={{ fontSize:13, color:'#52525b', lineHeight:1.5, margin:'0 0 12px', paddingLeft:36 }}>{t.description}</p>}
                    {t.image_base64 && (
                      <div style={{ paddingLeft:36, marginBottom:12 }}>
                        <img src={t.image_base64} alt="foto" style={{ width:'100%', maxHeight:180, objectFit:'cover', borderRadius:10, border:'1px solid #e4e4e7' }}/>
                      </div>
                    )}
                    <div style={{ paddingLeft:36, display: 'flex', gap: 6 }}>
                      <button 
                        onClick={() => updateTaskStatus(t.id, 'en_proceso')}
                        style={{ flex: 1, padding: '6px', borderRadius: 8, border: t.status === 'en_proceso' ? '1px solid #3b82f6' : '1px solid #e4e4e7', background: t.status === 'en_proceso' ? '#eff6ff' : 'white', color: t.status === 'en_proceso' ? '#2563eb' : '#71717a', fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                      >
                        En Proceso
                      </button>
                      <button 
                        onClick={() => updateTaskStatus(t.id, 'resuelta')}
                        style={{ flex: 1, padding: '6px', borderRadius: 8, border: '1px solid #e4e4e7', background: 'white', color: '#16a34a', fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                      >
                        ✓ Marcar Resuelta
                      </button>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            historial.length === 0 ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 16px', gap:10 }}>
                <Clock size={28} color="#a1a1aa"/>
                <p style={{ fontSize:13, color:'#71717a', margin:0 }}>Historial vacío</p>
              </div>
            ) : (
              historial.map((t,i) => {
                const cfg = TYPE_CFG[t.type] || TYPE_CFG.otro;
                const Icon = cfg.icon;
                return (
                  <div key={t.id} style={{ padding:'14px 16px', borderBottom: i<historial.length-1?'1px solid #f9f9f9':'none', opacity: 0.85, background: '#fafafa' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <div style={{ width:26, height:26, borderRadius:8, background:'#e4e4e7', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Icon size={12} color="#71717a"/>
                      </div>
                      <span style={{ fontSize:13, fontWeight:600, color:'#52525b' }}>{cfg.label}</span>
                      <span style={{ fontSize:11, fontWeight:600, color:'#a1a1aa', background:'white', padding:'2px 8px', borderRadius:999, border: '1px solid #e4e4e7' }}>Hab. {t.room}</span>
                    </div>
                    {t.description && <p style={{ fontSize:12, color:'#a1a1aa', lineHeight:1.5, margin:'0 0 8px', paddingLeft:34 }}>{t.description}</p>}
                    <div style={{ paddingLeft:34, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCheck size={14} color="#22c55e" />
                      <span style={{ fontSize:11, fontWeight:600, color: '#22c55e' }}>Resuelta por {t.reported_by === staffName ? 'Admin/Personal' : t.reported_by}</span>
                      <span style={{ marginLeft:'auto', fontSize:10, color:'#a1a1aa' }}>{elapsed(t.created_at)}</span>
                    </div>
                  </div>
                );
              })
            )
          )}
        </Card>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card>
              <SectionHead icon={<Package size={13} color="#ea580c"/>} title="Stock Actual" count={inventory.length} color="#ea580c"/>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {inventory.map((item, index) => {
                  const isLow = item.stock <= item.min_stock;
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: isLow ? '#fff1f2' : 'white', borderBottom: index < inventory.length - 1 ? '1px solid #f9f9f9' : 'none' }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#18181b', margin: '0 0 2px' }}>{item.item_name}</p>
                        <p style={{ fontSize: 11, fontWeight: 600, color: isLow ? '#e11d48' : '#a1a1aa', margin: 0 }}>Stock: {item.stock} <span style={{ opacity: 0.5 }}>(Min: {item.min_stock})</span></p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f4f4f5', padding: 4, borderRadius: 10 }}>
                        <button onClick={() => updateStock(item.id, item.stock, -1)} disabled={item.stock===0} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', color: '#52525b', opacity: item.stock===0?0.5:1 }}><Minus size={16} strokeWidth={2.5}/></button>
                        <span style={{ width: 28, textAlign: 'center', fontSize: 14, fontWeight: 800, color: '#18181b' }}>{item.stock}</span>
                        <button onClick={() => updateStock(item.id, item.stock, 1)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#18181b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', color: 'white' }}><Plus size={16} strokeWidth={2.5}/></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Toast */}
      {successMsg && (
        <div style={{ position:'fixed', bottom:24, left:16, right:16, zIndex:9000 }}>
          <div style={{ background:'#18181b', color:'white', fontSize:13, fontWeight:600, padding:'14px 20px', borderRadius:16, textAlign:'center', boxShadow:'0 8px 30px rgba(0,0,0,0.2)', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <CheckCheck size={16} color="#22c55e"/>{successMsg}
          </div>
        </div>
      )}

      {/* Modal nueva incidencia */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
          <div onClick={() => setShowForm(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}/>
          <div style={{ position:'relative', background:'white', borderRadius:'24px 24px 0 0', boxShadow:'0 -8px 40px rgba(0,0,0,0.15)', maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            
            {/* Handle */}
            <div style={{ display:'flex', justifyContent:'center', padding:'12px 0 4px', flexShrink:0 }}>
              <div style={{ width:40, height:4, borderRadius:999, background:'#e4e4e7' }}/>
            </div>

            {/* Header modal */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 20px 16px', flexShrink:0 }}>
              <h3 style={{ fontSize:18, fontWeight:800, color:'#18181b', margin:0 }}>Nueva Incidencia</h3>
              <button onClick={() => setShowForm(false)} style={{ width:32, height:32, borderRadius:10, background:'#f4f4f5', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <X size={15} color="#71717a" strokeWidth={2.5}/>
              </button>
            </div>

            {/* Scroll content */}
            <div style={{ overflowY:'auto', flex:1, padding:'0 20px 20px', display:'flex', flexDirection:'column', gap:18 }}>

              {/* Tipo */}
              <div>
                <p style={{ fontSize:11, fontWeight:700, color:'#a1a1aa', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Tipo de incidencia</p>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  {(['limpieza','mantenimiento','otro'] as const).map(k => {
                    const cfg = TYPE_CFG[k];
                    const Icon = cfg.icon;
                    const active = form.type === k;
                    return (
                      <button key={k} onClick={() => setForm(f=>({...f,type:k}))} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'14px 8px', borderRadius:14, border: `2px solid ${active ? cfg.border : '#f4f4f5'}`, background: active ? cfg.bg : '#fafafa', cursor:'pointer', transition:'all 0.15s' }}>
                        <div style={{ width:34, height:34, borderRadius:10, background: active ? 'white' : '#f4f4f5', display:'flex', alignItems:'center', justifyContent:'center', boxShadow: active ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                          <Icon size={16} color={active ? cfg.text : '#a1a1aa'}/>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color: active ? cfg.text : '#a1a1aa' }}>{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Habitación */}
              <div>
                <p style={{ fontSize:11, fontWeight:700, color:'#a1a1aa', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Habitación</p>
                <div style={{ position:'relative' }}>
                  <select value={form.room} onChange={e=>setForm(f=>({...f,room:e.target.value}))} style={{ width:'100%', background:'#fafafa', border:'2px solid #f4f4f5', borderRadius:14, padding:'13px 40px 13px 16px', fontSize:14, fontWeight:600, color:'#18181b', appearance:'none', outline:'none', boxSizing:'border-box' }}>
                    {ROOMS.map(r=><option key={r} value={r}>Habitación {r}</option>)}
                  </select>
                  <ChevronDown size={16} color="#a1a1aa" style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}/>
                </div>
              </div>

              {/* Descripción */}
              <div>
                <p style={{ fontSize:11, fontWeight:700, color:'#a1a1aa', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Descripción</p>
                <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Describe el problema con detalle..." rows={3} style={{ width:'100%', background:'#fafafa', border:'2px solid #f4f4f5', borderRadius:14, padding:'13px 16px', fontSize:14, color:'#18181b', resize:'none', outline:'none', lineHeight:1.5, boxSizing:'border-box' as const }}/>
              </div>

              {/* Foto */}
              <div>
                <p style={{ fontSize:11, fontWeight:700, color:'#a1a1aa', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Foto (opcional)</p>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleImage} style={{ display:'none' }}/>
                {imagePreview ? (
                  <div style={{ position:'relative' }}>
                    <img src={imagePreview} alt="preview" style={{ width:'100%', height:160, objectFit:'cover', borderRadius:14, border:'2px solid #f4f4f5' }}/>
                    <button onClick={()=>setImagePreview(null)} style={{ position:'absolute', top:8, right:8, width:28, height:28, borderRadius:999, background:'rgba(0,0,0,0.6)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <X size={13} color="white"/>
                    </button>
                  </div>
                ) : (
                  <button onClick={()=>fileRef.current?.click()} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'16px', borderRadius:14, border:'2px dashed #e4e4e7', background:'#fafafa', cursor:'pointer', color:'#71717a', fontSize:13, fontWeight:600 }}>
                    <Camera size={18} color="#a1a1aa"/>
                    Tomar foto o elegir de la galería
                  </button>
                )}
              </div>

              {/* Botón enviar */}
              <button onClick={submit} disabled={!form.description.trim()||submitting} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, background:'#2563eb', color:'white', fontSize:14, fontWeight:800, padding:'16px', borderRadius:16, border:'none', cursor:'pointer', opacity:!form.description.trim()||submitting?0.4:1, marginTop:4 }}>
                <Send size={16}/>
                {submitting ? 'Enviando...' : 'Enviar Incidencia al Administrador'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
