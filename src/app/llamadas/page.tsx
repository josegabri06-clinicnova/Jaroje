"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { 
  PhoneCall, Phone, PhoneForwarded, MessageSquare, MessageCircle, Send, Check, Clock, 
  Search, Filter, Plus, Trash2, Edit3, CheckCircle2, AlertCircle, RefreshCw, 
  ExternalLink, Copy, User, ChevronRight, Sparkles, X, ArrowUpRight, Shield
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getActiveEmployee, getRole } from '@/lib/auth';
import { parsePhoneAndDialCode, POPULAR_COUNTRY_CODES, ALL_COUNTRY_CODES } from '@/lib/country-dial-codes';
import { formatPhoneForDisplay } from '@/lib/checkin-summary';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

import { isSpanishOrLatamPhone } from '@/lib/whatsapp';

interface CallRecord {
  id: string;
  phone: string;
  caller_name?: string | null;
  status: 'nueva' | 'atendida' | 'plantilla_enviada' | 'descartada';
  template_sent?: string | null;
  template_sent_at?: string | null;
  attended_by?: string | null;
  attended_at?: string | null;
  notes?: string | null;
  raw_data?: any;
  created_at: string;
  updated_at?: string;
}

// Enlaces oficiales del hotel
const LINK_FOTOS = 'https://condominiosjaroje.com/';
const LINK_COMO_LLEGAR = 'https://maps.app.goo.gl/1DzGMNAu5yeRJ5Qr6?g_st=ic';
const LINK_UBICACION = 'https://maps.app.goo.gl/ZEYCWntV2rdT48kK8';
const LINK_DISPONIBILIDAD_ES = 'https://beds24.com/booking2.php?propid=327286';
const LINK_DISPONIBILIDAD_EN = 'https://beds24.com/booking2.php?propid=327286&lang=en';
const LINK_REVIEW = 'https://g.page/r/CVL6xPUz98QaEAE/review';

function getPortalUrl(bookingId?: string | null, lang: 'es' | 'en' = 'es'): string {
  if (bookingId && bookingId.trim()) {
    return `https://jaroje-app.vercel.app/public/reserva/${bookingId.trim()}?lang=${lang}`;
  }
  return `https://jaroje-app.vercel.app/public/reserva`;
}

function getWifiBlock(bookingId?: string | null, lang: 'es' | 'en' = 'es'): string {
  const portalUrl = getPortalUrl(bookingId, lang);
  if (lang === 'en') {
    return (
      `📶 *WiFi and Access*\n` +
      `WiFi: JAROJE\n` +
      `Password: HUXX2025\n` +
      `Gate: 3456\n\n` +
      `ℹ️ *Important Information*\n` +
      `• Clean dry towels available at reception.\n` +
      `• Exclusive access for registered guests.\n` +
      `• No pets allowed.\n` +
      `• 100% smoke-free property.\n` +
      `• Hotel is not responsible for valuables.\n` +
      `• Parking subject to availability.\n\n` +
      `⏰ *Schedules*\n` +
      `Pool: 9:00–22:00\n` +
      `Reception: 8:00–20:00\n` +
      `WhatsApp: 9:00–16:00\n\n` +
      `🌐 *Guest Portal:*\n` +
      `${portalUrl}`
    );
  }
  return (
    `📶 *WiFi y Claves*\n` +
    `WiFi: JAROJE\n` +
    `Contraseña: HUXX2025\n` +
    `Portón: 3456\n\n` +
    `ℹ️ *Información importante*\n` +
    `• Toallas secas disponibles en recepción.\n` +
    `• Acceso exclusivo para huéspedes registrados.\n` +
    `• No se admiten mascotas.\n` +
    `• Propiedad 100% libre de humo.\n` +
    `• El hotel no se hace responsable por objetos de valor.\n` +
    `• Estacionamiento sujeto a disponibilidad.\n\n` +
    `⏰ *Horarios*\n` +
    `Alberca: 9:00–22:00\n` +
    `Recepción: 8:00–20:00\n` +
    `WhatsApp: 9:00–16:00\n\n` +
    `🌐 *Portal del Huésped:*\n` +
    `${portalUrl}`
  );
}

interface CallTemplate {
  id: string;
  title: string;
  shortDesc: string;
  tag: string;
  category: 'bienvenida' | 'reserva' | 'estancia' | 'en';
  lang: 'es' | 'en';
  requiresBookingId?: boolean;
  buildText: (callerName?: string | null, bookingId?: string | null) => string;
}

const TEMPLATES: CallTemplate[] = [
  // 0. AVISO CAMBIO DE WHATSAPP (ESPAÑOL)
  {
    id: 'cambio_numero_whatsapp_es',
    title: '📲 Cambio de Número WhatsApp (Español)',
    shortDesc: 'Aviso de nuevo número 958 131 44 44 y enlace al Portal',
    tag: 'Aviso WhatsApp',
    category: 'bienvenida',
    lang: 'es',
    requiresBookingId: false,
    buildText: (_name, bId) => {
      const portalUrl = getPortalUrl(bId, 'es');
      return `¡Hola! 👋\n\nSoy Rolando Díaz Ceballos, de Condominios Jaroje Huatulco. 🌴\n\nTe comparto mi nuevo número de WhatsApp:\n\n📲 958 131 44 44\n\nMi número anterior, 958 116 86 98, ya no está disponible para WhatsApp y por el momento seguirá funcionando únicamente para llamadas. Más adelante será deshabilitado por completo.\n\nPor favor, guarda mi nuevo número.\n\n¡Gracias!\n\n🌐 Portal del Huésped:\n${portalUrl}`;
    }
  },

  // 0.1 AVISO CAMBIO DE WHATSAPP (ENGLISH)
  {
    id: 'cambio_numero_whatsapp_en',
    title: '📲 WhatsApp Number Change (English)',
    shortDesc: 'Notice of new number +52 958 131 4444 & Guest Portal',
    tag: 'Notice EN',
    category: 'en',
    lang: 'en',
    requiresBookingId: false,
    buildText: (_name, bId) => {
      const portalUrl = getPortalUrl(bId, 'en');
      return `Hi! 👋\n\nThis is Rolando from Condominios Jaroje Huatulco,\n\nJust letting you know that I’ve changed my WhatsApp number.\n\n📲 My new number is: +52 958 131 4444\n\nMy previous number, +52 958 116 8698, is temporarily unavailable on WhatsApp, but it still works for phone calls.\n\nI’d appreciate it if you could update my contact information!\n\nBest regards,\nRolando\n\n🌐 Guest Portal:\n${portalUrl}`;
    }
  },

  // 1. BIENVENIDA CONMUTADOR (OFICIAL)
  {
    id: 'bienvenida_conmutador_oficial',
    title: '🌴 Bienvenida Conmutador Oficial',
    shortDesc: 'Fotos, tarifas y cómo llegar (mensaje oficial de llamadas)',
    tag: 'Recomendada',
    category: 'bienvenida',
    lang: 'es',
    buildText: (name) => {
      const firstName = name && name.trim() ? name.trim().split(' ')[0] : '';
      const saludo = firstName ? `🌴 ¡Hola, ${firstName}! Bienvenido a Condominios Jaroje.` : `🌴 ¡Hola! Bienvenido a Condominios Jaroje.`;
      return `${saludo}\n\nSerá un gusto atenderte y brindarte el mejor servicio para tu estancia en Huatulco.\n\n📸 *Fotos y Tarifas:*\n${LINK_FOTOS}\n\n📍 *Cómo llegar:*\n${LINK_COMO_LLEGAR}\n\n¿En qué podemos apoyarte el día de hoy? 😊`;
    }
  },

  // 2. SOLICITUD DE RESERVACIÓN RECIBIDA (PORTAL + UBICACIÓN)
  {
    id: 'solicitud_recibida_portal',
    title: '📋 Solicitud Recibida (24h)',
    shortDesc: 'Portal del Huésped + Ubicación (24 horas para confirmar)',
    tag: 'Portal',
    category: 'reserva',
    lang: 'es',
    requiresBookingId: true,
    buildText: (name, bId) => {
      const firstName = name && name.trim() ? name.trim().split(' ')[0] : 'Huésped';
      const portalUrl = getPortalUrl(bId, 'es');
      return `📋 Solicitud de reservación recibida (24 h para confirmar)\n\nHola, ${firstName}.\n\n¡Gracias por elegir Condominios Jaroje para tus próximas vacaciones en Huatulco! 🌴\n\nEn tu "Portal del Huésped" encontrarás toda la información sobre tu reservación, incluyendo las fotos y la descripción de tu alojamiento, los datos de tu reservación, las políticas del hotel y de cancelación, así como las opciones de pago, si las necesitas.\n\n🌐 *Portal del Huésped:*\n${portalUrl}\n\n📍 *Ubicación:*\n${LINK_UBICACION}`;
    }
  },

  // 3. RESERVACIÓN CONFIRMADA (PORTAL + CÓMO LLEGAR)
  {
    id: 'reservacion_confirmada_portal',
    title: '🎉 Reservación Confirmada',
    shortDesc: 'Confirmación con Portal del Huésped y Cómo llegar',
    tag: 'Portal',
    category: 'reserva',
    lang: 'es',
    requiresBookingId: true,
    buildText: (name, bId) => {
      const firstName = name && name.trim() ? name.trim().split(' ')[0] : 'Huésped';
      const portalUrl = getPortalUrl(bId, 'es');
      return `🎉 ¡Tu reservación está confirmada!\n\n¡Excelente, ${firstName}!\n\nNos da mucho gusto confirmar que tu reservación ya quedó lista. Estamos listos para recibirte.\n\nEn "Portal del Huésped" podrás consultar cualquier actualización de tu reservación en tiempo real, así como las fotos, la descripción y los servicios de tu alojamiento.\n\n👥 ¿Cambió el número de huéspedes? Actualízalo desde "Mi reservación" antes de tu llegada para evitar cargos adicionales al momento del check-in.\n\n🌐 *Portal del Huésped:*\n${portalUrl}\n\n📍 *Cómo llegar:*\n${LINK_COMO_LLEGAR}`;
    }
  },

  // 4. TODO LISTO PARA TU LLEGADA (PORTAL + WIFI + PORTÓN)
  {
    id: 'preparacion_llegada_portal',
    title: '🚗 Todo Listo para tu Llegada',
    shortDesc: 'Mi reservación, claves del portón, WiFi y mapa',
    tag: 'Check-in',
    category: 'reserva',
    lang: 'es',
    requiresBookingId: true,
    buildText: (name, bId) => {
      const firstName = name && name.trim() ? name.trim().split(' ')[0] : 'Huésped';
      const portalUrl = getPortalUrl(bId, 'es');
      const wifi = getWifiBlock(bId, 'es');
      return `🚗 Todo listo para tu llegada\n\nHola, ${firstName}.\n\n¡Ya falta muy poco para recibirte en Condominios Jaroje! Queremos que tu llegada sea lo más cómoda posible.\n\n👥 ¿Cambió el número de huéspedes? Actualízalo desde "Mi reservación" antes de tu llegada para evitar cargos adicionales al momento del check-in.\n\nEn "Mi reservación" encontrarás el código del portón, la ubicación, las indicaciones para llegar, las fotos, la descripción y los servicios de tu alojamiento, así como todo lo necesario para preparar tu llegada.\n\n¿Llegarás después de las 8:00 p.m.? Avísanos con anticipación para recibirte.\n\n¡Te deseamos un excelente viaje!\n\n🌐 *Mi reservación:*\n${portalUrl}\n\n📍 *Cómo llegar:*\nCONDOMINIOS JAROJE 958 116 8698 ${LINK_COMO_LLEGAR}\n\n${wifi}`;
    }
  },

  // 5. BIENVENIDO A CONDOMINIOS JAROJE (ESTANCIA + MANTENIMIENTO)
  {
    id: 'bienvenida_checkin_portal',
    title: '🏡 Bienvenida al Alojamiento',
    shortDesc: 'Portal estancia, reporte de mantenimiento y claves WiFi',
    tag: 'Estancia',
    category: 'estancia',
    lang: 'es',
    requiresBookingId: true,
    buildText: (name, bId) => {
      const firstName = name && name.trim() ? name.trim().split(' ')[0] : 'Huésped';
      const portalUrl = getPortalUrl(bId, 'es');
      const maintUrl = `${portalUrl}#mantenimiento`;
      const wifi = getWifiBlock(bId, 'es');
      return `🏡 ¡Bienvenido a Condominios Jaroje!\n\n¡Qué gusto recibirte, ${firstName}!\n\nEsperamos que hayas tenido un excelente viaje. Deseamos que disfrutes una excelente estancia y que te sientas como en casa.\n\nEn "Mi estancia" encontrarás el código del portón, la red WiFi y su contraseña, las fotos, la descripción y los servicios de tu alojamiento, así como toda la información necesaria para disfrutar tu estancia.\n\nSi durante tu estancia necesitas reportar algún detalle de mantenimiento podrás hacerlo desde "Mi estancia".\n\nDeseamos que disfrutes tu estancia. Si necesitas cualquier cosa, aquí estamos para ayudarte.\n\n🌐 *Mi estancia:*\n${portalUrl}\n\n🔧 *Reporte de Mantenimiento:*\n${maintUrl}\n\n${wifi}`;
    }
  },

  // 6. WIFI Y CLAVES DE ACCESO
  {
    id: 'wifi_claves_portal',
    title: '📶 WiFi, Claves e Información',
    shortDesc: 'Claves de red, portón 3456, horarios y Portal del Huésped',
    tag: 'WiFi & Claves',
    category: 'estancia',
    lang: 'es',
    buildText: (name, bId) => {
      return getWifiBlock(bId, 'es');
    }
  },

  // 7. COTIZACIÓN Y DISPONIBILIDAD EN LÍNEA
  {
    id: 'cotizacion_beds24',
    title: '🏷️ Cotización y Disponibilidad',
    shortDesc: 'Enlace Beds24 para reservar + fotos oficiales y mapa',
    tag: 'Ventas',
    category: 'bienvenida',
    lang: 'es',
    buildText: (name) => {
      const firstName = name && name.trim() ? name.trim().split(' ')[0] : '';
      const saludo = firstName ? `¡Hola, ${firstName}!` : `¡Hola!`;
      return `${saludo} 🌴 Con gusto te compartimos disponibilidad y tarifas en *Condominios Jaroje*:\n\n🌐 *Verificar disponibilidad y reservar en línea:*\n${LINK_DISPONIBILIDAD_ES}\n\n📸 *Fotos y Tarifas:*\n${LINK_FOTOS}\n\n📍 *Cómo llegar:*\n${LINK_COMO_LLEGAR}\n\nSi nos indicas tus fechas de llegada y número de huéspedes, con gusto te preparamos tu cotización personalizada. 😊`;
    }
  },

  // 8. UBICACIÓN Y CÓMO LLEGAR
  {
    id: 'ubicacion_maps',
    title: '📍 Ubicación y Cómo Llegar',
    shortDesc: 'Google Maps oficial, ruta e información de llegada',
    tag: 'Ubicación',
    category: 'bienvenida',
    lang: 'es',
    buildText: () => {
      return `📍 *Ubicación y Cómo llegar a Condominios Jaroje:*\n\n🗺️ *Google Maps:* ${LINK_COMO_LLEGAR}\n📍 *Ubicación alternativa:* ${LINK_UBICACION}\n📸 *Fotos del alojamiento:* ${LINK_FOTOS}\n\nCualquier duda en el camino con gusto te orientamos. ¡Buen viaje! 🚗`;
    }
  },

  // 9. ENGLISH - WELCOME CALL & RATES
  {
    id: 'welcome_call_en',
    title: '🌴 Welcome Call & Direct Booking (EN)',
    shortDesc: 'English greeting, online booking, photos and map',
    tag: 'English',
    category: 'en',
    lang: 'en',
    buildText: (name) => {
      const firstName = name && name.trim() ? name.trim().split(' ')[0] : '';
      const greeting = firstName ? `🌴 Hello, ${firstName}! Welcome to Condominios Jaroje.` : `🌴 Hello! Welcome to Condominios Jaroje.`;
      return `${greeting}\n\nThank you for calling our lines. It will be our pleasure to assist you and provide you with the best experience for your stay in Huatulco.\n\n📸 *Photos and Rates:*\n${LINK_FOTOS}\n\n🌐 *Check availability and book online:*\n${LINK_DISPONIBILIDAD_EN}\n\n📍 *How to get there:*\n${LINK_COMO_LLEGAR}\n\nHow can we help you today? 😊`;
    }
  },

  // 10. ENGLISH - RESERVATION CONFIRMED
  {
    id: 'reservation_confirmed_en',
    title: '🎉 Reservation Confirmed (EN)',
    shortDesc: 'Confirmation with Guest Portal link & Directions',
    tag: 'English',
    category: 'en',
    lang: 'en',
    requiresBookingId: true,
    buildText: (name, bId) => {
      const firstName = name && name.trim() ? name.trim().split(' ')[0] : 'Guest';
      const portalUrl = getPortalUrl(bId, 'en');
      return `🎉 Your reservation is confirmed!\n\nExcellent, ${firstName}!\n\nWe are very pleased to confirm that your reservation is ready. We are ready to welcome you.\n\nIn "Guest Portal" you will be able to check any updates to your reservation in real time, as well as photos, descriptions, and accommodation services.\n\n👥 Did the number of guests change? Update it from "My reservation" before your arrival to avoid additional charges at check-in.\n\n🌐 *Guest Portal:*\n${portalUrl}\n\n📍 *How to get there:*\n${LINK_COMO_LLEGAR}`;
    }
  },

  // 11. ENGLISH - WIFI & ACCESS
  {
    id: 'wifi_access_en',
    title: '📶 WiFi & Stay Info (EN)',
    shortDesc: 'WiFi credentials, gate code 3456 and Guest Portal in English',
    tag: 'English',
    category: 'en',
    lang: 'en',
    buildText: (name, bId) => {
      return getWifiBlock(bId, 'en');
    }
  }
];

export default function LlamadasPage() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todas' | 'nueva' | 'plantilla_enviada' | 'atendida'>('todas');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Métricas
  const [metrics, setMetrics] = useState({
    totalToday: 0,
    nuevasToday: 0,
    plantillasToday: 0,
  });

  // Modal Enviar Plantilla
  const [selectedCallForTemplate, setSelectedCallForTemplate] = useState<CallRecord | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('bienvenida_conmutador_oficial');
  const [templateCategory, setTemplateCategory] = useState<'todos' | 'bienvenida' | 'reserva' | 'estancia' | 'en'>('todos');
  const [bookingIdInput, setBookingIdInput] = useState<string>('');
  const [matchedBooking, setMatchedBooking] = useState<{ id: string; guest_name: string } | null>(null);
  const [isSearchingBooking, setIsSearchingBooking] = useState(false);
  const [customMessage, setCustomMessage] = useState<string>('');
  const [isSendingTemplate, setIsSendingTemplate] = useState(false);
  const [templateSuccessToast, setTemplateSuccessToast] = useState('');

  // Modal Notas
  const [editingNotesCall, setEditingNotesCall] = useState<CallRecord | null>(null);
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Modal Registrar Llamada Manual
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualPhone, setManualPhone] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  // Obtener operador activo
  const activeOperator = useMemo(() => {
    const role = getRole();
    if (role === 'admin') return 'Administración';
    const emp = getActiveEmployee('recepcion');
    return emp ? emp.full_name : 'Recepción';
  }, []);

  // Fetch de llamadas
  const fetchCalls = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch(`/api/calls?status=${statusFilter}&search=${encodeURIComponent(search)}`);
      const json = await res.json();
      if (json.success) {
        setCalls(json.data || []);
        if (json.metrics) setMetrics(json.metrics);
      }
    } catch (err) {
      console.error("Error al cargar llamadas:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, [statusFilter, search]);

  // Suscripción Realtime a nuevas llamadas del conmutador
  useEffect(() => {
    const channel = supabase
      .channel('conmutador_calls_live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conmutador_calls' },
        (payload) => {
          console.log('[Realtime Llamadas] Evento recibido:', payload);
          fetchCalls(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Buscar reservación vinculada automáticamente cuando se abre el modal para una llamada
  useEffect(() => {
    if (!selectedCallForTemplate) {
      setMatchedBooking(null);
      setBookingIdInput('');
      return;
    }

    const cleanPhone = selectedCallForTemplate.phone.replace(/\D/g, '');
    const last10 = cleanPhone.slice(-10);
    const isEn = !isSpanishOrLatamPhone(cleanPhone);

    if (isEn) {
      setSelectedTemplateId('welcome_call_en');
      setTemplateCategory('en');
    } else {
      setSelectedTemplateId('bienvenida_conmutador_oficial');
      setTemplateCategory('todos');
    }

    let active = true;
    setIsSearchingBooking(true);

    const lookupBooking = async () => {
      try {
        // 1. Buscar en local_reservas
        const { data: loc } = await supabase
          .from('local_reservas')
          .select('id, guest_name')
          .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${last10}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!active) return;
        if (loc) {
          setMatchedBooking({ id: String(loc.id), guest_name: loc.guest_name });
          setBookingIdInput(String(loc.id));
          setIsSearchingBooking(false);
          return;
        }

        // 2. Buscar en beds24_reservations
        const { data: b24 } = await supabase
          .from('beds24_reservations')
          .select('id, guest_name')
          .or(`phone.ilike.%${cleanPhone}%,guest_phone.ilike.%${cleanPhone}%,phone.ilike.%${last10}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!active) return;
        if (b24) {
          setMatchedBooking({ id: String(b24.id), guest_name: b24.guest_name });
          setBookingIdInput(String(b24.id));
        } else {
          setMatchedBooking(null);
          setBookingIdInput('');
        }
      } catch (err) {
        console.warn("[Lookup Booking Error]:", err);
      } finally {
        if (active) setIsSearchingBooking(false);
      }
    };

    lookupBooking();
    return () => { active = false; };
  }, [selectedCallForTemplate]);

  // Auto-recálculo del texto cuando cambia la plantilla, llamada o ID de reservación
  useEffect(() => {
    if (selectedCallForTemplate) {
      const tmpl = TEMPLATES.find(t => t.id === selectedTemplateId) || TEMPLATES[0];
      setCustomMessage(tmpl.buildText(selectedCallForTemplate.caller_name, bookingIdInput));
    }
  }, [selectedCallForTemplate, selectedTemplateId, bookingIdInput]);

  // Manejo de envío de plantilla por WhatsApp
  const handleOpenWhatsAppAndMarkSent = async () => {
    if (!selectedCallForTemplate) return;
    setIsSendingTemplate(true);

    try {
      const cleanPhone = selectedCallForTemplate.phone.replace(/\D/g, '');
      const tmpl = TEMPLATES.find(t => t.id === selectedTemplateId);
      const templateTitle = tmpl ? tmpl.title : 'Mensaje Personalizado';

      // 1. Copiar texto al portapapeles
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(customMessage);
      }

      // 2. Actualizar estado en base de datos
      await fetch('/api/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedCallForTemplate.id,
          status: 'plantilla_enviada',
          template_sent: templateTitle,
          attended_by: activeOperator
        })
      });

      // 3. Abrir WhatsApp Web / App nativa
      const encodedText = encodeURIComponent(customMessage);
      const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
      
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
      if (isMobile) {
        window.location.href = waUrl;
      } else {
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      }

      setTemplateSuccessToast(`✅ Plantilla enviada y registrada para +${cleanPhone}`);
      setTimeout(() => setTemplateSuccessToast(''), 4000);
      setSelectedCallForTemplate(null);
      fetchCalls(true);
    } catch (err: any) {
      console.error(err);
      alert(`Error al registrar envío: ${err.message}`);
    } finally {
      setIsSendingTemplate(false);
    }
  };

  // Marcar como atendida
  const handleToggleAtendida = async (call: CallRecord) => {
    const newStatus = call.status === 'atendida' ? 'nueva' : 'atendida';
    try {
      await fetch('/api/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: call.id,
          status: newStatus,
          attended_by: newStatus === 'atendida' ? activeOperator : null
        })
      });
      fetchCalls(true);
    } catch (err) {
      console.error(err);
    }
  };

  // Guardar notas
  const handleSaveNotes = async () => {
    if (!editingNotesCall) return;
    setSavingNotes(true);
    try {
      await fetch('/api/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingNotesCall.id,
          notes: notesText.trim()
        })
      });
      setEditingNotesCall(null);
      fetchCalls(true);
    } catch (err) {
      console.error(err);
      alert("Error al guardar notas.");
    } finally {
      setSavingNotes(false);
    }
  };

  // Registrar llamada manual
  const handleCreateManualCall = async () => {
    if (!manualPhone.trim()) {
      alert("Ingresa un número telefónico.");
      return;
    }
    setSavingManual(true);
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: manualPhone,
          caller_name: manualName,
          notes: manualNotes,
          registered_by: activeOperator
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowManualModal(false);
        setManualPhone('');
        setManualName('');
        setManualNotes('');
        fetchCalls(true);
      } else {
        alert(data.error || "No se pudo registrar la llamada");
      }
    } catch (err: any) {
      alert(err.message || "Error al conectar");
    } finally {
      setSavingManual(false);
    }
  };

  // Eliminar llamada
  const handleDeleteCall = async (id: string) => {
    if (!confirm("¿Deseas eliminar este registro de llamada?")) return;
    try {
      await fetch(`/api/calls?id=${id}`, { method: 'DELETE' });
      fetchCalls(true);
    } catch (err) {
      console.error(err);
    }
  };

  // Copiar teléfono
  const handleCopyPhone = (phone: string, id: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(phone);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Formato relativo de tiempo
  const formatCallTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const rel = formatDistanceToNow(d, { addSuffix: true, locale: es });
      const exact = format(d, "d 'de' MMMM · HH:mm 'hrs'", { locale: es });
      return { rel, exact };
    } catch {
      return { rel: '', exact: isoString };
    }
  };

  // Obtener bandera del país para la llamada
  const getCountryBadge = (phone: string) => {
    const parsed = parsePhoneAndDialCode(phone);
    const country = POPULAR_COUNTRY_CODES.find(c => c.dialCode === parsed.dialCode) ||
                    ALL_COUNTRY_CODES.find(c => c.dialCode === parsed.dialCode);
    return {
      flag: country?.flag || '🌐',
      dialCode: parsed.dialCode || '+52',
      nationalNumber: parsed.nationalNumber
    };
  };

  return (
    <div className="min-h-screen bg-zinc-50 pb-28 pt-2 text-zinc-900 font-sans">
      
      {/* Toast Feedback */}
      {templateSuccessToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-700 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-[13px] font-bold animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle2 size={16} />
          <span>{templateSuccessToast}</span>
        </div>
      )}

      {/* HEADER PRINCIPAL */}
      <div className="bg-white border-b border-zinc-200/80 px-4 py-4 rounded-3xl shadow-xs mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <PhoneCall size={22} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[18px] font-black text-zinc-900 tracking-tight">Llamadas</h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Conmutador Activo
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 font-medium">
                Despacho rápido de plantillas y seguimiento de llamadas entrantes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchCalls()}
              disabled={refreshing}
              title="Actualizar llamadas"
              className="p-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowManualModal(true)}
              className="px-3.5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-[12px] font-extrabold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Plus size={14} />
              <span className="hidden xs:inline">Registrar</span>
            </button>
          </div>
        </div>

        {/* METRICS CARDS */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-zinc-100">
          <div className="p-2.5 rounded-2xl bg-zinc-50 border border-zinc-200/70 text-center">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Hoy</span>
            <span className="text-[18px] font-black text-zinc-900">{metrics.totalToday}</span>
          </div>
          <div className="p-2.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-center">
            <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest block">Por Atender</span>
            <span className="text-[18px] font-black text-amber-800">{metrics.nuevasToday}</span>
          </div>
          <div className="p-2.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-center">
            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block">Plantillas</span>
            <span className="text-[18px] font-black text-emerald-800">{metrics.plantillasToday}</span>
          </div>
        </div>
      </div>

      {/* BARRA DE BÚSQUEDA Y FILTROS */}
      <div className="space-y-2 mb-4">
        {/* Input de Búsqueda */}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por teléfono, nombre o notas..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-2xl text-[13px] font-medium outline-none transition-all shadow-xs"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-1"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[12px] font-bold">
          {[
            { id: 'todas', label: 'Todas' },
            { id: 'nueva', label: '🟡 Nuevas' },
            { id: 'plantilla_enviada', label: '🟢 Plantilla Enviada' },
            { id: 'atendida', label: '⚪ Atendidas' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setStatusFilter(pill.id as any)}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === pill.id
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* LISTADO DE LLAMADAS */}
      {loading ? (
        <div className="p-12 text-center text-zinc-400 space-y-2">
          <RefreshCw size={24} className="animate-spin mx-auto text-emerald-600" />
          <p className="text-[13px] font-bold">Cargando llamadas del conmutador...</p>
        </div>
      ) : calls.length === 0 ? (
        <div className="bg-white p-8 rounded-3xl border border-zinc-200 text-center space-y-3 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
            <Phone size={26} strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-zinc-800">No hay llamadas registradas</h3>
            <p className="text-[12px] text-zinc-400 max-w-xs mx-auto mt-1">
              Las llamadas que entren a las líneas del hotel aparecerán aquí al instante con nombre y opción de envío de plantillas.
            </p>
          </div>
          <button
            onClick={() => setShowManualModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-extrabold rounded-xl transition-all shadow-sm cursor-pointer"
          >
            + Registrar llamada de prueba
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {calls.map((call) => {
            const timeInfo = formatCallTime(call.created_at);
            const country = getCountryBadge(call.phone);
            const isNueva = call.status === 'nueva';
            const isSent = call.status === 'plantilla_enviada';

            return (
              <div
                key={call.id}
                className={`bg-white rounded-2xl p-4 border transition-all shadow-xs ${
                  isNueva
                    ? 'border-amber-300 ring-2 ring-amber-400/20 bg-amber-50/20'
                    : isSent
                    ? 'border-emerald-200 bg-white'
                    : 'border-zinc-200 bg-white'
                }`}
              >
                {/* Header de la Card */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[24px] leading-none shrink-0" title={country.dialCode}>
                      {country.flag}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-[15px] font-black text-zinc-900 truncate flex items-center gap-1.5">
                        <span>{call.caller_name || 'Huésped / Prospecto'}</span>
                        {!call.caller_name && (
                          <span className="text-[10px] font-normal text-zinc-400 italic">
                            (Sin nombre previo)
                          </span>
                        )}
                      </h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[13px] font-extrabold text-zinc-700 font-mono tracking-tight">
                          +{call.phone}
                        </span>
                        <button
                          onClick={() => handleCopyPhone(call.phone, call.id)}
                          title="Copiar número"
                          className="text-zinc-400 hover:text-zinc-700 transition-colors p-0.5"
                        >
                          {copiedId === call.id ? (
                            <Check size={12} className="text-emerald-600" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Badge de Estado */}
                  <div className="shrink-0 text-right">
                    {isNueva ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Nueva
                      </span>
                    ) : isSent ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <Check size={11} className="text-emerald-600" />
                        Plantilla Enviada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-600 border border-zinc-200">
                        Atendida
                      </span>
                    )}
                    <span className="block text-[10px] text-zinc-400 mt-1" title={timeInfo.exact}>
                      {timeInfo.rel}
                    </span>
                  </div>
                </div>

                {/* Subinfo: Plantilla enviada / Notas */}
                {call.template_sent && (
                  <div className="mb-3 px-3 py-1.5 rounded-xl bg-emerald-50/70 border border-emerald-100 text-[11px] text-emerald-900 flex items-center justify-between">
                    <span className="font-semibold truncate">
                      📨 {call.template_sent}
                    </span>
                    {call.attended_by && (
                      <span className="text-[10px] font-bold text-emerald-700 shrink-0 ml-2">
                        por {call.attended_by}
                      </span>
                    )}
                  </div>
                )}

                {call.notes && (
                  <div className="mb-3 p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-700 font-medium">
                    <span className="font-bold text-zinc-900">Nota:</span> {call.notes}
                  </div>
                )}

                {/* BOTONES DE ACCIÓN */}
                <div className="flex items-center gap-1.5 pt-2 border-t border-zinc-100 flex-wrap sm:flex-nowrap">
                  {/* Botón Principal: Enviar Plantilla */}
                  <button
                    onClick={() => {
                      setSelectedCallForTemplate(call);
                      setSelectedTemplateId('bienvenida_conmutador_es');
                    }}
                    className="flex-1 min-w-[130px] py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-[12px] font-black transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/10 cursor-pointer"
                  >
                    <Send size={13} className="rotate-45" />
                    <span>Enviar Plantilla</span>
                  </button>

                  {/* Llamar directamente */}
                  <a
                    href={`tel:+${call.phone}`}
                    className="py-2.5 px-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-[12px] font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                    title="Llamar al cliente"
                  >
                    <Phone size={13} />
                    <span className="hidden sm:inline">Llamar</span>
                  </a>

                  {/* Notas */}
                  <button
                    onClick={() => {
                      setEditingNotesCall(call);
                      setNotesText(call.notes || '');
                    }}
                    className="py-2.5 px-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-[12px] font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                    title="Agregar notas"
                  >
                    <Edit3 size={13} />
                    <span className="hidden sm:inline">Notas</span>
                  </button>

                  {/* Marcar Atendida Toggle */}
                  <button
                    onClick={() => handleToggleAtendida(call)}
                    className={`py-2.5 px-3 rounded-xl text-[12px] font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                      call.status === 'atendida'
                        ? 'bg-zinc-200 text-zinc-800'
                        : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                    }`}
                    title={call.status === 'atendida' ? 'Reabrir llamada' : 'Marcar como atendida'}
                  >
                    <Check size={13} />
                  </button>

                  {/* Descartar */}
                  <button
                    onClick={() => handleDeleteCall(call.id)}
                    className="py-2.5 px-2.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer shrink-0"
                    title="Eliminar registro"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* ===================================================== */}
      {/* MODAL: SELECCIONAR Y ENVIAR PLANTILLA WHATSAPP       */}
      {/* ===================================================== */}
      {selectedCallForTemplate && (
        <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl border border-zinc-200 max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200">
            
            {/* Header Modal Sticky */}
            <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-2xl bg-[#25D366]/15 text-[#20ba59] flex items-center justify-center shrink-0">
                  <MessageCircle size={18} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-black text-zinc-900 truncate">
                    Despacho de Plantilla Oficial
                  </h3>
                  <p className="text-[11px] text-zinc-500 truncate flex items-center gap-1.5">
                    <span>A: <strong className="text-zinc-800">{selectedCallForTemplate.caller_name || 'Huésped'}</strong></span>
                    <span>(+{selectedCallForTemplate.phone})</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCallForTemplate(null)}
                className="text-zinc-400 hover:text-zinc-700 p-2 rounded-xl hover:bg-zinc-100 shrink-0 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3.5 pr-2 sm:pr-4 overscroll-contain">
              
              {/* Bloque de Portal del Huésped / Reservación vinculada */}
              <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🌐 Portal del Huésped</span>
                    {isSearchingBooking && <RefreshCw size={11} className="animate-spin text-emerald-600" />}
                  </span>
                  {matchedBooking && (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Reserva vinculada #{matchedBooking.id}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={bookingIdInput}
                    onChange={(e) => setBookingIdInput(e.target.value)}
                    placeholder="ID de reservación (ej. 327286 o loc_123)..."
                    className="flex-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-[12px] font-mono outline-none focus:border-emerald-500 shadow-inner"
                  />
                  {bookingIdInput && (
                    <a
                      href={getPortalUrl(bookingIdInput)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-[11px] font-extrabold flex items-center gap-1 shrink-0"
                      title="Abrir enlace del portal"
                    >
                      <ExternalLink size={12} />
                      <span>Ver</span>
                    </a>
                  )}
                </div>
                <p className="text-[10px] text-zinc-500">
                  {bookingIdInput 
                    ? `Los enlaces del Portal se generarán hacia: https://jaroje-app.vercel.app/public/reserva/${bookingIdInput}`
                    : 'Sin ID de reserva, los enlaces dirigirán a la web oficial y disponibilidad directa.'}
                </p>
              </div>

              {/* Filtro por Categorías de Plantilla */}
              <div>
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block mb-1.5">
                  Categoría de Plantilla:
                </label>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px] font-bold">
                  {[
                    { id: 'todos', label: 'Todas' },
                    { id: 'bienvenida', label: '🌴 Bienvenida & Ventas' },
                    { id: 'reserva', label: '📋 Portal & Reservas' },
                    { id: 'estancia', label: '🏡 Estancia & WiFi' },
                    { id: 'en', label: '🇺🇸 English' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setTemplateCategory(tab.id as any)}
                      className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                        templateCategory === tab.id
                          ? 'bg-zinc-900 text-white shadow-xs'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lista de Plantillas */}
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {TEMPLATES
                  .filter(t => templateCategory === 'todos' || t.category === templateCategory)
                  .map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(tmpl.id)}
                      className={`w-full p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                        selectedTemplateId === tmpl.id
                          ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                          : 'border-zinc-200 hover:border-zinc-300 bg-white'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] font-black text-zinc-900 truncate">{tmpl.title}</span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200 shrink-0">
                            {tmpl.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5 font-sans">
                          {tmpl.shortDesc}
                        </p>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        selectedTemplateId === tmpl.id ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-300'
                      }`}>
                        {selectedTemplateId === tmpl.id && <Check size={10} strokeWidth={3} />}
                      </div>
                    </button>
                  ))}
              </div>

              {/* Vista Previa y Edición */}
              <div className="pt-2 border-t border-zinc-100">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-black text-zinc-600 uppercase tracking-widest">
                    Texto del Mensaje (Editable):
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        await navigator.clipboard.writeText(customMessage);
                        setTemplateSuccessToast('📋 Texto copiado');
                        setTimeout(() => setTemplateSuccessToast(''), 3000);
                      }
                    }}
                    className="text-[10px] font-extrabold text-zinc-500 hover:text-zinc-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Copy size={11} />
                    <span>Copiar</span>
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-[12px] font-sans leading-relaxed text-zinc-800 outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner"
                />
              </div>

            </div>

            {/* Footer Botón Acción Sticky (Siempre visible y por encima de BottomNav) */}
            <div className="p-3.5 sm:p-4 border-t border-zinc-100 bg-white shrink-0 flex items-center gap-2 pb-safe sm:pb-4">
              <button
                type="button"
                onClick={() => setSelectedCallForTemplate(null)}
                className="py-3 px-4 rounded-xl text-[12px] font-bold text-zinc-600 hover:bg-zinc-100 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleOpenWhatsAppAndMarkSent}
                disabled={isSendingTemplate || !customMessage.trim()}
                className="flex-1 py-3 px-4 bg-[#25D366] hover:bg-[#20ba59] active:scale-98 text-white rounded-xl text-[13px] font-black transition-all flex items-center justify-center gap-2 shadow-md shadow-[#25D366]/25 cursor-pointer disabled:opacity-50"
              >
                <MessageCircle size={16} />
                <span>{isSendingTemplate ? 'Registrando...' : 'Abrir WhatsApp y Enviar'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* MODAL: REGISTRAR NOTAS DE LA LLAMADA                 */}
      {/* ===================================================== */}
      {editingNotesCall && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-zinc-200 animate-in zoom-in-95 duration-200">
            <h3 className="text-[15px] font-black text-zinc-900 mb-1">Notas de la Llamada</h3>
            <p className="text-[11px] text-zinc-400 mb-3">
              Llamada de +{editingNotesCall.phone} {editingNotesCall.caller_name ? `(${editingNotesCall.caller_name})` : ''}
            </p>
            <textarea
              rows={4}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Ej: Interesado en Loft para 4 personas del 15 al 20 de noviembre..."
              className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-[13px] text-zinc-800 outline-none focus:border-zinc-900 focus:bg-white transition-all mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingNotesCall(null)}
                className="px-3.5 py-2 text-[12px] font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-[12px] font-bold rounded-xl shadow-sm"
              >
                {savingNotes ? 'Guardando...' : 'Guardar Nota'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* MODAL: REGISTRAR LLAMADA MANUAL                      */}
      {/* ===================================================== */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-zinc-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-black text-zinc-900">Registrar Llamada Manual</h3>
              <button onClick={() => setShowManualModal(false)} className="text-zinc-400 p-1">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block mb-1">
                  Número Telefónico *
                </label>
                <input
                  type="tel"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  placeholder="Ej: 958 116 8698 o +52 958 116 8698"
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-[13px] font-bold outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block mb-1">
                  Nombre (Opcional)
                </label>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Ej: Carlos Méndez"
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-[13px] font-medium outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block mb-1">
                  Observaciones / Asunto
                </label>
                <textarea
                  rows={2}
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Motivo de la llamada..."
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-[12px] outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="px-3.5 py-2 text-[12px] font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateManualCall}
                disabled={savingManual || !manualPhone.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-black rounded-xl shadow-sm disabled:opacity-50"
              >
                {savingManual ? 'Guardando...' : 'Registrar Llamada'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
