"use client";

import { useState, useEffect } from 'react';
import { Search, RefreshCw, User, ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2, AlertCircle, Download, BedDouble, LogIn, FileText, UploadCloud } from 'lucide-react';
import { getActiveEmployee } from '@/lib/auth';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TABS = ['Todas', 'Hoy', 'Próximas', 'WhatsApp Bot', 'Airbnb', 'Booking.com'];

const PHYSICAL_ROOM_GROUPS = [
  {
    category: 'Apartamentos Premier de 3 Recámaras',
    rooms: ['101', '102', '103', '104', '105', '106', '107']
  },
  {
    category: 'Apartamentos Premier de 2 Recámaras',
    rooms: ['201', '202', '203', '204', '205', '206']
  },
  {
    category: 'Habitaciones Dobles',
    rooms: ['301', '302', '303', '304', '305', '306']
  },
  {
    category: 'Otras Unidades',
    rooms: ['401', '402', '500']
  }
];

function StatusBadge({ status, isCheckedIn, isCheckedOut }: { status: string, isCheckedIn?: boolean, isCheckedOut?: boolean }) {
  if (isCheckedOut) return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded-md border border-zinc-200">
      <CheckCircle2 size={10} /> Check-out
    </span>
  );
  if (isCheckedIn) return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
      <LogIn size={10} /> En Casa
    </span>
  );
  if (status === 'confirmed') return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
      <CheckCircle2 size={10} /> Confirmada
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
      <Clock size={10} /> Pendiente
    </span>
  );
}

export default function ReservasList() {
  const [reservas, setReservas] = useState<any[]>([]);
  const [selectedRes, setSelectedRes] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Todas');
  const [search, setSearch] = useState('');
  const [tokenError, setTokenError] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [showPaymentFlow, setShowPaymentFlow] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [paymentReference, setPaymentReference] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);

  const [isReassigning, setIsReassigning] = useState(false);
  const [targetRoomName, setTargetRoomName] = useState('');
  const [reassignLoading, setReassignLoading] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<Record<string, boolean>>({});
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  useEffect(() => {
    if (selectedRes) {
      setShowPaymentFlow(false);
      setIsCheckedIn(selectedRes.is_checked_in || false);
    } else {
      setIsReassigning(false);
      setTargetRoomName('');
      setAvailableRooms({});
    }
  }, [selectedRes]);

  // Consultar disponibilidad real de habitaciones en las fechas de la reserva
  useEffect(() => {
    if (isReassigning && selectedRes?.check_in && selectedRes?.check_out) {
      const fetchAvailability = async () => {
        setLoadingAvailability(true);
        try {
          const res = await fetch(`/api/availability?checkIn=${selectedRes.check_in}&checkOut=${selectedRes.check_out}`);
          const json = await res.json();
          if (json.success && json.inventory) {
            const availMap: Record<string, boolean> = {};
            json.inventory.forEach((cat: any) => {
              cat.units.forEach((u: any) => {
                availMap[String(u.name)] = u.isAvailable;
              });
            });
            setAvailableRooms(availMap);
          }
        } catch (err) {
          console.error("Error al obtener disponibilidad para reasignar:", err);
        } finally {
          setLoadingAvailability(false);
        }
      };
      fetchAvailability();
    }
  }, [isReassigning, selectedRes]);

  const handleReassignRoom = async () => {
    if (!selectedRes || !targetRoomName) return;
    
    const confirmChange = confirm(`⚠️ ¿Estás seguro de que deseas reasignar la reserva de ${selectedRes.guest_name} a la habitación ${targetRoomName}?\n\nEsto actualizará la asignación en Beds24 y sincronizará la habitación en tu registro local de Supabase.`);
    if (!confirmChange) return;

    setReassignLoading(true);
    try {
      const res = await fetch('/api/reservas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedRes.id,
          roomName: targetRoomName
        })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Error al reasignar la habitación');

      alert(`✅ Habitación reasignada exitosamente a la ${targetRoomName}.`);

      // Registrar log de reasignación
      try {
        const emp = getActiveEmployee('recepcion');
        const employeeNum = emp?.employee_num || '999';
        const employeeName = emp?.full_name || 'Administrador';
        const employeeDept = emp?.department || 'recepcion';
        
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: employeeNum,
            employee_name: employeeName,
            department: employeeDept,
            module: 'recepcion',
            action: 'reasignacion_habitacion',
            room: targetRoomName,
            details: JSON.stringify({
              text: `Reasignó la habitación de la reserva de ${selectedRes.guest_name} (ID: ${selectedRes.id}) desde ${selectedRes.room_name || 'Sin asignar'} a la Habitación ${targetRoomName}`,
              reasignacion: {
                bookingId: selectedRes.id,
                guestName: selectedRes.guest_name,
                fromRoom: selectedRes.room_name || 'Sin asignar',
                toRoom: targetRoomName
              }
            })
          })
        });
      } catch (logErr) {
        console.error("Error registrando log de reasignación:", logErr);
      }

      setIsReassigning(false);
      setTargetRoomName('');
      
      // Actualizar estado local reactivo al vuelo para evitar tiempos de espera
      const updatedRoomName = data.room_name || `Habitación ${targetRoomName}`;
      setSelectedRes((prev: any) => ({ ...prev, room_name: updatedRoomName }));
      setReservas(prev => prev.map(r => r.id === selectedRes.id ? { ...r, room_name: updatedRoomName } : r));
      
      fetchReservas(); // Sincronización en segundo plano de seguridad
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al reasignar habitación:\n\n${err.message}`);
    } finally {
      setReassignLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && reservas.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const searchId = params.get('id');
      if (searchId) {
        const found = reservas.find(r => r.id.toString() === searchId);
        if (found) {
          setSelectedRes(found);
        }
      }
    }
  }, [reservas]);

  const handleConfirmCheckIn = async () => {
    setCheckInLoading(true);
    try {
      let document_url = null;

      // 0. Subir DNI/Pasaporte si existe
      if (documentFile) {
        const fileExt = documentFile.name.split('.').pop();
        const fileName = `${selectedRes.id}_dni_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('dni_images')
          .upload(fileName, documentFile);
          
        if (uploadError) {
          console.error("Error subiendo documento:", uploadError);
          alert("Hubo un error subiendo el DNI. Se guardará el Check-in sin adjunto.");
        } else {
          const { data: publicUrlData } = supabase.storage
            .from('dni_images')
            .getPublicUrl(fileName);
          document_url = publicUrlData.publicUrl;
        }
      }

      // 1. Guardar el Check-in
      await supabase.from('checkins').insert([{
        reservation_id: selectedRes.id.toString(),
        guest_name: selectedRes.guest_name,
        room: selectedRes.room_name,
        check_in_date: selectedRes.check_in,
        check_out_date: selectedRes.check_out,
        status: 'checked_in',
        checked_in_by: 'Admin',
        document_url: document_url
      }]);

      // 2. Registrar el Ingreso Financiero
      const accountName = accounts.find(a => a.id === paymentReference)?.name || paymentReference;
      const paymentDetail = paymentMethod === 'efectivo' ? `Sobre/Caja: ${accountName}` : 
                            paymentMethod === 'tarjeta' ? `Terminal/Autorización: ${accountName}` : 
                            `Cuenta destino: ${accountName}`;

      const { error: financeErr } = await supabase.from('finances').insert([{
        type: 'ingreso',
        amount: selectedRes.price_estimate,
        category: 'Alojamiento',
        description: `Check-in automático: ${selectedRes.guest_name} (${selectedRes.room_name}) | ${paymentDetail}`,
        payment_method: paymentMethod,
        account_id: paymentReference,
        date: new Date().toISOString().split('T')[0]
      }]);

      if (!financeErr && paymentReference) {
        const acc = accounts.find(a => a.id === paymentReference);
        if (acc) {
          await supabase.from('accounts').update({ balance: acc.balance + selectedRes.price_estimate }).eq('id', paymentReference);
        }
      }

      setIsCheckedIn(true);
      setShowPaymentFlow(false);
      setDocumentFile(null);
      setPaymentReference('');
      
      // Actualizar estado local
      setReservas(prev => prev.map(r => r.id === selectedRes.id ? { 
        ...r, 
        is_checked_in: true,
        document_url: document_url 
      } : r));
      
      // También actualizar selectedRes para que el botón de Ver Documento aparezca de inmediato
      setSelectedRes((prev: any) => ({ ...prev, is_checked_in: true, document_url: document_url }));

      alert('¡Check-in realizado y pago registrado en Finanzas!');
    } catch (error) {
      console.error(error);
      alert('Error al realizar el check-in.');
    } finally {
      setCheckInLoading(false);
    }
  };

  const fetchReservas = async () => {
    setIsLoading(true);
    setTokenError(false);
    try {
      const [res, chk, acc] = await Promise.all([
        fetch('/api/reservas'),
        supabase.from('checkins').select('*'),
        supabase.from('accounts').select('*').order('sort_index', { ascending: true }).order('name', { ascending: true })
      ]);
      const json = await res.json();
      
      let checkinMap: Record<string, any> = {};
      if (acc.data) setAccounts(acc.data);
      if (chk.data) {
        chk.data.forEach(c => { checkinMap[String(c.reservation_id)] = c; });
      }

      if (json.error === 'TOKEN_EXPIRED') { setTokenError(true); return; }
      if (json.success && json.data) {
        const sorted = json.data.map((r: any) => ({
          ...r,
          is_checked_in: checkinMap[String(r.id)]?.status === 'checked_in',
          is_checked_out: checkinMap[String(r.id)]?.status === 'checked_out',
          document_url: checkinMap[String(r.id)]?.document_url
        })).sort((a: any, b: any) => 
          new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
        );
        setReservas(sorted);
      }
    } catch (e) {
      console.error("Error al cargar reservas", e);
    } finally {
      setIsLoading(false);
    }
  };

  const [cancelLoading, setCancelLoading] = useState(false);

  const handleCancelReserva = async () => {
    if (!selectedRes) return;
    const confirmCancel = confirm(`⚠️ ¿Estás seguro de que deseas cancelar permanentemente la reserva de ${selectedRes.guest_name}?\n\nEsta acción eliminará el check-in local y sincronizará la cancelación en Beds24 de inmediato.`);
    if (!confirmCancel) return;

    setCancelLoading(true);
    try {
      const res = await fetch(`/api/reservas?id=${selectedRes.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Error al cancelar la reserva');

      alert('✅ Reserva cancelada con éxito en Beds24 y liberada en la App.');

      // Registrar log de cancelación
      try {
        const emp = getActiveEmployee('recepcion');
        const employeeNum = emp?.employee_num || '999';
        const employeeName = emp?.full_name || 'Administrador';
        const employeeDept = emp?.department || 'recepcion';
        
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: employeeNum,
            employee_name: employeeName,
            department: employeeDept,
            module: 'recepcion',
            action: 'reserva_cancelada',
            room: selectedRes.room_name || 'General',
            details: JSON.stringify({
              text: `Canceló permanentemente la reserva de ${selectedRes.guest_name} (ID: ${selectedRes.id}) de la Habitación ${selectedRes.room_name || 'General'}`,
              cancelacion: {
                bookingId: selectedRes.id,
                guestName: selectedRes.guest_name,
                room: selectedRes.room_name || 'General'
              }
            })
          })
        });
      } catch (logErr) {
        console.error("Error registrando log de cancelación:", logErr);
      }

      setSelectedRes(null);
      fetchReservas(); // Refrescar el listado
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al cancelar reserva:\n\n${err.message}`);
    } finally {
      setCancelLoading(false);
    }
  };

  const exportCSV = async () => {
    setExportLoading(true);
    try {
      const res = await fetch('/api/export?format=csv');
      if (!res.ok) throw new Error('Export error');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `jaroje_reservas_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Error al exportar. Verifica el token de Beds24.');
    } finally {
      setExportLoading(false);
    }
  };

  const exportSQL = async () => {
    setExportLoading(true);
    try {
      const res = await fetch('/api/export?format=sql');
      if (!res.ok) throw new Error('Export error');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `jaroje_reservas_${new Date().toISOString().split('T')[0]}.sql`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Error al exportar SQL.');
    } finally {
      setExportLoading(false);
    }
  };


  useEffect(() => { fetchReservas(); }, []);



  const todayStr = new Date().toISOString().split('T')[0];

  const filtered = reservas.filter(r => {
    const matchSearch = !search || 
      r.guest_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.id?.toString().includes(search);
    
    let matchTab = true;
    if (activeTab === 'Hoy') matchTab = r.check_in === todayStr || r.check_out === todayStr;
    else if (activeTab === 'Próximas') matchTab = r.check_in >= todayStr;
    else if (activeTab !== 'Todas') matchTab = r.channel === activeTab;

    return matchSearch && matchTab;
  });

  const totalRevenue = filtered.reduce((sum: number, r: any) => sum + (r.price_estimate || 0), 0);

  return (
    <div className="space-y-4 pb-24 bg-[#fafafa]">
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight">Reservas</h2>
          <p className="text-[13px] font-medium text-zinc-500 mt-0.5">
            {isLoading ? '...' : `${reservas.length} activas · MX$${totalRevenue.toLocaleString('es-MX')} estimado`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            disabled={exportLoading || isLoading}
            title="Exportar CSV"
            className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-zinc-600 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            <Download size={13} className={exportLoading ? 'animate-bounce' : ''} />
            CSV
          </button>
          <button
            onClick={exportSQL}
            disabled={exportLoading || isLoading}
            title="Descargar SQL"
            className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            <Download size={13} className={exportLoading ? 'animate-bounce' : ''} />
            SQL
          </button>
          <button 
            onClick={fetchReservas} 
            disabled={isLoading}
            className={`w-9 h-9 flex items-center justify-center text-zinc-500 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl shadow-sm transition-all ${isLoading ? 'opacity-50' : 'active:scale-95'}`}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

      </div>

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={15} strokeWidth={2.5} />
        <input 
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o ID..."
          className="w-full bg-white border border-zinc-200/80 rounded-xl py-3 pl-10 pr-4 text-[14px] font-medium focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] placeholder:text-zinc-400"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all active:scale-[0.98] ${
              activeTab === t
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'bg-white text-zinc-600 border border-zinc-200/80 hover:bg-zinc-50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Token Error Banner */}
      {tokenError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[14px] font-semibold text-amber-800">Token de Beds24 caducado</p>
            <p className="text-[12px] text-amber-700 mt-0.5">Ve a Beds24 › Marketplace › API y genera un nuevo token. Actualiza el .env y reinicia.</p>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-zinc-200/80 rounded-2xl p-4 animate-pulse h-28" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-zinc-200/60 border-dashed rounded-2xl p-10 flex flex-col items-center text-center">
          <CheckCircle2 size={28} className="text-zinc-300 mb-3" strokeWidth={1.5} />
          <p className="text-[14px] font-semibold text-zinc-500">
            {search ? 'Sin resultados para esa búsqueda.' : 'No hay reservas en esta categoría.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const isArrival = r.check_in === todayStr;
            const isDeparture = r.check_out === todayStr;
            return (
              <div 
                key={r.id}
                onClick={() => setSelectedRes(r)}
                className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex flex-col gap-3 hover:border-zinc-300 transition-colors active:scale-[0.99] cursor-pointer"
              >
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 border ${
                      isArrival ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                      isDeparture ? 'bg-amber-50 border-amber-100 text-amber-600' :
                      'bg-zinc-100 border-zinc-200 text-zinc-600'
                    }`}>
                      {isArrival ? <ArrowDownLeft size={18} strokeWidth={2.5} /> :
                       isDeparture ? <ArrowUpRight size={18} strokeWidth={2.5} /> :
                       <User size={18} strokeWidth={2.5} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-zinc-900 text-[15px] leading-tight">{r.guest_name}</h3>
                        {isArrival && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">HOY LLEGA</span>}
                        {isDeparture && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">HOY SALE</span>}
                      </div>
                      <p className="text-[12px] font-medium text-zinc-400 mt-0.5">
                        {r.room_name} <span className="mx-1 text-zinc-300">·</span> {r.channel}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[15px] font-bold text-zinc-900">MX${r.price_estimate}</p>
                    <p className="text-[11px] text-zinc-400 font-medium mt-0.5">{r.nights} noche{r.nights !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                {/* Fechas */}
                <div className="flex items-center justify-between text-[13px] bg-[#fafafa] border border-zinc-100 p-3 rounded-xl font-medium mt-1">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Check-in</span>
                    <span className="text-zinc-900 font-semibold">{r.check_in ? format(parseISO(r.check_in), 'dd MMM yyyy', { locale: es }) : '—'}</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center px-4">
                    <div className="w-full h-[1.5px] bg-zinc-200" />
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Check-out</span>
                    <span className="text-zinc-900 font-semibold">{r.check_out ? format(parseISO(r.check_out), 'dd MMM yyyy', { locale: es }) : '—'}</span>
                  </div>
                </div>

                <StatusBadge status={r.status} isCheckedIn={r.is_checked_in} isCheckedOut={r.is_checked_out} />
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Detalles de Reserva */}
      {selectedRes && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 transition-all duration-300">
          <div 
            className="bg-white w-full sm:w-[400px] h-[85vh] sm:h-auto sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom"
          >
            {/* Cabecera Modal */}
            <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-[18px] font-semibold text-zinc-900 leading-tight">Detalles de Reserva</h3>
                <p className="text-[12px] font-medium text-zinc-500 mt-0.5 uppercase tracking-wider">ID: {selectedRes.id || selectedRes.room_id || 'N/A'}</p>
              </div>
              <button 
                onClick={() => setSelectedRes(null)}
                className="w-8 h-8 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-full transition-colors active:scale-95"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {/* Contenido Modal */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Bloque: Huésped */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center shrink-0">
                  <User size={24} className="text-zinc-600" />
                </div>
                <div>
                  <h4 className="text-[18px] font-bold text-zinc-900 tracking-tight">{selectedRes.guest_name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[12px] font-medium text-zinc-500">{selectedRes.guest_phone || 'Sin teléfono'}</span>
                    {selectedRes.guest_email && (
                      <>
                        <span className="text-zinc-300">·</span>
                        <span className="text-[12px] font-medium text-zinc-500 truncate max-w-[150px]">{selectedRes.guest_email}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Bloque: Financiero & Tags */}
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-zinc-50 border border-zinc-200 p-4 rounded-2xl">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Precio Total</span>
                  <div className="flex items-end gap-1">
                    <span className="text-[22px] font-bold text-zinc-900 leading-none">MX${selectedRes.price_estimate}</span>
                    <span className="text-[12px] font-medium text-zinc-500 mb-0.5">/ {selectedRes.nights} noche{selectedRes.nights !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center">
                    <span className="text-[12px] font-bold text-blue-700 uppercase tracking-wider">{selectedRes.channel}</span>
                  </div>
                  <div className="flex items-center justify-center">
                    <StatusBadge status={selectedRes.status} isCheckedIn={selectedRes.is_checked_in} isCheckedOut={selectedRes.is_checked_out} />
                  </div>
                </div>
              </div>

              {/* Bloque: Habitación */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h5 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Habitación Asignada</h5>
                  {selectedRes.status !== 'cancelled' && !selectedRes.is_checked_out && (
                    <button
                      onClick={() => setIsReassigning(!isReassigning)}
                      className="text-[11px] font-extrabold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 transition-colors cursor-pointer"
                    >
                      {isReassigning ? 'Cancelar' : 'Reasignar 🔀'}
                    </button>
                  )}
                </div>
                
                {isReassigning ? (
                  <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-2xl space-y-3 animate-in slide-in-from-top-2 duration-200">
                    <div>
                      <label className="block text-[10px] font-extrabold text-blue-800 uppercase tracking-widest mb-1.5">
                        Seleccionar Nueva Habitación (Filtro de Disponibilidad)
                      </label>
                      <select
                        value={targetRoomName}
                        onChange={e => setTargetRoomName(e.target.value)}
                        disabled={loadingAvailability}
                        className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 outline-none text-[13px] font-semibold text-zinc-900 focus:ring-2 focus:ring-blue-600/10 cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        <option value="" disabled>
                          {loadingAvailability ? '⏳ Analizando ocupación en tiempo real...' : 'Selecciona una habitación física...'}
                        </option>
                        {PHYSICAL_ROOM_GROUPS.map(group => (
                          <optgroup key={group.category} label={group.category}>
                            {group.rooms.map(room => {
                              const isAvail = availableRooms[room] !== false; // por defecto disponible si no ha cargado
                              const isCurrent = (selectedRes.room_name || '').includes(room);
                              return (
                                <option 
                                  key={room} 
                                  value={room} 
                                  disabled={!isAvail || isCurrent}
                                >
                                  {room} {isCurrent ? '(Actual)' : isAvail ? '· Disponible ✅' : '· OCUPADA ❌'}
                                </option>
                              );
                            })}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => { setIsReassigning(false); setTargetRoomName(''); }}
                        className="flex-1 py-2 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-600 text-[12px] font-bold rounded-xl transition-all cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleReassignRoom}
                        disabled={reassignLoading || !targetRoomName}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/10 cursor-pointer"
                      >
                        {reassignLoading ? (
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-zinc-200 p-4 rounded-2xl flex items-center gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-[#E5BD69]/10 flex items-center justify-center shrink-0">
                      <BedDouble size={18} className="text-[#663311]" />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-zinc-900">{selectedRes.room_name}</p>
                      <p className="text-[12px] font-medium text-zinc-500 mt-0.5">Property ID: {selectedRes.room_id}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Bloque: Timeline */}
              <div>
                <h5 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Estancia</h5>
                <div className="flex items-center justify-between text-[14px] bg-zinc-50 border border-zinc-200 p-4 rounded-2xl">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Check-in</span>
                    <span className="text-zinc-900 font-semibold">{selectedRes.check_in ? format(parseISO(selectedRes.check_in), 'dd MMM yyyy', { locale: es }) : '—'}</span>
                  </div>
                  <div className="flex-1 flex justify-center px-4">
                    <div className="w-8 h-8 rounded-full border border-zinc-200 bg-white flex items-center justify-center shadow-sm">
                      <Clock size={14} className="text-zinc-400" />
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Check-out</span>
                    <span className="text-zinc-900 font-semibold">{selectedRes.check_out ? format(parseISO(selectedRes.check_out), 'dd MMM yyyy', { locale: es }) : '—'}</span>
                  </div>
                </div>
              </div>

              {/* Bloque: Notas */}
              {selectedRes.notes && (
                <div>
                  <h5 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Notas del Huésped</h5>
                  <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-2xl">
                    <p className="text-[13px] text-zinc-700 italic font-medium leading-relaxed">"{selectedRes.notes}"</p>
                  </div>
                </div>
              )}

            </div>
            
            {/* Acción Botón */}
            <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex flex-col gap-2">
              {isCheckedIn ? (
                <div className="flex flex-col gap-2">
                  <div className="w-full bg-emerald-50 text-emerald-700 font-bold text-[14px] py-3.5 rounded-xl flex items-center justify-center gap-2 border border-emerald-200">
                    <CheckCircle2 size={18} /> Huésped en Casa
                  </div>
                  {selectedRes.document_url && (
                    <a 
                      href={selectedRes.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-white hover:bg-zinc-50 text-zinc-900 font-bold text-[14px] py-3.5 rounded-xl flex items-center justify-center gap-2 border border-zinc-200 transition-colors shadow-sm"
                    >
                      <FileText size={16} /> Ver Documento / Pasaporte
                    </a>
                  )}
                </div>
              ) : showPaymentFlow ? (
                <div className="animate-in fade-in duration-200 bg-white p-4 rounded-xl border border-zinc-200 shadow-sm mb-2">
                  
                  {/* DNI Upload */}
                  <div className="mb-4">
                    <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                      DNI / Pasaporte (Obligatorio)
                    </label>
                    <div className="relative">
                      <input 
                        type="file"
                        onChange={e => setDocumentFile(e.target.files ? e.target.files[0] : null)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[13px] focus:ring-2 focus:ring-zinc-900/10 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[12px] file:font-semibold file:bg-zinc-900 file:text-white hover:file:bg-zinc-800 cursor-pointer"
                        accept="image/*,.pdf"
                        required
                      />
                    </div>
                  </div>

                  {/* Adeudo por Pagar */}
                  <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex items-center justify-between shadow-sm mb-4 animate-in fade-in duration-300">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-widest block">
                        Adeudo por Pagar
                      </span>
                      <p className="text-[11px] text-amber-600 font-medium">
                        Monto total a cobrar por la estancia.
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[20px] font-black text-amber-700">
                        ${(selectedRes.price_estimate || 0).toLocaleString('es-MX')} MXN
                      </span>
                    </div>
                  </div>

                  <p className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-3 pt-3 border-t border-zinc-100">Registrar Pago</p>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {['efectivo', 'tarjeta', 'transferencia'].map(m => (
                      <button 
                        key={m}
                        type="button"
                        onClick={() => { setPaymentMethod(m); setPaymentReference(''); }}
                        className={`py-2 px-2 text-[12px] font-semibold rounded-lg capitalize border ${paymentMethod === m ? 'bg-zinc-900 text-white border-zinc-900 shadow-md' : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>

                  <div className="mb-4">
                    <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                      {paymentMethod === 'efectivo' ? 'Sobre de Efectivo' : 
                       paymentMethod === 'tarjeta' ? 'Cuenta de Cobro con Tarjeta' : 
                       'Cuenta de Depósito'}
                    </label>
                    <select
                      required
                      value={paymentReference}
                      onChange={e => setPaymentReference(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[13px] focus:ring-2 focus:ring-zinc-900/10 font-medium text-zinc-900 cursor-pointer"
                    >
                      <option value="" disabled>Selecciona una opción</option>
                      {accounts
                        .filter(a => {
                          const name = a.name.trim().toUpperCase();
                          if (paymentMethod === 'efectivo') {
                            return name === 'EFECTIVO';
                          }
                          if (paymentMethod === 'tarjeta') {
                            return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
                          }
                          if (paymentMethod === 'transferencia') {
                            return ['BANAMEX', 'BBVA', 'SANTANDER', 'IBC ROL (DLL)', 'WISE', 'REVOLUT'].includes(name);
                          }
                          return false;
                        })
                        .map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setShowPaymentFlow(false)} className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-[13px] transition-colors">Cancelar</button>
                    <button 
                      onClick={handleConfirmCheckIn} 
                      disabled={checkInLoading || !documentFile || !paymentReference.trim()} 
                      className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-[13px] shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all active:scale-[0.98] flex justify-center items-center gap-2"
                    >
                      {checkInLoading ? <RefreshCw size={16} className="animate-spin" /> : <LogIn size={16} />}
                      {checkInLoading ? 'Procesando...' : 'Confirmar Ingreso'}
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => setShowPaymentFlow(true)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-[15px] py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-[0_4px_14px_rgba(37,99,235,0.25)] flex items-center justify-center gap-2"
                >
                  <LogIn size={18} strokeWidth={2.5} /> Iniciar Check-In
                </button>
              )}
              
              {/* Cancelar Reserva Button */}
              {selectedRes.status !== 'cancelled' && !selectedRes.is_checked_out && (
                <button 
                  onClick={handleCancelReserva}
                  disabled={cancelLoading}
                  className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-[13.5px] py-3.5 rounded-xl transition-all active:scale-[0.98] border border-rose-200 flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {cancelLoading ? (
                    <div className="w-4 h-4 border-2 border-rose-600/30 border-t-rose-600 rounded-full animate-spin" />
                  ) : (
                    <>
                      <AlertCircle size={15} />
                      Cancelar Reserva en Beds24
                    </>
                  )}
                </button>
              )}

              <button 
                onClick={() => {
                  window.open(`https://beds24.com/control2.php?pagetype=autoBooking&id=${selectedRes.id}`, '_blank');
                }}
                className="w-full bg-white hover:bg-zinc-50 text-zinc-700 font-semibold text-[13px] py-3 rounded-xl transition-all active:scale-[0.98] border border-zinc-200"
              >
                Ver Info Original en Beds24
              </button>
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
}
