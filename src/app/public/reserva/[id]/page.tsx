'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
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
  MessageSquare
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

// Mapeo de fichas técnicas por tipo de habitación
const ROOM_FEATURES: Record<string, { title: string; capacity: number; features: string[] }> = {
  '1rec': {
    title: 'Condominio de 1 Recámara',
    capacity: 4,
    features: [
      '1 recámara con Smart TV',
      '2 camas matrimoniales o 1 King Size',
      '1 baño completo',
      'Sala de estar cómoda',
      'Comedor para 4 personas',
      'Cocina equipada con utensilios',
      'WiFi de alta velocidad',
      'Aire acondicionado'
    ]
  },
  '2rec': {
    title: 'Condominio de 2 Recámaras',
    capacity: 6,
    features: [
      '2 recámaras con Smart TV',
      '1 cama King Size y 2 camas matrimoniales',
      '1 baño completo',
      'Sala espaciosa',
      'Comedor para 6 personas',
      'Barra desayunadora',
      'Cocina totalmente equipada',
      'WiFi de alta velocidad',
      'Patio de lavado (sin lavadora ni secadora)',
      'Aire acondicionado solo en recámaras'
    ]
  },
  '3rec': {
    title: 'Condominio de 3 Recámaras',
    capacity: 8,
    features: [
      '3 recámaras con Smart TV',
      '1 cama King Size y 4 camas matrimoniales',
      '3 baños completos',
      'Sala amplia y acogedora',
      'Comedor para 8 personas',
      'Barra desayunadora',
      'Cocina totalmente equipada',
      'WiFi de alta velocidad',
      'Patio de lavado (sin lavadora ni secadora)',
      'Aire acondicionado solo en recámaras'
    ]
  },
  'doble': {
    title: 'Habitación Doble',
    capacity: 2,
    features: [
      '1 recámara con Smart TV',
      '2 camas dobles o 1 cama King Size',
      '1 baño completo',
      'Frigobar y cafetera',
      'WiFi de alta velocidad',
      'Aire acondicionado'
    ]
  },
  'casa': {
    title: 'Casa Vacacional de 3 Dormitorios',
    capacity: 12,
    features: [
      '3 recámaras espaciosas',
      '2 camas King Size y 3 camas matrimoniales',
      'Baños completos',
      'Sala y comedor familiares',
      'Cocina totalmente equipada',
      'Acceso directo / Alberca privada',
      'WiFi de alta velocidad',
      'Aire acondicionado en recámaras'
    ]
  }
};

const COMMON_PHOTOS = [
  'https://media.xmlcal.com/pic/p0032/7286/37.png',
  'https://media.xmlcal.com/pic/p0032/7286/38.png',
  'https://media.xmlcal.com/pic/p0032/7286/39.png',
  'https://media.xmlcal.com/pic/p0032/7286/40.png',
  'https://media.xmlcal.com/pic/p0032/7286/41.png',
  'https://media.xmlcal.com/pic/p0032/7286/42.png',
  'https://media.xmlcal.com/pic/p0032/7286/43.png',
  'https://media.xmlcal.com/pic/p0032/7286/44.png',
  'https://media.xmlcal.com/pic/p0032/7286/45.png',
  'https://media.xmlcal.com/pic/p0032/7286/46.png'
];

const ROOM_PHOTOS: Record<string, string[]> = {
  'doble': [
    'https://media.xmlcal.com/pic/p0032/7286/01.png',
    'https://media.xmlcal.com/pic/p0032/7286/02.png',
    'https://media.xmlcal.com/pic/p0032/7286/03.png'
  ],
  '1rec': [
    'https://media.xmlcal.com/pic/p0032/7286/04.png',
    'https://media.xmlcal.com/pic/p0032/7286/05.png',
    'https://media.xmlcal.com/pic/p0032/7286/06.png',
    'https://media.xmlcal.com/pic/p0032/7286/07.png'
  ],
  '2rec': [
    'https://media.xmlcal.com/pic/p0032/7286/08.png',
    'https://media.xmlcal.com/pic/p0032/7286/09.png',
    'https://media.xmlcal.com/pic/p0032/7286/10.png',
    'https://media.xmlcal.com/pic/p0032/7286/11.png',
    'https://media.xmlcal.com/pic/p0032/7286/12.png',
    'https://media.xmlcal.com/pic/p0032/7286/13.png',
    'https://media.xmlcal.com/pic/p0032/7286/14.png',
    'https://media.xmlcal.com/pic/p0032/7286/15.png',
    'https://media.xmlcal.com/pic/p0032/7286/16.png',
    'https://media.xmlcal.com/pic/p0032/7286/17.png'
  ],
  '3rec': [
    'https://media.xmlcal.com/pic/p0032/7286/18.png',
    'https://media.xmlcal.com/pic/p0032/7286/19.png',
    'https://media.xmlcal.com/pic/p0032/7286/31.png',
    'https://media.xmlcal.com/pic/p0032/7286/32.png',
    'https://media.xmlcal.com/pic/p0032/7286/33.png',
    'https://media.xmlcal.com/pic/p0032/7286/34.png',
    'https://media.xmlcal.com/pic/p0032/7286/35.png',
    'https://media.xmlcal.com/pic/p0032/7286/36.png'
  ],
  'casa': [
    'https://media.xmlcal.com/pic/p0032/7286/20.png',
    'https://media.xmlcal.com/pic/p0032/7286/21.png',
    'https://media.xmlcal.com/pic/p0032/7286/22.png',
    'https://media.xmlcal.com/pic/p0032/7286/23.png',
    'https://media.xmlcal.com/pic/p0032/7286/24.png',
    'https://media.xmlcal.com/pic/p0032/7286/25.png',
    'https://media.xmlcal.com/pic/p0032/7286/26.png',
    'https://media.xmlcal.com/pic/p0032/7286/27.png',
    'https://media.xmlcal.com/pic/p0032/7286/28.png',
    'https://media.xmlcal.com/pic/p0032/7286/29.png',
    'https://media.xmlcal.com/pic/p0032/7286/30.png'
  ]
};

const PHOTO_CAPTIONS: Record<string, string[]> = {
  'doble': [
    'Habitación Estándar - Cama principal',
    'Habitación Estándar - Vista general',
    'Habitación Estándar - Baño y detalles'
  ],
  '1rec': [
    'Condo 1 Recámara - Sala y comedor',
    'Condo 1 Recámara - Recámara principal',
    'Condo 1 Recámara - Cocina equipada',
    'Condo 1 Recámara - Baño completo'
  ],
  '2rec': [
    'Condo 2 Recámaras - Estancia principal',
    'Condo 2 Recámaras - Recámara principal King',
    'Condo 2 Recámaras - Segunda recámara doble',
    'Condo 2 Recámaras - Cocina equipada',
    'Condo 2 Recámaras - Baño',
    'Condo 2 Recámaras - Vista de estancia',
    'Condo 2 Recámaras - Comedor',
    'Condo 2 Recámaras - Detalles recámara principal',
    'Condo 2 Recámaras - Pasillo interior',
    'Condo 2 Recámaras - Terraza'
  ],
  '3rec': [
    'Condo 3 Recámaras - Sala y comedor',
    'Condo 3 Recámaras - Cocina equipada',
    'Condo 3 Recámaras - Recámara principal King',
    'Condo 3 Recámaras - Segunda recámara doble',
    'Condo 3 Recámaras - Tercera recámara doble',
    'Condo 3 Recámaras - Baño completo',
    'Condo 3 Recámaras - Vista de balcón',
    'Condo 3 Recámaras - Área social'
  ],
  'casa': [
    'Casa de Lujo - Estancia principal de lujo',
    'Casa de Lujo - Cocina de granito y comedor',
    'Casa de Lujo - Recámara principal King',
    'Casa de Lujo - Segunda recámara familiar',
    'Casa de Lujo - Tercera recámara familiar',
    'Casa de Lujo - Baño principal espacioso',
    'Casa de Lujo - Balcón y vista al exterior',
    'Casa de Lujo - Detalles de diseño',
    'Casa de Lujo - Entrada independiente',
    'Casa de Lujo - Sala familiar de TV',
    'Casa de Lujo - Área de desayunador'
  ]
};

const COMMON_CAPTIONS = [
  'Áreas Comunes - Acceso y recepción',
  'Áreas Comunes - Fachada principal',
  'Áreas Comunes - Alberca y área de asoleadero',
  'Áreas Comunes - Alberca principal',
  'Áreas Comunes - Jardines tropicales',
  'Áreas Comunes - Terraza común',
  'Áreas Comunes - Camastros y alberca',
  'Áreas Comunes - Fachada y acceso vehicular',
  'Áreas Comunes - Vista exterior de jardines',
  'Áreas Comunes - Iluminación nocturna de fachada'
];

const COMMON_CAPTIONS_EN = [
  'Common Areas - Access & Front Desk',
  'Common Areas - Main Facade',
  'Common Areas - Swimming Pool & Sun Deck',
  'Common Areas - Main Pool',
  'Common Areas - Tropical Gardens',
  'Common Areas - Shared Terrace',
  'Common Areas - Lounge Chairs & Pool',
  'Common Areas - Facade & Vehicle Entrance',
  'Common Areas - Garden Exterior View',
  'Common Areas - Nocturnal Facade Lighting'
];

const ROOM_FEATURES_EN: Record<string, { title: string; capacity: number; features: string[] }> = {
  '1rec': {
    title: '1-Bedroom Condominium',
    capacity: 4,
    features: [
      '1 bedroom with Smart TV',
      '2 double beds or 1 King Size bed',
      '1 full bathroom',
      'Comfortable living room',
      'Dining area for 4 people',
      'Fully equipped kitchen',
      'High-speed WiFi',
      'Air conditioning'
    ]
  },
  '2rec': {
    title: '2-Bedroom Condominium',
    capacity: 6,
    features: [
      '2 bedrooms with Smart TV',
      '1 King Size bed and 2 double beds',
      '1 full bathroom',
      'Spacious living room',
      'Dining area for 6 people',
      'Breakfast bar',
      'Fully equipped kitchen',
      'High-speed WiFi',
      'Laundry patio (no washer/dryer)',
      'Air conditioning in bedrooms only'
    ]
  },
  '3rec': {
    title: '3-Bedroom Condominium',
    capacity: 8,
    features: [
      '3 bedrooms with Smart TV',
      '1 King Size bed and 4 double beds',
      '3 full bathrooms',
      'Spacious and cozy living room',
      'Dining area for 8 people',
      'Breakfast bar',
      'Fully equipped kitchen',
      'High-speed WiFi',
      'Laundry patio (no washer/dryer)',
      'Air conditioning in bedrooms only'
    ]
  },
  'doble': {
    title: 'Double Room',
    capacity: 2,
    features: [
      '1 bedroom with Smart TV',
      '2 double beds or 1 King Size bed',
      '1 full bathroom',
      'Mini-fridge and coffee maker',
      'High-speed WiFi',
      'Air conditioning'
    ]
  },
  'casa': {
    title: '3-Bedroom Vacation Home',
    capacity: 12,
    features: [
      '3 spacious bedrooms',
      '2 King Size beds and 3 double beds',
      'Full bathrooms',
      'Family living and dining room',
      'Fully equipped kitchen',
      'Direct access / Private pool',
      'High-speed WiFi',
      'Air conditioning in bedrooms'
    ]
  }
};

const PHOTO_CAPTIONS_EN: Record<string, string[]> = {
  'doble': [
    'Standard Room - Main Bed',
    'Standard Room - General View',
    'Standard Room - Bathroom and Details'
  ],
  '1rec': [
    '1-Bedroom Condo - Living & Dining Area',
    '1-Bedroom Condo - Main Bedroom',
    '1-Bedroom Condo - Equipped Kitchen',
    '1-Bedroom Condo - Full Bathroom'
  ],
  '2rec': [
    '2-Bedroom Condo - Main Living Area',
    '2-Bedroom Condo - King Main Bedroom',
    '2-Bedroom Condo - Second Double Bedroom',
    '2-Bedroom Condo - Equipped Kitchen',
    '2-Bedroom Condo - Bathroom',
    '2-Bedroom Condo - Living Room View',
    '2-Bedroom Condo - Dining Area',
    '2-Bedroom Condo - Main Bedroom Details',
    '2-Bedroom Condo - Interior Hallway',
    '2-Bedroom Condo - Terrace'
  ],
  '3rec': [
    '3-Bedroom Condo - Living & Dining Area',
    '3-Bedroom Condo - Equipped Kitchen',
    '3-Bedroom Condo - King Main Bedroom',
    '3-Bedroom Condo - Second Double Bedroom',
    '3-Bedroom Condo - Third Double Bedroom',
    '3-Bedroom Condo - Full Bathroom',
    '3-Bedroom Condo - Balcony View',
    '3-Bedroom Condo - Social Area'
  ],
  'casa': [
    'Luxury House - Main Luxury Living Room',
    'Luxury House - Granite Kitchen & Dining Room',
    'Luxury House - King Main Bedroom',
    'Luxury House - Second Family Bedroom',
    'Luxury House - Third Family Bedroom',
    'Luxury House - Spacious Main Bathroom',
    'Luxury House - Balcony & Outdoor View',
    'Luxury House - Design Details',
    'Luxury House - Independent Entrance',
    'Luxury House - Family TV Room',
    'Luxury House - Breakfast Area'
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
    partialPaymentTitle: 'Pago Parcial: Saldo Pendiente',
    partialPaymentDesc: (deposit: string, balance: string) => `Has cubierto tu anticipo de $${deposit} MXN. Recuerda liquidar el saldo restante de $${balance} MXN antes de tu llegada o en recepción durante tu check-in.`,
    
    summaryTitle: 'Resumen de tu Estancia',
    guest: 'Huésped',
    bookingId: 'ID de Reserva',
    accommodation: 'Alojamiento',
    checkin: 'Fecha de Llegada',
    checkinTime: '(Check-in: 3:00 PM)',
    checkout: 'Fecha de Salida',
    checkoutTime: '(Check-out: 12:00 PM)',
    nights: (n: number) => `${n} noche${n !== 1 ? 's' : ''}`,
    guests: (g: number) => `${g} persona${g !== 1 ? 's' : ''}`,
    
    accountTitle: 'Estado de Cuenta',
    totalEstancia: 'Total de la estancia:',
    anticipoRecibido: 'Anticipo Recibido:',
    saldoRestante: 'Saldo restante (adeudo):',
    anticipoRequerido: 'Anticipo Requerido (50%):',
    anticipoDepositado: 'Anticipo depositado:',
    
    paymentTitle: 'Formas de Pago',
    paymentTitlePending: 'Liquidar Saldo Pendiente',
    selectAmount: 'Selecciona el monto a abonar:',
    anticipoSelector: 'Anticipo (50%)',
    totalSelector: 'Total (100%)',
    amountSelected: 'Monto a pagar seleccionado',
    optionCard: 'Opción 1: Tarjeta de Crédito / Débito (Pasarela)',
    payWithCard: 'Pagar con Mercado Pago',
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
    stayGuideBtn: '📖 Ver Fotografías y Guía del Alojamiento',
    stayPolicies: '🚫 Políticas Básicas',
    policyPets: 'No se admiten mascotas bajo ningún concepto.',
    policySmoke: 'Espacio 100% libre de humo (solo permitido fumar en áreas exteriores designadas).',
    policyHours: 'El horario de entrada es de 3:00 PM a 8:00 PM. Salida a las 12:00 PM.',
    locationDesc: 'Condominios Jaroje se encuentra en Huatulco, Oaxaca. Haz clic en el botón de abajo para abrir la ubicación exacta en Google Maps:',
    talkReception: 'Hablar con Recepción por WhatsApp',
    footerRights: '© 2026 Condominios Jaroje. Todos los derechos reservados.',
    footerHelp: '¿Necesitas ayuda? Escríbenos a nuestro WhatsApp oficial: 958 116 8698',
    lightboxOf: 'of',
    lightboxControls: 'Toca a los lados para navegar • Condominios Jaroje'
  },
  en: {
    title: 'JAROJE CONDOMINIUMS',
    subtitle: 'Your paradise in Huatulco, Oaxaca 🌴',
    loading: 'Loading your reservation details...',
    errorTitle: 'Oops! Something went wrong',
    errorText: 'The requested reservation does not exist or has been cancelled.',
    whatsappContact: 'Contact on WhatsApp',
    
    state_solicitud: 'Request received',
    state_pago_pendiente: 'Payment pending',
    state_confirmada: 'Booking confirmed',
    state_checkin_pendiente: 'Check-in pending',
    state_hospedado: 'In-house',
    state_finalizada: 'Completed',
    
    stateTitle: 'Reservation Status',
    partialPaymentTitle: 'Partial Payment: Balance Due',
    partialPaymentDesc: (deposit: string, balance: string) => `You have paid your deposit of $${deposit} MXN. Please remember to settle the remaining balance of $${balance} MXN before your arrival or at the front desk during check-in.`,
    
    summaryTitle: 'Your Stay Summary',
    guest: 'Guest',
    bookingId: 'Reservation ID',
    accommodation: 'Accommodation',
    checkin: 'Arrival Date',
    checkinTime: '(Check-in: 3:00 PM)',
    checkout: 'Departure Date',
    checkoutTime: '(Check-out: 12:00 PM)',
    nights: (n: number) => `${n} night${n !== 1 ? 's' : ''}`,
    guests: (g: number) => `${g} guest${g !== 1 ? 's' : ''}`,
    
    accountTitle: 'Statement of Account',
    totalEstancia: 'Total stay amount:',
    anticipoRecibido: 'Deposit Received:',
    saldoRestante: 'Remaining balance (due):',
    anticipoRequerido: 'Required Deposit (50%):',
    anticipoDepositado: 'Deposit paid:',
    
    paymentTitle: 'Payment Methods',
    paymentTitlePending: 'Settle Remaining Balance',
    selectAmount: 'Select amount to pay:',
    anticipoSelector: 'Deposit (50%)',
    totalSelector: 'Total (100%)',
    amountSelected: 'Selected payment amount',
    optionCard: 'Option 1: Credit / Debit Card (Gateway)',
    payWithCard: 'Pay with Mercado Pago',
    cardNote: 'If you pay with a card, sending a receipt is not required.',
    optionTransfer: 'Option 2: Bank Transfer or Cash Deposit',
    payWithTransfer: 'Pay by Bank Transfer',
    transferNote: 'Obtain the official bank details and upload your receipt directly to staySync.',
    
    featuresTitle: 'Accommodation Features',
    capacity: (c: number) => `Capacity: ${c} Guests`,
    
    photosTitle: 'Photo Gallery',
    photosDesc: 'View actual photos of your accommodation and the beautiful common areas of Jaroje Condominiums.',
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
    stayGuideBtn: '📖 View Photos and Accommodation Guide',
    stayPolicies: '🚫 Basic Policies',
    policyPets: 'No pets allowed under any circumstances.',
    policySmoke: '100% Smoke-free space (only smoking in designated outdoor areas permitted).',
    policyHours: 'Check-in time is from 3:00 PM to 8:00 PM. Check-out is at 12:00 PM.',
    locationDesc: 'Jaroje Condominiums is located in Huatulco, Oaxaca. Click the button below to open the exact location in Google Maps:',
    talkReception: 'Chat with Reception on WhatsApp',
    footerRights: '© 2026 Jaroje Condominiums. All rights reserved.',
    footerHelp: 'Need help? Write to our official WhatsApp: +52 958 116 8698',
    lightboxOf: 'of',
    lightboxControls: 'Tap the sides to navigate • Jaroje Condominiums'
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

export default function PublicReservaPage() {
  const params = useParams();
  const id = params?.id;

  const [booking, setBooking] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentSplit, setPaymentSplit] = useState<'50' | '100'>('50');
  const [lang, setLang] = useState<'es' | 'en'>('es');

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
        const res = await fetch(`/api/public/reserva?id=${id}`);
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
    const lower = (roomName || '').toLowerCase();
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
  const hasPaid = booking.deposit > 0 || booking.is_acknowledged;
  const isOta = ['Airbnb', 'Booking.com', 'Expedia'].includes(booking.channel || '');

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
  } else if (isCheckedOut || (checkInDate && today > new Date(booking.check_out))) {
    currentState = 'finalizada';
    statusMessage = lang === 'en'
      ? 'Thank you for staying with us! We hope to see you again soon in Huatulco. Have a safe trip back!'
      : '¡Gracias por hospedarte con nosotros! Esperamos verte de nuevo muy pronto en Huatulco. ¡Buen viaje de regreso!';
  } else if (isCheckedIn) {
    currentState = 'hospedado';
    statusMessage = lang === 'en'
      ? 'Welcome to Jaroje Condominiums! We hope you are enjoying your stay. If you need anything, our team is at your service.'
      : '¡Bienvenido a Condominios Jaroje! Esperamos que estés disfrutando de tu estancia. Si necesitas algo, nuestro equipo está a tu disposición.';
  } else if (hasPaid && checkInLimit && today >= checkInLimit) {
    currentState = 'checkin_pendiente';
    statusMessage = lang === 'en'
      ? 'Your room is almost ready. Upon arrival, the front desk staff will help you complete your digital registration and contract signing.'
      : 'Tu habitación está casi lista. A tu llegada, el personal de recepción te ayudará a completar tu registro y firma digital de contrato.';
  } else if (hasPaid || isOta) {
    currentState = 'confirmada';
    statusMessage = lang === 'en'
      ? 'Your stay is confirmed! Everything is ready for your arrival. We will send you check-in instructions one day before your entry.'
      : '¡Tu estancia está confirmada! Todo está listo para tu llegada. Te enviaremos las instrucciones de check-in un día antes de tu entrada.';
  } else if (hoursSinceCreation > 2) {
    currentState = 'pago_pendiente';
    statusMessage = lang === 'en'
      ? 'Your reservation is pending payment. Please upload your deposit receipt to avoid automatic cancellation of your stay.'
      : 'Tu reservación está pendiente de pago. Por favor, sube tu comprobante de anticipo para evitar la cancelación automática de tu estancia.';
  } else {
    currentState = 'solicitud';
    statusMessage = lang === 'en'
      ? 'We have received your reservation request. To secure your stay, please make your deposit payment in the next few hours.'
      : 'Hemos recibido tu solicitud de reservación. Para asegurar tu estancia, realiza el depósito de anticipo en las próximas horas.';
  }

  // Pasos de la barra de progreso
  const steps = [
    { label: lang === 'en' ? 'Request received' : 'Solicitud recibida', state: 'solicitud' },
    { label: lang === 'en' ? 'Payment pending' : 'Pago pendiente', state: 'pago_pendiente' },
    { label: lang === 'en' ? 'Booking confirmed' : 'Reservación confirmada', state: 'confirmada' },
    { label: lang === 'en' ? 'Check-in pending' : 'Check-in pending', state: 'checkin_pendiente' },
    { label: lang === 'en' ? 'In-house' : 'Hospedado', state: 'hospedado' },
    { label: lang === 'en' ? 'Completed' : 'Finalizada', state: 'finalizada' }
  ];

  const activeIndex = steps.findIndex(s => s.state === currentState);

  // Características del tipo de habitación
  const roomTypeKey = getRoomTypeKey(booking.room_name);
  const featuresData = ROOM_FEATURES[roomTypeKey] || ROOM_FEATURES['doble'];

  // Fotos y descripciones del Carrusel
  const photos = [...(ROOM_PHOTOS[roomTypeKey] || ROOM_PHOTOS['doble']), ...COMMON_PHOTOS];
  const captions = lang === 'en'
    ? [...(PHOTO_CAPTIONS_EN[roomTypeKey] || PHOTO_CAPTIONS_EN['doble']), ...COMMON_CAPTIONS_EN]
    : [...(PHOTO_CAPTIONS[roomTypeKey] || PHOTO_CAPTIONS['doble']), ...COMMON_CAPTIONS];

  const anticipoRequerido = Math.round(booking.price * 0.5);
  const t = TRANSLATIONS[lang];

  return (
    <div className="min-h-screen bg-[#F6F5F2] text-zinc-900 pb-16 font-sans">
      {/* Header Premium */}
      <header className="bg-zinc-900 text-white text-center py-8 px-4 shadow-md relative overflow-hidden flex flex-col items-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent)] pointer-events-none" />
        
        {/* Selector de Idioma Flotante Derecho */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/10 backdrop-blur-sm p-1 rounded-full border border-white/10 z-25 text-[9px] font-bold">
          <button 
            onClick={() => changeLanguage('es')}
            className={`px-2 py-0.5 rounded-full transition-all cursor-pointer ${lang === 'es' ? 'bg-white text-zinc-950 shadow-sm' : 'text-white/70 hover:text-white'}`}
          >
            ESP 🇪🇸
          </button>
          <button 
            onClick={() => changeLanguage('en')}
            className={`px-2 py-0.5 rounded-full transition-all cursor-pointer ${lang === 'en' ? 'bg-white text-zinc-950 shadow-sm' : 'text-white/70 hover:text-white'}`}
          >
            ENG 🇺🇸
          </button>
        </div>

        <h1 className="text-xl md:text-2xl font-black uppercase tracking-wider text-amber-100">{t.title}</h1>
        <p className="text-zinc-400 text-xs mt-1 font-medium tracking-wide uppercase">{t.subtitle}</p>
      </header>

      <main className="max-w-md mx-auto px-4 mt-6 space-y-5">

        {/* 1. BARRA DE PROGRESO */}
        {currentState === 'liberada' ? (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-center shadow-sm">
            <div className="w-12 h-12 bg-rose-105 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-rose-100">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-rose-900 font-extrabold text-base tracking-tight uppercase">
              {lang === 'en' ? 'Availability Released' : 'Disponibilidad Liberada'}
            </h3>
            <p className="text-rose-700 text-xs mt-1.5 leading-relaxed">{statusMessage}</p>
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
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                        isCompleted 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : isActive 
                            ? 'bg-white border-2 border-indigo-600 text-indigo-600 shadow-md ring-4 ring-indigo-50 animate-pulse' 
                            : 'bg-white border border-zinc-250 text-zinc-400'
                      }`}
                    >
                      {isCompleted ? <Check size={14} className="stroke-[3]" /> : idx + 1}
                    </div>
                    <span 
                      className={`text-[8.5px] mt-1.5 font-bold tracking-tight text-center max-w-[62px] block leading-tight ${
                        isActive ? 'text-indigo-600 font-black' : isCompleted ? 'text-zinc-700' : 'text-zinc-400'
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
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{booking.id}</strong>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100 col-span-2">
              <span className="text-zinc-500 font-semibold block">{t.accommodation}</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{booking.room_name}</strong>
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
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">{lang === 'en' ? 'Guests' : 'Huéspedes'}</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{t.guests(booking.num_adult + booking.num_child)}</strong>
            </div>
          </div>
        </div>

        {/* 4. ESTADO DE CUENTA */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-3.5">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <Clock size={18} className="text-indigo-600" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">{t.accountTitle}</h3>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center text-zinc-650">
              <span>{t.totalEstancia}</span>
              <strong className="text-zinc-900 font-extrabold">${booking.price.toLocaleString('es-MX')} MXN</strong>
            </div>
            {hasPaid ? (
              <>
                <div className="flex justify-between items-center text-emerald-600 font-semibold bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100">
                  <span className="flex items-center gap-1">{t.anticipoRecibido}</span>
                  <strong className="font-black">${booking.deposit.toLocaleString('es-MX')} MXN</strong>
                </div>
                <div className="flex justify-between items-center text-zinc-800 pt-2 border-t border-dashed border-zinc-200">
                  <span className="font-bold">{t.saldoRestante}</span>
                  <strong className="text-indigo-600 font-black text-base">${booking.balance.toLocaleString('es-MX')} MXN</strong>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center text-indigo-600 font-semibold bg-indigo-50/50 px-3 py-2 rounded-xl border border-indigo-100/80">
                  <span>{t.anticipoRequerido}</span>
                  <strong className="font-black">${anticipoRequerido.toLocaleString('es-MX')} MXN</strong>
                </div>
                <div className="flex justify-between items-center text-zinc-500">
                  <span>{t.anticipoDepositado}</span>
                  <strong className="font-bold">$0 MXN</strong>
                </div>
                <div className="flex justify-between items-center text-zinc-800 pt-2 border-t border-dashed border-zinc-200">
                  <span className="font-bold">{t.saldoRestante}</span>
                  <strong className="text-indigo-600 font-black text-base">${booking.price.toLocaleString('es-MX')} MXN</strong>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 5. PAGO / CARGA DE COMPROBANTE (Solo cuando aplica saldo pendiente) */}
        {booking.balance > 0 && currentState !== 'liberada' && !isCheckedOut && (() => {
          const targetAmount = booking.deposit === 0 
            ? (paymentSplit === '50' ? booking.price * 0.5 : booking.price)
            : booking.balance;

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
                      className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex flex-col items-center justify-center ${
                        paymentSplit === '50'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-zinc-600 hover:text-zinc-950 bg-transparent'
                      }`}
                    >
                      <span>{t.anticipoSelector}</span>
                      <span className={`text-[10px] opacity-90 mt-0.5 ${paymentSplit === '50' ? 'text-indigo-200' : 'text-zinc-500'}`}>
                        ${(booking.price * 0.5).toLocaleString('es-MX')} MXN
                      </span>
                    </button>
                    <button
                      onClick={() => setPaymentSplit('100')}
                      className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex flex-col items-center justify-center ${
                        paymentSplit === '100'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-zinc-600 hover:text-zinc-950 bg-transparent'
                      }`}
                    >
                      <span>{t.totalSelector}</span>
                      <span className={`text-[10px] opacity-90 mt-0.5 ${paymentSplit === '100' ? 'text-indigo-200' : 'text-zinc-500'}`}>
                        ${booking.price.toLocaleString('es-MX')} MXN
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Monto seleccionado explicito */}
              <div className="bg-indigo-50/40 border border-indigo-100/50 rounded-xl p-3.5 text-center">
                <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider block">{t.amountSelected}</span>
                <span className="text-xl font-black text-indigo-950">
                  ${targetAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </span>
              </div>

              {/* Método 1: Tarjeta */}
              {(booking.portal_settings?.show_card_payment ?? true) && (
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
                    <p className="text-[10px] text-zinc-500 italic text-center mt-1">{t.cardNote}</p>
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

        {/* 6. CARACTERÍSTICAS DEL ALOJAMIENTO */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <Home size={18} className="text-indigo-600" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">{t.featuresTitle}</h3>
          </div>

          <div className="space-y-3.5">
            <div className="bg-[#FAF9F6] border border-zinc-200/40 rounded-xl p-3 flex justify-between items-center text-xs">
              <span className="text-zinc-700 font-extrabold uppercase tracking-wide">
                {lang === 'en' ? (ROOM_FEATURES_EN[roomTypeKey]?.title || ROOM_FEATURES_EN['doble'].title) : featuresData.title}
              </span>
              <span className="bg-indigo-600 text-white font-extrabold text-[9px] px-2.5 py-1 rounded-full uppercase tracking-wider">
                {t.capacity(featuresData.capacity)}
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
                  <img src={src} alt={captions[index]} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent flex items-end p-3">
                    <span className="text-white text-[11px] font-semibold tracking-wide drop-shadow-sm">{captions[index]}</span>
                  </div>
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
            <p>{t.stayGuide}</p>
            <a 
              href="https://drive.google.com/drive/folders/1f03zp9bblMC-AtY2RkRyYHq-ugl-OyKl"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold rounded-xl text-center block border border-zinc-350/40 transition-all cursor-pointer"
            >
              {t.stayGuideBtn}
            </a>

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
            <p className="text-zinc-650 leading-relaxed">{t.locationDesc}</p>
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

        {/* 10. HABLAR CON RECEPCIÓN */}
        <div className="pt-2">
          <a 
            href="https://wa.me/529581168698" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full bg-[#25D366] hover:bg-[#20ba5a] text-white font-extrabold text-sm py-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-center"
          >
            <MessageSquare size={18} />
            {t.talkReception}
          </a>
        </div>

      </main>

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
                {captions[activePhotoIndex]} ({activePhotoIndex + 1} {t.lightboxOf} {photos.length})
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
    </div>
  );
}
