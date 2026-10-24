'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
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
  MessageCircle
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

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

function ReservarContent() {
  const searchParams = useSearchParams();
  const phoneParam = searchParams.get('phone') || searchParams.get('p') || '';
  const langParam = searchParams.get('lang') || 'es';
  const stepParam = searchParams.get('step') || searchParams.get('action') || '';

  const [lang, setLang] = useState<'es' | 'en'>(langParam === 'en' ? 'en' : 'es');

  // Fechas por defecto: mañana a 1 día después (1 noche por defecto)
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const defaultCheckIn = useMemo(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'), []);
  const defaultCheckOut = useMemo(() => format(addDays(new Date(), 2), 'yyyy-MM-dd'), []);

  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);

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
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [existingReservations, setExistingReservations] = useState<ExistingBooking[]>([]);
  const [activeTab, setActiveTab] = useState<'booking' | 'existing'>('booking');

  // Selección de habitaciones: { [categoryKey]: quantity }
  const [selectedRooms, setSelectedRooms] = useState<Record<string, number>>({});

  // Fotos activas por categoría para los carruseles
  const [activePhotoIdx, setActivePhotoIdx] = useState<Record<string, number>>({});

  // Modal de reserva y estado de confirmación
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState(phoneParam);
  const [guestEmail, setGuestEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ── Flujo de Cotización y Confirmación de 2 Pasos con WhatsApp ──
  const [pendingQuote, setPendingQuote] = useState<any | null>(null);
  const [hasRestoredPendingQuote, setHasRestoredPendingQuote] = useState(false);
  const [isConfirmStep, setIsConfirmStep] = useState(false);
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
          requestQuoteBtn: 'Send Quote',
          quoteSending: 'Sending to your WhatsApp...',
          completeNameBtn: 'Enter Full Name & Confirm',
          summaryTitle: 'Booking Summary',
          confirmPendingQuoteTitle: 'Official Booking Confirmation',
          confirmPendingQuoteBadge: 'Step 2: Official Confirmation',
          confirmPendingQuoteDesc: 'We received your WhatsApp quote. To formalize the 24-hour hold in our system, we need your full name.',
          guestDetailsTitle: 'Guest Details',
          fullName: 'Full Name',
          phone: 'WhatsApp Phone',
          email: 'Email (Optional)',
          notesPlaceholder: 'Any special arrival requests or comments...',
          guaranteeTitle: '24-Hour Hold Guarantee',
          guaranteeDesc: 'Your accommodations will be locked immediately for 24 hours. You will receive WhatsApp instructions with banking details to complete your 50% deposit.',
          confirmLockBtn: 'Confirm & Lock for 24h',
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
          sendQuoteBtn: 'Send Quote to WhatsApp'
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
          requestQuoteBtn: 'Enviar cotización',
          quoteSending: 'Enviando a tu WhatsApp...',
          completeNameBtn: 'Ingresar Nombre y Confirmar',
          summaryTitle: 'Resumen de tu Solicitud',
          confirmPendingQuoteTitle: 'Confirmar Reserva Oficial',
          confirmPendingQuoteBadge: 'Paso 2: Confirmación Oficial',
          confirmPendingQuoteDesc: 'Recibimos tu cotización por WhatsApp. Para formalizar el bloqueo en nuestro sistema por 24 horas, necesitamos tu nombre completo.',
          guestDetailsTitle: 'Datos del Titular',
          fullName: 'Nombre y Apellidos completos',
          phone: 'Teléfono WhatsApp',
          email: 'Correo electrónico (Opcional)',
          notesPlaceholder: 'Petición especial o comentarios para tu llegada...',
          guaranteeTitle: 'Garantía de Bloqueo por 24 Horas',
          guaranteeDesc: 'Tus alojamientos quedarán bloqueados de inmediato en nuestro calendario por 24 horas. Recibirás por WhatsApp los datos bancarios para transferir el 50% de anticipo.',
          confirmLockBtn: 'Confirmar y Bloquear 24h',
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
          sendQuoteBtn: 'Enviar Cotización a mi WhatsApp'
        };
  }, [lang]);

  // Consultar cotización y reservas existentes
  const fetchQuotes = async () => {
    if (!checkIn || !checkOut || checkIn >= checkOut) {
      setQuotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const url = `/api/public/cotizar?checkIn=${checkIn}&checkOut=${checkOut}&phone=${encodeURIComponent(phoneParam)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setQuotes(data.quotes || []);
        if (data.existingReservations && data.existingReservations.length > 0) {
          setExistingReservations(data.existingReservations);
        }

        // Solo restaurar la cotización si el usuario viene EXPLÍCITAMENTE de pulsar "Confirmar Reserva" (&step=confirm)
        const isConfirmStepRequested = stepParam === 'confirm';

        if (isConfirmStepRequested && data.pendingQuote && data.pendingQuote.status === 'pending_name') {
          setPendingQuote(data.pendingQuote);
          if (!hasRestoredPendingQuote) {
            setHasRestoredPendingQuote(true);
            if (data.pendingQuote.checkIn) setCheckIn(data.pendingQuote.checkIn);
            if (data.pendingQuote.checkOut) setCheckOut(data.pendingQuote.checkOut);
            if (data.pendingQuote.adults) setAdults(Number(data.pendingQuote.adults));
            if (data.pendingQuote.children) setChildren(Number(data.pendingQuote.children));
            if (Array.isArray(data.pendingQuote.rooms)) {
              const restoredRooms: Record<string, number> = {};
              data.pendingQuote.rooms.forEach((r: any) => {
                if (r.key && r.quantity) restoredRooms[r.key] = Number(r.quantity);
              });
              setSelectedRooms(restoredRooms);
            }
            if (data.pendingQuote.phone) {
              setGuestPhone(data.pendingQuote.phone);
            }
            // "se abrirá una ventana que les exigirá pedir el nombre completo"
            setIsConfirmStep(true);
            setIsModalOpen(true);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching quotes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, [checkIn, checkOut, phoneParam]);

  // Manejo de contadores + / - para habitaciones
  const handleUpdateQuantity = (key: string, delta: number, maxAvailable: number) => {
    setSelectedRooms(prev => {
      const current = prev[key] || 0;
      const next = Math.max(0, Math.min(maxAvailable, current + delta));
      return { ...prev, [key]: next };
    });
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
    const selectedList: { quote: QuoteItem; quantity: number }[] = [];

    quotes.forEach(q => {
      const qty = selectedRooms[q.key] || 0;
      if (qty > 0) {
        totalRooms += qty;
        baseLodgingTotal += q.totalPrice * qty;
        totalBaseCapacity += (q.capacity || 2) * qty;
        totalMaxCapacity += (q.maxCapacity || q.capacity || 2) * qty;
        selectedList.push({ quote: q, quantity: qty });
      }
    });

    const nights = quotes[0]?.nights || selectedList[0]?.quote?.nights || stayNights;
    const extraGuests = totalGuests > totalBaseCapacity
      ? Math.min(totalGuests - totalBaseCapacity, Math.max(0, totalMaxCapacity - totalBaseCapacity))
      : 0;
    const extraGuestsFee = extraGuests * 500 * nights;
    const grandTotal = baseLodgingTotal + extraGuestsFee;
    const deposit = Math.round(grandTotal * 0.5);
    const balanceRemaining = grandTotal - deposit;

    return {
      totalRooms,
      nights,
      baseLodgingTotal,
      extraGuests,
      extraGuestsFee,
      grandTotal,
      deposit,
      balanceRemaining,
      totalBaseCapacity,
      totalMaxCapacity,
      selectedList
    };
  }, [quotes, selectedRooms, totalGuests, stayNights]);

  // Resumen activo que respalda pendingQuote si fue restaurado antes de que carguen las cotizaciones
  const activeSummary = useMemo(() => {
    if (selectionSummary.totalRooms > 0) {
      return selectionSummary;
    }
    if (pendingQuote && Array.isArray(pendingQuote.rooms) && pendingQuote.rooms.length > 0) {
      let totalRooms = 0;
      let baseLodgingTotal = 0;
      let totalBaseCapacity = 0;
      let totalMaxCapacity = 0;
      const selectedList: { quote: QuoteItem; quantity: number }[] = [];
      const nights = Number(pendingQuote.nights || stayNights);

      pendingQuote.rooms.forEach((r: any) => {
        const qty = Number(r.quantity || 1);
        totalRooms += qty;
        const matchingCat = quotes.find(q => q.key === r.key);
        const baseCap = matchingCat?.capacity || (r.key === 'doble' ? 2 : r.key === '1rec' ? 4 : r.key === '2rec' ? 6 : r.key === '3rec' ? 10 : 12);
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

      const extraGuests = totalGuests > totalBaseCapacity
        ? Math.min(totalGuests - totalBaseCapacity, Math.max(0, totalMaxCapacity - totalBaseCapacity))
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
  }, [selectionSummary, pendingQuote, quotes, totalGuests, stayNights]);

  const isOverCapacity = activeSummary.totalRooms > 0 && totalGuests > activeSummary.totalMaxCapacity;

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
        ? `You have selected ${totalGuests} guests, but the maximum occupancy of your selected accommodations is ${activeSummary.totalMaxCapacity}.`
        : `Ha seleccionado ${totalGuests} huéspedes pero la ocupación máxima de las habitaciones que ha seleccionado es ${activeSummary.totalMaxCapacity}.`);
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
    if (isOverCapacity) {
      setSubmitError(lang === 'en'
        ? `You have selected ${totalGuests} guests, but the maximum occupancy of your selected accommodations is ${activeSummary.totalMaxCapacity}.`
        : `Ha seleccionado ${totalGuests} huéspedes pero la ocupación máxima de las habitaciones que ha seleccionado es ${activeSummary.totalMaxCapacity}.`);
      return;
    }
    if (!guestName.trim()) {
      setSubmitError(lang === 'en' ? 'Please enter your full name.' : 'Por favor ingresa tu nombre completo.');
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
          guestName: guestName.trim(),
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

      setBookingSuccess(data);
      setIsModalOpen(false);
      setIsConfirmStep(false);
      setPendingQuote(null);
    } catch (err: any) {
      console.error("Error submitting booking:", err);
      setSubmitError(err.message || 'Error al procesar la reserva. Por favor intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans antialiased pb-32">
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
                <span className="font-bold text-zinc-900">{bookingSuccess.checkIn}</span>
              </div>
              <div className="flex justify-between items-center text-xs border-b border-zinc-100 pb-2">
                <span className="text-zinc-500">{t.checkOutLabel}:</span>
                <span className="font-bold text-zinc-900">{bookingSuccess.checkOut}</span>
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

            {/* Datos Bancarios para transferencia */}
            <div className="bg-white rounded-2xl p-5 border border-zinc-200/70 shadow-xs space-y-2.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">
                {t.bankTransferTitle}
              </h3>
              <p className="text-xs font-bold text-zinc-800">{t.bankName}</p>
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-sm font-black text-zinc-900 flex justify-between items-center">
                <span>012610015523498762</span>
                <span className="text-[10px] text-zinc-400 font-sans uppercase">CLABE Interbancaria</span>
              </div>
              <p className="text-xs text-zinc-600">{t.bankAccountHolder}</p>
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
                  <span>📅 {res.check_in} al {res.check_out}</span>
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
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">
                  {t.availableRooms}
                </h3>
                {stayNights > 0 && (
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                    {stayNights} {stayNights === 1 ? t.night : t.nights}
                  </span>
                )}
              </div>

              {loading ? (
                <div className="bg-white rounded-3xl p-12 border border-zinc-200/80 text-center space-y-3">
                  <Loader2 className="w-7 h-7 text-indigo-600 animate-spin mx-auto" />
                  <p className="text-xs text-zinc-500 font-medium">{t.searching}</p>
                </div>
              ) : quotes.length === 0 ? (
                <div className="bg-white rounded-3xl p-8 border border-zinc-200/80 text-center text-xs text-zinc-500">
                  {t.soldOut}
                </div>
              ) : (
                quotes.map(q => {
                  const qtySelected = selectedRooms[q.key] || 0;
                  const activeImgIdx = activePhotoIdx[q.key] || 0;
                  const currentPhoto = q.photos[activeImgIdx] || q.photos[0] || '/images/general/1.jpg';

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
                              Total: ${q.totalPrice.toLocaleString()} MXN ({q.nights} {q.nights === 1 ? t.night : t.nights})
                            </span>
                            <span className="text-[10px] font-semibold text-emerald-700 block mt-0.5">
                              ✓ {lang === 'en' ? 'Taxes included (16% VAT + 3% ISH)' : 'Impuestos incluidos (16% IVA + 3% ISH)'}
                            </span>
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
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── BARRA FLOTANTE STICKY INFERIOR (CARRITO DE RESERVA) ── */}
      {activeSummary.totalRooms > 0 && !bookingSuccess && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-zinc-200/80 p-4 shadow-xl animate-in slide-in-from-bottom-5">
          <div className="max-w-xl mx-auto space-y-2.5">
            {/* Mensaje de error de sobrecapacidad */}
            {isOverCapacity && (
              <div className="bg-rose-50 border border-rose-200/90 text-rose-800 px-3.5 py-2.5 rounded-2xl text-xs font-bold flex items-start gap-2.5 shadow-xs animate-in fade-in slide-in-from-bottom-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="leading-snug">
                  {lang === 'en'
                    ? `You have selected ${totalGuests} guests, but the maximum occupancy of your selected accommodations is ${activeSummary.totalMaxCapacity}.`
                    : `Ha seleccionado ${totalGuests} huéspedes pero la ocupación máxima de las habitaciones que ha seleccionado es ${activeSummary.totalMaxCapacity}.`}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-500">
                  <BedDouble size={14} className={isOverCapacity ? "text-rose-600" : "text-indigo-600"} />
                  <span>
                    {activeSummary.totalRooms} {t.selectedRoomsCount} (máx. {activeSummary.totalMaxCapacity} pers.)
                  </span>
                </div>
                <div className="text-base font-black text-zinc-900">
                  ${activeSummary.grandTotal.toLocaleString()} MXN
                </div>
                <div className="text-[10px] font-bold text-emerald-600">
                  50% Anticipo: ${activeSummary.deposit.toLocaleString()} MXN
                </div>
              </div>

              <button
                type="button"
                disabled={quoteSending || isOverCapacity || isInvalidDateRange || stayNights <= 0}
                onClick={() => {
                  if (isOverCapacity || isInvalidDateRange || stayNights <= 0) return;
                  if (isConfirmStep) {
                    setIsModalOpen(true);
                  } else {
                    handleRequestQuote();
                  }
                }}
                className={`py-3.5 px-6 rounded-2xl text-white font-extrabold text-xs shadow-md transition-all flex items-center gap-2 ${
                  isOverCapacity || isInvalidDateRange || stayNights <= 0
                    ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed shadow-none'
                    : isConfirmStep
                    ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer active:scale-95'
                    : 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer active:scale-95'
                }`}
              >
                {quoteSending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>{t.quoteSending}</span>
                  </>
                ) : isConfirmStep ? (
                  <>
                    <span>{t.completeNameBtn}</span>
                    <ArrowRight size={14} />
                  </>
                ) : (
                  <>
                    <MessageCircle size={14} className="stroke-[2.5]" />
                    <span>{t.requestQuoteBtn}</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>

            {/* Opción abajo de enviar cotización para ingresar nombre y bloquear directamente en el sistema */}
            <div className="pt-2 border-t border-zinc-100 flex items-center justify-center">
              <button
                type="button"
                disabled={isOverCapacity}
                onClick={() => {
                  if (isOverCapacity) return;
                  setIsConfirmStep(true);
                  setIsModalOpen(true);
                }}
                className="w-full py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
              >
                <User size={13} className="text-emerald-700 shrink-0" />
                <span>
                  {lang === 'en'
                    ? 'Or enter full name & lock in our system (24h) →'
                    : 'O ingresar nombre y bloquear 24 horas en nuestro sistema →'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL / BOTTOM SHEET DE CONFIRMACIÓN Y CONTACTO (DEMANDA NOMBRE COMPLETO) ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
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
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Aviso de confirmación o garantía */}
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

            {/* Resumen detallado de la cotización con desglose completo */}
            <div className="bg-zinc-50 rounded-2xl p-4 space-y-3 border border-zinc-200/80 text-xs shadow-xs">
              {/* Fechas y noches */}
              <div className="flex justify-between items-center font-bold text-zinc-700 border-b border-zinc-200/60 pb-2">
                <span className="text-zinc-500 font-semibold">{lang === 'en' ? 'Dates:' : 'Fechas:'}</span>
                <span className="text-zinc-900 font-extrabold">{checkIn} al {checkOut} ({activeSummary.nights} {activeSummary.nights === 1 ? (lang === 'en' ? 'night' : 'noche') : (lang === 'en' ? 'nights' : 'noches')})</span>
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
                {activeSummary.selectedList.map(item => (
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
                ))}
              </div>

              {/* Número de personas adicionales con costo desglosado */}
              <div className="flex justify-between items-start border-b border-zinc-200/60 pb-2.5">
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

              {/* Totales específicos para evitar dudas */}
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
                <div className="flex justify-between font-black text-sm text-zinc-900 pt-1.5 border-t border-zinc-200">
                  <div>
                    <span>{lang === 'en' ? 'Total for Stay:' : 'Total de la estancia:'}</span>
                    <span className="text-[9.5px] text-emerald-700 block font-semibold">
                      {lang === 'en' ? 'All taxes included' : 'Impuestos totales incluidos'}
                    </span>
                  </div>
                  <span className="text-base text-indigo-900 font-black">${activeSummary.grandTotal.toLocaleString()} MXN</span>
                </div>
                <div className="flex justify-between font-black text-xs text-emerald-800 bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200/80">
                  <span>{lang === 'en' ? '50% Required Deposit to Lock:' : 'Anticipo requerido para bloquear (50%):'}</span>
                  <span className="text-sm font-black">${activeSummary.deposit.toLocaleString()} MXN</span>
                </div>
                <div className="flex justify-between text-[11px] font-bold text-zinc-500 px-1 pt-0.5">
                  <span>{lang === 'en' ? 'Remaining Balance at Check-in (50%):' : 'Saldo restante a liquidar al check-in (50%):'}</span>
                  <span>${activeSummary.balanceRemaining.toLocaleString()} MXN</span>
                </div>
              </div>
            </div>

            {/* Aviso de sobrecapacidad dentro del modal */}
            {isOverCapacity && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3.5 py-2.5 rounded-2xl text-xs font-bold flex items-start gap-2.5 shadow-xs">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="leading-snug">
                  {lang === 'en'
                    ? `You have selected ${totalGuests} guests, but the maximum occupancy of your selected accommodations is ${activeSummary.totalMaxCapacity}.`
                    : `Ha seleccionado ${totalGuests} huéspedes pero la ocupación máxima de las habitaciones que ha seleccionado es ${activeSummary.totalMaxCapacity}.`}
                </p>
              </div>
            )}

            {/* Formulario de contacto con exigencia de Nombre Completo */}
            <form onSubmit={handleConfirmBooking} className="space-y-4">
              <div className="p-3.5 bg-indigo-50/50 border-2 border-indigo-200 rounded-2xl space-y-1.5">
                <label className="text-[12px] font-black text-zinc-900 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-indigo-600" />
                    {t.fullName} *
                  </span>
                  <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Obligatorio</span>
                </label>
                <p className="text-[11px] text-zinc-600">
                  Ingresa tu nombre y apellidos tal como aparecen en tu identificación oficial.
                </p>
                <input
                  type="text"
                  required
                  autoFocus
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="Ej. Juan Carlos Pérez Morales"
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

              {submitError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !guestName.trim() || isOverCapacity || isInvalidDateRange || stayNights <= 0}
                className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-300 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Bloqueando en el sistema...</span>
                  </>
                ) : (
                  <>
                    <span>{t.confirmLockBtn}</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
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
