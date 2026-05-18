"use client";

import { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  CheckCircle2, ArrowDownLeft, ArrowUpRight, BedDouble,
  UserPlus, Camera, Upload, Wallet, X, Plus, Sparkles, Wrench, AlertTriangle, Send, Package, Minus
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Reserva { id: string; room: string; unit_id?: string; guest_name?: string; check_in: string; check_out: string; checked_in?: boolean; checked_out?: boolean; dni_image?: string; }
interface Task { id: string; type: string; room: string; description: string; status: string; reported_by: string; direction: string; created_at: string; image_base64?: string; }

const ROOMS = ['A1','A2','A3','A4','A5','B1','B2','B3','B4','B5','C1','C2','C3','C4','C5','D1','D2','D3','D4','D5'];

const BEDS24_ROOMS = [
  { id: '679077', name: 'Habitación Estándar' },
  { id: '679087', name: 'Condominio 1R' },
  { id: '679091', name: 'Condominio 2R' },
  { id: '679092', name: 'Condominio 3R' },
  { id: '679093', name: 'Casa de Lujo' }
];

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

export default function RecepcionPage() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [mainTab, setMainTab] = useState<'recepcion' | 'inventario'>('recepcion');
  const staffName = 'Recepción';
  const todayStr = new Date().toISOString().split('T')[0];

  // Modal Check-In / Walk-In
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedReserva, setSelectedReserva] = useState<Reserva | null>(null);
  const [dniPreview, setDniPreview] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<'efectivo' | 'tarjeta' | 'transferencia' | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Modal Mtto
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'mantenimiento', room: ROOMS[0], description: '' });
  const [submitting, setSubmitting] = useState(false);

  // Availability check for Walk-In
  const [roomInventory, setRoomInventory] = useState<any[]>([]);
  const [checkingAvail, setCheckingAvail] = useState(false);

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

  useEffect(() => {
    if (showCheckInModal || showForm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [showCheckInModal, showForm]);

  const fetchData = async () => {
    try {
      const [r, t, inv, chk] = await Promise.all([
        fetch('/api/reservas'),
        fetch('/api/tasks'),
        supabase.from('inventory').select('*').order('category').order('item_name'),
        supabase.from('checkins').select('*')
      ]);
      const rj = await r.json(); const tj = await t.json();
      
      let checkinMap: Record<string, any> = {};
      if (chk.data) {
        chk.data.forEach(c => { checkinMap[String(c.reservation_id)] = c; });
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
    } catch {}
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 10_000);
    return () => clearInterval(iv);
  }, []);

  const llegadas = reservas.filter(r => r.check_in === todayStr);
  const salidas  = reservas.filter(r => r.check_out === todayStr);
  const checkins = llegadas.filter(r => !r.checked_in);
  const checkouts = salidas.filter(r => !r.checked_out);

  const handleDniUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await compressImage(file);
    setDniPreview(b64);
  };

  const processCheckIn = async () => {
    if (!selectedReserva) return;
    setSubmitting(true);
    
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
            isBlock: false
          })
        });
        const resData = await bgRes.json();
        if (!bgRes.ok) {
          alert('Error al sincronizar con Beds24: ' + (resData.error || 'Error desconocido'));
          setSubmitting(false);
          return;
        }
        // Usar el ID real devuelto por Beds24 o generar uno temporal local
        const b24Array = resData.data;
        const beds24AssignedId = (Array.isArray(b24Array) && b24Array[0]?.new?.id) 
          ? String(b24Array[0].new.id) 
          : (resData.data && resData.data.id ? String(resData.data.id) : `b24-${Date.now()}`);
        
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

        // Save to Supabase checkins table
        const { error: upsertErr } = await supabase.from('checkins').upsert({
          reservation_id: beds24AssignedId,
          guest_name: selectedReserva.guest_name,
          room: roomNameHuman,
          check_in_date: todayStr,
          check_out_date: selectedReserva.check_out || todayStr,
          status: 'checked_in',
          checked_in_by: 'Recepcion',
          dni_image: dniPreview || null // If column doesn't exist, this might fail unless user adds it
        }, { onConflict: 'reservation_id' });
        if (upsertErr) console.error("Supabase Walkin Upsert Error:", upsertErr);

        // Update local state IMMEDIATELY so it doesn't appear in 'Check-ins Hoy' again
        setReservas(prev => [...prev, {
          id: beds24AssignedId,
          guest_name: selectedReserva.guest_name,
          room: roomNameHuman,
          check_in: todayStr,
          check_out: selectedReserva.check_out || todayStr,
          checked_in: true,
          dni_image: dniPreview || undefined
        }]);

      } catch (err: any) {
        alert('Fallo de conexión al enviar reserva a Beds24: ' + err.message);
        setSubmitting(false);
        return;
      }
    }
    
    if (paymentMode && paymentAmount) {
      await supabase.from('finances').insert({
        type: 'ingreso',
        amount: Number(paymentAmount),
        category: 'Reserva',
        description: `Cobro Check-in ${selectedReserva.guest_name || 'Huésped'} - Hab ${selectedReserva.room}`,
        payment_method: paymentMode,
        date: todayStr
      });
    }
    
    setShowCheckInModal(false);
    setSelectedReserva(null);
    setDniPreview(null);
    setPaymentMode(null);
    setPaymentAmount('');
    setSubmitting(false);
    fetchData(); // Refresh data from Beds24
  };

  const processCheckOut = async (r: Reserva) => {
    // Marcar como checked_out
    setReservas(prev => prev.map(res => res.id === r.id ? { ...res, checked_out: true } : res));
    
    // Save to Supabase
    const { error } = await supabase.from('checkins').upsert({
      reservation_id: String(r.id),
      guest_name: r.guest_name,
      room: r.room,
      check_in_date: r.check_in,
      check_out_date: r.check_out,
      status: 'checked_out',
      checked_in_by: 'Recepcion'
    }, { onConflict: 'reservation_id' });

    if (error) {
      alert('Error al guardar Check-Out en base de datos: ' + error.message);
      return;
    }
    
    await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'limpieza', room: r.room || 'General', description: `Check-out completado. Habitación ${r.room} lista para limpieza.`, reported_by: 'Recepción', direction: 'staff_to_staff', status: 'pendiente' }),
    });
    fetchData();
  };

  const sendTask = async () => {
    if (!form.description) return;
    setSubmitting(true);
    await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, reported_by: staffName, direction: 'staff_to_admin', status: 'pendiente' }),
    });
    setForm({ ...form, description: '' });
    setShowForm(false);
    setSubmitting(false);
    fetchData();
  };

  const updateStock = async (id: string, currentStock: number, change: number) => {
    if (currentStock + change < 0) return;
    setInventory(prev => prev.map(item => item.id === id ? { ...item, stock: item.stock + change } : item));
    await supabase.from('inventory').update({ stock: currentStock + change, last_updated_by: staffName }).eq('id', id);
  };

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div style={{ background: 'white', borderRadius: 16, padding: '16px 0', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.03)', border: '1px solid #f4f4f5' }}>{children}</div>
  );
  const SectionHead = ({ icon, title, count, color }: any) => (
    <div style={{ padding: '0 16px 12px', borderBottom: '1px solid #f9f9f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon}
        <h2 style={{ fontSize: 13, fontWeight: 800, color: '#18181b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{title}</h2>
      </div>
      {count > 0 && <span style={{ background: color, color: 'white', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 12 }}>{count}</span>}
    </div>
  );

  return (
    <div style={{ paddingBottom: 100, background: '#fafafa', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header */}
      <div style={{ background: '#2563eb', padding: '40px 20px 24px', borderRadius: '0 0 24px 24px', marginBottom: 16, boxShadow: '0 4px 20px rgba(37,99,235,0.15)' }}>
        <p style={{ color: '#bfdbfe', fontSize: 12, fontWeight: 500, margin: '0 0 4px', textTransform: 'capitalize' }}>
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}
        </p>
        <h1 style={{ color: 'white', fontSize: 24, fontWeight: 800, margin: '0 0 2px' }}>
          Recepción
        </h1>
        <p style={{ color: '#bfdbfe', fontSize: 13, margin: 0 }}>Panel de Operaciones</p>
      </div>

      <div style={{ padding: '0 16px' }}>
        
        {/* Main Tabs */}
        <div style={{ display: 'flex', gap: 8, background: '#e4e4e7', padding: 4, borderRadius: 12, marginBottom: 16 }}>
          <button onClick={() => setMainTab('recepcion')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 800, background: mainTab === 'recepcion' ? 'white' : 'transparent', color: mainTab === 'recepcion' ? '#18181b' : '#71717a', boxShadow: mainTab === 'recepcion' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none', cursor: 'pointer', transition: 'all 0.15s' }}>Check-in / Check-out</button>
          <button onClick={() => setMainTab('inventario')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 800, background: mainTab === 'inventario' ? 'white' : 'transparent', color: mainTab === 'inventario' ? '#18181b' : '#71717a', boxShadow: mainTab === 'inventario' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none', cursor: 'pointer', transition: 'all 0.15s' }}>Inventario</button>
        </div>

        {mainTab === 'recepcion' && (
          <>
            {/* Action Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 16 }}>
              <button 
                onClick={() => {
                  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                  const tomorrowStr = tomorrow.toISOString().split('T')[0];
                  setRoomInventory([]);
                  setSelectedReserva({ id: 'walkin', room: '679077', check_in: todayStr, check_out: tomorrowStr, guest_name: '' });
                  setShowCheckInModal(true);
                  fetchAvailability(todayStr, tomorrowStr);
                }}
                style={{ background: '#18181b', color: 'white', border: 'none', padding: '14px', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                <UserPlus size={18} /> Registrar Walk-In
              </button>
            </div>

            {/* Llegadas */}
            <Card>
              <SectionHead icon={<ArrowDownLeft size={13} color="#2563eb"/>} title="Llegadas Hoy" count={llegadas.length} color="#2563eb"/>
              {llegadas.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#a1a1aa', margin: 0 }}>No hay llegadas programadas para hoy.</p>
                </div>
              ) : (
                llegadas.map((r,i)=>(
                  <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom: i<llegadas.length-1?'1px solid #f9f9f9':'none' }}>
                    <div style={{ width:38, height:38, borderRadius:12, background: r.checked_in ? '#dcfce7' : '#eff6ff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      {r.checked_in ? <CheckCircle2 size={16} color="#16a34a"/> : <BedDouble size={16} color="#2563eb"/>}
                    </div>
                    <div style={{ flex:1, minWidth:0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ fontSize:15, fontWeight:700, color:'#18181b', margin:0 }}>
                        {r.guest_name||'Huésped'} {r.checked_in && <span style={{ fontSize: 10, color: '#16a34a', marginLeft: 4, fontWeight: 800 }}>✓</span>}
                      </p>
                      <p style={{ fontSize:13, fontWeight:600, color: r.checked_in ? '#16a34a' : '#2563eb', margin:0, background: r.checked_in ? '#dcfce7' : '#eff6ff', padding: '4px 8px', borderRadius: 8 }}>{r.room||'Sin asignar'}</p>
                    </div>
                  </div>
                ))
              )}
            </Card>

            {/* Salidas */}
            <Card>
              <SectionHead icon={<ArrowUpRight size={13} color="#d97706"/>} title="Check-outs Hoy" count={checkouts.length} color="#d97706"/>
              {checkouts.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#a1a1aa', margin: 0 }}>No hay check-outs pendientes.</p>
                </div>
              ) : (
                checkouts.map((r,i)=>(
                  <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom: i<checkouts.length-1?'1px solid #f9f9f9':'none' }}>
                    <div style={{ width:38, height:38, borderRadius:12, background:'#fffbeb', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <CheckCircle2 size={16} color="#d97706"/>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:14, fontWeight:700, color:'#18181b', margin:'0 0 2px' }}>{r.room||'Sin asignar'}</p>
                      <p style={{ fontSize:12, color:'#a1a1aa', margin:0 }}>{r.guest_name||'Huésped'}</p>
                    </div>
                    <button onClick={() => processCheckOut(r)} style={{ background: '#d97706', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Dar Salida
                    </button>
                  </div>
                ))
              )}
            </Card>
          </>
        )}

        {/* INVENTARIO */}
        {mainTab === 'inventario' && (
          <div style={{ paddingBottom: 20 }}>
            {['Limpieza', 'Amenidades', 'Ropa de Cama'].map(cat => {
              const items = inventory.filter(i => i.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat} style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 800, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, paddingLeft: 4 }}>{cat}</h3>
                  <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e4e4e7', overflow: 'hidden' }}>
                    {items.map((item, i) => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < items.length-1 ? '1px solid #f4f4f5' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Package size={16} color="#71717a" />
                          </div>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#18181b', margin: '0 0 2px' }}>{item.item_name}</p>
                            <p style={{ fontSize: 11, fontWeight: 600, color: item.stock <= (item.min_threshold||5) ? '#ef4444' : '#a1a1aa', margin: 0 }}>
                              {item.stock} unidades en stock
                            </p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f4f4f5', padding: 4, borderRadius: 10 }}>
                          <button onClick={() => updateStock(item.id, item.stock, -1)} style={{ width: 28, height: 28, borderRadius: 8, background: 'white', border: '1px solid #e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Minus size={14} color="#71717a" /></button>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#18181b', width: 24, textAlign: 'center' }}>{item.stock}</span>
                          <button onClick={() => updateStock(item.id, item.stock, 1)} style={{ width: 28, height: 28, borderRadius: 8, background: 'white', border: '1px solid #e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Plus size={14} color="#71717a" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Botón flotante para reportar tareas (igual que staff) */}
      <button 
        onClick={() => setShowForm(true)}
        style={{ position: 'fixed', bottom: 80, right: 20, width: 56, height: 56, borderRadius: 28, background: '#18181b', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px rgba(0,0,0,0.3)', cursor: 'pointer', zIndex: 40 }}
      >
        <Plus size={24} />
      </button>

      {/* Modal Crear Tarea */}
      {showForm && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, backdropFilter: 'blur(4px)' }} onClick={() => setShowForm(false)} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '24px 20px 40px', zIndex: 101, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#18181b', margin: 0 }}>Crear Reporte</h2>
              <button onClick={() => setShowForm(false)} style={{ background: '#f4f4f5', border: 'none', width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={16} color="#71717a" />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'block' }}>Tipo</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  <button onClick={() => setForm(f => ({...f, type:'mantenimiento'}))} style={{ padding:'10px 8px', borderRadius:12, border:`2px solid ${form.type==='mantenimiento'?'#ef4444':'#e4e4e7'}`, background:form.type==='mantenimiento'?'#fef2f2':'#fafafa', fontSize:12, fontWeight:700, color:form.type==='mantenimiento'?'#b91c1c':'#71717a', cursor:'pointer' }}>🔧 Mantenimiento</button>
                  <button onClick={() => setForm(f => ({...f, type:'limpieza'}))} style={{ padding:'10px 8px', borderRadius:12, border:`2px solid ${form.type==='limpieza'?'#f59e0b':'#e4e4e7'}`, background:form.type==='limpieza'?'#fffbeb':'#fafafa', fontSize:12, fontWeight:700, color:form.type==='limpieza'?'#b45309':'#71717a', cursor:'pointer' }}>✨ Limpieza</button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'block' }}>Habitación</label>
                  <div style={{ position: 'relative' }}>
                  <select value={form.room} onChange={e => setForm(f => ({...f, room: e.target.value}))} style={{ width: '100%', background: '#fafafa', border: '2px solid #e4e4e7', borderRadius: 12, padding: '12px 14px', fontSize: 16, fontWeight: 600, appearance: 'none', outline: 'none' }}>
                    <option value="General">Área General</option>
                    {ROOMS.map(r => <option key={r} value={r}>Habitación {r}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'block' }}>Descripción</label>
                <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="¿Qué sucede?" rows={3} style={{ width: '100%', background: '#fafafa', border: '2px solid #e4e4e7', borderRadius: 12, padding: '12px 14px', fontSize: 16, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
              </div>

              <button onClick={sendTask} disabled={!form.description.trim() || submitting} style={{ width: '100%', background: '#18181b', color: 'white', padding: '14px', borderRadius: 14, border: 'none', fontSize: 15, fontWeight: 700, marginTop: 8, cursor: 'pointer', opacity: !form.description.trim() || submitting ? 0.5 : 1 }}>
                {submitting ? 'Enviando...' : 'Enviar Reporte'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal Check-In */}
      {showCheckInModal && selectedReserva && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, backdropFilter: 'blur(4px)' }} onClick={() => setShowCheckInModal(false)} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '24px 20px 40px', zIndex: 101, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexShrink: 0 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#18181b', margin: 0 }}>{selectedReserva.id === 'walkin' ? 'Registrar Walk-In' : 'Proceso de Check-in'}</h2>
              <button onClick={() => setShowCheckInModal(false)} style={{ background: '#f4f4f5', border: 'none', width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={16} color="#71717a" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', paddingBottom: 60 }}>
              {/* Información Básica */}
              {selectedReserva.id === 'walkin' ? (
                <div style={{ background: '#f4f4f5', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#71717a', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase' }}>Nombre del Huésped</p>
                    <input value={selectedReserva.guest_name} onChange={e => setSelectedReserva({...selectedReserva, guest_name: e.target.value})} placeholder="Ej: Juan Pérez" style={{ width: '100%', background: 'white', border: '1px solid #e4e4e7', borderRadius: 8, padding: '8px 12px', fontSize: 16, outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 11, color: '#71717a', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase' }}>Salida (Check-out)</p>
                      <input 
                        type="date" 
                        value={selectedReserva.check_out} 
                        onChange={e => {
                          const newCheckOut = e.target.value;
                          setSelectedReserva({...selectedReserva, check_out: newCheckOut, room: '', unit_id: ''});
                          fetchAvailability(selectedReserva.check_in, newCheckOut);
                        }} 
                        style={{ width: '100%', background: 'white', border: '1px solid #e4e4e7', borderRadius: 8, padding: '8px 12px', fontSize: 16, outline: 'none' }} 
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 4 }}>
                    <p style={{ fontSize: 11, color: '#71717a', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase' }}>Asignación de Unidad {checkingAvail && <span style={{fontWeight:400}}>· verificando...</span>}</p>
                    
                    {roomInventory.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '220px', overflowY: 'auto', paddingRight: 4 }}>
                        {roomInventory.map((roomGroup: any) => (
                          <div key={roomGroup.roomId}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#18181b', marginBottom: 6 }}>{roomGroup.name}</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {roomGroup.units.map((u: any) => {
                                const isSelected = selectedReserva.room === roomGroup.roomId && selectedReserva.unit_id === u.unitId;
                                return (
                                  <button
                                    key={u.unitId}
                                    disabled={!u.isAvailable}
                                    onClick={() => setSelectedReserva({ ...selectedReserva, room: roomGroup.roomId, unit_id: u.unitId })}
                                    style={{
                                      padding: '6px 10px',
                                      borderRadius: 8,
                                      fontSize: 12,
                                      fontWeight: 600,
                                      border: isSelected ? '2px solid #2563eb' : '1px solid #e4e4e7',
                                      background: !u.isAvailable ? '#f4f4f5' : isSelected ? '#2563eb' : 'white',
                                      color: !u.isAvailable ? '#a1a1aa' : isSelected ? 'white' : '#3f3f46',
                                      cursor: !u.isAvailable ? 'not-allowed' : 'pointer',
                                      textDecoration: !u.isAvailable ? 'line-through' : 'none',
                                      transition: 'all 0.2s'
                                    }}
                                  >
                                    {u.name}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: '12px', background: 'white', border: '1px solid #e4e4e7', borderRadius: 8 }}>
                        <p style={{ fontSize: 12, color: '#71717a', margin: 0 }}>Selecciona fecha de salida para ver disponibilidad.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ background: '#f4f4f5', borderRadius: 16, padding: 16 }}>
                  <p style={{ fontSize: 12, color: '#71717a', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase' }}>Huésped</p>
                  <p style={{ fontSize: 16, color: '#18181b', fontWeight: 800, margin: '0 0 12px' }}>{selectedReserva.guest_name}</p>
                  
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div>
                      <p style={{ fontSize: 11, color: '#71717a', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase' }}>Habitación</p>
                      <p style={{ fontSize: 14, color: '#18181b', fontWeight: 700, margin: 0 }}>{selectedReserva.room || 'Sin asignar'}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: '#71717a', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase' }}>Check-out</p>
                      <p style={{ fontSize: 14, color: '#18181b', fontWeight: 700, margin: 0 }}>{selectedReserva.check_out}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* DNI Scanner */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#18181b', marginBottom: 8 }}>Identificación (DNI/Pasaporte)</p>
                {!dniPreview ? (
                  <div 
                    onClick={() => fileRef.current?.click()}
                    style={{ background: '#fafafa', border: '2px dashed #e4e4e7', borderRadius: 16, height: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 8 }}
                  >
                    <Camera size={24} color="#71717a" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#71717a' }}>Tomar foto del documento</span>
                    <input type="file" accept="image/*" capture="environment" ref={fileRef} onChange={handleDniUpload} style={{ display: 'none' }} />
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <img src={dniPreview} alt="DNI Preview" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 16, border: '1px solid #e4e4e7' }} />
                    <button onClick={() => setDniPreview(null)} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)', border: 'none', width: 28, height: 28, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <X size={14} color="white" />
                    </button>
                  </div>
                )}
              </div>

              {/* Registro de Pago */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#18181b', marginBottom: 8 }}>Registro de Pago (Opcional)</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {[
                    { id: 'efectivo', label: 'Efectivo', icon: Wallet },
                    { id: 'tarjeta', label: 'Tarjeta', icon: BedDouble },
                    { id: 'transferencia', label: 'Transf.', icon: Send }
                  ].map(m => (
                    <button 
                      key={m.id} 
                      onClick={() => setPaymentMode(m.id as any)}
                      style={{ flex: 1, padding: '10px 4px', borderRadius: 12, border: `2px solid ${paymentMode === m.id ? '#2563eb' : '#e4e4e7'}`, background: paymentMode === m.id ? '#eff6ff' : '#fafafa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                    >
                      <m.icon size={16} color={paymentMode === m.id ? '#2563eb' : '#71717a'} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: paymentMode === m.id ? '#2563eb' : '#71717a' }}>{m.label}</span>
                    </button>
                  ))}
                </div>
                {paymentMode && (
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, fontWeight: 700, color: '#71717a' }}>$</span>
                    <input 
                      type="number" 
                      value={paymentAmount} 
                      onChange={e => setPaymentAmount(e.target.value)} 
                      placeholder="Monto a registrar" 
                      style={{ width: '100%', background: '#fafafa', border: '2px solid #e4e4e7', borderRadius: 12, padding: '12px 14px 12px 32px', fontSize: 16, fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                )}
              </div>

              <button 
                onClick={processCheckIn} 
                disabled={submitting || (!dniPreview && selectedReserva.id !== 'walkin') || (selectedReserva.id === 'walkin' && (!selectedReserva.guest_name || !selectedReserva.unit_id))} 
                style={{ flexShrink: 0, width: '100%', background: '#2563eb', color: 'white', padding: '16px', borderRadius: 16, border: 'none', fontSize: 15, fontWeight: 800, marginTop: 8, cursor: (selectedReserva.id === 'walkin' && !selectedReserva.unit_id) ? 'not-allowed' : 'pointer', opacity: (submitting || (!dniPreview && selectedReserva.id !== 'walkin') || (selectedReserva.id === 'walkin' && (!selectedReserva.guest_name || !selectedReserva.unit_id))) ? 0.5 : 1 }}
              >
                {submitting ? 'Procesando...' : 'Completar Check-In'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
