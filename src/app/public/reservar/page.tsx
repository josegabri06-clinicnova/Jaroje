'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Calendar,
  Users,
  Check,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  ShieldCheck,
  Building,
  ArrowRight,
  X,
  Loader2,
  Phone,
  Mail,
  User,
  ExternalLink,
  BedDouble,
  Compass,
  AlertCircle,
  MessageCircle,
  ArrowLeft
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { DEFAULT_FALLBACK_PHOTO } from '@/lib/room-photos';

interface QuoteItem {
  key: string;
  roomId: string;
  name: string;
  name_en: string;
  capacity: number;
  maxCapacity: number;
  capacityText?: string;
  capacityText_en?: string;
  description: string;
  description_en: string;
  features: string[];
  features_en: string[];
  photos: string[];
  totalUnits: number;
  availableUnitsCount: number;
  isAvailable: boolean;
  nights: number;
  basePricePerNight?: number;
  taxMultiplier?: number;
  pricePerNight: number;
  totalPrice: number;
  depositRequired: number;
  currency: string;
}

interface ExistingBooking {
  id: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  room_name: string;
  price: number;
  deposit: number;
  balance: number;
  status: string;
  portal_url: string;
}

function formatMexicanDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const m = parseInt(parts[1], 10) - 1;
      return `${parseInt(parts[2], 10)} ${months[m] || parts[1]} ${parts[0]}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

function ReservarContent() {
  const searchParams = useSearchParams();
  const phoneParam = searchParams.get('phone') || searchParams.get('p') || '';
  const langParam = searchParams.get('lang') || 'es';
  const actionParam = searchParams.get('action') || '';
  const stepParam = searchParams.get('step') || '';
  const checkInParam = searchParams.get('checkIn') || searchParams.get('in') || '';
  const checkOutParam = searchParams.get('checkOut') || searchParams.get('out') || '';
  const adultsParam = searchParams.get('adults') || searchParams.get('a') || '';
  const childrenParam = searchParams.get('children') || searchParams.get('c') || '';
  const roomsParam = searchParams.get('rooms') || searchParams.get('r') || '';
  const extrasParam = searchParams.get('extras') || searchParams.get('extra') || '';
  const quoteIdParam = searchParams.get('quoteId') || searchParams.get('q') || '';

  const isDirectReserveFlow = Boolean(
    actionParam === 'reserve' ||
    stepParam === 'reserve' ||
    stepParam === 'confirm' ||
    quoteIdParam ||
    (roomsParam && (phoneParam || quoteIdParam))
  );

  const [lang, setLang] = useState<'es' | 'en'>(langParam === 'en' ? 'en' : 'es');

  // Fechas por defecto: mañana a 1 día después (1 noche por defecto)
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const defaultCheckIn = useMemo(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'), []);
  const defaultCheckOut = useMemo(() => format(addDays(new Date(), 2), 'yyyy-MM-dd'), []);
  // Beds24 solo permite reservar noches hasta 365 días desde hoy (última noche: hoy+365, salida: hoy+366)
  const maxCheckInStr = useMemo(() => format(addDays(new Date(), 365), 'yyyy-MM-dd'), []);
  const maxCheckOutStr = useMemo(() => format(addDays(new Date(), 366), 'yyyy-MM-dd'), []);

  const [checkIn, setCheckIn] = useState(() => checkInParam || defaultCheckIn);
  const [checkOut, setCheckOut] = useState(() => {
    if (checkOutParam) return checkOutParam;
    if (checkInParam) {
      try {
        return format(addDays(new Date(checkInParam + 'T12:00:00'), 1), 'yyyy-MM-dd');
      } catch {
        return defaultCheckOut;
      }
    }
    return defaultCheckOut;
  });

  // Fecha mínima permitida de check-out (al menos 1 día después de check-in)
  const minCheckOut = useMemo(() => {
    if (!checkIn) return format(addDays(new Date(), 1), 'yyyy-MM-dd');
    try {
      const d = new Date(checkIn + 'T12:00:00');
      return format(addDays(d, 1), 'yyyy-MM-dd');
    } catch {
      return format(addDays(new Date(), 1), 'yyyy-MM-dd');
    }
  }, [checkIn]);

  const isInvalidDateRange = useMemo(() => {
    if (!checkIn || !checkOut) return true;
    return checkIn >= checkOut;
  }, [checkIn, checkOut]);

  const handleCheckInChange = (newIn: string) => {
    setCheckIn(newIn);
    if (!newIn) return;

    // Rolando: Por default poner 1 día después de la fecha de check in
    try {
      const dIn = new Date(newIn + 'T12:00:00');
      const nextDay = format(addDays(dIn, 1), 'yyyy-MM-dd');
      setCheckOut(nextDay);
    } catch {
      // fallback
    }
  };

  const handleCheckOutChange = (newOut: string) => {
    if (!newOut) {
      setCheckOut('');
      return;
    }
    // Si el usuario intenta seleccionar una fecha de check-out igual o anterior a check-in:
    // forzar automáticamente a check-in + 1 día
    if (checkIn && newOut <= checkIn) {
      try {
        const dIn = new Date(checkIn + 'T12:00:00');
        const minOut = format(addDays(dIn, 1), 'yyyy-MM-dd');
        setCheckOut(minOut);
      } catch {
        setCheckOut(newOut);
      }
    } else {
      setCheckOut(newOut);
    }
  };
  const [adults, setAdults] = useState(() => {
    const p = parseInt(adultsParam, 10);
    return !isNaN(p) && p > 0 ? p : 2;
  });
  const [children, setChildren] = useState(() => {
    const p = parseInt(childrenParam, 10);
    return !isNaN(p) && p >= 0 ? p : 0;
  });

  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [existingReservations, setExistingReservations] = useState<ExistingBooking[]>([]);
  const [activeTab, setActiveTab] = useState<'booking' | 'existing'>('booking');

  // Función de normalización de claves de habitaciones para compatibilidad total con parámetros de URL y Bed24
  const normalizeRoomCategoryKey = (k: string): string => {
    const clean = k.toLowerCase().trim();
    if (clean === '2dorm' || clean === '2rec' || clean === '2hab') return '2rec';
    if (clean === '3dorm' || clean === '3rec' || clean === '3hab') return '3rec';
    if (clean === '1dorm' || clean === '1rec' || clean === '1hab') return '1rec';
    if (clean === 'doble' || clean === 'std' || clean === 'estandar') return 'doble';
    if (clean === 'villa' || clean === 'casa') return 'casa';
    return clean;
  };

  // Selección de habitaciones: { [categoryKey]: quantity }
  const [selectedRooms, setSelectedRooms] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    if (roomsParam) {
      roomsParam.split(',').forEach(item => {
        const [k, q] = item.split(':');
        if (k && q) {
          const qty = parseInt(q, 10);
          const normKey = normalizeRoomCategoryKey(k);
          if (!isNaN(qty) && qty > 0) initial[normKey] = qty;
        }
      });
    }
    return initial;
  });
  // Huéspedes adicionales por tipo de habitación: { [categoryKey]: cantidad } (siempre 0 por defecto)
  const [extraByRoom, setExtraByRoom] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    const total = extrasParam ? parseInt(extrasParam, 10) : 0;
    if (!roomsParam || isNaN(total) || total <= 0) return initial;
    const fallbackExtraPerRoom: Record<string, number> = { doble: 0, '1rec': 0, '2rec': 2, '3rec': 2, casa: 4 };
    let remaining = total;
    roomsParam.split(',').forEach(item => {
      const [k, q] = item.split(':');
      const qty = parseInt(q, 10);
      if (!k || isNaN(qty) || qty <= 0 || remaining <= 0) return;
      const normKey = normalizeRoomCategoryKey(k);
      const give = Math.min(remaining, (fallbackExtraPerRoom[normKey] || 0) * qty);
      if (give > 0) {
        initial[normKey] = give;
        remaining -= give;
      }
    });
    return initial;
  });

  const [availabilityNotice, setAvailabilityNotice] = useState<string>('');
  // Habitaciones de la cotización que ya no tienen disponibilidad (se nombran en el aviso para que el cliente lo entienda)
  const [lostRooms, setLostRooms] = useState<string[]>([]);
  // Copia de la selección actual para poder evaluarla fuera de las funciones de actualización de React
  const selectedRoomsRef = useRef<Record<string, number>>(selectedRooms);
  useEffect(() => { selectedRoomsRef.current = selectedRooms; }, [selectedRooms]);

  // Fotos activas por categoría para los carruseles
  const [activePhotoIdx, setActivePhotoIdx] = useState<Record<string, number>>({});

  // Modal de reserva y estado de confirmación
  const [isModalOpen, setIsModalOpen] = useState<boolean>(() => isDirectReserveFlow);
  const [guestName, setGuestName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [showContactFields, setShowContactFields] = useState(false);
  const [guestPhone, setGuestPhone] = useState(phoneParam);
  const [guestEmail, setGuestEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ── Flujo de Cotización y Confirmación de 2 Pasos con WhatsApp ──
  const [pendingQuote, setPendingQuote] = useState<any | null>(null);
  const [hasRestoredPendingQuote, setHasRestoredPendingQuote] = useState(false);
  const [isConfirmStep, setIsConfirmStep] = useState<boolean>(() => isDirectReserveFlow);
  const [quoteSending, setQuoteSending] = useState(false);
  const [quoteSentToast, setQuoteSentToast] = useState(false);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);

  // Pantalla de éxito
  const [bookingSuccess, setBookingSuccess] = useState<any | null>(null);

  // Diccionario bilingüe
  const t = useMemo(() => {
    return lang === 'en'
      ? {
          portalTitle: 'Official Booking Portal',
          hotelName: 'Condominios Jaroje',
          hotelSubtitle: 'Santa Cruz Huatulco, Oaxaca',
          myStayTab: 'My Current Stay',
          bookNewTab: 'Book Accommodation',
          datesTitle: 'Choose Dates & Guests',
          invalidDatesError: 'Check-out date must be after check-in date (minimum 1 night).',
          checkInLabel: 'Check in',
          checkOutLabel: 'Check out',
          adultsLabel: 'Adults',
          childrenLabel: 'Children',
          searchButton: 'Search Availability',
          searching: 'Searching available rooms...',
          availableRooms: 'Available Accommodations',
          night: 'night',
          nights: 'nights',
          perNight: 'per night',
          totalForStay: 'Total for stay:',
          depositRequired: 'Required deposit (50%):',
          availableUnits: 'available',
          soldOut: 'Sold out for selected dates',
          maxGuests: 'Up to',
          guests: 'guests',
          selectRoom: 'Select',
          selectedRoomsCount: 'accommodations selected',
          continueBtn: 'Continue to Book',
          requestQuoteBtn: 'Quote (No hold)',
          directLockBtn: '¡¡¡ BOOK NOW !!! (Hold 24h in our system) →',
          quoteSending: 'Sending to your WhatsApp...',
          completeNameBtn: 'Enter Full Name & Confirm',
          summaryTitle: 'Booking Summary',
          confirmPendingQuoteTitle: 'Official Booking Confirmation',
          confirmPendingQuoteBadge: 'Step 2: Official Confirmation',
          confirmPendingQuoteDesc: 'You will receive your Guest Portal via WhatsApp to review your reservation. You will have 24 hours to complete your deposit and upload your receipt to your Guest Portal. (After that time, you will have to check availability again).',
          guestDetailsTitle: 'Guest Details',
          fullName: 'Full Name',
          phone: 'WhatsApp Phone',
          email: 'Email (Optional)',
          notesPlaceholder: 'Any special arrival requests or comments...',
          guaranteeTitle: '24-Hour Hold Guarantee',
          guaranteeDesc: 'Your accommodations will be locked immediately for 24 hours. You will receive WhatsApp instructions with banking details to complete your 50% deposit.',
          confirmLockBtn: '¡¡¡ BOOK NOW !!! (Lock 24h)',
          lockSuccessTitle: 'Reservation Request Locked!',
          lockSuccessDesc: 'Your accommodations have been temporarily reserved for 24 hours in our system.',
          bookingIdLabel: 'Reservation #',
          goToPortal: 'Open My Guest Portal',
          bankTransferTitle: 'Deposit Instructions (50%)',
          bankName: 'Bank: BBVA / STP',
          bankClabe: 'CLABE: 012610015523498762',
          bankAccountHolder: 'Beneficiary: Condominios Jaroje',
          timeRemainingBanner: '⏳ You have 24 hours to upload your payment receipt to avoid cancellation.',
          activeBookingBanner: 'You already have an active stay with us:',
          viewPortalLink: 'View Guest Portal',
          phoneModalTitle: 'Where should we send your quote?',
          phoneModalDesc: 'Enter your WhatsApp number so we can send you the official breakdown and confirmation button:',
          sendQuoteBtn: 'Send Quote to WhatsApp',
          availabilityModalTitle: '⚠️ Selected accommodation is no longer available',
          availabilityModalDesc: 'The accommodation previously selected for these dates was recently booked or blocked in the system. Please click "Modify booking" to choose from our other available rooms.',
          chooseAvailableBtn: 'Choose Available Accommodation',
          noRoomsSelectedTitle: 'No accommodations selected',
          selectRoomAction: 'Select room'
        }
      : {
          portalTitle: 'Portal Oficial de Reservas',
          hotelName: 'Condominios Jaroje',
          hotelSubtitle: 'Santa Cruz Huatulco, Oaxaca',
          myStayTab: 'Mi Estancia Actual',
          bookNewTab: 'Cotizar y Reservar',
          datesTitle: 'Fechas y Huéspedes',
          invalidDatesError: 'La fecha de check-out debe ser posterior a la fecha de check-in (mínimo 1 noche).',
          checkInLabel: 'Check in',
          checkOutLabel: 'Check out',
          adultsLabel: 'Adultos',
          childrenLabel: 'Niños',
          searchButton: 'Consultar Disponibilidad',
          searching: 'Consultando disponibilidad en vivo...',
          availableRooms: 'Alojamientos Disponibles',
          night: 'noche',
          nights: 'noches',
          perNight: 'por noche',
          totalForStay: 'Total de la estancia:',
          depositRequired: 'Anticipo requerido (50%):',
          availableUnits: 'disponibles',
          soldOut: 'Agotado para estas fechas',
          maxGuests: 'Hasta',
          guests: 'huéspedes',
          selectRoom: 'Seleccionar',
          selectedRoomsCount: 'alojamientos seleccionados',
          continueBtn: 'Continuar a Reservar',
          requestQuoteBtn: 'Cotizar (Sin bloqueo)',
          directLockBtn: '¡¡¡ RESERVA YA !!! (Bloqueo 24 horas en nuestro sistema) →',
          quoteSending: 'Enviando a tu WhatsApp...',
          completeNameBtn: 'Ingresar Nombre y Confirmar',
          summaryTitle: 'Resumen de tu Solicitud',
          confirmPendingQuoteTitle: 'Confirmar Reserva Oficial',
          confirmPendingQuoteBadge: 'Paso 2: Confirmación Oficial',
          confirmPendingQuoteDesc: 'Recibirás por WhatsApp tu Portal del Huésped donde podrás revisar tu reservación. Tendrás 24 hrs para completar el depósito de tu anticipo y subir tu comprobante a tu Portal del Huésped. (Después de ese tiempo tendrás que verificar nuevamente disponibilidad).',
          guestDetailsTitle: 'Datos del Titular',
          fullName: 'Nombre y Apellidos completos',
          phone: 'Teléfono WhatsApp',
          email: 'Correo electrónico (Opcional)',
          notesPlaceholder: 'Petición especial o comentarios para tu llegada...',
          guaranteeTitle: 'Garantía de Bloqueo por 24 Horas',
          guaranteeDesc: 'Tus alojamientos quedarán bloqueados de inmediato en nuestro calendario por 24 horas. Recibirás por WhatsApp los datos bancarios para transferir el 50% de anticipo.',
          confirmLockBtn: '¡¡¡ RESERVA YA !!! (Confirmar y Bloquear 24h)',
          lockSuccessTitle: '¡Solicitud Bloqueada con Éxito!',
          lockSuccessDesc: 'Tus habitaciones quedaron aseguradas por 24 horas en nuestro sistema.',
          bookingIdLabel: 'Reservación #',
          goToPortal: 'Ir a mi Portal del Huésped',
          bankTransferTitle: 'Datos para realizar tu Anticipo (50%)',
          bankName: 'Banco: BBVA / STP',
          bankClabe: 'CLABE: 012610015523498762',
          bankAccountHolder: 'Beneficiario: Condominios Jaroje',
          timeRemainingBanner: '⏳ Cuentas con 24 horas para enviar tu comprobante y confirmar tu estancia.',
          activeBookingBanner: 'Ya cuentas con una reservación activa con nosotros:',
          viewPortalLink: 'Ver Portal del Huésped',
          phoneModalTitle: '¿A qué WhatsApp enviamos tu cotización?',
          phoneModalDesc: 'Ingresa tu número de WhatsApp para enviarte el desglose oficial y el botón de confirmación directa:',
          sendQuoteBtn: 'Enviar Cotización a mi WhatsApp',
          availabilityModalTitle: '⚠️ El alojamiento seleccionado ya no tiene disponibilidad',
          availabilityModalDesc: 'El alojamiento seleccionado previamente para estas fechas acaba de ser apartado o bloqueado en el sistema. Por favor pulsa "Modificar Reserva" para elegir otra de las opciones disponibles.',
          chooseAvailableBtn: 'Elegir Alojamiento Disponible',
          noRoomsSelectedTitle: 'Ningún alojamiento seleccionado',
          selectRoomAction: 'Seleccionar habitación'
        };
  }, [lang]);

  // Caché en memoria para cotizaciones y cancelador de peticiones en vuelo (stale requests)
  // La caché caduca a los 60 s: precios y disponibilidad no deben mostrarse viejos si el cliente deja la pestaña abierta
  const QUOTES_CACHE_TTL_MS = 60 * 1000;
  const quotesCacheRef = useRef<Map<string, { data: any; ts: number }>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  // Aplica los datos de cotización en el estado local de forma coherente
  const applyQuoteData = (data: any) => {
    setQuotes(data.quotes || []);
    if (data.existingReservations && data.existingReservations.length > 0) {
      setExistingReservations(data.existingReservations);
    }

    // Validar la disponibilidad en vivo de las habitaciones preseleccionadas (se evalúa aquí, no dentro de un
    // setState, para saber con certeza qué habitaciones se perdieron y poder avisar al cliente)
    if (data.quotes && Array.isArray(data.quotes)) {
      const fallbackNames: Record<string, [string, string]> = {
        doble: ['Habitación Doble', 'Standard Room'],
        '1rec': ['Condominio de 1 dormitorio', '1-Bedroom Condo'],
        '2rec': ['Condominio de 2 dormitorios', '2-Bedroom Condo'],
        '3rec': ['Condominio de 3 dormitorios', '3-Bedroom Condo'],
        casa: ['Casa de Lujo', 'Luxury House']
      };
      const roomLabel = (key: string): string => {
        const q = data.quotes.find((x: any) => x.key === key);
        const fb = fallbackNames[key];
        return (lang === 'en' ? (q?.name_en || fb?.[1]) : (q?.name || fb?.[0])) || key;
      };
      const lost: string[] = [];
      const keepAvailable = (wanted: Record<string, number>): Record<string, number> => {
        const kept: Record<string, number> = {};
        Object.entries(wanted).forEach(([key, qty]) => {
          const available = data.quotes.find((x: any) => x.key === key)?.availableUnitsCount || 0;
          if (available >= qty) {
            kept[key] = qty;
          } else {
            if (available > 0) kept[key] = available;
            lost.push(available > 0
              ? `${roomLabel(key)} (${lang === 'en' ? `only ${available} left` : `solo quedan ${available}`})`
              : roomLabel(key));
          }
        });
        return kept;
      };

      const currentSelection = selectedRoomsRef.current;
      if (Object.keys(currentSelection).length > 0) {
        const kept = keepAvailable(currentSelection);
        selectedRoomsRef.current = kept;
        setSelectedRooms(kept);
      }

      // Si existe cotización pendiente previa asociada a este teléfono SOLO si el usuario viene del botón de confirmar cotización
      if (isDirectReserveFlow && data.pendingQuote && data.pendingQuote.status === 'pending_name') {
        setPendingQuote(data.pendingQuote);
        if (data.pendingQuote.phone && !guestPhone) {
          setGuestPhone(data.pendingQuote.phone);
        }
        // Sincronizar selectedRooms con los alojamientos del pendingQuote respetando la disponibilidad real
        if (Object.keys(currentSelection).length === 0 && Array.isArray(data.pendingQuote.rooms) && data.pendingQuote.rooms.length > 0) {
          const wanted: Record<string, number> = {};
          data.pendingQuote.rooms.forEach((r: any) => {
            const k = normalizeRoomCategoryKey(r.key || '');
            wanted[k] = (wanted[k] || 0) + Number(r.quantity || 1);
          });
          const kept = keepAvailable(wanted);
          selectedRoomsRef.current = kept;
          setSelectedRooms(kept);
        }
      } else if (!isDirectReserveFlow) {
        // Si el usuario entra por navegación general al portal, no forzar ninguna cotización previa fantasma
        setPendingQuote(null);
      }

      setLostRooms(lost);
      if (lost.length > 0) {
        setAvailabilityNotice(
          lang === 'en'
            ? '⚠️ One or more previously selected accommodations are no longer fully available for these dates.'
            : '⚠️ Uno o más alojamientos seleccionados previamente ya no tienen disponibilidad completa para estas fechas. Por favor verifique las opciones disponibles.'
        );
      }
    }
  };

  // Consultar cotización y reservas existentes con caché en memoria y cancelación de carreras
  const fetchQuotes = async () => {
    if (!checkIn || !checkOut || checkIn >= checkOut) {
      setQuotes([]);
      setLoading(false);
      return;
    }

    // Cancelar siempre la petición en curso (también si ahora se sirve desde caché), para que una respuesta
    // vieja de otras fechas no pise los resultados actuales
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const cacheKey = `${checkIn}_${checkOut}_${phoneParam}`;
    const cached = quotesCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.ts < QUOTES_CACHE_TTL_MS) {
      applyQuoteData(cached.data);
      setLoading(false);
      return;
    }
    quotesCacheRef.current.delete(cacheKey);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    try {
      const url = `/api/public/cotizar?checkIn=${checkIn}&checkOut=${checkOut}&phone=${encodeURIComponent(phoneParam)}`;
      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json();

      if (data.success) {
        quotesCacheRef.current.set(cacheKey, { data, ts: Date.now() });
        applyQuoteData(data);
      } else {
        setQuotes([]);
        setAvailabilityNotice(
          data.code === 'RATES_UNAVAILABLE'
            ? (lang === 'en'
                ? '⚠️ We could not load up-to-date rates. Please try again in a few minutes.'
                : '⚠️ No pudimos cargar las tarifas actualizadas. Por favor intenta de nuevo en unos minutos.')
            : (data.error || (lang === 'en' ? '⚠️ Could not load rates.' : '⚠️ No se pudieron cargar las tarifas.'))
        );
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return; // Petición cancelada porque el usuario cambió de fecha rápidamente
      }
      console.error("Error fetching quotes:", err);
      setQuotes([]);
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchQuotes();
    if (isDirectReserveFlow) {
      setIsConfirmStep(true);
      setIsModalOpen(true);
    }
  }, [checkIn, checkOut, phoneParam, isDirectReserveFlow]);

  // Manejo de contadores + / - para habitaciones
  const handleUpdateQuantity = (key: string, delta: number, maxAvailable: number) => {
    setLostRooms([]);
    setSelectedRooms(prev => {
      const current = prev[key] || 0;
      const next = Math.max(0, Math.min(maxAvailable, current + delta));
      return { ...prev, [key]: next };
    });
    if (selectedRooms[key] !== undefined && Math.max(0, (selectedRooms[key] || 0) + delta) === 0) {
      setExtraByRoom(prev => ({ ...prev, [key]: 0 }));
    }
  };

  // Cambiar huéspedes adicionales de un tipo de habitación (sin forzar nunca)
  const handleUpdateExtra = (key: string, delta: number, maxForKey: number) => {
    setExtraByRoom(prev => {
      const current = prev[key] || 0;
      const next = Math.max(0, Math.min(maxForKey, current + delta));
      return { ...prev, [key]: next };
    });
  };

  // Limpiar y resetear completamente la selección de habitaciones
  const handleClearSelection = () => {
    setLostRooms([]);
    setSelectedRooms({});
    setExtraByRoom({});
    setPendingQuote(null);
    setIsConfirmStep(false);
  };

  // Carrusel de fotos
  const handleNextPhoto = (key: string, totalPhotos: number) => {
    setActivePhotoIdx(prev => ({
      ...prev,
      [key]: ((prev[key] || 0) + 1) % totalPhotos
    }));
  };

  const handlePrevPhoto = (key: string, totalPhotos: number) => {
    setActivePhotoIdx(prev => ({
      ...prev,
      [key]: ((prev[key] || 0) - 1 + totalPhotos) % totalPhotos
    }));
  };

  const totalGuests = useMemo(() => {
    return Number(adults || 0) + Number(children || 0);
  }, [adults, children]);

  // Cálculo directo de noches de estancia basado en checkIn y checkOut (independiente de habitaciones seleccionadas)
  const stayNights = useMemo(() => {
    if (!checkIn || !checkOut || checkIn >= checkOut) return 0;
    const dIn = new Date(checkIn + 'T12:00:00');
    const dOut = new Date(checkOut + 'T12:00:00');
    const diff = Math.round((dOut.getTime() - dIn.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [checkIn, checkOut]);

  // Cálculo del total seleccionado con desglose transparente y personas extras
  const selectionSummary = useMemo(() => {
    let totalRooms = 0;
    let baseLodgingTotal = 0;
    let totalBaseCapacity = 0;
    let totalMaxCapacity = 0;
    let extraGuests = 0;
    const selectedList: { quote: QuoteItem; quantity: number }[] = [];

    quotes.forEach(q => {
      const qty = selectedRooms[q.key] || 0;
      if (qty > 0) {
        totalRooms += qty;
        baseLodgingTotal += q.totalPrice * qty;
        totalBaseCapacity += (q.capacity || 4) * qty;
        totalMaxCapacity += (q.maxCapacity || q.capacity || 4) * qty;
        selectedList.push({ quote: q, quantity: qty });
      }
    });

    // Huéspedes que no caben en la capacidad estándar de lo seleccionado: solo entonces se permite alojarlos como adicionales.
    // Los adicionales NO suman personas al total de arriba: son parte de ellas y nunca pueden superar este número.
    const neededExtras = Math.max(0, totalGuests - totalBaseCapacity);
    let remainingExtras = neededExtras;
    selectedList.forEach(({ quote: q, quantity: qty }) => {
      const maxExtraForKey = Math.max(0, (q.maxCapacity || q.capacity || 4) - (q.capacity || 4)) * qty;
      const give = Math.min(Math.max(0, extraByRoom[q.key] || 0), maxExtraForKey, remainingExtras);
      extraGuests += give;
      remainingExtras -= give;
    });

    const nights = quotes[0]?.nights || selectedList[0]?.quote?.nights || stayNights;
    const maxAvailableExtras = Math.max(0, totalMaxCapacity - totalBaseCapacity);

    const extraGuestsFee = extraGuests * 500 * nights;
    const grandTotal = baseLodgingTotal + extraGuestsFee;
    const deposit = Math.round(grandTotal * 0.5);
    const balanceRemaining = grandTotal - deposit;

    return {
      totalRooms,
      nights,
      baseLodgingTotal,
      extraGuests,
      neededExtras,
      maxAvailableExtras,
      extraGuestsFee,
      grandTotal,
      deposit,
      balanceRemaining,
      totalBaseCapacity,
      totalMaxCapacity,
      selectedList
    };
  }, [quotes, selectedRooms, stayNights, extraByRoom, totalGuests]);

  // Si ya no sobra gente (cambió el nº de huéspedes o se añadió otra habitación), los adicionales vuelven a 0 / se recortan
  useEffect(() => {
    const assigned = Object.values(extraByRoom).reduce((sum, n) => sum + (n || 0), 0);
    if (assigned === 0) return;
    if (selectionSummary.totalRooms === 0) return;
    if (assigned <= selectionSummary.neededExtras) return;
    let remaining = selectionSummary.neededExtras;
    setExtraByRoom(prev => {
      const next: Record<string, number> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const keep = Math.min(v || 0, remaining);
        remaining -= keep;
        if (keep > 0) next[k] = keep;
      });
      return next;
    });
  }, [selectionSummary.neededExtras, selectionSummary.totalRooms, extraByRoom]);

  // Resumen activo que respalda pendingQuote si fue restaurado antes de que carguen las cotizaciones
  const activeSummary = useMemo(() => {
    if (selectionSummary.totalRooms > 0) {
      return selectionSummary;
    }
    if (isDirectReserveFlow && isConfirmStep && pendingQuote && Array.isArray(pendingQuote.rooms) && pendingQuote.rooms.length > 0) {
      let totalRooms = 0;
      let baseLodgingTotal = 0;
      let totalBaseCapacity = 0;
      let totalMaxCapacity = 0;
      const selectedList: { quote: QuoteItem; quantity: number }[] = [];
      const nights = Number(pendingQuote.nights || stayNights);

      pendingQuote.rooms.forEach((r: any) => {
        const requestedQty = Number(r.quantity || 1);
        const matchingCat = quotes.find(q => q.key === r.key);
        // Si las cotizaciones en tiempo real ya cargaron y no hay unidades disponibles, no considerarla
        if (quotes.length > 0 && matchingCat && (matchingCat.availableUnitsCount || 0) < requestedQty) {
          const avail = Math.max(0, matchingCat.availableUnitsCount || 0);
          if (avail === 0) return;
        }
        const qty = quotes.length > 0 && matchingCat
          ? Math.min(requestedQty, matchingCat.availableUnitsCount || 0)
          : requestedQty;

        totalRooms += qty;
        const baseCap = matchingCat?.capacity || (r.key === 'doble' ? 4 : r.key === '1rec' ? 4 : r.key === '2rec' ? 6 : r.key === '3rec' ? 10 : 12);
        const maxCap = matchingCat?.maxCapacity || (r.key === 'doble' ? 4 : r.key === '1rec' ? 4 : r.key === '2rec' ? 8 : r.key === '3rec' ? 12 : 16);
        totalBaseCapacity += baseCap * qty;
        totalMaxCapacity += maxCap * qty;

        const pricePerNight = Number(r.pricePerNight || matchingCat?.pricePerNight || 0);
        const itemTotalPrice = Number(r.totalPrice || (pricePerNight * nights));
        baseLodgingTotal += itemTotalPrice * qty;

        selectedList.push({
          quote: matchingCat || {
            key: r.key,
            roomId: r.roomId || '',
            name: r.name || (r.key === 'doble' ? 'Habitación Doble' : r.key === '1rec' ? 'Condominio de 1 dormitorio' : r.key === '2rec' ? 'Condominio de 2 dormitorios' : r.key === '3rec' ? 'Condominio de 3 dormitorios' : 'Casa de Lujo'),
            name_en: r.name_en || 'Accommodation',
            capacity: baseCap,
            maxCapacity: maxCap,
            description: '',
            description_en: '',
            features: [],
            features_en: [],
            photos: [],
            totalUnits: 1,
            availableUnitsCount: 1,
            isAvailable: true,
            nights: nights,
            pricePerNight: pricePerNight,
            totalPrice: itemTotalPrice,
            depositRequired: Math.round(itemTotalPrice * 0.5),
            currency: 'MXN'
          },
          quantity: qty
        });
      });

      const maxAvailableExtras = Math.max(0, totalMaxCapacity - totalBaseCapacity);
      const extraGuests = pendingQuote.extraGuests !== undefined
        ? Math.min(Math.max(0, Number(pendingQuote.extraGuests) || 0), maxAvailableExtras)
        : 0;

      const extraGuestsFee = extraGuests * 500 * nights;
      const grandTotal = pendingQuote.totalAmount ? Number(pendingQuote.totalAmount) : (baseLodgingTotal + extraGuestsFee);
      const deposit = pendingQuote.depositRequired ? Number(pendingQuote.depositRequired) : Math.round(grandTotal * 0.5);
      const balanceRemaining = grandTotal - deposit;

      return {
        totalRooms,
        nights,
        baseLodgingTotal,
        extraGuests,
        neededExtras: Math.max(0, totalGuests - totalBaseCapacity),
        maxAvailableExtras,
        extraGuestsFee,
        grandTotal,
        deposit,
        balanceRemaining,
        totalBaseCapacity,
        totalMaxCapacity,
        selectedList
      };
    }
    return selectionSummary;
  }, [selectionSummary, pendingQuote, quotes, stayNights, isDirectReserveFlow, isConfirmStep]);

  const coveredCapacity = activeSummary.totalRooms > 0 ? (activeSummary.totalBaseCapacity + (activeSummary.extraGuests || 0)) : 0;
  const pendingGuests = activeSummary.totalRooms > 0 ? Math.max(0, totalGuests - coveredCapacity) : 0;
  const isOverCapacity = pendingGuests > 0;

  // Limpiar automáticamente la alerta de indisponibilidad cuando el cliente seleccione otra opción viable
  useEffect(() => {
    if (!availabilityNotice) return;
    if (lostRooms.length > 0) return; // hay habitaciones perdidas: el aviso se mantiene hasta que el cliente modifique su selección
    if (selectionSummary.totalRooms > 0 && !isOverCapacity) {
      // Verificar que todas las habitaciones elegidas cuenten con disponibilidad real confirmada
      const allAvailable = selectionSummary.selectedList.every(
        item => item.quantity > 0 && (item.quote.availableUnitsCount || 0) >= item.quantity
      );
      if (allAvailable) {
        setAvailabilityNotice('');
      }
    }
  }, [selectionSummary.totalRooms, isOverCapacity, selectionSummary.selectedList, availabilityNotice, lostRooms]);

  // Enviar cotización por WhatsApp (Paso 1 del flujo)
  const handleRequestQuote = async () => {
    if (isInvalidDateRange || stayNights <= 0) {
      alert(t.invalidDatesError);
      return;
    }

    const phoneToUse = guestPhone.trim() || phoneParam.trim();
    if (!phoneToUse) {
      setIsPhoneModalOpen(true);
      return;
    }

    if (activeSummary.totalRooms === 0) {
      alert(lang === 'en' ? 'Please select at least one room.' : 'Por favor selecciona al menos una habitación.');
      return;
    }

    if (isOverCapacity) {
      alert(lang === 'en'
        ? (totalGuests > activeSummary.totalMaxCapacity
            ? `You have selected ${totalGuests} guests, but the maximum occupancy of your selected accommodations is ${activeSummary.totalMaxCapacity}.`
            : `You have selected ${totalGuests} guests, but your selected accommodations and extras only cover ${coveredCapacity} guests.`)
        : (totalGuests > activeSummary.totalMaxCapacity
            ? `Ha seleccionado ${totalGuests} huéspedes pero la ocupación máxima de las habitaciones que ha seleccionado es ${activeSummary.totalMaxCapacity}.`
            : `Ha seleccionado ${totalGuests} huéspedes pero su selección de habitaciones y adicionales solo cubre ${coveredCapacity} personas.`));
      return;
    }

    setQuoteSending(true);
    setSubmitError('');

    try {
      const payloadRooms = activeSummary.selectedList.map(item => ({
        key: item.quote.key,
        name: lang === 'en' ? item.quote.name_en : item.quote.name,
        quantity: item.quantity,
        pricePerNight: item.quote.pricePerNight,
        totalPrice: item.quote.totalPrice
      }));

      const res = await fetch('/api/public/cotizacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneToUse,
          checkIn,
          checkOut,
          nights: activeSummary.nights,
          adults,
          children,
          totalGuests,
          rooms: payloadRooms,
          baseLodgingTotal: activeSummary.baseLodgingTotal,
          extraGuests: activeSummary.extraGuests,
          extraGuestsFee: activeSummary.extraGuestsFee,
          totalAmount: activeSummary.grandTotal,
          depositRequired: activeSummary.deposit,
          balanceRemaining: activeSummary.balanceRemaining
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al enviar cotización');
      }

      setPendingQuote(data.quoteData);
      setQuoteSentToast(true);
      setTimeout(() => setQuoteSentToast(false), 6000);
    } catch (err: any) {
      console.error("Error requesting quote:", err);
      alert(err.message || 'Error al enviar cotización a WhatsApp. Intenta de nuevo.');
    } finally {
      setQuoteSending(false);
    }
  };

  // Enviar confirmación y bloqueo a Beds24 (Paso 2 del flujo)
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalidDateRange || stayNights <= 0) {
      setSubmitError(t.invalidDatesError);
      return;
    }
    if (activeSummary.totalRooms === 0) {
      setSubmitError(lang === 'en' ? 'Please select at least one available accommodation.' : 'Por favor selecciona al menos un alojamiento disponible.');
      return;
    }
    if (isOverCapacity) {
      setSubmitError(lang === 'en'
        ? (totalGuests > activeSummary.totalMaxCapacity
            ? `You have selected ${totalGuests} guests, but the maximum occupancy of your selected accommodations is ${activeSummary.totalMaxCapacity}.`
            : `You have selected ${totalGuests} guests, but your selected accommodations and extras only cover ${coveredCapacity} guests.`)
        : (totalGuests > activeSummary.totalMaxCapacity
            ? `Ha seleccionado ${totalGuests} huéspedes pero la ocupación máxima de las habitaciones que ha seleccionado es ${activeSummary.totalMaxCapacity}.`
            : `Ha seleccionado ${totalGuests} huéspedes pero su selección de habitaciones y adicionales solo cubre ${coveredCapacity} personas.`));
      return;
    }
    if (!guestName.trim() || !guestLastName.trim()) {
      setSubmitError(lang === 'en' ? 'Please enter your first name and last names.' : 'Por favor ingresa tu nombre y apellidos.');
      return;
    }
    if (!guestPhone.trim()) {
      setSubmitError(lang === 'en' ? 'Please enter your phone number.' : 'Por favor ingresa tu número de teléfono.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const payloadRooms = activeSummary.selectedList.map(item => ({
        key: item.quote.key,
        quantity: item.quantity,
        pricePerNight: item.quote.pricePerNight,
        totalPrice: item.quote.totalPrice
      }));

      const res = await fetch('/api/public/reservar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: `${guestName.trim()} ${guestLastName.trim()}`,
          guestPhone: guestPhone.trim(),
          guestEmail: guestEmail.trim(),
          checkIn,
          checkOut,
          adults,
          children,
          rooms: payloadRooms,
          notes: notes.trim(),
          totalAmount: activeSummary.grandTotal,
          depositRequired: activeSummary.deposit,
          extraGuests: activeSummary.extraGuests,
          extraGuestsFee: activeSummary.extraGuestsFee
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al procesar la reservación');
      }

      // La disponibilidad cambió con esta reserva: descartar las cotizaciones guardadas
      quotesCacheRef.current.clear();
      setBookingSuccess(data);
      setIsModalOpen(false);
      setIsConfirmStep(false);
      setPendingQuote(null);
    } catch (err: any) {
      console.error("Error submitting booking:", err);
      setSubmitError(err.message || 'Error al procesar la reserva. Por favor intenta de nuevo.');
      // Tras un fallo (p. ej. habitación ya ocupada) se vuelve a consultar la disponibilidad real
      quotesCacheRef.current.clear();
      fetchQuotes();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen bg-zinc-50 text-zinc-900 font-sans antialiased transition-all duration-200 ${
      activeSummary.totalRooms > 0 ? 'pb-32' : 'pb-24'
    }`}>
      {/* ── HEADER SUPERIOR ELEGANTE ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-zinc-200/80 shadow-xs">
        <div className="max-w-xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/logo-jaroje.png" 
              alt="Condominios Jaroje" 
              className="h-10 w-auto object-contain shrink-0" 
            />
            <div>
              <h1 className="text-[15px] font-black tracking-tight text-zinc-900 leading-none">
                {t.hotelName}
              </h1>
              <p className="text-[11px] font-medium text-zinc-500 mt-0.5">
                {t.portalTitle}
              </p>
            </div>
          </div>

          {/* Selector de idioma */}
          <button
            onClick={() => setLang(l => (l === 'es' ? 'en' : 'es'))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 border border-zinc-200/60 text-xs font-bold text-zinc-700 transition-all cursor-pointer"
          >
            <span>{lang === 'es' ? '🇲🇽 ES' : '🇺🇸 EN'}</span>
          </button>
        </div>

        {/* ── TABS SUPERIORES (SMART SWITCHER) SI TIENE RESERVA PREVIA ── */}
        {existingReservations.length > 0 && !bookingSuccess && (
          <div className="max-w-xl mx-auto px-4 pt-1 pb-2 flex gap-2">
            <button
              onClick={() => setActiveTab('existing')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'existing'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              <Building size={14} />
              <span>{t.myStayTab} ({existingReservations.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('booking')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'booking'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              <Plus size={14} />
              <span>{t.bookNewTab}</span>
            </button>
          </div>
        )}
      </header>

      {/* ── CONTENIDO PRINCIPAL ── */}
      <main className="max-w-xl mx-auto px-4 pt-5 space-y-5">
        {/* PANTALLA DE ÉXITO TRAS BLOQUEO */}
        {bookingSuccess ? (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 text-center space-y-3 shadow-xs">
              <img 
                src="/logo-jaroje.png" 
                alt="Condominios Jaroje" 
                className="h-10 w-auto mx-auto object-contain mb-1" 
              />
              <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
                <Check size={32} className="stroke-[3]" />
              </div>
              <h2 className="text-xl font-black text-emerald-950">
                {t.lockSuccessTitle}
              </h2>
              <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                {t.lockSuccessDesc}
              </p>
              <div className="inline-block bg-white px-4 py-2 rounded-xl border border-emerald-200 text-xs font-bold text-emerald-900 shadow-2xs">
                {t.bookingIdLabel} {bookingSuccess.masterBookingId}
              </div>
            </div>

            {/* Banner de 24 horas */}
            <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-xs font-bold text-amber-900 flex items-start gap-2.5 shadow-2xs">
              <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-snug">{t.timeRemainingBanner}</p>
            </div>

            {/* Resumen de la reserva creada */}
            <div className="bg-white rounded-2xl p-5 border border-zinc-200/70 shadow-xs space-y-3">
              <div className="flex justify-between items-center text-xs border-b border-zinc-100 pb-2">
                <span className="text-zinc-500">{t.checkInLabel}:</span>
                <span className="font-bold text-zinc-900">{formatMexicanDate(bookingSuccess.checkIn)}</span>
              </div>
              <div className="flex justify-between items-center text-xs border-b border-zinc-100 pb-2">
                <span className="text-zinc-500">{t.checkOutLabel}:</span>
                <span className="font-bold text-zinc-900">{formatMexicanDate(bookingSuccess.checkOut)}</span>
              </div>
              <div className="flex justify-between items-center text-xs border-b border-zinc-100 pb-2">
                <span className="text-zinc-500">Alojamientos:</span>
                <span className="font-bold text-zinc-900 text-right">{bookingSuccess.rooms.join(', ')}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-zinc-100 pb-2 pt-1">
                <span className="font-bold text-zinc-700">Total Estancia:</span>
                <span className="font-black text-zinc-900">${bookingSuccess.totalAmount.toLocaleString()} MXN</span>
              </div>
              <div className="flex justify-between items-center text-base pt-1">
                <span className="font-black text-indigo-700">Anticipo Requerido (50%):</span>
                <span className="font-black text-indigo-600 text-lg">${bookingSuccess.depositRequired.toLocaleString()} MXN</span>
              </div>
            </div>

            {/* Acciones Finales: Volver a WhatsApp + Ir al Portal */}
            <div className="space-y-2.5 pt-2">
              <a
                href="https://wa.me/529581168698"
                className="w-full py-4 bg-[#25D366] hover:bg-[#20ba5a] text-white font-extrabold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <MessageCircle size={18} className="fill-white/20 stroke-[2.2]" />
                <span>{lang === 'en' ? 'Return to WhatsApp Chat' : 'Volver a la Conversación en WhatsApp'}</span>
              </a>

              <a
                href={bookingSuccess.portalUrl}
                className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{t.goToPortal}</span>
                <ArrowRight size={14} />
              </a>
            </div>
          </div>
        ) : activeTab === 'existing' && existingReservations.length > 0 ? (
          /* ── VISTA DE RESERVAS EXISTENTES (MI ESTANCIA ACTUAL) ── */
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-2xl p-4 text-xs font-medium text-indigo-900">
              {t.activeBookingBanner}
            </div>

            {existingReservations.map(res => (
              <div key={res.id} className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                      {res.status === 'confirmed' ? 'Confirmada' : 'En proceso'}
                    </span>
                    <h3 className="text-sm font-black text-zinc-900 mt-1.5">{res.room_name}</h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-zinc-400">#{res.id}</span>
                </div>

                <div className="flex justify-between text-xs text-zinc-600 border-t border-zinc-100 pt-2">
                  <span>📅 {formatMexicanDate(res.check_in)} al {formatMexicanDate(res.check_out)}</span>
                  <span className="font-bold text-zinc-900">${res.price.toLocaleString()} MXN</span>
                </div>

                <a
                  href={res.portal_url}
                  className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>{t.viewPortalLink}</span>
                  <ExternalLink size={14} />
                </a>
              </div>
            ))}
          </div>
        ) : (
          /* ── MOTOR DE RESERVAS (ESTILO BOOKING) ── */
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* BUSCADOR DE FECHAS Y PERSONAS */}
            <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <h2 className="text-xs font-black uppercase tracking-widest text-zinc-900">
                    {t.datesTitle}
                  </h2>
                </div>
                {stayNights > 0 && (
                  <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200 shadow-2xs">
                    {stayNights} {stayNights === 1 ? t.night : t.nights}
                  </span>
                )}
              </div>

              {/* Rango de fechas */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-zinc-500 block mb-1">
                      {t.checkInLabel}
                    </label>
                    <input
                      type="date"
                      min={todayStr}
                      max={maxCheckInStr}
                      value={checkIn}
                      onChange={e => handleCheckInChange(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-900 bg-zinc-50 focus:bg-white focus:border-indigo-600 outline-none transition-all cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-zinc-500 block mb-1">
                      {t.checkOutLabel}
                    </label>
                    <input
                      type="date"
                      min={minCheckOut}
                      max={maxCheckOutStr}
                      value={checkOut}
                      onChange={e => handleCheckOutChange(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-900 bg-zinc-50 focus:bg-white focus:border-indigo-600 outline-none transition-all cursor-pointer"
                    />
                  </div>
                </div>

                {/* Banner de error si el rango es inválido */}
                {isInvalidDateRange && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5 animate-in fade-in">
                    <AlertCircle size={13} className="shrink-0 text-rose-600" />
                    <span>{t.invalidDatesError}</span>
                  </div>
                )}
              </div>

              {/* Huéspedes */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">
                    {t.adultsLabel}
                  </label>
                  <div className="flex items-center justify-between p-2 rounded-xl border border-zinc-200 bg-zinc-50">
                    <button
                      type="button"
                      onClick={() => setAdults(a => Math.max(1, a - 1))}
                      className="w-7 h-7 rounded-lg bg-white border border-zinc-200 flex items-center justify-center font-black text-xs hover:bg-zinc-100 cursor-pointer shrink-0"
                    >
                      <Minus size={12} />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min={1}
                      max={200}
                      value={adults}
                      onChange={e => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setAdults(1);
                          return;
                        }
                        const val = parseInt(raw, 10);
                        if (!isNaN(val)) {
                          setAdults(Math.max(1, Math.min(200, val)));
                        }
                      }}
                      onFocus={e => e.target.select()}
                      className="w-14 text-center text-xs font-black text-zinc-900 bg-transparent border-0 outline-none p-0 focus:ring-0 appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => setAdults(a => Math.min(200, a + 1))}
                      className="w-7 h-7 rounded-lg bg-white border border-zinc-200 flex items-center justify-center font-black text-xs hover:bg-zinc-100 cursor-pointer shrink-0"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">
                    {t.childrenLabel}
                  </label>
                  <div className="flex items-center justify-between p-2 rounded-xl border border-zinc-200 bg-zinc-50">
                    <button
                      type="button"
                      onClick={() => setChildren(c => Math.max(0, c - 1))}
                      className="w-7 h-7 rounded-lg bg-white border border-zinc-200 flex items-center justify-center font-black text-xs hover:bg-zinc-100 cursor-pointer shrink-0"
                    >
                      <Minus size={12} />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min={0}
                      max={100}
                      value={children}
                      onChange={e => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setChildren(0);
                          return;
                        }
                        const val = parseInt(raw, 10);
                        if (!isNaN(val)) {
                          setChildren(Math.max(0, Math.min(100, val)));
                        }
                      }}
                      onFocus={e => e.target.select()}
                      className="w-14 text-center text-xs font-black text-zinc-900 bg-transparent border-0 outline-none p-0 focus:ring-0 appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => setChildren(c => Math.min(100, c + 1))}
                      className="w-7 h-7 rounded-lg bg-white border border-zinc-200 flex items-center justify-center font-black text-xs hover:bg-zinc-100 cursor-pointer shrink-0"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* LISTADO DE HABITACIONES */}
            <div id="accommodations-section" className="space-y-4">
              {/* Aviso de cambio en disponibilidad si alguna unidad preseleccionada ya no está libre */}
              {availabilityNotice && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span className="leading-snug">
                      {availabilityNotice}
                      {lostRooms.length > 0 && (
                        <span className="block mt-1 font-extrabold">
                          {lang === 'en' ? 'No longer available: ' : 'Ya no hay disponibilidad de: '}{lostRooms.join(', ')}.
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setAvailabilityNotice(''); setLostRooms([]); }}
                    className="text-amber-700 hover:text-amber-950 font-black p-1 text-xs shrink-0 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">
                    {t.availableRooms}
                  </h3>
                  {loading && quotes.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full animate-pulse">
                      <Loader2 size={11} className="animate-spin" />
                      <span>{lang === 'en' ? 'Updating...' : 'Actualizando...'}</span>
                    </span>
                  )}
                </div>
                {stayNights > 0 && (
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                    {stayNights} {stayNights === 1 ? t.night : t.nights}
                  </span>
                )}
              </div>

              {loading && quotes.length === 0 ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white rounded-3xl overflow-hidden border border-zinc-200/80 animate-pulse">
                      <div className="h-52 bg-zinc-100" />
                      <div className="p-5 space-y-3">
                        <div className="h-5 bg-zinc-200 rounded-md w-2/3" />
                        <div className="h-4 bg-zinc-100 rounded-md w-1/3" />
                        <div className="h-10 bg-zinc-100 rounded-2xl w-full mt-4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : quotes.length === 0 ? (
                <div className="bg-white rounded-3xl p-8 border border-zinc-200/80 text-center text-xs text-zinc-500">
                  {t.soldOut}
                </div>
              ) : (
                <div className={`space-y-4 transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                {quotes.map(q => {
                  const qtySelected = selectedRooms[q.key] || 0;
                  const cardExtraGuests = selectionSummary.neededExtras > 0 ? Math.min(extraByRoom[q.key] || 0, Math.max(0, q.maxCapacity - q.capacity) * qtySelected, selectionSummary.extraGuests) : 0;
                  const cardTotal = q.totalPrice * Math.max(1, qtySelected) + cardExtraGuests * 500 * q.nights;
                  const activeImgIdx = activePhotoIdx[q.key] || 0;
                  const currentPhoto = q.photos[activeImgIdx] || q.photos[0] || DEFAULT_FALLBACK_PHOTO;

                  return (
                    <div
                      key={q.key}
                      className={`bg-white rounded-3xl overflow-hidden border transition-all duration-200 shadow-xs ${
                        qtySelected > 0
                          ? 'border-indigo-600 ring-2 ring-indigo-600/10'
                          : 'border-zinc-200/80'
                      }`}
                    >
                      {/* Carrusel de fotos */}
                      <div className="relative h-52 bg-zinc-900 overflow-hidden">
                        <img
                          src={currentPhoto}
                          alt={q.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

                        {/* Botones de navegación de foto */}
                        {q.photos.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={() => handlePrevPhoto(q.key, q.photos.length)}
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-sm cursor-pointer"
                            >
                              <ChevronLeft size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleNextPhoto(q.key, q.photos.length)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-sm cursor-pointer"
                            >
                              <ChevronRight size={16} />
                            </button>

                            {/* Indicador de fotos */}
                            <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-bold text-white">
                              {activeImgIdx + 1} / {q.photos.length}
                            </div>
                          </>
                        )}

                        {/* Badges de cabecera de foto en Flex Row (NUNCA se tapan entre sí) */}
                        <div className="absolute top-3 inset-x-3 flex items-start justify-between gap-2 z-10 pointer-events-none">
                          <div className="bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-black text-zinc-900 flex items-center gap-1 shadow-sm shrink min-w-0 max-w-[calc(100%-85px)]">
                            <Users size={12} className="text-indigo-600 shrink-0" />
                            <span className="truncate">
                              {lang === 'en'
                                ? (q.maxCapacity > q.capacity
                                    ? `Base ${q.capacity} (+${q.maxCapacity - q.capacity} extra · max ${q.maxCapacity})`
                                    : `Max ${q.capacity} guests`)
                                : (q.maxCapacity > q.capacity
                                    ? `Base ${q.capacity} (+${q.maxCapacity - q.capacity} extras · máx. ${q.maxCapacity})`
                                    : `Máx. ${q.capacity} personas`)}
                            </span>
                          </div>

                          <div className="shrink-0">
                            {q.availableUnitsCount > 0 ? (
                              <span className="bg-emerald-500/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-xs block">
                                {q.availableUnitsCount} {t.availableUnits}
                              </span>
                            ) : (
                              <span className="bg-rose-500/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-xs block">
                                Agotado
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Detalles y características */}
                      <div className="p-5 space-y-3">
                        <div>
                          <h4 className="text-base font-black text-zinc-900 leading-tight">
                            {lang === 'en' ? q.name_en : q.name}
                          </h4>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 bg-indigo-50/70 border border-indigo-100/80 px-2.5 py-1 rounded-xl w-fit">
                            <Users size={13} className="shrink-0 text-indigo-600" />
                            <span>
                              {lang === 'en'
                                ? (q.capacityText_en || `Base ${q.capacity} guests (+ up to ${q.maxCapacity - q.capacity} extra)`)
                                : (q.capacityText || `Base ${q.capacity} huéspedes (+ hasta ${q.maxCapacity - q.capacity} adicionales · máx. ${q.maxCapacity})`)}
                            </span>
                          </div>
                        </div>

                        {/* Lista de características completas (sin prosa y sin truncar) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-zinc-700 border-t border-zinc-100 pt-3">
                          {(lang === 'en' ? q.features_en : q.features).map((f, i) => (
                            <div key={i} className="flex items-start gap-1.5 leading-snug">
                              <Check size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                              <span className="font-medium">{f}</span>
                            </div>
                          ))}
                        </div>

                        {/* Huéspedes adicionales de este tipo de habitación (por defecto 0, nunca forzado) */}
                        {q.maxCapacity > q.capacity && q.availableUnitsCount > 0 && qtySelected > 0 && selectionSummary.neededExtras > 0 && (() => {
                          const roomMaxExtra = (q.maxCapacity - q.capacity) * qtySelected;
                          const otherExtras = Math.max(0, selectionSummary.extraGuests - Math.min(extraByRoom[q.key] || 0, roomMaxExtra));
                          // Tope: lo que cabe en este tipo de habitación y lo que realmente falta alojar (sin sumar personas nuevas)
                          const maxExtraForKey = Math.min(roomMaxExtra, Math.max(0, selectionSummary.neededExtras - otherExtras));
                          const extraSelected = Math.min(extraByRoom[q.key] || 0, maxExtraForKey);
                          return (
                            <div className="bg-amber-50/95 border border-amber-200/90 rounded-2xl p-2.5 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <div className="text-xs font-black text-amber-950 flex items-center gap-1">
                                    <Users size={13} className="text-amber-700 shrink-0" />
                                    <span>
                                      {lang === 'en'
                                        ? `Extra guests (max. ${q.maxCapacity - q.capacity} per room)`
                                        : `Huéspedes adicionales (máx. ${q.maxCapacity - q.capacity} por habitación)`}
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-bold text-amber-800">
                                    +$500 MXN / {lang === 'en' ? 'night each' : 'noche c/u'}
                                    {extraSelected > 0 && (
                                      <span className="text-amber-950 font-black ml-1">
                                        (+${(extraSelected * 500 * q.nights).toLocaleString()} MXN)
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-xl border border-amber-300 shadow-xs">
                                  <button
                                    type="button"
                                    disabled={extraSelected <= 0}
                                    onClick={() => handleUpdateExtra(q.key, -1, maxExtraForKey)}
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-black transition-all ${
                                      extraSelected > 0
                                        ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 cursor-pointer active:scale-95'
                                        : 'text-zinc-300 cursor-not-allowed'
                                    }`}
                                  >
                                    <Minus size={13} />
                                  </button>
                                  <span className="w-5 text-center text-sm font-black text-zinc-900">
                                    {extraSelected}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={extraSelected >= maxExtraForKey}
                                    onClick={() => handleUpdateExtra(q.key, 1, maxExtraForKey)}
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-black transition-all ${
                                      extraSelected < maxExtraForKey
                                        ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer active:scale-95'
                                        : 'text-zinc-300 bg-zinc-200 cursor-not-allowed'
                                    }`}
                                  >
                                    <Plus size={13} />
                                  </button>
                                </div>
                              </div>
                              <p className="text-[10px] text-amber-900 font-semibold leading-tight flex items-start gap-1">
                                <AlertCircle size={12} className="text-amber-600 shrink-0 mt-0.5" />
                                <span>
                                  {lang === 'en'
                                    ? 'Note: We do not have extra beds. The living room sofa does NOT have air conditioning.'
                                    : 'Nota: No contamos con camas adicionales, sillón de la sala NO cuenta con aire acondicionado.'}
                                </span>
                              </p>
                            </div>
                          );
                        })()}

                        {/* Fila de Precio y Contador Multi-Habitación */}
                        <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                          <div>
                            <div className="flex items-baseline gap-1">
                              <span className="text-lg font-black text-zinc-900">
                                ${q.pricePerNight.toLocaleString()}
                              </span>
                              <span className="text-[10px] font-bold text-zinc-400">MXN / {t.night}</span>
                            </div>
                            <span className="text-[11px] font-bold text-indigo-600 block">
                              Total: ${cardTotal.toLocaleString()} MXN ({q.nights} {q.nights === 1 ? t.night : t.nights}{qtySelected > 1 ? ` · ${qtySelected} ${lang === 'en' ? 'rooms' : 'habitaciones'}` : ''}{cardExtraGuests > 0 ? ` · +${cardExtraGuests} ${lang === 'en' ? 'extra' : 'adic.'}` : ''})
                            </span>
                            <span className="text-[10px] font-semibold text-emerald-700 block mt-0.5">
                              ✓ {lang === 'en' ? 'Taxes included (16% VAT + 3% ISH)' : 'Impuestos incluidos (16% IVA + 3% ISH)'}
                            </span>
                            <div className="mt-1 flex items-center gap-1 text-[10px] font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md w-fit">
                              <span>✅ {lang === 'en' ? 'Jaroje Member Rate applied' : 'Tarifa de Miembro Jaroje aplicada'}</span>
                            </div>
                          </div>

                          {/* Contador + / - */}
                          {q.availableUnitsCount > 0 ? (
                            <div className="flex items-center gap-2 bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200/60">
                              <button
                                type="button"
                                disabled={qtySelected === 0}
                                onClick={() => handleUpdateQuantity(q.key, -1, q.availableUnitsCount)}
                                className={`w-8 h-8 rounded-xl flex items-center justify-center font-black transition-all ${
                                  qtySelected > 0
                                    ? 'bg-white text-zinc-900 shadow-xs hover:bg-zinc-200 cursor-pointer'
                                    : 'text-zinc-300 cursor-not-allowed'
                                }`}
                              >
                                <Minus size={14} />
                              </button>
                              <span className="w-5 text-center text-sm font-black text-zinc-900">
                                {qtySelected}
                              </span>
                              <button
                                type="button"
                                disabled={qtySelected >= q.availableUnitsCount}
                                onClick={() => handleUpdateQuantity(q.key, 1, q.availableUnitsCount)}
                                className={`w-8 h-8 rounded-xl flex items-center justify-center font-black transition-all ${
                                  qtySelected < q.availableUnitsCount
                                    ? 'bg-indigo-600 text-white shadow-xs hover:bg-indigo-700 cursor-pointer'
                                    : 'text-zinc-300 bg-zinc-200 cursor-not-allowed'
                                }`}
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-zinc-400">
                              {t.soldOut}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                </div>
              )}
            </div>

          </div>
        )}
      </main>

      {/* ── BARRA INFERIOR: SIGUIENTE + HUÉSPEDES POR ACOMODAR + LIMPIAR ── */}
      {activeSummary.totalRooms > 0 && !bookingSuccess && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-zinc-200/80 p-3 shadow-xl">
          <div className="max-w-xl mx-auto flex items-center gap-3">
            <button
              type="button"
              onClick={handleClearSelection}
              className="shrink-0 py-3.5 px-3 rounded-2xl border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 font-bold text-xs transition-all cursor-pointer active:scale-95"
              title={lang === 'en' ? 'Remove all selected rooms' : 'Vaciar selección de habitaciones'}
            >
              {lang === 'en' ? 'Clear' : 'Limpiar'}
            </button>

            <button
              type="button"
              disabled={isOverCapacity || isInvalidDateRange || stayNights <= 0}
              onClick={() => {
                if (isOverCapacity || isInvalidDateRange || stayNights <= 0) return;
                setIsConfirmStep(true);
                setIsModalOpen(true);
              }}
              className={`flex-1 py-3.5 px-4 rounded-2xl font-black text-sm tracking-wide transition-all flex items-center justify-center gap-2 ${
                isOverCapacity || isInvalidDateRange || stayNights <= 0
                  ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed'
                  : 'bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-600/20 cursor-pointer active:scale-98'
              }`}
            >
              <span>{lang === 'en' ? 'NEXT' : 'SIGUIENTE'}</span>
              <ArrowRight size={16} />
            </button>

            {isOverCapacity && (
              <span className="shrink-0 max-w-[110px] text-xs font-extrabold text-amber-700 leading-tight text-right">
                {lang === 'en' ? 'Guests to accommodate' : 'Huéspedes por acomodar'} {pendingGuests}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL / BOTTOM SHEET DE CONFIRMACIÓN Y CONTACTO (DEMANDA NOMBRE COMPLETO) ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg mx-auto p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2.5">
                <img
                  src="/logo-jaroje.png"
                  alt="Condominios Jaroje"
                  className="h-6 w-auto object-contain"
                />
                <div>
                  <h3 className="text-base font-black text-zinc-900 leading-tight">
                    {isConfirmStep ? t.confirmPendingQuoteTitle : t.summaryTitle}
                  </h3>
                  {isConfirmStep && (
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                      {t.confirmPendingQuoteBadge}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setIsConfirmStep(false);
                  setShowContactFields(false);
                }}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                setIsConfirmStep(false);
                setShowContactFields(false);
              }}
              className="w-full py-3 rounded-2xl border-2 border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-800 font-black text-sm tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <ArrowLeft size={16} />
              <span>{lang === 'en' ? 'Modify booking' : 'Modificar Reserva'}</span>
            </button>

            {/* Aviso destacado de indisponibilidad dentro del Modal de Confirmación */}
            {(availabilityNotice || (!loading && activeSummary.totalRooms === 0)) && (
              <div className="bg-amber-50 border-2 border-amber-300 text-amber-950 p-4 rounded-2xl text-xs font-semibold flex items-start gap-3 shadow-xs animate-in fade-in">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <p className="font-extrabold text-amber-900 text-sm leading-tight">
                    {t.availabilityModalTitle}
                  </p>
                  <p className="leading-relaxed text-amber-800 text-[11.5px]">
                    {t.availabilityModalDesc}
                  </p>
                  {lostRooms.length > 0 && (
                    <p className="leading-relaxed text-amber-950 text-[12px] font-extrabold">
                      {lang === 'en' ? 'No longer available: ' : 'Ya no hay disponibilidad de: '}{lostRooms.join(', ')}.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setIsConfirmStep(false);
                      setShowContactFields(false);
                      setTimeout(() => {
                        document.getElementById('accommodations-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 100);
                    }}
                    className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs active:scale-95"
                  >
                    <span>{t.chooseAvailableBtn}</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* Resumen detallado de la cotización con desglose completo */}
            {loading ? (
              <div className="py-10 px-4 flex flex-col items-center justify-center gap-3 text-zinc-600 bg-zinc-50 rounded-2xl border border-zinc-200/80">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                <span className="text-xs font-black text-zinc-800">
                  {lang === 'en' ? 'Verifying quote & real-time rates...' : 'Verificando cotización y tarifas en tiempo real...'}
                </span>
                <span className="text-[11px] text-zinc-500 font-medium">
                  {lang === 'en' ? 'Checking real-time availability in Beds24' : 'Comprobando disponibilidad en tiempo real en Beds24'}
                </span>
              </div>
            ) : (
              <div className="bg-zinc-50 rounded-2xl p-4 space-y-3 border border-zinc-200/80 text-xs shadow-xs">
                {/* Totales principales: Total de la estancia y Anticipo */}
                <div className="space-y-2">
                  <div className="flex justify-between items-start font-black text-sm text-zinc-900">
                    <div>
                      <span className="text-zinc-900 font-bold">{lang === 'en' ? 'Total for Stay:' : 'Total de la estancia:'}</span>
                      <div className="mt-1 space-y-0.5 text-[10.5px] font-bold text-emerald-700">
                        <div>✅ {lang === 'en' ? 'Taxes included' : 'Impuestos incluidos'}</div>
                        <div>✅ {lang === 'en' ? 'Jaroje Member Rate applied' : 'Tarifa de Miembro Jaroje aplicada'}</div>
                      </div>
                    </div>
                    <span className="text-base text-indigo-950 font-black">
                      ${activeSummary.grandTotal.toLocaleString()} MXN
                      {activeSummary.totalRooms === 0 && (
                        <span className="block text-[10px] text-amber-700 font-bold">
                          {lang === 'en' ? '(No rooms selected)' : '(Sin habitaciones)'}
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between font-black text-xs text-emerald-900 bg-emerald-50/90 p-3 rounded-xl border border-emerald-200/90">
                    <span>{lang === 'en' ? '50% Required Deposit to Lock:' : 'Anticipo requerido para bloquear (50%):'}</span>
                    <span className="text-sm font-black text-emerald-800">${activeSummary.deposit.toLocaleString()} MXN</span>
                  </div>
                </div>

                {/* Desplegable para ver habitaciones, fechas y amenidades */}
                <div className="pt-1 border-t border-zinc-200/70">
                  <div className="w-full py-2 px-3 bg-white rounded-xl text-zinc-700 text-xs font-bold flex items-center gap-1.5 border border-zinc-200/80">
                    <span>🛏️</span>
                    <span>
                      {lang === 'en'
                        ? `Accommodation & dates breakdown (${activeSummary.nights} ${activeSummary.nights === 1 ? 'night' : 'nights'})`
                        : `Desglose de habitaciones y fechas (${activeSummary.nights} ${activeSummary.nights === 1 ? 'noche' : 'noches'})`}
                    </span>
                  </div>

                  {/* Detalle siempre visible con fechas, habitaciones y personas adicionales */}
                  {(
                    <div className="mt-3 pt-3 border-t border-zinc-200/60 space-y-3 animate-in fade-in duration-200">
                      {/* Fechas y noches */}
                      <div className="flex justify-between items-center font-bold text-zinc-700 border-b border-zinc-200/60 pb-2">
                        <span className="text-zinc-500 font-semibold">{lang === 'en' ? 'Dates:' : 'Fechas:'}</span>
                        <span className="text-zinc-900 font-extrabold">{formatMexicanDate(checkIn)} al {formatMexicanDate(checkOut)} ({activeSummary.nights} {activeSummary.nights === 1 ? (lang === 'en' ? 'night' : 'noche') : (lang === 'en' ? 'nights' : 'noches')})</span>
                      </div>

                      {/* Número de huéspedes */}
                      <div className="flex justify-between items-center font-bold text-zinc-700 border-b border-zinc-200/60 pb-2">
                        <span className="text-zinc-500 font-semibold">{lang === 'en' ? 'Guests:' : 'Huéspedes:'}</span>
                        <span className="text-zinc-900 font-bold">
                          {totalGuests} {lang === 'en' ? 'guests' : 'personas'} ({adults} {lang === 'en' ? 'adults' : 'adultos'}{children > 0 ? `, ${children} ${lang === 'en' ? 'children' : 'niños'}` : ''})
                        </span>
                      </div>

                      {/* Desglose de cada alojamiento con costo por noche */}
                      <div className="space-y-2 border-b border-zinc-200/60 pb-2.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">
                          {lang === 'en' ? 'Selected Accommodations:' : 'Alojamientos seleccionados:'}
                        </span>
                        {activeSummary.selectedList.length === 0 ? (
                          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-amber-900 text-xs font-bold flex items-center justify-between">
                            <span>{t.noRoomsSelectedTitle}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsModalOpen(false);
                                setIsConfirmStep(false);
                                setShowContactFields(false);
                                setTimeout(() => {
                                  document.getElementById('accommodations-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }, 100);
                              }}
                              className="text-xs text-indigo-700 underline font-black cursor-pointer hover:text-indigo-900"
                            >
                              {t.selectRoomAction}
                            </button>
                          </div>
                        ) : (
                          activeSummary.selectedList.map(item => (
                            <div key={item.quote.key} className="flex justify-between items-start text-zinc-700">
                              <div>
                                <div className="font-bold text-zinc-900">
                                  {item.quantity}x {lang === 'en' ? item.quote.name_en : item.quote.name}
                                </div>
                                <div className="text-[10px] text-zinc-500">
                                  ${item.quote.pricePerNight.toLocaleString()} MXN / {lang === 'en' ? 'night' : 'noche'} × {item.quote.nights} {item.quote.nights === 1 ? (lang === 'en' ? 'night' : 'noche') : (lang === 'en' ? 'nights' : 'noches')}
                                </div>
                              </div>
                              <span className="font-black text-zinc-900 text-sm">
                                ${(item.quote.totalPrice * item.quantity).toLocaleString()} MXN
                              </span>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Número de personas adicionales */}
                      <div className="border-b border-zinc-200/60 pb-2.5 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-bold text-zinc-900">
                              {lang === 'en' ? 'Extra Guests:' : 'Personas adicionales:'} {activeSummary.extraGuests}
                            </div>
                            <div className="text-[10px] text-zinc-500">
                              {activeSummary.extraGuests > 0 ? (
                                lang === 'en'
                                  ? `$500 MXN / night × ${activeSummary.extraGuests} extra guests × ${activeSummary.nights} ${activeSummary.nights === 1 ? 'night' : 'nights'}`
                                  : `$500 MXN / noche × ${activeSummary.extraGuests} pers. adicionales × ${activeSummary.nights} ${activeSummary.nights === 1 ? 'noche' : 'noches'}`
                              ) : (
                                lang === 'en'
                                  ? 'Included in base capacity (no extra charge)'
                                  : 'Incluidas en capacidad base (sin cargo extra)'
                              )}
                            </div>
                          </div>
                          <span className={`font-black text-xs ${activeSummary.extraGuestsFee > 0 ? 'text-amber-800' : 'text-zinc-500'}`}>
                            {activeSummary.extraGuestsFee > 0
                              ? `+$${activeSummary.extraGuestsFee.toLocaleString()} MXN`
                              : '$0 MXN'}
                          </span>
                        </div>

                        {activeSummary.maxAvailableExtras > 0 && (
                          <div className="bg-amber-50 border border-amber-200/70 p-2 rounded-xl text-[10.5px] font-semibold text-amber-900 flex items-start gap-1.5 leading-snug">
                            <AlertCircle size={13} className="text-amber-600 shrink-0 mt-0.5" />
                            <span>
                              {lang === 'en'
                                ? 'Note: We do not have extra beds. The living room sofa does NOT have air conditioning.'
                                : 'Nota: No contamos con camas adicionales, sillón de la sala NO cuenta con aire acondicionado.'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Subtotales */}
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex justify-between text-zinc-600 font-semibold text-xs">
                          <div>
                            <span>{lang === 'en' ? 'Lodging Subtotal:' : 'Subtotal habitaciones:'}</span>
                            <span className="text-[9.5px] text-zinc-400 block font-normal">
                              {lang === 'en' ? '(Includes 16% VAT + 3% ISH)' : '(Incluye 16% IVA + 3% ISH)'}
                            </span>
                          </div>
                          <span className="font-bold text-zinc-900">${activeSummary.baseLodgingTotal.toLocaleString()} MXN</span>
                        </div>
                        {activeSummary.extraGuestsFee > 0 && (
                          <div className="flex justify-between text-amber-900 font-semibold text-xs">
                            <span>{lang === 'en' ? 'Extra Guests Surcharge:' : 'Suplemento personas adicionales:'}</span>
                            <span className="font-bold">+${activeSummary.extraGuestsFee.toLocaleString()} MXN</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Aviso de sobrecapacidad dentro del modal (si el motivo es que se ocuparon habitaciones, ya lo explica el aviso de disponibilidad) */}
            {isOverCapacity && lostRooms.length === 0 && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3.5 py-2.5 rounded-2xl text-xs font-bold flex items-start gap-2.5 shadow-xs">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="leading-snug">
                  {lang === 'en'
                    ? (totalGuests > activeSummary.totalMaxCapacity
                        ? `You have selected ${totalGuests} guests, but the maximum occupancy of your selected accommodations is ${activeSummary.totalMaxCapacity}.`
                        : `You have selected ${totalGuests} guests, but your selected accommodations and extras only cover ${coveredCapacity} guests.`)
                    : (totalGuests > activeSummary.totalMaxCapacity
                        ? `Ha seleccionado ${totalGuests} huéspedes pero la ocupación máxima de las habitaciones que ha seleccionado es ${activeSummary.totalMaxCapacity}.`
                        : `Ha seleccionado ${totalGuests} huéspedes pero su selección de habitaciones y adicionales solo cubre ${coveredCapacity} personas.`)}
                </p>
              </div>
            )}

            {/* Formulario de contacto con exigencia de Nombre Completo */}
            <form onSubmit={handleConfirmBooking} noValidate className="space-y-4">
              {/* Campos de contacto: se muestran al pulsar RESERVA YA */}
              <div id="contact-fields" className={showContactFields ? 'space-y-4' : 'hidden'}>
              <div className="p-3.5 bg-indigo-50/50 border-2 border-indigo-200 rounded-2xl space-y-1.5">
                <label className="text-[12px] font-black text-zinc-900 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-indigo-600" />
                    {lang === 'en' ? 'First name' : 'Nombre'} *
                  </span>
                  <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">{lang === 'en' ? 'Required' : 'Obligatorio'}</span>
                </label>
                <p className="text-[11px] text-zinc-600">
                  {lang === 'en'
                    ? 'Enter your name and last names as they appear on your official ID.'
                    : 'Ingresa tu nombre y apellidos tal como aparecen en tu identificación oficial.'}
                </p>
                <input
                  type="text"
                  required
                  autoFocus
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder={lang === 'en' ? 'e.g. John Charles' : 'Ej. Juan Carlos'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-xs font-bold text-zinc-900 bg-white outline-none transition-all shadow-xs"
                />
                <label className="text-[12px] font-black text-zinc-900 block pt-1">
                  {lang === 'en' ? 'Last names' : 'Apellidos'} *
                </label>
                <input
                  type="text"
                  required
                  value={guestLastName}
                  onChange={e => setGuestLastName(e.target.value)}
                  placeholder={lang === 'en' ? 'e.g. Smith Brown' : 'Ej. Pérez Morales'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-xs font-bold text-zinc-900 bg-white outline-none transition-all shadow-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-500 block mb-1">
                  {t.phone} *
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
                  <input
                    type="tel"
                    required
                    value={guestPhone}
                    onChange={e => setGuestPhone(e.target.value)}
                    placeholder="Ej. +52 958 123 4567"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-900 bg-zinc-50 focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-500 block mb-1">
                  {t.email}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={e => setGuestEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-900 bg-zinc-50 focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-500 block mb-1">
                  Comentarios adicionales
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={t.notesPlaceholder}
                  className="w-full p-2.5 rounded-xl border border-zinc-200 text-xs text-zinc-900 bg-zinc-50 focus:bg-white focus:border-indigo-600 outline-none"
                />
              </div>
              </div>

              {submitError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {activeSummary.totalRooms === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsConfirmStep(false);
                    setShowContactFields(false);
                    setTimeout(() => {
                      document.getElementById('accommodations-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                  }}
                  className="w-full py-4 rounded-2xl bg-linear-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-black text-sm tracking-wide shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <ArrowLeft size={16} />
                  <span>{t.chooseAvailableBtn}</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={quoteSending || isOverCapacity || isInvalidDateRange || stayNights <= 0 || activeSummary.totalRooms === 0}
                    onClick={handleRequestQuote}
                    className="w-full py-3.5 rounded-2xl border-2 border-indigo-600 bg-indigo-600 hover:bg-indigo-700 disabled:border-zinc-300 disabled:bg-zinc-300 disabled:text-zinc-500 text-white font-black text-sm tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {quoteSending ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>{t.quoteSending}</span>
                      </>
                    ) : (
                      <>
                        <MessageCircle size={16} />
                        <span>{lang === 'en' ? 'Quote without holding' : 'Cotizar sin bloquear'}</span>
                      </>
                    )}
                  </button>

                  {!showContactFields ? (
                    <button
                      type="button"
                      disabled={isOverCapacity || isInvalidDateRange || stayNights <= 0 || activeSummary.totalRooms === 0}
                      onClick={() => {
                        setShowContactFields(true);
                        setTimeout(() => document.getElementById('contact-fields')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                      }}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:bg-zinc-300 text-white font-black text-sm tracking-wide shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles size={16} className="text-emerald-200" />
                      <span>{t.directLockBtn.replace(/\s*→\s*$/, '')}</span>
                      <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={submitting || !guestName.trim() || !guestLastName.trim() || isOverCapacity || isInvalidDateRange || stayNights <= 0 || activeSummary.totalRooms === 0}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:bg-zinc-300 text-white font-black text-sm tracking-wide shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Bloqueando en el sistema...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} className="text-emerald-200" />
                          <span>{t.confirmLockBtn}</span>
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  )}
                </>
              )}

              {/* Aviso de confirmación o garantía colocado abajo de los botones de reserva */}
              {isConfirmStep ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-emerald-950 font-medium">
                  <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="leading-snug">{t.confirmPendingQuoteDesc}</p>
                </div>
              ) : (
                <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-indigo-950 font-medium">
                  <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <p className="leading-snug">{t.guaranteeDesc}</p>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ── TOAST NOTIFICACIÓN NO INTRUSIVA DE COTIZACIÓN ENVIADA ── */}
      {quoteSentToast && (
        <div className="fixed top-4 inset-x-4 z-50 max-w-md mx-auto bg-emerald-700 text-white p-3.5 rounded-2xl shadow-2xl border border-emerald-500/40 flex items-center justify-between gap-3 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-black text-xs shrink-0">✓</span>
            <div>
              <p className="text-xs font-black">{lang === 'en' ? 'Quote sent to your WhatsApp!' : '¡Cotización enviada a tu WhatsApp!'}</p>
              <p className="text-[11px] text-emerald-100 font-medium">
                {lang === 'en' ? 'Check your chat, or enter your name below to lock for 24 hours.' : 'Revisa tu chat, o ingresa tu nombre abajo para bloquear 24 horas.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setQuoteSentToast(false)}
            className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white shrink-0 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── MODAL: PEDIR NÚMERO DE TELÉFONO SI NO VIENE EN LA URL ── */}
      {isPhoneModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <h3 className="text-sm font-black text-zinc-900">
                {t.phoneModalTitle}
              </h3>
              <button
                onClick={() => setIsPhoneModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed">
              {t.phoneModalDesc}
            </p>

            <div>
              <div className="relative">
                <Phone className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
                <input
                  type="tel"
                  autoFocus
                  value={guestPhone}
                  onChange={e => setGuestPhone(e.target.value)}
                  placeholder="Ej. +52 958 123 4567"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-900 bg-zinc-50 focus:bg-white focus:border-indigo-600 outline-none"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={!guestPhone.trim() || quoteSending || isInvalidDateRange || stayNights <= 0}
              onClick={() => {
                setIsPhoneModalOpen(false);
                handleRequestQuote();
              }}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-300 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {quoteSending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              <span>{t.sendQuoteBtn}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReservarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    }>
      <ReservarContent />
    </Suspense>
  );
}
