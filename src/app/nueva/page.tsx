"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, CheckCircle2, Lock, Unlock, X, Wallet, BedDouble, Send, Minus, Plus } from 'lucide-react';
import { getActiveEmployee, getAdminPin } from '@/lib/auth';
import { getUnitName, getRoomMetadata, getParentMapping, getCapacityRules } from '@/lib/beds24';
import { format, parseISO, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';

const PRICES: Record<string, Record<string, number>> = {
  '679077': { baja: 1345, media: 1597, media_alta: 1681, alta: 1849 },
  '679087': { baja: 2017, media: 2395, media_alta: 2521, alta: 2773 },
  '679091': { baja: 2689, media: 3193, media_alta: 3361, alta: 3697 },
  '679092': { baja: 4034, media: 4790, media_alta: 5042, alta: 5546 },
  '679093': { baja: 5378, media: 6387, media_alta: 6723, alta: 7395 },
  '685542': { baja: 1345, media: 1597, media_alta: 1681, alta: 1849 },
};

function getSeason(dateStr: string): string {
  if (!dateStr) return 'media';

  // 1. Rangos específicos definidos por el usuario para 2025-2027
  // TEMPORADA ALTA
  if (
    (dateStr >= '2025-12-20' && dateStr <= '2026-01-10') ||
    (dateStr >= '2026-03-27' && dateStr <= '2026-04-11') ||
    (dateStr >= '2026-12-20' && dateStr <= '2027-01-10') ||
    (dateStr >= '2027-03-19' && dateStr <= '2027-04-03') ||
    (dateStr >= '2027-12-20' && dateStr <= '2028-01-10')
  ) {
    return 'alta';
  }

  // TEMPORADA MEDIA-ALTA
  if (
    (dateStr >= '2025-12-15' && dateStr <= '2025-12-19') ||
    (dateStr >= '2026-07-15' && dateStr <= '2026-08-16') ||
    (dateStr >= '2026-12-15' && dateStr <= '2026-12-19') ||
    (dateStr >= '2027-07-15' && dateStr <= '2027-08-16') ||
    (dateStr >= '2027-12-15' && dateStr <= '2027-12-19')
  ) {
    return 'media_alta';
  }

  // TEMPORADA MEDIA
  if (
    (dateStr >= '2026-01-11' && dateStr <= '2026-03-26') ||
    (dateStr >= '2026-08-17' && dateStr <= '2026-08-31') ||
    (dateStr >= '2026-09-12' && dateStr <= '2026-09-15') ||
    (dateStr >= '2026-11-01' && dateStr <= '2026-12-14') ||
    (dateStr >= '2027-01-11' && dateStr <= '2027-03-18') ||
    (dateStr >= '2027-08-17' && dateStr <= '2027-08-31') ||
    (dateStr >= '2027-09-12' && dateStr <= '2027-09-15') ||
    (dateStr >= '2027-11-01' && dateStr <= '2027-12-14')
  ) {
    return 'media';
  }

  // Si es del periodo 2025-2027 y no cayó en ninguna de las anteriores, es BAJA ("Resto del año")
  if (dateStr >= '2025-01-01' && dateStr <= '2027-12-31') {
    return 'baja';
  }

  // 2. Fallback genérico mensual para otros años futuros (2028+)
  const d = new Date(dateStr + 'T12:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();

  if ((month === 12 && day >= 20) || (month === 1 && day <= 10)) return 'alta';
  if ((month === 3 && day >= 22) || (month === 4 && day <= 7)) return 'alta';
  if ((month === 7 && day >= 15) || (month === 8 && day <= 16)) return 'media_alta';
  if (month === 12 && day >= 15 && day <= 19) return 'media_alta';
  if (month === 1 && day >= 11) return 'media';
  if (month === 2) return 'media';
  if (month === 3 && day < 22) return 'media';
  if (month === 8 && day >= 17 && day <= 31) return 'media';
  if (month === 9 && day >= 12 && day <= 15) return 'media';
  if (month === 11 || (month === 12 && day <= 14)) return 'media';
  return 'baja';
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

export default function VercelActionForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'reserva' | 'bloqueo'>('reserva');
  const [loading, setLoading] = useState(false);
  const [todayStr, setTodayStr] = useState('');
  const [form, setForm] = useState({
    roomId: '',
    unitId: '',
    groupRooms: [] as { roomId: string; unitId: string; name: string }[],
    checkIn: '',
    checkOut: '',
    guestName: '',
    channel: 'Directo',
    price: '',
    dailyRate: '',
    deposit: '0',
    phone: '',
    numAdult: 1,
    numChild: 0,
    notes: '',
    extraGuestSurcharge: ''
  });
  const [groupRoomRates, setGroupRoomRates] = useState<Record<string, string>>({});
  const [nights, setNights] = useState<number | ''>(1);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [isPriceUnlocked, setIsPriceUnlocked] = useState(false);
  const [isDailyRateEdited, setIsDailyRateEdited] = useState(false);
  const [isDepositEdited, setIsDepositEdited] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [capacitySettings, setCapacitySettings] = useState<Record<string, { base: number; max: number }> | null>(null);
  const [otaMultipliers, setOtaMultipliers] = useState({ airbnb: 1.20, booking: 1.35 });
  const [formPaymentMethod, setFormPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia' | null>(null);
  const [formAccountId, setFormAccountId] = useState('');
  const [rateSource, setRateSource] = useState<'beds24' | 'fallback' | 'edited' | null>(null);

  useEffect(() => {
    setTodayStr(getLocalDateStr());

    // Leer parámetros de la URL para pre-cargar la habitación y fecha
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const room = params.get('room');
      const unit = params.get('unit');
      const date = params.get('date');
      if (room || unit || date) {
        setForm(prev => {
          const checkInVal = date || prev.checkIn;
          let checkOutVal = prev.checkOut;
          if (date) {
            try {
              // Sumar 1 día a la fecha y formatear como YYYY-MM-DD
              const nextDay = addDays(new Date(date + 'T12:00:00'), 1);
              checkOutVal = format(nextDay, 'yyyy-MM-dd');
            } catch (e) {
              console.error('Error calculating checkout date:', e);
            }
          }
          return {
            ...prev,
            roomId: room || prev.roomId,
            unitId: unit || prev.unitId,
            checkIn: checkInVal,
            checkOut: checkOutVal
          };
        });
      }
    }
  }, []);

  const { maxCapacity, baseCapacity } = useMemo(() => {
    const roomsToBook = form.groupRooms && form.groupRooms.length > 0
      ? form.groupRooms
      : (form.roomId && form.unitId ? [{ roomId: form.roomId, unitId: form.unitId, name: getUnitName(form.roomId, form.unitId) || form.unitId }] : []);
    
    let totalMax = 0;
    let totalBase = 0;
    roomsToBook.forEach(r => {
      const parentMapping = getParentMapping(r.roomId, r.unitId);
      const rules = getCapacityRules(parentMapping.roomId || r.roomId || r.name, capacitySettings || undefined);
      totalMax += rules.max;
      totalBase += rules.base;
    });
    return { maxCapacity: totalMax, baseCapacity: totalBase };
  }, [form.roomId, form.unitId, form.groupRooms, capacitySettings]);

  const distributeGuestsInRooms = (rooms: any[], numAdults: number, numChildren: number) => {
    let adultsLeft = Math.max(0, numAdults);
    let childrenLeft = Math.max(0, numChildren);
    
    const roomsWithCap = rooms.map(rm => {
      const cap = getCapacityRules(rm.roomId || rm.room, capacitySettings || undefined);
      return {
        roomId: rm.roomId || rm.room,
        unitId: rm.unitId || rm.unit_id || '',
        name: rm.name || 'Habitación',
        max: cap.max,
        base: cap.base,
        adults: 0,
        children: 0
      };
    });
    
    // Paso 1: Cada habitación seleccionada requiere al menos 1 adulto si hay adultos disponibles
    roomsWithCap.forEach(r => {
      if (adultsLeft > 0) {
        r.adults = 1;
        adultsLeft--;
      }
    });
    
    // Paso 2: Distribuir adultos hasta el límite BASE de cada habitación
    for (let r of roomsWithCap) {
      const currentTotal = r.adults + r.children;
      const spaceToBase = r.base - currentTotal;
      if (spaceToBase > 0 && adultsLeft > 0) {
        const toAdd = Math.min(spaceToBase, adultsLeft);
        r.adults += toAdd;
        adultsLeft -= toAdd;
      }
    }
    
    // Paso 3: Distribuir niños hasta el límite BASE de cada habitación
    for (let r of roomsWithCap) {
      const currentTotal = r.adults + r.children;
      const spaceToBase = r.base - currentTotal;
      if (spaceToBase > 0 && childrenLeft > 0) {
        const toAdd = Math.min(spaceToBase, childrenLeft);
        r.children += toAdd;
        childrenLeft -= toAdd;
      }
    }
    
    // Paso 4: Si todavía quedan adultos, distribuirlos hasta el límite MAX de cada habitación
    for (let r of roomsWithCap) {
      const currentTotal = r.adults + r.children;
      const spaceToMax = r.max - currentTotal;
      if (spaceToMax > 0 && adultsLeft > 0) {
        const toAdd = Math.min(spaceToMax, adultsLeft);
        r.adults += toAdd;
        adultsLeft -= toAdd;
      }
    }
    
    // Paso 5: Si todavía quedan niños, distribuirlos hasta el límite MAX de cada habitación
    for (let r of roomsWithCap) {
      const currentTotal = r.adults + r.children;
      const spaceToMax = r.max - currentTotal;
      if (spaceToMax > 0 && childrenLeft > 0) {
        const toAdd = Math.min(spaceToMax, childrenLeft);
        r.children += toAdd;
        childrenLeft -= toAdd;
      }
    }
    
    // Paso 6: Si quedan excedentes por sobrecupo, sumarlos a la última habitación
    if (adultsLeft > 0 && roomsWithCap.length > 0) {
      roomsWithCap[roomsWithCap.length - 1].adults += adultsLeft;
    }
    if (childrenLeft > 0 && roomsWithCap.length > 0) {
      roomsWithCap[roomsWithCap.length - 1].children += childrenLeft;
    }
    
    return roomsWithCap;
  };

  const calculateReservationPrices = () => {
    if (!form.checkIn || !form.checkOut) {
      return { totalStay: 0, roomDetails: [], suggestedDailyRate: 0 };
    }
    const diffTime = Math.abs(new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime());
    const computedNights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    const group = form.groupRooms && form.groupRooms.length > 0
      ? form.groupRooms
      : (form.roomId && form.unitId ? [{ roomId: form.roomId, unitId: form.unitId, name: getUnitName(form.roomId, form.unitId) || form.unitId }] : []);

    let multiplier = 1;
    if (form.channel === 'Airbnb') multiplier = otaMultipliers.airbnb;
    if (form.channel === 'Booking.com') multiplier = otaMultipliers.booking;

    let totalStay = 0;
    let sumSuggestedRates = 0;

    const distributedGuests = distributeGuestsInRooms(group, Number(form.numAdult || 1), Number(form.numChild || 0));

    // Sum total extra guests across all selected rooms to determine default surcharge total
    let totalExtraGuests = 0;
    const roomExtraGuestsList = group.map((rm) => {
      const dist = distributedGuests.find(d => d.roomId === rm.roomId && d.unitId === rm.unitId) || { adults: 1, children: 0 };
      const capRules = getCapacityRules(rm.roomId || rm.name, capacitySettings || undefined);
      const totalGuests = dist.adults + dist.children;
      const extraGuests = Math.max(0, totalGuests - capRules.base);
      totalExtraGuests += extraGuests;
      return { roomId: rm.roomId, unitId: rm.unitId, extraGuests };
    });

    const extraGuestPrice = capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500;
    const defaultSurchargeTotal = totalExtraGuests * extraGuestPrice;
    const activeSurchargeTotal = form.extraGuestSurcharge !== '' && form.extraGuestSurcharge !== undefined
      ? (Number(form.extraGuestSurcharge) || 0)
      : defaultSurchargeTotal;

    const roomDetails = group.map((rm) => {
      // 1. Find dynamic price in inventory
      const roomGroup = inventory.find(g => g.roomId === rm.roomId);
      const unit = roomGroup?.units?.find((u: any) => u.unitId === rm.unitId);
      const dynamicPrice = (unit && unit.price !== undefined && unit.price > 0) ? unit.price : 0;

      // 2. Fallback or seasonal pricing
      const season = getSeason(form.checkIn);
      const parentRoom = getParentMapping(rm.roomId, rm.unitId);
      const fallbackPrice = PRICES[parentRoom.roomId]?.[season] || 2000;
      const basePrice = dynamicPrice > 0 ? dynamicPrice : fallbackPrice;

      // 3. Apply long stay discount ONLY to basePrice if NOT dynamic
      let discountMult = 1.0;
      if (dynamicPrice <= 0) {
        if (computedNights >= 30) discountMult = 0.60;
        else if (computedNights >= 15) discountMult = 0.75;
        else if (computedNights >= 7) discountMult = 0.85;
      }

      // Guest Surcharge distribution
      const roomExtraObj = roomExtraGuestsList.find(x => x.roomId === rm.roomId && x.unitId === rm.unitId);
      const extraGuests = roomExtraObj ? roomExtraObj.extraGuests : 0;
      let surchargePerNight = 0;
      if (totalExtraGuests > 0) {
        surchargePerNight = (extraGuests / totalExtraGuests) * activeSurchargeTotal;
      } else if (activeSurchargeTotal > 0 && group.length > 0) {
        surchargePerNight = activeSurchargeTotal / group.length;
      }

      const priceWithChannel = basePrice * discountMult * multiplier;
      const tax = priceWithChannel * 0.19; // 16% IVA + 3% ISH
      const suggestedDailyRate = Math.round(priceWithChannel + tax + surchargePerNight);

      sumSuggestedRates += suggestedDailyRate;

      // Detect if user modified manually this room's price
      const key = `${rm.roomId}_${rm.unitId}`;
      const userPrice = groupRoomRates[key];
      let dailyRate = suggestedDailyRate;
      
      if (group.length <= 1 && isDailyRateEdited) {
        dailyRate = Math.round(Number(form.dailyRate) || 0);
      } else if (userPrice !== undefined && userPrice !== '') {
        dailyRate = Math.round(Number(userPrice));
      }
      
      const roomTotal = dailyRate * computedNights;

      totalStay += roomTotal;

      return {
        roomId: rm.roomId,
        unitId: rm.unitId,
        name: rm.name,
        suggestedDailyRate,
        dailyRate,
        roomTotal
      };
    });

    const suggestedDailyRate = group.length > 0 ? Math.round(sumSuggestedRates / group.length) : 0;

    return {
      totalStay,
      roomDetails,
      suggestedDailyRate
    };
  };

  // Calcular precio automático
  useEffect(() => {
    if (form.checkIn && form.checkOut) {
      const { totalStay, roomDetails, suggestedDailyRate } = calculateReservationPrices();
      
      setForm(prev => {
        const nextState = { ...prev };
        
        const isAnyGroupRateEdited = Object.keys(groupRoomRates).some(key => groupRoomRates[key] !== undefined && groupRoomRates[key] !== '');
        
        if (!isDailyRateEdited && !isAnyGroupRateEdited) {
          nextState.dailyRate = suggestedDailyRate.toString();
        }
        nextState.price = totalStay.toString();
        return nextState;
      });

      const isAnyGroupRateEdited = Object.keys(groupRoomRates).some(key => groupRoomRates[key] !== undefined && groupRoomRates[key] !== '');
      const foundDynamicPrice = roomDetails.some(d => {
        const roomGroup = inventory.find(g => g.roomId === d.roomId);
        const unit = roomGroup?.units?.find((u: any) => u.unitId === d.unitId);
        return unit && unit.price !== undefined && unit.price > 0;
      });

      if (isDailyRateEdited || isAnyGroupRateEdited) {
        setRateSource('edited');
      } else if (foundDynamicPrice) {
        setRateSource('beds24');
      } else if (form.roomId || (form.groupRooms && form.groupRooms.length > 0)) {
        setRateSource('fallback');
      } else {
        setRateSource(null);
      }
    }
  }, [
    form.roomId,
    form.groupRooms,
    form.checkIn,
    form.checkOut,
    form.channel,
    form.dailyRate,
    form.numAdult,
    form.numChild,
    form.extraGuestSurcharge,
    isDailyRateEdited,
    inventory,
    otaMultipliers,
    groupRoomRates
  ]);

  const { totalExtraGuests, defaultSurchargeTotal } = useMemo(() => {
    if (!form.checkIn || !form.checkOut) {
      return { totalExtraGuests: 0, defaultSurchargeTotal: 0 };
    }
    const group = form.groupRooms && form.groupRooms.length > 0
      ? form.groupRooms
      : (form.roomId && form.unitId ? [{ roomId: form.roomId, unitId: form.unitId, name: getUnitName(form.roomId, form.unitId) || form.unitId }] : []);
    
    const distributedGuests = distributeGuestsInRooms(group, Number(form.numAdult || 1), Number(form.numChild || 0));
    let totalExtra = 0;
    group.forEach((rm) => {
      const dist = distributedGuests.find(d => d.roomId === rm.roomId && d.unitId === rm.unitId) || { adults: 1, children: 0 };
      const capRules = getCapacityRules(rm.roomId || rm.name, capacitySettings || undefined);
      const totalGuests = dist.adults + dist.children;
      const extraGuests = Math.max(0, totalGuests - capRules.base);
      totalExtra += extraGuests;
    });
    const extraGuestPrice = capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500;
    return { totalExtraGuests: totalExtra, defaultSurchargeTotal: totalExtra * extraGuestPrice };
  }, [form.checkIn, form.checkOut, form.groupRooms, form.roomId, form.unitId, form.numAdult, form.numChild, capacitySettings]);

  const hasExtraGuests = totalExtraGuests > 0 || (form.extraGuestSurcharge !== '' && Number(form.extraGuestSurcharge) !== 0);

  // Resetear ediciones manuales cuando cambien las habitaciones seleccionadas
  useEffect(() => {
    setIsDailyRateEdited(false);
    setIsDepositEdited(false);
    setIsPriceUnlocked(false);
    setGroupRoomRates({});
  }, [form.roomId, form.unitId, form.groupRooms]);

  // Cargar cuentas (accounts) y multiplicadores de Supabase al montar
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const { data, error } = await supabase
          .from('accounts')
          .select('*')
          .order('sort_index', { ascending: true })
          .order('name', { ascending: true });
        if (data) {
          setAccounts(data);
        }
      } catch (err) {
        console.error("Error fetching accounts:", err);
      }
    };
    const fetchMultipliers = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'ota_multipliers')
          .maybeSingle();
        if (data && data.value) {
          const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          setOtaMultipliers({
            airbnb: parsed.airbnb ?? 1.20,
            booking: parsed.booking ?? 1.35
          });
        }
      } catch (err) {
        console.error("Error fetching multipliers:", err);
      }
    };
    const fetchCapacitySettings = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'capacity_settings')
          .maybeSingle();
        if (data && data.value) {
          const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          setCapacitySettings(parsed || null);
        }
      } catch (err) {
        console.error("Error fetching capacity settings:", err);
      }
    };
    fetchAccounts();
    fetchMultipliers();
    fetchCapacitySettings();
  }, []);

  // Limpiar método y cuenta si el anticipo es 0 o vacío
  useEffect(() => {
    if (Number(form.deposit || 0) <= 0) {
      setFormPaymentMethod(null);
      setFormAccountId('');
    }
  }, [form.deposit]);

  // Auto-seleccionar primer sobre compatible para el anticipo
  useEffect(() => {
    if (!formPaymentMethod || accounts.length === 0) {
      setFormAccountId('');
      return;
    }
    const compatible = accounts.filter(acc => {
      const isUSD = form.guestName?.toUpperCase().includes('(US DOLLARS)');
      if (isUSD) {
        const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
        if (!isUSDAcc) return false;
        
        const name = acc.name.trim().toUpperCase();
        if (formPaymentMethod === 'efectivo') {
          return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
        }
        return !name.includes('EFE') && !name.includes('CASH');
      } else {
        const name = acc.name.trim().toUpperCase();
        if (formPaymentMethod === 'efectivo') {
          return name === 'EFECTIVO';
        }
        if (formPaymentMethod === 'tarjeta') {
          return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
        }
        if (formPaymentMethod === 'transferencia') {
          return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
        }
        return false;
      }
    });

    if (compatible.length > 0) {
      setFormAccountId(compatible[0].id);
    } else {
      setFormAccountId('');
    }
  }, [formPaymentMethod, accounts, form.guestName]);

  const handleUnlockPrice = () => {
    if (pinInput === getAdminPin()) {
      setIsPriceUnlocked(true);
      setShowPinModal(false);
      setPinInput('');
    } else {
      alert('PIN Incorrecto');
    }
  };

  useEffect(() => {
    if (form.checkIn && form.checkOut) {
      const fetchAvailability = async () => {
        setLoadingInventory(true);
        try {
          const res = await fetch(`/api/availability?checkIn=${form.checkIn}&checkOut=${form.checkOut}&t=${Date.now()}`);
          const data = await res.json();
          if (data.success) {
            setInventory(data.inventory);
            
            // Auto-seleccionar la primera disponible si no hay seleccionada (opcional, pero mejor dejar que elija)
          } else {
            console.error("Error fetching availability", data.error);
          }
        } catch(e) {
          console.error(e);
        } finally {
          setLoadingInventory(false);
        }
      };
      fetchAvailability();
    } else {
      setInventory([]);
    }
  }, [form.checkIn, form.checkOut]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const hasRoomSelected = (form.groupRooms && form.groupRooms.length > 0) || (form.roomId && form.unitId);
    if (!hasRoomSelected) {
      return alert("Por favor, selecciona al menos una habitación física específica.");
    }

    if (mode === 'reserva') {
      if (!form.guestName || !form.phone || !form.numAdult || Number(form.numAdult) < 1) {
        return alert("Por favor, rellene todos los campos obligatorios: Nombre del Huésped, N. Móvil y Adultos.");
      }

      // Validar capacidad máxima de la habitación o habitaciones seleccionadas
      const roomsToBook = form.groupRooms && form.groupRooms.length > 0
        ? form.groupRooms
        : [{
            roomId: form.roomId,
            unitId: form.unitId,
            name: getUnitName(form.roomId, form.unitId) || form.unitId
          }];
      
      let totalMaxCapacity = 0;
      roomsToBook.forEach(r => {
        const parentMapping = getParentMapping(r.roomId, r.unitId);
        const rules = getCapacityRules(parentMapping.roomId || r.roomId || r.name, capacitySettings || undefined);
        totalMaxCapacity += rules.max;
      });

      const totalGuests = Number(form.numAdult) + Number(form.numChild || 0);
      if (totalGuests > totalMaxCapacity) {
        return alert(`⚠️ La capacidad máxima de la(s) habitación(es) seleccionada(s) es de ${totalMaxCapacity} personas en total. Has ingresado ${totalGuests} personas. Por favor, reduce el número de huéspedes o selecciona más habitaciones.`);
      }
      if (Number(form.deposit || 0) > 0) {
        if (!formPaymentMethod || !formAccountId) {
          return alert("Por favor, selecciona el Método de Pago y la Cuenta Destino para el anticipo.");
        }
      }
    }

    setLoading(true);

    try {
      const isBlock = mode === 'bloqueo';
      
      const roomsToBook = form.groupRooms && form.groupRooms.length > 0
        ? form.groupRooms
        : [{
            roomId: form.roomId,
            unitId: form.unitId,
            name: getUnitName(form.roomId, form.unitId) || form.unitId
          }];

      const totalRooms = roomsToBook.length;
      const { roomDetails } = calculateReservationPrices();
      const totalDeposit = isBlock ? 0 : Number(form.deposit || 0);
      const depositPerRoom = Math.round(totalDeposit / totalRooms);
      const roomNamesList = roomsToBook.map(r => r.name).join(', ');

      for (const room of roomsToBook) {
        const matchedDetails = roomDetails.find(d => d.roomId === room.roomId && d.unitId === room.unitId);
        const roomTotal = matchedDetails ? matchedDetails.roomTotal : 0;

        const payload = {
          roomId: room.roomId,
          unitId: room.unitId,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          guestName: form.guestName,
          isBlock,
          price: isBlock ? 0 : roomTotal,
          deposit: depositPerRoom,
          phone: isBlock ? '' : form.phone,
          numAdult: isBlock ? 1 : (Number(form.numAdult) || 1),
          numChild: isBlock ? 0 : (Number(form.numChild) || 0),
          notes: isBlock ? '' : `${form.notes || ''}${totalRooms > 1 ? ` (Grupo: Habs ${roomNamesList})` : ''}`,
        };

        const bgRes = await fetch('/api/reservas', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        });
        
        const responseData = await bgRes.json();

        if (!bgRes.ok) throw new Error(responseData.error || `Error al registrar habitación ${room.name} en Beds24`);

        // Registrar auditoría rica 360 por habitación
        try {
          const emp = getActiveEmployee('recepcion');
          const employeeNum = emp?.employee_num || '999';
          const employeeName = emp?.full_name || 'Administrador';
          const employeeDept = emp?.department || 'recepcion';
          
          const roomMeta = getRoomMetadata(room.roomId, null);
          const roomDisplayName = roomMeta ? `${roomMeta.nombre} (${room.name})` : `Habitación ${room.name}`;
          
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              employee_num: employeeNum,
              employee_name: employeeName,
              department: employeeDept,
              module: 'recepcion',
              action: isBlock ? 'bloqueo_habitacion' : 'reserva_creada',
              room: room.name,
              details: JSON.stringify({
                text: isBlock 
                  ? `${form.guestName || 'Mantenimiento'} - Aplicó bloqueo físico en ${roomDisplayName} para fechas ${form.checkIn} a ${form.checkOut}.`
                  : `${form.guestName || 'Huésped'} ${form.numAdult || 1}/${form.numChild || 0} (ID: ${responseData.data?.data?.[0]?.id || ''}) de la Habitación ${roomDisplayName} - Registró reserva manual desde ${form.checkIn} a ${form.checkOut} por $${roomTotal} (Anticipo: $${depositPerRoom}, vía ${form.channel}${totalRooms > 1 ? `, Grupo: Habs ${roomNamesList}` : ''}).`,
                reserva: {
                  guestName: form.guestName || (isBlock ? 'Bloqueo' : 'Reserva Directa'),
                  roomId: room.roomId,
                  unitId: room.unitId,
                  roomName: roomDisplayName,
                  checkIn: form.checkIn,
                  checkOut: form.checkOut,
                  price: roomTotal,
                  deposit: depositPerRoom,
                  channel: form.channel,
                  isBlock,
                  bookingId: responseData.data?.data?.[0]?.id || ''
                }
              })
            })
          });
        } catch (logErr) {
          console.error("Error registrando log de reserva/bloqueo:", logErr);
        }

        // Registrar en Supabase finances y actualizar balance de cuenta si hay anticipo/pago
        if (!isBlock && depositPerRoom > 0) {
          try {
            const beds24BookingId = responseData.data?.data?.[0]?.id || '';
            const baseDesc = form.channel === 'Recepción'
              ? `${form.guestName}${beds24BookingId ? ` (ID: ${beds24BookingId})` : ''} - Hab ${room.name} - Pago Walk-in`
              : `${form.guestName}${beds24BookingId ? ` (ID: ${beds24BookingId})` : ''} - Hab ${room.name} - Anticipo`;
            
            const currentDayStr = getLocalDateStr(new Date());
            // Si el check-in es retroactivo, registrar en esa fecha de check-in, si no, registrar hoy
            const financeDate = form.checkIn && form.checkIn < currentDayStr ? form.checkIn : currentDayStr;

            const { error: financeErr } = await supabase.from('finances').insert({
              type: 'ingreso',
              amount: depositPerRoom,
              category: 'Alojamiento',
              description: baseDesc,
              payment_method: formPaymentMethod,
              account_id: formAccountId,
              date: financeDate
            });

            if (financeErr) {
              console.error("Error al registrar finanzas para anticipo:", financeErr);
              alert(`⚠️ Se guardó la reserva, pero hubo un error al registrar el anticipo de $${depositPerRoom} en Finanzas: ${financeErr.message}`);
            } else {
              // Obtener saldo fresco de la cuenta para evitar sobreescrituras en bucle
              const { data: latestAcc, error: latestAccErr } = await supabase
                .from('accounts')
                .select('balance')
                .eq('id', formAccountId)
                .single();
              
              if (!latestAccErr && latestAcc) {
                const newBalance = latestAcc.balance + depositPerRoom;
                const { error: accErr } = await supabase
                  .from('accounts')
                  .update({ balance: newBalance })
                  .eq('id', formAccountId);
                
                if (accErr) {
                  console.error("Error al actualizar balance de la cuenta:", accErr);
                } else {
                  setAccounts(prev => prev.map(a => a.id === formAccountId ? { ...a, balance: newBalance } : a));
                }
              }
            }
          } catch (dbErr: any) {
            console.error("Error interactuando con la base de datos para registrar anticipo:", dbErr);
          }
        }
      }

      alert(mode === 'reserva' 
        ? '¡Éxito! Reserva(s) conectada(s) hacia Beds24 y confirmada(s) en la(s) unidad(es) seleccionada(s).' 
        : '¡Éxito! Bloqueo(s) aplicado(s) en la(s) unidad(es) seleccionada(s).');
      
      router.push(`/reservas?search=${encodeURIComponent(form.guestName)}`);
    } catch (err: any) {
      alert(`Fallo en el intento:\n\n${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-24 bg-[#fafafa] min-h-screen">
      
      <div className="mb-6 border-b border-zinc-200/80 pb-4">
        <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight leading-tight">Gestión Inmediata</h2>
        <p className="text-[13px] font-medium text-zinc-500 mt-1">Registra o bloquea disponibilidad en unidades específicas.</p>
      </div>

      {/* Segmented Control */}
      <div className="flex p-0.5 bg-zinc-200/50 rounded-xl mb-6 shadow-inner">
        <button 
          type="button"
          onClick={() => setMode('reserva')}
          className={`flex-1 py-2.5 text-[13px] font-semibold rounded-[10px] transition-all duration-200 ${
            mode === 'reserva' ? 'bg-white text-zinc-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Reserva Directa
        </button>
        <button 
          type="button"
          onClick={() => setMode('bloqueo')}
          className={`flex-1 py-2.5 text-[13px] font-semibold rounded-[10px] transition-all duration-200 ${
            mode === 'bloqueo' ? 'bg-white text-rose-600 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Forzar Bloqueo
        </button>
      </div>

      {mode === 'bloqueo' && (
        <div className="bg-rose-50/50 border border-rose-200/60 p-4 rounded-2xl flex items-start gap-3 mb-6 shadow-[0_2px_8px_rgba(225,29,72,0.02)]">
          <ShieldAlert className="text-rose-600 mt-0.5 shrink-0" size={16} strokeWidth={2.5}/>
          <p className="text-[12px] text-rose-900 font-medium leading-relaxed">
            <strong className="block mb-0.5 text-[13px] font-semibold">Bloqueo Físico de Unidad</strong>
            Esto cerrará la habitación exacta seleccionada, impidiendo reservas online para esa unidad.
          </p>
        </div>
      )}

      {mode === 'reserva' && (
        <div className="bg-zinc-100/50 border border-zinc-200/60 p-3.5 rounded-2xl flex items-center gap-3 mb-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <CheckCircle2 className="text-zinc-700 shrink-0" size={16} strokeWidth={2.5}/>
          <p className="text-[12px] text-zinc-600 font-medium">Beds24 asignará esta reserva exactamente al número de habitación que elijas.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-zinc-200/80 p-5 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-5">
        
        {/* Fechas (Primero, para poder cargar disponibilidad) */}
        <div className="grid grid-cols-2 gap-3.5 w-full">
          <div className="space-y-1.5 min-w-0">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 block">Check-In</label>
            <input 
              key={todayStr ? `checkin-${todayStr}` : 'checkin-loading'}
              type="date" 
              required
              className="w-full min-w-0 h-14 px-3.5 py-0 bg-[#fafafa] border border-zinc-200/80 rounded-xl text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none block appearance-none"
              value={form.checkIn}
              onChange={e => {
                const newCheckIn = e.target.value;
                const newCheckOut = addDaysToDateStr(newCheckIn, Number(nights) || 1);
                setForm({...form, checkIn: newCheckIn, checkOut: newCheckOut, roomId: '', unitId: '', groupRooms: []});
              }}
            />
          </div>
          <div className="space-y-1.5 min-w-0">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 block">Noches</label>
            <div className="relative flex items-center w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl h-14 focus-within:bg-white focus-within:border-zinc-400 focus-within:ring-4 focus-within:ring-zinc-900/5 transition-all">
              <button
                type="button"
                onClick={() => {
                  const current = Number(nights) || 1;
                  const num = Math.max(1, current - 1);
                  setNights(num);
                  if (form.checkIn) {
                    const newCheckOut = addDaysToDateStr(form.checkIn, num);
                    setForm(prev => ({ ...prev, checkOut: newCheckOut, roomId: '', unitId: '', groupRooms: [] }));
                  }
                }}
                className="w-12 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-r border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-l-xl select-none"
              >
                <Minus size={16} strokeWidth={2.5} />
              </button>
              <input 
                type="number" 
                required
                min={1}
                className="flex-1 min-w-0 h-full text-center bg-transparent border-0 text-zinc-900 font-semibold text-[16px] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={nights}
                onChange={e => {
                  const val = e.target.value;
                  if (val === '') {
                    setNights('');
                    return;
                  }
                  const num = Number(val);
                  if (isNaN(num)) return;
                  setNights(num);
                  if (form.checkIn) {
                    const newCheckOut = addDaysToDateStr(form.checkIn, num);
                    setForm(prev => ({ ...prev, checkOut: newCheckOut, roomId: '', unitId: '', groupRooms: [] }));
                  }
                }}
                onBlur={() => {
                  const num = Math.max(1, Number(nights) || 1);
                  setNights(num);
                  if (form.checkIn) {
                    const newCheckOut = addDaysToDateStr(form.checkIn, num);
                    setForm(prev => ({ ...prev, checkOut: newCheckOut, roomId: '', unitId: '', groupRooms: [] }));
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const current = Number(nights) || 1;
                  const num = current + 1;
                  setNights(num);
                  if (form.checkIn) {
                    const newCheckOut = addDaysToDateStr(form.checkIn, num);
                    setForm(prev => ({ ...prev, checkOut: newCheckOut, roomId: '', unitId: '', groupRooms: [] }));
                  }
                }}
                className="w-12 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-l border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-r-xl select-none"
              >
                <Plus size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {form.checkOut && (
          <div className="text-[12px] font-medium text-zinc-500 bg-zinc-50 border border-zinc-200/60 p-3.5 rounded-xl flex items-center gap-2 animate-in fade-in duration-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-zinc-400">Check-Out (Salida):</span>
            <span className="font-bold text-zinc-800">
              {format(parseISO(form.checkOut), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
            </span>
          </div>
        )}

        {/* Mapa Visual de Habitaciones */}
        {form.checkIn && form.checkOut && (
          <div className="space-y-3 pt-2">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Seleccionar Habitación</label>
            
            {loadingInventory ? (
              <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin"></div></div>
            ) : inventory.length > 0 ? (
              <div className="space-y-4">
                {inventory.map((roomGroup: any) => (
                  <div key={roomGroup.roomId} className="bg-zinc-50 border border-zinc-200/60 rounded-xl p-3">
                    <h4 className="text-[12px] font-bold text-zinc-700 mb-2">{roomGroup.name}</h4>
                    <div className="flex flex-wrap gap-2">
                      {roomGroup.units.map((u: any) => {
                        const isSelected = form.groupRooms?.some(gr => gr.roomId === roomGroup.roomId && gr.unitId === u.unitId) || (form.roomId === roomGroup.roomId && form.unitId === u.unitId);
                        return (
                          <button
                            key={u.unitId}
                            type="button"
                            disabled={!u.isAvailable}
                            onClick={() => {
                              const currentGroup = form.groupRooms || [];
                              let baseGroup = currentGroup;
                              if (baseGroup.length === 0 && form.roomId && form.unitId) {
                                baseGroup = [{
                                  roomId: form.roomId,
                                  unitId: form.unitId,
                                  name: getUnitName(form.roomId, form.unitId) || form.unitId
                                }];
                              }

                              const exists = baseGroup.some(gr => gr.roomId === roomGroup.roomId && gr.unitId === u.unitId);
                              let newGroup;
                              if (exists) {
                                newGroup = baseGroup.filter(gr => !(gr.roomId === roomGroup.roomId && gr.unitId === u.unitId));
                              } else {
                                newGroup = [...baseGroup, { roomId: roomGroup.roomId, unitId: u.unitId, name: u.name }];
                              }

                              const last = newGroup[newGroup.length - 1];
                              setForm({
                                ...form,
                                groupRooms: newGroup,
                                roomId: last ? last.roomId : '',
                                unitId: last ? last.unitId : ''
                              });
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                              !u.isAvailable 
                                ? 'bg-zinc-200/50 text-zinc-400 cursor-not-allowed line-through' 
                                : isSelected
                                  ? 'bg-zinc-900 text-white shadow-md scale-105'
                                  : 'bg-white border border-zinc-200 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100'
                            }`}
                          >
                            {u.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {form.groupRooms && form.groupRooms.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200/60 rounded-xl p-3 space-y-1.5 animate-in fade-in duration-200">
                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest block">Habitaciones Seleccionadas ({form.groupRooms.length})</span>
                    <div className="flex flex-wrap gap-1.5">
                      {form.groupRooms.map(gr => (
                        <span key={`${gr.roomId}_${gr.unitId}`} className="px-2.5 py-1 bg-white border border-blue-200 text-blue-800 text-[11px] font-black rounded-lg shadow-sm flex items-center gap-1">
                          {gr.name}
                          <button
                            type="button"
                            onClick={() => {
                              const newGroup = form.groupRooms!.filter(x => !(x.roomId === gr.roomId && x.unitId === gr.unitId));
                              const last = newGroup[newGroup.length - 1];
                              setForm({
                                ...form,
                                groupRooms: newGroup,
                                roomId: last ? last.roomId : '',
                                unitId: last ? last.unitId : ''
                              });
                            }}
                            className="w-3.5 h-3.5 rounded-full hover:bg-zinc-100 flex items-center justify-center text-blue-500 hover:text-blue-700 transition-colors"
                          >
                            <X size={10} strokeWidth={3} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
               <div className="text-[13px] text-zinc-500 bg-zinc-50 p-4 rounded-xl border border-zinc-200">No hay disponibilidad o revisa las fechas.</div>
            )}
          </div>
        )}

        {/* Cliente / Motivo */}
        {form.unitId && (
          <div className="space-y-5 pt-2 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">
                {mode === 'reserva' ? 'Huésped' : 'Motivo / Nota Interna'}
              </label>
              <input 
                type="text" 
                required
                placeholder={mode === 'reserva' ? "Nombre completo" : "Ej: Mantenimiento"}
                className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none placeholder:font-medium placeholder:text-zinc-400"
                value={form.guestName}
                onChange={e => setForm({...form, guestName: e.target.value})}
              />
            </div>

            {/* Extra Form Fields for Reserva only */}
            {mode === 'reserva' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">N. Móvil</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ej. +52 55 1234 5678"
                    className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none placeholder:font-medium placeholder:text-zinc-400"
                    value={form.phone}
                    onChange={e => setForm({...form, phone: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 block">Adultos</label>
                    <div className="flex items-center w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl h-14 focus-within:bg-white focus-within:border-zinc-400 focus-within:ring-4 focus-within:ring-zinc-900/5 transition-all">
                      <button
                        type="button"
                        onClick={() => {
                          const val = Math.max(1, Number(form.numAdult || 1) - 1);
                          setForm({...form, numAdult: val});
                        }}
                        className="w-12 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-r border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-l-xl select-none"
                      >
                        <Minus size={16} strokeWidth={2.5} />
                      </button>
                      <input 
                        type="number" 
                        required
                        min={1}
                        className="flex-1 min-w-0 h-full text-center bg-transparent border-0 text-zinc-900 font-semibold text-[16px] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={form.numAdult}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '') {
                            setForm({...form, numAdult: '' as any});
                            return;
                          }
                          const num = Number(val);
                          if (isNaN(num)) return;
                          setForm({...form, numAdult: num});
                        }}
                        onBlur={() => {
                          const num = Math.max(1, Number(form.numAdult) || 1);
                          setForm({...form, numAdult: num});
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = Number(form.numAdult || 1) + 1;
                          setForm({...form, numAdult: val});
                        }}
                        className="w-12 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-l border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-r-xl select-none"
                      >
                        <Plus size={16} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 block">Niños</label>
                    <div className="flex items-center w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl h-14 focus-within:bg-white focus-within:border-zinc-400 focus-within:ring-4 focus-within:ring-zinc-900/5 transition-all">
                      <button
                        type="button"
                        onClick={() => {
                          const val = Math.max(0, Number(form.numChild || 0) - 1);
                          setForm({...form, numChild: val});
                        }}
                        className="w-12 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-r border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-l-xl select-none"
                      >
                        <Minus size={16} strokeWidth={2.5} />
                      </button>
                      <input 
                        type="number" 
                        required
                        min={0}
                        className="flex-1 min-w-0 h-full text-center bg-transparent border-0 text-zinc-900 font-semibold text-[16px] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={form.numChild}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '') {
                            setForm({...form, numChild: '' as any});
                            return;
                          }
                          const num = Number(val);
                          if (isNaN(num)) return;
                          setForm({...form, numChild: num});
                        }}
                        onBlur={() => {
                          const num = Math.max(0, Number(form.numChild) || 0);
                          setForm({...form, numChild: num});
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = Number(form.numChild || 0) + 1;
                          setForm({...form, numChild: val});
                        }}
                        className="w-12 h-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors border-l border-zinc-200/50 hover:bg-zinc-100/50 active:bg-zinc-100 rounded-r-xl select-none"
                      >
                        <Plus size={16} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>

                {maxCapacity > 0 && (
                  <div className={`text-[12px] font-bold mt-1.5 pl-0.5 ${
                    (Number(form.numAdult || 1) + Number(form.numChild || 0)) > maxCapacity
                      ? 'text-rose-600 animate-pulse'
                      : 'text-emerald-600'
                  }`}>
                    {(Number(form.numAdult || 1) + Number(form.numChild || 0)) > maxCapacity
                      ? `⚠️ Límite de capacidad excedido. Máximo permitido: ${maxCapacity} personas.`
                      : maxCapacity > baseCapacity
                        ? `✓ Capacidad permitida. Incluidas: ${baseCapacity} · Adicionales con cargo: ${maxCapacity - baseCapacity} (Máx: ${maxCapacity} personas).`
                        : `✓ Capacidad permitida: ${maxCapacity} personas (sin cargos adicionales).`}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Nota / Comentarios (Opcional)</label>
                  <textarea 
                    placeholder="Ej. Requiere factura, check-in temprano..."
                    className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none placeholder:font-medium placeholder:text-zinc-400 h-20 resize-none"
                    value={form.notes}
                    onChange={e => setForm({...form, notes: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5 pt-1">
                  {/* Origen */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">Origen</label>
                    <div className="relative">
                      <select 
                        className="w-full bg-[#fafafa] border border-zinc-200/80 rounded-xl p-3.5 text-zinc-900 font-semibold text-[16px] focus:bg-white focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all outline-none appearance-none cursor-pointer"
                        value={form.channel}
                        onChange={e => {
                          const channelVal = e.target.value;
                          setForm(prev => ({
                            ...prev,
                            channel: channelVal,
                          }));
                          if (channelVal === 'Recepción') {
                            setIsPriceUnlocked(false);
                          }
                        }}
                      >
                        <option value="Directo">Directo Web</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Recepción">Walk-in Recepción</option>
                        <option value="Airbnb">Airbnb</option>
                        <option value="Booking.com">Booking.com</option>
                      </select>
                    </div>
                  </div>

                  {/* Si es una habitación o ninguna, colocar Tarifa Diaria al lado de Origen */}
                  {!(form.groupRooms && form.groupRooms.length > 1) ? (
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center pr-1 animate-in fade-in duration-200">
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">
                            Tarifa Diaria (x Hab)
                          </label>
                          {rateSource === 'beds24' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/50 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Live Beds24
                            </span>
                          )}
                          {rateSource === 'fallback' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200/50 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Tarifa Backup
                            </span>
                          )}
                          {rateSource === 'edited' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200/50 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              Modificado
                            </span>
                          )}
                        </div>
                        {form.channel === 'Recepción' && (
                          <button 
                            type="button" 
                            onClick={() => isPriceUnlocked ? setIsPriceUnlocked(false) : setShowPinModal(true)}
                            className="text-[10px] font-bold text-blue-600 flex items-center gap-1"
                          >
                            {isPriceUnlocked ? <Unlock size={12} /> : <Lock size={12} />}
                            {isPriceUnlocked ? 'Bloquear' : 'Modificar'}
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                        <input 
                          type="number" 
                          placeholder="0.00"
                          readOnly={form.channel === 'Recepción' && !isPriceUnlocked}
                          className={`w-full border rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none ${
                            (form.channel !== 'Recepción' || isPriceUnlocked)
                              ? 'bg-white border-blue-400 focus:ring-4 focus:ring-blue-900/10 text-zinc-900 shadow-sm' 
                              : 'bg-zinc-100 border-zinc-200/80 text-zinc-650 cursor-not-allowed'
                          }`}
                          value={form.dailyRate}
                          onChange={e => {
                            setIsDailyRateEdited(true);
                            setForm({...form, dailyRate: e.target.value});
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div />
                  )}

                  {/* Si hay múltiples habitaciones, mostrar el desglose ocupando el ancho completo */}
                  {form.groupRooms && form.groupRooms.length > 1 && (() => {
                    const { roomDetails } = calculateReservationPrices();
                    return (
                      <div className="col-span-2 space-y-3 pt-1">
                        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5 block animate-in fade-in duration-200">
                          Tarifas por Habitación
                        </label>
                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                          {roomDetails.map((room) => {
                            const key = `${room.roomId}_${room.unitId}`;
                            return (
                              <div 
                                key={key} 
                                className="flex items-center justify-between gap-3 p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl hover:border-zinc-300 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.01)]"
                              >
                                <div className="flex flex-col">
                                  <span className="text-[13px] font-bold text-zinc-800 leading-snug">Habitación {room.name}</span>
                                  <span className="text-[10px] text-zinc-500 font-medium mt-0.5">
                                    Sugerido: ${room.suggestedDailyRate.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                  </span>
                                </div>
                                <div className="relative w-32 shrink-0">
                                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-zinc-400">$</span>
                                  <input
                                    type="number"
                                    placeholder={String(room.suggestedDailyRate)}
                                    className="w-full bg-white border border-zinc-200/80 focus:border-zinc-400 rounded-xl py-2 pl-7 pr-3 text-right text-[15px] font-bold text-zinc-900 transition-all outline-none"
                                    value={groupRoomRates[key] !== undefined ? groupRoomRates[key] : ''}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setGroupRoomRates(prev => ({
                                        ...prev,
                                        [key]: val
                                      }));
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Si hay múltiples habitaciones, mostrar la tarifa promedio en vez de la tarifa diaria */}
                  {form.groupRooms && form.groupRooms.length > 1 && (
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 block">Tarifa Promedio (Diaria)</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                        <input 
                          type="number" 
                          readOnly
                          className="w-full bg-zinc-100 border border-zinc-200/80 text-zinc-650 cursor-not-allowed rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none"
                          value={form.dailyRate}
                        />
                      </div>
                    </div>
                  )}

                  {/* Cargos por Personas Adicionales */}
                  {hasExtraGuests && (
                    <div className="space-y-1.5 col-span-2 animate-in fade-in duration-200">
                      <div className="flex justify-between items-center pr-1">
                        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">
                          Cargos Personas Adicionales (Total por Noche, Impuestos Incluidos)
                        </label>
                        {form.extraGuestSurcharge !== '' && (
                          <button
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, extraGuestSurcharge: '' }))}
                            className="text-[10px] font-bold text-blue-600 hover:underline"
                          >
                            Restablecer a sugerido
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                        <input
                          type="number"
                          placeholder={String(defaultSurchargeTotal)}
                          className="w-full bg-white border border-blue-400 focus:ring-4 focus:ring-blue-900/10 text-zinc-900 shadow-sm rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none"
                          value={form.extraGuestSurcharge}
                          onChange={e => setForm(prev => ({ ...prev, extraGuestSurcharge: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}

                  {/* Anticipo */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 block">
                      Anticipo
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                      <input 
                        type="number" 
                        placeholder="0.00"
                        className="w-full bg-white border border-blue-400 focus:ring-4 focus:ring-blue-900/10 text-zinc-900 shadow-sm rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none"
                        value={form.deposit}
                        onChange={e => {
                          setIsDepositEdited(true);
                          setForm({...form, deposit: e.target.value});
                        }}
                      />
                    </div>
                  </div>

                  {/* Tarifa Total */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 block">Tarifa Total</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">$</span>
                      <input 
                        type="number" 
                        placeholder="0.00"
                        readOnly
                        className="w-full bg-zinc-100 border border-zinc-200/80 text-zinc-650 cursor-not-allowed rounded-xl p-3.5 pl-8 text-[16px] font-semibold transition-all outline-none"
                        value={form.price}
                      />
                    </div>
                  </div>
                </div>

                {Number(form.deposit || 0) > 0 && (
                  <div className="grid grid-cols-2 gap-3.5 p-4 bg-zinc-50 border border-zinc-200/80 rounded-2xl animate-in fade-in duration-200">
                    <div className="space-y-1.5 col-span-2 md:col-span-1">
                      <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5 block">
                        {form.channel === 'Recepción' ? 'Método de Pago (Total)' : 'Método de Pago del Anticipo'}
                      </label>
                      <div className="flex gap-2 h-14 items-center">
                        {[
                          { id: 'efectivo', label: 'Efectivo', icon: Wallet },
                          { id: 'tarjeta', label: 'Tarjeta', icon: BedDouble },
                          { id: 'transferencia', label: 'Transf.', icon: Send }
                        ].map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setFormPaymentMethod(m.id as any)}
                            className={`flex-1 h-full border rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              formPaymentMethod === m.id
                                ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                            }`}
                          >
                            <m.icon size={16} />
                            <span className="text-[13px] font-bold">{m.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5 col-span-2 md:col-span-1">
                      <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest pl-0.5 block">
                        Sobre / Cuenta Destino
                      </label>
                      <select
                        value={formAccountId}
                        onChange={e => setFormAccountId(e.target.value)}
                        required
                        className="w-full h-14 bg-white border border-zinc-200 rounded-xl px-3.5 text-[16px] font-semibold text-zinc-900 focus:border-zinc-400 transition-all outline-none cursor-pointer"
                      >
                        <option value="" disabled>Selecciona un sobre...</option>
                        {accounts
                          .filter(acc => {
                            const isUSD = form.guestName?.toUpperCase().includes('(US DOLLARS)');
                            if (isUSD) {
                              const isUSDAcc = acc.currency?.toUpperCase() === 'USD';
                              if (!isUSDAcc) return false;
                              
                              const name = acc.name.trim().toUpperCase();
                              if (formPaymentMethod === 'efectivo') {
                                return name.includes('EFE') || name.includes('CASH') || name.includes('DLL');
                              }
                              return !name.includes('EFE') && !name.includes('CASH');
                            } else {
                              const name = acc.name.trim().toUpperCase();
                              if (formPaymentMethod === 'efectivo') {
                                return name === 'EFECTIVO';
                              }
                              if (formPaymentMethod === 'tarjeta') {
                                return name === 'HSBC FISCAL' || name === 'MERCADO PAGO';
                              }
                              if (formPaymentMethod === 'transferencia') {
                                return acc.group_type === 'BANCOS' || acc.group_type === 'EXTRANJERO';
                              }
                              return false;
                            }
                          })
                          .map(acc => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} (${acc.balance})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Modal PIN */}
            {showPinModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-zinc-900 flex items-center gap-2"><Lock size={18} className="text-blue-600" /> Desbloquear Tarifa</h3>
                    <button type="button" onClick={() => setShowPinModal(false)} className="text-zinc-400 hover:text-zinc-900">
                      <ShieldAlert size={20} />
                    </button>
                  </div>
                  <p className="text-[13px] text-zinc-500 mb-4">Introduce el PIN de administrador para aplicar descuentos o modificar la tarifa calculada por Beds24.</p>
                  <input 
                    type="password"
                    maxLength={4}
                    placeholder="****"
                    value={pinInput}
                    onChange={e => setPinInput(e.target.value)}
                    className="w-full text-center tracking-[1em] font-mono text-2xl bg-zinc-50 border border-zinc-200 rounded-xl py-3 mb-4 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 outline-none"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowPinModal(false)} className="flex-1 py-3 text-[14px] font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors">Cancelar</button>
                    <button type="button" onClick={handleUnlockPrice} className="flex-1 py-3 text-[14px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-md shadow-blue-600/20">Desbloquear</button>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button 
                type="submit" 
                disabled={loading || (mode === 'reserva' && (!form.guestName || !form.phone || !((form.groupRooms && form.groupRooms.length > 0) || (form.roomId && form.unitId))))}
                className={`w-full font-semibold text-[15px] p-3.5 rounded-xl transition-all shadow-sm flex justify-center items-center active:scale-[0.98] ${
                  mode === 'reserva' 
                    ? 'bg-zinc-900 hover:bg-black text-white' 
                    : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                }`}
              >
                {loading ? 'Procesando...' : (mode === 'reserva' ? 'Registrar y Asignar Unidad' : 'Aplicar Bloqueo Físico')}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
