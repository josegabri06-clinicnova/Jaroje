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
      return format(parseISO(dateStr), "dd 'de' MMMM, yyyy", { locale: es });
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
        <p className="text-zinc-650 font-medium text-sm">Cargando los detalles de tu reservación...</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4 border border-rose-100">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-zinc-900 font-extrabold text-lg mb-2">¡Ups! Algo salió mal</h2>
        <p className="text-zinc-600 text-sm mb-6">{error || 'La reservación solicitada no existe o ha sido cancelada.'}</p>
        <a 
          href="https://wa.me/529581168698" 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-indigo-650 text-white font-bold text-sm py-3 px-6 rounded-xl shadow-md hover:bg-indigo-700 transition-all cursor-pointer"
        >
          Contactar por WhatsApp
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
    statusMessage = 'Esta reservación ha sido cancelada y la disponibilidad de la habitación ha sido liberada.';
  } else if (isCheckedOut || (checkInDate && today > new Date(booking.check_out))) {
    currentState = 'finalizada';
    statusMessage = '¡Gracias por hospedarte con nosotros! Esperamos verte de nuevo muy pronto en Huatulco. ¡Buen viaje de regreso!';
  } else if (isCheckedIn) {
    currentState = 'hospedado';
    statusMessage = '¡Bienvenido a Condominios Jaroje! Esperamos que estés disfrutando de tu estancia. Si necesitas algo, nuestro equipo está a tu disposición.';
  } else if (hasPaid && checkInDate && today >= checkInLimit) {
    currentState = 'checkin_pendiente';
    statusMessage = 'Tu habitación está casi lista. A tu llegada, el personal de recepción te ayudará a completar tu registro y firma digital de contrato.';
  } else if (hasPaid || isOta) {
    currentState = 'confirmada';
    statusMessage = '¡Tu estancia está confirmada! Todo está listo para tu llegada. Te enviaremos las instrucciones de check-in un día antes de tu entrada.';
  } else if (hoursSinceCreation > 2) {
    currentState = 'pago_pendiente';
    statusMessage = 'Tu reservación está pendiente de pago. Por favor, sube tu comprobante de anticipo para evitar la cancelación automática de tu estancia.';
  } else {
    currentState = 'solicitud';
    statusMessage = 'Hemos recibido tu solicitud de reservación. Para asegurar tu estancia, realiza el depósito de anticipo en las próximas horas.';
  }

  // Pasos de la barra de progreso
  const steps = [
    { label: 'Solicitud recibida', state: 'solicitud' },
    { label: 'Pago pendiente', state: 'pago_pendiente' },
    { label: 'Reservación confirmada', state: 'confirmada' },
    { label: 'Check-in pendiente', state: 'checkin_pendiente' },
    { label: 'Hospedado', state: 'hospedado' },
    { label: 'Finalizada', state: 'finalizada' }
  ];

  const activeIndex = steps.findIndex(s => s.state === currentState);

  // Características del tipo de habitación
  const roomTypeKey = getRoomTypeKey(booking.room_name);
  const featuresData = ROOM_FEATURES[roomTypeKey] || ROOM_FEATURES['doble'];

  // Fotos y descripciones del Carrusel
  const photos = [...(ROOM_PHOTOS[roomTypeKey] || ROOM_PHOTOS['doble']), ...COMMON_PHOTOS];
  const captions = [...(PHOTO_CAPTIONS[roomTypeKey] || PHOTO_CAPTIONS['doble']), ...COMMON_CAPTIONS];

  const anticipoRequerido = Math.round(booking.price * 0.5);

  return (
    <div className="min-h-screen bg-[#F6F5F2] text-zinc-900 pb-16 font-sans">
      {/* Header Premium */}
      <header className="bg-zinc-900 text-white text-center py-8 px-4 shadow-md relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent)] pointer-events-none" />
        <h1 className="text-xl md:text-2xl font-black uppercase tracking-wider text-amber-100">CONDOMINIOS JAROJE</h1>
        <p className="text-zinc-400 text-xs mt-1 font-medium tracking-wide uppercase">Tu paraíso en Huatulco, Oaxaca 🌴</p>
      </header>

      <main className="max-w-md mx-auto px-4 mt-6 space-y-5">

        {/* 1. BARRA DE PROGRESO */}
        {currentState === 'liberada' ? (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-center shadow-sm">
            <div className="w-12 h-12 bg-rose-105 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-rose-100">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-rose-900 font-extrabold text-base tracking-tight uppercase">Disponibilidad Liberada</h3>
            <p className="text-rose-700 text-xs mt-1.5 leading-relaxed">{statusMessage}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-4 overflow-hidden relative">
            <div className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block border-b border-zinc-100 pb-1.5 mb-2.5">
              Estado de la Reservación
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
                          ? 'bg-indigo-650 text-white shadow-sm' 
                          : isActive 
                            ? 'bg-white border-2 border-indigo-600 text-indigo-600 shadow-md ring-4 ring-indigo-50 animate-pulse' 
                            : 'bg-white border border-zinc-250 text-zinc-400'
                      }`}
                    >
                      {isCompleted ? <Check size={14} className="stroke-[3]" /> : idx + 1}
                    </div>
                    <span 
                      className={`text-[8.5px] mt-1.5 font-bold tracking-tight text-center max-w-[62px] block leading-tight ${
                        isActive ? 'text-indigo-650 font-black' : isCompleted ? 'text-zinc-700' : 'text-zinc-400'
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

        {/* 3. RESUMEN DE LA ESTANCIA */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <FileText size={18} className="text-indigo-650" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">Resumen de tu Estancia</h3>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">Huésped</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{booking.guest_name}</strong>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">ID de Reserva</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{booking.id}</strong>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100 col-span-2">
              <span className="text-zinc-500 font-semibold block">Alojamiento</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{booking.room_name}</strong>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">Fecha de Llegada</span>
              <span className="text-zinc-900 font-bold text-[11.5px] block mt-0.5">{formatDateStr(booking.check_in)}</span>
              <span className="text-zinc-500 text-[10px] mt-0.5 block">(Check-in: 3:00 PM)</span>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">Fecha de Salida</span>
              <span className="text-zinc-900 font-bold text-[11.5px] block mt-0.5">{formatDateStr(booking.check_out)}</span>
              <span className="text-zinc-500 text-[10px] mt-0.5 block">(Check-out: 12:00 PM)</span>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">Estancia</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{booking.nights} noche{booking.nights !== 1 ? 's' : ''}</strong>
            </div>
            <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
              <span className="text-zinc-500 font-semibold block">Huéspedes</span>
              <strong className="text-zinc-900 font-bold text-[13px] block mt-0.5">{booking.num_adult + booking.num_child} persona{booking.num_adult + booking.num_child !== 1 ? 's' : ''}</strong>
            </div>
          </div>
        </div>

        {/* 4. ESTADO DE CUENTA */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-3.5">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <Clock size={18} className="text-indigo-650" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">Estado de Cuenta</h3>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center text-zinc-650">
              <span>Total de la estancia:</span>
              <strong className="text-zinc-900 font-extrabold">${booking.price.toLocaleString('es-MX')} MXN</strong>
            </div>
            {hasPaid ? (
              <>
                <div className="flex justify-between items-center text-emerald-600 font-semibold bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100">
                  <span className="flex items-center gap-1">Anticipo Recibido:</span>
                  <strong className="font-black">${booking.deposit.toLocaleString('es-MX')} MXN</strong>
                </div>
                <div className="flex justify-between items-center text-zinc-800 pt-2 border-t border-dashed border-zinc-200">
                  <span className="font-bold">Saldo restante (adeudo):</span>
                  <strong className="text-indigo-650 font-black text-base">${booking.balance.toLocaleString('es-MX')} MXN</strong>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center text-indigo-650 font-semibold bg-indigo-50/50 px-3 py-2 rounded-xl border border-indigo-100/80">
                  <span>Anticipo Requerido (50%):</span>
                  <strong className="font-black">${anticipoRequerido.toLocaleString('es-MX')} MXN</strong>
                </div>
                <div className="flex justify-between items-center text-zinc-500">
                  <span>Anticipo depositado:</span>
                  <strong className="font-bold">$0 MXN</strong>
                </div>
                <div className="flex justify-between items-center text-zinc-800 pt-2 border-t border-dashed border-zinc-200">
                  <span className="font-bold">Saldo restante (adeudo):</span>
                  <strong className="text-indigo-650 font-black text-base">${booking.price.toLocaleString('es-MX')} MXN</strong>
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
                <CreditCard size={18} className="text-indigo-650" />
                <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">
                  {hasPaid ? 'Liquidar Saldo Pendiente' : 'Formas de Pago'}
                </h3>
              </div>

              {/* Selector de Anticipo o Total (solo si no ha abonado nada) */}
              {booking.deposit === 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-extrabold uppercase text-zinc-400 tracking-wider block">Selecciona el monto a abonar:</span>
                  <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-1 rounded-xl border border-zinc-200/40 shadow-inner">
                    <button
                      onClick={() => setPaymentSplit('50')}
                      className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex flex-col items-center justify-center ${
                        paymentSplit === '50'
                          ? 'bg-indigo-650 text-white shadow-md'
                          : 'text-zinc-600 hover:text-zinc-950 bg-transparent'
                      }`}
                    >
                      <span>Anticipo (50%)</span>
                      <span className={`text-[10px] opacity-90 mt-0.5 ${paymentSplit === '50' ? 'text-indigo-200' : 'text-zinc-500'}`}>
                        ${(booking.price * 0.5).toLocaleString('es-MX')} MXN
                      </span>
                    </button>
                    <button
                      onClick={() => setPaymentSplit('100')}
                      className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex flex-col items-center justify-center ${
                        paymentSplit === '100'
                          ? 'bg-indigo-650 text-white shadow-md'
                          : 'text-zinc-600 hover:text-zinc-950 bg-transparent'
                      }`}
                    >
                      <span>Total (100%)</span>
                      <span className={`text-[10px] opacity-90 mt-0.5 ${paymentSplit === '100' ? 'text-indigo-200' : 'text-zinc-500'}`}>
                        ${booking.price.toLocaleString('es-MX')} MXN
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Monto seleccionado explicito */}
              <div className="bg-indigo-50/40 border border-indigo-100/50 rounded-xl p-3.5 text-center">
                <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider block">Monto a pagar seleccionado</span>
                <span className="text-xl font-black text-indigo-950">
                  ${targetAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </span>
              </div>

              {/* Método 1: Tarjeta */}
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase text-indigo-650 tracking-wider block">Opción 1: Tarjeta de Crédito / Débito (Pasarela)</span>
                <a 
                  href="https://link.mercadopago.com.mx/jaroje" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full bg-[#00A650] hover:bg-[#008f43] text-white font-bold text-sm py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CreditCard size={18} />
                  Pagar con Mercado Pago
                </a>
                <p className="text-[10px] text-zinc-500 italic text-center mt-1">Si realizas tu pago con tarjeta, no es necesario enviar comprobante.</p>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-zinc-200"></div>
                <span className="flex-shrink mx-4 text-zinc-400 text-xs font-bold uppercase">ó</span>
                <div className="flex-grow border-t border-zinc-200"></div>
              </div>

              {/* Método 2: Transferencia */}
              <div className="space-y-3 pt-2">
                <span className="text-[10px] font-extrabold uppercase text-zinc-650 tracking-wider block">Opción 2: Transferencia o Depósito Bancario</span>
                <a 
                  href={`/public/pago-transferencia?id=${booking.id}&amount=${targetAmount}&name=${encodeURIComponent(booking.guest_name || '')}`}
                  className="w-full bg-[#18181b] hover:bg-[#27272a] text-white font-bold text-sm py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileText size={18} />
                  Pagar por Transferencia Bancaria
                </a>
                <p className="text-[10px] text-zinc-500 italic text-center mt-1">Obtén la cuenta CLABE oficial y reporta tu comprobante de inmediato al panel de staySync.</p>
              </div>
            </div>
          );
        })()}

        {/* 6. CARACTERÍSTICAS DEL ALOJAMIENTO */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <Home size={18} className="text-indigo-650" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">Características del Alojamiento</h3>
          </div>

          <div className="space-y-3.5">
            <div className="bg-[#FAF9F6] border border-zinc-200/40 rounded-xl p-3 flex justify-between items-center text-xs">
              <span className="text-zinc-700 font-extrabold uppercase tracking-wide">{featuresData.title}</span>
              <span className="bg-indigo-600 text-white font-extrabold text-[9px] px-2.5 py-1 rounded-full uppercase tracking-wider">
                Capacidad: {featuresData.capacity} Huéspedes
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
            <Compass size={18} className="text-indigo-650" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">Galería de Imágenes</h3>
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
            <p className="text-[10px] text-zinc-400 text-center mt-1.5 italic">🔍 Toca cualquier imagen para abrir en pantalla completa</p>
          </div>
        </div>

        {/* 8. INFORMACIÓN PARA TU ESTANCIA */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-3.5">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <Info size={18} className="text-indigo-650" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">Información para tu estancia</h3>
          </div>

          <div className="space-y-3 text-xs leading-relaxed text-zinc-650">
            <p>
              Para garantizar una estancia agradable a todos nuestros huéspedes, te pedimos revisar la guía digital de tu alojamiento:
            </p>
            <a 
              href="https://drive.google.com/drive/folders/1f03zp9bblMC-AtY2RkRyYHq-ugl-OyKl"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold rounded-xl text-center block border border-zinc-350/40 transition-all cursor-pointer"
            >
              📖 Ver Fotografías y Guía del Alojamiento
            </a>

            <div className="bg-[#FAF9F6] border border-zinc-200/50 rounded-xl p-3 space-y-2 mt-2">
              <h4 className="font-extrabold text-zinc-900 uppercase text-[10px] tracking-wide">🚫 Políticas Básicas</h4>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>No se admiten mascotas</strong> bajo ningún concepto.</li>
                <li><strong>Espacio 100% libre de humo</strong> (solo permitido fumar en áreas exteriores designadas).</li>
                <li>El horario de entrada es de <strong>3:00 PM a 8:00 PM</strong>. Salida a las <strong>12:00 PM</strong>.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 9. CÓMO LLEGAR */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 shadow-sm space-y-3.5">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2.5">
            <MapPin size={18} className="text-indigo-650" />
            <h3 className="font-extrabold text-zinc-900 text-[14.5px] uppercase tracking-wider">Ubicación y Cómo Llegar</h3>
          </div>

          <div className="space-y-3 text-xs">
            <p className="text-zinc-650 leading-relaxed">
              Condominios Jaroje se encuentra en Huatulco, Oaxaca. Haz clic en el botón de abajo para abrir la ubicación exacta en Google Maps:
            </p>
            <a 
              href="https://maps.app.goo.gl/1DzGMNAu5yeRJ5Qr6?g_st=ic"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-center flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <MapPin size={16} />
              Abrir en Google Maps
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
            Hablar con Recepción por WhatsApp
          </a>
        </div>

      </main>

      {/* Footer */}
      <footer className="text-center text-zinc-500 text-[10px] mt-12 px-4 space-y-1">
        <p>© 2026 Condominios Jaroje. Todos los derechos reservados.</p>
        <p>¿Necesitas ayuda? Escríbenos a nuestro WhatsApp oficial: <strong>958 116 8698</strong></p>
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
                {captions[activePhotoIndex]} ({activePhotoIndex + 1} de {photos.length})
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
            Toca a los lados para navegar • Condominios Jaroje
          </div>
        </div>
      )}
    </div>
  );
}
