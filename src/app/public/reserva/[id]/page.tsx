'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Calendar,
  User,
  MapPin,
  Copy,
  Check,
  CreditCard,
  FileText,
  Clock,
  HelpCircle,
  Users,
  Compass,
  AlertTriangle,
  Upload,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Home,
  Info,
  MessageSquare,
  Edit,
  LogOut,
  ReceiptText,
  Lock
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

// Mapeo de fichas técnicas por tipo de habitación
const ROOM_FEATURES: Record<string, { title: string; capacity: number; features: string[] }> = {
  '1rec': {
    title: 'Condominio de 1 dormitorio',
    capacity: 4,
    features: [
      'Capacidad máxima 4 personas',
      '1 dormitorio con aire acondicionado y Smart TV',
      '2 camas matrimoniales',
      'WiFi de alta velocidad',
      '1 baño completo con agua caliente',
      'Comedor para 4 personas, cocina equipada y Terraza privada'
    ]
  },
  '2rec': {
    title: 'Condominio de 2 dormitorios',
    capacity: 6,
    features: [
      'Capacidad máxima 6 personas (+2 con costo adicional)',
      '2 dormitorios con aire acondicionado y Smart TV',
      'Dormitorio principal con 2 camas matrimoniales',
      'Dormitorio secundario con 1 cama King Size',
      'WiFi de alta velocidad',
      '1 baño completo con agua caliente',
      'Sala con sofá tipo escuadra y ventilador de techo',
      'Comedor para 6 personas',
      'Cocina totalmente equipada con barra desayunadora',
      'Patio de lavado (no incluye lavadora ni secadora)'
    ]
  },
  '3rec': {
    title: 'Condominio de 3 dormitorios',
    capacity: 10,
    features: [
      'Capacidad máxima 10 personas (+2 con costo adicional)',
      '3 dormitorios con aire acondicionado y Smart TV',
      'Dormitorio principal con 1 cama king size',
      '2 dormitorios secundarios con 2 camas matrimoniales cada uno',
      'WiFi de alta velocidad',
      '2 baños completos con agua caliente',
      'Sala con sofá tipo escuadra y ventilador de techo',
      'Comedor para 10 personas',
      'Cocina totalmente equipada con barra desayunadora',
      'Patio de lavado (no incluye lavadora ni secadora)'
    ]
  },
  'doble': {
    title: 'Habitación Doble',
    capacity: 4,
    features: [
      'Capacidad máxima 4 personas',
      '1 dormitorio con aire acondicionado y Smart TV',
      '2 camas matrimoniales',
      'WiFi de alta velocidad',
      '1 baño completo con agua caliente',
      'Frigobar - Microondas - Cafetera (Sin cocina)'
    ]
  },
  'casa': {
    title: 'Casa de Lujo',
    capacity: 12,
    features: [
      'Capacidad máxima 12 personas (+4 con costo adicional)',
      'PLANTA ALTA: 3 dormitorios con aire acondicionado, baño privado y Smart TV',
      'Dormitorio principal con 2 camas queen, 2 individuales y tina de hidromasaje',
      'Dormitorio 2 con 2 camas queen',
      'Dormitorio 3 con 1 cama king',
      'WiFi de alta velocidad',
      '3 baños completos',
      'Sala de estar',
      'PLANTA BAJA: Comedor para 12 personas',
      'Cocina totalmente equipada con antecomedor para 8 personas',
      'Sala completa',
      'Aire acondicionado en planta baja',
      '1/2 baño planta baja',
      'Patio de lavado (no incluye lavadora ni secadora)'
    ]
  }
};

const COMMON_PHOTOS = [
  "/images/general/1.jpg",
  "/images/general/2.jpg",
  "/images/general/3.jpg",
  "/images/general/4.jpg",
  "/images/general/5.jpg",
  "/images/general/6.jpg",
  "/images/general/7.jpg",
  "/images/general/8.jpg",
  "/images/general/9.jpg",
  "/images/general/10.jpg",
  "/images/general/11.jpg",
  "/images/general/12.jpg",
  "/images/general/13.jpg",
  "/images/general/14.jpg",
  "/images/general/15.jpg",
  "/images/general/16.jpg",
  "/images/general/17.jpg",
  "/images/general/18.jpg",
  "/images/general/19.jpg",
  "/images/general/20.jpg"
];

const ROOM_PHOTOS: Record<string, string[]> = {
  'doble': [
    "/images/doble/1.jpg",
    "/images/doble/2.jpg",
    "/images/doble/3.jpg",
    "/images/doble/4.jpg",
    "/images/doble/5.jpg"
  ],
  '1rec': [
    "/images/1rec/1.jpg",
    "/images/1rec/2.jpg",
    "/images/1rec/3.jpg",
    "/images/1rec/4.jpg",
    "/images/1rec/5.jpg",
    "/images/1rec/6.jpg",
    "/images/1rec/7.jpg"
  ],
  '2rec': [
    "/images/2rec/1.jpg",
    "/images/2rec/2.jpg",
    "/images/2rec/3.jpg",
    "/images/2rec/4.jpg",
    "/images/2rec/5.jpg",
    "/images/2rec/6.jpg",
    "/images/2rec/7.jpg",
    "/images/2rec/8.jpg",
    "/images/2rec/9.jpg",
    "/images/2rec/10.jpg",
    "/images/2rec/11.jpg"
  ],
  '3rec': [
    "/images/3rec/1.jpg",
    "/images/3rec/2.jpg",
    "/images/3rec/3.jpg",
    "/images/3rec/4.jpg",
    "/images/3rec/5.jpg",
    "/images/3rec/6.jpg",
    "/images/3rec/7.jpg",
    "/images/3rec/8.jpg",
    "/images/3rec/9.jpg",
    "/images/3rec/10.jpg",
    "/images/3rec/11.jpg",
    "/images/3rec/12.jpg",
    "/images/3rec/13.jpg",
    "/images/3rec/14.jpg",
    "/images/3rec/15.jpg"
  ],
  'casa': [
    "/images/casa/1.jpg",
    "/images/casa/2.jpg",
    "/images/casa/3.jpg",
    "/images/casa/4.jpg",
    "/images/casa/5.jpg",
    "/images/casa/6.jpg",
    "/images/casa/7.jpg",
    "/images/casa/8.jpg",
    "/images/casa/9.jpg",
    "/images/casa/10.jpg",
    "/images/casa/11.jpg",
    "/images/casa/12.jpg",
    "/images/casa/13.jpg",
    "/images/casa/14.jpg",
    "/images/casa/15.jpg",
    "/images/casa/16.jpg",
    "/images/casa/17.jpg",
    "/images/casa/18.jpg"
  ]
};

const PHOTO_CAPTIONS: Record<string, string[]> = {
  'doble': [
    'Habitación Doble - Cama principal',
    'Habitación Doble - Vista general',
    'Habitación Doble - Baño y detalles',
    'Habitación Doble - Distribución'
  ],
  '1rec': [
    'Condo 1 Recámara - Sala y comedor',
    'Condo 1 Recámara - Recámara principal',
    'Condo 1 Recámara - Cocina equipada',
    'Condo 1 Recámara - Baño completo',
    'Condo 1 Recámara - Terraza privada'
  ],
  '2rec': [
    'Condominio 2 Dormitorios - Estancia principal',
    'Condominio 2 Dormitorios - Recámara principal',
    'Condominio 2 Dormitorios - Segunda recámara',
    'Condominio 2 Dormitorios - Cocina equipada',
    'Condominio 2 Dormitorios - Baño completo',
    'Condominio 2 Dormitorios - Sala de estar',
    'Condominio 2 Dormitorios - Comedor',
    'Condominio 2 Dormitorios - Detalles decoración',
    'Condominio 2 Dormitorios - Distribución interior',
    'Condominio 2 Dormitorios - Balcón'
  ],
  '3rec': [
    'Condominio 3 Dormitorios - Sala y comedor familiar',
    'Condominio 3 Dormitorios - Cocina equipada',
    'Condominio 3 Dormitorios - Recámara principal King',
    'Condominio 3 Dormitorios - Segunda recámara familiar',
    'Condominio 3 Dormitorios - Tercera recámara familiar',
    'Condominio 3 Dormitorios - Baño completo',
    'Condominio 3 Dormitorios - Terraza y vista exterior',
    'Condominio 3 Dormitorios - Distribución recámaras',
    'Condominio 3 Dormitorios - Detalles cocina',
    'Condominio 3 Dormitorios - Segunda recámara'
  ],
  'casa': [
    'Casa de Lujo - Estancia principal familiar',
    'Casa de Lujo - Cocina de granito y antecomedor',
    'Casa de Lujo - Recámara principal King',
    'Casa de Lujo - Segunda recámara familiar',
    'Casa de Lujo - Tercera recámara familiar',
    'Casa de Lujo - Tina de hidromasaje',
    'Casa de Lujo - Balcón y terraza superior',
    'Casa de Lujo - Baño principal',
    'Casa de Lujo - Acceso independiente',
    'Casa de Lujo - Sala TV familiar'
  ]
};

const COMMON_CAPTIONS = [
  'Áreas Comunes - Alberca principal',
  'Áreas Comunes - Patio y jardines',
  'Áreas Comunes - Entrada y recepción'
];

const COMMON_CAPTIONS_EN = [
  'Common Areas - Main pool',
  'Common Areas - Patio & gardens',
  'Common Areas - Entrance & front desk'
];

const ROOM_FEATURES_EN: Record<string, { title: string; capacity: number; features: string[] }> = {
  '1rec': {
    title: '1-Bedroom Condominium',
    capacity: 4,
    features: [
      'Maximum capacity: 4 guests',
      '1 bedroom with A/C and Smart TV',
      '2 double beds',
      'High-speed WiFi',
      '1 full bathroom with hot water',
      'Dining table for 4, equipped kitchen & private terrace'
    ]
  },
  '2rec': {
    title: '2-Bedroom Condominium',
    capacity: 6,
    features: [
      'Maximum capacity: 6 guests (+2 with extra charge)',
      '2 bedrooms with A/C and Smart TV',
      'Master bedroom with 2 double beds',
      'Second bedroom with 1 King Size bed',
      'High-speed WiFi',
      '1 full bathroom with hot water',
      'Living room with L-shaped sofa and ceiling fan',
      'Dining table for 6',
      'Fully equipped kitchen with breakfast bar',
      'Laundry patio (washer/dryer not included)'
    ]
  },
  '3rec': {
    title: '3-Bedroom Condominium',
    capacity: 10,
    features: [
      'Maximum capacity: 10 guests (+2 with extra charge)',
      '3 bedrooms with A/C and Smart TV',
      'Master bedroom with 1 King Size bed',
      '2 secondary bedrooms with 2 double beds each',
      'High-speed WiFi',
      '2 full bathrooms with hot water',
      'Living room with L-shaped sofa and ceiling fan',
      'Dining table for 10',
      'Fully equipped kitchen with breakfast bar',
      'Laundry patio (washer/dryer not included)'
    ]
  },
  'doble': {
    title: 'Double Room',
    capacity: 4,
    features: [
      'Maximum capacity: 4 guests',
      '1 bedroom with A/C and Smart TV',
      '2 double beds',
      'High-speed WiFi',
      '1 full bathroom with hot water',
      'Mini-fridge - Microwave - Coffee maker (No kitchen)'
    ]
  },
  'casa': {
    title: 'Luxury House',
    capacity: 12,
    features: [
      'Maximum capacity: 12 guests (+4 with extra charge)',
      'UPPER FLOOR: 3 bedrooms with A/C, private bathroom & Smart TV',
      'Master bedroom with 2 Queen beds, 2 twin beds & hot tub',
      'Bedroom 2 with 2 Queen beds',
      'Bedroom 3 with 1 King bed',
      'High-speed WiFi',
      '3 full bathrooms',
      'Living area',
      'GROUND FLOOR: Dining table for 12',
      'Fully equipped kitchen with breakfast nook for 8',
      'Full living room',
      'A/C on the ground floor',
      'Half bath on the ground floor',
      'Laundry patio (washer/dryer not included)'
    ]
  }
};

const PHOTO_CAPTIONS_EN: Record<string, string[]> = {
  'doble': [
    'Double Room - Main Bed',
    'Double Room - General View',
    'Double Room - Bathroom and Details',
    'Double Room - Room Layout'
  ],
  '1rec': [
    '1-Bedroom Condo - Living & Dining Area',
    '1-Bedroom Condo - Main Bedroom',
    '1-Bedroom Condo - Equipped Kitchen',
    '1-Bedroom Condo - Full Bathroom',
    '1-Bedroom Condo - Private Terrace'
  ],
  '2rec': [
    '2-Bedroom Condo - Main Living Area',
    '2-Bedroom Condo - Bedroom with double beds',
    '2-Bedroom Condo - Bedroom with King Size bed',
    '2-Bedroom Condo - Equipped Kitchen',
    '2-Bedroom Condo - Full Bathroom',
    '2-Bedroom Condo - Comfortable Living Room',
    '2-Bedroom Condo - Dining Area',
    '2-Bedroom Condo - Decoration Details',
    '2-Bedroom Condo - Interior Distribution',
    '2-Bedroom Condo - Outdoor Balcony'
  ],
  '3rec': [
    '3-Bedroom Condo - Living & Family Dining Area',
    '3-Bedroom Condo - Fully Equipped Kitchen',
    '3-Bedroom Condo - Master Bedroom King',
    '3-Bedroom Condo - Second Family Bedroom',
    '3-Bedroom Condo - Third Family Bedroom',
    '3-Bedroom Condo - Full Bathroom',
    '3-Bedroom Condo - Balcony and Outdoor View',
    '3-Bedroom Condo - Bedroom Layout',
    '3-Bedroom Condo - Kitchen Details',
    '3-Bedroom Condo - Second Bedroom View'
  ],
  'casa': [
    'Luxury House - Main Family Living Room',
    'Luxury House - Granite Kitchen & Dining Room',
    'Luxury House - King Main Bedroom',
    'Luxury House - Second Family Bedroom',
    'Luxury House - Third Family Bedroom',
    'Luxury House - Master Bathroom Hot Tub',
    'Luxury House - Balcony & Upper Terrace',
    'Luxury House - Private Full Bathroom',
    'Luxury House - Independent Entrance',
    'Luxury House - Ground Floor TV Room'
  ]
};

const TRANSLATIONS: Record<'es' | 'en', any> = {
  es: {
    title: 'CONDOMINIOS JAROJE',
    subtitle: 'Tu paraíso en Huatulco, Oaxaca 🌴',
    loading: 'Cargando los detalles de tu reservación...',
    errorTitle: '¡Ups! Algo salió mal',
    errorText: 'La reservación solicitada no existe o ha sido cancelada.',
    whatsappContact: 'Contactar por WhatsApp',

    state_solicitud: 'Solicitud recibida',
    state_pago_pendiente: 'Pago pendiente',
    state_confirmada: 'Reservación confirmada',
    state_checkin_pendiente: 'Check-in pendiente',
    state_hospedado: 'Hospedado',
    state_finalizada: 'Finalizada',

    stateTitle: 'Estado de la Reservación',
    partialPaymentTitle: 'Saldo Pendiente',
    partialPaymentDesc: (deposit: string, balance: string) => `Has cubierto tu anticipo de $${deposit} MXN. Recuerda liquidar el saldo restante de $${balance} MXN antes de tu llegada o en recepción durante tu check-in.`,

    summaryTitle: 'Detalles de tu reservación',
    guest: 'Huésped',
    bookingId: 'ID de Reserva',
    accommodation: 'Alojamiento (El número del departamento se asigna al llegar)',
    unregisteredGuestNote: '($500 MXN por persona adicional · por noche)',
    checkin: 'Fecha de Llegada',
    checkinTime: '(Check-in: 3:00 PM)',
    checkout: 'Fecha de Salida',
    checkoutTime: '(Check-out: 12:00 PM)',
    nights: (n: number) => `${n} noche${n !== 1 ? 's' : ''}`,
    guests: (g: number) => `${g} persona${g !== 1 ? 's' : ''}`,

    accountTitle: 'Resumen de pagos',
    totalEstancia: 'Total de la estancia:',
    anticipoRecibido: 'Anticipo Recibido:',
    saldoRestante: 'Saldo pendiente:',
    anticipoRequerido: 'Anticipo Requerido (50%):',
    anticipoDepositado: 'Anticipo depositado:',

    paymentTitle: 'Formas de Pago',
    paymentTitlePending: 'Liquidar Saldo Pendiente',
    selectAmount: 'Selecciona el monto a abonar:',
    anticipoSelector: 'Anticipo (50%)',
    totalSelector: 'Total (100%)',
    amountSelected: 'Monto a pagar seleccionado',
    optionCard: 'Opción 1: Tarjeta de Crédito / Débito',
    payWithCard: 'Pagar con Tarjeta',
    cardNote: 'Si realizas tu pago con tarjeta, no es necesario enviar comprobante.',
    optionTransfer: 'Opción 2: Transferencia o Depósito Bancario',
    payWithTransfer: 'Pagar por Transferencia Bancaria',
    transferNote: 'Obtén la cuenta CLABE oficial y reporta tu comprobante de inmediato al panel de staySync.',

    featuresTitle: 'Características del Alojamiento',
    capacity: (c: number) => `Capacidad: ${c} Huéspedes`,

    photosTitle: 'Galería de Imágenes',
    photosDesc: 'Visualiza las fotos reales de tu alojamiento y las hermosas áreas comunes de Condominios Jaroje.',
    commonAreas: 'Áreas Comunes',
    bedroomPhotos: 'Fotos del Alojamiento',
    instructionsTitle: 'Instrucciones para tu Llegada',
    howToGet: '¿Cómo llegar?',
    locationLabel: 'Ubicación en Google Maps',
    openMaps: 'Abrir en Google Maps',
    receptionLabel: 'Ubicación de la Recepción',
    checkinRulesTitle: 'Reglas y Horarios de Check-in',
    checkinHoursTitle: 'Horario de Entrada',
    checkinHoursDesc: 'El horario oficial de entrada es de 3:00 PM a 8:00 PM.',
    lastMinuteDesc: 'Si estimas llegar después de las 8:00 PM, avísanos con anticipación.',
    registerTitle: 'Registro y Firma',
    registerDesc: 'Al llegar a recepción, te ayudaremos a firmar digitalmente tu contrato de hospedaje.',

    room_casa: 'Casa Vacacional de 3 Dormitorios',
    room_3rec: 'Condominio de 3 Recámaras',
    room_2rec: 'Condominio de 2 Recámaras',
    room_1rec: 'Condominio de 1 Recámara',
    room_doble: 'Habitación Doble',

    capacityLabel: 'Huéspedes',
    tapToZoom: '🔍 Toca cualquier imagen para abrir en pantalla completa',
    stayGuide: 'Para garantizar una estancia agradable a todos nuestros huéspedes, te pedimos revisar la guía digital de tu alojamiento:',
    stayGuideBtn: 'GUÍA DE ALOJAMIENTO Y FOTOS',
    wifiInfoBtn: 'WiFi, claves e información',
    stayPolicies: '🚫 Políticas Básicas',
    policyPets: 'No se admiten mascotas bajo ningún concepto.',
    policySmoke: 'Espacio 100% libre de humo (solo permitido fumar en áreas exteriores designadas).',
    policyHours: 'El horario de entrada es de 3:00 PM a 8:00 PM. Salida a las 12:00 PM.',
    locationDesc: 'Hotel y Condominios Jaroje\nCalle Mixie, Manzana 3, Lote 4 Sector M, Bahía de Santa Cruz Huatulco\nSanta María Huatulco, Oaxaca, C.P. 70987.',
    talkReception: 'Hablar con nosotros',
    footerRights: '© 2026 Condominios Jaroje. Todos los derechos reservados.',
    footerHelp: '¿Necesitas ayuda? Escríbenos a nuestro WhatsApp oficial: 958 587 8554',
    lightboxOf: 'of',
    lightboxControls: 'Toca a los lados para navegar • Condominios Jaroje',

    // Nuevas traducciones para edición de huéspedes e incidencias
    editGuestsTitle: 'Modificar Huéspedes Registrados',
    adultsLabel: 'Adultos',
    childrenLabel: 'Niños (2-12 años)',
    capacityInfo: (base: number, max: number) => `Capacidad sin costo adicional: ${base} huéspedes. Capacidad máxima: ${max} huéspedes.`,
    extraChargeInfo: 'Cada persona extra tiene un costo adicional de $500 MXN por noche.',
    estimatedTotal: 'Total de la estancia estimado:',
    priceAdjustmentLabel: 'Ajuste por personas adicionales:',
    maxCapacityExceeded: (max: number) => `La cantidad de huéspedes supera la capacidad máxima de la habitación (${max} personas).`,
    atLeastOneAdult: 'Debe haber al menos 1 adulto registrado.',
    confirmChanges: 'Confirmar Cambios',
    saving: 'Guardando...',
    editBtn: 'Editar',
    exitBtn: 'Salir del portal',

    maintenanceBtn: '🛠 Reportar un problema',
    maintenanceTitle: 'Reportar Incidencia de Mantenimiento',
    maintenanceTypeLabel: '¿Dónde está el problema?',
    maintenanceDescPlaceholder: 'Describe detalladamente el problema para poder ayudarte...',
    sendReport: 'Enviar Reporte',
    reportSuccess: '¡Reporte enviado con éxito! El personal de mantenimiento lo revisará de inmediato.',
    dniTitle: 'CHECK-IN DIGITAL (DNI, INE o Pasaporte)',
    dniSubtitle: 'Para completar tu check-in digital y agilizar tu llegada, por favor sube una foto de tu identificación oficial (DNI, INE o Pasaporte).',
    dniUploadButton: 'Sube tu Identificación',
    dniUploading: 'Subiendo identificación...',
    dniSuccess: 'Identificación registrada correctamente ✅',
    dniSuccessDesc: 'Hemos recibido tu identificación. Tu check-in digital está completo.',
    dniError: 'No se pudo subir la identificación. Inténtalo de nuevo.',
    dniChangeButton: 'Cambiar Identificación 🔄',
  },
  en: {
    title: 'CONDOMINIOS JAROJE',
    subtitle: 'Your paradise in Huatulco, Oaxaca 🌴',
    loading: 'Loading your reservation details...',
    errorTitle: 'Oops! Something went wrong',
    errorText: 'The requested reservation does not exist or has been cancelled.',
    whatsappContact: 'Contact on WhatsApp',

    state_solicitud: 'Request received',
    state_pago_pendiente: 'Awaiting Deposit',
    state_confirmada: 'Booking confirmed',
    state_checkin_pendiente: 'Check-in pending',
    state_hospedado: 'In-house',
    state_finalizada: 'Completed',

    stateTitle: 'Reservation Status',
    partialPaymentTitle: 'Balance Due',
    partialPaymentDesc: (deposit: string, balance: string) => `You have paid your deposit of $${deposit} MXN. Please remember to settle the remaining balance of $${balance} MXN before your arrival or at the front desk during check-in.`,

    summaryTitle: 'Your Reservation Details',
    guest: 'Guest',
    bookingId: 'Reservation ID',
    accommodation: 'Accommodation (Apartment number is assigned upon arrival)',
    unregisteredGuestNote: '($500 MXN per extra guest · per night)',
    checkin: 'Arrival Date',
    checkinTime: '(Check-in: 3:00 PM)',
    checkout: 'Departure Date',
    checkoutTime: '(Check-out: 12:00 PM)',
    nights: (n: number) => `${n} night${n !== 1 ? 's' : ''}`,
    guests: (g: number) => `${g} guest${g !== 1 ? 's' : ''}`,

    accountTitle: 'Payment Summary',
    totalEstancia: 'Total stay amount:',
    anticipoRecibido: 'Deposit Received:',
    saldoRestante: 'Balance due:',
    anticipoRequerido: 'Required Deposit (50%):',
    anticipoDepositado: 'Deposit paid:',

    paymentTitle: 'Payment Methods',
    paymentTitlePending: 'Settle Remaining Balance',
    selectAmount: 'Select Payment Amount:',
    anticipoSelector: 'Deposit (50%)',
    totalSelector: 'Total (100%)',
    amountSelected: 'Selected payment amount',
    optionCard: 'Option 1: Credit / Debit Card',
    payWithCard: 'Pay with Card',
    cardNote: 'If you pay with a card, sending a receipt is not required.',
    optionTransfer: 'Option 2: Bank Transfer or Cash Deposit',
    payWithTransfer: 'Pay by Bank Transfer',
    transferNote: 'Obtain the official bank details and upload your receipt directly to staySync.',

    featuresTitle: 'Accommodation Features',
    capacity: (c: number) => `Capacity: ${c} Guests`,

    photosTitle: 'Photo Gallery',
    photosDesc: 'View actual photos of your accommodation and the beautiful common areas of Condominios Jaroje.',
    commonAreas: 'Common Areas',
    bedroomPhotos: 'Accommodation Photos',
    instructionsTitle: 'Arrival Instructions',
    howToGet: 'How to get here?',
    locationLabel: 'Location on Google Maps',
    openMaps: 'Open in Google Maps',
    receptionLabel: 'Front Desk Location',
    checkinRulesTitle: 'Check-in Rules & Times',
    checkinHoursTitle: 'Check-in Time',
    checkinHoursDesc: 'Official entry time is from 3:00 PM to 8:00 PM.',
    lastMinuteDesc: 'If you expect to arrive after 8:00 PM, please notify us in advance.',
    registerTitle: 'Registration & Signing',
    registerDesc: 'Upon arrival at the front desk, we will help you digitally sign your lodging agreement.',

    room_casa: '3-Bedroom Vacation Home',
    room_3rec: '3-Bedroom Condominium',
    room_2rec: '2-Bedroom Condominium',
    room_1rec: '1-Bedroom Condominium',
    room_doble: 'Double Room',

    capacityLabel: 'Guests',
    tapToZoom: '🔍 Tap any image to open in full screen',
    stayGuide: 'To ensure a pleasant stay for all our guests, please review your accommodation digital guide:',
    stayGuideBtn: 'ACCOMMODATION GUIDE AND PHOTOS',
    wifiInfoBtn: 'WiFi, keys & info',
    stayPolicies: '🚫 Basic Policies',
    policyPets: 'No pets allowed under any circumstances.',
    policySmoke: '100% Smoke-free space (only smoking in designated outdoor areas permitted).',
    policyHours: 'Check-in time is from 3:00 PM to 8:00 PM. Check-out is at 12:00 PM.',
    locationDesc: 'Hotel & Condominios Jaroje\nCalle Mixie, Manzana 3, Lote 4 Sector M, Bahía de Santa Cruz Huatulco\nSanta María Huatulco, Oaxaca, C.P. 70987.',
    talkReception: 'Talk with us',
    footerRights: '© 2026 Condominios Jaroje. All rights reserved.',
    footerHelp: 'Need help? Write to our official WhatsApp: +52 958 587 8554',
    lightboxOf: 'of',
    lightboxControls: 'Tap the sides to navigate • Condominios Jaroje',

    // New translations for guest modification and maintenance incidents
    editGuestsTitle: 'Modify Registered Guests',
    adultsLabel: 'Adults',
    childrenLabel: 'Children (2-12 years)',
    capacityInfo: (base: number, max: number) => `Included capacity: ${base} guests. Max capacity: ${max} guests.`,
    extraChargeInfo: 'Each extra person has an additional cost of $500 MXN per night.',
    estimatedTotal: 'Estimated total stay amount:',
    priceAdjustmentLabel: 'Extra guests surcharge:',
    maxCapacityExceeded: (max: number) => `The number of guests exceeds the maximum capacity of the room (${max} people).`,
    atLeastOneAdult: 'At least 1 adult must be registered.',
    confirmChanges: 'Confirm Changes',
    saving: 'Saving...',
    editBtn: 'Edit',
    exitBtn: 'Exit portal',

    maintenanceBtn: '🛠 Report a problem',
    maintenanceTitle: 'Report a Maintenance Issue',
    maintenanceTypeLabel: 'Where is the issue?',
    maintenanceDescPlaceholder: 'Describe the problem in detail so we can help you...',
    sendReport: 'Submit Report',
    reportSuccess: 'Report submitted successfully! The maintenance staff will review it shortly.',
    dniTitle: 'DIGITAL CHECK-IN (DNI, INE or Passport)',
    dniSubtitle: 'To complete your digital check-in and speed up your arrival, please upload a photo of your official ID (DNI, INE, or Passport).',
    dniUploadButton: 'Upload your ID',
    dniUploading: 'Uploading ID...',
    dniSuccess: 'ID successfully registered ✅',
    dniSuccessDesc: 'We have received your ID. Your digital check-in is complete.',
    dniError: 'Failed to upload your ID. Please try again.',
    dniChangeButton: 'Change ID 🔄',
  }
};

// Función para comprimir imágenes del lado del cliente
const compressImage = (file: File): Promise<Blob | File> => {
  return new Promise((resolve) => {
    // Si no es una imagen (ej. PDF), no comprimir y retornar archivo original
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Dimensiones máximas recomendadas para la web
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        // Convertir a jpeg con calidad del 70% (reduce un archivo de 5MB a ~200KB)
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
              type: 'image/jpeg',
              lastModified: Date.now()
            }));
          } else {
            resolve(file);
          }
        }, 'image/jpeg', 0.7);
      };
    };
    reader.onerror = () => resolve(file);
  });
};

// Cliente-side helper para obtener reglas de capacidad consolidadas del grupo o habitación
function getGroupCapacityRules(booking: any) {
  if (!booking) return { base: 6, max: 8 };

  if (booking.rooms_detail && Array.isArray(booking.rooms_detail) && booking.rooms_detail.length > 0) {
    let totalBase = 0;
    let totalMax = 0;
    booking.rooms_detail.forEach((r: any) => {
      const rules = getCapacityRules(r.room_name || '');
      totalBase += rules.base;
      totalMax += rules.max;
    });
    return { base: totalBase, max: totalMax };
  }

  return getCapacityRules(booking.room_name || '');
}

function getIndividualRoomCapacityRules(booking: any) {
  if (!booking) return { base: 6, max: 8 };
  
  if (booking.rooms_detail && Array.isArray(booking.rooms_detail) && booking.rooms_detail.length > 0) {
    const currentRoom = booking.rooms_detail.find((r: any) => String(r.room_id) === String(booking.id));
    if (currentRoom) {
      return getCapacityRules(currentRoom.room_name || '');
    }
  }
  
  const firstRoomName = (booking.room_name || '').split(',')[0].trim();
  return getCapacityRules(firstRoomName);
}

function getCapacityRules(roomNameOrId: string) {
  // Si hay múltiples habitaciones (separadas por coma), sumar capacidades
  const parts = roomNameOrId.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    let totalBase = 0;
    let totalMax = 0;
    parts.forEach(part => {
      const rules = getCapacityRulesForSingle(part);
      totalBase += rules.base;
      totalMax += rules.max;
    });
    return { base: totalBase, max: totalMax };
  }
  return getCapacityRulesForSingle(roomNameOrId);
}

function getCapacityRulesForSingle(roomNameOrId: string) {
  const r = (roomNameOrId || '').toLowerCase();

  // Reglas de capacidad definidas por el hotel:
  // - Habitación doble / Apt. 1 dormitorio: base 4, max 4 (sin personas extra permitidas)
  // - Apt. 2 dormitorios: base 6, max 8 (+2 extras a $500/persona/noche)
  // - Apt. 3 dormitorios: base 10, max 12 (+2 extras a $500/persona/noche)
  // - Casa vacacional: base 12, max 16 (+4 extras a $500/persona/noche)

  // Casa vacacional (va primero para no confundir con 401→casa)
  if (r.includes('casa') || r.includes('401') || r.includes('679093')) {
    return { base: 12, max: 16 };
  }
  // 3 dormitorios
  if (r.includes('3 dormitorios') || r.includes('679092') || r.includes('3rec') ||
      /\b(101|102|103|104|105|106|107)\b/.test(r)) {
    return { base: 10, max: 12 };
  }
  // 2 dormitorios
  if (r.includes('2 dormitorios') || r.includes('679091') || r.includes('2rec') ||
      /\b(201|202|203|204|205|206)\b/.test(r)) {
    return { base: 6, max: 8 };
  }
  // 1 dormitorio / Loft
  if (r.includes('1 dormitorio') || r.includes('679087') || r.includes('1rec') || r.includes('loft') ||
      /\b402\b/.test(r)) {
    return { base: 4, max: 4 };
  }
  // Habitaciones dobles (300-306)
  if (r.includes('doble') || r.includes('679077') ||
      /\b(301|302|303|304|305|306)\b/.test(r)) {
    return { base: 4, max: 4 };
  }
  // Habitación Sencilla (500)
  if (/\b500\b/.test(r) || r.includes('685542_500')) {
    return { base: 2, max: 2 };
  }
  // Unidades 501-507 (Habitaciones dobles / 1 dormitorio en el edificio 500)
  if (/\b(501|502|503|504|505|506|507)\b/.test(r) || r.includes('685542')) {
    return { base: 4, max: 4 };
  }
  // Fallback: tratar como 2 dormitorios
  return { base: 6, max: 8 };
}

export default function PublicReservaPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = rawId ? String(rawId).replace(/^(\{\{1\}\}|%7B%7B1%7D%7D)/, '') : '';
  const searchParams = useSearchParams();
  const queryLang = searchParams?.get('lang');
  const queryAction = searchParams?.get('action');

  const [booking, setBooking] = useState<any | null>(null);
  const isUSD = booking?.guest_name?.toUpperCase().includes('(US DOLLARS)');
  const curr = isUSD ? 'USD' : 'MXN';
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentSplit, setPaymentSplit] = useState<'50' | '100'>('50');
  const [lang, setLang] = useState<'es' | 'en'>(() => {
    if (queryLang === 'en' || queryLang === 'es') {
      return queryLang as 'es' | 'en';
    }
    return 'es';
  });

  // Sincronizar idioma si cambia el parámetro de búsqueda
  useEffect(() => {
    if (queryLang === 'en' || queryLang === 'es') {
      setLang(queryLang as 'es' | 'en');
    }
  }, [queryLang]);

  // Estados para Modal de Edición de Huéspedes
  const [showEditGuestsModal, setShowEditGuestsModal] = useState(false);
  const [showOtaWarningModal, setShowOtaWarningModal] = useState(false);
  const [tempRooms, setTempRooms] = useState<any[]>([]);
  const [tempAdults, setTempAdults] = useState(1);
  const [tempChildren, setTempChildren] = useState(0);
  const [isUpdatingGuests, setIsUpdatingGuests] = useState(false);
  const [updateGuestsError, setUpdateGuestsError] = useState('');

  // Estados para Modal de Mantenimiento
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceType, setMaintenanceType] = useState('otro');
  const [maintenanceDesc, setMaintenanceDesc] = useState('');
  const [isSubmittingMaintenance, setIsSubmittingMaintenance] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState('');
  const [maintenanceSuccess, setMaintenanceSuccess] = useState(false);
  const [showWifiInfo, setShowWifiInfo] = useState(false);
  const [showCancellationPolicies, setShowCancellationPolicies] = useState(false);
  const [showPaymentBreakdown, setShowPaymentBreakdown] = useState(false);

  // Estados para Solicitud de Factura
  const [showFacturaModal, setShowFacturaModal] = useState(false);
  const [facturaEmail, setFacturaEmail] = useState('');
  const [facturaCfdi, setFacturaCfdi] = useState('');
  const [facturaNotes, setFacturaNotas] = useState('');
  const [facturaPdf, setFacturaPdf] = useState<File | null>(null);
  const [facturaPdfName, setFacturaPdfName] = useState('');
  const [facturaPdfUrl, setFacturaPdfUrl] = useState<string | null>(null);
  const [facturaSubmitting, setFacturaSubmitting] = useState(false);
  const [facturaSuccess, setFacturaSuccess] = useState(false);
  const [facturaError, setFacturaError] = useState('');
  const [facturaWhatsappMsg, setFacturaWhatsappMsg] = useState('');

  const CFDI_OPTIONS = [
    'G01 - Adquisición de mercancias',
    'G02 - Devoluciones, descuentos o bonificaciones',
    'G03 - Gastos en general',
    'I01 - Construcciones',
    'I02 - Mobilario y equipo de oficina por inversiones',
    'I03 - Equipo de transporte',
    'I04 - Equipo de computo y accesorios',
    'I05 - Dados, troqueles, moldes, matrices y herramental',
    'I06 - Comunicaciones telefónicas',
    'I07 - Comunicaciones satelitales',
    'I08 - Otra maquinaria y equipo',
    'D01 - Honorarios médicos, dentales y gastos hospitalarios',
    'D02 - Gastos médicos por incapacidad o discapacidad',
    'D03 - Gastos funerales',
    'D04 - Donativos',
    'D05 - Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)',
    'D06 - Aportaciones voluntarias al SAR',
    'D07 - Primas por seguros de gastos médicos',
    'D08 - Gastos de transportación escolar obligatoria',
    'D09 - Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones',
    'D10 - Pagos por servicios educativos (colegiaturas)',
    'P01 - Por definir',
    'S01 - Sin efectos fiscales',
    'CP01 - Pagos',
    'CN01 - Nómina'
  ];

  const handleFacturaPdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setFacturaError('Solo se aceptan archivos PDF.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFacturaError('El archivo no debe superar los 10 MB.');
      return;
    }
    setFacturaPdf(file);
    setFacturaPdfName(file.name);
    setFacturaError('');
  };

  const handleSubmitFactura = async () => {
    if (!facturaCfdi) { setFacturaError('Por favor selecciona el Uso del CFDI.'); return; }
    if (!facturaEmail) { setFacturaError('Por favor ingresa tu correo electrónico.'); return; }
    if (!facturaPdf) { setFacturaError('Por favor adjunta tu Constancia de Situación Fiscal (PDF).'); return; }
    if (!booking) return;

    setFacturaSubmitting(true);
    setFacturaError('');
    try {
      // 1. Subir PDF
      const formData = new FormData();
      formData.append('file', facturaPdf);
      formData.append('reservationId', String(booking.id));
      const uploadRes = await fetch('/api/public/reserva/factura', { method: 'POST', body: formData });
      const uploadJson = await uploadRes.json();
      if (!uploadJson.success) throw new Error(uploadJson.error || 'Error subiendo PDF');

      const pdfUrl = uploadJson.url;
      setFacturaPdfUrl(pdfUrl);

      // 2. Guardar registro en billing_requests (via el mismo endpoint con JSON)
      await fetch('/api/public/reserva/factura', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId: String(booking.id),
          guestName: booking.guest_name,
          roomName: booking.room_name,
          amount: booking.deposit || booking.price || 0,
          email: facturaEmail,
          cfdiUse: facturaCfdi,
          pdfUrl,
          notes: facturaNotes
        })
      });

      // 3. Generar mensaje de WhatsApp
      const waMsgLines = [
        '📑 SOLICITUD DE FACTURA',
        '',
        `1. Constancia: ${pdfUrl}`,
        `2. Correo: ${facturaEmail}`,
        `3. Uso del CFDI: ${facturaCfdi}`,
        `4. Total pagado: $${(booking.deposit || booking.price || 0).toLocaleString('es-MX')} ${curr}`,
        `5. Habitación: ${booking.room_name}`,
        `6. Observaciones: ${facturaNotes || '(Ninguna)'}`,
        '',
        '⏳ En un plazo de 48 hrs hábiles recibirás tu factura.',
        '❌ NO REFACTURAMOS'
      ];
      setFacturaWhatsappMsg(encodeURIComponent(waMsgLines.join('\n')));
      setFacturaSuccess(true);
    } catch (err: any) {
      setFacturaError(err.message || 'Error al enviar la solicitud. Intenta de nuevo.');
    } finally {
      setFacturaSubmitting(false);
    }
  };

  const changeLanguage = async (newLang: 'es' | 'en') => {
    setLang(newLang);
    if (!id) return;
    try {
      await fetch('/api/public/reserva/change-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: String(id), language: newLang })
      });
    } catch (e) {
      console.error("Error updating language preference:", e);
    }
  };

  const [copiedClabe, setCopiedClabe] = useState(false);
  const [copiedConcept, setCopiedConcept] = useState(false);

  // Estados para carga de comprobante
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Estados para carga de DNI/Pasaporte
  const [uploadingDni, setUploadingDni] = useState(false);
  const [uploadedDniUrl, setUploadedDniUrl] = useState<string | null>(null);
  const [dniUploadError, setDniUploadError] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const handleDniChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && id) {
      const file = e.target.files[0];
      setDniUploadError(null);
      setUploadingDni(true);

      try {
        const fileToUpload = await compressImage(file);

        const formData = new FormData();
        formData.append('id', String(id));
        formData.append('file', fileToUpload);

        const res = await fetch('/api/public/reserva/dni', {
          method: 'POST',
          body: formData
        });
        const json = await res.json();
        if (res.ok && json.success) {
          setUploadedDniUrl(json.url);
        } else {
          setDniUploadError(json.error || (lang === 'en' ? 'An error occurred uploading your ID.' : 'Ocurrió un error al subir la identificación.'));
        }
      } catch (err) {
        setDniUploadError(lang === 'en' ? 'Network error uploading ID.' : 'Error de red al intentar subir la identificación.');
      } finally {
        setUploadingDni(false);
      }
    }
  };

  // Estados para Lightbox de fotos
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && id) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setUploadError(null);
      setUploading(true);

      try {
        const fileToUpload = await compressImage(file);

        const formData = new FormData();
        formData.append('id', String(id));
        formData.append('file', fileToUpload);

        const res = await fetch('/api/public/reserva', {
          method: 'POST',
          body: formData
        });
        const json = await res.json();
        if (res.ok && json.success) {
          setUploadedUrl(json.receiptUrl);
        } else {
          setUploadError(json.error || 'Ocurrió un error al subir el comprobante.');
        }
      } catch (err) {
        setUploadError('Error de red al intentar subir el archivo.');
      } finally {
        setUploading(false);
      }
    }
  };

  useEffect(() => {
    if (!id) return;

    const fetchBooking = async () => {
      try {
        const res = await fetch(`/api/public/reserva?id=${id}`, { cache: 'no-store' });
        const json = await res.json();
        if (res.ok && json.success) {
          setBooking(json.data);
          if (json.data.portal_settings?.language) {
            setLang(json.data.portal_settings.language);
          }
          // Si ya existe un recibo previo subido, guardarlo en el estado
          if (json.data.receipt_url) {
            setUploadedUrl(json.data.receipt_url);
          }
          if (json.data.document_url && json.data.document_url !== 'null' && json.data.document_url !== 'undefined') {
            setUploadedDniUrl(json.data.document_url);
          }
        } else {
          setError(json.error || 'No se pudo cargar la información de la reservación.');
        }
      } catch (e) {
        setError('Error de conexión al cargar la reservación.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchBooking();
  }, [id]);

  // Auto-abrir modal de mantenimiento si viene con ?action=maintenance
  useEffect(() => {
    const isMaintenanceAction = queryAction === 'maintenance' || 
      (typeof window !== 'undefined' && window.location.href.includes('action=maintenance'));

    if (isMaintenanceAction && booking && booking.status !== 'cancelled') {
      const roomNum = booking.room_name?.match(/\((\d+)\)/)?.[1] || booking.room_name?.replace(/\D/g, '') || '';
      setMaintenanceType(lang === 'en' ? `My Room (${roomNum})` : `Mi Habitación (${roomNum})`);
      setMaintenanceDesc('');
      setMaintenanceError('');
      setMaintenanceSuccess(false);
      setShowMaintenanceModal(true);
    }
  }, [queryAction, booking]);

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDateStr = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      return format(
        parseISO(dateStr),
        lang === 'en' ? "MMMM dd, yyyy" : "dd 'de' MMMM, yyyy",
        lang === 'en' ? undefined : { locale: es }
      );
    } catch (e) {
      return dateStr;
    }
  };

  const handleOpenLightbox = (index: number) => {
    setActivePhotoIndex(index);
    setLightboxOpen(true);
  };

  const handleNextPhoto = (photos: string[], e: React.MouseEvent) => {
    e.stopPropagation();
    setActivePhotoIndex((prev) => (prev + 1) % photos.length);
  };

  const handlePrevPhoto = (photos: string[], e: React.MouseEvent) => {
    e.stopPropagation();
    setActivePhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  function getRoomTypeKey(roomName: string): string {
    // Para múltiples habitaciones separadas por coma, usar el tipo de la primera
    const firstRoom = (roomName || '').split(',')[0].trim();
    const lower = firstRoom.toLowerCase();
    if (lower.includes('casa') || lower.includes('vacacional')) return 'casa';
    if (lower.includes('3 rec') || lower.includes('3 dormitorios') || lower.includes('101') || lower.includes('102') || lower.includes('103') || lower.includes('104') || lower.includes('105') || lower.includes('106') || lower.includes('107')) return '3rec';
    if (lower.includes('2 rec') || lower.includes('2 dormitorios') || lower.includes('201') || lower.includes('202') || lower.includes('203') || lower.includes('204') || lower.includes('205') || lower.includes('206')) return '2rec';
    if (lower.includes('1 rec') || lower.includes('1 dormitorio') || lower.includes('402')) return '1rec';
    return 'doble';
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mb-4" />
        <p className="text-zinc-650 font-medium text-sm">
          {lang === 'en' ? 'Loading your reservation details...' : 'Cargando los detalles de tu reservación...'}
        </p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4 border border-rose-100">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-zinc-900 font-extrabold text-lg mb-2">
          {lang === 'en' ? 'Oops! Something went wrong' : '¡Ups! Algo salió mal'}
        </h2>
        <p className="text-zinc-600 text-sm mb-6">
          {error || (lang === 'en' ? 'The requested reservation does not exist or has been cancelled.' : 'La reservación solicitada no existe o ha sido cancelada.')}
        </p>
        <a
          href="https://wa.me/529581168698"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-indigo-600 text-white font-bold text-sm py-3 px-6 rounded-xl shadow-md hover:bg-indigo-700 transition-all cursor-pointer"
        >
          {lang === 'en' ? 'Contact on WhatsApp' : 'Contactar por WhatsApp'}
        </a>
      </div>
    );
  }

  // --- MÁQUINA DE ESTADOS DINÁMICA ---
  let currentState: 'solicitud' | 'pago_pendiente' | 'confirmada' | 'checkin_pendiente' | 'hospedado' | 'finalizada' | 'liberada' = 'solicitud';
  let statusMessage = '';

  const isCancelled = booking.status === 'cancelled';
  const isCheckedIn = booking.is_checked_in;
  const isCheckedOut = booking.is_checked_out;
  const hasPaid = booking.deposit > 0;
  const rawChannel = (booking.channel || '').toLowerCase();
  const rawName = (booking.guest_name || '').toLowerCase();
  const rawNotes = (booking.notes || '').toLowerCase();
  const isOta = ['airbnb', 'booking', 'expedia'].some(c => rawChannel.includes(c) || rawName.includes(c) || rawNotes.includes(c));
  const isConfirmed = hasPaid || isOta;

  // Fechas clave
  const checkInDate = booking.check_in ? new Date(booking.check_in) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let checkInLimit = null;
  if (checkInDate) {
    checkInLimit = new Date(checkInDate.getTime());
    checkInLimit.setDate(checkInLimit.getDate() - 1); // 1 día antes
  }

  // Horas desde la creación
  let hoursSinceCreation = 0;
  if (booking.booking_time) {
    const createdDate = new Date(booking.booking_time);
    hoursSinceCreation = (new Date().getTime() - createdDate.getTime()) / (1000 * 60 * 60);
  }

  if (isCancelled) {
    currentState = 'liberada';
    statusMessage = lang === 'en'
      ? 'This reservation has been cancelled and the room availability has been released.'
      : 'Esta reservación ha sido cancelada y la disponibilidad de la habitación ha sido liberada.';
  } else if (isCheckedOut || (isCheckedIn && checkInDate && today > new Date(booking.check_out))) {
    currentState = 'finalizada';
    statusMessage = lang === 'en'
      ? 'Thank you for staying with us! We hope to see you again soon in Huatulco. Have a safe trip back!'
      : '¡Gracias por hospedarte con nosotros! Esperamos verte de nuevo muy pronto en Huatulco. ¡Buen viaje de regreso!';
  } else if (isCheckedIn) {
    currentState = 'hospedado';
    statusMessage = lang === 'en'
      ? 'Welcome to Condominios Jaroje! We hope you are enjoying your stay. If you need anything, our team is at your service.'
      : '¡Bienvenido a Condominios Jaroje! Esperamos que estés disfrutando de tu estancia. Si necesitas algo, nuestro equipo está a tu disposición.';
  } else if (isConfirmed) {
    currentState = 'checkin_pendiente';
    if (checkInLimit && today >= checkInLimit) {
      statusMessage = lang === 'en'
        ? 'Your room is almost ready. Upon arrival, the front desk staff will help you complete your digital registration and contract signing.'
        : 'Tu habitación está casi lista. A tu llegada, el personal de recepción te ayudará a completar tu registro y firma digital de contrato.';
    } else {
      statusMessage = lang === 'en'
        ? 'Your stay is confirmed! Everything is ready for your arrival. We will send you check-in instructions one day before your entry.'
        : '¡Tu estancia está confirmada! Todo está listo para tu llegada. Te enviaremos las instrucciones de check-in un día antes de tu entrada.';
    }
  } else {
    currentState = 'pago_pendiente';
    if (hoursSinceCreation > 2) {
      statusMessage = lang === 'en'
        ? 'Your reservation is awaiting payment. Please upload your deposit receipt to avoid automatic cancellation of your reservation.'
        : 'Tu reservación está pendiente de pago. Por favor, sube tu comprobante de anticipo para evitar la cancelación automática de tu estancia.';
    } else {
      statusMessage = lang === 'en'
        ? 'We have received your reservation request. To secure your stay, please make your deposit payment in the next few hours.'
        : 'Hemos recibido tu solicitud de reservación. Para asegurar tu estancia, realiza el depósito de anticipo en las próximas horas.';
    }
  }

  // Pasos de la barra de progreso
  const steps = [
    { label: lang === 'en' ? 'Request received' : 'Solicitud recibida', state: 'solicitud' },
    { label: lang === 'en' ? 'Awaiting Deposit' : 'Pago pendiente', state: 'pago_pendiente' },
    { label: lang === 'en' ? 'Booking confirmed' : 'Reservación confirmada', state: 'confirmada' },
    { label: lang === 'en' ? 'Check-in pending' : 'Check-in pending', state: 'checkin_pendiente' },
    { label: lang === 'en' ? 'In-house' : 'Hospedado', state: 'hospedado' },
    { label: lang === 'en' ? 'Completed' : 'Finalizada', state: 'finalizada' }
  ];

  const activeIndex = steps.findIndex(s => s.state === currentState);

  // Características del tipo de habitación según el idioma seleccionado
  const roomTypeKey = getRoomTypeKey(booking.room_name);
  const featuresData = lang === 'en'
    ? (ROOM_FEATURES_EN[roomTypeKey] || ROOM_FEATURES_EN['doble'])
    : (ROOM_FEATURES[roomTypeKey] || ROOM_FEATURES['doble']);

  // Fotos y descripciones del Carrusel: Fotos individuales de la propiedad seguidas de las fotos de áreas comunes
  const roomSpecificPhotos = ROOM_PHOTOS[roomTypeKey] || ROOM_PHOTOS['doble'];
  const photos = [...roomSpecificPhotos, ...COMMON_PHOTOS];
  const captions = Array(photos.length).fill('');

  const anticipoRequerido = Math.ceil(booking.price * 0.5 * 100) / 100;

  // Cargo extra por huéspedes adicionales ($500 MXN por persona × noche sobre la capacidad base)
  // - OTAs (Airbnb, Booking, Expedia): precio fijo, sin cargo extra adicional
  // - Directo (local 500-507 o Beds24 Directo): booking.price = tarifa base × noches
  //   El sistema tiene las reglas de capacidad por habitación y calcula el extra automáticamente
  const EXTRA_GUEST_CHARGE = isUSD ? 25 : 500;
  const extraChargesTotal = (() => {
    if (isOta) return 0; // OTAs: tarifa fija negociada con la plataforma

    // Para reservas directas (Beds24 o locales): usar rooms_detail si existe (grupos),
    // si no, usar num_adult/num_child del booking completo
    if (booking.rooms_detail && booking.rooms_detail.length > 0) {
      // Grupo: sumar huéspedes y capacidad base de todas las habitaciones
      const totalGroupGuests = booking.rooms_detail.reduce((sum: number, r: any) => sum + (r.num_adult || 0) + (r.num_child || 0), 0);
      const totalGroupBaseCapacity = booking.rooms_detail.reduce((sum: number, r: any) => sum + getCapacityRulesForSingle(r.room_name || '').base, 0);
      const groupExtraGuests = Math.max(0, totalGroupGuests - totalGroupBaseCapacity);
      // $500 por persona extra × número de noches
      return groupExtraGuests * EXTRA_GUEST_CHARGE * (booking.nights || 1);
    } else {
      // Reserva individual (local o Beds24 sin rooms_detail)
      const totalGuests = (booking.num_adult || 0) + (booking.num_child || 0);
      const baseCapacity = getCapacityRulesForSingle(booking.room_name || '').base;
      const extraGuests = Math.max(0, totalGuests - baseCapacity);
      // $500 por persona extra × número de noches
      return extraGuests * EXTRA_GUEST_CHARGE * (booking.nights || 1);
    }
  })();
  const totalConExtras = booking.price;
  const basePriceWithoutExtras = Math.max(0, booking.price - extraChargesTotal);
  const anticipoConExtras = Math.ceil(totalConExtras * 0.5 * 100) / 100;

  const rawT = TRANSLATIONS[lang];
  const t = React.useMemo(() => {
    const clone: any = {};
    for (const key in rawT) {
      const val = rawT[key];
      if (typeof val === 'function') {
        clone[key] = (...args: any[]) => {
          const res = val(...args);
          return isUSD ? res.replace(/500 MXN/g, '25 USD').replace(/MXN/g, 'USD') : res;
        };
      } else if (typeof val === 'string') {
        clone[key] = isUSD ? val.replace(/500 MXN/g, '25 USD').replace(/MXN/g, 'USD') : val;
      } else {
        clone[key] = val;
      }
    }
    return clone;
  }, [rawT, isUSD]);

  return (
    <div className="min-h-screen bg-[#F6F5F2] text-zinc-900 pb-16 font-sans">
      <header className="bg-white text-zinc-900 text-center py-8 px-4 border-b border-zinc-200/80 relative overflow-hidden flex flex-col items-center">
        {/* Logotipo Oficial Prominente */}
        <img 
          src="/logo-jaroje.png" 
          alt="Jaroje Condominios" 
          className="h-28 md:h-36 object-contain mb-2" 
        />

        <p className="text-zinc-500 text-[10.5px] font-bold tracking-wider uppercase">{t.subtitle}</p>

        {/* Selector de Idioma Centrado (Tema Claro) */}
        <div className="mt-4 flex items-center gap-1.5 bg-zinc-100 p-1 rounded-full border border-zinc-200 z-20 text-[10px] font-extrabold shadow-xs">
          <button
            onClick={() => changeLanguage('es')}
            className={`px-3 py-1 rounded-full transition-all cursor-pointer flex items-center gap-1 ${lang === 'es' ? 'bg-zinc-900 text-white shadow-sm font-black' : 'text-zinc-655 hover:text-zinc-900'}`}
          >
            <span>ESP</span>
            <span>🇪🇸</span>
          </button>
          <button
            onClick={() => changeLanguage('en')}
            className={`px-3 py-1 rounded-full transition-all cursor-pointer flex items-center gap-1 ${lang === 'en' ? 'bg-zinc-900 text-white shadow-sm font-black' : 'text-zinc-655 hover:text-zinc-900'}`}
          >
            <span>ENG</span>
            <span>🇺🇸</span>
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 mt-6 space-y-5">

        {/* 1. BARRA DE PROGRESO */}
        {currentState === 'liberada' ? (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-center shadow-sm space-y-4">
            <div className="w-12 h-12 bg-rose-105 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-rose-100">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-rose-900 font-extrabold text-base tracking-tight uppercase">
              {lang === 'en' ? 'Availability Released' : 'Disponibilidad Liberada'}
            </h3>
            <p className="text-rose-700 text-xs mt-1.5 leading-relaxed">{statusMessage}</p>

            {/* Botón Reservar Nuevamente */}
            <div className="pt-1 border-t border-rose-100">
              <p className="text-[11px] text-rose-600 font-semibold mb-2.5">
                {lang === 'en'
                  ? '¿Would you like to book again with us?'
                  : '¿Te gustaría hospedarte nuevamente con nosotros?'}
              </p>
              <a
                href="https://beds24.com/booking2.php?propid=327286&lang=es"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[13px] rounded-xl shadow-md transition-all active:scale-[0.98] cursor-pointer"
              >
                🏨 {lang === 'en' ? 'Book Again' : 'Reservar Nuevamente'}
              </a>
              <p className="text-[10px] text-rose-500 mt-2 italic">
                {lang === 'en'
                  ? 'Check availability and rates directly on our booking page.'
                  : 'Consulta disponibilidad y tarifas directamente en nuestra página de reservas.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-4 overflow-hidden relative">
            <div className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block border-b border-zinc-100 pb-1.5 mb-2.5">
              {t.stateTitle}
            </div>

            <div className="flex justify-between items-center relative select-none px-1 overflow-x-auto scrollbar-none gap-4">
              {/* Línea gris de fondo */}
              <div className="absolute left-0 right-0 top-[14px] h-[3px] bg-zinc-100 rounded-full z-0" />

              {/* Línea coloreada de progreso activo */}
              <div
                className="absolute left-0 top-[14px] h-[3px] bg-indigo-600 rounded-full transition-all duration-500 z-0"
                style={{
                  width: `${(Math.max(0, activeIndex) / (steps.length - 1)) * 100}%`
                }}
              />

              {steps.map((step, idx) => {
                const isCompleted = idx < activeIndex;
                const isActive = idx === activeIndex;
                return (
                  <div key={step.state} className="flex flex-col items-center relative z-10 flex-shrink-0">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${isCompleted
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : isActive
                            ? 'bg-white border-2 border-indigo-600 text-indigo-600 shadow-md ring-4 ring-indigo-50 animate-pulse'
                            : 'bg-white border border-zinc-250 text-zinc-400'
                        }`}
                    >
                      {isCompleted ? <Check size={14} className="stroke-[3]" /> : idx + 1}
                    </div>
                    <span
                      className={`text-[8.5px] mt-1.5 font-bold tracking-tight text-center max-w-[62px] block leading-tight ${isActive ? 'text-indigo-600 font-black' : isCompleted ? 'text-zinc-700' : 'text-zinc-400'
                        }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. MENSAJE SEGÚN EL ESTADO */}
        {currentState !== 'liberada' && (
          <div className="bg-indigo-50/40 border border-indigo-100/60 rounded-2xl p-4 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
            <p className="text-zinc-800 text-[13px] leading-relaxed font-semibold">
              {statusMessage}
            </p>
          </div>
        )}

        {/* ALERTA DE PAGO PARCIAL / SALDO PENDIENTE */}
        {currentState !== 'liberada' && booking.deposit > 0 && booking.balance > 0 && (
          <div className="bg-amber-50 border border-amber-250/30 rounded-2xl p-4 flex gap-3 text-amber-900 text-xs shadow-sm">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5 animate-pulse" />
            <div className="space-y-1">
              <span className="font-extrabold block text-amber-950 uppercase tracking-wide">{t.partialPaymentTitle}</span>
              <p className="leading-relaxed opacity-95">
                {t.partialPaymentDesc(booking.deposit.toLocaleString('es-MX'), booking.balance.toLocaleString('es-MX'))}
              </p>
            </div>
          </div>
        )}

        {/* 3. RESUMEN DE LA ESTANCIA */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <FileText size={18} className="text-indigo-600" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">{t.summaryTitle}</h3>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">{t.guest}</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{booking.guest_name}</strong>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">{t.bookingId}</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>{booking.id}</span>
                {booking.channel && (
                  <span className="text-[9px] bg-zinc-200/80 text-zinc-600 font-extrabold px-1.5 py-0.5 rounded-md border border-zinc-300/35 uppercase tracking-wide">
                    {booking.channel}
                  </span>
                )}
              </strong>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100 col-span-2">
              <span className="text-zinc-500 font-semibold block">{t.accommodation}</span>
              {/* Desglose por habitación */}
              {booking.rooms_detail && booking.rooms_detail.length > 1 ? (
                <div className="mt-1.5 space-y-2">
                  {(() => {
                    const totalGroupGuests = booking.rooms_detail.reduce((sum: number, r: any) => sum + (r.num_adult || 0) + (r.num_child || 0), 0);
                    const totalGroupBaseCapacity = booking.rooms_detail.reduce((sum: number, r: any) => sum + getCapacityRulesForSingle(r.room_name || '').base, 0);
                    const groupExtraGuests = Math.max(0, totalGroupGuests - totalGroupBaseCapacity);

                    let extraGuestsToDistribute = groupExtraGuests;

                    return booking.rooms_detail.map((room: any, idx: number) => {
                      const totalGuests = (room.num_adult || 0) + (room.num_child || 0);
                      const baseCapacity = getCapacityRulesForSingle(room.room_name || '').base;
                      const EXTRA_CHARGE = 500;

                      let roomExtraGuests = 0;
                      if (groupExtraGuests > 0 && totalGuests > baseCapacity) {
                        roomExtraGuests = Math.min(extraGuestsToDistribute, totalGuests - baseCapacity);
                        extraGuestsToDistribute -= roomExtraGuests;
                      }
                      const extraCharge = roomExtraGuests * EXTRA_CHARGE;

                      return (
                        <div key={idx} className="bg-white rounded-lg border border-zinc-200 px-3 py-2">
                          <div className="flex items-start gap-2">
                            <span className="text-[15px] mt-0.5 shrink-0">🛏️</span>
                            <div className="flex-1">
                              <strong style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }} className="text-zinc-900 font-bold text-[12px] leading-tight block">
                                {room.room_name}
                              </strong>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Users size={10} className="text-zinc-400 shrink-0" />
                                <span className="text-zinc-600 font-semibold text-[11px]">
                                  {totalGuests} {lang === 'en' ? 'guest(s)' : 'huésped(es)'}
                                </span>
                              </div>
                            </div>
                          </div>
                          {/* Mostrar badge de cargo extra para todas las reservas directas (no OTA) */}
                          {!isOta && extraCharge > 0 && (
                            <div className="mt-1.5 flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                              <AlertTriangle size={10} className="text-amber-500 shrink-0" />
                              <span className="text-amber-700 text-[10.5px] font-semibold">
                                {lang === 'en'
                                  ? `${roomExtraGuests} extra guest(s) · +$${extraCharge.toLocaleString()} ${curr}`
                                  : `${roomExtraGuests} huésped(es) extra · +$${extraCharge.toLocaleString()} ${curr}`}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">
                  {booking.room_name.replace(/\s*\(\d+\)\s*$/, '').trim()}
                </strong>
              )}
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">{t.checkin}</span>
              <span className="text-zinc-900 font-bold text-[11.5px] block mt-0.5">{formatDateStr(booking.check_in)}</span>
              <span className="text-zinc-500 text-[10px] mt-0.5 block">{t.checkinTime}</span>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">{t.checkout}</span>
              <span className="text-zinc-900 font-bold text-[11.5px] block mt-0.5">{formatDateStr(booking.check_out)}</span>
              <span className="text-zinc-500 text-[10px] mt-0.5 block">{t.checkoutTime}</span>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">{lang === 'en' ? 'Nights' : 'Estancia'}</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{t.nights(booking.nights)}</strong>
            </div>
            <div className="bg-[#FAF9F6] p-3 rounded-xl border border-zinc-100 flex flex-col justify-between min-h-[110px]">
              <div>
                <span className="text-zinc-500 font-semibold block mb-1">
                  {lang === 'en' ? 'Registered Guests' : 'Huéspedes registrados'}
                </span>
                <span className="text-zinc-900 font-bold text-[13px] block">
                  {t.guests(booking.num_adult + booking.num_child)}
                </span>
                {/* Nota de cargo extra: visible para todas las reservas directas (no OTA) */}
                {!isOta && (
                  <span className="text-zinc-700 text-[9.5px] font-normal mt-1 block leading-tight">
                    {t.unregisteredGuestNote}
                  </span>
                )}
              </div>
              {booking.status !== 'cancelled' && (
                <button
                  onClick={() => {
                    if (isOta) {
                      setShowOtaWarningModal(true);
                    } else {
                      if (booking.rooms_detail && booking.rooms_detail.length > 1) {
                        setTempRooms(booking.rooms_detail.map((r: any) => ({
                          bookingId: r.room_id || r.id,
                          room_name: r.room_name,
                          numAdult: r.individual_num_adult !== undefined ? r.individual_num_adult : (r.num_adult || 1),
                          numChild: r.individual_num_child !== undefined ? r.individual_num_child : (r.num_child || 0),
                          max: getIndividualRoomCapacityRules(r).max,
                          base: getIndividualRoomCapacityRules(r).base
                        })));
                      } else {
                        setTempRooms([{
                          bookingId: booking.id,
                          room_name: booking.room_name,
                          numAdult: booking.individual_num_adult !== undefined ? booking.individual_num_adult : (booking.num_adult || 1),
                          numChild: booking.individual_num_child !== undefined ? booking.individual_num_child : (booking.num_child || 0),
                          max: getIndividualRoomCapacityRules(booking).max,
                          base: getIndividualRoomCapacityRules(booking).base
                        }]);
                      }
                      setUpdateGuestsError('');
                      setShowEditGuestsModal(true);
                    }
                  }}
                  className="w-full mt-2.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-[10px] rounded-lg border border-indigo-200/50 transition-all cursor-pointer shadow-xs active:scale-95 flex items-center justify-center gap-1 uppercase tracking-wider"
                >
                  <Edit size={10} strokeWidth={2.5} className="shrink-0" />
                  {t.editBtn}
                </button>
              )}
            </div>

            {booking.notes && booking.notes.trim() && (
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 text-left col-span-2 mt-1 space-y-1">
                <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-widest block">
                  {lang === 'en' ? '📝 Special Instructions / Observations' : '📝 Observaciones de tu Reservación'}
                </span>
                <p className="text-[11.5px] font-semibold text-amber-950 whitespace-pre-line leading-relaxed">
                  {booking.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 4. ESTADO DE CUENTA */}
        {!isOta && (
          <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-3.5">
            <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
              <Clock size={18} className="text-indigo-600" />
              <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">{t.accountTitle}</h3>
            </div>

            {/* Desglose de Pagos Colapsable */}
            {booking && booking.rooms_detail && booking.rooms_detail.length > 0 && (
              <div className="border border-zinc-100 rounded-xl overflow-hidden bg-zinc-50/50">
                <button
                  type="button"
                  onClick={() => setShowPaymentBreakdown(!showPaymentBreakdown)}
                  className="w-full flex justify-between items-center px-4 py-2.5 text-left text-xs font-black text-zinc-700 hover:bg-zinc-100/60 transition-colors select-none"
                >
                  <span className="flex items-center gap-1.5">
                    💵 {lang === 'en' ? 'Payment Breakdown' : 'Desglose de pagos'}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {showPaymentBreakdown ? '▲ ' + (lang === 'en' ? 'Hide' : 'Ocultar') : '▼ ' + (lang === 'en' ? 'Show' : 'Mostrar')}
                  </span>
                </button>

                {showPaymentBreakdown && (
                  <div className="p-3.5 pt-0 border-t border-zinc-100 bg-white divide-y divide-zinc-100 text-[11px] md:text-xs">
                    {booking.rooms_detail.map((room: any, idx: number) => {
                      const roomNights = booking.nights || 1;
                      const roomPrice = room.price || 0;
                      const dailyRate = Math.round(roomPrice / roomNights);

                      // Calcular cargo por persona extra si aplica
                      const totalGuests = (room.num_adult || 0) + (room.num_child || 0);
                      const baseCapacity = getCapacityRulesForSingle(room.room_name || '').base;
                      const EXTRA_CHARGE = 500;
                      const extraGuests = Math.max(0, totalGuests - baseCapacity);
                      const roomExtraCharge = extraGuests * EXTRA_CHARGE * roomNights;
                      const totalRoomWithExtras = roomPrice + roomExtraCharge;

                      const detailText = lang === 'en'
                        ? `${roomNights} ${roomNights === 1 ? 'night' : 'nights'} x $${dailyRate.toLocaleString('es-MX')}${roomExtraCharge > 0 ? ` + extra pax (${extraGuests} x $${EXTRA_GUEST_CHARGE} x ${roomNights} n.)` : ''}`
                        : `${roomNights} ${roomNights === 1 ? 'noche' : 'noches'} x $${dailyRate.toLocaleString('es-MX')}${roomExtraCharge > 0 ? ` + pax extra (${extraGuests} x $${EXTRA_GUEST_CHARGE} x ${roomNights} n.)` : ''}`;

                      const basePrice = Number((totalRoomWithExtras / 1.19).toFixed(2));
                      const vatAmount = Number((basePrice * 0.16).toFixed(2));
                      const lodgingTaxAmount = Number((totalRoomWithExtras - basePrice - vatAmount).toFixed(2));

                      return (
                        <div key={idx} className="py-2.5 first:pt-1 last:pb-1 flex flex-col gap-1 border-b border-zinc-100/60 last:border-b-0">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold text-zinc-900 leading-snug truncate">
                                🏨 {room.room_name}
                              </span>
                              <span className="text-[10px] text-zinc-450 leading-normal">
                                {detailText}
                              </span>
                            </div>
                            <span className="font-extrabold text-zinc-900 text-right shrink-0 mt-0.5">
                              ${totalRoomWithExtras.toLocaleString('es-MX')} {curr}
                            </span>
                          </div>

                          {/* Desglose de Impuestos Incluidos */}
                          <div className="mt-1 pl-4 border-l border-zinc-200 space-y-0.5 text-[10px] text-zinc-400 w-full max-w-[280px]">
                            <div className="flex justify-between w-full">
                              <span>{lang === 'en' ? 'Base Rate (excl. tax)' : 'Tarifa base (sin imp.)'}</span>
                              <span className="font-medium">${basePrice.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {curr}</span>
                            </div>
                            <div className="flex justify-between w-full">
                              <span>{lang === 'en' ? 'VAT (16% included)' : 'IVA (16% incluido)'}</span>
                              <span className="font-medium">${vatAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {curr}</span>
                            </div>
                            <div className="flex justify-between w-full">
                              <span>{lang === 'en' ? 'Lodging Tax (3% included)' : 'Imp. Hospedaje (3% incluido)'}</span>
                              <span className="font-medium">${lodgingTaxAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {curr}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center text-zinc-650">
                <span>{t.totalEstancia}</span>
                <strong className="text-zinc-900 font-extrabold">
                  ${(extraChargesTotal > 0 ? basePriceWithoutExtras : booking.price).toLocaleString('es-MX')} {curr}
                </strong>
              </div>
              {extraChargesTotal > 0 && (
                <div className="flex justify-between items-center text-amber-700 bg-amber-50 px-3 py-2 rounded-xl border border-amber-100 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                    {lang === 'en' ? 'Extra guests charge' : 'Cargo huéspedes extra'}
                  </span>
                  <strong className="font-black">+${extraChargesTotal.toLocaleString('es-MX')} {curr}</strong>
                </div>
              )}
              {extraChargesTotal > 0 && (
                <div className="flex justify-between items-center text-zinc-800 border-t border-dashed border-zinc-200 pt-2">
                  <span className="font-bold">{lang === 'en' ? 'Total (with extras):' : 'Total con cargos extra:'}</span>
                  <strong className="text-zinc-900 font-black text-base">${totalConExtras.toLocaleString('es-MX')} {curr}</strong>
                </div>
              )}
              {hasPaid ? (
                <>
                  <div className="flex justify-between items-center text-emerald-600 font-semibold bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100">
                    <span className="flex items-center gap-1">{t.anticipoRecibido}</span>
                    <strong className="font-black">${booking.deposit.toLocaleString('es-MX')} {curr}</strong>
                  </div>
                  <div className="flex justify-between items-center text-zinc-800 pt-2 border-t border-dashed border-zinc-200">
                    <span className="font-bold">{t.saldoRestante}</span>
                    <strong className="text-indigo-600 font-black text-base">
                      ${(Math.max(0, totalConExtras - booking.deposit)).toLocaleString('es-MX')} {curr}
                    </strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center text-indigo-600 font-semibold bg-indigo-50/50 px-3 py-2 rounded-xl border border-indigo-100/80">
                    <span>{t.anticipoRequerido}</span>
                    <strong className="font-black">${(extraChargesTotal > 0 ? anticipoConExtras : anticipoRequerido).toLocaleString('es-MX')} {curr}</strong>
                  </div>
                  <div className="flex justify-between items-center text-zinc-500">
                    <span>{t.anticipoDepositado}</span>
                    <strong className="font-bold">$0 {curr}</strong>
                  </div>
                  <div className="flex justify-between items-center text-zinc-800 pt-2 border-t border-dashed border-zinc-200">
                    <span className="font-bold">{t.saldoRestante}</span>
                    <strong className="text-indigo-600 font-black text-base">${totalConExtras.toLocaleString('es-MX')} {curr}</strong>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 5. PAGO / CARGA DE COMPROBANTE (Solo cuando aplica saldo pendiente) */}
        {!isOta && booking.balance > 0 && currentState !== 'liberada' && !isCheckedOut && (() => {
          const targetAmount = booking.deposit === 0
            ? (paymentSplit === '50' ? Math.ceil(booking.price * 0.5 * 100) / 100 : Number(booking.price.toFixed(2)))
            : Number(booking.balance.toFixed(2));

          return (
            <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
                <CreditCard size={18} className="text-indigo-600" />
                <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">
                  {hasPaid ? t.paymentTitlePending : t.paymentTitle}
                </h3>
              </div>

              {/* Selector de Anticipo o Total (solo si no ha abonado nada) */}
              {booking.deposit === 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-extrabold uppercase text-zinc-400 tracking-wider block">{t.selectAmount}</span>
                  <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-1 rounded-xl border border-zinc-200/40 shadow-inner">
                    <button
                      onClick={() => setPaymentSplit('50')}
                      className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex flex-col items-center justify-center ${paymentSplit === '50'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-zinc-600 hover:text-zinc-950 bg-transparent'
                        }`}
                    >
                      <span>{t.anticipoSelector}</span>
                      <span className={`text-[10px] opacity-90 mt-0.5 ${paymentSplit === '50' ? 'text-indigo-200' : 'text-zinc-500'}`}>
                        ${(Math.ceil(booking.price * 0.5 * 100) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 })} {curr}
                      </span>
                    </button>
                    <button
                      onClick={() => setPaymentSplit('100')}
                      className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex flex-col items-center justify-center ${paymentSplit === '100'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-zinc-600 hover:text-zinc-950 bg-transparent'
                        }`}
                    >
                      <span>{t.totalSelector}</span>
                      <span className={`text-[10px] opacity-90 mt-0.5 ${paymentSplit === '100' ? 'text-indigo-200' : 'text-zinc-500'}`}>
                        ${Number(booking.price.toFixed(2)).toLocaleString('es-MX', { minimumFractionDigits: 2 })} {curr}
                      </span>
                    </button>
                  </div>
                </div>
              )}



              {/* Monto seleccionado explicito */}
              <div className="bg-indigo-50/40 border border-indigo-100/50 rounded-xl p-3.5 text-center">
                <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider block">{t.amountSelected}</span>
                <span className="text-xl font-black text-indigo-950">
                  ${targetAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {curr}
                </span>
              </div>

              {/* Método 1: Tarjeta */}
              {(booking.portal_settings?.show_card_payment !== false) && (
                <>
                  <div className="space-y-2">
                    <span className="text-[10px] font-extrabold uppercase text-indigo-600 tracking-wider block">{t.optionCard}</span>
                    <a
                      href="https://link.mercadopago.com.mx/jaroje"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-[#00A650] hover:bg-[#008f43] text-white font-bold text-sm py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CreditCard size={18} />
                      {t.payWithCard}
                    </a>
                    <a
                      href={`/public/pago-transferencia?id=${booking.id}&amount=${targetAmount}&name=${encodeURIComponent(booking.guest_name || '')}&lang=${lang}&method=mercadopago`}
                      className="w-full mt-2 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-zinc-800 font-bold text-xs py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Upload size={14} className="text-zinc-600" />
                      {lang === 'en' ? 'Upload Card Receipt' : 'Subir Comprobante de Tarjeta'}
                    </a>
                  </div>

                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-zinc-200"></div>
                    <span className="flex-shrink mx-4 text-zinc-400 text-xs font-bold uppercase">{lang === 'en' ? 'or' : 'ó'}</span>
                    <div className="flex-grow border-t border-zinc-200"></div>
                  </div>
                </>
              )}

              {/* Método 2: Transferencia */}
              <div className="space-y-3 pt-2">
                <span className="text-[10px] font-extrabold uppercase text-zinc-650 tracking-wider block">{t.optionTransfer}</span>
                <a
                  href={`/public/pago-transferencia?id=${booking.id}&amount=${targetAmount}&name=${encodeURIComponent(booking.guest_name || '')}&lang=${lang}`}
                  className="w-full bg-[#18181b] hover:bg-[#27272a] text-white font-bold text-sm py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileText size={18} />
                  {t.payWithTransfer}
                </a>
                <p className="text-[10px] text-zinc-500 italic text-center mt-1">{t.transferNote}</p>
              </div>
            </div>
          );
        })()}

        {/* SECCIÓN HISTORIAL DE COMPROBANTES DE TRANSFERENCIA (Solo si hay comprobantes subidos) */}
        {booking && booking.transfer_receipts && booking.transfer_receipts.length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
              <FileText size={18} className="text-zinc-650" />
              <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">
                {lang === 'en' ? 'Payment Receipts History' : 'Historial de Comprobantes'}
              </h3>
            </div>

            <div className="space-y-3">
              {booking.transfer_receipts.map((r: any) => {
                const dateVal = r.created_at ? new Date(r.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-MX', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                }) : '';

                return (
                  <div key={r.id} className="p-3.5 rounded-xl border border-zinc-150/80 bg-zinc-50/50 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-400 leading-none mb-1">
                          {r.status === 'approved' 
                            ? (lang === 'en' ? 'Approved Amount' : 'Monto Aprobado')
                            : (lang === 'en' ? 'Declared Amount' : 'Monto Declarado')}
                        </span>
                        <span className={`text-xs font-black ${r.status === 'approved' ? 'text-emerald-800 font-black' : 'text-zinc-900'}`}>
                          {curr}${Number(r.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                        {dateVal && (
                          <span className="text-[10px] text-zinc-400 font-bold mt-0.5">
                            {dateVal}
                          </span>
                        )}
                      </div>
                      
                      {/* Badge de estado */}
                      {r.status === 'pending' && (
                        <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 font-black uppercase text-[9px] rounded-full flex items-center gap-1 select-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                          {lang === 'en' ? 'In Review' : 'En revisión'}
                        </span>
                      )}
                      {r.status === 'approved' && (
                        <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 font-black uppercase text-[9px] rounded-full flex items-center gap-1 select-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                          {lang === 'en' ? 'Approved' : 'Aprobado'}
                        </span>
                      )}
                      {r.status === 'rejected' && (
                        <span className="px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-700 font-black uppercase text-[9px] rounded-full flex items-center gap-1 select-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                          {lang === 'en' ? 'Rejected' : 'Rechazado'}
                        </span>
                      )}
                    </div>

                    {/* Nota o Motivo de rechazo */}
                    {r.status === 'rejected' && r.notes && (
                      <div className="bg-rose-50/30 border border-rose-100 p-2.5 rounded-lg text-[11.5px] text-rose-800 font-semibold leading-relaxed">
                        <strong>{lang === 'en' ? 'Reason:' : 'Motivo:'}</strong> {r.notes}
                      </div>
                    )}

                    {r.status === 'pending' && (
                      <p className="text-[10.5px] text-zinc-500 font-semibold leading-snug">
                        {lang === 'en' 
                          ? 'We are verifying your transfer. Your booking status is safe.'
                          : 'Estamos validando tu transferencia. Tu reservación está protegida de cancelación.'}
                      </p>
                    )}

                    {r.status === 'approved' && (
                      <p className="text-[10.5px] text-emerald-700 font-semibold leading-snug">
                        {lang === 'en' 
                          ? 'This payment has been successfully confirmed and applied to your booking.'
                          : 'Este pago ha sido confirmado y aplicado a tu reservación exitosamente.'}
                      </p>
                    )}

                    <div className="pt-1.5 flex items-center justify-between border-t border-zinc-150/40 mt-1">
                      <a
                        href={r.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10.5px] font-bold text-indigo-650 hover:text-indigo-800 flex items-center gap-1 cursor-pointer select-none"
                      >
                        <FileText size={12} />
                        {lang === 'en' ? 'View Document' : 'Ver Comprobante'}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SECCIÓN REGISTRO DE IDENTIFICACIÓN / DNI */}
        {booking && currentState !== 'liberada' && (
          <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-zinc-100 pb-2.5">
              <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                <User size={20} className="text-indigo-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">
                  {t.dniTitle}
                </h3>
                <p className="text-[10.5px] text-zinc-500 font-medium leading-tight mt-0.5">
                  {lang === 'en' ? 'Complete your digital check-in' : 'Completa tu check-in digital'}
                </p>
              </div>
            </div>

            {!isOta && !hasPaid && !uploadedUrl ? (
              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4.5 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-2 text-amber-700">
                  <Lock size={20} />
                </div>
                <h4 className="text-[13px] font-bold text-amber-900 uppercase tracking-wide">
                  {lang === 'en' ? 'Payment Required' : 'Pago Requerido'}
                </h4>
                <p className="text-[11.5px] text-amber-800 leading-relaxed font-semibold">
                  {lang === 'en'
                    ? 'Please complete your deposit or stay payment to enable registering your official ID. Once confirmed, the upload option will appear here.'
                    : 'Por favor realiza el pago del anticipo o de tu estancia para habilitar el registro de tu identificación oficial. Una vez confirmado, aparecerá la opción para subir tu documento.'}
                </p>
              </div>
            ) : uploadedDniUrl ? (
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs select-none">
                  <Check size={16} className="shrink-0" />
                  <span>{t.dniSuccess}</span>
                </div>
                <p className="text-[11px] text-zinc-600 leading-relaxed">
                  {t.dniSuccessDesc}
                </p>
                {(uploadedDniUrl.toLowerCase().endsWith('.pdf') || uploadedDniUrl.toLowerCase().includes('.pdf')) ? (
                  <div className="flex flex-col items-center justify-center p-5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2 max-w-xs mx-auto">
                    <FileText size={36} className="text-zinc-400" />
                    <span className="text-[11px] font-bold text-zinc-700">{lang === 'en' ? 'PDF Document' : 'Documento PDF'}</span>
                    <a
                      href={uploadedDniUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10.5px] font-extrabold rounded-lg transition-colors border border-indigo-100 shadow-xs cursor-pointer"
                    >
                      {lang === 'en' ? 'Open PDF' : 'Abrir PDF'}
                    </a>
                  </div>
                ) : (
                  <div 
                    onClick={() => setZoomImage(uploadedDniUrl)}
                    className="relative rounded-xl overflow-hidden border border-zinc-200 shadow-sm max-w-xs mx-auto cursor-zoom-in hover:brightness-95 transition-all bg-white"
                  >
                    <img
                      src={uploadedDniUrl}
                      alt="Guest ID / Passport"
                      className="w-full h-36 object-cover bg-zinc-50"
                    />
                  </div>
                )}
                <div className="pt-1 text-center">
                  <label className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-zinc-50 text-zinc-700 hover:text-zinc-900 font-bold rounded-xl text-xs transition-all border border-zinc-200 cursor-pointer shadow-xs">
                    <Upload size={13} className="text-zinc-500" />
                    <span>{t.dniChangeButton}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleDniChange}
                      className="hidden"
                      disabled={uploadingDni}
                    />
                  </label>
                </div>
              </div>
            ) : (booking.is_checked_in || booking.is_checked_out) ? (
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs select-none">
                  <Check size={16} className="shrink-0" />
                  <span>{lang === 'en' ? 'Check-in Completed ✅' : 'Check-in Completado ✅'}</span>
                </div>
                <p className="text-[11px] text-zinc-650 leading-relaxed font-medium">
                  {lang === 'en' 
                    ? 'Your registration has been completed by reception. Welcome to Condominios Jaroje!' 
                    : 'Tu registro ha sido completado por la recepción. ¡Bienvenido a Condominios Jaroje!'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[12.5px] text-zinc-650 leading-relaxed font-medium">
                  {t.dniSubtitle}
                </p>

                {dniUploadError && (
                  <div className="bg-red-50 border border-red-100 text-red-700 text-xs p-3.5 rounded-xl font-semibold leading-relaxed">
                    ⚠️ {dniUploadError}
                  </div>
                )}

                <label className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer select-none">
                  {uploadingDni ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{t.dniUploading}</span>
                    </>
                  ) : (
                    <>
                      <Upload size={16} />
                      <span>{t.dniUploadButton}</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleDniChange}
                    className="hidden"
                    disabled={uploadingDni}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {/* BOTÓN SOLICITAR FACTURA — visible cuando ya hay anticipo registrado */}
        {booking && Number(booking.deposit || 0) > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-indigo-100 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                <ReceiptText size={20} className="text-indigo-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-zinc-900 text-[13.5px] uppercase tracking-wider">
                  {lang === 'en' ? 'Invoice Request' : 'Solicitar Factura'}
                </h3>
                <p className="text-[10.5px] text-zinc-500 font-medium leading-tight mt-0.5">
                  {lang === 'en' ? 'Upload your Constancia and we will send you your CFDI in 48 hrs.' : 'Sube tu Constancia de Situación Fiscal y te enviamos tu CFDI en 48 hrs hábiles.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setFacturaEmail('');
                setFacturaCfdi('');
                setFacturaNotas('');
                setFacturaPdf(null);
                setFacturaPdfName('');
                setFacturaPdfUrl(null);
                setFacturaSuccess(false);
                setFacturaError('');
                setFacturaWhatsappMsg('');
                setShowFacturaModal(true);
              }}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <ReceiptText size={17} />
              {lang === 'en' ? '📄 Request Invoice' : '📄 Solicitar Factura'}
            </button>
            <p className="text-[9.5px] text-zinc-400 text-center mt-2 italic">❌ NO REFACTURAMOS</p>
          </div>
        )}

        {/* 6. CARACTERÍSTICAS DEL ALOJAMIENTO */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <Home size={18} className="text-indigo-600" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">{t.featuresTitle}</h3>
          </div>

          <div className="space-y-3.5">
            <div className="bg-[#FAF9F6] border border-zinc-200/40 rounded-xl p-3 flex items-center text-xs">
              <span className="text-zinc-700 font-extrabold uppercase tracking-wide">
                {featuresData.title}
              </span>
            </div>

            <ul className="grid grid-cols-1 gap-2 text-xs text-zinc-650">
              {featuresData.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2 bg-[#FAF9F6] border border-zinc-100 p-2.5 rounded-xl">
                  <span className="text-indigo-600 mt-0.5 font-bold leading-none">•</span>
                  <span className="font-medium text-zinc-700">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 7. CARRUSEL DE FOTOGRAFÍAS */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <Compass size={18} className="text-indigo-600" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">{t.photosTitle}</h3>
          </div>

          <div className="relative group">
            <div className="flex gap-3 overflow-x-auto snap-x scrollbar-none pb-2 px-1">
              {photos.map((src, index) => (
                <div
                  key={index}
                  onClick={() => handleOpenLightbox(index)}
                  className="flex-shrink-0 w-64 h-44 rounded-2xl overflow-hidden snap-center relative cursor-pointer border border-zinc-200/70 shadow-sm hover:scale-[1.02] transition-transform duration-300"
                >
                  <img src={src} alt="Alojamiento" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-zinc-400 text-center mt-1.5 italic">{t.tapToZoom}</p>
          </div>
        </div>

        {/* 8. INFORMACIÓN PARA TU ESTANCIA */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-3.5">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <Info size={18} className="text-indigo-600" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">{lang === 'en' ? 'Stay Information' : 'Información para tu estancia'}</h3>
          </div>

          <div className="space-y-3 text-xs leading-relaxed text-zinc-650">
            {/* WiFi Block */}
            {isConfirmed ? (
              <>
                <button
                  onClick={() => setShowWifiInfo(!showWifiInfo)}
                  className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold rounded-xl text-center flex items-center justify-center gap-2 border border-zinc-350/40 transition-all cursor-pointer select-none"
                >
                  <span>📶</span>
                  {t.wifiInfoBtn}
                  <span className="text-[10px] text-zinc-400">
                    {showWifiInfo ? '▲' : '▼'}
                  </span>
                </button>
                {showWifiInfo && (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4.5 space-y-4 animate-in fade-in slide-in-from-top-3 duration-200">
                    {/* Wi-Fi & Keys Section */}
                    <div className="space-y-2 text-left">
                      <h4 className="font-extrabold text-zinc-900 text-[11px] uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-150 pb-1">
                        🔑 {lang === 'en' ? 'Access & Credentials' : 'Acceso y Claves'}
                      </h4>
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div className="bg-white p-2 rounded-lg border border-zinc-150 text-center">
                          <span className="text-zinc-500 block text-[9px] font-semibold uppercase">{lang === 'en' ? 'WiFi Network' : 'Red WiFi'}</span>
                          <strong className="text-zinc-900 font-extrabold select-all">JAROJE</strong>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-zinc-150 text-center">
                          <span className="text-zinc-500 block text-[9px] font-semibold uppercase">{lang === 'en' ? 'Password' : 'Contraseña'}</span>
                          <strong className="text-zinc-900 font-extrabold select-all">HUXX2025</strong>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-zinc-150 text-center">
                          <span className="text-zinc-500 block text-[9px] font-semibold uppercase">{lang === 'en' ? 'Gate Code' : 'Código de Portón'}</span>
                          <strong className="text-zinc-900 font-extrabold select-all">3456</strong>
                        </div>
                      </div>
                    </div>

                    {/* Important Info Section */}
                    <div className="space-y-2 text-left">
                      <h4 className="font-extrabold text-zinc-900 text-[11px] uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-150 pb-1">
                        ℹ️ {lang === 'en' ? 'Important Information' : 'Información importante'}
                      </h4>
                      <ul className="space-y-1.5 pl-1 text-[11.5px] text-zinc-700">
                        <li className="flex items-start gap-1.5">
                          <span className="text-zinc-400 shrink-0">•</span>
                          <span>{lang === 'en' ? 'Dry towels available at reception.' : 'Toallas secas disponibles en recepción.'}</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="text-zinc-400 shrink-0">•</span>
                          <span>{lang === 'en' ? 'Exclusive access for registered guests.' : 'Acceso exclusivo para huéspedes registrados.'}</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="text-zinc-400 shrink-0">•</span>
                          <span>{lang === 'en' ? 'The hotel is not responsible for valuables.' : 'El hotel no se hace responsable por objetos de valor.'}</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="text-zinc-400 shrink-0">•</span>
                          <span>{lang === 'en' ? 'Parking subject to availability.' : 'Estacionamiento sujeto a disponibilidad.'}</span>
                        </li>
                      </ul>
                    </div>

                    {/* Schedules Section */}
                    <div className="space-y-2 text-left">
                      <h4 className="font-extrabold text-zinc-900 text-[11px] uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-150 pb-1">
                        ⏰ {lang === 'en' ? 'Schedules' : 'Horarios'}
                      </h4>
                      <div className="grid grid-cols-3 gap-2 text-[11px] text-zinc-700">
                        <div className="bg-white p-2 rounded-lg border border-zinc-150 text-center flex flex-col justify-center">
                          <span className="text-zinc-500 block text-[9px] font-semibold uppercase">{lang === 'en' ? 'Pool' : 'Alberca'}</span>
                          <span className="font-bold text-zinc-800 leading-tight">9:00 – 22:00</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-zinc-150 text-center flex flex-col justify-center">
                          <span className="text-zinc-500 block text-[9px] font-semibold uppercase">{lang === 'en' ? 'Reception' : 'Recepción'}</span>
                          <span className="font-bold text-zinc-800 leading-tight">8:00 – 20:00</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-zinc-150 text-center flex flex-col justify-center">
                          <span className="text-zinc-500 block text-[9px] font-semibold uppercase">WhatsApp</span>
                          <span className="font-bold text-zinc-800 leading-tight">9:00 – 16:00</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 mt-2 text-center">
                <span className="text-amber-800 text-[10.5px] font-bold block">
                  {lang === 'en'
                    ? '📶 Wi-Fi details and access codes will be enabled automatically once your deposit is registered.'
                    : '📶 Los datos de Wi-Fi y claves se habilitarán automáticamente una vez registrado tu anticipo.'}
                </span>
              </div>
            )}

            {/* Políticas de Cancelación (Solo para reservas DIRECTAS y GOOGLE) */}
            {!isOta && (
              <>
                <button
                  onClick={() => setShowCancellationPolicies(!showCancellationPolicies)}
                  className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold rounded-xl text-center flex items-center justify-center gap-2 border border-zinc-350/40 transition-all cursor-pointer select-none mt-2"
                >
                  <span>📋</span>
                  {lang === 'en' ? 'Cancellation Policies' : 'Políticas de Cancelación'}
                  <span className="text-[10px] text-zinc-400">
                    {showCancellationPolicies ? '▲' : '▼'}
                  </span>
                </button>
                {showCancellationPolicies && (
                  <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 space-y-2 text-left animate-in fade-in slide-in-from-top-3 duration-200 mt-2">
                    <h4 className="font-extrabold text-amber-950 text-[12px] uppercase tracking-wider flex items-center gap-1.5 border-b border-amber-200/60 pb-1.5">
                      ❗ {lang === 'en' ? 'CANCELLATION POLICY' : 'POLÍTICA DE CANCELACIONES'}
                    </h4>
                    <div className="text-[11.5px] leading-relaxed text-amber-900 space-y-2 font-medium">
                      <p className="flex items-start gap-1.5 font-semibold text-amber-950">
                        <span className="shrink-0">🔹</span>
                        <span>{lang === 'en' ? 'Free date changes up to 3 days prior to check-in (subject to availability).' : 'Cambio de fechas sin penalización: hasta 3 días antes (sujeto a disponibilidad).'}</span>
                      </p>
                      <div className="space-y-1 pt-1">
                        <span className="font-bold block text-amber-950">
                          🔹 {lang === 'en' ? 'Cancellation terms:' : 'Cancelación con:'}
                        </span>
                        <ul className="pl-4 space-y-1 list-disc text-amber-900">
                          <li><strong>+15 {lang === 'en' ? 'days prior' : 'días antes'}:</strong> {lang === 'en' ? '15% penalty of total booking amount' : 'penalización 15% del total de su reservación'}</li>
                          <li><strong>{lang === 'en' ? 'Between 15 and 5 days' : 'Entre 15 y 5 días'}:</strong> {lang === 'en' ? '30% penalty of total booking amount' : 'penalización 30% del total de su reservación'}</li>
                          <li><strong>-5 {lang === 'en' ? 'days prior' : 'días antes'}:</strong> {lang === 'en' ? '50% penalty of total booking amount' : 'penalización 50% del total de su reservación'}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="bg-[#FAF9F6] border border-zinc-200/50 rounded-xl p-3 space-y-2 mt-2">
              <h4 className="font-extrabold text-zinc-900 uppercase text-[10px] tracking-wide">{t.stayPolicies}</h4>
              <ul className="list-disc pl-4 space-y-1">
                <li>{t.policyPets}</li>
                <li>{t.policySmoke}</li>
                <li>{t.policyHours}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 9. CÓMO LLEGAR */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-3.5">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <MapPin size={18} className="text-indigo-600" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">{lang === 'en' ? 'Location & Directions' : 'Ubicación y Cómo Llegar'}</h3>
          </div>

          <div className="space-y-3 text-xs">
            <p className="text-zinc-650 leading-relaxed whitespace-pre-line">{t.locationDesc}</p>
            <a
              href="https://maps.app.goo.gl/1DzGMNAu5yeRJ5Qr6?g_st=ic"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-center flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <MapPin size={16} />
              {lang === 'en' ? 'Open in Google Maps' : 'Abrir en Google Maps'}
            </a>
          </div>
        </div>

        {/* 10. BOTONES DE ACCIÓN FINAL */}
        <div className="pt-2 flex flex-col gap-2.5">
          <a
            href="https://wa.me/529581168698"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-[#25D366] hover:bg-[#20ba5a] text-white font-extrabold text-sm py-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-center"
          >
            <MessageSquare size={18} />
            {t.talkReception}
          </a>
          {booking.status !== 'cancelled' && (
            <button
              onClick={() => {
                setMaintenanceDesc('');
                const roomNum = booking.room_name.match(/\((\d+)\)/)?.[1] || booking.room_name.replace(/\D/g, '') || '';
                setMaintenanceType(lang === 'en' ? `My Room (${roomNum})` : `Mi Habitación (${roomNum})`);
                setMaintenanceError('');
                setMaintenanceSuccess(false);
                setShowMaintenanceModal(true);
              }}
              className="w-full bg-zinc-800 hover:bg-zinc-750 text-white font-extrabold text-sm py-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-center border border-zinc-700"
            >
              {t.maintenanceBtn}
            </button>
          )}
          <a
            href="https://www.condominiosjaroje.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-extrabold text-sm py-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-center border border-zinc-300"
          >
            <Compass size={18} className="text-zinc-600" />
            {t.stayGuideBtn}
          </a>
        </div>

      </main>

      {/* MODAL SOLICITAR FACTURA */}
      {showFacturaModal && booking && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 bg-indigo-600 text-white">
              <div className="flex items-center gap-2.5">
                <ReceiptText size={20} />
                <span className="font-extrabold text-[14px] uppercase tracking-wider">
                  {lang === 'en' ? 'Invoice Request' : 'Solicitar Factura'}
                </span>
              </div>
              <button onClick={() => setShowFacturaModal(false)} className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-all cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {!facturaSuccess ? (
                <>
                  {/* Info prellenada */}
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 space-y-1.5 text-[11.5px]">
                    <div className="flex justify-between">
                      <span className="text-zinc-500 font-semibold">Habitación:</span>
                      <span className="font-bold text-zinc-900">{booking.room_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 font-semibold">Total pagado:</span>
                      <span className="font-extrabold text-indigo-700">${(booking.deposit || booking.price || 0).toLocaleString('es-MX')} {curr}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 font-semibold">Check-in:</span>
                      <span className="font-bold text-zinc-900">{booking.check_in}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 font-semibold">Check-out:</span>
                      <span className="font-bold text-zinc-900">{booking.check_out}</span>
                    </div>
                  </div>

                  {/* Correo electrónico */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-extrabold text-zinc-700 uppercase tracking-wider block">
                      📧 Correo electrónico *
                    </label>
                    <input
                      type="email"
                      value={facturaEmail}
                      onChange={e => setFacturaEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      className="w-full border border-zinc-200 rounded-xl px-3.5 py-2.5 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                    />
                  </div>

                  {/* Uso del CFDI */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-extrabold text-zinc-700 uppercase tracking-wider block">
                      💼 Uso del CFDI *
                    </label>
                    <select
                      value={facturaCfdi}
                      onChange={e => setFacturaCfdi(e.target.value)}
                      className="w-full border border-zinc-200 rounded-xl px-3.5 py-2.5 text-[12.5px] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                    >
                      <option value="">-- Selecciona el uso del CFDI --</option>
                      {CFDI_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>

                  {/* Constancia Situación Fiscal PDF */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-extrabold text-zinc-700 uppercase tracking-wider block">
                      📎 Constancia de Situación Fiscal (PDF) *
                    </label>
                    <label className={`flex items-center gap-3 w-full border-2 border-dashed rounded-xl px-4 py-3 cursor-pointer transition-all ${facturaPdfName ? 'border-emerald-300 bg-emerald-50' : 'border-zinc-200 hover:border-indigo-300 hover:bg-indigo-50/50'}`}>
                      <Upload size={18} className={facturaPdfName ? 'text-emerald-600' : 'text-zinc-400'} />
                      <div className="flex-1 min-w-0">
                        {facturaPdfName ? (
                          <span className="text-[11.5px] font-bold text-emerald-700 truncate block">{facturaPdfName}</span>
                        ) : (
                          <span className="text-[11.5px] font-semibold text-zinc-500">Toca aquí para seleccionar tu PDF</span>
                        )}
                        <span className="text-[10px] text-zinc-400 block mt-0.5">Máx. 10 MB · Solo PDF</span>
                      </div>
                      <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFacturaPdfChange} />
                    </label>
                  </div>

                  {/* Observaciones */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-extrabold text-zinc-700 uppercase tracking-wider block">
                      📝 Observaciones (opcional)
                    </label>
                    <textarea
                      value={facturaNotes}
                      onChange={e => setFacturaNotas(e.target.value)}
                      placeholder="Ej: Hospedaje del 25 al 26 de julio 2026, incluir RFC en leyenda..."
                      rows={3}
                      className="w-full border border-zinc-200 rounded-xl px-3.5 py-2.5 text-[12.5px] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                    />
                  </div>

                  {/* Aviso importante */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[10.5px] text-amber-800 font-semibold leading-relaxed">
                    ⏳ Recibirás tu factura en un plazo de <strong>48 horas hábiles</strong> por este medio.<br />
                    <span className="text-red-600 font-extrabold">❌ NO REFACTURAMOS.</span>
                  </div>

                  {facturaError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-[11.5px] text-red-700 font-semibold">
                      ⚠️ {facturaError}
                    </div>
                  )}

                  <button
                    onClick={handleSubmitFactura}
                    disabled={facturaSubmitting}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-extrabold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                  >
                    {facturaSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ReceiptText size={18} />}
                    {facturaSubmitting ? 'Enviando datos...' : 'Enviar Solicitud de Factura'}
                  </button>
                </>
              ) : (
                /* ÉXITO */
                <div className="space-y-4 py-2">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Check size={32} className="text-emerald-600" />
                    </div>
                  </div>

                  {/* Datos confirmados */}
                  <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3.5 space-y-2 text-[11.5px]">
                    <div className="flex gap-2"><span className="text-zinc-500 w-20 shrink-0">Correo:</span><span className="font-bold text-zinc-900">{facturaEmail}</span></div>
                    <div className="flex gap-2"><span className="text-zinc-500 w-20 shrink-0">CFDI:</span><span className="font-bold text-zinc-900">{facturaCfdi}</span></div>
                    <div className="flex gap-2"><span className="text-zinc-500 w-20 shrink-0">Habitación:</span><span className="font-bold text-zinc-900">{booking.room_name}</span></div>
                    <div className="flex gap-2"><span className="text-zinc-500 w-20 shrink-0">Monto:</span><span className="font-extrabold text-indigo-700">${(booking.deposit || booking.price || 0).toLocaleString('es-MX')} {curr}</span></div>
                    {facturaNotes && <div className="flex gap-2"><span className="text-zinc-500 w-20 shrink-0">Obs.:</span><span className="font-bold text-zinc-900">{facturaNotes}</span></div>}
                  </div>

                  {/* Botón WhatsApp */}
                  <a
                    href={`https://wa.me/529581168698?text=${facturaWhatsappMsg}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 bg-[#25D366] hover:bg-[#20ba5a] text-white font-extrabold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer text-center"
                  >
                    <MessageSquare size={18} />
                    💬 Enviar Solicitud por WhatsApp
                  </a>
                  
                  <div className="space-y-1.5 text-center">
                    <p className="text-[12px] text-zinc-800 font-bold">
                      Recibirás tu factura en un plazo de 48 horas hábiles.
                    </p>
                    <p className="text-[10px] text-zinc-400 italic">
                      El botón abrirá WhatsApp con todos los datos de tu solicitud prellenados.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowFacturaModal(false)}
                    className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-extrabold text-sm rounded-xl transition-all cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-zinc-500 text-[10px] mt-12 px-4 space-y-1">
        <p>{t.footerRights}</p>
        <p>{t.footerHelp}</p>
      </footer>

      {/* MODAL LIGHTBOX DE FOTOGRAFÍAS */}
      {lightboxOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col justify-between p-4 md:p-8">
          {/* Botón Cerrar */}
          <div className="flex justify-end">
            <button
              onClick={() => setLightboxOpen(false)}
              className="text-white/80 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Visor de imagen */}
          <div className="flex-grow flex items-center justify-center relative">
            <button
              onClick={(e) => handlePrevPhoto(photos, e)}
              className="absolute left-2 md:left-6 text-white/80 hover:text-white p-3 rounded-full bg-white/10 hover:bg-white/20 transition-all cursor-pointer select-none"
            >
              <ChevronLeft size={24} />
            </button>

            <div className="max-w-4xl max-h-[70vh] flex flex-col items-center">
              <img
                src={photos[activePhotoIndex]}
                alt={captions[activePhotoIndex]}
                className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-2xl"
              />
              <span className="text-white/90 text-sm font-semibold mt-4 text-center select-none bg-black/40 px-4 py-1.5 rounded-full">
                {activePhotoIndex + 1} {t.lightboxOf} {photos.length}
              </span>
            </div>

            <button
              onClick={(e) => handleNextPhoto(photos, e)}
              className="absolute right-2 md:right-6 text-white/80 hover:text-white p-3 rounded-full bg-white/10 hover:bg-white/20 transition-all cursor-pointer select-none"
            >
              <ChevronRight size={24} />
            </button>
          </div>

          <div className="text-center text-zinc-500 text-[10px] pb-2">
            {t.lightboxControls}
          </div>
        </div>
      )}

      {/* MODAL EDITAR HUÉSPEDES */}
      {showEditGuestsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-zinc-150 animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3 shrink-0">
              <h3 className="font-black text-zinc-900 text-base uppercase tracking-wider">{t.editGuestsTitle}</h3>
              <button
                onClick={() => setShowEditGuestsModal(false)}
                className="text-zinc-400 hover:text-zinc-650 p-1.5 rounded-full hover:bg-zinc-100 transition-all cursor-pointer animate-none"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 overflow-y-auto pr-1 flex-1 space-y-5">
              {/* Información de capacidades */}
              <div className="bg-[#FAF9F6] border border-zinc-200/50 rounded-2xl p-3.5 space-y-1.5 text-xs text-zinc-650">
                <p className="font-bold text-zinc-800">
                  {booking.rooms_detail && booking.rooms_detail.length > 1
                    ? `Capacidad máxima del grupo: ${booking.rooms_detail.reduce((sum: number, r: any) => sum + getIndividualRoomCapacityRules(r).max, 0)} huéspedes.`
                    : t.capacityInfo(getIndividualRoomCapacityRules(booking).base, getIndividualRoomCapacityRules(booking).max)}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {t.extraChargeInfo}
                </p>
              </div>

              {/* Lista de Habitaciones para Editar */}
              <div className="space-y-6 divide-y divide-zinc-100">
                {(() => {
                  const updateRoomCount = (idx: number, field: 'numAdult' | 'numChild', val: number) => {
                    setTempRooms(prev => prev.map((r, i) => {
                      if (i === idx) {
                        const newVal = Math.max(field === 'numAdult' ? 1 : 0, val);
                        const total = field === 'numAdult' ? newVal + r.numChild : r.numAdult + newVal;
                        if (total > r.max) return r;
                        return { ...r, [field]: newVal };
                      }
                      return r;
                    }));
                  };

                  return tempRooms.map((room, idx) => (
                    <div key={idx} className="pt-4 first:pt-0">
                      <h4 className="font-black text-zinc-850 text-xs uppercase mb-2.5 flex items-center gap-1.5">
                        🏨 {room.room_name}
                      </h4>
                      
                      <div className="bg-[#FAF9F6] border border-zinc-200/35 rounded-xl px-3 py-1.5 mb-3 text-[10.5px] text-zinc-500 font-semibold inline-block">
                        Capacidad base: {room.base} · Máxima: {room.max}
                      </div>

                      <div className="grid grid-cols-2 gap-3.5">
                        {/* Controles de Adultos */}
                        <div className="flex items-center justify-between bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
                          <div>
                            <span className="font-bold text-zinc-800 text-xs block">{t.adultsLabel}</span>
                            <span className="text-[9px] text-zinc-400 block">Edad 13+</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateRoomCount(idx, 'numAdult', room.numAdult - 1)}
                              disabled={room.numAdult <= 1}
                              className="w-7 h-7 rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-855 flex items-center justify-center font-bold text-sm transition-all disabled:opacity-40 cursor-pointer select-none"
                            >
                              -
                            </button>
                            <span className="font-bold text-sm text-zinc-900 w-4 text-center">{room.numAdult}</span>
                            <button
                              type="button"
                              onClick={() => updateRoomCount(idx, 'numAdult', room.numAdult + 1)}
                              disabled={room.numAdult + room.numChild >= room.max}
                              className="w-7 h-7 rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-855 flex items-center justify-center font-bold text-sm transition-all disabled:opacity-40 cursor-pointer select-none"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Controles de Niños */}
                        <div className="flex items-center justify-between bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
                          <div>
                            <span className="font-bold text-zinc-800 text-xs block">{t.childrenLabel}</span>
                            <span className="text-[9px] text-zinc-400 block">Edad 2-12</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateRoomCount(idx, 'numChild', room.numChild - 1)}
                              disabled={room.numChild <= 0}
                              className="w-7 h-7 rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-855 flex items-center justify-center font-bold text-sm transition-all disabled:opacity-40 cursor-pointer select-none"
                            >
                              -
                            </button>
                            <span className="font-bold text-sm text-zinc-900 w-4 text-center">{room.numChild}</span>
                            <button
                              type="button"
                              onClick={() => updateRoomCount(idx, 'numChild', room.numChild + 1)}
                              disabled={room.numAdult + room.numChild >= room.max}
                              className="w-7 h-7 rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-855 flex items-center justify-center font-bold text-sm transition-all disabled:opacity-40 cursor-pointer select-none"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Cálculo en vivo de tarifas si aplica */}
              {(() => {
                const totalTemp = tempRooms.reduce((sum, r) => sum + r.numAdult + r.numChild, 0);
                const totalOriginal = (booking.rooms_detail && booking.rooms_detail.length > 1)
                  ? booking.rooms_detail.reduce((sum: number, r: any) => sum + (r.individual_num_adult !== undefined ? r.individual_num_adult : r.num_adult) + (r.individual_num_child !== undefined ? r.individual_num_child : r.num_child), 0)
                  : (booking.individual_num_adult !== undefined ? booking.individual_num_adult : booking.num_adult) + (booking.individual_num_child !== undefined ? booking.individual_num_child : booking.num_child);

                const groupBase = (booking.rooms_detail && booking.rooms_detail.length > 1)
                  ? booking.rooms_detail.reduce((sum: number, r: any) => sum + getIndividualRoomCapacityRules(r).base, 0)
                  : getIndividualRoomCapacityRules(booking).base;

                const originalExtra = Math.max(0, totalOriginal - groupBase);
                const newExtra = Math.max(0, totalTemp - groupBase);
                const diff = newExtra - originalExtra;
                const adj = diff * 500 * booking.nights;
                const estNewPrice = booking.price + adj;

                if (diff === 0) return null;

                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-1.5 text-xs text-amber-900">
                    <div className="flex justify-between font-bold">
                      <span>{t.priceAdjustmentLabel}</span>
                      <span>{adj > 0 ? `+$${adj}` : `-$${Math.abs(adj)}`} {curr}</span>
                    </div>
                    <div className="flex justify-between font-extrabold text-[13px] border-t border-amber-200/50 pt-1.5">
                      <span>{t.estimatedTotal}</span>
                      <span>${estNewPrice} {curr}</span>
                    </div>
                  </div>
                );
              })()}

              {updateGuestsError && (
                <div className="text-red-600 bg-red-50 border border-red-200 p-3 rounded-2xl text-xs font-bold flex items-center gap-1.5">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{updateGuestsError}</span>
                </div>
              )}
            </div>

            {/* Botones de acción */}
            <div className="flex gap-2.5 pt-4 border-t border-zinc-100 mt-4 shrink-0">
              <button
                type="button"
                onClick={() => setShowEditGuestsModal(false)}
                className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold rounded-xl text-center text-xs transition-all cursor-pointer"
              >
                {lang === 'en' ? 'Cancel' : 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setUpdateGuestsError('');
                  setIsUpdatingGuests(true);
                  try {
                    const res = await fetch('/api/public/reserva/update-guests', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        bookingId: booking.id,
                        rooms: tempRooms.map(r => ({
                          bookingId: r.bookingId,
                          numAdult: r.numAdult,
                          numChild: r.numChild
                        }))
                      })
                    });
                    const json = await res.json();
                    if (json.success) {
                      setBooking((prev: any) => {
                        const newRoomsDetail = prev.rooms_detail ? prev.rooms_detail.map((r: any) => {
                          const update = tempRooms.find(tr => String(tr.bookingId) === String(r.room_id || r.id));
                          if (update) {
                            return {
                              ...r,
                              num_adult: update.numAdult,
                              num_child: update.numChild,
                              individual_num_adult: update.numAdult,
                              individual_num_child: update.numChild
                            };
                          }
                          return r;
                        }) : null;

                        const mainUpdate = tempRooms.find(tr => String(tr.bookingId) === String(prev.id));
                        const individualAdults = mainUpdate ? mainUpdate.numAdult : prev.individual_num_adult;
                        const individualChildren = mainUpdate ? mainUpdate.numChild : prev.individual_num_child;

                        const totalAdults = tempRooms.reduce((sum, r) => sum + r.numAdult, 0);
                        const totalChildren = tempRooms.reduce((sum, r) => sum + r.numChild, 0);

                        return {
                          ...prev,
                          rooms_detail: newRoomsDetail,
                          individual_num_adult: individualAdults,
                          individual_num_child: individualChildren,
                          num_adult: totalAdults,
                          num_child: totalChildren,
                          price: json.price,
                          balance: json.balance
                        };
                      });
                      setShowEditGuestsModal(false);
                    } else {
                      setUpdateGuestsError(json.error || 'Error al guardar');
                    }
                  } catch (e: any) {
                    setUpdateGuestsError(e.message || 'Error de conexión');
                  } finally {
                    setIsUpdatingGuests(false);
                  }
                }}
                disabled={isUpdatingGuests}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-center text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isUpdatingGuests && <Loader2 className="animate-spin" size={14} />}
                {isUpdatingGuests ? (lang === 'en' ? 'Saving...' : 'Guardando...') : (lang === 'en' ? 'Confirm Changes' : 'Confirmar Cambios')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ADVERTENCIA PARA OTAs */}
      {showOtaWarningModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-zinc-150 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <h3 className="font-black text-zinc-900 text-base uppercase tracking-wider">
                {lang === 'en' ? 'Modify Booking' : 'Modificar Reserva'}
              </h3>
              <button
                onClick={() => setShowOtaWarningModal(false)}
                className="text-zinc-400 hover:text-zinc-650 p-1.5 rounded-full hover:bg-zinc-100 transition-all cursor-pointer animate-none"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm text-zinc-650 leading-relaxed font-medium">
              <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto border border-amber-100 mb-2">
                <Info size={24} />
              </div>
              <p className="text-center text-zinc-800 font-extrabold text-[14px]">
                {lang === 'en'
                  ? `Reservation via ${booking.channel}`
                  : `Reservación realizada mediante ${booking.channel}`}
              </p>
              <p className="text-center text-xs">
                {lang === 'en'
                  ? `Since your booking was made through ${booking.channel}, we are unable to modify the guest details directly from this portal.`
                  : `Dado que tu reservación se realizó a través de ${booking.channel}, no es posible modificar el número de huéspedes o la distribución desde este portal.`}
              </p>
              <p className="text-center text-xs text-zinc-500">
                {lang === 'en'
                  ? `Please log in to your ${booking.channel} account to request any modifications. This ensures your rates, policies, and booking details stay correctly updated.`
                  : `Por favor, ingresa a tu cuenta en la aplicación o página de ${booking.channel} para solicitar el cambio. Esto garantiza que tus tarifas, políticas e información queden actualizados de forma segura.`}
              </p>
            </div>

            <div className="mt-6">
              <button
                onClick={() => setShowOtaWarningModal(false)}
                className="w-full py-3.5 bg-zinc-950 hover:bg-black text-white font-bold text-xs rounded-xl uppercase tracking-wider transition-all shadow-md active:scale-98 cursor-pointer"
              >
                {lang === 'en' ? 'Close' : 'Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL INCIDENCIA MANTENIMIENTO */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-zinc-150 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <h3 className="font-black text-zinc-900 text-base uppercase tracking-wider">{t.maintenanceTitle}</h3>
              <button
                onClick={() => setShowMaintenanceModal(false)}
                className="text-zinc-400 hover:text-zinc-650 p-1.5 rounded-full hover:bg-zinc-100 transition-all cursor-pointer animate-none"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {maintenanceSuccess ? (
                <div className="text-center py-6 space-y-3">
                  <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">✓</div>
                  <p className="text-zinc-800 font-extrabold text-sm">{t.reportSuccess}</p>
                  <button
                    onClick={() => setShowMaintenanceModal(false)}
                    className="px-6 py-2 bg-zinc-800 text-white text-xs font-bold rounded-xl hover:bg-zinc-950 transition-all cursor-pointer mt-2"
                  >
                    {lang === 'en' ? 'Close' : 'Cerrar'}
                  </button>
                </div>
              ) : (
                <>
                  {/* Ubicación */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">
                      {t.maintenanceTypeLabel}
                    </label>
                    {(() => {
                      const roomNum = booking.room_name.match(/\((\d+)\)/)?.[1] || booking.room_name.replace(/\D/g, '') || '';
                      const roomOptionVal = lang === 'en' ? `My Room (${roomNum})` : `Mi Habitación (${roomNum})`;
                      return (
                        <select
                          value={maintenanceType}
                          onChange={(e) => setMaintenanceType(e.target.value)}
                          className="w-full bg-[#FAF9F6] border border-zinc-200 rounded-xl p-3 text-xs text-zinc-800 focus:outline-none focus:border-indigo-500 font-bold transition-all cursor-pointer"
                        >
                          <option value={roomOptionVal}>{roomOptionVal}</option>
                          <option value="Alberca">{lang === 'en' ? 'Pool 🏊‍♂️' : 'Alberca 🏊‍♂️'}</option>
                          <option value="Patio / Jardín">{lang === 'en' ? 'Patio / Garden 🏡' : 'Patio / Jardín 🏡'}</option>
                          <option value="Entrada / Pasillos">{lang === 'en' ? 'Entrance / Corridors 🚪' : 'Entrada / Pasillos 🚪'}</option>
                          <option value="Estacionamiento">{lang === 'en' ? 'Parking 🚗' : 'Estacionamiento 🚗'}</option>
                          <option value="Otro">{lang === 'en' ? 'Other place 📍' : 'Otro lugar 📍'}</option>
                        </select>
                      );
                    })()}
                  </div>

                  {/* Descripción */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">
                      {lang === 'en' ? 'Details' : 'Detalles del Reporte'}
                    </label>
                    <textarea
                      value={maintenanceDesc}
                      onChange={(e) => setMaintenanceDesc(e.target.value)}
                      placeholder={t.maintenanceDescPlaceholder}
                      rows={4}
                      className="w-full bg-[#FAF9F6] border border-zinc-200 rounded-xl p-3 text-xs text-zinc-800 focus:outline-none focus:border-indigo-500 font-medium transition-all"
                    />
                  </div>

                  {maintenanceError && (
                    <div className="text-red-600 bg-red-50 border border-red-200 p-3 rounded-2xl text-xs font-bold flex items-center gap-1.5">
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>{maintenanceError}</span>
                    </div>
                  )}

                  {/* Botones */}
                  <div className="flex gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowMaintenanceModal(false)}
                      className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold rounded-xl text-center text-xs transition-all cursor-pointer"
                    >
                      {lang === 'en' ? 'Cancel' : 'Cancelar'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!maintenanceDesc.trim()) {
                          setMaintenanceError(lang === 'en' ? 'Please provide details.' : 'Por favor ingresa los detalles del problema.');
                          return;
                        }
                        setMaintenanceError('');
                        setIsSubmittingMaintenance(true);
                        try {
                          const res = await fetch('/api/public/reserva/report-maintenance', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              bookingId: booking.id,
                              type: maintenanceType,
                              description: maintenanceDesc
                            })
                          });
                          const json = await res.json();
                          if (json.success) {
                            setMaintenanceSuccess(true);
                          } else {
                            setMaintenanceError(json.error || 'Error al enviar reporte');
                          }
                        } catch (e: any) {
                          setMaintenanceError(e.message || 'Error de conexión');
                        } finally {
                          setIsSubmittingMaintenance(false);
                        }
                      }}
                      disabled={isSubmittingMaintenance}
                      className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-center text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmittingMaintenance && <Loader2 className="animate-spin" size={14} />}
                      {t.sendReport}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {zoomImage && (
        <div 
          className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setZoomImage(null)}
        >
          <button 
            type="button"
            onClick={() => setZoomImage(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-95 shadow-md"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
          <img 
            src={zoomImage} 
            alt="Zoomed DNI" 
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-200" 
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}
    </div>
  );
}
