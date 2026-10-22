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
  AlertCircle
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
  description: string;
  description_en: string;
  features: string[];
  features_en: string[];
  photos: string[];
  totalUnits: number;
  availableUnitsCount: number;
  isAvailable: boolean;
  nights: number;
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

  const [lang, setLang] = useState<'es' | 'en'>(langParam === 'en' ? 'en' : 'es');

  // Fechas por defecto: mañana a 3 días después
  const defaultCheckIn = useMemo(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'), []);
  const defaultCheckOut = useMemo(() => format(addDays(new Date(), 4), 'yyyy-MM-dd'), []);

  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
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
          checkInLabel: 'Check-in',
          checkOutLabel: 'Check-out',
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
          continueBtn: 'Continue to Lock Booking',
          summaryTitle: 'Booking Summary',
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
          viewPortalLink: 'View Guest Portal'
        }
      : {
          portalTitle: 'Portal Oficial de Reservas',
          hotelName: 'Condominios Jaroje',
          hotelSubtitle: 'Santa Cruz Huatulco, Oaxaca',
          myStayTab: 'Mi Estancia Actual',
          bookNewTab: 'Cotizar y Reservar',
          datesTitle: 'Fechas y Huéspedes',
          checkInLabel: 'Entrada',
          checkOutLabel: 'Salida',
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
          summaryTitle: 'Resumen de tu Solicitud',
          guestDetailsTitle: 'Datos del Titular',
          fullName: 'Nombre completo',
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
          viewPortalLink: 'Ver Portal del Huésped'
        };
  }, [lang]);

  // Consultar cotización y reservas existentes
  const fetchQuotes = async () => {
    setLoading(true);
    try {
      const url = `/api/public/cotizar?checkIn=${checkIn}&checkOut=${checkOut}&phone=${encodeURIComponent(phoneParam)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setQuotes(data.quotes || []);
        if (data.existingReservations && data.existingReservations.length > 0) {
          setExistingReservations(data.existingReservations);
          // Si el usuario llega por primera vez con reservas existentes, podemos mostrar pestaña
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

  // Cálculo del total seleccionado
  const selectionSummary = useMemo(() => {
    let totalRooms = 0;
    let grandTotal = 0;
    const selectedList: { quote: QuoteItem; quantity: number }[] = [];

    quotes.forEach(q => {
      const qty = selectedRooms[q.key] || 0;
      if (qty > 0) {
        totalRooms += qty;
        grandTotal += q.totalPrice * qty;
        selectedList.push({ quote: q, quantity: qty });
      }
    });

    const deposit = Math.round(grandTotal * 0.5);

    return {
      totalRooms,
      grandTotal,
      deposit,
      selectedList
    };
  }, [quotes, selectedRooms]);

  // Enviar confirmación y bloqueo a Beds24
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const payloadRooms = selectionSummary.selectedList.map(item => ({
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
          notes: notes.trim()
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al procesar la reservación');
      }

      setBookingSuccess(data);
      setIsModalOpen(false);
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

            {/* Botón directo al Portal del Huésped */}
            <a
              href={bookingSuccess.portalUrl}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{t.goToPortal}</span>
              <ArrowRight size={16} />
            </a>
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
              <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <h2 className="text-xs font-black uppercase tracking-widest text-zinc-900">
                  {t.datesTitle}
                </h2>
              </div>

              {/* Rango de fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">
                    {t.checkInLabel}
                  </label>
                  <input
                    type="date"
                    value={checkIn}
                    onChange={e => setCheckIn(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-900 bg-zinc-50 focus:bg-white focus:border-indigo-600 outline-none transition-all cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 block mb-1">
                    {t.checkOutLabel}
                  </label>
                  <input
                    type="date"
                    value={checkOut}
                    onChange={e => setCheckOut(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-900 bg-zinc-50 focus:bg-white focus:border-indigo-600 outline-none transition-all cursor-pointer"
                  />
                </div>
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
                      className="w-7 h-7 rounded-lg bg-white border border-zinc-200 flex items-center justify-center font-black text-xs hover:bg-zinc-100 cursor-pointer"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="text-xs font-black text-zinc-900">{adults}</span>
                    <button
                      type="button"
                      onClick={() => setAdults(a => Math.min(20, a + 1))}
                      className="w-7 h-7 rounded-lg bg-white border border-zinc-200 flex items-center justify-center font-black text-xs hover:bg-zinc-100 cursor-pointer"
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
                      className="w-7 h-7 rounded-lg bg-white border border-zinc-200 flex items-center justify-center font-black text-xs hover:bg-zinc-100 cursor-pointer"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="text-xs font-black text-zinc-900">{children}</span>
                    <button
                      type="button"
                      onClick={() => setChildren(c => Math.min(10, c + 1))}
                      className="w-7 h-7 rounded-lg bg-white border border-zinc-200 flex items-center justify-center font-black text-xs hover:bg-zinc-100 cursor-pointer"
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
                {quotes.length > 0 && (
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                    {quotes[0].nights} {quotes[0].nights === 1 ? t.night : t.nights}
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

                        {/* Badge de capacidad */}
                        <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-black text-zinc-900 flex items-center gap-1 shadow-sm">
                          <Users size={12} className="text-indigo-600" />
                          <span>{t.maxGuests} {q.capacity} {t.guests}</span>
                        </div>

                        {/* Badge de disponibilidad */}
                        <div className="absolute top-3 right-3">
                          {q.availableUnitsCount > 0 ? (
                            <span className="bg-emerald-500/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-xs">
                              {q.availableUnitsCount} {t.availableUnits}
                            </span>
                          ) : (
                            <span className="bg-rose-500/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-xs">
                              Agotado
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Detalles y precios */}
                      <div className="p-5 space-y-4">
                        <div>
                          <h4 className="text-base font-black text-zinc-900 leading-tight">
                            {lang === 'en' ? q.name_en : q.name}
                          </h4>
                          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                            {lang === 'en' ? q.description_en : q.description}
                          </p>
                        </div>

                        {/* Lista de características */}
                        <div className="grid grid-cols-2 gap-1.5 text-[11px] text-zinc-600 border-t border-zinc-100 pt-3">
                          {(lang === 'en' ? q.features_en : q.features).slice(0, 4).map((f, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <Check size={12} className="text-emerald-600 shrink-0" />
                              <span className="truncate">{f}</span>
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
                            <span className="text-[11px] font-bold text-indigo-600">
                              Total: ${q.totalPrice.toLocaleString()} MXN ({q.nights} {q.nights === 1 ? t.night : t.nights})
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
      {selectionSummary.totalRooms > 0 && !bookingSuccess && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-zinc-200/80 p-4 shadow-xl animate-in slide-in-from-bottom-5">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-500">
                <BedDouble size={14} className="text-indigo-600" />
                <span>
                  {selectionSummary.totalRooms} {t.selectedRoomsCount}
                </span>
              </div>
              <div className="text-base font-black text-zinc-900">
                ${selectionSummary.grandTotal.toLocaleString()} MXN
              </div>
              <div className="text-[10px] font-bold text-emerald-600">
                50% Anticipo: ${selectionSummary.deposit.toLocaleString()} MXN
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <span>{t.continueBtn}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL / BOTTOM SHEET DE CONFIRMACIÓN Y CONTACTO ── */}
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
                <h3 className="text-base font-black text-zinc-900">
                  {t.summaryTitle}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Resumen de selección */}
            <div className="bg-zinc-50 rounded-2xl p-4 space-y-2 border border-zinc-200/60 text-xs">
              <div className="flex justify-between font-bold text-zinc-600">
                <span>Fechas:</span>
                <span className="text-zinc-900">{checkIn} al {checkOut} ({quotes[0]?.nights} noches)</span>
              </div>
              {selectionSummary.selectedList.map(item => (
                <div key={item.quote.key} className="flex justify-between text-zinc-700">
                  <span>{item.quantity}x {lang === 'en' ? item.quote.name_en : item.quote.name}</span>
                  <span className="font-bold text-zinc-900">${(item.quote.totalPrice * item.quantity).toLocaleString()} MXN</span>
                </div>
              ))}
              <div className="border-t border-zinc-200 pt-2 flex justify-between font-black text-sm text-zinc-900">
                <span>Total de la estancia:</span>
                <span>${selectionSummary.grandTotal.toLocaleString()} MXN</span>
              </div>
              <div className="flex justify-between font-black text-xs text-indigo-700">
                <span>Anticipo a pagar (50%):</span>
                <span>${selectionSummary.deposit.toLocaleString()} MXN</span>
              </div>
            </div>

            {/* Aviso de garantía de 24 horas */}
            <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-indigo-950 font-medium">
              <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <p className="leading-snug">{t.guaranteeDesc}</p>
            </div>

            {/* Formulario de contacto */}
            <form onSubmit={handleConfirmBooking} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-zinc-500 block mb-1">
                  {t.fullName} *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-900 bg-zinc-50 focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>
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
                disabled={submitting}
                className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Bloqueando en calendario...</span>
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
