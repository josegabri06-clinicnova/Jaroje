"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { format, addDays, subDays, isToday, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, RefreshCw, CalendarDays, UserPlus, X, BedDouble,
  ArrowDownLeft, ArrowUpRight, Moon, Phone, CheckCircle2, User, Camera, Upload, Wallet, Plus,
  Sparkles, Wrench, AlertTriangle, Send, Package, Minus, ShieldAlert, Lock, Unlock, Calendar, Users,
  CircleDot, ChevronDown, LogIn, FileText, AlertCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { getActiveEmployee, getAdminPin, getRole, getOperatorForLog } from '@/lib/auth';
import { getBeds24RoomIdAndUnit, getDirectTotalForStay, computeOtaSplit } from '@/lib/beds24';
import { getChannelBadge } from '@/lib/channels';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);


// ─── ROOM STRUCTURE ──────────────────────────────────────────────────────────
const ROOM_GROUPS = [
  { label: 'Condo 3R', color: '#f59e0b', bg: '#fffbeb', rooms: ['101','102','103','104','105','106','107'] },
  { label: 'Condo 2R', color: '#0ea5e9', bg: '#f0f9ff', rooms: ['201','202','203','204','205','206'] },
  { label: 'Especial', color: '#10b981', bg: '#f0fdf4', rooms: ['401','402'] },
  { label: 'Estándar', color: '#6366f1', bg: '#eef2ff', rooms: ['301','302','303','304','305','306'] },
  { label: 'Nuevos', color: '#a855f7', bg: '#faf5ff', rooms: ['500','501','502','503','504','505','506','507'], isLocal: true },
];

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

const ALL_ROOMS = ROOM_GROUPS.flatMap(g => g.rooms);

const ROOM_TO_BEDS24: Record<string, { roomId: string; unitId: string }> = {
  // --- Estándar (Doble 301-306) ---
  '301': { roomId: '685531', unitId: '1' }, '302': { roomId: '685532', unitId: '1' },
  '303': { roomId: '685533', unitId: '1' }, '304': { roomId: '685534', unitId: '1' },
  '305': { roomId: '685535', unitId: '1' }, '306': { roomId: '685536', unitId: '1' },
  // --- Condo 2R (Apartamento Premier 201-206) ---
  '201': { roomId: '685312', unitId: '1' }, '202': { roomId: '685318', unitId: '1' },
  '203': { roomId: '685314', unitId: '1' }, '204': { roomId: '685315', unitId: '1' },
  '205': { roomId: '685316', unitId: '1' }, '206': { roomId: '685317', unitId: '1' },
  // --- Condo 3R (Apartamento Premier 101-107) ---
  '101': { roomId: '685321', unitId: '1' }, '102': { roomId: '685322', unitId: '1' },
  '103': { roomId: '685323', unitId: '1' }, '104': { roomId: '685324', unitId: '1' },
  '105': { roomId: '685325', unitId: '1' }, '106': { roomId: '685326', unitId: '1' },
  '107': { roomId: '685327', unitId: '1' },
  // --- Condo 1R (Apartamento Premier 402) ---
  '402': { roomId: '679087', unitId: '1' },
  // --- Casa Lujo (Casa Vacacional 401) ---
  '401': { roomId: '679008', unitId: '1' },
  // --- Nuevos (500-507) ---
  '500': { roomId: '685542', unitId: '1' },
  '501': { roomId: '685542', unitId: '2' },
  '502': { roomId: '685542', unitId: '3' },
  '503': { roomId: '685542', unitId: '4' },
  '504': { roomId: '685542', unitId: '5' },
  '505': { roomId: '685542', unitId: '6' },
  '506': { roomId: '685542', unitId: '7' },
  '507': { roomId: '685542', unitId: '8' },
};

const COLS = 10; // days to show

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function roomGroupOf(room: string) {
  return ROOM_GROUPS.find(g => g.rooms.includes(room));
}

function getBookingForRoomDay(
  reservas: any[],
  room: string,
  dayStr: string
): any | null {
  return reservas.find(r => {
    // Ignorar reservas canceladas en el calendario
    if (r.status === 'cancelled' || r.status === 'cancelado') {
      return false;
    }

    // Intentamos extraer el número de habitación de 3 dígitos (ej: '101') del room o room_name
    const matchSource = `${r.room || ''} | ${r.room_name || ''}`;
    const match = matchSource.match(/\((\d{3})\)/) || matchSource.match(/(\d{3})$/) || matchSource.match(/\b(\d{3})\b/);
    const extractedRoom = match ? match[1] : null;

    const isMatch = (extractedRoom === room) || 
                    (r.room === room) || 
                    (r.room_name || '').includes(room);

    return isMatch && r.check_in <= dayStr && r.check_out > dayStr;
  }) || null;
}

function getLocalDateStr(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  } catch (e) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

function getNextDayStr(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return getLocalDateStr(d);
}

function addDaysToDateStr(dateStr: string, days: number): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return getLocalDateStr(d);
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

function fmtCurrency(amount: number, guestName?: string) {
  const isUSD = guestName?.toUpperCase().includes('(US DOLLARS)');
  const rounded = Math.round(amount || 0);
  return (isUSD ? 'USD$' : 'MX$') + rounded.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const getUnitDisplay = (roomStr: string) => {
  if (!roomStr) return '';
  const parenMatch = roomStr.match(/\(([^)]+)\)/);
  if (parenMatch) return parenMatch[1];
  const numMatch = roomStr.match(/(\d+)\s*$/);
  if (numMatch) return numMatch[1];
  return roomStr;
};

const getReservaStatusColor = (booking: any, todayStr: string) => {
  const isCheckedIn = booking.checked_in || booking.is_checked_in;
  const isCheckedOut = booking.checked_out || booking.is_checked_out;
  
  if (booking.check_out === todayStr) {
    return {
      bg: '#fef3c7', // amber-100
      border: '#d97706', // amber-600
      text: '#92400e' // amber-800
    };
  }
  if (isCheckedOut) {
    return {
      bg: '#f4f4f5', // gray-100
      border: '#71717a', // gray-500
      text: '#3f3f46' // gray-700
    };
  }
  if (isCheckedIn) {
    return {
      bg: '#dbeafe', // blue-100
      border: '#2563eb', // blue-600
      text: '#1e40af' // blue-800
    };
  }
  // Default/Llegan / Future
  return {
    bg: '#d1fae5', // emerald-100
    border: '#10b981', // emerald-500
    text: '#065f46' // emerald-800
  };
};


// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const router = useRouter();
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('jaroje_calendar_start_date');
      if (saved) {
        const parsed = new Date(saved);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }
    const d = subDays(new Date(), 1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [reservas, setReservas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReserva, setSelectedReserva] = useState<any | null>(null);
  const [panelRoom, setPanelRoom] = useState<{ room: string; date: Date } | null>(null);
  const [kpiModalType, setKpiModalType] = useState<'encasa' | 'llegan' | 'salen' | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [pricingSettings, setPricingSettings] = useState<Record<string, any>>({}); // Multiplicadores por roomId desde Beds24/Supabase

  // Modal Check-In / Detalles states
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'efectivo' | 'tarjeta' | 'transferencia' | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [paymentMode2, setPaymentMode2] = useState<'efectivo' | 'tarjeta' | 'transferencia' | null>(null);
  const [paymentAmount2, setPaymentAmount2] = useState('');
  const [selectedAccountId2, setSelectedAccountId2] = useState<string>('');
  const [paymentDescription2, setPaymentDescription2] = useState('');
  const [dniPreview, setDniPreview] = useState<string | null>(null);
  const [dniFile, setDniFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Gestos táctiles para deslizar fechas en el calendario
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // States for editing reservation
  const [editedGuestName, setEditedGuestName] = useState('');
  const [editedPhone, setEditedPhone] = useState('');
  const [editedAdults, setEditedAdults] = useState(1);
  const [editedChildren, setEditedChildren] = useState(0);
  const [editedPrice, setEditedPrice] = useState('');
  const [editedDailyRate, setEditedDailyRate] = useState('');
  const [editedDeposit, setEditedDeposit] = useState('');
  const [editedNotes, setEditedNotes] = useState('');
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [isEditingRes, setIsEditingRes] = useState(false);

  const [abonoPaymentMode, setAbonoPaymentMode] = useState<'efectivo' | 'tarjeta' | 'transferencia' | null>(null);
  const [abonoAccountId, setAbonoAccountId] = useState('');
  const [registerAbonoInFinances, setRegisterAbonoInFinances] = useState(true);

  // States for abono (anticipo)
  const [showAbonoFlow, setShowAbonoFlow] = useState(false);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoFlowPaymentMethod, setAbonoFlowPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia' | null>(null);
  const [abonoFlowAccountId, setAbonoFlowAccountId] = useState('');
  const [abonoFlowLoading, setAbonoFlowLoading] = useState(false);
  const [abonoGrupalMode, setAbonoGrupalMode] = useState(false);

  // States for unlocking price
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [isPriceUnlocked, setIsPriceUnlocked] = useState(false);

  // States for reassigning
  const [isReassigning, setIsReassigning] = useState(false);
  const [targetRoomName, setTargetRoomName] = useState('');
  const [reassignLoading, setReassignLoading] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<Record<string, boolean>>({});
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [isDailyRateEdited, setIsDailyRateEdited] = useState(false);
  const [typedNights, setTypedNights] = useState<string>('');
  const [showPaymentFlow, setShowPaymentFlow] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);



  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [r, chk, acc, psRes] = await Promise.all([
        fetch('/api/reservas?t=' + Date.now()),
        supabase.from('checkins').select('*'),
        supabase.from('accounts').select('*').order('sort_index', { ascending: true }).order('name', { ascending: true }),
        supabase.from('settings').select('value').eq('key', 'pricing_unit_settings').maybeSingle()
      ]);
      const json = await r.json();

      let checkinMap: Record<string, any> = {};
      if (chk.data) {
        chk.data.forEach(c => {
          checkinMap[String(c.reservation_id)] = c;
        });
      }

      if (json.success && json.data) {
        const merged = json.data.map((res: any) => {
          return {
            ...res,
            room: res.room_name || res.room || 'Sin asignar',
            checked_in: checkinMap[String(res.id)]?.status === 'checked_in',
            checked_out: checkinMap[String(res.id)]?.status === 'checked_out',
            dni_image: checkinMap[String(res.id)]?.document_url
          };
        });
        setReservas(merged);
      }
      if (acc.data) {
        setAccounts(acc.data);
      }
      // Cargar multiplicadores de canal desde Supabase (configurados en módulo de Precios)
      if (psRes.data && psRes.data.value) {
        try {
          const parsed = typeof psRes.data.value === 'string' ? JSON.parse(psRes.data.value) : psRes.data.value;
          setPricingSettings(parsed || {});
        } catch (e) {
          console.error('Error al parsear pricing_unit_settings:', e);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    setUserRole(localStorage.getItem('jaroje_role'));
  }, []);

  useEffect(() => {
    if (startDate) {
      sessionStorage.setItem('jaroje_calendar_start_date', startDate.toISOString());
    }
  }, [startDate]);

  useEffect(() => {
    if (selectedReserva?.check_in && selectedReserva?.check_out) {
      setTypedNights(String(getNightsBetweenDates(selectedReserva.check_in, selectedReserva.check_out)));
    } else {
      setTypedNights('');
    }
  }, [selectedReserva?.check_in, selectedReserva?.check_out]);

  useEffect(() => {
    if (isReassigning && selectedReserva?.check_in && selectedReserva?.check_out) {
      const fetchReassignAvailability = async () => {
        setLoadingAvailability(true);
        try {
          const res = await fetch(`/api/availability?checkIn=${selectedReserva.check_in}&checkOut=${selectedReserva.check_out}`);
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
      fetchReassignAvailability();
    }
  }, [isReassigning, selectedReserva]);

  useEffect(() => {
    if (selectedReserva) {
      setEditedGuestName(selectedReserva.guest_name || '');
      setEditedPhone(selectedReserva.guest_phone || '');
      setEditedAdults(Number(selectedReserva.num_adult || 1));
      setEditedChildren(Number(selectedReserva.num_child || 0));
      const priceEstimate = selectedReserva.price_estimate || 0;
      const nights = selectedReserva.nights || 1;
      setEditedPrice(String(priceEstimate));
      setEditedDailyRate(String(Math.round(priceEstimate / nights)));
      setEditedDeposit(String(selectedReserva.deposit || '0'));
      setEditedNotes(selectedReserva.notes || '');
      setIsReassigning(false);
      setTargetRoomName('');
      setAbonoPaymentMode(null);
      setAbonoAccountId('');
      setRegisterAbonoInFinances(true);

      setShowAbonoFlow(false);
      setAbonoAmount('');
      setAbonoFlowPaymentMethod(null);
      setAbonoFlowAccountId('');
      setAbonoGrupalMode(false);
      setShowPaymentFlow(false);
      setIsEditingRes(false);
    } else {
      setEditedGuestName('');
      setPaymentAmount('');
      setPaymentAmount2('');
      setPaymentMode2(null);
      setSelectedAccountId2('');
      setPaymentDescription2('');
      setIsSplitPayment(false);
      setEditedPhone('');
      setEditedAdults(1);
      setEditedChildren(0);
      setEditedPrice('');
      setEditedDailyRate('');
      setEditedDeposit('');
      setEditedNotes('');
      setIsReassigning(false);
      setTargetRoomName('');
      setAbonoPaymentMode(null);
      setAbonoAccountId('');
      setRegisterAbonoInFinances(true);

      setShowAbonoFlow(false);
      setAbonoAmount('');
      setAbonoFlowPaymentMethod(null);
      setAbonoFlowAccountId('');
      setAbonoGrupalMode(false);
      setShowPaymentFlow(false);
      setIsEditingRes(false);
    }
  }, [selectedReserva]);

  useEffect(() => {
    if (!abonoPaymentMode) {
      setAbonoAccountId('');
      return;
    }
    const compatible = accounts.filter(acc => {
      const isUSD = selectedReserva?.guest_name?.toUpperCase().includes('(US DOLLARS)');
      if (isUSD) {
        const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
        if (!isUSDAcc) return false;
        
        const name = acc.name.trim().toUpperCase();
        if (abonoPaymentMode === 'efectivo') {
          return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
        }
        return !name.includes('EFE') && !name.includes('CASH');
      } else {
        const name = acc.name.trim().toUpperCase();
        if (abonoPaymentMode === 'efectivo') {
          return name === 'EFECTIVO';
        }
        if (abonoPaymentMode === 'tarjeta') {
          return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
        }
        if (abonoPaymentMode === 'transferencia') {
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
  }, [abonoPaymentMode, accounts, selectedReserva]);

  useEffect(() => {
    if (!abonoFlowPaymentMethod) {
      setAbonoFlowAccountId('');
      return;
    }
    const compatible = accounts.filter(acc => {
      const isUSD = selectedReserva?.guest_name?.toUpperCase().includes('(US DOLLARS)');
      if (isUSD) {
        const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
        if (!isUSDAcc) return false;
        
        const name = acc.name.trim().toUpperCase();
        if (abonoFlowPaymentMethod === 'efectivo') {
          return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
        }
        return !name.includes('EFE') && !name.includes('CASH');
      } else {
        const name = acc.name.trim().toUpperCase();
        if (abonoFlowPaymentMethod === 'efectivo') {
          return name === 'EFECTIVO';
        }
        if (abonoFlowPaymentMethod === 'tarjeta') {
          return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
        }
        if (abonoFlowPaymentMethod === 'transferencia') {
          return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
        }
        return false;
      }
    });

    if (compatible.length > 0) {
      setAbonoFlowAccountId(compatible[0].id);
    } else {
      setAbonoFlowAccountId('');
    }
  }, [abonoFlowPaymentMethod, accounts, selectedReserva]);

  useEffect(() => {
    if (!paymentMode) {
      setSelectedAccountId('');
      return;
    }
    const compatible = accounts.filter(acc => {
      const isUSD = selectedReserva?.guest_name?.toUpperCase().includes('(US DOLLARS)');
      if (isUSD) {
        const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
        if (!isUSDAcc) return false;
        
        const name = acc.name.trim().toUpperCase();
        if (paymentMode === 'efectivo') {
          return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
        }
        return !name.includes('EFE') && !name.includes('CASH');
      } else {
        const name = acc.name.trim().toUpperCase();
        if (paymentMode === 'efectivo') {
          return name === 'EFECTIVO';
        }
        if (paymentMode === 'tarjeta') {
          return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
        }
        if (paymentMode === 'transferencia') {
          return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
        }
        return false;
      }
    });

    if (compatible.length > 0) {
      setSelectedAccountId(compatible[0].id);
    } else {
      setSelectedAccountId('');
    }
  }, [paymentMode, accounts, selectedReserva]);

  useEffect(() => {
    if (!paymentMode2) {
      setSelectedAccountId2('');
      return;
    }
    const compatible = accounts.filter(acc => {
      const isUSD = selectedReserva?.guest_name?.toUpperCase().includes('(US DOLLARS)');
      if (isUSD) {
        const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
        if (!isUSDAcc) return false;
        
        const name = acc.name.trim().toUpperCase();
        if (paymentMode2 === 'efectivo') {
          return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
        }
        return !name.includes('EFE') && !name.includes('CASH');
      } else {
        const name = acc.name.trim().toUpperCase();
        if (paymentMode2 === 'efectivo') {
          return name === 'EFECTIVO';
        }
        if (paymentMode2 === 'tarjeta') {
          return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
        }
        if (paymentMode2 === 'transferencia') {
          return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
        }
        return false;
      }
    });

    if (compatible.length > 0) {
      setSelectedAccountId2(compatible[0].id);
    } else {
      setSelectedAccountId2('');
    }
  }, [paymentMode2, accounts, selectedReserva]);

  useEffect(() => {
    if (showCheckInModal && selectedReserva && selectedReserva.id !== 'walkin') {
      const balanceVal = selectedReserva.balance !== undefined
        ? selectedReserva.balance
        : (selectedReserva.price_estimate || 0) - (selectedReserva.deposit || 0);
      setPaymentAmount(balanceVal > 0 ? String(balanceVal) : '');
    }
  }, [showCheckInModal, selectedReserva]);

  const handleUnlockPrice = () => {
    if (pinInput === getAdminPin()) {
      setIsPriceUnlocked(true);
      setShowPinModal(false);
      setPinInput('');
    } else {
      alert('PIN Incorrecto');
    }
  };

  const handleDniUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await compressImage(file);
    setDniPreview(b64);
    setDniFile(file);
  };

  const handleSaveChanges = async () => {
    if (!selectedReserva) return;
    setIsSavingChanges(true);
    try {
      const res = await fetch('/api/reservas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedReserva.id,
          guestName: editedGuestName,
          phone: editedPhone,
          numAdult: editedAdults,
          numChild: editedChildren,
          price: Number(editedPrice),
          deposit: Number(editedDeposit),
          notes: editedNotes
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar los cambios');
      
      setAbonoPaymentMode(null);
      setAbonoAccountId('');
      setRegisterAbonoInFinances(true);
      setIsEditingRes(false);
      
      alert('✅ Cambios guardados con éxito.');
      
      try {
        const emp = getOperatorForLog();
        const employeeNum = emp.employee_num;
        const employeeName = emp.full_name;
        const employeeDept = emp.department;
        
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: employeeNum,
            employee_name: employeeName,
            department: employeeDept,
            module: 'recepcion',
            action: 'reserva_modificada',
            room: selectedReserva.room || 'General',
            details: JSON.stringify({
              text: `${editedGuestName} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room || 'General'} - Modificó la reserva desde el Calendario (Pax: ${editedAdults}A/${editedChildren}N, Tel: ${editedPhone}, Total: MX$${editedPrice}, Anticipo: MX$${editedDeposit}).`,
              modificacion: {
                bookingId: selectedReserva.id,
                guestName: editedGuestName,
                phone: editedPhone,
                numAdult: editedAdults,
                numChild: editedChildren,
                price: Number(editedPrice),
                deposit: Number(editedDeposit),
                notes: editedNotes
              }
            })
          })
        });
      } catch (logErr) {
        console.error("Error registrando log de modificación:", logErr);
      }

      setSelectedReserva((prev: any) => ({
        ...prev,
        guest_name: editedGuestName,
        guest_phone: editedPhone,
        num_adult: editedAdults,
        num_child: editedChildren,
        price_estimate: Number(editedPrice),
        deposit: Number(editedDeposit),
        balance: Number(editedPrice) - Number(editedDeposit),
        notes: editedNotes
      }));

      setReservas(prev => prev.map(r => String(r.id) === String(selectedReserva.id) ? {
        ...r,
        guest_name: editedGuestName,
        guest_phone: editedPhone,
        num_adult: editedAdults,
        num_child: editedChildren,
        price_estimate: Number(editedPrice),
        deposit: Number(editedDeposit),
        balance: Number(editedPrice) - Number(editedDeposit),
        notes: editedNotes
      } : r));

      setTimeout(() => {
        fetchData();
      }, 3000);
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al guardar cambios:\n\n${err.message}`);
    } finally {
      setIsSavingChanges(false);
    }
  };

  // Detectar reservas hermanas del mismo grupo (mismo nombre/teléfono + check-in)
  const siblingBookings = useMemo(() => {
    if (!selectedReserva) return [];
    const cleanStr = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
    const mainName = cleanStr(selectedReserva.guest_name || '');
    const mainPhone = (selectedReserva.guest_phone || '').trim();
    return reservas.filter(r => {
      if (r.check_in !== selectedReserva.check_in || r.id === selectedReserva.id || r.checked_in || r.checked_out) return false;
      const samePhone = mainPhone && r.guest_phone && r.guest_phone.trim() === mainPhone;
      const sameName = mainName && r.guest_name && (cleanStr(r.guest_name).includes(mainName) || mainName.includes(cleanStr(r.guest_name)));
      return samePhone || sameName;
    });
  }, [selectedReserva, reservas]);

  const groupBookings = useMemo(() => {
    if (!selectedReserva) return [];
    return [selectedReserva, ...siblingBookings];
  }, [selectedReserva, siblingBookings]);

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
    if (!selectedReserva || !abonoAmount || !abonoFlowPaymentMethod || !abonoFlowAccountId) return;
    setAbonoFlowLoading(true);
    try {
      const amountNum = Number(abonoAmount);
      const oldDeposit = selectedReserva.deposit || 0;
      const newDeposit = oldDeposit + amountNum;

      const res = await fetch('/api/reservas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedReserva.id,
          deposit: newDeposit
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar el anticipo en Beds24');

      const baseDesc = `${selectedReserva.guest_name} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Anticipo Directo (desde Calendario)`;
      const todayStr = new Date().toLocaleDateString('sv-SE');

      const { error: financeErr } = await supabase.from('finances').insert({
        type: 'ingreso',
        amount: amountNum,
        category: 'Alojamiento',
        description: baseDesc,
        payment_method: abonoFlowPaymentMethod,
        account_id: abonoFlowAccountId,
        date: todayStr
      });

      if (financeErr) {
        console.error("Error al registrar finanzas para anticipo:", financeErr);
        alert(`⚠️ Se guardó el anticipo en Beds24, pero hubo un error al registrar en Finanzas: ${financeErr.message}`);
      } else {
        const matchedAcc = accounts.find(a => a.id === abonoFlowAccountId);
        if (matchedAcc) {
          const newBalance = matchedAcc.balance + amountNum;
          const { error: accErr } = await supabase.from('accounts').update({ balance: newBalance }).eq('id', abonoFlowAccountId);
          if (accErr) {
            console.error("Error al actualizar balance de cuenta para anticipo:", accErr);
          } else {
            setAccounts(prev => prev.map(a => a.id === abonoFlowAccountId ? { ...a, balance: newBalance } : a));
          }
        }
      }

      try {
        const emp = getOperatorForLog();
        const employeeNum = emp.employee_num;
        const employeeName = emp.full_name;
        const employeeDept = emp.department;

        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: employeeNum,
            employee_name: employeeName,
            department: employeeDept,
            module: 'recepcion',
            action: 'abono_registrado',
            room: selectedReserva.room || 'General',
            details: JSON.stringify({
              text: `${selectedReserva.guest_name} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room || 'General'} - Registró abono directo de MX$${amountNum} (Cuenta: ${abonoFlowAccountId}, Método: ${abonoFlowPaymentMethod}).`,
              abono: {
                bookingId: selectedReserva.id,
                amount: amountNum,
                paymentMethod: abonoFlowPaymentMethod,
                accountId: abonoFlowAccountId
              }
            })
          })
        });
      } catch (logErr) {
        console.error("Error registrando log de abono:", logErr);
      }

      alert('✅ Anticipo registrado exitosamente.');
      setShowAbonoFlow(false);
      setAbonoAmount('');
      setAbonoFlowPaymentMethod(null);
      setAbonoFlowAccountId('');

      setSelectedReserva((prev: any) => ({
        ...prev,
        deposit: newDeposit,
        balance: (prev.price_estimate || 0) - newDeposit
      }));

      setTimeout(() => { fetchData(); }, 3000);
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al registrar anticipo:\n\n${err.message}`);
    } finally {
      setAbonoFlowLoading(false);
    }
  };

  // Registrar anticipo grupal proporcional (admin / calendario)
  const handleRegisterAbonoGrupal = async () => {
    if (!selectedReserva || !abonoAmount || !abonoFlowPaymentMethod || !abonoFlowAccountId) return;
    if (directGroupBookings.length === 0) return;
    setAbonoFlowLoading(true);
    try {
      const totalAmount = Number(abonoAmount);
      const totalBalance = directGroupTotalBalance;
      const todayStr = new Date().toLocaleDateString('sv-SE');
      const emp = getOperatorForLog();
      const employeeNum = emp.employee_num;
      const employeeName = emp.full_name;

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
        if (!res.ok) { console.error(`Error actualizando depósito de reserva ${booking.id}`); continue; }

        await supabase.from('finances').insert({
          type: 'ingreso',
          amount: bookingAmount,
          category: 'Alojamiento',
          description: `Anticipo Grupal – ${booking.guest_name} (ID: ${booking.id}) Hab ${booking.room}`,
          payment_method: abonoFlowPaymentMethod,
          account_id: abonoFlowAccountId,
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
              module: 'calendario',
              action: 'abono_grupal_registrado',
              room: booking.room || 'General',
              details: JSON.stringify({
                text: `Anticipo grupal de MX$${bookingAmount} aplicado a ${booking.guest_name} Hab ${booking.room} (proporcional del total MX$${totalAmount})`,
                abono: { bookingId: booking.id, amount: bookingAmount, method: abonoFlowPaymentMethod, accountId: abonoFlowAccountId }
              })
            })
          });
        } catch (e) { console.error('Error log abono grupal:', e); }

        setReservas(prev => prev.map(r => String(r.id) === String(booking.id) ? {
          ...r, deposit: newDeposit, balance: Math.max(0, (r.price_estimate || 0) - newDeposit)
        } : r));
      }

      const matchedAcc = accounts.find(a => a.id === abonoFlowAccountId);
      if (matchedAcc) {
        const newBalance = matchedAcc.balance + totalAmount;
        const { error: accErr } = await supabase.from('accounts').update({ balance: newBalance }).eq('id', abonoFlowAccountId);
        if (!accErr) setAccounts(prev => prev.map(a => a.id === abonoFlowAccountId ? { ...a, balance: newBalance } : a));
      }

      const mainBooking = directGroupBookings.find(b => String(b.id) === String(selectedReserva.id));
      if (mainBooking) {
        const mainBal = mainBooking.balance !== undefined ? mainBooking.balance : Math.max(0, (mainBooking.price_estimate || 0) - (mainBooking.deposit || 0));
        const mainProp = totalBalance > 0 ? mainBal / totalBalance : 1 / directGroupBookings.length;
        const mainAmt = Math.round(totalAmount * mainProp * 100) / 100;
        const newMainDeposit = (selectedReserva.deposit || 0) + mainAmt;
        setSelectedReserva((prev: any) => ({ ...prev, deposit: newMainDeposit, balance: Math.max(0, (prev.price_estimate || 0) - newMainDeposit) }));
      }

      setShowAbonoFlow(false);
      setAbonoGrupalMode(false);
      setAbonoAmount('');
      setAbonoFlowPaymentMethod(null);
      setAbonoFlowAccountId('');
      alert(`✅ Anticipo grupal distribuido en ${directGroupBookings.length} habitaciones.`);
      setTimeout(() => { fetchData(); }, 3000);
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al registrar anticipo grupal:\n\n${err.message}`);
    } finally {
      setAbonoFlowLoading(false);
    }
  };

  const handleReassignRoom = async () => {
    if (getRole() !== 'admin') {
      alert('⚠️ Sólo los administradores pueden reasignar habitaciones.');
      return;
    }
    if (!selectedReserva || !targetRoomName) return;
    
    const oldPVal = Number(selectedReserva.price_estimate || selectedReserva.price || 0);
    const oldP = oldPVal.toLocaleString('es-MX');

    if (!confirm(`¿Confirmas reasignar la reserva de ${selectedReserva.guest_name || ''} a la Habitación ${targetRoomName}?\n\nLa tarifa original de MX$${oldP} se mantendrá sin cambios.`)) {
      return;
    }

    setReassignLoading(true);
    try {
      const res = await fetch('/api/reservas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedReserva.id,
          roomName: targetRoomName
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al reasignar la habitación');

      alert(`✅ Habitación reasignada exitosamente a la ${targetRoomName}. La tarifa de MX$${oldP} se mantuvo sin cambios.`);

      try {
        const emp = getOperatorForLog();
        const employeeNum = emp.employee_num;
        const employeeName = emp.full_name;
        const employeeDept = emp.department;
        
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
              text: `${selectedReserva.guest_name} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room || 'Sin asignar'} - Reasignó la habitación a ${targetRoomName} desde el Calendario.${price_changed ? ` Tarifa actualizada: $${old_price} → $${recalculated_price}` : ''}`,
              reasignacion: {
                bookingId: selectedReserva.id,
                guestName: selectedReserva.guest_name,
                fromRoom: selectedReserva.room || 'Sin asignar',
                toRoom: targetRoomName,
                oldPrice: old_price || undefined,
                newPrice: price_changed ? recalculated_price : undefined
              }
            })
          })
        });
      } catch (logErr) {
        console.error("Error registrando log de reasignación:", logErr);
      }

      setIsReassigning(false);
      setTargetRoomName('');
      
      const updatedRoomName = data.room_name || `Habitación ${targetRoomName}`;
      const priceUpdate: any = { room: updatedRoomName, room_name: updatedRoomName };
      if (price_changed) {
        priceUpdate.price_estimate = recalculated_price;
        priceUpdate.balance = recalculated_price - (selectedReserva.deposit || 0);
      }
      setSelectedReserva((prev: any) => ({ ...prev, ...priceUpdate }));
      setReservas(prev => prev.map(r => String(r.id) === String(selectedReserva.id) ? { ...r, ...priceUpdate } : r));
      
      setTimeout(() => {
        fetchData();
      }, 3000);
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al reasignar habitación:\n\n${err.message}`);
    } finally {
      setReassignLoading(false);
    }
  };

  const processCheckIn = async () => {
    if (!selectedReserva) return;
    setSubmitting(true);

    const emp = getOperatorForLog();
    const operatorName = emp ? `${emp.full_name} (${emp.employee_num})` : 'Calendario';

    const registerSingleDirectPayment = async (
      resId: string | number,
      roomName: string,
      mode: string,
      amount: number,
      accountId: string,
      paymentDesc: string,
      baseDesc: string
    ) => {
      const cleanAmountNum = Number(amount) || 0;
      if (cleanAmountNum <= 0) return null;

      const safeDateStr = todayStr || new Date().toLocaleDateString('sv-SE');
      const matchedAccName = accounts.find(a => a.id === accountId)?.name || 'Desconocido';
      
      const { data: insertedRows, error: insertErr } = await supabase.from('finances').insert({
        type: 'ingreso',
        amount: cleanAmountNum,
        category: 'Check In',
        description: paymentDesc ? `${paymentDesc} - ${baseDesc} [Pending Sync: B24]` : `${baseDesc} [Pending Sync: B24]`,
        payment_method: mode,
        account_id: accountId || null,
        date: safeDateStr
      }).select();

      if (insertErr) {
        console.error("Error al registrar cobro:", insertErr);
        alert(`⚠️ Error al registrar el cobro en Finanzas para la Habitación ${roomName}: ${insertErr.message}`);
        return null;
      }

      const insertedRecordId = insertedRows?.[0]?.id;

      if (accountId) {
        const matchedAcc = accounts.find(a => a.id === accountId);
        if (matchedAcc) {
          await supabase.from('accounts').update({ balance: matchedAcc.balance + cleanAmountNum }).eq('id', accountId);
        }
      }

      let syncedSuccess = false;
      try {
        const b24PayRes = await fetch('/api/reservas/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookId: resId,
            amount: cleanAmountNum,
            paymentMethod: mode,
            employeeNum: emp?.employee_num || null,
            description: paymentDesc || null
          })
        });
        const payData = await b24PayRes.json();
        if (b24PayRes.ok && payData.success) {
          syncedSuccess = true;
        } else {
          console.error("Fallo de sincronización Beds24 de pago:", payData.error || 'Error desconocido');
          alert(`⚠️ Sincronización Beds24 incompleta para Hab ${roomName}:\nSupabase se actualizó, pero Beds24 no pudo registrar el pago.\nDetalle: ${payData.error || 'Error desconocido'}.`);
        }
      } catch (payErr: any) {
        console.error("Fallo de conexión al sincronizar pago con Beds24:", payErr);
        alert(`⚠️ Error de Red / Conexión Beds24 para Hab ${roomName}:\nSupabase se actualizó, pero falló el envío a Beds24.\nDetalle: ${payErr.message || payErr}.`);
      }

      if (syncedSuccess && insertedRecordId) {
        await supabase.from('finances').update({
          description: paymentDesc ? `${paymentDesc} - ${baseDesc} [Synced: B24]` : `${baseDesc} [Synced: B24]`
        }).eq('id', insertedRecordId);
      }

      if (emp) {
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: emp.employee_num,
            employee_name: emp.full_name,
            department: emp.department,
            module: 'recepcion',
            action: 'payment_received',
            room: roomName,
            details: `${selectedReserva.guest_name || 'Huésped'} (ID: ${resId}) de la Habitación ${roomName} - Recibió pago de $${cleanAmountNum} vía ${mode} (Depositado en sobre: ${matchedAccName}).`
          })
        });
      }

      return insertedRecordId;
    };

    let finalDniUrl = null;
    if (dniFile) {
      const fileExt = dniFile.name.split('.').pop() || 'jpg';
      const fileName = `dni_${selectedReserva.id}_${Date.now()}.${fileExt}`;
      const { data, error } = await supabase.storage.from('dni_images').upload(fileName, dniFile);
      if (!error && data) {
        const { data: publicUrlData } = supabase.storage.from('dni_images').getPublicUrl(data.path);
        finalDniUrl = publicUrlData.publicUrl;
      }
    }

    const { error: upsertErr } = await supabase.from('checkins').upsert({
      reservation_id: String(selectedReserva.id),
      guest_name: selectedReserva.guest_name,
      room: selectedReserva.room,
      check_in_date: selectedReserva.check_in,
      check_out_date: selectedReserva.check_out,
      status: 'checked_in',
      checked_in_by: operatorName,
      document_url: finalDniUrl || null
    }, { onConflict: 'reservation_id' });

    if (upsertErr) {
      console.error("Supabase Checkin Error:", upsertErr);
      alert("Fallo al guardar el Check-In en la base de datos: " + upsertErr.message);
      setSubmitting(false);
      return;
    }

    setReservas(prev => prev.map(r => r.id === selectedReserva.id ? { ...r, checked_in: true, dni_image: finalDniUrl || undefined } : r));

    if (emp) {
      await fetch('/api/employee-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_num: emp.employee_num,
          employee_name: emp.full_name,
          department: emp.department,
          module: 'recepcion',
          action: 'check_in',
          room: selectedReserva.room,
          details: `${selectedReserva.guest_name || 'Huésped'} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room} - Registró Check-In.`
        })
      });
    }

    const channel = selectedReserva.channel || '';
    const isOtaAutomated = ['Airbnb', 'Booking.com'].includes(channel);

    if (isOtaAutomated && (!paymentAmount || Number(paymentAmount) === 0)) {
      let netAcc = null;
      let commAcc = null;

      if (channel === 'Airbnb') {
        netAcc = accounts.find(a => {
          const name = (a.name || '').toUpperCase();
          return name === 'HSBC' || name === 'HSBC FISCAL' || name.includes('HSBC');
        });
        commAcc = accounts.find(a => {
          const name = (a.name || '').toUpperCase();
          return (name.includes('COMISIO') || name.includes('COMISIÓ')) && name.includes('AIRBNB');
        });
      } else if (channel === 'Booking.com') {
        netAcc = accounts.find(a => {
          const name = (a.name || '').toUpperCase();
          return name === 'BOOKING' || (name.includes('BOOKING') && !name.includes('COMISIO') && !name.includes('COMISIÓ'));
        });
        commAcc = accounts.find(a => {
          const name = (a.name || '').toUpperCase();
          return (name.includes('COMISIO') || name.includes('COMISIÓ')) && name.includes('BOOKING');
        });
      }

      let netRevenue = selectedReserva.expected_payout || 0;
      let commission = selectedReserva.host_fee || 0;
      let taxesRetained = 0;

      if (netRevenue === 0 && commission === 0) {
        const balanceVal = selectedReserva.balance !== undefined
          ? selectedReserva.balance
          : (selectedReserva.price_estimate || 0) - (selectedReserva.deposit || 0);

        const otaSplit = computeOtaSplit(
          balanceVal > 0 ? balanceVal : (selectedReserva.price_estimate || 0),
          channel,
          selectedReserva.room,
          selectedReserva.check_in,
          selectedReserva.check_out,
          undefined,
          Number(selectedReserva.num_adult || 1),
          Number(selectedReserva.num_child || 0)
        );
        netRevenue = otaSplit.netRevenue;
        commission = otaSplit.commission;
        taxesRetained = otaSplit.taxesRetained || 0;
      } else {
        const totalEstimate = selectedReserva.price_estimate || 0;
        taxesRetained = channel === 'Airbnb' ? Math.max(0, totalEstimate - netRevenue - commission) : 0;
      }

      const baseDesc = `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Cobro Check-in Automático (${channel}) (Operado por: ${operatorName})`;

      let netRecordId = null;
      const netDesc = `${baseDesc} | Ingreso Neto`;

      if (netRevenue > 0) {
        const { data: netRows } = await supabase.from('finances').insert({
          type: 'ingreso',
          amount: netRevenue,
          category: 'Check In',
          description: `${netDesc} [Pending Sync: B24]`,
          payment_method: 'transferencia',
          account_id: netAcc?.id || null,
          date: todayStr
        }).select();

        netRecordId = netRows?.[0]?.id;

        if (netAcc) {
          const newBalance = netAcc.balance + netRevenue;
          await supabase.from('accounts').update({ balance: newBalance }).eq('id', netAcc.id);
        }
      }

      if (commission > 0) {
        const commDesc = `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Comisión ${channel}`;
        await supabase.from('finances').insert({
          type: 'gasto',
          amount: commission,
          category: 'Comisiones',
          description: commDesc,
          payment_method: 'transferencia',
          account_id: commAcc?.id || null,
          date: todayStr
        });

        if (commAcc) {
          const newCommBalance = commAcc.balance + commission;
          await supabase.from('accounts').update({ balance: newCommBalance }).eq('id', commAcc.id);
        }
      }

      const totalAmount = netRevenue + commission + taxesRetained;
      let syncedSuccess = false;
      try {
        const b24PayRes = await fetch('/api/reservas/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookId: selectedReserva.id,
            amount: totalAmount,
            paymentMethod: 'transferencia',
            employeeNum: emp?.employee_num || null,
            description: `Cobro Check-in Automático ${channel}`
          })
        });
        const payData = await b24PayRes.json();
        if (b24PayRes.ok && payData.success) {
          syncedSuccess = true;
        }
      } catch (payErr) {
        console.error("Fallo de conexión al sincronizar pago con Beds24:", payErr);
      }

      if (syncedSuccess && netRecordId) {
        await supabase.from('finances').update({
          description: `${netDesc} [Synced: B24]`
        }).eq('id', netRecordId);
      }

      if (emp) {
        const matchedAccName = netAcc?.name || 'Desconocido';
        if (netRevenue > 0) {
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_num: emp.employee_num,
              employee_name: emp.full_name,
              department: emp.department,
              module: 'recepcion',
              action: 'payment_received',
              room: selectedReserva.room,
              details: JSON.stringify({
                text: `${selectedReserva.guest_name || 'Huésped'} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room} - Recibió pago neto OTA (${channel})`,
                finance: {
                  type: 'ingreso',
                  amount: netRevenue,
                  category: 'Check In',
                  account: matchedAccName,
                  description: `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Ingreso Neto OTA (${channel})`
                }
              })
            })
          });
        }

        if (commission > 0) {
          const commAccName = commAcc?.name || 'COMISIÓN AIRBNB';
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_num: emp.employee_num,
              employee_name: emp.full_name,
              department: emp.department,
              module: 'recepcion',
              action: 'payment_received',
              room: selectedReserva.room,
              details: JSON.stringify({
                text: `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room} - Egreso de Comisión OTA (${channel})`,
                finance: {
                  type: 'gasto',
                  amount: commission,
                  category: 'Comisiones',
                  account: commAccName,
                  description: `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Comisión Egreso OTA (${channel})`
                }
              })
            })
          });
        }
      }
    } else if (isSplitPayment) {
      const amt1 = Number(paymentAmount) || 0;
      const amt2 = Number(paymentAmount2) || 0;

      if (amt1 > 0) {
        const baseDesc1 = `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Cobro Check-in (Parte 1/2: ${paymentMode}) (Operado por: ${operatorName})`;
        await registerSingleDirectPayment(
          selectedReserva.id,
          selectedReserva.room,
          paymentMode!,
          amt1,
          selectedAccountId,
          paymentDescription,
          baseDesc1
        );
      }

      if (amt2 > 0) {
        const baseDesc2 = `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Cobro Check-in (Parte 2/2: ${paymentMode2}) (Operado por: ${operatorName})`;
        await registerSingleDirectPayment(
          selectedReserva.id,
          selectedReserva.room,
          paymentMode2!,
          amt2,
          selectedAccountId2,
          paymentDescription2,
          baseDesc2
        );
      }
    } else if (paymentMode && paymentAmount) {
      const amountNum = Number(paymentAmount);
      const baseDesc = `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Cobro Check-in (Operado por: ${operatorName})`;

      // ── OTA Commission Split ──────────────────────────────────────────
      const otaSplit = computeOtaSplit(
        amountNum,
        selectedReserva.channel || '',
        selectedReserva.room,
        selectedReserva.check_in,
        selectedReserva.check_out,
        undefined,
        Number(selectedReserva.num_adult || 1),
        Number(selectedReserva.num_child || 0)
      );

      if (otaSplit.isOTA) {
        // 1. Ingreso neto para el negocio (sin comisión OTA)
        const netDesc = `${baseDesc} | Ingreso Neto (sin comisión ${otaSplit.channelLabel})`;
        const safeDateStr = todayStr || new Date().toLocaleDateString('sv-SE');
        const cleanNetRevenue = Number(otaSplit.netRevenue) || 0;
        const cleanCommission = Number(otaSplit.commission) || 0;

        const { data: netRows, error: netErr } = await supabase.from('finances').insert({
          type: 'ingreso',
          amount: isNaN(cleanNetRevenue) ? 0 : cleanNetRevenue,
          category: 'Check In',
          description: paymentDescription ? `${paymentDescription} - ${netDesc} [Pending Sync: B24]` : `${netDesc} [Pending Sync: B24]`,
          payment_method: 'transferencia',
          account_id: selectedAccountId || null,
          date: safeDateStr
        }).select();

        if (netErr) {
          console.error("Error al registrar ingreso neto OTA:", netErr);
          alert(`⚠️ Error al registrar el ingreso neto en Finanzas: ${netErr.message}`);
        } else {
          const netRecordId = netRows?.[0]?.id;

          if (selectedAccountId) {
            const matchedAcc = accounts.find(a => a.id === selectedAccountId);
            if (matchedAcc) {
              const newBalance = matchedAcc.balance + cleanNetRevenue;
              await supabase.from('accounts').update({ balance: newBalance }).eq('id', selectedAccountId);
            }
          }

          // 2. Egreso de comisión OTA
          const commissionAcc = accounts.find(a =>
            (a.name || '').toUpperCase().replace(/\s+/g, ' ').includes(otaSplit.channelLabel.toUpperCase().replace('.COM', '').replace('.', '').trim())
          );

          if (cleanCommission > 0) {
            const { error: commErr } = await supabase.from('finances').insert({
              type: 'gasto',
              amount: isNaN(cleanCommission) ? 0 : cleanCommission,
              category: 'Comisiones',
              description: `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Comisión ${otaSplit.channelLabel}`,
              payment_method: 'transferencia',
              account_id: commissionAcc?.id || null,
              date: safeDateStr
            });

            if (commErr) {
              console.error("Error al registrar egreso comisión OTA:", commErr);
              alert(`⚠️ Error al registrar la comisión en Finanzas: ${commErr.message}`);
            } else if (commissionAcc) {
              const newCommBalance = commissionAcc.balance + cleanCommission;
              await supabase.from('accounts').update({ balance: newCommBalance }).eq('id', commissionAcc.id);
            }
          }

          let syncedSuccess = false;
          try {
            const b24PayRes = await fetch('/api/reservas/payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bookId: selectedReserva.id,
                amount: amountNum,
                paymentMethod: paymentMode,
                employeeNum: emp?.employee_num || null,
                description: paymentDescription || null
              })
            });
            const payData = await b24PayRes.json();
            if (b24PayRes.ok && payData.success) {
              syncedSuccess = true;
            } else {
              console.error("Fallo de sincronización Beds24 de pago:", payData.error || 'Error desconocido');
              alert(`⚠️ Sincronización Beds24 incompleta:\nEl cobro local se registró con éxito en Supabase, pero Beds24 no pudo procesar el pago.\nDetalle: ${payData.error || 'Error desconocido'}.\nPodrás reintentar la conciliación desde el panel de Finanzas.`);
            }
          } catch (payErr: any) {
            console.error("Fallo de conexión al sincronizar pago con Beds24:", payErr);
            alert(`⚠️ Error de Red / Conexión Beds24:\nEl cobro local se registró correctamente en Supabase, pero falló el envío a Beds24 debido a problemas de red.\nDetalle: ${payErr.message || payErr}.\nPodrás reintentar la conciliación desde el panel de Finanzas.`);
          }

          if (syncedSuccess && netRecordId) {
            await supabase.from('finances').update({
              description: paymentDescription ? `${paymentDescription} - ${netDesc} [Synced: B24]` : `${netDesc} [Synced: B24]`
            }).eq('id', netRecordId);
          }
        }

        if (emp) {
          const matchedAccName = accounts.find(a => a.id === selectedAccountId)?.name || 'Desconocido';
          if (otaSplit.netRevenue > 0) {
            await fetch('/api/employee-logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                employee_num: emp.employee_num,
                employee_name: emp.full_name,
                department: emp.department,
                module: 'recepcion',
                action: 'payment_received',
                room: selectedReserva.room,
                details: JSON.stringify({
                  text: `${selectedReserva.guest_name || 'Huésped'} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room} - Recibió pago neto OTA (${otaSplit.channelLabel})`,
                  finance: {
                    type: 'ingreso',
                    amount: otaSplit.netRevenue,
                    category: 'Check In',
                    account: matchedAccName,
                    description: `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Ingreso Neto OTA (${otaSplit.channelLabel})`
                  }
                })
              })
            });
          }

          if (otaSplit.commission > 0) {
            const commissionAcc = accounts.find(a =>
              (a.name || '').toUpperCase().replace(/\s+/g, ' ').includes(otaSplit.channelLabel.toUpperCase().replace('.COM', '').replace('.', '').trim())
            );
            const commAccName = commissionAcc?.name || 'COMISIÓN AIRBNB';
            await fetch('/api/employee-logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                employee_num: emp.employee_num,
                employee_name: emp.full_name,
                department: emp.department,
                module: 'recepcion',
                action: 'payment_received',
                room: selectedReserva.room,
                details: JSON.stringify({
                  text: `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room} - Egreso de Comisión OTA (${otaSplit.channelLabel})`,
                  finance: {
                    type: 'gasto',
                    amount: otaSplit.commission,
                    category: 'Comisiones',
                    account: commAccName,
                    description: `${selectedReserva.guest_name || 'Huésped'} (ID: ${selectedReserva.id}) - Hab ${selectedReserva.room} - Comisión Egreso OTA (${otaSplit.channelLabel})`
                  }
                })
              })
            });
          }
        }

      } else {
        // ── Reserva DIRECTA (sin OTA) ─────────────────────────────────────
        const safeDateStr = todayStr || new Date().toLocaleDateString('sv-SE');
        const { data: insertedRows, error: insertErr } = await supabase.from('finances').insert({
          type: 'ingreso',
          amount: amountNum,
          category: 'Check In',
          description: paymentDescription ? `${paymentDescription} - ${baseDesc} [Pending Sync: B24]` : `${baseDesc} [Pending Sync: B24]`,
          payment_method: paymentMode,
          account_id: selectedAccountId || null,
          date: safeDateStr
        }).select();

        if (insertErr) {
          console.error("Error al registrar ingreso Reserva Directa:", insertErr);
          alert(`⚠️ Error al registrar el cobro en Finanzas: ${insertErr.message}`);
        } else {
          const insertedRecordId = insertedRows?.[0]?.id;

          if (selectedAccountId) {
            const matchedAcc = accounts.find(a => a.id === selectedAccountId);
            if (matchedAcc) {
              const newBalance = matchedAcc.balance + amountNum;
              await supabase.from('accounts').update({ balance: newBalance }).eq('id', selectedAccountId);
            }
          }

          let syncedSuccess = false;
          try {
            const b24PayRes = await fetch('/api/reservas/payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bookId: selectedReserva.id,
                amount: amountNum,
                paymentMethod: paymentMode,
                employeeNum: emp?.employee_num || null,
                description: paymentDescription || null
              })
            });
            const payData = await b24PayRes.json();
            if (b24PayRes.ok && payData.success) {
              syncedSuccess = true;
            } else {
              console.error("Fallo de sincronización Beds24 de pago:", payData.error || 'Error desconocido');
              alert(`⚠️ Sincronización Beds24 incompleta:\nEl cobro local se registró con éxito en Supabase, pero Beds24 no pudo procesar el pago.\nDetalle: ${payData.error || 'Error desconocido'}.\nPodrás reintentar la conciliación desde el panel de Finanzas.`);
            }
          } catch (payErr: any) {
            console.error("Fallo de conexión al sincronizar pago con Beds24:", payErr);
            alert(`⚠️ Error de Red / Conexión Beds24:\nEl cobro local se registró correctamente en Supabase, pero falló el envío a Beds24 debido a problemas de red.\nDetalle: ${payErr.message || payErr}.\nPodrás reintentar la conciliación desde el panel de Finanzas.`);
          }

          if (syncedSuccess && insertedRecordId) {
            await supabase.from('finances').update({
              description: paymentDescription ? `${paymentDescription} - ${baseDesc} [Synced: B24]` : `${baseDesc} [Synced: B24]`
            }).eq('id', insertedRecordId);
          }
        }

        if (emp) {
          const matchedAccName = accounts.find(a => a.id === selectedAccountId)?.name || 'Desconocido';
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_num: emp.employee_num,
              employee_name: emp.full_name,
              department: emp.department,
              module: 'recepcion',
              action: 'payment_received',
              room: selectedReserva.room,
              details: `${selectedReserva.guest_name || 'Huésped'} ${selectedReserva.num_adult || 1}/${selectedReserva.num_child || 0} (ID: ${selectedReserva.id}) de la Habitación ${selectedReserva.room} - Recibió pago de $${paymentAmount} vía ${paymentMode} (Depositado en sobre: ${matchedAccName}).`
            })
          });
        }
      }
    }

    setShowCheckInModal(false);
    setSelectedReserva(null);
    setDniPreview(null);
    setDniFile(null);
    setPaymentMode(null);
    setPaymentAmount('');
    setPaymentDescription('');
    setSelectedAccountId('');
    setPaymentMode2(null);
    setPaymentAmount2('');
    setPaymentDescription2('');
    setSelectedAccountId2('');
    setIsSplitPayment(false);
    setSubmitting(false);
    fetchData();
  };

  const handleRevertCheckIn = async () => {
    if (!selectedReserva) return;
    if (!confirm('¿Estás seguro de que deseas revertir el Check-In de esta reserva? Esto cambiará su estado a PENDIENTE DE CHECK IN.')) return;

    try {
      const { error: deleteErr } = await supabase
        .from('checkins')
        .delete()
        .eq('reservation_id', String(selectedReserva.id));

      if (deleteErr) throw deleteErr;

      const operatorName = localStorage.getItem('jaroje_operator_name') || 'Admin';
      const employeeNum = localStorage.getItem('jaroje_employee_num') || '0';

      await fetch('/api/employee-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_num: employeeNum,
          employee_name: operatorName,
          department: 'Administración',
          module: 'calendario',
          action: 'revert_checkin',
          room: selectedReserva.room || 'Sin Asignar',
          details: `Admin revirtió el Check-In de la reserva ID ${selectedReserva.id} de ${selectedReserva.guest_name}.`
        })
      });

      alert('✅ El check-in ha sido revertido exitosamente. La reserva ahora está Pendiente de Check-In.');
      await fetchData();
      setSelectedReserva(null);
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al revertir check-in: ${err.message}`);
    }
  };

  // Lock body scroll when any panel is open
  const panelOpen = !!selectedReserva || !!panelRoom || showCheckInModal || kpiModalType;
  useEffect(() => {
    if (panelOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.classList.add('panel-open');
      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.classList.remove('panel-open');
      };
    }
  }, [panelOpen]);


  // Build date columns
  const days = useMemo(() =>
    Array.from({ length: COLS }, (_, i) => addDays(startDate, i)),
    [startDate]
  );

  const dayStrings = useMemo(() => days.map(d => format(d, 'yyyy-MM-dd')), [days]);

  const goBack = () => setStartDate(d => subDays(d, 7));
  const goForward = () => setStartDate(d => addDays(d, 7));
  const goToday = () => { const d = subDays(new Date(), 1); d.setHours(0,0,0,0); setStartDate(d); };

  // Manejo de gestos táctiles (Swipe) para avanzar/retroceder fechas en móviles
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const diffX = touchStartX.current - e.changedTouches[0].clientX;
    const diffY = touchStartY.current - e.changedTouches[0].clientY;

    const SWIPE_THRESHOLD = 60;

    // Asegurarse de que sea un movimiento mayormente horizontal y supere el umbral
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > SWIPE_THRESHOLD) {
      if (diffX > 0) {
        // Deslizó a la izquierda -> Avanzar fechas
        goForward();
      } else {
        // Deslizó a la derecha -> Retroceder fechas
        goBack();
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };



  const handleWalkIn = (room: string, date: Date) => {
    const b = ROOM_TO_BEDS24[room];
    if (!b) return;
    if (userRole === 'admin') {
      router.push(`/nueva?room=${b.roomId}&unit=${b.unitId}&date=${format(date, 'yyyy-MM-dd')}`);
    } else {
      router.push(`/recepcion?walkin=true&room=${b.roomId}&unit=${b.unitId}&date=${format(date, 'yyyy-MM-dd')}`);
    }
  };

  // ── Stats strip ───────────────────────────────────────────────────────────
  const todasLlegadas = useMemo(() => {
    return reservas.filter(r => 
      r.status !== 'cancelled' && 
      r.check_in === todayStr
    );
  }, [reservas, todayStr]);

  const todasSalidas = useMemo(() => {
    return reservas.filter(r => 
      r.status !== 'cancelled' &&
      r.checked_in &&
      r.check_out === todayStr
    );
  }, [reservas, todayStr]);

  const todayActive = reservas.filter(r => r.check_out > todayStr && (r.check_in < todayStr || (r.check_in === todayStr && r.checked_in))).length;
  const todayArrivals = todasLlegadas.length;
  const todayDepartures = todasSalidas.length;

  return (
    <div className="pb-28 bg-[#f8f8fa] min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[22px] font-bold text-zinc-900 tracking-tight">Disponibilidad</h2>
          <p className="text-[13px] font-medium text-zinc-500">
            {isLoading ? 'Sincronizando...' : `${reservas.length} reservas · Vista semanal`}
          </p>
        </div>
        <button 
          onClick={() => {
            goToday();
            fetchData();
          }} 
          disabled={isLoading}
          className="w-9 h-9 flex items-center justify-center bg-white border border-zinc-200 rounded-xl shadow-sm hover:bg-zinc-50 active:scale-95 transition-all"
        >
          <RefreshCw size={15} className={`text-zinc-500 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Today summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <button
          onClick={() => setKpiModalType('encasa')}
          className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center cursor-pointer hover:bg-blue-100/65 hover:border-blue-200 active:scale-95 transition-all outline-none block w-full"
        >
          <p className="text-[20px] font-bold text-blue-700">{todayActive}</p>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">En casa</p>
        </button>
        <button
          onClick={() => setKpiModalType('llegan')}
          className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-center cursor-pointer hover:bg-emerald-100/65 hover:border-emerald-200 active:scale-95 transition-all outline-none block w-full"
        >
          <p className="text-[20px] font-bold text-emerald-700">{todayArrivals}</p>
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Llegan hoy</p>
        </button>
        <button
          onClick={() => setKpiModalType('salen')}
          className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-center cursor-pointer hover:bg-amber-100/65 hover:border-amber-200 active:scale-95 transition-all outline-none block w-full"
        >
          <p className="text-[20px] font-bold text-amber-700">{todayDepartures}</p>
          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Por salir</p>
        </button>
      </div>

      {/* Nav controls */}
      <div className="sticky top-[66px] z-20 bg-[#fafafa]/95 backdrop-blur-md py-2 px-1 -mx-1 border-b border-zinc-200/60 flex items-center justify-between h-[48px] mb-3">
        <div className="flex items-center gap-2">
          <button onClick={goBack}
            className="w-8 h-8 flex items-center justify-center bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 active:scale-95 transition-all shadow-sm">
            <ChevronLeft size={16} className="text-zinc-600" />
          </button>
          <button onClick={goForward}
            className="w-8 h-8 flex items-center justify-center bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 active:scale-95 transition-all shadow-sm">
            <ChevronRight size={16} className="text-zinc-600" />
          </button>
          <label className="w-8 h-8 flex items-center justify-center bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 active:scale-95 transition-all shadow-sm cursor-pointer relative" title="Seleccionar fecha">
            <CalendarDays size={15} className="text-zinc-650" />
            <input 
              type="date" 
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              value={format(startDate, 'yyyy-MM-dd')}
              onChange={(e) => {
                if (e.target.value) {
                  const selectedDate = new Date(e.target.value + 'T00:00:00');
                  setStartDate(selectedDate);
                }
              }}
            />
          </label>
        </div>
        <label className="text-[13px] font-bold text-zinc-700 hover:text-blue-600 transition-colors cursor-pointer relative capitalize flex items-center gap-1" title="Seleccionar fecha">
          {format(startDate, "d MMM", { locale: es })} — {format(days[COLS - 1], "d MMM yyyy", { locale: es })}
          <input 
            type="date" 
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            value={format(startDate, 'yyyy-MM-dd')}
            onChange={(e) => {
              if (e.target.value) {
                const selectedDate = new Date(e.target.value + 'T00:00:00');
                setStartDate(selectedDate);
              }
            }}
          />
        </label>
        <button onClick={goToday}
          className="text-[12px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 active:scale-95 transition-all">
          Hoy
        </button>
      </div>

      {/* ── GANTT GRID ────────────────────────────────────────────────────── */}
      <div 
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm select-none"
      >

        {/* Date header row */}
        <div className="flex border-b border-zinc-100 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02)] sticky top-[114px] z-20">
          {/* Room label column header */}
          <div className="w-[52px] shrink-0 border-r border-zinc-100 bg-zinc-50 rounded-tl-2xl" />
          {/* Day columns */}
          <div className="flex-1 grid min-w-0 overflow-hidden rounded-tr-2xl bg-white" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(38px, 1fr))` }}>
              {days.map((d, i) => {
                const today = isToday(d);
                return (
                  <div key={i} className={`text-center py-2 border-r border-zinc-100 last:border-r-0 ${today ? 'bg-blue-50' : ''}`}>
                    <p className={`text-[9px] font-bold uppercase tracking-wide ${today ? 'text-blue-600' : 'text-zinc-400'}`}>
                      {format(d, 'EEE', { locale: es }).slice(0, 2)}
                    </p>
                    <p className={`text-[13px] font-bold leading-tight ${today ? 'text-blue-600' : 'text-zinc-800'}`}>
                      {format(d, 'd')}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Room rows grouped by category */}
          {ROOM_GROUPS.map((group, groupIdx) => {
            const isLastGroup = groupIdx === ROOM_GROUPS.length - 1;
            return (
              <div key={group.label}>
                {/* Group header */}
                <div className="flex border-b border-zinc-100 bg-zinc-50/70">
                  <div
                    className="w-[52px] shrink-0 border-r border-zinc-100 flex flex-col items-center justify-center py-1.5 leading-none"
                    style={{ backgroundColor: group.bg }}
                  >
                    <span className="text-[8px] font-black uppercase tracking-wider text-center" style={{ color: group.color }}>
                      {group.label.replace(' ', '\n')}
                    </span>
                    {group.isLocal && (
                      <span className="text-[6px] font-extrabold bg-purple-100 text-purple-700 border border-purple-200 px-1 py-0.5 rounded mt-0.5 uppercase tracking-wide">
                        Local
                      </span>
                    )}
                  </div>
                  <div className="flex-1 grid min-w-0 overflow-hidden" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(38px, 1fr))` }}>
                    {days.map((_, i) => (
                      <div key={i} className={`border-r border-zinc-100 last:border-r-0 h-6 ${isToday(days[i]) ? 'bg-blue-50/40' : ''}`} />
                    ))}
                  </div>
                </div>

                {/* Rooms in group */}
                {group.rooms.map((room, roomIdx) => {
                  const isLastRoom = roomIdx === group.rooms.length - 1;
                  return (
                    <div key={room} className={`flex border-b border-zinc-100 last:border-b-0 ${isLastGroup && isLastRoom ? 'rounded-b-2xl' : ''}`}>
                      {/* Room label */}
                      <div
                        className={`w-[52px] shrink-0 border-r border-zinc-100 flex items-center justify-center ${isLastGroup && isLastRoom ? 'rounded-bl-2xl' : ''}`}
                        style={{ backgroundColor: group.bg + '80' }}
                      >
                        <span className="text-[11px] font-black" style={{ color: group.color }}>{room}</span>
                      </div>

                      {/* Day cells */}
                      <div
                        className={`flex-1 grid min-w-0 overflow-hidden ${isLastGroup && isLastRoom ? 'rounded-br-2xl' : ''}`}
                        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(38px, 1fr))` }}
                      >
                  {dayStrings.map((ds, i) => {
                    const booking = getBookingForRoomDay(reservas, room, ds);
                    const isArrival = booking?.check_in === ds;
                    const isDeparture = booking?.check_out === ds;
                    const todayCol = isToday(days[i]);

                    if (booking) {
                      const colors = getReservaStatusColor(booking, todayStr);
                      return (
                        <div
                          key={ds}
                          onClick={() => { router.push(`/reservas?id=${booking.id}`); }}
                          className="border-r border-zinc-100 last:border-r-0 h-9 px-0.5 py-1 cursor-pointer relative"
                          style={{ backgroundColor: todayCol ? '#eff6ff' : undefined }}
                        >
                          <div
                            className="h-full rounded flex items-center px-1 overflow-hidden"
                            style={{
                              backgroundColor: colors.bg,
                              borderLeft: isArrival ? `3px solid ${colors.border}` : undefined,
                              borderRight: isDeparture ? `3px solid ${colors.border}88` : undefined,
                            }}
                          >
                            {isArrival && (
                              <span className="text-[8px] font-black truncate" style={{ color: colors.text }}>
                                {booking.guest_name?.split(' ')[0]}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Free cell — clickable for Walk-in
                    return (
                      <div
                        key={ds}
                        onClick={() => setPanelRoom({ room, date: days[i] })}
                        className={`border-r border-zinc-100 last:border-r-0 h-9 flex items-center justify-center cursor-pointer group transition-colors ${
                          todayCol ? 'bg-blue-50/40 hover:bg-blue-100/60' : 'hover:bg-emerald-50'
                        }`}
                      >
                        <UserPlus
                          size={10}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: group.color }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      );
    })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 px-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#dbeafe', borderLeft: '3px solid #2563eb' }} />
          <span className="text-[11px] font-semibold text-zinc-500">En casa</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#d1fae5', borderLeft: '3px solid #10b981' }} />
          <span className="text-[11px] font-semibold text-zinc-500">Llega hoy / Pendiente</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#fef3c7', borderLeft: '3px solid #d97706' }} />
          <span className="text-[11px] font-semibold text-zinc-500">Sale hoy</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f4f4f5', borderLeft: '3px solid #71717a' }} />
          <span className="text-[11px] font-semibold text-zinc-500">Salida completada</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-zinc-100 flex items-center justify-center">
            <UserPlus size={8} className="text-emerald-500" />
          </div>
          <span className="text-[11px] font-semibold text-zinc-500">Libre · pulsa para Walk-in</span>
        </div>
      </div>

      {/* ── MODAL UNIFICADO DETALLES / PROCESO CHECK-IN ────────────────── */}
      {showCheckInModal && selectedReserva && (
        <>
          <div
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setShowCheckInModal(false);
              setSelectedReserva(null);
              setDniPreview(null);
              setDniFile(null);
              setPaymentMode(null);
              setPaymentAmount('');
              setSelectedAccountId('');
              setShowPaymentFlow(false);
              setShowAbonoFlow(false);
              setAbonoAmount('');
              setAbonoFlowPaymentMethod(null);
              setAbonoFlowAccountId('');
              setIsEditingRes(false);
            }}
          />
          <div
            className="fixed left-0 right-0 z-[210] bg-white rounded-t-3xl shadow-2xl flex flex-col font-sans"
            style={{ bottom: 0, maxHeight: '90vh', paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
          >
            {/* Header Modal */}
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/30 shrink-0">
              <div>
                <h3 className="text-[16px] font-bold text-zinc-950">
                  {(selectedReserva.checked_in || userRole === 'admin')
                    ? (isEditingRes ? 'Editar Reserva' : 'Detalles de Reserva') 
                    : 'Proceso de Check-In'}
                </h3>
                <p className="text-[11px] font-semibold text-zinc-400 mt-0.5 uppercase tracking-wider">ID: {selectedReserva.id}</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedReserva.status !== 'cancelled' && !selectedReserva.checked_out && userRole === 'admin' && (
                  <button
                    onClick={() => setIsEditingRes(!isEditingRes)}
                    className="px-2.5 py-1 text-[11px] font-bold text-zinc-650 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer"
                  >
                    {isEditingRes ? 'Cancelar' : 'Editar 📝'}
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowCheckInModal(false);
                    setSelectedReserva(null);
                    setDniPreview(null);
                    setDniFile(null);
                    setPaymentMode(null);
                    setPaymentAmount('');
                    setSelectedAccountId('');
                    setShowPaymentFlow(false);
                    setShowAbonoFlow(false);
                    setAbonoAmount('');
                    setAbonoFlowPaymentMethod(null);
                    setAbonoFlowAccountId('');
                    setIsEditingRes(false);
                  }}
                  className="w-8 h-8 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 rounded-full text-zinc-500 transition-colors active:scale-95 cursor-pointer"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* Contenido Modal */}
            <div className="flex-1 overflow-y-auto overscroll-y-contain p-6 space-y-5">
              
              {isEditingRes ? (
                // Formulario de Edición
                <div className="space-y-4 text-left animate-in fade-in duration-200">
                  {/* 1. Nombre del huésped (No. Huéspedes) */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl space-y-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest pl-0.5 mb-1.5 block">Nombre del Huésped</label>
                      <input
                        type="text"
                        value={editedGuestName}
                        onChange={e => setEditedGuestName(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 outline-none text-[13px] font-semibold text-zinc-900 focus:border-zinc-400 shadow-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest pl-0.5 mb-1.5 block">Adultos</label>
                        <select
                          value={editedAdults}
                          onChange={e => setEditedAdults(Number(e.target.value))}
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
                          value={editedChildren}
                          onChange={e => setEditedChildren(Number(e.target.value))}
                          className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 outline-none text-[13px] font-semibold text-zinc-900 focus:border-zinc-400 cursor-pointer shadow-sm"
                        >
                          {[0,1,2,3,4,5,6,7,8].map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* 2. Teléfono */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest pl-0.5 mb-1.5 block">Teléfono</label>
                    <input
                      type="text"
                      value={editedPhone}
                      onChange={e => setEditedPhone(e.target.value)}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 outline-none text-[13px] font-semibold text-zinc-900 focus:border-zinc-400 shadow-sm"
                    />
                  </div>

                  {/* 3. Habitación asignada */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Habitación Asignada</span>
                      <span className="text-[14px] font-bold text-zinc-900 mt-0.5">{selectedReserva.room || 'Sin asignar'}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-bold italic shrink-0">Bypass de reasignación*</span>
                  </div>

                  {/* 4. Canal reservado */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Canal reservado</span>
                      {(() => { const badge = getChannelBadge(selectedReserva.channel); return (<span className={`px-2.5 py-1 font-bold rounded-lg text-[11px] uppercase tracking-wide inline-block mt-1 ${badge.className}`}>{badge.emoji} {badge.label}</span>); })()}
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold border ${
                      selectedReserva.status === 'confirmed' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                      selectedReserva.status === 'cancelled' ? 'bg-rose-50 border-rose-100 text-rose-700' :
                      'bg-zinc-100 border-zinc-200 text-zinc-650'
                    }`}>
                      {selectedReserva.status === 'confirmed' ? 'Confirmada' : selectedReserva.status === 'cancelled' ? 'Cancelada' : selectedReserva.status || 'Activa'}
                    </span>
                  </div>

                  {/* 5. Tarifa diaria */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest pl-0.5 mb-1.5 block">Tarifa diaria</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-sm">$</span>
                      <input
                        type="number"
                        value={editedDailyRate}
                        onChange={e => {
                          const val = e.target.value;
                          setEditedDailyRate(val);
                          if (val !== '') {
                            setEditedPrice(String(Math.round(Number(val) * (selectedReserva.nights || 1))));
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
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-sm">$</span>
                      <input
                        type="number"
                        value={editedPrice}
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
                        value={editedDeposit}
                        onChange={e => setEditedDeposit(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-xl py-2.5 pl-7 pr-4 font-bold text-[14px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-zinc-900 shadow-sm"
                      />
                    </div>
                  </div>

                  {/* 8. Adeudo Pendiente */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Adeudo Pendiente</span>
                      {(() => {
                        const isOta = selectedReserva.channel && ['airbnb', 'booking', 'expedia'].some(c => selectedReserva.channel.toLowerCase().includes(c));
                        const isCheckedIn = selectedReserva.checked_in === true;
                        const balanceVal = (isOta || isCheckedIn) ? 0 : (Number(editedPrice || 0) - Number(editedDeposit || 0));
                        return (
                          <p className={`text-[15px] font-black mt-0.5 ${balanceVal > 0 ? 'text-amber-600' : 'text-zinc-650'}`}>
                            {fmtCurrency(balanceVal, selectedReserva.guest_name)}
                          </p>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 9. Fecha check in- días de estancia- fecha check Out */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Check-in · Estancia · Check-out</span>
                    <div className="flex items-center justify-between text-[13px] font-semibold text-zinc-900 mt-1 bg-white border border-zinc-150 p-3 rounded-xl font-mono">
                      <span>{selectedReserva.check_in ? format(parseISO(selectedReserva.check_in), 'dd MMM yyyy', { locale: es }) : '—'}</span>
                      <span className="bg-zinc-100 text-zinc-700 px-2.5 py-0.5 rounded-lg font-bold text-[11px] shrink-0 border border-zinc-200">
                        {selectedReserva.nights || 0} noche{selectedReserva.nights !== 1 ? 's' : ''}
                      </span>
                      <span>{selectedReserva.check_out ? format(parseISO(selectedReserva.check_out), 'dd MMM yyyy', { locale: es }) : '—'}</span>
                    </div>
                  </div>

                  {/* Observaciones / Notas */}
                  <div>
                    <label className="text-[10px] font-extrabold text-zinc-400 tracking-widest pl-0.5 mb-1.5 block">Observaciones / Notas de Reserva</label>
                    <textarea
                      value={editedNotes}
                      onChange={e => setEditedNotes(e.target.value)}
                      placeholder="Notas u observaciones de la estancia..."
                      className="w-full bg-white border border-zinc-200 rounded-xl p-3 text-zinc-900 font-semibold text-[14px] outline-none focus:border-zinc-400 h-20 resize-none shadow-sm"
                    />
                  </div>

                  <button
                    onClick={handleSaveChanges}
                    disabled={isSavingChanges}
                    className="w-full bg-zinc-900 hover:bg-zinc-950 text-white font-extrabold text-[12px] tracking-wide uppercase py-3.5 rounded-2xl transition-all cursor-pointer shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isSavingChanges ? 'Guardando Cambios...' : '💾 Guardar Cambios'}
                  </button>
                </div>
              ) : (
                // Detalles Normales
                <div className="space-y-4 text-left">
                  {/* 1. Nombre del huésped (No. Huéspedes) */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div className="w-9 h-9 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center justify-center shrink-0">
                      <User size={16} className="text-blue-600" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Nombre del Huésped (Huéspedes)</span>
                      <h4 className="text-[14px] font-bold text-zinc-900 leading-tight">
                        {selectedReserva.guest_name} 
                        <span className="text-zinc-500 font-medium text-[12px] ml-1.5">
                          ({selectedReserva.num_adult || 1}A{Number(selectedReserva.num_child) > 0 ? ` / ${selectedReserva.num_child}N` : ''})
                        </span>
                      </h4>
                    </div>
                  </div>

                  {/* 2. Teléfono */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-center justify-center shrink-0">
                      <Phone size={14} className="text-emerald-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Teléfono</span>
                      {selectedReserva.guest_phone ? (
                        <a 
                          href={`https://wa.me/${selectedReserva.guest_phone.replace(/\D/g, '')}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[13px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1.5 cursor-pointer mt-0.5 w-fit"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>{selectedReserva.guest_phone}</span>
                          <Send size={10} className="text-emerald-600 rotate-45" />
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
                        <p className="text-[14px] font-bold text-zinc-900 mt-0.5">{selectedReserva.room || 'Sin asignar'}</p>
                      </div>
                      {getRole() === 'admin' && selectedReserva.status !== 'cancelled' && !selectedReserva.checked_out && !isReassigning && (
                        <button
                          onClick={() => setIsReassigning(true)}
                          className="text-[11px] font-bold text-blue-650 hover:text-blue-700 bg-blue-50/50 hover:bg-blue-100/50 border border-blue-100 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer animate-in fade-in"
                        >
                          Reasignar 🔀
                        </button>
                      )}
                    </div>

                    {isReassigning && (() => {
                      const LOCAL_ROOMS = ['500','501','502','503','504','505','506','507'];
                      const isLocalBooking = LOCAL_ROOMS.some(lr => (selectedReserva.room || '').includes(lr));
                      const filteredGroups = PHYSICAL_ROOM_GROUPS
                        .map(group => ({
                          ...group,
                          rooms: group.rooms.filter(r => isLocalBooking ? LOCAL_ROOMS.includes(r) : !LOCAL_ROOMS.includes(r))
                        }))
                        .filter(group => group.rooms.length > 0);
                      return (
                      <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-2xl space-y-3 animate-in slide-in-from-top-2 duration-200 text-left">
                        <div>
                          <label className="block text-[10px] font-extrabold text-blue-800 uppercase tracking-widest mb-1.5">
                            Seleccionar Nueva Habitación {isLocalBooking ? '(Local)' : '(Filtro de Disponibilidad)'}
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
                            {filteredGroups.map(group => (
                              <optgroup key={group.category} label={group.category}>
                                {group.rooms.map(room => {
                                  const isAvail = availableRooms[room] !== false;
                                  const isCurrent = (selectedReserva.room || '').includes(room);
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
                    ); })()}
                  </div>

                  {/* 4. Canal reservado */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Canal reservado</span>
                      {(() => { const badge = getChannelBadge(selectedReserva.channel); return (<span className={`px-2.5 py-1 font-bold rounded-lg text-[11px] uppercase tracking-wide inline-block mt-1 ${badge.className}`}>{badge.emoji} {badge.label}</span>); })()}
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold border ${
                      selectedReserva.status === 'confirmed' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                      selectedReserva.status === 'cancelled' ? 'bg-rose-50 border-rose-100 text-rose-700' :
                      'bg-zinc-100 border-zinc-200 text-zinc-650'
                    }`}>
                      {selectedReserva.status === 'confirmed' ? 'Confirmada' : selectedReserva.status === 'cancelled' ? 'Cancelada' : selectedReserva.status || 'Activa'}
                    </span>
                  </div>

                  {/* 5. Tarifa diaria */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Tarifa diaria</span>
                      <p className="text-[15px] font-extrabold text-zinc-900 mt-0.5">
                        {fmtCurrency(selectedReserva.price_per_night || Math.round((selectedReserva.price_estimate || 0) / (selectedReserva.nights || 1)), selectedReserva.guest_name)}
                      </p>
                    </div>
                  </div>

                  {/* 6. Total de la reserva */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Total de la reserva</span>
                      <p className="text-[15px] font-black text-zinc-950 mt-0.5">
                        {fmtCurrency(selectedReserva.price_estimate || 0, selectedReserva.guest_name)}
                      </p>
                    </div>
                  </div>

                  {/* 7. Anticipo depositado */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Anticipo depositado</span>
                      <p className="text-[15px] font-extrabold text-emerald-600 mt-0.5">
                        {fmtCurrency(selectedReserva.deposit || 0, selectedReserva.guest_name)}
                      </p>
                    </div>
                  </div>

                  {/* 8. Adeudo Pendiente */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex justify-between items-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Adeudo Pendiente</span>
                      {(() => {
                        const isOta = selectedReserva.channel && ['airbnb', 'booking', 'expedia'].some(c => selectedReserva.channel.toLowerCase().includes(c));
                        const isCheckedIn = selectedReserva.checked_in === true;
                        const balanceVal = (isOta || isCheckedIn) ? 0 : (selectedReserva.balance ?? ((selectedReserva.price_estimate || 0) - (selectedReserva.deposit || 0)));
                        return (
                          <p className={`text-[15px] font-black mt-0.5 ${balanceVal > 0 ? 'text-amber-600' : 'text-zinc-650'}`}>
                            {fmtCurrency(balanceVal, selectedReserva.guest_name)}
                          </p>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 9. Fecha check in- días de estancia- fecha check Out */}
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Check-in · Estancia · Check-out</span>
                    <div className="flex items-center justify-between text-[13px] font-semibold text-zinc-900 mt-1 bg-white border border-zinc-150 p-3 rounded-xl font-mono">
                      <span>{selectedReserva.check_in ? format(parseISO(selectedReserva.check_in), 'dd MMM yyyy', { locale: es }) : '—'}</span>
                      <span className="bg-zinc-100 text-zinc-700 px-2.5 py-0.5 rounded-lg font-bold text-[11px] shrink-0 border border-zinc-200">
                        {selectedReserva.nights || 0} noche{selectedReserva.nights !== 1 ? 's' : ''}
                      </span>
                      <span>{selectedReserva.check_out ? format(parseISO(selectedReserva.check_out), 'dd MMM yyyy', { locale: es }) : '—'}</span>
                    </div>
                  </div>

                  {/* Notas del Huésped */}
                  {selectedReserva.notes && (
                    <div className="bg-amber-50/40 border border-amber-100 p-4 rounded-2xl mt-1">
                      <span className="text-[10px] font-bold text-amber-850 uppercase tracking-widest block mb-1">Notas del Huésped</span>
                      <p className="text-[13px] text-zinc-700 italic leading-relaxed">"{selectedReserva.notes}"</p>
                    </div>
                  )}

                  {/* Registrar Anticipo Button & Panel (Only if checked_in is true or user is admin) */}
                  {(selectedReserva.checked_in || userRole === 'admin') && (
                    <div className="pt-3 border-t border-zinc-200/40 space-y-2.5">
                      {showAbonoFlow ? (
                        <div className="bg-zinc-50 border border-zinc-200 p-4.5 rounded-2xl space-y-4 text-left">
                          <div className="flex justify-between items-center pb-2 border-b border-zinc-200">
                            <h4 className="text-[12px] font-extrabold text-zinc-855 uppercase tracking-wider">💰 Registrar Nuevo Anticipo</h4>
                            <button 
                              onClick={() => { setShowAbonoFlow(false); setAbonoGrupalMode(false); }}
                              className="text-[11px] font-bold text-zinc-500 hover:text-zinc-755"
                            >
                              ✕ Cancelar
                            </button>
                          </div>

                          <div>
                            <label className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5 block">Monto de Anticipo</label>
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-sm">$</span>
                              <input
                                type="number"
                                value={abonoAmount}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (val === '') { setAbonoAmount(''); return; }
                                  const maxBal = abonoGrupalMode
                                    ? directGroupTotalBalance
                                    : Math.max(0, (selectedReserva.price_estimate || 0) - (selectedReserva.deposit || 0));
                                  if (Number(val) > maxBal) setAbonoAmount(String(maxBal));
                                  else setAbonoAmount(val);
                                }}
                                placeholder="0.00"
                                className="w-full bg-white border border-zinc-200 rounded-xl py-2.5 pl-7 pr-4 font-bold text-[14px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-zinc-900"
                              />
                            </div>
                            <span className="text-[10px] text-zinc-500 mt-1 block pl-0.5 font-medium">
                              * Monto máximo: {fmtCurrency(
                                abonoGrupalMode
                                  ? directGroupTotalBalance
                                  : Math.max(0, (selectedReserva.price_estimate || 0) - (selectedReserva.deposit || 0)),
                                selectedReserva.guest_name
                              )}
                            </span>
                          </div>

                          {/* Toggle Grupal */}
                          {siblingBookings.length > 0 && (
                            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-2.5 animate-in fade-in duration-200">
                              <p className="text-[11px] font-bold text-blue-800 leading-snug">
                                🏨 Grupo detectado: <span className="font-extrabold">{siblingBookings.length + 1} habitaciones</span> (Hab. {groupBookings.map((b: any) => b.room).join(', ')})
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
                              {abonoGrupalMode && abonoAmount && Number(abonoAmount) > 0 && (
                                <div className="space-y-1.5 pt-1 border-t border-blue-200/60 animate-in fade-in duration-150">
                                  <p className="text-[9px] font-extrabold text-blue-600 uppercase tracking-widest">Distribución proporcional al balance</p>
                                  {directGroupBookings.map((b: any) => {
                                    const bBal = b.balance !== undefined ? b.balance : Math.max(0, (b.price_estimate || 0) - (b.deposit || 0));
                                    const prop = directGroupTotalBalance > 0 ? bBal / directGroupTotalBalance : 1 / directGroupBookings.length;
                                    const amt = Math.round(Number(abonoAmount) * prop * 100) / 100;
                                    return (
                                      <div key={b.id} className="flex justify-between items-center text-[10px]">
                                        <span className="font-bold text-blue-800">Hab. {b.room}</span>
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
                                  onClick={() => setAbonoFlowPaymentMethod(m.id as any)}
                                  className={`flex-1 py-1.5 px-2 border rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                    abonoFlowPaymentMethod === m.id
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

                          {abonoFlowPaymentMethod && (
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">
                                Sobre / Cuenta Destino
                              </label>
                              <select
                                value={abonoFlowAccountId}
                                onChange={e => setAbonoFlowAccountId(e.target.value)}
                                required
                                className="w-full bg-white border border-zinc-200 rounded-lg p-2.5 text-zinc-900 font-semibold text-[12px] focus:border-zinc-400 transition-all outline-none cursor-pointer"
                              >
                                <option value="" disabled>Selecciona un sobre...</option>
                                {accounts
                                  .filter(acc => {
                                    const isUSD = selectedReserva?.guest_name?.toUpperCase().includes('(US DOLLARS)');
                                    if (isUSD) {
                                      const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
                                      if (!isUSDAcc) return false;
                                      const name = acc.name.trim().toUpperCase();
                                      if (abonoFlowPaymentMethod === 'efectivo') return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
                                      return !name.includes('EFE') && !name.includes('CASH');
                                    } else {
                                      const name = acc.name.trim().toUpperCase();
                                      if (abonoFlowPaymentMethod === 'efectivo') return name === 'EFECTIVO';
                                      if (abonoFlowPaymentMethod === 'tarjeta') return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
                                      if (abonoFlowPaymentMethod === 'transferencia') return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
                                      return false;
                                    }
                                  })
                                  .map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                  ))}
                              </select>
                            </div>
                          )}

                          <button
                            onClick={abonoGrupalMode ? handleRegisterAbonoGrupal : handleRegisterAbono}
                            disabled={abonoFlowLoading || !abonoAmount || Number(abonoAmount) <= 0 || !abonoFlowPaymentMethod || !abonoFlowAccountId}
                            className={`w-full py-3 text-white font-extrabold text-[12px] rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 ${abonoGrupalMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                          >
                            {abonoFlowLoading ? 'Procesando...' : abonoGrupalMode ? `Distribuir en ${directGroupBookings.length} habitaciones` : 'Confirmar Registro de Anticipo'}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 w-full">
                          {getRole() !== 'recepcion' && (
                            <button
                              onClick={() => {
                                setAbonoAmount('');
                                setAbonoFlowPaymentMethod(null);
                                setAbonoFlowAccountId('');
                                setAbonoGrupalMode(false);
                                setShowAbonoFlow(true);
                              }}
                              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[13px] rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-md shadow-emerald-600/10 cursor-pointer animate-in fade-in"
                            >
                              💰 Registrar Anticipo
                            </button>
                          )}

                          {selectedReserva.checked_in && userRole === 'admin' && (
                            <button
                              onClick={handleRevertCheckIn}
                              className="w-full py-3 bg-orange-650 hover:bg-orange-700 text-white font-extrabold text-[13px] rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-md shadow-orange-600/10 cursor-pointer animate-in fade-in"
                            >
                              ↩️ Revertir Check-In (Admin)
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Proceso Check-In / Payment Flow (Only if checked_in is false and user is not admin) */}
              {!selectedReserva.checked_in && userRole !== 'admin' && (
                <div className="pt-2">
                  {showPaymentFlow ? (
                    <div className="space-y-4 bg-zinc-50 border border-zinc-200 p-4.5 rounded-2xl animate-in fade-in duration-200">
                      
                      {/* DNI Upload */}
                      <div>
                        <h4 className="text-[12px] font-extrabold text-zinc-900 uppercase tracking-wider mb-2">Identificación (DNI/Pasaporte)</h4>
                        {!dniPreview ? (
                          <div
                            onClick={() => fileRef.current?.click()}
                            className="border-2 border-dashed border-zinc-200 hover:border-zinc-400 bg-white rounded-2xl h-24 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm"
                          >
                            <Camera size={20} className="text-zinc-400" />
                            <span className="text-[12px] font-bold text-zinc-500">Tomar foto / Cargar archivo</span>
                            <input
                              type="file" accept="image/*"
                              ref={fileRef} onChange={handleDniUpload} className="hidden"
                            />
                          </div>
                        ) : (
                          <div className="relative rounded-2xl overflow-hidden border border-zinc-200 shadow-sm bg-white">
                            <img src={dniPreview} alt="DNI Preview" className="w-full h-36 object-cover" />
                            <button
                              onClick={() => { setDniPreview(null); setDniFile(null); }}
                              className="absolute top-2.5 right-2.5 w-7 h-7 bg-black/60 hover:bg-black text-white flex items-center justify-center rounded-full transition-all cursor-pointer shadow"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Adeudo por Pagar / Dispersión OTA */}
                      {['Airbnb', 'Booking.com'].includes(selectedReserva.channel || '') ? (
                        (() => {
                          const channel = selectedReserva.channel || '';
                          const netAccName = channel === 'Airbnb' ? 'HSBC FISCAL' : 'BOOKING';
                          const commAccName = channel === 'Airbnb' ? 'COMISIÓN AIRBNB' : 'COMISIÓN BOOKING';

                          const balanceVal = selectedReserva.balance !== undefined
                            ? selectedReserva.balance
                            : (selectedReserva.price_estimate || 0) - (selectedReserva.deposit || 0);

                          const totalAmount = balanceVal > 0 ? balanceVal : (selectedReserva.price_estimate || 0);
                          let expectedPayout = selectedReserva.expected_payout || 0;
                          let hostFee = selectedReserva.host_fee || 0;
                          let taxesRetained = 0;

                          if (expectedPayout === 0 && hostFee === 0) {
                            const otaSplit = computeOtaSplit(
                              totalAmount,
                              channel,
                              selectedReserva.room,
                              selectedReserva.check_in,
                              selectedReserva.check_out,
                              undefined,
                              Number(selectedReserva.num_adult || 1),
                              Number(selectedReserva.num_child || 0)
                            );
                            expectedPayout = otaSplit.netRevenue;
                            hostFee = otaSplit.commission;
                            taxesRetained = otaSplit.taxesRetained || 0;
                          } else {
                            taxesRetained = channel === 'Airbnb' ? Math.max(0, totalAmount - expectedPayout - hostFee) : 0;
                          }

                          return (
                            <div className="bg-zinc-50 border border-zinc-200/85 rounded-2xl p-4 shadow-sm animate-in fade-in duration-300 text-left">
                              <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest block mb-2">
                                Dispersión de Pago Automatizada ({channel})
                              </span>
                              <div className="space-y-2">
                                <div className="flex justify-between items-center text-[13px]">
                                  <span className="font-semibold text-zinc-650">Depósito Neto a {netAccName}:</span>
                                  <span className="font-bold text-zinc-900">{fmtCurrency(expectedPayout, selectedReserva.guest_name)}</span>
                                </div>
                                <div className="flex justify-between items-center text-[13px] pt-1.5 border-t border-zinc-200">
                                  <span className="font-semibold text-zinc-650">Comisión a {commAccName}:</span>
                                  <span className="font-bold text-zinc-900">{fmtCurrency(hostFee, selectedReserva.guest_name)}</span>
                                </div>
                                {taxesRetained > 0 && (
                                  <div className="flex justify-between items-center text-[13px] pt-1.5 border-t border-zinc-200">
                                    <span className="font-semibold text-zinc-650">Retención de Impuestos (12%):</span>
                                    <span className="font-bold text-zinc-900">{fmtCurrency(taxesRetained, selectedReserva.guest_name)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <>
                          {/* Adeudo por Pagar Box */}
                          {(() => {
                            const totalVal = selectedReserva.price_estimate || 0;
                            const depositVal = selectedReserva.deposit || 0;
                            const isOta = selectedReserva.channel && ['airbnb', 'booking', 'expedia'].some(c => selectedReserva.channel.toLowerCase().includes(c));
                            const balanceVal = isOta ? 0 : (selectedReserva.balance !== undefined
                              ? selectedReserva.balance
                              : totalVal - depositVal);

                            if (balanceVal <= 0 && !isOta) {
                              return (
                                <div className="bg-emerald-50 border border-emerald-250 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in fade-in duration-300">
                                  <div className="space-y-0.5 text-left">
                                    <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-widest block">
                                      Sin adeudo pendiente
                                    </span>
                                    <p className="text-[10px] text-emerald-600 font-semibold leading-tight">
                                      Total cubierto
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[20px] font-black text-emerald-700">
                                      $0.00
                                    </span>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div className="bg-rose-50 border border-rose-250 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in fade-in duration-300">
                                <div className="space-y-0.5 text-left">
                                  <span className="text-[10px] font-extrabold text-rose-800 uppercase tracking-widest block">
                                    Adeudo por Pagar
                                  </span>
                                  <p className="text-[10px] text-rose-600 font-semibold leading-tight">
                                    Total: {fmtCurrency(totalVal, selectedReserva.guest_name)} | Anticipos: {fmtCurrency(depositVal, selectedReserva.guest_name)}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="text-[20px] font-black text-rose-700">
                                    {fmtCurrency(balanceVal, selectedReserva.guest_name)}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Registro de Pago */}
                          {(() => {
                            const isOta = selectedReserva.channel && ['airbnb', 'booking', 'expedia'].some(c => selectedReserva.channel.toLowerCase().includes(c));
                            const pendingBalance = isOta ? 0 : (selectedReserva.balance !== undefined
                              ? selectedReserva.balance
                              : (selectedReserva.price_estimate || 0) - (selectedReserva.deposit || 0));
                            const totalDebt = pendingBalance;

                            return (
                              <div className="space-y-3 pt-1">
                                <p className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-1 pt-3 border-t border-zinc-100 text-left">Registrar Pago</p>
                                
                                {!isOta && (
                                  <div className="flex items-center gap-2 mb-3 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/60 text-left">
                                    <input
                                      type="checkbox"
                                      id="isSplitPayment"
                                      checked={isSplitPayment}
                                      onChange={e => {
                                        const checked = e.target.checked;
                                        setIsSplitPayment(checked);
                                        if (checked) {
                                          setPaymentAmount(String(Math.ceil(totalDebt / 2)));
                                          setPaymentAmount2(String(Math.floor(totalDebt / 2)));
                                          setPaymentMode('efectivo');
                                          setPaymentMode2('tarjeta');
                                        } else {
                                          setPaymentAmount(totalDebt > 0 ? String(totalDebt) : '');
                                          setPaymentAmount2('');
                                          setPaymentMode(null);
                                          setPaymentMode2(null);
                                          setSelectedAccountId2('');
                                        }
                                      }}
                                      className="w-4 h-4 text-zinc-950 border-zinc-300 rounded focus:ring-zinc-955 cursor-pointer"
                                    />
                                    <label htmlFor="isSplitPayment" className="text-[11px] font-extrabold text-zinc-700 cursor-pointer select-none uppercase tracking-wider">
                                      Dividir pago (Pago Mixto)
                                    </label>
                                  </div>
                                )}

                                {isSplitPayment ? (
                                  <div className="space-y-4">
                                    {/* Pago #1 */}
                                    <div className="p-3.5 bg-zinc-50/50 border border-zinc-200/80 rounded-2xl space-y-3">
                                      <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider block text-left">
                                        Pago #1
                                      </span>
                                      <div className="flex gap-1.5">
                                        {[
                                          { id: 'efectivo', label: 'Efectivo', icon: Wallet },
                                          { id: 'tarjeta', label: 'Tarjeta', icon: BedDouble },
                                          { id: 'transferencia', label: 'Transf.', icon: Send }
                                        ].map(m => (
                                          <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => setPaymentMode(m.id as any)}
                                            className={`flex-1 py-2 border rounded-xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                                              paymentMode === m.id
                                                ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                                                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                                            }`}
                                          >
                                            <m.icon size={13} />
                                            <span className="text-[10px] font-bold">{m.label}</span>
                                          </button>
                                        ))}
                                      </div>

                                      <div className="relative text-left">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                                        <input
                                          type="number"
                                          value={paymentAmount}
                                          onChange={e => {
                                            const val = e.target.value;
                                            setPaymentAmount(val);
                                            const valNum = Number(val) || 0;
                                            setPaymentAmount2(Math.max(0, totalDebt - valNum).toString());
                                          }}
                                          placeholder="Monto 1"
                                          className="w-full bg-white border border-zinc-200/80 rounded-xl p-2.5 pl-7 text-[14px] font-semibold transition-all outline-none focus:border-zinc-400 text-zinc-900"
                                        />
                                      </div>

                                      {paymentMode && (
                                        <div className="space-y-1 text-left">
                                          <label className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest block pl-0.5">
                                            Sobre Pago #1
                                          </label>
                                          <select
                                            value={selectedAccountId}
                                            onChange={e => setSelectedAccountId(e.target.value)}
                                            required
                                            className="w-full bg-white border border-zinc-200/80 rounded-xl p-2 text-zinc-900 font-semibold text-[13px] outline-none cursor-pointer"
                                          >
                                            <option value="" disabled>Seleccionar...</option>
                                            {accounts
                                              .filter(acc => {
                                                const isUSD = selectedReserva?.guest_name?.toUpperCase().includes('(US DOLLARS)');
                                                if (isUSD) {
                                                  const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
                                                  if (!isUSDAcc) return false;
                                                  const name = acc.name.trim().toUpperCase();
                                                  if (paymentMode === 'efectivo') {
                                                    return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
                                                  }
                                                  return !name.includes('EFE') && !name.includes('CASH');
                                                } else {
                                                  const name = acc.name.trim().toUpperCase();
                                                  if (paymentMode === 'efectivo') return name === 'EFECTIVO';
                                                  if (paymentMode === 'tarjeta') return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
                                                  if (paymentMode === 'transferencia') return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
                                                  return false;
                                                }
                                              })
                                              .map(acc => (
                                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                                              ))}
                                          </select>
                                        </div>
                                      )}
                                    </div>

                                    {/* Pago #2 */}
                                    <div className="p-3.5 bg-zinc-50/50 border border-zinc-200/80 rounded-2xl space-y-3">
                                      <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider block text-left">
                                        Pago #2
                                      </span>
                                      <div className="flex gap-1.5">
                                        {[
                                          { id: 'efectivo', label: 'Efectivo', icon: Wallet },
                                          { id: 'tarjeta', label: 'Tarjeta', icon: BedDouble },
                                          { id: 'transferencia', label: 'Transf.', icon: Send }
                                        ].map(m => (
                                          <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => setPaymentMode2(m.id as any)}
                                            className={`flex-1 py-2 border rounded-xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                                              paymentMode2 === m.id
                                                ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                                                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                                            }`}
                                          >
                                            <m.icon size={13} />
                                            <span className="text-[10px] font-bold">{m.label}</span>
                                          </button>
                                        ))}
                                      </div>

                                      <div className="relative text-left">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                                        <input
                                          type="number"
                                          value={paymentAmount2}
                                          onChange={e => {
                                            const val = e.target.value;
                                            setPaymentAmount2(val);
                                            const valNum = Number(val) || 0;
                                            setPaymentAmount(Math.max(0, totalDebt - valNum).toString());
                                          }}
                                          placeholder="Monto 2"
                                          className="w-full bg-white border border-zinc-200/80 rounded-xl p-2.5 pl-7 text-[14px] font-semibold transition-all outline-none focus:border-zinc-400 text-zinc-900"
                                        />
                                      </div>

                                      {paymentMode2 && (
                                        <div className="space-y-1 text-left">
                                          <label className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest block pl-0.5">
                                            Sobre Pago #2
                                          </label>
                                          <select
                                            value={selectedAccountId2}
                                            onChange={e => setSelectedAccountId2(e.target.value)}
                                            required
                                            className="w-full bg-white border border-zinc-200/80 rounded-xl p-2 text-zinc-900 font-semibold text-[13px] outline-none cursor-pointer"
                                          >
                                            <option value="" disabled>Seleccionar...</option>
                                            {accounts
                                              .filter(acc => {
                                                const isUSD = selectedReserva?.guest_name?.toUpperCase().includes('(US DOLLARS)');
                                                if (isUSD) {
                                                  const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
                                                  if (!isUSDAcc) return false;
                                                  const name = acc.name.trim().toUpperCase();
                                                  if (paymentMode2 === 'efectivo') {
                                                    return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
                                                  }
                                                  return !name.includes('EFE') && !name.includes('CASH');
                                                } else {
                                                  const name = acc.name.trim().toUpperCase();
                                                  if (paymentMode2 === 'efectivo') return name === 'EFECTIVO';
                                                  if (paymentMode2 === 'tarjeta') return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
                                                  if (paymentMode2 === 'transferencia') return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
                                                  return false;
                                                }
                                              })
                                              .map(acc => (
                                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                                              ))}
                                          </select>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex gap-2">
                                      {[
                                        { id: 'efectivo', label: 'Efectivo', icon: Wallet },
                                        { id: 'tarjeta', label: 'Tarjeta', icon: BedDouble },
                                        { id: 'transferencia', label: 'Transf.', icon: Send }
                                      ].map(m => (
                                        <button
                                          key={m.id}
                                          type="button"
                                          onClick={() => setPaymentMode(m.id as any)}
                                          className={`flex-1 py-3 border-[2px] rounded-xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                                            paymentMode === m.id
                                              ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                                              : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100'
                                          }`}
                                        >
                                          <m.icon size={15} />
                                          <span className="text-[11px] font-bold">{m.label}</span>
                                        </button>
                                      ))}
                                    </div>

                                    {paymentMode && (
                                      <div className="space-y-2.5 p-3.5 bg-white border border-zinc-200 rounded-2xl animate-in fade-in duration-200">
                                        <div>
                                          <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 text-left">
                                            Monto a Cobrar
                                          </label>
                                          <div className="relative">
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                                            <input
                                              type="number"
                                              value={paymentAmount}
                                              onChange={e => setPaymentAmount(e.target.value)}
                                              placeholder="0.00"
                                              className="w-full bg-[#fafafa] border border-zinc-200 focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 text-zinc-900 shadow-sm rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none"
                                            />
                                          </div>
                                        </div>

                                        {/* Selector de cuenta/sobre */}
                                        <div className="space-y-1.5 pt-1 text-left">
                                          <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5 block">
                                            ¿A qué sobre va el dinero?
                                          </label>
                                          <select
                                            value={selectedAccountId}
                                            onChange={e => setSelectedAccountId(e.target.value)}
                                            required
                                            className="w-full bg-[#fafafa] border border-zinc-200 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none cursor-pointer"
                                          >
                                            <option value="" disabled>Selecciona un sobre...</option>
                                            {accounts
                                              .filter(acc => {
                                                const isUSD = selectedReserva?.guest_name?.toUpperCase().includes('(US DOLLARS)');
                                                if (isUSD) {
                                                  const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
                                                  if (!isUSDAcc) return false;

                                                  const name = acc.name.trim().toUpperCase();
                                                  if (paymentMode === 'efectivo') {
                                                    return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
                                                  }
                                                  return !name.includes('EFE') && !name.includes('CASH');
                                                } else {
                                                  const name = acc.name.trim().toUpperCase();
                                                  if (paymentMode === 'efectivo') {
                                                    return name === 'EFECTIVO';
                                                  }
                                                  if (paymentMode === 'tarjeta') {
                                                    return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
                                                  }
                                                  if (paymentMode === 'transferencia') {
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

                                        {/* Descripción opcional */}
                                        <div className="space-y-1.5 pt-1 text-left">
                                          <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 mb-1.5 block">
                                            Descripción (opcional)
                                          </label>
                                          <input
                                            type="text"
                                            value={paymentDescription}
                                            onChange={e => setPaymentDescription(e.target.value)}
                                            placeholder="Ej. S07 -EP, referencia de transferencia..."
                                            className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[15px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none"
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </>
                      )}
                      
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => {
                            setShowPaymentFlow(false);
                            setPaymentMode(null);
                            setPaymentAmount('');
                            setSelectedAccountId('');
                            setPaymentMode2(null);
                            setPaymentAmount2('');
                            setSelectedAccountId2('');
                            setPaymentDescription2('');
                            setIsSplitPayment(false);
                          }}
                          className="flex-1 py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-[13px] transition-colors"
                        >
                          Cancelar
                        </button>
                        <button 
                          onClick={() => processCheckIn()} 
                          disabled={(() => {
                            if (submitting) return true;
                            if (!dniPreview) return true; // DNI obligatorio

                            const isOta = selectedReserva.channel && ['airbnb', 'booking', 'expedia'].some(c => selectedReserva.channel.toLowerCase().includes(c));
                            
                            const pendingBalance = isOta ? 0 : (selectedReserva.balance !== undefined
                              ? selectedReserva.balance
                              : (selectedReserva.price_estimate || 0) - (selectedReserva.deposit || 0));

                            if (!isOta && pendingBalance > 0) {
                              if (isSplitPayment) {
                                const totalPaid = (Number(paymentAmount) || 0) + (Number(paymentAmount2) || 0);
                                if (!paymentMode || !selectedAccountId) return true;
                                if (!paymentMode2 || !selectedAccountId2) return true;
                                if (totalPaid < pendingBalance) return true;
                              } else {
                                const currentPayment = Number(paymentAmount || 0);
                                if (!paymentMode) return true;
                                if (!selectedAccountId) return true;
                                if (currentPayment < pendingBalance) return true;
                              }
                            }
                            return false;
                          })()}
                          className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-[13px] shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all active:scale-[0.98] flex justify-center items-center gap-2 cursor-pointer"
                        >
                          {submitting ? <RefreshCw size={15} className="animate-spin" /> : <LogIn size={15} />}
                          <span>Completar Check-In</span>
                        </button>
                      </div>

                    </div>
                  ) : (
                    (() => {
                      const todayStr = new Date().toLocaleDateString('sv-SE');
                      const isFuture = selectedReserva.check_in && selectedReserva.check_in > todayStr;
                      
                      if (isFuture) {
                        return (
                          <button 
                            disabled
                            className="w-full bg-zinc-100 text-zinc-400 font-bold text-[14px] py-3.5 rounded-xl cursor-not-allowed flex items-center justify-center gap-2 border border-zinc-200"
                          >
                            <LogIn size={18} strokeWidth={2.5} className="opacity-40" />
                            <span>Check-In disponible el {format(parseISO(selectedReserva.check_in), 'dd MMM yyyy', { locale: es })}</span>
                          </button>
                        );
                      }

                      return (
                        <button 
                          onClick={() => {
                            const totalVal = selectedReserva.price_estimate || 0;
                            const depositVal = selectedReserva.deposit || 0;
                            const balanceVal = selectedReserva.balance !== undefined
                              ? selectedReserva.balance
                              : totalVal - depositVal;
                            setPaymentAmount(balanceVal > 0 ? String(balanceVal) : '');
                            setShowPaymentFlow(true);
                          }}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-[15px] py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-[0_4px_14px_rgba(37,99,235,0.25)] flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <LogIn size={18} strokeWidth={2.5} /> Iniciar Check-In
                        </button>
                      );
                    })()
                  )}
                </div>
              )}

            </div>
          </div>
        </>
      )}

      {/* ── WALK-IN CONFIRM PANEL ─────────────────────────────────────────── */}
      {panelRoom && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/50" style={{ backdropFilter: 'blur(6px)' }} onClick={() => setPanelRoom(null)} />
          <div
            className="fixed left-0 right-0 z-[210] bg-white rounded-t-3xl shadow-2xl flex flex-col"
            style={{ bottom: 0, maxHeight: '50svh', paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
          >
            <div className="px-6 pt-5 pb-4 border-b border-zinc-100 flex-shrink-0">
              <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[17px] font-bold text-zinc-900">Habitación libre</h3>
                  <p className="text-[13px] text-zinc-500 font-medium mt-0.5">
                    {panelRoom.room} · {format(panelRoom.date, "EEEE d 'de' MMMM", { locale: es })}
                  </p>
                </div>
                <button onClick={() => setPanelRoom(null)} className="w-8 h-8 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors">
                  <X size={15} className="text-zinc-500" />
                </button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3">
              <button
                onClick={() => { handleWalkIn(panelRoom.room, panelRoom.date); setPanelRoom(null); }}
                className="w-full py-4 bg-zinc-900 hover:bg-black text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-[15px]"
              >
                {userRole === 'admin' ? (
                  <>
                    <Plus size={18} />
                    Crear nueva reserva
                  </>
                ) : (
                  <>
                    <UserPlus size={18} />
                    Registrar Walk-in aquí
                  </>
                )}
              </button>
              <button
                onClick={() => setPanelRoom(null)}
                className="w-full py-3 text-zinc-500 font-semibold text-[14px]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── MODAL DETALLES DE KPI ── */}
      {kpiModalType && (() => {
        let title = 'Detalles';
        let badgeColor = 'bg-zinc-100 text-zinc-800';
        let filtered: any[] = [];

        if (kpiModalType === 'encasa') {
          title = 'Huéspedes En Casa';
          badgeColor = 'bg-zinc-900 text-white';
          filtered = reservas.filter(r => r.check_out > todayStr && (r.check_in < todayStr || (r.check_in === todayStr && r.checked_in)));
        } else if (kpiModalType === 'llegan') {
          title = 'Llegadas Hoy';
          badgeColor = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
          filtered = todasLlegadas;
        } else if (kpiModalType === 'salen') {
          title = 'Salidas Hoy';
          badgeColor = 'bg-amber-100 text-amber-800 border border-amber-200';
          filtered = todasSalidas;
        }

        return (
          <div className="fixed inset-0 z-[9999] flex flex-col justify-end bg-zinc-950/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div onClick={() => setKpiModalType(null)} className="absolute inset-0" />
            <div className="relative bg-white rounded-t-[32px] shadow-2xl p-6 space-y-4 animate-in slide-in-from-bottom-8 duration-300 w-full max-w-md mx-auto max-h-[85vh] flex flex-col z-[10000]">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-zinc-900">{title}</h3>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${badgeColor}`}>
                    {filtered.length}
                  </span>
                </div>
                <button 
                  onClick={() => setKpiModalType(null)} 
                  className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 cursor-pointer hover:bg-zinc-200"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>

              {/* List body */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1">
                {filtered.length === 0 ? (
                  <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">
                    No hay huéspedes en este grupo para el día de hoy.
                  </div>
                ) : (
                  filtered.map(r => {
                    const nightsVal = r.nights || 1;
                    return (
                      <div 
                        key={r.id} 
                        onClick={() => {
                          setKpiModalType(null);
                          router.push(`/reservas?id=${r.id}`);
                        }}
                        className="p-4 border border-zinc-150 rounded-2xl bg-zinc-50/20 space-y-2.5 cursor-pointer hover:bg-zinc-100/50 hover:border-zinc-300 transition-all active:scale-[0.98] select-none"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-[14px] font-black text-zinc-955 leading-tight">{r.guest_name || 'Huésped Sin Nombre'}</h4>
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Reserva ID: {r.id}</span>
                          </div>
                          <span className="text-[11px] font-extrabold bg-zinc-900 text-white px-2.5 py-1 rounded-lg">
                            {getUnitDisplay(r.room || r.room_name || '')}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-[12px] pt-1.5 border-t border-zinc-100">
                          <div>
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Estancia</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[11px] font-bold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                                {format(new Date(r.check_in + 'T12:00:00'), 'dd MMM', { locale: es })}
                              </span>
                              <span className="text-zinc-400 text-[10px] font-bold">➔</span>
                              <span className="text-[11px] font-bold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                                {format(new Date(r.check_out + 'T12:00:00'), 'dd MMM', { locale: es })}
                              </span>
                              <span className="text-[9px] font-black bg-zinc-900 text-white px-2 py-0.5 rounded-full">
                                {nightsVal}n
                              </span>
                            </div>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Canal / Origen</span>
                            <p className="font-bold text-zinc-800 bg-zinc-100/50 border border-zinc-100 px-2.5 py-0.5 rounded-xl w-fit">
                              {r.channel || 'Directo'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}
