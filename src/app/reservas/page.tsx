"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, RefreshCw, User, Users, ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2, AlertCircle, Download, BedDouble, LogIn, FileText, UploadCloud, Camera, Wallet, Send, X } from 'lucide-react';
import { getActiveEmployee } from '@/lib/auth';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@supabase/supabase-js';
import { computeOtaSplit, getCapacityRules } from '@/lib/beds24';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TABS = ['Todas', 'Nuevas', 'Próximas', 'Sin Anticipo', 'Directas', 'WhatsApp Bot', 'Airbnb', 'Booking.com', 'Completadas'];

const PHYSICAL_ROOM_GROUPS = [
  {
    category: 'Apartamentos de 3 dormitorios (101-107)',
    rooms: ['101', '102', '103', '104', '105', '106', '107']
  },
  {
    category: 'Apartamentos de 2 dormitorios (201-206)',
    rooms: ['201', '202', '203', '204', '205', '206']
  },
  {
    category: 'Unidades Especiales (401-402)',
    rooms: ['401', '402']
  },
  {
    category: 'Habitaciones Dobles (301-306)',
    rooms: ['301', '302', '303', '304', '305', '306']
  },
  {
    category: 'Apartamentos Nuevos (500-507)',
    rooms: ['500', '501', '502', '503', '504', '505', '506', '507']
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

const normalizeText = (text: string) => 
  (text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function fmtCurrency(amount: number, guestName?: string) {
  const isUSD = guestName?.toUpperCase().includes('(US DOLLARS)');
  const rounded = Math.ceil((amount || 0) * 100) / 100;
  return (isUSD ? 'USD$' : 'MX$') + rounded.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getNightsBetweenDates(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 1;
  const d1 = new Date(checkIn + 'T12:00:00');
  const d2 = new Date(checkOut + 'T12:00:00');
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
}

async function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 900;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) {
            h = (h * MAX) / w;
            w = MAX;
          } else {
            w = (w * MAX) / h;
            h = MAX;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
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
  const [ackLoading, setAckLoading] = useState(false);
  const [showPaymentFlow, setShowPaymentFlow] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [dniPreview, setDniPreview] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [capacitySettings, setCapacitySettings] = useState<Record<string, { base: number; max: number }> | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const [isReassigning, setIsReassigning] = useState(false);
  const [targetRoomName, setTargetRoomName] = useState('');
  const [reassignLoading, setReassignLoading] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<Record<string, boolean>>({});
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  // Estados para búsqueda por fecha
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);

  // Estados para edición de reserva (Admin)
  const [isEditingRes, setIsEditingRes] = useState(false);
  const [editGuestName, setEditGuestName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAdults, setEditAdults] = useState(1);
  const [editChildren, setEditChildren] = useState(0);
  const [editPrice, setEditPrice] = useState('');
  const [editDailyRate, setEditDailyRate] = useState('');
  const [editDeposit, setEditDeposit] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [saveEditLoading, setSaveEditLoading] = useState(false);

  // Estados para registrar abono dedicado
  const [showAbonoFlow, setShowAbonoFlow] = useState(false);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoPaymentMethod, setAbonoPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia' | null>(null);
  const [abonoAccountId, setAbonoAccountId] = useState('');
  const [abonoLoading, setAbonoLoading] = useState(false);
  const [abonoGrupalMode, setAbonoGrupalMode] = useState(false);

  // Estados para abonar/editar anticipo rápido en detalles
  const [isEditingDepositInline, setIsEditingDepositInline] = useState(false);
  const [inlineDepositValue, setInlineDepositValue] = useState('');
  const [inlineDepositLoading, setInlineDepositLoading] = useState(false);

  useEffect(() => {
    if (selectedRes) {
      setShowPaymentFlow(false);
      setIsCheckedIn(selectedRes.is_checked_in || false);
      setIsEditingRes(false);
      setIsEditingDepositInline(false);
      setInlineDepositValue('');
      setEditGuestName(selectedRes.guest_name || '');
      setEditPhone(selectedRes.guest_phone || '');
      setEditAdults(Number(selectedRes.num_adult || 1));
      setEditChildren(Number(selectedRes.num_child || 0));
      const priceEstimate = selectedRes.price_estimate || 0;
      const nights = selectedRes.nights || 1;
      setEditPrice(String(priceEstimate));
      setEditDailyRate(String(Math.round(priceEstimate / nights)));
      setEditDeposit(String(selectedRes.deposit || '0'));
      setEditNotes(selectedRes.notes || '');
      setEditCheckIn(selectedRes.arrival || selectedRes.check_in || '');
      setEditCheckOut(selectedRes.departure || selectedRes.check_out || '');
      
      setShowAbonoFlow(false);
      setAbonoAmount('');
      setAbonoPaymentMethod(null);
      setAbonoAccountId('');
    } else {
      setIsReassigning(false);
      setTargetRoomName('');
      setAvailableRooms({});
      setIsEditingRes(false);
      setIsEditingDepositInline(false);
      setInlineDepositValue('');
      setEditDailyRate('');
      setEditDeposit('');
      setEditNotes('');
      setEditCheckIn('');
      setEditCheckOut('');
      
      setShowAbonoFlow(false);
      setAbonoAmount('');
      setAbonoPaymentMethod(null);
      setAbonoAccountId('');
    }
  }, [selectedRes]);

  // Auto-seleccionar primer sobre compatible para abono de anticipo
  useEffect(() => {
    if (!abonoPaymentMethod) {
      setAbonoAccountId('');
      return;
    }
    const compatible = accounts.filter(acc => {
      const isUSD = selectedRes?.guest_name?.toUpperCase().includes('(US DOLLARS)');
      if (isUSD) {
        const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
        if (!isUSDAcc) return false;
        
        const name = acc.name.trim().toUpperCase();
        if (abonoPaymentMethod === 'efectivo') {
          return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
        }
        return !name.includes('EFE') && !name.includes('CASH');
      } else {
        const name = acc.name.trim().toUpperCase();
        if (abonoPaymentMethod === 'efectivo') {
          return name === 'EFECTIVO';
        }
        if (abonoPaymentMethod === 'tarjeta') {
          return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
        }
        if (abonoPaymentMethod === 'transferencia') {
          return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
        }
        return false;
      }
    });

    if (compatible.length > 0) {
      setAbonoAccountId(compatible[0].id);
    } else {
      setAbonoAccountId('');
    }
  }, [abonoPaymentMethod, accounts, selectedRes]);

  useEffect(() => {
    if (showPaymentFlow && selectedRes) {
      const balanceVal = selectedRes.balance !== undefined
        ? selectedRes.balance
        : (selectedRes.price_estimate || 0) - (selectedRes.deposit || 0);
      
      if (balanceVal > 0) {
        setPaymentAmount(balanceVal.toString());
      } else {
        setPaymentAmount('');
      }
    }
  }, [showPaymentFlow, selectedRes]);

  // Bloquear el scroll del body principal cuando el modal de detalles está abierto (evita fugas de scroll en móviles)
  useEffect(() => {
    if (selectedRes) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
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

    // Validar capacidad máxima de la nueva habitación
    const totalGuests = Number(selectedRes.num_adult || 1) + Number(selectedRes.num_child || 0);
    const rules = getCapacityRules(targetRoomName, capacitySettings || undefined);
    if (totalGuests > rules.max) {
      alert(`⚠️ No se puede reasignar a la habitación ${targetRoomName} porque la capacidad máxima es de ${rules.max} personas y la reserva tiene ${totalGuests} huéspedes.`);
      return;
    }
    
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
              text: `${selectedRes.guest_name} ${selectedRes.num_adult || 1}/${selectedRes.num_child || 0} (ID: ${selectedRes.id}) de la Habitación ${selectedRes.room_name || 'Sin asignar'} - Reasignó la habitación a ${targetRoomName}.`,
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
      
      // Retrasar consulta de Beds24 para dar tiempo a que se propague el cambio
      setTimeout(() => {
        fetchReservas();
      }, 3000);
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
          setSearch(searchId);
          const today = new Date().toISOString().split('T')[0];
          const isCompleted = found.is_checked_out || found.check_out < today;
          setActiveTab(isCompleted ? 'Completadas' : 'Todas');
        }
        // Limpiar el parámetro de la URL inmediatamente para evitar que
        // el efecto vuelva a ejecutarse y reabra el modal al cerrarlo
        window.history.replaceState(null, '', '/reservas');
      }
    }
  // Solo depende de 'reservas': se ejecuta una vez al cargar los datos
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // 1. Guardar el Check-in (usando upsert con onConflict para evitar fallos de clave duplicada)
      const { error: upsertErr } = await supabase.from('checkins').upsert({
        reservation_id: selectedRes.id.toString(),
        guest_name: selectedRes.guest_name,
        room: selectedRes.room_name,
        check_in_date: selectedRes.check_in,
        check_out_date: selectedRes.check_out,
        status: 'checked_in',
        checked_in_by: 'Admin',
        document_url: document_url
      }, { onConflict: 'reservation_id' });

      if (upsertErr) {
        console.error("Error guardando Check-in en base de datos:", upsertErr);
        alert("Fallo al guardar el Check-in en la base de datos: " + upsertErr.message);
        setCheckInLoading(false);
        return;
      }

      const paymentAmountNum = Number(paymentAmount || 0);
      let isSuccess = false;
      let financeError: any = null;

      const channel = selectedRes.channel || '';
      const isOtaAutomated = ['Airbnb', 'Booking.com'].includes(channel);

      if (isOtaAutomated) {
        let netAcc = null;
        let commAcc = null;

        if (channel === 'Airbnb') {
          netAcc = accounts.find(a => {
            const name = a.name.toUpperCase();
            return name === 'HSBC' || name === 'HSBC FISCAL' || name.includes('HSBC');
          });
          commAcc = accounts.find(a => {
            const name = a.name.toUpperCase();
            return (name.includes('COMISIO') || name.includes('COMISIÓ')) && name.includes('AIRBNB');
          });
        } else if (channel === 'Booking.com') {
          netAcc = accounts.find(a => {
            const name = a.name.toUpperCase();
            return name === 'BOOKING' || (name.includes('BOOKING') && !name.includes('COMISIO') && !name.includes('COMISIÓ'));
          });
          commAcc = accounts.find(a => {
            const name = a.name.toUpperCase();
            return (name.includes('COMISIO') || name.includes('COMISIÓ')) && name.includes('BOOKING');
          });
        }

        let netRevenue = selectedRes.expected_payout || 0;
        let commission = selectedRes.host_fee || 0;

        if (netRevenue === 0 && commission === 0) {
          const balanceVal = selectedRes.balance !== undefined
            ? selectedRes.balance
            : (selectedRes.price_estimate || 0) - (selectedRes.deposit || 0);

          const otaSplit = computeOtaSplit(
            balanceVal > 0 ? balanceVal : (selectedRes.price_estimate || 0),
            channel,
            selectedRes.room_name || '',
            selectedRes.check_in || '',
            selectedRes.check_out || '',
            undefined,
            Number(selectedRes.num_adult || 1),
            Number(selectedRes.num_child || 0)
          );
          netRevenue = otaSplit.netRevenue;
          commission = otaSplit.commission;
        }

        const baseDesc = `${selectedRes.guest_name} (ID: ${selectedRes.id}) - Hab ${selectedRes.room_name || 'General'} - Check-in automático (${channel})`;

        const netDesc = `${baseDesc} | Ingreso Neto`;
        let netRecordId = null;

        if (netRevenue > 0) {
          const { data: netRows, error: netErr } = await supabase.from('finances').insert([{
            type: 'ingreso',
            amount: netRevenue,
            category: 'Alojamiento',
            description: `${netDesc} [Pending Sync: B24]`,
            payment_method: 'transferencia',
            account_id: netAcc?.id || null,
            date: new Date().toISOString().split('T')[0]
          }]).select();

          if (!netErr) {
            isSuccess = true;
            netRecordId = netRows?.[0]?.id;
            if (netAcc) {
              await supabase.from('accounts').update({ balance: netAcc.balance + netRevenue }).eq('id', netAcc.id);
            }
          } else {
            financeError = netErr;
          }
        }

        if (commission > 0) {
          const commDesc = `${selectedRes.guest_name || 'Huésped'} (ID: ${selectedRes.id}) - Hab ${selectedRes.room_name || 'General'} - Comisión ${channel}`;
          const { error: commErr } = await supabase.from('finances').insert([{
            type: 'gasto',
            amount: commission,
            category: 'Comisiones',
            description: commDesc,
            payment_method: 'transferencia',
            account_id: commAcc?.id || null,
            date: new Date().toISOString().split('T')[0]
          }]);

          if (!commErr && commAcc) {
            const newCommBalance = commAcc.balance + commission;
            await supabase.from('accounts').update({ balance: newCommBalance }).eq('id', commAcc.id);
          }
        }

        // Sincronizar pago de OTA con Beds24 en tiempo real
        const totalAmount = netRevenue + commission;
        let syncedSuccess = false;
        try {
          const b24PayRes = await fetch('/api/reservas/payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookId: selectedRes.id,
              amount: totalAmount,
              paymentMethod: 'transferencia',
              employeeNum: '999', // Admin
              description: `Cobro Check-in Automático ${channel}`
            })
          });
          const payData = await b24PayRes.json();
          if (b24PayRes.ok && payData.success) {
            syncedSuccess = true;
          }
        } catch (payErr) {
          console.error("Error al registrar pago OTA en Beds24:", payErr);
        }

        if (syncedSuccess && netRecordId) {
          await supabase.from('finances').update({
            description: `${netDesc} [Synced: B24]`
          }).eq('id', netRecordId);
        }
      } else {
        if (paymentReference && paymentAmountNum > 0) {
          const accountName = accounts.find(a => a.id === paymentReference)?.name || paymentReference;
          const paymentDetail = paymentMethod === 'efectivo' ? `Sobre/Caja: ${accountName}` : 
                                paymentMethod === 'tarjeta' ? `Terminal/Autorización: ${accountName}` : 
                                `Cuenta destino: ${accountName}`;

          const baseDesc = `${selectedRes.guest_name} (ID: ${selectedRes.id}) - Hab ${selectedRes.room_name || 'General'} - Check-in automático`;

          // ── OTA Commission Split ──────────────────────────────────────────
          const otaSplit = computeOtaSplit(
            paymentAmountNum,
            selectedRes.channel || '',
            selectedRes.room_name || '',
            selectedRes.check_in || '',
            selectedRes.check_out || '',
            undefined,
            Number(selectedRes.num_adult || 1),
            Number(selectedRes.num_child || 0)
          );

          if (otaSplit.isOTA) {
            // 1. Ingreso neto para el negocio (sin comisión OTA)
            const netDesc = `${baseDesc} | Ingreso Neto (sin comisión ${otaSplit.channelLabel}) | ${paymentDetail}`;
            const { error } = await supabase.from('finances').insert([{
              type: 'ingreso',
              amount: otaSplit.netRevenue,
              category: 'Alojamiento',
              description: paymentDescription ? `${paymentDescription} - ${netDesc} [Pending Sync: B24]` : `${netDesc} [Pending Sync: B24]`,
              payment_method: paymentMethod,
              account_id: paymentReference,
              date: new Date().toISOString().split('T')[0]
            }]);

            if (!error) {
              isSuccess = true;
              const acc = accounts.find(a => a.id === paymentReference);
              if (acc) {
                await supabase.from('accounts').update({ balance: acc.balance + otaSplit.netRevenue }).eq('id', paymentReference);
              }
            } else {
              financeError = error;
            }

            // 2. Egreso de comisión OTA
            const commissionAcc = accounts.find(a =>
              a.name.toUpperCase().replace(/\s+/g, ' ').includes(otaSplit.channelLabel.toUpperCase().replace('.COM', '').replace('.', '').trim())
            );

            if (otaSplit.commission > 0) {
              await supabase.from('finances').insert([{
                type: 'gasto',
                amount: otaSplit.commission,
                category: 'Comisiones',
                description: `${selectedRes.guest_name || 'Huésped'} (ID: ${selectedRes.id}) - Hab ${selectedRes.room_name || 'General'} - Comisión ${otaSplit.channelLabel}`,
                payment_method: 'transferencia',
                account_id: commissionAcc?.id || null,
                date: new Date().toISOString().split('T')[0]
              }]);

              if (commissionAcc) {
                const newCommBalance = commissionAcc.balance + otaSplit.commission;
                await supabase.from('accounts').update({ balance: newCommBalance }).eq('id', commissionAcc.id);
              }
            }
          } else {
            // Registro normal directo (sin OTA)
            const { error } = await supabase.from('finances').insert([{
              type: 'ingreso',
              amount: paymentAmountNum,
              category: 'Alojamiento',
              description: paymentDescription
                ? `${paymentDescription} - ${baseDesc} | ${paymentDetail} [Pending Sync: B24]`
                : `${baseDesc} | ${paymentDetail} [Pending Sync: B24]`,
              payment_method: paymentMethod,
              account_id: paymentReference,
              date: new Date().toISOString().split('T')[0]
            }]);

            if (!error) {
              isSuccess = true;
              const acc = accounts.find(a => a.id === paymentReference);
              if (acc) {
                await supabase.from('accounts').update({ balance: acc.balance + paymentAmountNum }).eq('id', paymentReference);
              }
            } else {
              financeError = error;
            }
          }
        }

        if (isSuccess) {
          // Registrar el pago en Beds24 en tiempo real para flujos manuales
          try {
            await fetch('/api/reservas/payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bookId: selectedRes.id,
                amount: paymentAmountNum,
                paymentMethod: paymentMethod,
                employeeNum: '999', // Admin
                description: paymentDescription || null
              })
            });
          } catch (payB24Err) {
            console.error("Error al registrar pago en Beds24:", payB24Err);
          }
        } else {
          if (financeError) {
            console.error("Error al registrar ingreso en finanzas:", financeError);
          }
        }
      }

      setIsCheckedIn(true);
      setShowPaymentFlow(false);
      setDocumentFile(null);
      setDniPreview(null);
      setPaymentReference('');
      setPaymentAmount('');
      setPaymentDescription('');
      
      // Actualizar estado local
      setReservas(prev => prev.map(r => r.id === selectedRes.id ? { 
        ...r, 
        is_checked_in: true,
        document_url: document_url 
      } : r));
      
      // También actualizar selectedRes para que el botón de Ver Documento aparezca de inmediato
      setSelectedRes((prev: any) => ({ ...prev, is_checked_in: true, document_url: document_url }));

      alert('¡Check-in realizado con éxito!');
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
      const [res, chk, acc, capRes] = await Promise.all([
        fetch('/api/reservas?t=' + Date.now()),
        supabase.from('checkins').select('*'),
        supabase.from('accounts').select('*').order('sort_index', { ascending: true }).order('name', { ascending: true }),
        supabase.from('settings').select('value').eq('key', 'capacity_settings').maybeSingle()
      ]);
      const json = await res.json();
      
      let checkinMap: Record<string, any> = {};
      if (acc.data) setAccounts(acc.data);
      if (chk.data) {
        chk.data.forEach(c => { checkinMap[String(c.reservation_id)] = c; });
      }

      if (capRes?.data?.value) {
        try {
          const parsed = typeof capRes.data.value === 'string' ? JSON.parse(capRes.data.value) : capRes.data.value;
          setCapacitySettings(parsed || null);
        } catch (e) {
          console.error("Error al parsear capacity_settings:", e);
        }
      }

      if (json.error === 'TOKEN_EXPIRED') { setTokenError(true); return; }
      if (json.success && json.data) {
        const sorted = json.data.map((r: any) => ({
          ...r,
          is_checked_in: checkinMap[String(r.id)]?.status === 'checked_in',
          is_checked_out: checkinMap[String(r.id)]?.status === 'checked_out',
          is_acknowledged: checkinMap[String(r.id)]?.status === 'acknowledged' || checkinMap[String(r.id)]?.status === 'checked_in' || checkinMap[String(r.id)]?.status === 'checked_out',
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

  const handleSaveReservationEdit = async () => {
    if (!selectedRes) return;

    // Validar capacidad máxima de la habitación
    const rules = getCapacityRules(selectedRes.room_name || selectedRes.room_id || '', capacitySettings || undefined);
    const totalGuests = Number(editAdults) + Number(editChildren);
    if (totalGuests > rules.max) {
      alert(`⚠️ La capacidad máxima de la habitación ${selectedRes.room_name || 'seleccionada'} es de ${rules.max} personas. Has ingresado ${totalGuests} huéspedes.`);
      return;
    }

    setSaveEditLoading(true);
    try {
      const res = await fetch('/api/reservas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedRes.id,
          guestName: editGuestName,
          phone: editPhone,
          numAdult: editAdults,
          numChild: editChildren,
          price: Number(editPrice),
          deposit: Number(editDeposit),
          notes: editNotes,
          checkIn: editCheckIn,
          checkOut: editCheckOut
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar los cambios');

      alert('✅ Reserva modificada con éxito.');
      
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
            action: 'reserva_modificada_admin',
            room: selectedRes.room_name || 'General',
            details: JSON.stringify({
              text: `${selectedRes.guest_name} ${selectedRes.num_adult || 1}/${selectedRes.num_child || 0} (ID: ${selectedRes.id}) de la Habitación ${selectedRes.room_name || 'General'} - Modificó la reserva (Nombre: ${editGuestName}, Tel: ${editPhone}, Pax: ${editAdults}A/${editChildren}N, Total: MX$${editPrice}, Anticipo: MX$${editDeposit}).`,
              modificacion: {
                bookingId: selectedRes.id,
                guestName: editGuestName,
                phone: editPhone,
                numAdult: editAdults,
                numChild: editChildren,
                price: Number(editPrice),
                deposit: Number(editDeposit),
                notes: editNotes
              }
            })
          })
        });
      } catch (logErr) {
        console.error("Error registrando log de modificación:", logErr);
      }

      setSelectedRes((prev: any) => ({
        ...prev,
        guest_name: editGuestName,
        guest_phone: editPhone,
        num_adult: editAdults,
        num_child: editChildren,
        price_estimate: Number(editPrice),
        deposit: Number(editDeposit),
        balance: Number(editPrice) - Number(editDeposit),
        notes: editNotes,
        arrival: editCheckIn,
        check_in: editCheckIn,
        departure: editCheckOut,
        check_out: editCheckOut,
        nights: getNightsBetweenDates(editCheckIn, editCheckOut)
      }));

      setReservas(prev => prev.map(r => r.id === selectedRes.id ? {
        ...r,
        guest_name: editGuestName,
        guest_phone: editPhone,
        num_adult: editAdults,
        num_child: editChildren,
        price_estimate: Number(editPrice),
        deposit: Number(editDeposit),
        balance: Number(editPrice) - Number(editDeposit),
        notes: editNotes,
        arrival: editCheckIn,
        check_in: editCheckIn,
        departure: editCheckOut,
        check_out: editCheckOut,
        nights: getNightsBetweenDates(editCheckIn, editCheckOut)
      } : r));

      setIsEditingRes(false);
      
      // Retrasar la sincronización en segundo plano para dar tiempo a Beds24 a propagar el cambio
      setTimeout(() => {
        fetchReservas();
      }, 3000);
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al guardar cambios:\n\n${err.message}`);
    } finally {
      setSaveEditLoading(false);
    }
  };

  // --- Grupo de reservas para anticipo grupal ---
  const siblingBookings = useMemo(() => {
    if (!selectedRes) return [];
    const cleanStr = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
    const mainName = cleanStr(selectedRes.guest_name || '');
    const mainPhone = (selectedRes.guest_phone || '').trim();
    return reservas.filter(r => {
      if (r.check_in !== selectedRes.check_in || r.id === selectedRes.id || r.is_checked_out) return false;
      const samePhone = mainPhone && r.guest_phone && r.guest_phone.trim() === mainPhone;
      const sameName = mainName && r.guest_name && (cleanStr(r.guest_name).includes(mainName) || mainName.includes(cleanStr(r.guest_name)));
      return samePhone || sameName;
    });
  }, [selectedRes, reservas]);

  const groupBookings = useMemo(() => {
    if (!selectedRes) return [];
    return [selectedRes, ...siblingBookings];
  }, [selectedRes, siblingBookings]);

  const isOtaRoom = (r: any) => ['Airbnb', 'Booking.com'].includes(r.channel || '');

  const directGroupBookings = useMemo(() => {
    return groupBookings.filter(r => !isOtaRoom(r));
  }, [groupBookings]);

  const directGroupTotalBalance = useMemo(() => {
    return directGroupBookings.reduce((sum, r) => {
      const bal = r.balance !== undefined ? r.balance : Math.max(0, (r.price_estimate || 0) - (r.deposit || 0));
      return sum + bal;
    }, 0);
  }, [directGroupBookings]);

  const handleRegisterAbono = async () => {
    if (!selectedRes || !abonoAmount || !abonoPaymentMethod || !abonoAccountId) return;
    setAbonoLoading(true);
    try {
      const amountNum = Number(abonoAmount);
      const oldDeposit = selectedRes.deposit || 0;
      const newDeposit = oldDeposit + amountNum;

      // 1. Modificar depósito en Beds24 llamando a la API PUT /api/reservas
      const res = await fetch('/api/reservas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedRes.id,
          deposit: newDeposit
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar el anticipo en Beds24');

      // 2. Registrar en Supabase finances
      const baseDesc = `${selectedRes.guest_name} (ID: ${selectedRes.id}) - Hab ${selectedRes.room_name || 'General'} - Anticipo Directo`;
      const todayStr = new Date().toLocaleDateString('sv-SE');

      const { error: financeErr } = await supabase.from('finances').insert({
        type: 'ingreso',
        amount: amountNum,
        category: 'Alojamiento',
        description: baseDesc,
        payment_method: abonoPaymentMethod,
        account_id: abonoAccountId,
        date: todayStr
      });

      if (financeErr) {
        console.error("Error al registrar finanzas para anticipo:", financeErr);
        alert(`⚠️ Se guardó el anticipo en Beds24, pero hubo un error al registrar en Finanzas: ${financeErr.message}`);
      } else {
        // 3. Actualizar balance de la cuenta
        const matchedAcc = accounts.find(a => a.id === abonoAccountId);
        if (matchedAcc) {
          const newBalance = matchedAcc.balance + amountNum;
          const { error: accErr } = await supabase.from('accounts').update({ balance: newBalance }).eq('id', abonoAccountId);
          if (accErr) {
            console.error("Error al actualizar balance de cuenta para anticipo:", accErr);
          } else {
            setAccounts(prev => prev.map(a => a.id === abonoAccountId ? { ...a, balance: newBalance } : a));
          }
        }
      }

      // NOTA: No se llama a /api/reservas/payment porque el PUT ya actualiza el depósito
      // tanto en Beds24 como en local_reservas. Llamar a ambos causaba duplicación ($675 → $1350).

      // Registrar log de anticipo
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
            action: 'abono_registrado',
            room: selectedRes.room_name || 'General',
            details: JSON.stringify({
              text: `${selectedRes.guest_name} ${selectedRes.num_adult || 1}/${selectedRes.num_child || 0} (ID: ${selectedRes.id}) de la Habitación ${selectedRes.room_name || 'General'} - Registró abono directo de MX$${amountNum} (Cuenta: ${abonoAccountId}, Método: ${abonoPaymentMethod}).`,
              abono: {
                bookingId: selectedRes.id,
                amount: amountNum,
                paymentMethod: abonoPaymentMethod,
                accountId: abonoAccountId
              }
            })
          })
        });
      } catch (logErr) {
        console.error("Error registrando log de abono:", logErr);
      }

      // 4. Actualizar estados locales reactivos
      setSelectedRes((prev: any) => ({
        ...prev,
        deposit: newDeposit,
        balance: (prev.price_estimate || 0) - newDeposit
      }));

      setReservas(prev => prev.map(r => r.id === selectedRes.id ? {
        ...r,
        deposit: newDeposit,
        balance: (r.price_estimate || 0) - newDeposit
      } : r));

      setShowAbonoFlow(false);
      alert('✅ Anticipo registrado exitosamente.');

      // Refrescar en segundo plano tras delay
      setTimeout(() => {
        fetchReservas();
      }, 3000);
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al registrar anticipo:\n\n${err.message}`);
    } finally {
      setAbonoLoading(false);
    }
  };

  // Registrar anticipo grupal proporcional (Reservas / Admin)
  const handleRegisterAbonoGrupal = async () => {
    if (!selectedRes || !abonoAmount || !abonoPaymentMethod || !abonoAccountId) return;
    if (directGroupBookings.length === 0) return;
    setAbonoLoading(true);
    try {
      const totalAmount = Number(abonoAmount);
      const totalBalance = directGroupTotalBalance;
      const todayStr = new Date().toLocaleDateString('sv-SE');
      const emp = getActiveEmployee('recepcion');
      const employeeNum = emp?.employee_num || '999';
      const employeeName = emp?.full_name || 'Administrador';

      for (const booking of directGroupBookings) {
        const bookingBalance = booking.balance !== undefined
          ? booking.balance
          : Math.max(0, (booking.price_estimate || 0) - (booking.deposit || 0));

        const proportion = totalBalance > 0
          ? bookingBalance / totalBalance
          : 1 / directGroupBookings.length;

        const bookingAmount = Math.round(totalAmount * proportion * 100) / 100;
        if (bookingAmount <= 0) continue;

        const newDeposit = (booking.deposit || 0) + bookingAmount;

        const res = await fetch('/api/reservas', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: booking.id, deposit: newDeposit })
        });
        if (!res.ok) {
          console.error(`Error actualizando depósito de reserva ${booking.id}`);
          continue;
        }

        await supabase.from('finances').insert({
          type: 'ingreso',
          amount: bookingAmount,
          category: 'Alojamiento',
          description: `Anticipo Grupal – ${booking.guest_name} (ID: ${booking.id}) Hab ${booking.room_name || booking.room}`,
          payment_method: abonoPaymentMethod,
          account_id: abonoAccountId,
          date: todayStr
        });

        try {
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_num: employeeNum,
              employee_name: employeeName,
              department: emp?.department || 'recepcion',
              module: 'reservas',
              action: 'abono_grupal_registrado',
              room: booking.room_name || booking.room || 'General',
              details: JSON.stringify({
                text: `Anticipo grupal de MX$${bookingAmount} aplicado a ${booking.guest_name} Hab ${booking.room_name || booking.room} (proporcional del total MX$${totalAmount})`,
                abono: { bookingId: booking.id, amount: bookingAmount, method: abonoPaymentMethod, accountId: abonoAccountId }
              })
            })
          });
        } catch (e) { console.error('Error log abono grupal:', e); }

        setReservas(prev => prev.map(r => r.id === booking.id ? {
          ...r,
          deposit: newDeposit,
          balance: Math.max(0, (r.price_estimate || 0) - newDeposit)
        } : r));
      }

      const matchedAcc = accounts.find(a => a.id === abonoAccountId);
      if (matchedAcc) {
        const newBalance = matchedAcc.balance + totalAmount;
        const { error: accErr } = await supabase.from('accounts').update({ balance: newBalance }).eq('id', abonoAccountId);
        if (!accErr) setAccounts(prev => prev.map(a => a.id === abonoAccountId ? { ...a, balance: newBalance } : a));
      }

      const mainBooking = directGroupBookings.find(b => String(b.id) === String(selectedRes.id));
      if (mainBooking) {
        const mainBalance = mainBooking.balance !== undefined ? mainBooking.balance : Math.max(0, (mainBooking.price_estimate || 0) - (mainBooking.deposit || 0));
        const mainProportion = totalBalance > 0 ? mainBalance / totalBalance : 1 / directGroupBookings.length;
        const mainAmount = Math.round(totalAmount * mainProportion * 100) / 100;
        const newMainDeposit = (selectedRes.deposit || 0) + mainAmount;
        setSelectedRes((prev: any) => ({
          ...prev,
          deposit: newMainDeposit,
          balance: Math.max(0, (prev.price_estimate || 0) - newMainDeposit)
        }));
      }

      setShowAbonoFlow(false);
      setAbonoGrupalMode(false);
      setAbonoAmount('');
      setAbonoPaymentMethod(null);
      setAbonoAccountId('');
      alert(`✅ Anticipo grupal de ${fmtCurrency(totalAmount, selectedRes.guest_name)} distribuido en ${directGroupBookings.length} habitaciones.`);

      setTimeout(() => { fetchReservas(); }, 3000);
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al registrar anticipo grupal:\n\n${err.message}`);
    } finally {
      setAbonoLoading(false);
    }
  };

  const [cancelLoading, setCancelLoading] = useState(false);

  const handleAcknowledgeReserva = async () => {
    if (!selectedRes) return;
    setAckLoading(true);
    try {
      const { error } = await supabase.from('checkins').upsert({
        reservation_id: selectedRes.id.toString(),
        guest_name: selectedRes.guest_name,
        room: selectedRes.room_name,
        check_in_date: selectedRes.check_in,
        check_out_date: selectedRes.check_out,
        status: 'acknowledged',
        checked_in_by: 'Admin'
      }, { onConflict: 'reservation_id' });

      if (error) throw error;

      setSelectedRes((prev: any) => ({ ...prev, is_acknowledged: true }));
      setReservas(prev => prev.map(r => r.id === selectedRes.id ? { ...r, is_acknowledged: true } : r));

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
            action: 'reserva_enterado',
            room: selectedRes.room_name || 'General',
            details: JSON.stringify({
              text: `${selectedRes.guest_name} ${selectedRes.num_adult || 1}/${selectedRes.num_child || 0} (ID: ${selectedRes.id}) de la Habitación ${selectedRes.room_name || 'General'} - Marcó la reserva como enterado.`,
              bookingId: selectedRes.id,
              guestName: selectedRes.guest_name
            })
          })
        });
      } catch (logErr) {
        console.error("Error registrando log de enterado:", logErr);
      }

      alert('✅ Reserva marcada como enterado.');
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al marcar como enterado:\n\n${err.message}`);
    } finally {
      setAckLoading(false);
    }
  };

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
              text: `${selectedRes.guest_name} ${selectedRes.num_adult || 1}/${selectedRes.num_child || 0} (ID: ${selectedRes.id}) de la Habitación ${selectedRes.room_name || 'General'} - Canceló permanentemente la reserva.`,
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
      
      // Retrasar consulta de Beds24 para dar tiempo a que se propague el cambio
      setTimeout(() => {
        fetchReservas(); // Refrescar el listado
      }, 3000);
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


  useEffect(() => {
    fetchReservas();
    if (typeof window !== 'undefined') {
      setUserRole(localStorage.getItem('jaroje_role'));
      const params = new URLSearchParams(window.location.search);
      const querySearch = params.get('search');
      if (querySearch) {
        setSearch(querySearch);
      }
    }
  }, []);



  const todayStr = new Date().toISOString().split('T')[0];

  // Reservas activas operativas: no han completado el checkout Y su fecha de salida es hoy o futura
  const activeReservas = reservas.filter(r => !r.is_checked_out && r.check_out >= todayStr);
  // Reservas completadas / pasadas: ya hicieron checkout O la fecha de salida ya transcurrió
  const completedReservas = reservas.filter(r => r.is_checked_out || r.check_out < todayStr);

  const filtered = (activeTab === 'Completadas' ? completedReservas : activeReservas).filter(r => {
    const matchSearch = !search || 
      normalizeText(r.guest_name).includes(normalizeText(search)) ||
      r.id?.toString().includes(search);
    
    let matchTab = true;
    if (activeTab === 'Nuevas') matchTab = !r.is_acknowledged;
    else if (activeTab === 'Próximas') matchTab = r.check_in >= todayStr;
    else if (activeTab === 'Sin Anticipo') {
      const isDirectChannel = ['Directo', 'WhatsApp Bot', 'Beds24', 'Recepción'].includes(r.channel || '');
      matchTab = isDirectChannel && (!r.deposit || r.deposit === 0);
    }
    else if (activeTab === 'Directas') matchTab = r.channel === 'Directo' || r.channel === 'WhatsApp Bot' || r.channel === 'Beds24';
    else if (activeTab !== 'Todas' && activeTab !== 'Completadas') matchTab = r.channel === activeTab;

    let matchDateRange = true;
    if (startDate && endDate) {
      matchDateRange = (r.check_in <= endDate) && (r.check_out >= startDate);
    } else if (startDate) {
      matchDateRange = r.check_out >= startDate;
    } else if (endDate) {
      matchDateRange = r.check_in <= endDate;
    }

    return matchSearch && matchTab && matchDateRange;
  });

  const totalRevenue = filtered.reduce((sum: number, r: any) => sum + (r.price_estimate || 0), 0);

  return (
    <div className="space-y-4 pb-24 bg-[#fafafa]">
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight">Reservas</h2>
          <p className="text-[13px] font-medium text-zinc-500 mt-0.5">
            {isLoading ? '...' : `${activeReservas.length} activas · MX$${totalRevenue.toLocaleString('es-MX')} estimado`}
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

      {/* Buscador y Rango de Fechas */}
      <div className="space-y-2.5">
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
        
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Desde</span>
            <input 
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              onBlur={e => setStartDate((e.target as HTMLInputElement).value)}
              onInput={e => setStartDate((e.target as HTMLInputElement).value)}
              className="w-full bg-white border border-zinc-200/80 rounded-xl py-2 pl-12 pr-2 text-[12px] font-semibold text-zinc-700 outline-none focus:border-zinc-400 transition-all shadow-sm"
            />
          </div>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Hasta</span>
            <input 
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              onBlur={e => setEndDate((e.target as HTMLInputElement).value)}
              onInput={e => setEndDate((e.target as HTMLInputElement).value)}
              className="w-full bg-white border border-zinc-200/80 rounded-xl py-2 pl-12 pr-2 text-[12px] font-semibold text-zinc-700 outline-none focus:border-zinc-400 transition-all shadow-sm"
            />
          </div>
        </div>

        {(startDate || endDate) && (
          <div className="flex justify-end animate-in fade-in duration-200">
            <button 
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 px-2 py-1 rounded-lg border border-rose-100 transition-all active:scale-95 cursor-pointer"
            >
              Limpiar rango de fechas ✕
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map(t => {
          const isNuevas = t === 'Nuevas';
          const isSinAnticipo = t === 'Sin Anticipo';
          const nuevasCount = activeReservas.filter(r => !r.is_acknowledged).length;
          const sinAnticipoCount = activeReservas.filter(r => {
            const isDirectChannel = ['Directo', 'WhatsApp Bot', 'Beds24', 'Recepción'].includes(r.channel || '');
            return isDirectChannel && (!r.deposit || r.deposit === 0);
          }).length;
          const displayLabel = isNuevas && nuevasCount > 0 ? `Nuevas (${nuevasCount})` : isSinAnticipo && sinAnticipoCount > 0 ? `Sin Anticipo (${sinAnticipoCount})` : t;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all active:scale-[0.98] flex items-center gap-1.5 ${
                activeTab === t
                  ? (isSinAnticipo ? 'bg-rose-600 text-white shadow-sm' : 'bg-zinc-900 text-white shadow-sm')
                  : (isSinAnticipo && sinAnticipoCount > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100' : 'bg-white text-zinc-650 border border-zinc-200/80 hover:bg-zinc-50')
              }`}
            >
              <span>{displayLabel}</span>
              {isNuevas && nuevasCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse inline-block" />
              )}
              {isSinAnticipo && sinAnticipoCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse inline-block" />
              )}
            </button>
          );
        })}
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
                className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex flex-col gap-3 hover:border-zinc-300 transition-colors active:scale-[0.99] cursor-pointer animate-in fade-in duration-200"
              >
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 border ${
                      isArrival ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                      isDeparture ? 'bg-amber-50 border-amber-100 text-amber-600' :
                      'bg-zinc-100 border-zinc-200 text-zinc-650'
                    }`}>
                      {isArrival ? <ArrowDownLeft size={18} strokeWidth={2.5} /> :
                       isDeparture ? <ArrowUpRight size={18} strokeWidth={2.5} /> :
                       <User size={18} strokeWidth={2.5} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-semibold text-zinc-900 text-[14px] leading-tight">
                          {r.guest_name} <span className="text-zinc-500 font-medium text-[11px]">({r.num_adult || 1}A{Number(r.num_child) > 0 ? ` / ${r.num_child}N` : ''})</span>
                        </h3>
                        {!r.is_acknowledged && r.status !== 'cancelled' && (
                          <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-150 animate-pulse">
                            NUEVA 🆕
                          </span>
                        )}
                        {isArrival && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">HOY LLEGA</span>}
                        {isDeparture && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">HOY SALE</span>}
                        {(() => {
                          const cleanStr = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
                          const mainName = cleanStr(r.guest_name || '');
                          const mainPhone = (r.guest_phone || '').trim();
                          const siblings = reservas.filter(o => {
                            if (o.check_in !== r.check_in || o.id === r.id || o.is_checked_out) return false;
                            const samePhone = mainPhone && o.guest_phone && o.guest_phone.trim() === mainPhone;
                            const sameName = mainName && o.guest_name && (cleanStr(o.guest_name).includes(mainName) || mainName.includes(cleanStr(o.guest_name)));
                            return samePhone || sameName;
                          });
                          if (siblings.length > 0) {
                            return <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-150">GRUPO 🏨 {siblings.length + 1}</span>;
                          }
                          return null;
                        })()}
                      </div>
                      <p className="text-[12.5px] font-bold text-zinc-700 mt-1 flex items-center gap-1.5">
                        <BedDouble size={13} className="text-zinc-400" />
                        <span>{r.room_name}</span>
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 font-bold rounded text-[9.5px] uppercase tracking-wide">
                    {r.channel}
                  </span>
                </div>

                {/* Desglose Financiero */}
                <div className="grid grid-cols-3 gap-2 text-center text-[12px] py-2 px-3 bg-zinc-50 border border-zinc-150 rounded-xl font-sans">
                  <div>
                    <span className="text-[9px] font-bold text-zinc-450 uppercase tracking-wider block">Total</span>
                    <span className="font-extrabold text-zinc-850">{fmtCurrency(r.price_estimate || 0, r.guest_name)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-zinc-450 uppercase tracking-wider block">Anticipo</span>
                    <span className="font-extrabold text-emerald-600">{fmtCurrency(r.deposit || 0, r.guest_name)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-zinc-450 uppercase tracking-wider block">Adeudo</span>
                    <span className={`font-black ${(r.balance ?? ((r.price_estimate || 0) - (r.deposit || 0))) > 0 ? 'text-amber-600' : 'text-zinc-650'}`}>
                      {fmtCurrency(r.balance ?? ((r.price_estimate || 0) - (r.deposit || 0)), r.guest_name)}
                    </span>
                  </div>
                </div>

                {/* Fechas y Estancia */}
                {activeTab === 'Sin Anticipo' && r.booking_time && (
                  <div className="flex items-center gap-2 text-[11px] font-semibold bg-rose-50 border border-rose-100 rounded-lg px-3 py-1.5">
                    <span className="text-rose-600">📅 Ingresada al sistema:</span>
                    <strong className="text-rose-800">{format(parseISO(r.booking_time.split(' ')[0] || r.booking_time.split('T')[0]), 'dd MMM yyyy', { locale: es })}</strong>
                    <span className="text-rose-500 ml-auto">
                      {(() => {
                        const created = new Date(r.booking_time);
                        const now = new Date();
                        const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
                        return diffDays === 0 ? 'Hoy' : diffDays === 1 ? 'Hace 1 día' : `Hace ${diffDays} días`;
                      })()}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-[11.5px] text-zinc-500 font-semibold border-t border-zinc-100 pt-2 px-1">
                  <span>In: <strong className="text-zinc-800">{r.check_in ? format(parseISO(r.check_in), 'dd MMM yyyy', { locale: es }) : '—'}</strong></span>
                  <span className="bg-zinc-100 text-zinc-650 px-2 py-0.5 rounded font-bold text-[10.5px]">{r.nights} noche{r.nights !== 1 ? 's' : ''}</span>
                  <span>Out: <strong className="text-zinc-800">{r.check_out ? format(parseISO(r.check_out), 'dd MMM yyyy', { locale: es }) : '—'}</strong></span>
                </div>

                <StatusBadge status={r.status} isCheckedIn={r.is_checked_in} isCheckedOut={r.is_checked_out} />

                {!r.is_acknowledged && r.status !== 'cancelled' && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const { error } = await supabase.from('checkins').upsert({
                          reservation_id: r.id.toString(),
                          guest_name: r.guest_name,
                          room: r.room_name,
                          check_in_date: r.check_in,
                          check_out_date: r.check_out,
                          status: 'acknowledged',
                          checked_in_by: 'Admin'
                        }, { onConflict: 'reservation_id' });
                        if (error) throw error;
                        
                        setReservas(prev => prev.map(res => res.id === r.id ? { ...res, is_acknowledged: true } : res));
                        
                        const emp = getActiveEmployee('recepcion');
                        const employeeNum = emp?.employee_num || '999';
                        const employeeName = emp?.full_name || 'Administrador';
                        await fetch('/api/employee-logs', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            employee_num: employeeNum,
                            employee_name: employeeName,
                            department: emp?.department || 'recepcion',
                            module: 'recepcion',
                            action: 'reserva_enterado',
                            room: r.room_name || 'General',
                            details: JSON.stringify({
                              text: `${r.guest_name} ${r.num_adult || 1}/${r.num_child || 0} (ID: ${r.id}) de la Habitación ${r.room_name || 'General'} - Marcó la reserva como enterado desde el listado.`,
                              bookingId: r.id
                            })
                          })
                        });
                      } catch (err) {
                        console.error(err);
                        alert('Error al marcar como revisado');
                      }
                    }}
                    className="w-full mt-2.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] cursor-pointer"
                  >
                    ✓ REVISADO (Quitar de Nuevas)
                  </button>
                )}
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
            <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between sticky top-0 bg-white z-10 font-sans">
              <div>
                <h3 className="text-[18px] font-semibold text-zinc-900 leading-tight">
                  {isEditingRes 
                    ? 'Editar Reserva' 
                    : showPaymentFlow 
                      ? 'Proceso de Check-In' 
                      : 'Detalles de Reserva'}
                </h3>
                <p className="text-[12px] font-medium text-zinc-500 mt-0.5 uppercase tracking-wider">ID: {selectedRes.id || selectedRes.room_id || 'N/A'}</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedRes.status !== 'cancelled' && userRole === 'admin' && (
                  <button
                    onClick={() => setIsEditingRes(!isEditingRes)}
                    className="px-2.5 py-1 text-[11px] font-bold text-zinc-650 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer"
                  >
                    {isEditingRes ? 'Cancelar' : 'Editar 📝'}
                  </button>
                )}
                <button 
                  onClick={() => {
                    setSelectedRes(null);
                    setDniPreview(null);
                    setDocumentFile(null);
                    setShowPaymentFlow(false);
                    setPaymentMethod('efectivo');
                    setPaymentReference('');
                    setPaymentAmount('');
                    setPaymentDescription('');
                    // Asegurarse de que la URL no tenga ?id= para no reabrir el modal
                    if (window.location.search.includes('id=')) {
                      window.history.replaceState(null, '', '/reservas');
                    }
                  }}
                  className="w-8 h-8 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-full transition-colors active:scale-95 animate-in fade-in duration-200"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* Contenido Modal */}
            <div className="flex-1 overflow-y-auto overscroll-y-contain p-6 space-y-6">
              
              {isEditingRes ? (
                // Formulario de Edición Admin
                <div className="space-y-4 text-left font-sans animate-in fade-in duration-200">
                  {/* 1. Nombre del huésped (No. Huéspedes) */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl space-y-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest pl-0.5 mb-1.5 block">Nombre del Huésped</label>
                      <input
                        type="text"
                        value={editGuestName}
                        onChange={e => setEditGuestName(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 outline-none text-[13px] font-semibold text-zinc-900 focus:border-zinc-400 shadow-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest pl-0.5 mb-1.5 block">Adultos</label>
                        <select
                          value={editAdults}
                          onChange={e => setEditAdults(Number(e.target.value))}
                          className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 outline-none text-[13px] font-semibold text-zinc-900 focus:border-zinc-400 cursor-pointer shadow-sm"
                        >
                          {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest pl-0.5 mb-1.5 block">Niños</label>
                        <select
                          value={editChildren}
                          onChange={e => setEditChildren(Number(e.target.value))}
                          className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 outline-none text-[13px] font-semibold text-zinc-900 focus:border-zinc-400 cursor-pointer shadow-sm"
                        >
                          {[0,1,2,3,4,5,6,7,8].map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {selectedRes && (() => {
                      const rules = getCapacityRules(selectedRes.room_name || selectedRes.room_id || '', capacitySettings || undefined);
                      const total = editAdults + editChildren;
                      const isOver = total > rules.max;
                      return (
                        <div className={`text-[11px] font-bold mt-1 pl-0.5 ${isOver ? 'text-rose-600 animate-pulse' : 'text-emerald-600'}`}>
                          {isOver 
                            ? `⚠️ Límite excedido. Máximo permitido para la habitación ${selectedRes.room_name || 'seleccionada'}: ${rules.max} personas.` 
                            : rules.max > rules.base
                              ? `✓ Capacidad permitida. Incluidas: ${rules.base} · Adicionales con cargo: ${rules.max - rules.base} (Máx: ${rules.max} personas).`
                              : `✓ Capacidad permitida: ${rules.max} personas (sin cargos adicionales).`}
                        </div>
                      );
                    })()}

                  </div>

                  {/* Fechas de Estancia */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl space-y-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] text-left">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Fechas de Estancia</span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5 block">Check-In</label>
                        <input
                          type="date"
                          value={editCheckIn}
                          onChange={e => {
                            const newIn = e.target.value;
                            setEditCheckIn(newIn);
                            if (newIn && editCheckOut) {
                              const nights = getNightsBetweenDates(newIn, editCheckOut) || 1;
                              if (editDailyRate !== '') {
                                setEditPrice(String(Math.round(Number(editDailyRate) * nights)));
                              }
                            }
                          }}
                          className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 outline-none text-[13px] font-semibold text-zinc-900 focus:border-zinc-400 shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5 block">Check-Out</label>
                        <input
                          type="date"
                          value={editCheckOut}
                          onChange={e => {
                            const newOut = e.target.value;
                            setEditCheckOut(newOut);
                            if (editCheckIn && newOut) {
                              const nights = getNightsBetweenDates(editCheckIn, newOut) || 1;
                              if (editDailyRate !== '') {
                                setEditPrice(String(Math.round(Number(editDailyRate) * nights)));
                              }
                            }
                          }}
                          className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 outline-none text-[13px] font-semibold text-zinc-900 focus:border-zinc-400 shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. Teléfono */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest pl-0.5 mb-1.5 block">Teléfono</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={e => setEditPhone(e.target.value)}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 outline-none text-[13px] font-semibold text-zinc-900 focus:border-zinc-400 shadow-sm"
                    />
                  </div>

                  {/* 3. Habitación asignada */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Habitación Asignada</span>
                      <span className="text-[14px] font-bold text-zinc-900 mt-0.5">{selectedRes.room_name || 'Sin asignar'}</span>
                    </div>
                    <span className="text-[10px] text-zinc-455 font-bold italic shrink-0">Bypass de reasignación*</span>
                  </div>

                  {/* 4. Canal reservado (directo, Airbnb, Booking) */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Canal reservado</span>
                      <span className="px-2.5 py-1 bg-blue-50 border border-blue-100 text-blue-700 font-bold rounded-lg text-[11px] uppercase tracking-wide inline-block mt-1">
                        {selectedRes.channel || 'Directo'}
                      </span>
                    </div>
                    <StatusBadge status={selectedRes.status} isCheckedIn={selectedRes.is_checked_in} isCheckedOut={selectedRes.is_checked_out} />
                  </div>

                  {/* 5. Tarifa diaria */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest pl-0.5 mb-1.5 block">Tarifa diaria</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-sm">$</span>
                      <input
                        type="number"
                        value={editDailyRate}
                        onChange={e => {
                          const val = e.target.value;
                          setEditDailyRate(val);
                          if (val !== '') {
                            const nights = getNightsBetweenDates(editCheckIn, editCheckOut) || 1;
                            setEditPrice(String(Math.round(Number(val) * nights)));
                          }
                        }}
                        className="w-full bg-white border border-zinc-200 rounded-xl py-2.5 pl-7 pr-4 font-bold text-[14px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-zinc-900 shadow-sm"
                      />
                    </div>
                  </div>

                  {/* 6. Total de la reserva */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest pl-0.5 mb-1.5 block">Total de la reserva</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-450 text-sm">$</span>
                      <input
                        type="number"
                        value={editPrice}
                        readOnly
                        className="w-full bg-zinc-100 border border-zinc-200 text-zinc-500 rounded-xl py-2.5 pl-7 pr-4 font-bold text-[14px] cursor-not-allowed outline-none shadow-sm"
                      />
                    </div>
                  </div>

                  {/* 7. Anticipo depositado */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest pl-0.5 mb-1.5 block">Anticipo depositado</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-sm">$</span>
                      <input
                        type="number"
                        value={editDeposit}
                        onChange={e => setEditDeposit(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-xl py-2.5 pl-7 pr-4 font-bold text-[14px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-zinc-900 shadow-sm"
                      />
                    </div>
                  </div>

                  {/* 8. Adeudo Pendiente */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Adeudo Pendiente</span>
                      <p className={`text-[15px] font-black mt-0.5 ${
                        (Number(editPrice || 0) - Number(editDeposit || 0)) > 0 ? 'text-amber-600' : 'text-zinc-655'
                      }`}>
                        {fmtCurrency(Number(editPrice || 0) - Number(editDeposit || 0), selectedRes.guest_name)}
                      </p>
                    </div>
                  </div>

                  {/* 9. Fecha check in- días de estancia- fecha check Out */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Check-in · Estancia · Check-out</span>
                    <div className="flex items-center justify-between text-[13px] font-semibold text-zinc-900 mt-1 bg-white border border-zinc-150 p-3 rounded-xl">
                      <span>{selectedRes.check_in ? format(parseISO(selectedRes.check_in), 'dd MMM yyyy', { locale: es }) : '—'}</span>
                      <span className="bg-zinc-100 text-zinc-700 px-2.5 py-0.5 rounded-lg font-bold text-[11px] shrink-0 border border-zinc-200">
                        {selectedRes.nights} noche{selectedRes.nights !== 1 ? 's' : ''}
                      </span>
                      <span>{selectedRes.check_out ? format(parseISO(selectedRes.check_out), 'dd MMM yyyy', { locale: es }) : '—'}</span>
                    </div>
                  </div>

                  {/* Observaciones / Notas */}
                  <div>
                    <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest pl-0.5 mb-1.5 block">Observaciones / Notas de Reserva</label>
                    <textarea
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      placeholder="Notas u observaciones de la estancia..."
                      className="w-full bg-white border border-zinc-200 rounded-xl p-3 text-zinc-900 font-semibold text-[14px] outline-none focus:border-zinc-400 h-20 resize-none shadow-sm"
                    />
                  </div>

                  <button
                    onClick={handleSaveReservationEdit}
                    disabled={saveEditLoading}
                    className="w-full bg-zinc-900 hover:bg-zinc-950 text-white font-extrabold text-[12px] tracking-wide uppercase py-3.5 rounded-2xl transition-all cursor-pointer shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saveEditLoading ? 'Guardando Cambios...' : '💾 Guardar Cambios'}
                  </button>
                </div>
              
              ) : (
                // Detalles Normales
                <>
                  <div className="space-y-4 text-left">
                  {/* 1. Nombre del huésped (No. Huéspedes) */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div className="w-9 h-9 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center justify-center shrink-0">
                      <User size={16} className="text-blue-600" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Nombre del Huésped (Huéspedes)</span>
                      <h4 className="text-[14px] font-bold text-zinc-900 leading-tight">
                        {selectedRes.guest_name} 
                        <span className="text-zinc-500 font-medium text-[12px] ml-1.5">
                          ({selectedRes.num_adult || 1}A{Number(selectedRes.num_child) > 0 ? ` / ${selectedRes.num_child}N` : ''})
                        </span>
                      </h4>
                    </div>
                  </div>

                  {/* 2. Teléfono */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Teléfono</span>
                      {selectedRes.guest_phone ? (
                        <a 
                          href={`https://wa.me/${selectedRes.guest_phone.replace(/\D/g, '')}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[13px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1.5 cursor-pointer mt-0.5 w-fit"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>{selectedRes.guest_phone}</span>
                          <svg className="w-2.5 h-2.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                          </svg>
                        </a>
                      ) : (
                        <p className="text-[13px] font-medium text-zinc-500 mt-0.5">Sin teléfono</p>
                      )}
                    </div>
                  </div>

                  {/* 3. Habitación asignada */}
                  <div className="space-y-2">
                    <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex items-center justify-between shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Habitación asignada</span>
                        <p className="text-[14px] font-bold text-zinc-900 mt-0.5">{selectedRes.room_name || 'Sin asignar'}</p>
                      </div>
                      {selectedRes.status !== 'cancelled' && !selectedRes.is_checked_out && !isReassigning && (
                        <button
                          onClick={() => setIsReassigning(true)}
                          className="text-[11px] font-bold text-blue-650 hover:text-blue-700 bg-blue-50/50 hover:bg-blue-100/50 border border-blue-100 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer"
                        >
                          Reasignar 🔀
                        </button>
                      )}
                    </div>

                    {isReassigning && (
                      <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-2xl space-y-3 animate-in slide-in-from-top-2 duration-200 text-left">
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
                                  const isAvail = availableRooms[room] !== false;
                                  const isCurrent = (selectedRes.room_name || '').includes(room);
                                  return (
                                    <option key={room} value={room} disabled={!isAvail || isCurrent}>
                                      Habitación {room} {isCurrent ? '(Actual)' : isAvail ? '🟢 (Disponible)' : '🔴 (Ocupada)'}
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
                            Confirmar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Banner de Grupo — siempre visible si hay hermanas */}
                  {siblingBookings.length > 0 && (
                    <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-2xl space-y-3 animate-in fade-in duration-200 shadow-[0_2px_12px_rgba(59,130,246,0.08)]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0">
                          <Users size={16} className="text-blue-600" />
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold text-blue-500 uppercase tracking-widest block">Grupo Detectado</span>
                          <p className="text-[13px] font-bold text-blue-900 leading-tight">
                            {groupBookings.length} habitaciones · Mismo huésped
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1.5 pt-2 border-t border-blue-200/60">
                        {groupBookings.map(b => {
                          const bBal = b.balance !== undefined ? b.balance : Math.max(0, (b.price_estimate || 0) - (b.deposit || 0));
                          const isCurrent = String(b.id) === String(selectedRes.id);
                          return (
                            <div key={b.id} className={`flex justify-between items-center text-[11px] px-2.5 py-1.5 rounded-lg ${isCurrent ? 'bg-blue-100/80 border border-blue-200' : 'bg-white/60'}`}>
                              <span className="font-bold text-blue-800 flex items-center gap-1.5">
                                <BedDouble size={11} className="text-blue-500" />
                                {b.room_name || b.room}
                                {isCurrent && <span className="text-[8px] font-extrabold text-blue-600 bg-blue-50 border border-blue-200 px-1 py-0.5 rounded">ACTUAL</span>}
                              </span>
                              <span className={`font-extrabold ${bBal > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {bBal > 0 ? `Adeudo: ${fmtCurrency(bBal, b.guest_name)}` : '✅ Pagado'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] font-semibold text-blue-600 pt-1">
                        💡 Al registrar un anticipo, puedes distribuirlo proporcionalmente en todas las habitaciones del grupo.
                      </p>
                    </div>
                  )}

                  {/* 4. Canal reservado (directo, Airbnb, Booking) */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Canal reservado</span>
                      <span className="px-2.5 py-1 bg-blue-50 border border-blue-100 text-blue-700 font-bold rounded-lg text-[11px] uppercase tracking-wide inline-block mt-1">
                        {selectedRes.channel || 'Directo'}
                      </span>
                    </div>
                    <StatusBadge status={selectedRes.status} isCheckedIn={selectedRes.is_checked_in} isCheckedOut={selectedRes.is_checked_out} />
                  </div>

                  {/* 5. Tarifa diaria */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Tarifa diaria</span>
                      <p className="text-[15px] font-extrabold text-zinc-900 mt-0.5">
                        {fmtCurrency(selectedRes.price_per_night || Math.round((selectedRes.price_estimate || 0) / (selectedRes.nights || 1)), selectedRes.guest_name)}
                      </p>
                    </div>
                  </div>

                  {/* 6. Total de la reserva */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Total de la reserva</span>
                      <p className="text-[15px] font-black text-zinc-950 mt-0.5">
                        {fmtCurrency(selectedRes.price_estimate || 0, selectedRes.guest_name)}
                      </p>
                    </div>
                  </div>

                  {/* Desglose de Impuestos (Mapeado desde Invoice Beds24) */}
                  {selectedRes.taxes && selectedRes.taxes.total > 0 && (
                    <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)] space-y-2.5">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Impuestos (Factura Beds24)</span>
                      
                      <div className="flex justify-between items-center text-[13px]">
                        <span className="text-zinc-500 font-semibold">IVA (16%):</span>
                        <span className="font-extrabold text-zinc-900">
                          {fmtCurrency(selectedRes.taxes.iva, selectedRes.guest_name)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-[13px]">
                        <span className="text-zinc-500 font-semibold">ISH (3%):</span>
                        <span className="font-extrabold text-zinc-900">
                          {fmtCurrency(selectedRes.taxes.ish, selectedRes.guest_name)}
                        </span>
                      </div>

                      {selectedRes.taxes.otros > 0 && (
                        <div className="flex justify-between items-center text-[13px]">
                          <span className="text-zinc-500 font-semibold">Otros Impuestos:</span>
                          <span className="font-extrabold text-zinc-900">
                            {fmtCurrency(selectedRes.taxes.otros, selectedRes.guest_name)}
                          </span>
                        </div>
                      )}

                      <div className="border-t border-zinc-200/60 pt-2.5 flex justify-between items-center text-[13px] font-black">
                        <span className="text-zinc-700">Total Impuestos:</span>
                        <span className="text-zinc-950">
                          {fmtCurrency(selectedRes.taxes.total, selectedRes.guest_name)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 7. Anticipo depositado */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Anticipo depositado</span>
                      <p className="text-[15px] font-extrabold text-emerald-600 mt-0.5">
                        {fmtCurrency(selectedRes.deposit || 0, selectedRes.guest_name)}
                      </p>
                    </div>
                  </div>

                  {/* 8. Adeudo Pendiente */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Adeudo Pendiente</span>
                      <p className={`text-[15px] font-black mt-0.5 ${
                        (selectedRes.balance ?? (selectedRes.price_estimate - (selectedRes.deposit || 0))) > 0 ? 'text-amber-600' : 'text-zinc-650'
                      }`}>
                        {fmtCurrency(selectedRes.balance ?? (selectedRes.price_estimate - (selectedRes.deposit || 0)), selectedRes.guest_name)}
                      </p>
                    </div>
                  </div>

                  {/* 9. Fecha check in- días de estancia- fecha check Out */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Check-in · Estancia · Check-out</span>
                    <div className="flex items-center justify-between text-[13px] font-semibold text-zinc-900 mt-1 bg-white border border-zinc-150 p-3 rounded-xl">
                      <span>{selectedRes.check_in ? format(parseISO(selectedRes.check_in), 'dd MMM yyyy', { locale: es }) : '—'}</span>
                      <span className="bg-zinc-100 text-zinc-700 px-2.5 py-0.5 rounded-lg font-bold text-[11px] shrink-0 border border-zinc-200">
                        {selectedRes.nights} noche{selectedRes.nights !== 1 ? 's' : ''}
                      </span>
                      <span>{selectedRes.check_out ? format(parseISO(selectedRes.check_out), 'dd MMM yyyy', { locale: es }) : '—'}</span>
                    </div>
                  </div>

                  {/* Notas del Huésped */}
                  {selectedRes.notes && (
                    <div className="bg-amber-50/40 border border-amber-100 p-4 rounded-2xl mt-1">
                      <span className="text-[10px] font-bold text-amber-850 uppercase tracking-widest block mb-1">Notas del Huésped</span>
                      <p className="text-[13px] text-zinc-700 italic leading-relaxed">"{selectedRes.notes}"</p>
                    </div>
                  )}

                  {/* Registrar Anticipo Button & Panel */}
                  {selectedRes.status !== 'cancelled' && !selectedRes.is_checked_out && (
                    <div className="mt-3">
                      {showAbonoFlow ? (
                        <div className="bg-zinc-50 border border-zinc-200 p-4.5 rounded-2xl space-y-4">
                          <div className="flex justify-between items-center pb-2 border-b border-zinc-200">
                            <h4 className="text-[12px] font-extrabold text-zinc-855 uppercase tracking-wider">💰 Registrar Nuevo Anticipo</h4>
                            <button 
                              onClick={() => setShowAbonoFlow(false)}
                              className="text-[11px] font-bold text-zinc-500 hover:text-zinc-755"
                            >
                              ✕ Cancelar
                            </button>
                          </div>

                          <div>
                            <label className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5 block">
                              {abonoGrupalMode ? 'Monto Total del Anticipo Grupal' : 'Monto de Anticipo'}
                            </label>
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-sm">$</span>
                              <input
                                type="number"
                                value={abonoAmount}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (val === '') {
                                    setAbonoAmount('');
                                    return;
                                  }
                                  const bal = abonoGrupalMode
                                    ? directGroupTotalBalance
                                    : (selectedRes.balance !== undefined
                                        ? selectedRes.balance
                                        : (selectedRes.price_estimate || 0) - (selectedRes.deposit || 0));
                                  const maxVal = Math.max(0, bal);
                                  if (Number(val) > maxVal) {
                                    setAbonoAmount(String(maxVal));
                                  } else {
                                    setAbonoAmount(val);
                                  }
                                }}
                                placeholder="0.00"
                                className="w-full bg-white border border-zinc-200 rounded-xl py-2.5 pl-7 pr-4 font-bold text-[14px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-zinc-900"
                              />
                            </div>
                            <span className="text-[10px] text-zinc-500 mt-1 block pl-0.5 font-medium">
                              * Monto máximo{abonoGrupalMode ? ' (grupo)' : ''}: {fmtCurrency(
                                Math.max(0, abonoGrupalMode
                                  ? directGroupTotalBalance
                                  : (selectedRes.balance !== undefined
                                      ? selectedRes.balance
                                      : (selectedRes.price_estimate || 0) - (selectedRes.deposit || 0))),
                                selectedRes.guest_name
                              )}
                            </span>
                          </div>

                          {/* Toggle Grupal — solo si hay hermanas de grupo */}
                          {siblingBookings.length > 0 && (
                            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-2.5 animate-in fade-in duration-200">
                              <p className="text-[11px] font-bold text-blue-800 leading-snug">
                                🏨 Grupo detectado: <span className="font-extrabold">{siblingBookings.length + 1} habitaciones</span> (Hab. {groupBookings.map(b => b.room_name || b.room).join(', ')})
                              </p>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => { setAbonoGrupalMode(false); setAbonoAmount(''); }}
                                  className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-extrabold border transition-all cursor-pointer ${!abonoGrupalMode ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}
                                >
                                  Solo esta hab.
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setAbonoGrupalMode(true); setAbonoAmount(''); }}
                                  className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-extrabold border transition-all cursor-pointer ${abonoGrupalMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}
                                >
                                  Distribuir en grupo ({siblingBookings.length + 1} hab.)
                                </button>
                              </div>

                              {/* Desglose proporcional */}
                              {abonoGrupalMode && abonoAmount && Number(abonoAmount) > 0 && (
                                <div className="space-y-1.5 pt-1 border-t border-blue-200/60 animate-in fade-in duration-150">
                                  <p className="text-[9px] font-extrabold text-blue-600 uppercase tracking-widest">Distribución proporcional al balance</p>
                                  {directGroupBookings.map(b => {
                                    const bBal = b.balance !== undefined ? b.balance : Math.max(0, (b.price_estimate || 0) - (b.deposit || 0));
                                    const prop = directGroupTotalBalance > 0 ? bBal / directGroupTotalBalance : 1 / directGroupBookings.length;
                                    const amt = Math.round(Number(abonoAmount) * prop * 100) / 100;
                                    return (
                                      <div key={b.id} className="flex justify-between items-center text-[10px]">
                                        <span className="font-bold text-blue-800">Hab. {b.room_name || b.room}</span>
                                        <span className="font-extrabold text-blue-900">{fmtCurrency(amt, b.guest_name)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <span className="text-[9px] font-bold text-zinc-450 uppercase tracking-widest block">Método de Pago</span>
                            <div className="flex gap-1.5">
                              {[
                                { id: 'efectivo', label: 'Efectivo', icon: Wallet },
                                { id: 'tarjeta', label: 'Tarjeta', icon: BedDouble },
                                { id: 'transferencia', label: 'Transf.', icon: Send }
                              ].map(m => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => setAbonoPaymentMethod(m.id as any)}
                                  className={`flex-1 py-1.5 px-2 border rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                    abonoPaymentMethod === m.id
                                      ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                                      : 'border-zinc-200 bg-white text-zinc-650 hover:bg-zinc-50'
                                  }`}
                                >
                                  <m.icon size={11} />
                                  <span className="text-[10px] font-bold">{m.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {abonoPaymentMethod && (
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">
                                Sobre / Cuenta Destino
                              </label>
                              <select
                                value={abonoAccountId}
                                onChange={e => setAbonoAccountId(e.target.value)}
                                required
                                className="w-full bg-white border border-zinc-200 rounded-lg p-2.5 text-zinc-900 font-semibold text-[12px] focus:border-zinc-400 transition-all outline-none cursor-pointer"
                              >
                                <option value="" disabled>Selecciona un sobre...</option>
                                {accounts
                                  .filter(acc => {
                                    const isUSD = selectedRes?.guest_name?.toUpperCase().includes('(US DOLLARS)');
                                    if (isUSD) {
                                      const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
                                      if (!isUSDAcc) return false;
                                      
                                      const name = acc.name.trim().toUpperCase();
                                      if (abonoPaymentMethod === 'efectivo') {
                                        return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
                                      }
                                      return !name.includes('EFE') && !name.includes('CASH');
                                    } else {
                                      const name = acc.name.trim().toUpperCase();
                                      if (abonoPaymentMethod === 'efectivo') {
                                        return name === 'EFECTIVO';
                                      }
                                      if (abonoPaymentMethod === 'tarjeta') {
                                        return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
                                      }
                                      if (abonoPaymentMethod === 'transferencia') {
                                        return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
                                      }
                                      return false;
                                    }
                                  })
                                  .map(acc => (
                                    <option key={acc.id} value={acc.id}>
                                      {acc.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}

                          <button
                            onClick={abonoGrupalMode ? handleRegisterAbonoGrupal : handleRegisterAbono}
                            disabled={abonoLoading || !abonoAmount || Number(abonoAmount) <= 0 || !abonoPaymentMethod || !abonoAccountId}
                            className={`w-full py-3 ${abonoGrupalMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-extrabold text-[12px] rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5`}
                          >
                            {abonoLoading ? 'Procesando...' : (abonoGrupalMode ? `Confirmar Anticipo Grupal (${directGroupBookings.length} hab.)` : 'Confirmar Registro de Anticipo')}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setAbonoAmount('');
                            setAbonoPaymentMethod(null);
                            setAbonoAccountId('');
                            setAbonoGrupalMode(false);
                            setShowAbonoFlow(true);
                          }}
                          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[13px] rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-md shadow-emerald-600/10 cursor-pointer"
                        >
                          💰 Registrar Anticipo
                        </button>
                      )}
                    </div>
                  )}
                  </div>
                </>
          )}
            </div>
            
            {/* Acción Botón */}
            <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex flex-col gap-2">
              {selectedRes.status !== 'cancelled' && !selectedRes.is_acknowledged && (
                <button
                  onClick={handleAcknowledgeReserva}
                  disabled={ackLoading}
                  className="w-full bg-indigo-650 hover:bg-indigo-700 text-white font-bold text-[14px] py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-md shadow-indigo-600/10 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {ackLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>✓ REVISADO (Quitar de Nuevas)</span>
                  )}
                </button>
              )}
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
                <div className="animate-in fade-in duration-200 bg-white p-4 rounded-xl border border-zinc-200 shadow-sm mb-2 text-left font-sans">
                  
                  {/* DNI Upload */}
                  <div className="mb-4">
                    <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                      Identificación (DNI/Pasaporte)
                    </label>
                    <div className="relative">
                      <input 
                        ref={docInputRef}
                        type="file"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const b64 = await compressImage(file);
                          setDniPreview(b64);
                          setDocumentFile(file);
                        }}
                        className="hidden"
                        accept="image/*"
                        required
                      />
                      {!dniPreview ? (
                        <div
                          onClick={() => docInputRef.current?.click()}
                          className="border-2 border-dashed border-zinc-200 hover:border-zinc-400 bg-zinc-50 hover:bg-zinc-100 rounded-2xl h-24 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all"
                        >
                          <Camera size={20} className="text-zinc-400" />
                          <span className="text-[12px] font-bold text-zinc-500">Tomar foto / Cargar archivo</span>
                        </div>
                      ) : (
                        <div className="relative rounded-2xl overflow-hidden border border-zinc-200 shadow-sm bg-white">
                          <img src={dniPreview} alt="DNI Preview" className="w-full h-36 object-cover" />
                          <button
                            onClick={() => { setDniPreview(null); setDocumentFile(null); }}
                            className="absolute top-2.5 right-2.5 w-7 h-7 bg-black/60 hover:bg-black text-white flex items-center justify-center rounded-full transition-all cursor-pointer shadow"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Adeudo por Pagar Desglosado */}
                  {(() => {
                    const pendingBalance = selectedRes.balance !== undefined
                      ? selectedRes.balance
                      : (selectedRes.price_estimate || 0) - (selectedRes.deposit || 0);
                    const depositVal = selectedRes.deposit || 0;
                    const totalVal = selectedRes.price_estimate || 0;

                    if (pendingBalance <= 0) {
                      return (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between shadow-sm mb-4 animate-in fade-in duration-300">
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-widest block">
                              Estancia Liquidada
                            </span>
                            <p className="text-[11px] text-emerald-600 font-medium leading-relaxed">
                              Total: {fmtCurrency(totalVal, selectedRes.guest_name)} | Anticipos: {fmtCurrency(depositVal, selectedRes.guest_name)} (100% Pagado)
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-[20px] font-black text-emerald-700">
                              {fmtCurrency(0, selectedRes.guest_name)}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    const isAirbnbOrBooking = ['Airbnb', 'Booking.com'].includes(selectedRes.channel || '');

                    if (isAirbnbOrBooking) {
                      const channel = selectedRes.channel || '';
                      const netAccName = channel === 'Airbnb' ? 'HSBC FISCAL' : 'BOOKING';
                      const commAccName = channel === 'Airbnb' ? 'COMISIÓN AIRBNB' : 'COMISIÓN BOOKING';

                      let expectedPayout = selectedRes.expected_payout || 0;
                      let hostFee = selectedRes.host_fee || 0;

                      if (expectedPayout === 0 && hostFee === 0) {
                        const otaSplit = computeOtaSplit(
                          pendingBalance > 0 ? pendingBalance : (selectedRes.price_estimate || 0),
                          channel,
                          selectedRes.room_name || '',
                          selectedRes.check_in || '',
                          selectedRes.check_out || '',
                          undefined,
                          Number(selectedRes.num_adult || 1),
                          Number(selectedRes.num_child || 0)
                        );
                        expectedPayout = otaSplit.netRevenue;
                        hostFee = otaSplit.commission;
                      }

                      return (
                        <div className="space-y-4">
                          <div className="bg-zinc-50 border border-zinc-250 rounded-2xl p-4 shadow-sm animate-in fade-in duration-300">
                            <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest block mb-2 text-left">
                              Dispersión de Pago Automatizada ({channel})
                            </span>
                            <div className="space-y-2 text-left">
                              <div className="flex justify-between items-center text-[13px]">
                                <span className="font-semibold text-zinc-600">Depósito Neto a {netAccName}:</span>
                                <span className="font-bold text-zinc-900">{fmtCurrency(expectedPayout, selectedRes.guest_name)}</span>
                              </div>
                              <div className="flex justify-between items-center text-[13px] pt-1.5 border-t border-zinc-200">
                                <span className="font-semibold text-zinc-600">Comisión a {commAccName}:</span>
                                <span className="font-bold text-zinc-900">{fmtCurrency(hostFee, selectedRes.guest_name)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        <div className="bg-rose-50 border border-rose-250 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in fade-in duration-300">
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-extrabold text-rose-800 uppercase tracking-widest block">
                              Adeudo por Pagar
                            </span>
                            <p className="text-[10px] text-rose-600 font-semibold leading-relaxed">
                              Total: {fmtCurrency(totalVal, selectedRes.guest_name)} | Anticipos: {fmtCurrency(depositVal, selectedRes.guest_name)}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-[20px] font-black text-rose-700">
                              {fmtCurrency(pendingBalance, selectedRes.guest_name)}
                            </span>
                          </div>
                        </div>

                        <p className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-1 pt-3 border-t border-zinc-100">Registrar Pago</p>
                        <div className="flex gap-2 mb-2">
                          {[
                            { id: 'efectivo', label: 'Efectivo', icon: Wallet },
                            { id: 'tarjeta', label: 'Tarjeta', icon: BedDouble },
                            { id: 'transferencia', label: 'Transf.', icon: Send }
                          ].map(m => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => { setPaymentMethod(m.id); setPaymentReference(''); }}
                              className={`flex-1 py-3 border-[2px] rounded-xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                                paymentMethod === m.id
                                  ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                                  : 'border-zinc-200 bg-white text-zinc-650 hover:bg-zinc-50'
                              }`}
                            >
                              <m.icon size={15} />
                              <span className="text-[11px] font-bold">{m.label}</span>
                            </button>
                          ))}
                        </div>

                        <div className="mb-2">
                          <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                            Monto a Cobrar
                          </label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-sm">$</span>
                            <input
                              type="number"
                              value={paymentAmount}
                              onChange={e => setPaymentAmount(e.target.value)}
                              placeholder="0.00"
                              className="w-full bg-white border border-zinc-200 rounded-xl py-2 pl-7 pr-4 font-bold text-[14px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-zinc-900"
                            />
                          </div>
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
                                const isUSD = selectedRes?.guest_name?.toUpperCase().includes('(US DOLLARS)');
                                if (isUSD) {
                                  const isUSDAcc = a.currency?.toUpperCase() === 'USD';
                                  if (!isUSDAcc) return false;
                                  
                                  const name = a.name.trim().toUpperCase();
                                  if (paymentMethod === 'efectivo') {
                                    return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
                                  }
                                  return !name.includes('EFE') && !name.includes('CASH');
                                } else {
                                  const name = a.name.trim().toUpperCase();
                                  if (paymentMethod === 'efectivo') {
                                    return name === 'EFECTIVO';
                                  }
                                  if (paymentMethod === 'tarjeta') {
                                    return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
                                  }
                                  if (paymentMethod === 'transferencia') {
                                    return a.group_type === 'BANCOS' || a.group_type === 'EXTRANJERO';
                                  }
                                  return false;
                                }
                              })
                              .map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                          </select>
                        </div>

                        {/* Descripción opcional */}
                        <div className="mb-4">
                          <label className="block text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                            Descripción (opcional)
                          </label>
                          <input
                            type="text"
                            value={paymentDescription}
                            onChange={e => setPaymentDescription(e.target.value)}
                            placeholder="Ej. S07 -EP, referencia de transferencia..."
                            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[13px] focus:ring-2 focus:ring-zinc-900/10 font-medium text-zinc-900"
                          />
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setShowPaymentFlow(false);
                        setDniPreview(null);
                        setDocumentFile(null);
                        setPaymentMethod('efectivo');
                        setPaymentReference('');
                        setPaymentAmount('');
                        setPaymentDescription('');
                      }} 
                      className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-[13px] transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleConfirmCheckIn} 
                      disabled={(() => {
                        if (checkInLoading) return true;
                        if (!dniPreview) return true; // DNI obligatorio
                        
                        const pendingBalance = selectedRes.balance !== undefined
                          ? selectedRes.balance
                          : (selectedRes.price_estimate || 0) - (selectedRes.deposit || 0);

                        if (pendingBalance > 0) {
                          const currentPayment = Number(paymentAmount || 0);
                          if (!paymentReference.trim()) return true;
                          if (currentPayment < pendingBalance) return true;
                        }

                        return false;
                      })()}
                      className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-[13px] shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all active:scale-[0.98] flex justify-center items-center gap-2 cursor-pointer"
                    >
                      {checkInLoading ? <RefreshCw size={16} className="animate-spin" /> : <LogIn size={16} />}
                      {checkInLoading ? 'Procesando...' : 'Completar Check-In'}
                    </button>
                  </div>
                </div>
              ) : (
                (() => {
                  const todayStr = new Date().toLocaleDateString('sv-SE');
                  const isFuture = selectedRes.check_in && selectedRes.check_in > todayStr;
                  
                  if (isFuture) {
                    return (
                      <button 
                        disabled
                        className="w-full bg-zinc-100 text-zinc-400 font-bold text-[14px] py-3.5 rounded-xl cursor-not-allowed flex items-center justify-center gap-2 border border-zinc-200"
                      >
                        <LogIn size={18} strokeWidth={2.5} className="opacity-40" />
                        <span>Check-In disponible el {format(parseISO(selectedRes.check_in), 'dd MMM yyyy', { locale: es })}</span>
                      </button>
                    );
                  }

                  return (
                    <button 
                      onClick={() => setShowPaymentFlow(true)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-[15px] py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-[0_4px_14px_rgba(37,99,235,0.25)] flex items-center justify-center gap-2"
                    >
                      <LogIn size={18} strokeWidth={2.5} /> Iniciar Check-In
                    </button>
                  );
                })()
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
