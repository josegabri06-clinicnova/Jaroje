import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';

const FALLBACK_WHATSAPP_TOKEN = 'EAAbMZBnocDPcBQXZAAa1jEiOoQJSTWaLTLzyWoAaERAjarPbviSjYXWCitQvX6CnhHNCEcNUnAWuiZAIU4VY7NjG7m8ZA9HwJzM6s8k29v4BxvfitmKkNdFTcQhMnPEcOUZCZBiNnA6ZACZCFRZBOyNJgK8XEwJa0UWqSxaTb9rosgMVtZC1ZBX4tMpNTZBU2ytZCjwZDZD';
const FALLBACK_WHATSAPP_PHONE_ID = '1378816458649407';

export function getWhatsAppToken(): string {
  return process.env.WHATSAPP_TOKEN || FALLBACK_WHATSAPP_TOKEN;
}

export function getWhatsAppPhoneId(): string {
  return process.env.WHATSAPP_PHONE_ID || FALLBACK_WHATSAPP_PHONE_ID;
}

/**
 * Determina con precisión si un número telefónico pertenece a Latinoamérica o España.
 * Regla de negocio:
 * - Si es de cualquier país de Latinoamérica o España -> español ('es').
 * - Si es de cualquier otro país (EE.UU., Canadá, Europa no-España, etc.) -> inglés ('en').
 */
export function isSpanishOrLatamPhone(phone: string): boolean {
  if (!phone) return true;
  const cleaned = phone.replace(/\D/g, '');

  const latamAndSpainPrefixes = [
    '52',   // México (+52, +521)
    '34',   // España (+34)
    '57',   // Colombia (+57)
    '54',   // Argentina (+54)
    '56',   // Chile (+56)
    '51',   // Perú (+51)
    '593',  // Ecuador (+593)
    '58',   // Venezuela (+58)
    '502',  // Guatemala (+502)
    '503',  // El Salvador (+503)
    '504',  // Honduras (+504)
    '505',  // Nicaragua (+505)
    '506',  // Costa Rica (+506)
    '507',  // Panamá (+507)
    '591',  // Bolivia (+591)
    '595',  // Paraguay (+595)
    '598',  // Uruguay (+598)
    '53',   // Cuba (+53)
    '1787', // Puerto Rico (+1-787)
    '1939', // Puerto Rico (+1-939)
    '1809', // República Dominicana (+1-809)
    '1829', // República Dominicana (+1-829)
    '1849', // República Dominicana (+1-849)
  ];

  for (const prefix of latamAndSpainPrefixes) {
    if (cleaned.startsWith(prefix)) return true;
  }

  // Si tiene 10 dígitos sin prefijo de país, en México se interpreta como número nacional local
  if (cleaned.length === 10) return true;

  return false;
}

// Detecta el código de idioma para plantillas de WhatsApp según la procedencia del teléfono
export function detectLanguageFromPhone(phone: string): string {
  return isSpanishOrLatamPhone(phone) ? 'es' : 'en';
}

const COUNTRY_TO_PREFIX: Record<string, string> = {
  MX: '52',
  US: '1',
  CA: '1',
  CO: '57',
  ES: '34',
  AR: '54',
  CL: '56',
  PE: '51',
  EC: '593',
  VE: '58',
  BR: '55',
  CR: '506',
  PA: '507',
  GT: '502',
  HN: '504',
  SV: '503',
  NI: '505',
  UY: '598',
  PY: '595',
  BO: '591',
  DO: '1',
  PR: '1',
  DE: '49',
  FR: '33',
  GB: '44',
  IT: '39',
  NL: '31',
  CH: '41',
  AT: '43',
  BE: '32',
  PT: '351',
  CZ: '420',
  PL: '48',
  SE: '46',
  NO: '47',
  DK: '45',
  IL: '972',
  AU: '61',
  NZ: '64',
  IN: '91',
  CN: '86',
  JP: '81',
  KR: '82',
};

function countryNameToCode(name: string): string {
  const normalized = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  
  // 1. Mapeo exacto (incluyendo nombres comunes y códigos de 3 letras)
  const map: Record<string, string> = {
    // Códigos de 3 letras
    'mex': 'MX', 'usa': 'US', 'col': 'CO', 'can': 'CA', 'esp': 'ES',
    'arg': 'AR', 'chl': 'CL', 'per': 'PE', 'ecu': 'EC', 'ven': 'VE',
    'bra': 'BR', 'cri': 'CR', 'pan': 'PA', 'gtm': 'GT', 'hnd': 'HN',
    'slv': 'SV', 'nic': 'NI', 'ury': 'UY', 'pry': 'PY', 'bol': 'BO',
    'dom': 'DO', 'pri': 'PR', 'deu': 'DE', 'fra': 'FR', 'gbr': 'GB',
    'ita': 'IT', 'nld': 'NL', 'che': 'CH', 'aut': 'AT', 'bel': 'BE',
    'prt': 'PT',

    // Variantes exactas
    'mexico': 'MX',
    'estados unidos': 'US',
    'estados unidos de america': 'US',
    'united states': 'US',
    'united states of america': 'US',
    'canada': 'CA',
    'colombia': 'CO',
    'espana': 'ES',
    'spain': 'ES',
    'argentina': 'AR',
    'chile': 'CL',
    'peru': 'PE',
    'ecuador': 'EC',
    'venezuela': 'VE',
    'brasil': 'BR',
    'brazil': 'BR',
    'costa rica': 'CR',
    'panama': 'PA',
    'guatemala': 'GT',
    'honduras': 'HN',
    'el salvador': 'SV',
    'nicaragua': 'NI',
    'uruguay': 'UY',
    'paraguay': 'PY',
    'bolivia': 'BO',
    'republica dominicana': 'DO',
    'dominican republic': 'DO',
    'puerto rico': 'PR',
    'alemania': 'DE',
    'germany': 'DE',
    'francia': 'FR',
    'france': 'FR',
    'reino unido': 'GB',
    'united kingdom': 'GB',
    'uk': 'GB',
    'italia': 'IT',
    'italy': 'IT',
    'paises bajos': 'NL',
    'netherlands': 'NL',
    'suiza': 'CH',
    'switzerland': 'CH',
    'austria': 'AT',
    'belgica': 'BE',
    'belgium': 'BE',
    'portugal': 'PT'
  };

  if (map[normalized]) {
    return map[normalized];
  }

  // 2. Búsqueda por coincidencia parcial de palabras clave si no hay coincidencia exacta
  if (normalized.includes('mexic')) return 'MX';
  if (normalized.includes('colomb')) return 'CO';
  if (normalized.includes('united states') || normalized.includes('ee.uu') || normalized.includes('eeuu') || normalized.includes('america')) return 'US';
  if (normalized.includes('canada')) return 'CA';
  if (normalized.includes('espan') || normalized.includes('spain')) return 'ES';
  if (normalized.includes('argentin')) return 'AR';
  if (normalized.includes('chile')) return 'CL';
  if (normalized.includes('peru')) return 'PE';
  if (normalized.includes('ecuador')) return 'EC';
  if (normalized.includes('venezuel')) return 'VE';
  if (normalized.includes('brasil') || normalized.includes('brazil')) return 'BR';
  if (normalized.includes('costa rica')) return 'CR';
  if (normalized.includes('panama')) return 'PA';
  if (normalized.includes('guatemal')) return 'GT';
  if (normalized.includes('hondur')) return 'HN';
  if (normalized.includes('salvador')) return 'SV';
  if (normalized.includes('nicaragu')) return 'NI';
  if (normalized.includes('uruguay')) return 'UY';
  if (normalized.includes('paraguay')) return 'PY';
  if (normalized.includes('bolivi')) return 'BO';
  if (normalized.includes('dominic')) return 'DO';
  if (normalized.includes('puerto rico')) return 'PR';
  if (normalized.includes('aleman') || normalized.includes('german')) return 'DE';
  if (normalized.includes('franc') || normalized.includes('french')) return 'FR';
  if (normalized.includes('reino unido') || normalized.includes('united kingdom')) return 'GB';
  if (normalized.includes('itali')) return 'IT';
  if (normalized.includes('paises bajos') || normalized.includes('netherland')) return 'NL';
  if (normalized.includes('suiz') || normalized.includes('switzer')) return 'CH';
  if (normalized.includes('austri')) return 'AT';
  if (normalized.includes('belgic') || normalized.includes('belgi')) return 'BE';
  if (normalized.includes('portug')) return 'PT';

  return '';
}

// Normaliza un número mexicano al formato canónico único de esta app: '52' + 10 dígitos (12 en total).
// WhatsApp (Meta y YCloud) dejó de requerir el '1' extra tras el '52' desde 2021; mantenerlo generaba
// un doble formato interno (guardar con '521' y despojarlo recién al llamar a la API). Si el número ya
// trae ese '1' heredado (datos antiguos, u otro sistema que todavía lo añade), se elimina aquí mismo.
function toCanonicalMx(tenDigits: string): string {
  return '52' + tenDigits;
}

// Normaliza y limpia el número de teléfono para base de datos y búsqueda
export function normalizePhone(phone: string, countryCodeOrName?: string | null): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return '';

  // Limpiar prefijo internacional heredado de conmutadores/telcos '00' (ej. 0034... -> 34..., 0052... -> 52...)
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.replace(/^00+/, '');
    if (!cleaned) return '';
  }

  let cc = (countryCodeOrName || '').trim().toUpperCase();

  // Traducir nombre de país largo a código de 2 letras si es necesario
  if (cc.length > 2) {
    cc = countryNameToCode(cc);
  }

  // PRIORIDAD PREFIJO EXISTENTE:
  // Si el número ingresado ya contiene un código de país conocido y su longitud es la estándar,
  // respetamos ese prefijo de forma prioritaria, ignorando el código del país de facturación (cc).
  if (cleaned.startsWith('521') && cleaned.length === 13) {
    return toCanonicalMx(cleaned.substring(3)); // México Móvil (formato heredado con '1') -> canónico '52'
  }
  if (cleaned.startsWith('52') && cleaned.length === 12) {
    return cleaned; // Ya viene en formato canónico '52' + 10 dígitos
  }
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    return cleaned; // US/Canada
  }
  if (cleaned.startsWith('34') && cleaned.length === 11) {
    return cleaned; // España (34 + 9 dígitos)
  }

  // Si el número ya empieza con algún prefijo internacional conocido de COUNTRY_TO_PREFIX y tiene longitud
  // válida. Solo a partir de 11 dígitos: un número de 10 dígitos es un local mexicano (55 CDMX, 33 GDL,
  // 81 MTY...) y no debe confundirse con los prefijos de Brasil, Francia, Japón, etc.
  if (cleaned.length >= 11) {
    for (const p of Object.values(COUNTRY_TO_PREFIX)) {
      if (p !== '52' && p !== '1' && p !== '34' && cleaned.startsWith(p)) {
        const restLen = cleaned.length - p.length;
        if (restLen >= 7 && restLen <= 11) {
          return cleaned;
        }
      }
    }
  }

  // Si no tenemos código de país, aplicamos la lógica clásica basada en la longitud
  if (!cc) {
    if (cleaned.length === 10) {
      return toCanonicalMx(cleaned);
    }
    if (cleaned.startsWith('521') && cleaned.length === 13) {
      return toCanonicalMx(cleaned.substring(3));
    }
    if (cleaned.length === 9) {
      cleaned = '34' + cleaned;
    }
    return cleaned;
  }

  // Si el país es México
  if (cc === 'MX') {
    if (cleaned.length === 10) {
      return toCanonicalMx(cleaned);
    }
    if (cleaned.startsWith('521') && cleaned.length === 13) {
      return toCanonicalMx(cleaned.substring(3));
    }
    if (cleaned.startsWith('52') && cleaned.length === 12) {
      return cleaned;
    }
    if (!cleaned.startsWith('52') && cleaned.length === 10) {
      return toCanonicalMx(cleaned);
    }
    return cleaned;
  }

  // Para otros países conocidos
  const prefix = COUNTRY_TO_PREFIX[cc];
  if (prefix) {
    // Si ya empieza con el prefijo correcto del país
    if (cleaned.startsWith(prefix)) {
      if (prefix === '1' && cleaned.length === 10) {
        return '1' + cleaned;
      }
      return cleaned;
    }
    // Si no empieza con el prefijo del país, se lo añadimos
    return prefix + cleaned;
  }

  // Caída por defecto si el país es desconocido pero se pasó algo que no mapeamos
  if (cleaned.length === 10) {
    return toCanonicalMx(cleaned);
  } else if (cleaned.length === 9) {
    cleaned = '34' + cleaned;
  }
  return cleaned;
}

// Limpia el teléfono específicamente para la llamada de Meta, YCloud y enlaces wa.me (removiendo el '1' legado de México y asegurando formato E.164)
export function cleanPhoneForMeta(phone: string): string {
  let cleaned = (phone || '').replace(/\D/g, '');
  if (cleaned.startsWith('521') && cleaned.length === 13) {
    cleaned = '52' + cleaned.substring(3);
  } else if (cleaned.length === 10) {
    cleaned = '52' + cleaned;
  }
  return cleaned;
}

// Formatea fechas al estilo: "dd MMM yyyy" (ej: "30 Jun 2026")
export function formatDateStr(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy', { locale: es });
  } catch (e) {
    return dateStr;
  }
}

// Formatea montos monetarios en MXN (ej: "1,600")
export function formatCurrency(amount: number | string): string {
  const num = Number(amount);
  if (isNaN(num)) return '0';
  return num.toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

// Obtener el enlace del sitio de producción
function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://jaroje-app.vercel.app';
}

const groupMessageLocks = new Map<string, number>();

function isGroupMessageLocked(key: string): boolean {
  const now = Date.now();
  const lastSent = groupMessageLocks.get(key);
  if (lastSent && (now - lastSent < 15000)) {
    return true;
  }
  groupMessageLocks.set(key, now);
  return false;
}

// Cache en memoria para la verificación de pausa de WhatsApp (3 segundos)
let cachedPauseState: { value: boolean; timestamp: number } | null = null;

/**
 * Consulta de forma centralizada y ultra-rápida si los envíos automáticos de WhatsApp están pausados
 */
export async function isWhatsAppAutomationsPaused(): Promise<boolean> {
  const now = Date.now();
  if (cachedPauseState && (now - cachedPauseState.timestamp < 3000)) {
    return cachedPauseState.value;
  }
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'disable_automatic_whatsapp')
      .maybeSingle();

    if (error) {
      console.warn("[WhatsApp Pause Check] Error leyendo settings:", error.message);
      return false;
    }

    const rawVal = data?.value;
    const isPaused = Boolean(
      rawVal === true || 
      rawVal === 'true' || 
      rawVal === 1 || 
      rawVal === '1'
    );
    cachedPauseState = { value: isPaused, timestamp: now };
    return isPaused;
  } catch (err) {
    console.error("[WhatsApp Pause Check] Error inesperado:", err);
    return false;
  }
}

// Envía una plantilla genérica de WhatsApp llamando a YCloud o Meta Cloud API
export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  parameters: string[] = [],
  buttonParameters?: string[],
  bookingId?: string | number,
  buttonType?: 'url' | 'quick_reply',
  bypassPause: boolean = false,
  languageOverride?: string,
  forceResend: boolean = false
): Promise<{ success: boolean; error?: string; data?: any }> {
  let lockLogId: string | null = null;
  try {
    const token = getWhatsAppToken();
    const phoneId = getWhatsAppPhoneId();

    if (!token || !phoneId) {
      return { success: false, error: 'Credenciales de WhatsApp no configuradas en el servidor' };
    }

    const cleanedPhone = normalizePhone(phone);
    if (!cleanedPhone) {
      return { success: false, error: 'Formato de teléfono no válido' };
    }

    // Verificar si los envíos automáticos de WhatsApp están deshabilitados en la base de datos (solo si no es un envío manual)
    if (!bypassPause) {
      const isPaused = await isWhatsAppAutomationsPaused();
      if (isPaused) {
        console.log(`[WhatsApp API] ⏸️ Envíos automáticos PAUSADOS por configuración (disable_automatic_whatsapp: true). Omitiendo plantilla '${templateName}' para ${cleanedPhone}.`);
        return { 
          success: false, 
          error: 'paused', 
          data: { status: 'paused', message: 'WhatsApp automatizado pausado por administrador.' } 
        };
      }
    }

    // Candado anti-duplicados en memoria para reservaciones de grupo y envíos masivos simultáneos (30 segundos)
    const lockKey = `${cleanedPhone}_${templateName}`;
    if (isGroupMessageLocked(lockKey)) {
      console.log(`[WhatsApp Deduplicador Memoria] Omitiendo mensaje duplicado para ${cleanedPhone} (plantilla: ${templateName})`);
      return { success: true, data: { deduplicated: true, message: 'Mensaje duplicado omitido por deduplicador en memoria.' } };
    }

    // ── GUARDIA DE CICLO DE VIDA: No enviar plantillas previas al Check-in si el huésped ya está en el hotel ──
    const preCheckInTemplates = [
      'solicitud_recibida',
      'preparacion_llegada',
      'preparacion_llegada_v2'
    ];

    if (bookingId && preCheckInTemplates.includes(templateName) && !bypassPause) {
      try {
        const cleanBookingIdStr = String(bookingId).toLowerCase().trim();
        const { data: dbCheckin } = await supabase
          .from('checkins')
          .select('status')
          .eq('reservation_id', cleanBookingIdStr)
          .maybeSingle();

        if (dbCheckin?.status === 'checked_in' || dbCheckin?.status === 'checked_out') {
          console.log(`[WhatsApp Lifecycle Guard] Omitiendo ${templateName} porque la reserva ${bookingId} ya cuenta con Check-In / Check-Out realizado.`);
          return { success: false, data: { deduplicated: true }, error: 'Omitido: La reservación ya cuenta con Check-In realizado.' };
        }
      } catch (chkErr) {
        console.warn("[WhatsApp Lifecycle Guard] Error al consultar checkins en BD:", chkErr);
      }
    }

    // Resolve language preference
    let detectedLang = languageOverride || detectLanguageFromPhone(phone);

    if (bookingId && !languageOverride) {
      try {
        const { data: settings } = await supabase
          .from('booking_portal_settings')
          .select('language, mute_notifications')
          .eq('booking_id', String(bookingId))
          .maybeSingle();
        
        if (settings?.mute_notifications === true) {
          console.log(`[WhatsApp API] Envíos omitidos para la reserva ${bookingId} (mute_notifications: true)`);
          return { success: false, error: 'muted', data: { status: 'muted', message: 'Notificaciones silenciadas para esta reserva.' } };
        }
        
        if (settings?.language) {
          detectedLang = settings.language;
        }
      } catch (dbErr) {
        console.error("Error fetching booking portal settings from DB:", dbErr);
      }
    }

    // ── CANDADO ANTI-DUPLICADOS A NIVEL BASE DE DATOS (Aplica siempre para garantizar idempotencia) ──
    const bIdStr = bookingId ? String(bookingId).trim() : '';
    const rawDigits = cleanedPhone.replace(/\D/g, '');
    const last10Phone = rawDigits.slice(-10);

    // A. Deduplicación por número de teléfono en ventana de 10 minutos para la MISMA plantilla (multi-habitación)
    const multiRoomDedupTemplates = [
      'solicitud_recibida',
      'reservacion_confirmada',
      'bienvenida_checkin',
      'bienvenida_checkin_v2',
      'preparacion_llegada',
      'preparacion_llegada_v2'
    ];
    if (multiRoomDedupTemplates.includes(templateName) && last10Phone.length >= 7 && !bypassPause) {
      try {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: recentPhoneLogs } = await supabase
          .from('whatsapp_logs')
          .select('id, phone, template_name, reservation_id, status')
          .eq('template_name', templateName)
          .gte('sent_at', tenMinutesAgo)
          .neq('status', 'failed')
          .limit(50);

        const alreadySentToPhone = (recentPhoneLogs || []).some((l: any) => {
          if (l.status === 'failed') return false;
          if (l.template_name !== templateName) return false;
          const logDigits = String(l.phone || '').replace(/\D/g, '');
          return logDigits && logDigits.includes(last10Phone);
        });

        if (alreadySentToPhone) {
          console.log(`[WhatsApp Deduplicador DB] Omitiendo ${templateName} para teléfono ${cleanedPhone}, ya se envió esta misma plantilla en los últimos 10 minutos.`);
          return { success: true, data: { deduplicated: true, message: `Plantilla ${templateName} omitida por duplicidad reciente a este número de teléfono.` } };
        }
      } catch (phoneChkErr) {
        console.warn("[WhatsApp Deduplicador DB] Error verificando logs por teléfono:", phoneChkErr);
      }
    }

    // B. Deduplicación estricta por reservation_id (ignorando envíos fallidos para permitir reintentos)
    // NOTA: 'reservacion_confirmada' nunca debe duplicarse por reserva salvo orden de reenvío explícito (forceResend: true)
    const shouldCheckReservationDedup = bIdStr && (!bypassPause || (templateName === 'reservacion_confirmada' && !forceResend));
    if (shouldCheckReservationDedup) {
      try {
        if (templateName === 'solicitud_recibida') {
          const { data: initialLogs } = await supabase
            .from('whatsapp_logs')
            .select('id, template_name, status')
            .eq('reservation_id', bIdStr)
            .neq('status', 'failed')
            .in('template_name', ['solicitud_recibida', 'reservacion_confirmada', 'bienvenida_checkin', 'bienvenida_checkin_v2', 'omitido_multi_habitacion', 'omitido_multi_habitacion_sibling'])
            .limit(1);

          if (initialLogs && initialLogs.length > 0) {
            console.log(`[WhatsApp Deduplicador DB] Omitiendo solicitud_recibida, la reserva ${bIdStr} ya tiene registrado mensaje inicial exitoso (${initialLogs[0].template_name})`);
            return { success: true, data: { deduplicated: true, message: 'Mensaje inicial ya enviado previamente a esta reserva.' } };
          }
        } else if (templateName === 'reservacion_confirmada') {
          const { data: existingConfirmLog } = await supabase
            .from('whatsapp_logs')
            .select('id, status')
            .eq('reservation_id', bIdStr)
            .eq('template_name', 'reservacion_confirmada')
            .neq('status', 'failed')
            .limit(1);

          if (existingConfirmLog && existingConfirmLog.length > 0) {
            console.log(`[WhatsApp Deduplicador DB] Omitiendo reservacion_confirmada, la reserva ${bIdStr} ya tiene registrada confirmación exitosa previa.`);
            return { success: true, data: { deduplicated: true, message: 'reservacion_confirmada ya enviada previamente a esta reserva.' } };
          }
        } else {
          const singleSendPerReservationTemplates = [
            'disponibilidad_liberada',
            'bienvenida_checkin',
            'bienvenida_checkin_v2',
            'preparacion_llegada',
            'preparacion_llegada_v2',
            'seguimiento_satisfaccion',
            'seguimiento_satisfaccion_v2',
            'salida_checkout',
            'comparte_experiencia',
            'recibimiento_nuevamente',
            'recibimiento_nuevamente_5m',
            'recibimiento_nuevamente_10m',
            'ultimo_aviso',
            'ultimo_aviso_v2',
            'alojamiento_listo',
            'wifi_informacion'
          ];

          if (singleSendPerReservationTemplates.includes(templateName)) {
            const templateVariantsMap: Record<string, string[]> = {
              'ultimo_aviso': ['ultimo_aviso', 'ultimo_aviso_v2'],
              'ultimo_aviso_v2': ['ultimo_aviso', 'ultimo_aviso_v2'],
              'preparacion_llegada': ['preparacion_llegada', 'preparacion_llegada_v2'],
              'preparacion_llegada_v2': ['preparacion_llegada', 'preparacion_llegada_v2'],
              'bienvenida_checkin': ['bienvenida_checkin', 'bienvenida_checkin_v2'],
              'bienvenida_checkin_v2': ['bienvenida_checkin', 'bienvenida_checkin_v2'],
              'seguimiento_satisfaccion': ['seguimiento_satisfaccion', 'seguimiento_satisfaccion_v2'],
              'seguimiento_satisfaccion_v2': ['seguimiento_satisfaccion', 'seguimiento_satisfaccion_v2'],
            };
            const checkedVariants = templateVariantsMap[templateName] || [templateName];

            const { data: existingBookingLog } = await supabase
              .from('whatsapp_logs')
              .select('id, status')
              .eq('reservation_id', bIdStr)
              .in('template_name', checkedVariants)
              .neq('status', 'failed')
              .limit(1);

            if (existingBookingLog && existingBookingLog.length > 0) {
              console.log(`[WhatsApp Deduplicador DB] Omitiendo ${templateName}, ya se envió exitosamente a la reserva ${bIdStr}`);
              return { success: true, data: { deduplicated: true, message: `Plantilla ${templateName} ya enviada previamente a esta reserva.` } };
            }
          }
        }
      } catch (dbDedupErr) {
        console.error("[WhatsApp Deduplicador DB] Error al verificar logs existentes:", dbDedupErr);
      }
    }

    // C. Candado Atómico Previo en Base de Datos (Pre-Send DB Lock)
    try {
      const { data: insertedLock } = await supabase
        .from('whatsapp_logs')
        .insert([{
          reservation_id: bIdStr || 'system_manual',
          template_name: templateName,
          phone: cleanedPhone,
          sent_at: new Date().toISOString(),
          status: 'sending'
        }])
        .select('id')
        .maybeSingle();

      if (insertedLock?.id) {
        lockLogId = String(insertedLock.id);
      }
    } catch (lockErr) {
      console.warn("[WhatsApp Pre-Send Lock] Error insertando candado previo:", lockErr);
    }

    const spanishOnlyTemplates = ['pago_anticipo_recibido', 'alojamiento_listo', 'rechazo_solicitud', 'confirmar_reserva'];
    let languageCode = (detectedLang === 'en' && !spanishOnlyTemplates.includes(templateName)) ? 'en' : 'es';

    const urlTemplates = [
      'solicitud_recibida',
      'ultimo_aviso',
      'ultimo_aviso_v2',
      'reservacion_confirmada',
      'confirmacion_reserva_util',
      'preparacion_llegada',
      'preparacion_llegada_v2',
      'bienvenida_checkin',
      'bienvenida_checkin_v2',
      'seguimiento_satisfaccion',
      'seguimiento_satisfaccion_v2',
      'pago_anticipo_recibido',
      'portal_huesped_link',
      'portal_huesped_link_en',
      'rechazo_solicitud',
      'alojamiento_listo'
    ];

    let resolvedButtonType = buttonType;
    let finalButtonParams = buttonParameters;

    if (urlTemplates.includes(templateName)) {
      resolvedButtonType = 'url';
      if (bookingId) {
        finalButtonParams = [`${bookingId}?lang=${detectedLang}`];
      }
    }

    const quoteAvailabilityTemplates = [
      'disponibilidad_liberada',
      'disponibilidad_liberada_v2',
      'recibimiento_nuevamente',
      'recibimiento_nuevamente_v2',
      'recibimiento_nuevamente_5m',
      'recibimiento_nuevamente_10m'
    ];

    if (quoteAvailabilityTemplates.includes(templateName)) {
      resolvedButtonType = 'url';
      const metaCleanPhone = cleanPhoneForMeta(cleanedPhone);
      finalButtonParams = [metaCleanPhone];
    }

    // Prioridad absoluta: Si existen credenciales de Meta Cloud API, usar 'meta'.
    // La cuenta de YCloud fue bloqueada por Meta (Error 131031) y no debe usarse bajo ninguna circunstancia.
    const isMetaConfigured = Boolean(getWhatsAppToken() && getWhatsAppPhoneId());
    const provider = isMetaConfigured ? 'meta' : (process.env.WHATSAPP_PROVIDER || 'meta');

    let response: Response;
    let status: number;
    let resBody: any;
    let executeMeta = provider === 'meta';

    if (provider === 'ycloud') {
      const ycloudApiKey = process.env.YCLOUD_API_KEY;
      const ycloudFrom = process.env.YCLOUD_FROM_PHONE || '+529581168698';
      
      if (!ycloudApiKey) {
        if (lockLogId) {
          try { await supabase.from('whatsapp_logs').delete().eq('id', lockLogId); } catch (_) {}
        }
        return { success: false, error: 'Credenciales de YCloud (YCLOUD_API_KEY) no configuradas en el servidor' };
      }

      const ycloudUrl = 'https://api.ycloud.com/v2/whatsapp/messages';
      const standardPhone = cleanPhoneForMeta(cleanedPhone);
      const toPhone = standardPhone.startsWith('+') ? standardPhone : `+${standardPhone}`;

      const ycloudComponents: any[] = [];

      if (templateName === 'bienvenido_cliente_final_v2' || templateName === 'bienvenido_cliente_whatsaap') {
        const imageUrl = detectedLang === 'en'
          ? (templateName === 'bienvenido_cliente_whatsaap'
              ? 'https://oss-ycloud-publicread.oss-ap-southeast-1.aliyuncs.com/online/BASE-FILE/2026/10/01/e0abe9ca-b97d-4d88-ad86-8da55f4b18f0.jpg'
              : 'https://oss-ycloud-publicread.oss-ap-southeast-1.aliyuncs.com/online/BASE-FILE/2026/09/29/423d7a83-1e4f-47de-ad3b-aebcc59016ed.jpg')
          : (templateName === 'bienvenido_cliente_whatsaap'
              ? 'https://oss-ycloud-publicread.oss-ap-southeast-1.aliyuncs.com/online/BASE-FILE/2026/10/01/a7251aab-6406-4a82-8a44-170a405bc466.jpg'
              : 'https://oss-ycloud-publicread.oss-ap-southeast-1.aliyuncs.com/online/BASE-FILE/2026/10/01/633b619b-41d4-4c6f-ad76-4ac0ba3bb924.jpg');

        ycloudComponents.push({
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: {
                link: imageUrl
              }
            }
          ]
        });
      }

      if (parameters && parameters.length > 0) {
        ycloudComponents.push({
          type: 'body',
          parameters: parameters.map(p => ({
            type: 'text',
            text: p || '—'
          }))
        });
      }

      if (finalButtonParams && finalButtonParams.length > 0) {
        const isQuickReply = resolvedButtonType === 'quick_reply' || finalButtonParams[0].startsWith('VIEW_BOOKING_');
        
        if (isQuickReply) {
          ycloudComponents.push({
            type: 'button',
            sub_type: 'quick_reply',
            index: 0,
            parameters: [
              {
                type: 'payload',
                payload: finalButtonParams[0]
              }
            ]
          });
        } else {
          if ((templateName === 'bienvenida_checkin' || templateName === 'seguimiento_satisfaccion') && bookingId) {
            ycloudComponents.push({
              type: 'button',
              sub_type: 'url',
              index: 0,
              parameters: [
                {
                  type: 'text',
                  text: `${bookingId}?lang=${detectedLang}`
                }
              ]
            });
            ycloudComponents.push({
              type: 'button',
              sub_type: 'url',
              index: 1,
              parameters: [
                {
                  type: 'text',
                  text: `&id=${bookingId}&lang=${detectedLang}`
                }
              ]
            });
          } else {
            ycloudComponents.push({
              type: 'button',
              sub_type: 'url',
              index: 0,
              parameters: [
                {
                  type: 'text',
                  text: finalButtonParams[0] || ''
                }
              ]
            });
          }
        }
      }

      const ycloudLang = detectedLang === 'en' ? 'en' : 'es';
      let targetTemplate = templateName;
      if (templateName === 'reservacion_confirmada' && (toPhone.startsWith('+1') || cleanedPhone.startsWith('1'))) {
        targetTemplate = 'confirmacion_reserva_util';
      }

      const ycloudPayload: any = {
        from: ycloudFrom,
        to: toPhone,
        type: 'template',
        template: {
          name: targetTemplate,
          language: { code: ycloudLang }
        }
      };

      if (ycloudComponents.length > 0) {
        ycloudPayload.template.components = ycloudComponents;
      }

      response = await fetch(ycloudUrl, {
        method: 'POST',
        headers: {
          'X-API-Key': ycloudApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ycloudPayload)
      });

      status = response.status;
      resBody = await response.json();

      // Si falla por plantilla no disponible (ej: 'confirmacion_reserva_util' PENDING o 'disponibilidad_liberada' vs 'disponibilidad_liberada_'), reintentar con el nombre alternativo
      if (!response.ok && (resBody.error?.code === 'WHATSAPP_TEMPLATE_UNAVAILABLE' || String(resBody.error?.message || '').includes('PENDING'))) {
        let altName = targetTemplate.endsWith('_') ? targetTemplate.slice(0, -1) : `${targetTemplate}_`;
        if (targetTemplate === 'confirmacion_reserva_util') {
          altName = 'reservacion_confirmada';
        } else if (targetTemplate === 'reservacion_confirmada') {
          altName = 'confirmacion_reserva_util';
        }
        console.warn(`[YCloud] Plantilla '${targetTemplate}' no disponible. Reintentando con alias '${altName}'...`);
        const ycloudAltNamePayload = {
          ...ycloudPayload,
          template: {
            ...ycloudPayload.template,
            name: altName
          }
        };

        try {
          const retryNameRes = await fetch(ycloudUrl, {
            method: 'POST',
            headers: {
              'X-API-Key': ycloudApiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(ycloudAltNamePayload)
          });

          if (retryNameRes.ok) {
            response = retryNameRes;
            status = retryNameRes.status;
            resBody = await retryNameRes.json();
            console.log(`✅ [YCloud] Éxito enviando con plantilla alternativa: ${altName}`);
          }
        } catch (retryNameErr) {
          console.error(`[YCloud] Error reintentando plantilla alternativa:`, retryNameErr);
        }
      }

      // Retry without buttons for YCloud if it fails due to button structure mismatch
      if (!response.ok && finalButtonParams && finalButtonParams.length > 0) {
        console.warn(`YCloud API failed with ${status} for template ${templateName} (with buttons). Retrying without button parameters...`);
        const bodyComponents = ycloudComponents.filter(c => c.type === 'body');
        const ycloudNoButtonsPayload: any = {
          ...ycloudPayload,
          template: {
            ...ycloudPayload.template
          }
        };
        if (bodyComponents.length > 0) {
          ycloudNoButtonsPayload.template.components = bodyComponents;
        }

        try {
          const retryRes = await fetch(ycloudUrl, {
            method: 'POST',
            headers: {
              'X-API-Key': ycloudApiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(ycloudNoButtonsPayload)
          });

          if (retryRes.ok) {
            response = retryRes;
            status = retryRes.status;
            resBody = await retryRes.json();
            console.log(`✅ Success retrying YCloud template ${templateName} without buttons.`);
          }
        } catch (retryErr) {
          console.error(`Error retrying YCloud template ${templateName}:`, retryErr);
        }
      }

      if (!response.ok) {
        console.warn(`[YCloud] Error al enviar plantilla '${templateName}' (${status}):`, resBody);
        executeMeta = true;
      }
    }

    if (executeMeta) {
      // ── DRIVER META CLOUD API (RESPALDO AUTOMÁTICO O PROVEEDOR PRINCIPAL) ──
      const token = getWhatsAppToken();
      const phoneId = getWhatsAppPhoneId();

      if (!token || !phoneId) {
        if (lockLogId) {
          try { await supabase.from('whatsapp_logs').delete().eq('id', lockLogId); } catch (_) {}
        }
        return { success: false, error: 'Credenciales de Meta no configuradas para fallback' };
      }

      const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;

      const components: any[] = [];

      const META_TEMPLATE_ALIASES: Record<string, string> = {
        'ultimo_aviso': 'ultimo_aviso_v2',
        'preparacion_llegada': 'preparacion_llegada_v2',
        'bienvenida_checkin': 'bienvenida_checkin_v2',
        'seguimiento_satisfaccion': 'seguimiento_satisfaccion_v2',
        'bienvenido_cliente_final_v2': 'bienvenido_cliente_llamada_v4',
        'bienvenido_cliente_llamada': 'bienvenido_cliente_llamada_v4',
        'bienvenido_cliente_llamada_v2': 'bienvenido_cliente_llamada_v4',
        'bienvenido_cliente_whatsaap': 'bienvenido_cliente_whatsaap_v4',
        'bienvenido_cliente_whatsaap_v2': 'bienvenido_cliente_whatsaap_v4',
        'bienvenido_cliente_whatsaap_v3': 'bienvenido_cliente_whatsaap_v4',
        'bienvenido_cliente_whatsaap_v4': 'bienvenido_cliente_whatsaap_v4',
        'confirmar_reserva': 'confirmar_reserva',
        'portal_huesped_link_en': 'portal_huesped_link',
      };
      const actualMetaTemplate = META_TEMPLATE_ALIASES[templateName] || templateName;

      // Header de imagen para plantillas con portada multimedia (Conmutador y WhatsApp Directo)
      if (
        actualMetaTemplate === 'bienvenido_cliente_llamada_v2' || 
        actualMetaTemplate === 'bienvenido_cliente_llamada_v4' ||
        actualMetaTemplate === 'bienvenido_cliente_whatsaap_v2' ||
        actualMetaTemplate === 'bienvenido_cliente_whatsaap_v4'
      ) {
        components.push({
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: {
                link: 'https://jaroje-app.vercel.app/images/general/1.jpg'
              }
            }
          ]
        });
      }

      if (parameters && parameters.length > 0) {
        components.push({
          type: 'body',
          parameters: parameters.map(p => ({
            type: 'text',
            text: p || '—'
          }))
        });
      }

      if (finalButtonParams && finalButtonParams.length > 0) {
        const isQuickReply = resolvedButtonType === 'quick_reply' || finalButtonParams[0].startsWith('VIEW_BOOKING_');
        
        if (isQuickReply) {
          components.push({
            type: 'button',
            sub_type: 'quick_reply',
            index: '0',
            parameters: [
              {
                type: 'payload',
                payload: finalButtonParams[0]
              }
            ]
          });
        } else {
          components.push({
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: finalButtonParams.map(p => ({
              type: 'text',
              text: p || ''
            }))
          });
        }
      }

      // Plantillas que SOLO existen en español ('es') en Meta WhatsApp Business
      const SPANISH_ONLY_TEMPLATES = new Set([
        'confirmar_reserva',
        'portal_huesped_link',
        'bienvenido_cliente_whatsaap_v4',
        'test_mixed_buttons_no_emoji'
      ]);

      // Plantillas que fueron registradas con código de idioma 'en' en Meta WhatsApp Business
      const ENGLISH_CODE_TEMPLATES = new Set([
        'bienvenido_cliente_llamada_v4'
      ]);

      // Resolución estricta de idioma según el catálogo oficial aprobado en Meta
      let metaLanguage: string;
      if (SPANISH_ONLY_TEMPLATES.has(actualMetaTemplate)) {
        metaLanguage = 'es';
      } else if (ENGLISH_CODE_TEMPLATES.has(actualMetaTemplate)) {
        metaLanguage = 'en';
      } else {
        metaLanguage = languageOverride || (detectedLang === 'en' ? 'en' : 'es');
      }

      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhoneForMeta(cleanedPhone),
        type: 'template',
        template: {
          name: actualMetaTemplate,
          language: { code: metaLanguage }
        }
      };

      if (components.length > 0) {
        payload.template.components = components;
      }

      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      status = response.status;
      resBody = await response.json();

      // Auto-retry with Spanish if language is 'en' and it fails (e.g., translation pending approval in Meta)
      if (status !== 200 && metaLanguage === 'en') {
        console.warn(`Meta API failed with ${status} for template ${templateName} in English. Retrying with approved Spanish fallback 'es'...`);
        const retryEsPayload = {
          ...payload,
          template: {
            ...payload.template,
            language: { code: 'es' }
          }
        };

        try {
          const retryRes = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(retryEsPayload)
          });

          if (retryRes.ok) {
            response = retryRes;
            status = retryRes.status;
            resBody = await retryRes.json();
            console.log(`✅ Success retrying template ${templateName} with Spanish fallback ('es')`);
          } else {
            console.warn(`Fallback to Spanish 'es' also failed for ${templateName}:`, await retryRes.clone().json());
          }
        } catch (retryErr) {
          console.error(`Error during Spanish fallback retry for template ${templateName}:`, retryErr);
        }
      }

      // Auto-retry with alternative Spanish code if language is 'es_MX' or 'es' and it fails
      if (status !== 200 && (languageCode === 'es_MX' || languageCode === 'es')) {
        const altLang = languageCode === 'es_MX' ? 'es' : 'es_MX';
        console.warn(`Meta API failed with ${status} for template ${templateName} (lang: ${languageCode}). Retrying with alternative Spanish: ${altLang}...`);
        
        const retryPayload = {
          ...payload,
          template: {
            ...payload.template,
            language: { code: altLang }
          }
        };

        try {
          const retryRes = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(retryPayload)
          });

          if (retryRes.ok) {
            response = retryRes;
            status = retryRes.status;
            resBody = await retryRes.json();
            console.log(`✅ Success retrying template ${templateName} with language: ${altLang}`);
          } else {
            console.warn(`Retry failed with alternative Spanish ${altLang}:`, await retryRes.clone().json());
          }
        } catch (retryErr) {
          console.error(`Error during language retry for template ${templateName}:`, retryErr);
        }
      }

      // Auto-retry without button parameters if it still fails (in case the template in Meta has static buttons or no buttons at all)
      if (status !== 200 && finalButtonParams && finalButtonParams.length > 0) {
        console.warn(`Meta API failed with ${status} for template ${templateName} (with buttons). Retrying without button parameters...`);
        
        const bodyOnlyComponent = components.filter(c => c.type === 'body');
        const retryNoButtonsPayload = {
          ...payload,
          template: {
            ...payload.template,
            components: bodyOnlyComponent
          }
        };

        try {
          const retryRes = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(retryNoButtonsPayload)
          });

          if (retryRes.ok) {
            response = retryRes;
            status = retryRes.status;
            resBody = await retryRes.json();
            console.log(`✅ Success retrying template ${templateName} without button parameters.`);
          } else {
            console.warn(`Retry without buttons failed:`, await retryRes.clone().json());
            if (languageCode === 'es_MX' || languageCode === 'es') {
              const altLang = languageCode === 'es_MX' ? 'es' : 'es_MX';
              const retryNoButtonsAltLangPayload = {
                ...retryNoButtonsPayload,
                template: {
                  ...retryNoButtonsPayload.template,
                  language: { code: altLang }
                }
              };
              const retryAltRes = await fetch(url, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(retryNoButtonsAltLangPayload)
              });
              if (retryAltRes.ok) {
                response = retryAltRes;
                status = retryAltRes.status;
                resBody = await retryAltRes.json();
                console.log(`✅ Success retrying template ${templateName} without button parameters in alternative language: ${altLang}`);
              }
            }
          }
        } catch (retryErr) {
          console.error(`Error during no-button retry for template ${templateName}:`, retryErr);
        }
      }

      if (status !== 200) {
        if (lockLogId) {
          try { await supabase.from('whatsapp_logs').delete().eq('id', lockLogId); } catch (_) {}
        }
        console.error(`Meta API error template ${templateName}:`, resBody);
        return { success: false, error: resBody.error?.message || 'Error de la API de Meta' };
      }
    }

    // Registrar el envío de plantilla en la tabla 'conversations'
    try {
      const getTemplateText = (tName: string, params: string[]) => {
        const name = params[0] || (detectedLang === 'en' ? 'Guest' : 'Huésped');
        
        if (detectedLang === 'en') {
          switch (tName) {
            case 'solicitud_recibida':
              return `📋 Reservation request received (24 h to confirm)\n\nHello, ${name}.\n\nThank you for choosing Condominios Jaroje for your next vacation in Huatulco! 🌴\n\nIn your "Guest Portal" you will find all the information about your reservation, including photos and description of your accommodation, reservation details, hotel and cancellation policies, as well as payment options, if you need them.\n\n👇 Guest Portal\n\n[Button: Guest Portal] [Button: Location]`;
            case 'ultimo_aviso':
            case 'ultimo_aviso_v2':
              return `⏳ Last reminder (1 hour left to confirm your reservation)\n\nHello, ${name}.\n\nWe just need your deposit to confirm your reservation. Remember that the deadline to receive it expires in approximately 1 hour.\n\nIn "Make deposit" you will find the available payment options. If you have already made your deposit, please send us your receipt.\n\n👇 Make Deposit\n\n[Button: Make deposit]`;
            case 'reservacion_confirmada':
            case 'confirmacion_reserva_util':
              return `🎉 Your reservation is confirmed!\n\nExcellent, ${name}!\n\nWe are very pleased to confirm that your reservation is ready. We are ready to welcome you.\n\nIn "Guest Portal" you will be able to check any updates to your reservation in real time, as well as the photos, description and services of your accommodation.\n\n👥 Did the number of guests change? Update it from "My reservation" before your arrival to avoid additional charges at check-in.\n\n[Button: Guest Portal] [Button: How to get there]`;
            case 'disponibilidad_liberada':
            case 'disponibilidad_liberada_v2':
              return `😔 Availability released\n\nHello, ${name}.\n\nWe regret to inform you that since we did not receive the deposit within the indicated period, the availability of your accommodation was released.\n\nIf you still wish to stay with us, press "Availability and Quote" to check if we still have accommodation available for your travel dates and make a new reservation.\n\n👇 Availability and Quote\n\n[Button: Availability and Quote] [Button: Photos and Rates]`;
            case 'preparacion_llegada':
            case 'preparacion_llegada_v2':
              return `🚗 Everything ready for your arrival\n\nHello, ${name}.\n\nVery soon we will welcome you to Condominios Jaroje! We want your arrival to be as comfortable as possible.\n\n👥 Did the number of guests change? Update it from "My reservation" before your arrival to avoid additional charges at check-in.\n\nIn "My reservation" you will find the gate code, location, directions, photos, description and services of your accommodation, as well as everything you need to prepare for your arrival.\n\nArriving after 8:00 p.m.? Let us know in advance to welcome you.\n\nWe wish you an excellent trip!\n\n[Button: My reservation] [Button: How to get there] [Button: Ver WiFi y claves]`;
            case 'bienvenida_checkin':
            case 'bienvenida_checkin_v2':
              return `🏡 Welcome to Condominios Jaroje!\n\nWhat a pleasure to welcome you, ${name}!\n\nWe hope you had an excellent trip. We hope you enjoy an excellent stay and feel at home.\n\nIn "My stay" you will find the gate code, WiFi network and password, photos, description and services of your accommodation, as well as all the necessary information to enjoy your stay.\n\nIf during your stay you need to report any maintenance details, you can do so from "My stay".\n\nWe wish you a wonderful stay. If you need anything, we are here to help.\n\n👇 My stay\n\n[Button: My stay] [Button: Ver WiFi y claves]`;
            case 'seguimiento_satisfaccion':
            case 'seguimiento_satisfaccion_v2':
              return `😊 How is your stay going?\n\nGood morning, ${name}.\n\nWe want to make sure everything is going as expected.\n\nIf there is anything we can do to make you enjoy your stay even more, we will gladly be at your service.\n\n👇 My stay\n\n[Button: My stay] [Button: Ver WiFi y claves]`;
            case 'salida_checkout':
              return `🚪 Check-out 12:00 p.m.\n\nVery good morning, ${name}.\n\nToday your stay with us ends. Thank you very much for choosing us and we hope you enjoyed your stay.\n\nIf you need to store your luggage after check-out or require assistance with your departure, we will gladly be here to help.\n\nIf there was anything that did not meet your expectations, please let us know so we can help you.\n\nIf you feel your experience was ⭐⭐⭐⭐⭐, we would love for you to share your review.\n\n👇 Write review\n\n[Button: Write review]`;
            case 'comparte_experiencia':
              return `⭐ How was your experience?\n\nHello, ${name}.\n\nWe hope you arrived home safely and keep an excellent memory of your stay with us.\n\nIf there was anything that did not meet your expectations, please let us know so we can help you.\n\nIf your experience was ⭐⭐⭐⭐⭐, it would make us very happy if you shared your review. Your review helps other travelers choose us with greater confidence and motivates us to keep improving.\n\n👇 Rate accommodation\n\n[Button: Rate your accommodation]`;
            case 'recibimiento_nuevamente':
              return `🌴 We would love to welcome you again!\n\nHello again, ${name}.\n\nToday we remembered your stay with us and wanted to say hello. We hope you keep a great memory of Huatulco and your stay with us.\n\nIf you are thinking of returning to Huatulco, it will be a pleasure to welcome you again. In "Check availability" you can consult availability and start a new reservation.\n\n👇 Check availability\n\n[Button: Check availability]`;
            case 'wifi_informacion':
              return `📶 WiFi, Access Codes & Important Info\n\nWiFi: JAROJE\nPassword: HUXX2025\nGate Code: 3456\nPool Hours: 9:00 AM – 10:00 PM`;
            case 'bienvenido_cliente_llamada':
            case 'bienvenido_cliente_llamada_v2':
            case 'bienvenido_cliente_final_v2':
              return `👋 Hello! Welcome to Condominios Jaroje 🌴\n\nWe noticed you tried to call us and apologize for missing your call. We are pleased to share our lodging options, rates, and availability.\n\n[Button: Photos and rates] [Button: Quote & availability] [Button: Book NOW!]`;
            case 'bienvenido_cliente_whatsaap':
            case 'bienvenido_cliente_whatsaap_v2':
              return `👋 Hello! Welcome to Condominios Jaroje 🌴\n\nWe are pleased to share our lodging options, rates, and availability.\n\n[Button: Photos and rates] [Button: Quote & availability] [Button: Book NOW!]`;
            case 'pago_anticipo_recibido':
              const abonadoEn = params[1] || '$0.00';
              const saldoEn = params[2] || '$0.00';
              return `Hello ${name}!\n\nWe have successfully registered your payment in the amount of *${abonadoEn}*.\n\nYour current outstanding balance is *${saldoEn}*.\n\n👇 *Guest Portal*\n\n[Button: Guest Portal]`;
            case 'portal_huesped_link':
            case 'portal_huesped_link_en':
              return `Hello ${name}, here is your access to your real-time booking details. From your portal you can view your room status, guidelines, WiFi info, and record additional payments.✅\n\n👇 *Guest Portal*\n\n[Button: Guest Portal]`;
            case 'alojamiento_listo':
              return `✨ Great news, ${name}!\n\nYour accommodation is now clean, sanitized, and ready to welcome you.\n\nIf you are already in Huatulco, you can check in whenever you like. In "My stay" you will find all the arrival information, including gate access, WiFi, and your stay details.\n\nWe look forward to seeing you! 🏡\n\n[Button: My stay] [Button: How to get there]`;
            case 'rechazo_solicitud':
              const motivo = params[2] || 'Not specified';
              return `❌ Reservation Request Rejected\n\nHello, ${name}.\n\nWe inform you that your reservation request #${params[1] || ''} has been rejected for the following reason:\n\n*${motivo}*\n\nWe apologize for any inconvenience this may cause you.`;
            default:
              return `[Template: ${tName}]` + (params.length > 0 ? ` (Parameters: ${params.join(', ')})` : '');
          }
        }

        switch (tName) {
          case 'solicitud_recibida':
            return `📋 Solicitud de reservación recibida (24 h para confirmar)\n\nHola, ${name}.\n\n¡Gracias por elegir Condominios Jaroje para tus próximas vacaciones en Huatulco! 🌴\n\nEn tu "Portal del Huésped" encontrarás toda la información sobre tu reservación, incluyendo las fotos y la descripción de tu alojamiento, los datos de tu reservación, las políticas del hotel y de cancelación, así como las opciones de pago, si las necesitas.\n\n👇 Portal del Huésped\n\n[Botón: Portal del Huésped] [Botón: Ubicación]`;
          case 'ultimo_aviso':
          case 'ultimo_aviso_v2':
            return `⏳ Último recordatorio (queda 1 hora para confirmar tu reservación)\n\nHola, ${name}.\n\nSolo falta realizar tu depósito para confirmar tu reservación. Recuerda que el plazo para recibirlo vence en aproximadamente 1 hora.\n\nEn "Realizar depósito" encontrarás las opciones de pago disponibles. Si ya realizaste tu depósito, por favor envíanos tu comprobante.\n\n👇 Realizar Depósito\n\n[Botón: Realizar depósito]`;
          case 'reservacion_confirmada':
          case 'confirmacion_reserva_util':
            return `🎉 ¡Tu reservación está confirmada!\n\n¡Excelente, ${name}!\n\nNos da mucho gusto confirmar que tu reservación ya quedó lista. Estamos listos para recibirte.\n\nEn "Portal del Huésped" podrás consultar cualquier actualización de tu reservación en tiempo real, así como las fotos, la descripción y los servicios de tu alojamiento.\n\n👥 ¿Cambió el número de huéspedes? Actualízalo desde "Mi reservación" antes de tu llegada para evitar cargos adicionales al momento del check-in.\n\n[Botón: Portal del Huésped] [Botón: Cómo llegar]`;
          case 'disponibilidad_liberada':
            return `😔 Disponibilidad liberada\n\nHola, ${name}.\n\nLamentamos informarte que, al no recibir el anticipo dentro del plazo indicado, la disponibilidad de tu alojamiento fue liberada.\n\nSi aún deseas hospedarte con nosotros, presiona “Verificar disponibilidad” para consultar si todavía contamos con alojamiento disponible para las fechas de tu viaje y, en caso de haber disponibilidad, realizar una nueva reservación.\n\n👇 Verificar disponibilidad\n\n[Botón: Verificar disponibilidad]`;
          case 'preparacion_llegada':
          case 'preparacion_llegada_v2':
            return `🚗 Todo listo para tu llegada\n\nHola, ${name}.\n\n¡Ya falta muy poco para recibirte en Condominios Jaroje! Queremos que tu llegada sea lo más cómoda posible.\n\n👥 ¿Cambió el número de huéspedes? Actualízalo desde "Mi reservación" antes de tu llegada para evitar cargos adicionales al momento del check-in.\n\nEn "Mi reservación" encontrarás el código del portón, la ubicación, las indicaciones para llegar, las fotos, la descripción y los servicios de tu alojamiento, así como todo lo necesario para preparar tu llegada.\n\n¿Llegarás después de las 8:00 p.m.? Avísanos con anticipación para recibirte.\n\n¡Te deseamos un excelente viaje!\n\n[Botón: Mi reservación] [Botón: Cómo llegar] [Botón: Ver WiFi y claves]`;
          case 'bienvenida_checkin':
          case 'bienvenida_checkin_v2':
            return `🏡 ¡Bienvenido a Condominios Jaroje!\n\n¡Qué gusto recibirte, ${name}!\n\nEsperamos que hayas tenido un excelente viaje. Deseamos que disfrutes una excelente estancia y que te sientas como en casa.\n\nEn "Mi estancia" encontrarás el código del portón, la red WiFi y su contraseña, las fotos, la descripción y los servicios de tu alojamiento, así como toda la información necesaria para disfrutar tu estancia.\n\nSi durante tu estancia necesitas reportar algún detalle de mantenimiento podrás hacerlo desde "Mi estancia".\n\nDeseamos que disfrutes tu estancia. Si necesitas cualquier cosa, aquí estamos para ayudarte.\n\n👇 Mi estancia\n\n[Botón: Mi estancia] [Botón: Ver WiFi y claves]`;
          case 'seguimiento_satisfaccion':
          case 'seguimiento_satisfaccion_v2':
            return `😊 ¿Cómo va tu estancia?\n\nBuenos días, ${name}.\n\nQueremos asegurarnos de que todo esté transcurriendo como esperabas.\n\nSi hay algo que podamos hacer para que disfrutes aún más tu estancia, con gusto estaremos para servirte.\n\n👇 Mi estancia\n\n[Botón: Mi estancia] [Botón: Ver WiFi y claves]`;
          case 'salida_checkout':
            return `🚪 Check-out 12:00 p.m.\n\nMuy buenos días, ${name}.\n\nHoy finaliza tu estancia con nosotros. Muchas gracias por habernos elegido y esperamos que hayas disfrutado tu estancia.\n\nSi necesitas resguardar tu equipaje después del check-out o requieres apoyo con tu salida, con gusto estaremos para ayudarte.\n\nSi hubo algo que no cumplió tus expectativas, por favor háznoslo saber para poder ayudarte.\n\nSi consideras que tu experiencia fue de ⭐⭐⭐⭐⭐, nos encantará que compartas tu opinión.\n\n👇 Escribir reseña\n\n[Botón: Escribir reseña]`;
          case 'comparte_experiencia':
            return `⭐ ¿Cómo estuvo tu experiencia?\n\nHola, ${name}.\n\nEsperamos que hayas llegado con bien a casa y que conserves un excelente recuerdo de tu estancia con nosotros.\n\nSi hubo algo que no cumplió tus expectativas, por favor háznoslo saber para poder ayudarte.\n\nSi tu experiencia fue de ⭐⭐⭐⭐⭐, nos haría muy feliz que compartieras tu reseña. Tu reseña ayuda a otros viajeros a elegirnos con mayor confianza y nos motiva a seguir mejorando.\n\n👇 Calificar alojamiento\n\n[Botón: Califica tu alojamiento]`;
          case 'recibimiento_nuevamente':
            return `🌴 ¡Nos encantará recibirte nuevamente!\n\nHola de nuevo, ${name}.\n\nHoy nos acordamos de tu estancia con nosotros y quisimos saludarte. Esperamos que guardes un excelente recuerdo de Huatulco y de tu estancia con nosotros.\n\nSi estás pensando en regresar a Huatulco, será un placer recibirte nuevamente. En “Verificar disponibilidad” podrás consultar disponibilidad y comenzar una nueva reservación.\n\n👇 Verificar disponibilidad\n\n[Botón: Verificar disponibilidad]`;
          case 'wifi_informacion':
            return `📶 WiFi, Claves e Información Importante\n\nRed WiFi: JAROJE\nContraseña: HUXX2025\nPortón: 3456\nHorario alberca: 9:00 a 22:00 hrs.`;
          case 'pago_anticipo_recibido':
            const abonado = params[1] || '$0.00';
            const saldo = params[2] || '$0.00';
            return `¡Hola ${name}!\n\nHemos registrado con éxito tu pago por la cantidad de *${abonado}*.\n\nTu saldo pendiente actual es de *${saldo}*.\n\n👇 *Portal del Huésped*\n\n[Botón: Portal del Huésped]`;
          case 'portal_huesped_link':
            return `Hola ${name}, aquí tienes acceso a tu reservación en tiempo real. Desde tu portal puedes ver el estado de tu habitación, reglamento, datos de WiFi y registrar pagos adicionales.✅\n\n👇 *Portal del Huésped*\n\n[Botón: Portal del Huésped]`;
          case 'portal_huesped_link_en':
            return `Hello ${name}, here is your access to your real-time booking details. From your portal you can view your room status, guidelines, WiFi info, and record additional payments.✅\n\n👇 *Guest Portal*\n\n[Button: Guest Portal]`;
          case 'alojamiento_listo':
            return `✨ ¡Buenas noticias, ${name}!\n\nTu alojamiento ya está limpio, desinfectado y listo para recibirte.\n\nSi ya te encuentras en Huatulco, puedes dirigirte cuando gustes. En "Mi estancia" encontrarás toda la información para tu llegada, incluyendo el acceso, la red WiFi y los detalles de tu estancia.\n\n¡Te esperamos! 🏡\n\n[Botón: Mi estancia] [Botón: Cómo llegar]`;
          case 'rechazo_solicitud':
            const motivo = params[2] || 'No especificado';
            return `❌ Solicitud Reservación Rechazada\n\nHola, ${name}.\n\nTe informamos que tu solicitud de reservación #${params[1] || ''} ha sido rechazada por el siguiente motivo:\n\n*${motivo}*\n\nLamentamos los inconvenientes que esto pueda causarte.`;
          case 'bienvenido_cliente_llamada':
          case 'bienvenido_cliente_llamada_v2':
          case 'bienvenido_cliente_final_v2':
            return `👋 ¡Hola! Bienvenido a Condominios Jaroje 🌴\n\nVimos que intentaste comunicarte con nosotros por teléfono y lamentamos no haber podido responder tu llamada. Con gusto te compartimos nuestras opciones de alojamiento, tarifas y disponibilidad.\n\n[Botón: Fotos y tarifas] [Botón: Disponibili. y cotización] [Botón: ¡Reserva YA!]`;
          case 'bienvenido_cliente_whatsaap':
          case 'bienvenido_cliente_whatsaap_v2':
          case 'bienvenido_cliente_whatsaap_v4':
            return `👋 ¡Hola! Bienvenido a Condominios Jaroje 🌴\n\nCon gusto te compartimos nuestras opciones de alojamiento, tarifas y disponibilidad.\n\n[Botón: Disponibilidad y Cotización] [Botón: Fotos y Tarifas] [Botón: Ubicación]`;
          case 'confirmar_reserva':
            return `🎉 ¡Excelente! 🎉\n\nHemos recibido tu cotización. Para confirmar tu reserva, necesitamos que introduzcas tu nombre y apellidos.\n\nPulsa el botón para completar tu reserva 👇\n\n[Botón: Confirmar Reserva]`;
          default:
            return `[Plantilla: ${tName}]` + (params.length > 0 ? ` (Parámetros: ${params.join(', ')})` : '');
        }
      };

      const summaryText = getTemplateText(templateName, parameters).replace('[BOOKID]', String(bookingId || ''));

      const newMsg = {
        role_manager: summaryText,
        role_guest:   null,
        role_bot:     null,
        timestamp:    new Date().toISOString(),
      };

      // Buscar si ya existe una conversación
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .eq('guest_phone', cleanedPhone)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        const newMessages = [...(existing.messages || []), newMsg];
        await supabase
          .from('conversations')
          .update({ 
            messages: newMessages, 
            timestamp: new Date().toISOString(),
            resolved: false,
            archived: false
          })
          .eq('id', existing.id);
      } else {
        const guestName = (parameters && parameters.length > 0) ? parameters[0] : 'Huésped';
        await supabase
          .from('conversations')
          .insert({
            id: `wa_${Date.now()}`,
            guest_name: guestName,
            guest_phone: cleanedPhone,
            timestamp: new Date().toISOString(),
            booking_created: false,
            resolved: false,
            archived: false,
            human_mode: true,
            messages: [newMsg],
          });
      }
    } catch (convErr) {
      console.error("[WhatsApp] Error al registrar plantilla en conversations:", convErr);
    }

    // Actualizar o registrar el envío de plantilla en whatsapp_logs con status 'sent'
    if (lockLogId) {
      try {
        await supabase
          .from('whatsapp_logs')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', lockLogId);
        console.log(`[WhatsApp Logs] ✅ Confirmado envío de plantilla ${templateName} para reserva ${bookingId || ''} al teléfono ${cleanedPhone}`);
      } catch (logErr) {
        console.error("[WhatsApp Logs] Error al actualizar status en whatsapp_logs:", logErr);
      }
    } else {
      try {
        await supabase.from('whatsapp_logs').insert([{
          reservation_id: bookingId ? String(bookingId) : null,
          template_name: templateName,
          phone: cleanedPhone,
          sent_at: new Date().toISOString(),
          status: 'sent'
        }]);
        console.log(`[WhatsApp Logs] ✅ Registrado envío de plantilla ${templateName} al teléfono ${cleanedPhone}`);
      } catch (logErr) {
        console.error("[WhatsApp Logs] Error al registrar en whatsapp_logs:", logErr);
      }
    }

    return { success: true, data: resBody };
  } catch (err: any) {
    if (lockLogId) {
      try { await supabase.from('whatsapp_logs').delete().eq('id', lockLogId); } catch (_) {}
    }
    console.error(`Exception sending WhatsApp template ${templateName}:`, err);
    return { success: false, error: err.message || 'Error de red' };
  }
}

// Envía un mensaje de texto libre por WhatsApp (soporta YCloud y Meta)
export async function sendWhatsAppTextMessage(
  phone: string,
  body: string
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    const cleanedPhone = normalizePhone(phone);
    if (!cleanedPhone) {
      return { success: false, error: 'Formato de teléfono no válido' };
    }

    const standardPhone = cleanPhoneForMeta(cleanedPhone);
    const toPhone = standardPhone.startsWith('+') ? standardPhone : `+${standardPhone}`;
    const isMetaConfigured = Boolean(getWhatsAppToken() && getWhatsAppPhoneId());
    const provider = isMetaConfigured ? 'meta' : (process.env.WHATSAPP_PROVIDER || 'meta');

    // 1. Intentar con YCloud si es el proveedor seleccionado
    if (provider === 'ycloud') {
      const ycloudApiKey = process.env.YCLOUD_API_KEY;
      const ycloudFrom = process.env.YCLOUD_FROM_PHONE || '+529581168698';

      if (ycloudApiKey) {
        try {
          const ycloudUrl = 'https://api.ycloud.com/v2/whatsapp/messages';
          const payload = {
            from: ycloudFrom,
            to: toPhone,
            type: 'text',
            text: {
              body: body
            }
          };

          const response = await fetch(ycloudUrl, {
            method: 'POST',
            headers: {
              'X-API-Key': ycloudApiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const status = response.status;
          const resBody = await response.json();

          if (response.ok) {
            console.log(`[WhatsApp Text] ✅ Mensaje entregado vía YCloud a ${toPhone}`);
            return { success: true, data: resBody };
          }

          console.warn(`[YCloud Text] Error enviando a ${toPhone} (${status}). Activando fallback a Meta:`, resBody);
        } catch (ycloudErr) {
          console.error(`[YCloud Text] Excepción conectando con YCloud para ${toPhone}:`, ycloudErr);
        }
      }
    }

    // 2. Fallback automático a Meta Cloud API (o si provider === 'meta')
    const token = getWhatsAppToken();
    const phoneId = getWhatsAppPhoneId();

    if (token && phoneId) {
      try {
        const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: standardPhone,
          type: 'text',
          text: {
            body: body
          }
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const status = response.status;
        const resBody = await response.json();

        if (status === 200) {
          console.log(`[WhatsApp Text] ✅ Mensaje entregado vía Meta Cloud API a ${standardPhone}`);
          return { success: true, data: resBody };
        }

        console.error(`Meta API error text message to ${standardPhone}:`, resBody);
        return { success: false, error: resBody.error?.message || 'Error de la API de Meta' };
      } catch (metaErr: any) {
        console.error(`Excepción enviando texto por Meta a ${standardPhone}:`, metaErr);
        return { success: false, error: metaErr.message || 'Error de conexión con Meta' };
      }
    }

    return { success: false, error: 'No se pudo enviar el mensaje por YCloud ni por Meta (verificar credenciales)' };
  } catch (err: any) {
    console.error(`Exception sending WhatsApp text message to ${phone}:`, err);
    return { success: false, error: err.message || 'Error de red' };
  }
}

/**
 * Envía un mensaje interactivo con Botón CTA URL (disparador del In-App Browser nativo).
 * A diferencia de los links de texto plano que iOS envía a Safari externo, los botones
 * interactivos CTA de Meta abren directamente el WebView / In-App Browser dentro de WhatsApp.
 */
export async function sendWhatsAppCTAButtonMessage(
  phone: string,
  bodyText: string,
  buttonText: string,
  url: string,
  headerText?: string,
  footerText?: string
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    const cleanedPhone = normalizePhone(phone);
    if (!cleanedPhone) return { success: false, error: 'Formato de teléfono no válido' };

    const standardPhone = cleanPhoneForMeta(cleanedPhone);
    const token = getWhatsAppToken();
    const phoneId = getWhatsAppPhoneId();

    if (token && phoneId) {
      const endpoint = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
      const actionParams: any = {
        name: 'cta_url',
        parameters: {
          display_text: buttonText.slice(0, 20), // Máximo 20 caracteres según la spec de Meta
          url: url
        }
      };

      const interactivePayload: any = {
        type: 'cta_url',
        body: { text: bodyText },
        action: actionParams
      };

      if (headerText) {
        interactivePayload.header = { type: 'text', text: headerText.slice(0, 60) };
      }
      if (footerText) {
        interactivePayload.footer = { text: footerText.slice(0, 60) };
      }

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: standardPhone,
        type: 'interactive',
        interactive: interactivePayload
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const resBody = await response.json();
      if (response.ok) {
        console.log(`[WhatsApp CTA] ✅ Botón CTA In-App Browser enviado a ${standardPhone}:`, buttonText);
        return { success: true, data: resBody };
      }

      console.warn(`[WhatsApp CTA] Falló mensaje interactivo (${response.status}), aplicando fallback a texto:`, resBody);
    }

    // Fallback si no hay token de Meta o si falló la interacción
    const fallbackFormatted = bodyText.includes(url)
      ? bodyText
      : `${bodyText}\n\n*BOTÓN*\n👉 *${buttonText}*:\n${url}`;
    return sendWhatsAppTextMessage(phone, fallbackFormatted);
  } catch (err: any) {
    console.error(`Error en sendWhatsAppCTAButtonMessage para ${phone}:`, err);
    const fallbackFormatted = bodyText.includes(url)
      ? bodyText
      : `${bodyText}\n\n*BOTÓN*\n👉 *${buttonText}*:\n${url}`;
    return sendWhatsAppTextMessage(phone, fallbackFormatted);
  }
}


// Helper para extraer el primer nombre de forma ultra-robusta
export function getFirstName(fullNameOrBooking: any): string {
  if (!fullNameOrBooking) return 'Huésped';
  if (typeof fullNameOrBooking === 'object') {
    const raw = `${fullNameOrBooking.firstName || ''} ${fullNameOrBooking.lastName || ''}`.trim() ||
      fullNameOrBooking.guest_name || 
      fullNameOrBooking.guestName || 
      fullNameOrBooking.name || 
      '';
    if (!raw || raw.toLowerCase() === 'huésped' || raw.toLowerCase() === 'huesped') {
      if (fullNameOrBooking.firstName) return fullNameOrBooking.firstName.trim().split(' ')[0];
      return 'Huésped';
    }
    const first = raw.trim().split(' ')[0];
    return first || 'Huésped';
  }
  const clean = String(fullNameOrBooking).trim();
  if (!clean || clean.toLowerCase() === 'null' || clean.toLowerCase() === 'undefined') return 'Huésped';
  const first = clean.split(' ')[0];
  return first || 'Huésped';
}

// Retorna el enlace de la página pública de detalles de la reserva
function getPublicReservaLink(bookingId: string | number): string {
  return `${getSiteUrl()}/public/reserva/${bookingId}`;
}

// 1. Mensaje 1 - Solicitud de reservación recibida (solicitud_recibida)
export async function sendTemplate1_SolicitudRecibida(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const name = getFirstName(booking.guest_name || booking);
  const lang = booking.lang || booking.language || undefined;

  const params = [
    name // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'solicitud_recibida', params, undefined, booking.id, 'url', bypassPause, lang);
}

// 2. Mensaje 2 - Último aviso para conservar la reservación (ultimo_aviso)
export async function sendTemplate2_UltimoAviso(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const name = getFirstName(booking.guest_name || booking);
  const lang = booking.lang || booking.language || undefined;

  const params = [
    name // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'ultimo_aviso', params, undefined, booking.id, 'url', bypassPause, lang);
}

// Mensaje de Comprobante Rechazado con motivo personalizado de Roland y botones interactivos (Portal + Contacto)
export async function sendTemplate_ComprobanteRechazado(booking: any, reason?: string, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const rejectionReason = reason || booking.notes || 'El comprobante no pudo ser verificado. Por favor sube una imagen legible o contáctanos.';
  const name = getFirstName(booking.guest_name || booking);
  const lang = booking.lang || booking.language || undefined;

  const params = [
    name,                             // {{1}} Nombre
    String(booking.id),               // {{2}} ID Reserva
    rejectionReason                   // {{3}} Motivo del rechazo
  ];

  // Intenta enviar con plantilla específica 'rechazo_solicitud'
  return sendWhatsAppTemplate(phone, 'rechazo_solicitud', params, undefined, booking.id, 'url', bypassPause, lang);
}

// 3. Mensaje 3 - Reservación confirmada (reservacion_confirmada)
export async function sendTemplate3_ReservacionConfirmada(booking: any, bypassPause: boolean = false, forceResend: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const name = getFirstName(booking.guest_name || booking);
  const lang = booking.lang || booking.language || undefined;

  const params = [
    name // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'reservacion_confirmada', params, undefined, booking.id, 'url', bypassPause, lang, forceResend);
}

// 4. Mensaje 4 - Disponibilidad liberada (disponibilidad_liberada)
export async function sendTemplate4_DisponibilidadLiberada(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const rawGuestName = (booking.guest_name && booking.guest_name !== 'Huésped' && booking.guest_name !== 'Huesped')
    ? booking.guest_name
    : (`${booking.firstName || ''} ${booking.lastName || ''}`.trim() || booking.guestName || booking.name || 'Huésped');
  const name = getFirstName(rawGuestName);
  const lang = booking.lang || booking.language || undefined;

  const params = [
    name // {{1}} Nombre en el cuerpo del mensaje
  ];

  return sendWhatsAppTemplate(phone, 'disponibilidad_liberada', params, undefined, booking.id, undefined, bypassPause, lang);
}

// 5. Mensaje 5 - Preparación para tu llegada (preparacion_llegada)
export async function sendTemplate5_PreparacionLlegada(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];
  const lang = booking.lang || booking.language || undefined;

  return sendWhatsAppTemplate(phone, 'preparacion_llegada', params, undefined, booking.id, 'url', bypassPause, lang);
}

// 6. Mensaje 6 - Bienvenida después del check-in (bienvenida_checkin)
export async function sendTemplate6_BienvenidaCheckin(booking: any, bypassPause: boolean = false) {
  let phone = booking.phone || booking.mobile || booking.guest_phone || booking.guestPhone;
  let guestName = booking.guest_name || booking.name || booking.guestName;

  if (!phone && booking.id) {
    try {
      const { supabase } = require('@/lib/supabase');
      const bIdStr = String(booking.id).trim();
      const { data: dbRes } = await supabase
        .from('beds24_reservations')
        .select('guest_phone, phone, guest_name')
        .eq('id', bIdStr)
        .maybeSingle();

      if (dbRes?.guest_phone || dbRes?.phone) {
        phone = dbRes.guest_phone || dbRes.phone;
        if (!guestName && dbRes.guest_name) guestName = dbRes.guest_name;
      } else {
        const { data: locRes } = await supabase
          .from('local_reservas')
          .select('phone, guest_name')
          .eq('id', bIdStr)
          .maybeSingle();
        if (locRes?.phone) {
          phone = locRes.phone;
          if (!guestName && locRes.guest_name) guestName = locRes.guest_name;
        }
      }
    } catch (ePhone) {
      console.warn("[sendTemplate6_BienvenidaCheckin] Error fetching fallback phone:", ePhone);
    }
  }

  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(guestName || 'Huésped') // {{1}} Nombre
  ];
  const lang = booking.lang || booking.language || undefined;

  return sendWhatsAppTemplate(phone, 'bienvenida_checkin', params, undefined, booking.id, 'url', bypassPause, lang);
}

// 7. Mensaje 7 - Seguimiento de satisfacción (seguimiento_satisfaccion)
export async function sendTemplate7_SeguimientoSatisfaccion(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];
  const lang = booking.lang || booking.language || undefined;

  return sendWhatsAppTemplate(phone, 'seguimiento_satisfaccion', params, undefined, booking.id, 'url', bypassPause, lang);
}

// 8. Mensaje 8 - Día de salida (salida_checkout)
export async function sendTemplate8_SalidaCheckout(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];
  const lang = booking.lang || booking.language || undefined;

  return sendWhatsAppTemplate(phone, 'salida_checkout', params, undefined, booking.id, undefined, bypassPause, lang);
}

// 9. Mensaje 9 - Comparte tu experiencia (comparte_experiencia)
export async function sendTemplate9_ComparteExperiencia(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];
  const lang = booking.lang || booking.language || undefined;

  return sendWhatsAppTemplate(phone, 'comparte_experiencia', params, undefined, booking.id, undefined, bypassPause, lang);
}

// 10. Mensaje 10 - ¡Nos encantaría recibirte nuevamente! (recibimiento_nuevamente)
export async function sendTemplate10_RecibimientoNuevamente(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];
  const lang = booking.lang || booking.language || undefined;

  return sendWhatsAppTemplate(phone, 'recibimiento_nuevamente', params, undefined, booking.id, undefined, bypassPause, lang);
}

// 11. Mensaje 11 - Confirmación de anticipo recibido (pago_anticipo_recibido)
export async function sendTemplate11_PagoAnticipoRecibido(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const total = Number(booking.price || booking.price_estimate || 0);
  const dep = Number(booking.deposit || 0);
  const bal = Math.max(0, total - dep);
  const lastPayment = Number(booking.last_payment_amount || dep || 0);

  const isUSD = booking.guest_name?.toUpperCase().includes('(US DOLLARS)');
  const suffix = isUSD ? ' USD' : ' MXN';

  const params = [
    getFirstName(booking.guest_name),      // {{1}} Nombre
    formatCurrency(lastPayment) + suffix,  // {{2}} MontoAbonado
    formatCurrency(bal) + suffix           // {{3}} SaldoPendiente
  ];
  const lang = booking.lang || booking.language || undefined;

  return sendWhatsAppTemplate(phone, 'pago_anticipo_recibido', params, undefined, booking.id, 'url', bypassPause, lang);
}

// 12. Portal del Huésped - Enlace como botón CTA URL (portal_huesped_link)
// Se envía cuando el huésped pulsa el quick_reply "Ver mi reservación"
// El template debe tener:
//   BODY: "Hola {{1}}, aquí tienes acceso a tu reservación en tiempo real.
//           Desde tu portal puedes ver el estado de tu habitación,
//           reglamento, datos de WiFi y registrar pagos adicionales.✅"
//   BUTTON (URL CTA): texto "Ver Mi Reservación" → URL: https://jaroje-app.vercel.app/public/reserva/{{1}}
// NOTA: en el template URL de Meta, el {{1}} en la URL es el sufijo tras la URL base.
// La URL base en Meta debe ser: https://jaroje-app.vercel.app/public/reserva/
// Y el parámetro del botón será: "<bookingId>?lang=es" o "<bookingId>?lang=en"
export async function sendTemplate_PortalHuespedLink(
  phone: string,
  bookingId: string | number,
  guestName: string,
  lang: 'es' | 'en' = 'es'
): Promise<{ success: boolean; error?: string; data?: any }> {
  if (!phone) return { success: false, error: 'Sin teléfono' };

  // En Meta WABA 3456203501226234, la plantilla aprobada es 'portal_huesped_link' (lang: 'es')
  const templateName = 'portal_huesped_link';
  const firstName = (guestName || '').trim() ? (guestName || '').trim().split(' ')[0] : 'Huésped';

  // Parámetro body: {{1}} = nombre del huésped
  const bodyParams = [firstName];

  // Parámetro botón URL: sufijo que se añade a la URL base en Meta
  const cleanBookingId = (bookingId && String(bookingId) !== '0') ? String(bookingId) : '';
  const buttonParams = [`${cleanBookingId}?lang=${lang}`];

  return sendWhatsAppTemplate(phone, templateName, bodyParams, buttonParams, bookingId, 'url', false, 'es');
}

// Mensaje de Alojamiento Listo / Limpieza Terminada (alojamiento_listo)
export async function sendTemplate_AlojamientoListo(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];
  const lang = booking.lang || booking.language || undefined;

  return sendWhatsAppTemplate(phone, 'alojamiento_listo', params, undefined, booking.id, 'url', bypassPause, lang);
}

/**
 * 13. Plantilla de Bienvenida al Conmutador (bienvenido_cliente_llamada_v2)
 * Se envía automáticamente cuando un cliente llama a las líneas telefónicas/conmutador del hotel.
 * Utiliza la plantilla oficial con foto de fachada y 3 botones (Fotos, Cotización, Reserva YA).
 */
export async function sendTemplate_BienvenidoConmutador(
  phone: string,
  guestName?: string,
  langOverride?: string
): Promise<{ success: boolean; error?: string; data?: any }> {
  if (!phone) return { success: false, error: 'Sin teléfono' };
  const cleanPhone = cleanPhoneForMeta(phone);
  // En Meta WABA, bienvenido_cliente_llamada_v4 está aprobada bajo código de idioma 'en'
  return sendWhatsAppTemplate(phone, 'bienvenido_cliente_llamada_v4', [], [cleanPhone], undefined, 'url', false, 'en');
}

/**
 * 13.9. Invitación Interactiva al Portal de Reservas (In-App Browser nativo)
 * Réplica exacta de la arquitectura de Clinicnova (sendPatientPortalInvitation):
 * Envía un mensaje interactivo con botón 'cta_url' que activa de forma nativa
 * el WebView / In-App Browser dentro de WhatsApp en iOS y Android.
 * Si la ventana de 24 horas está cerrada o Meta no permite la interacción directa,
 * aplica fallback automático a la plantilla oficial aprobada 'bienvenido_cliente_whatsaap_v4'.
 */
export async function sendJarojeBookingPortalInvitation(
  phone: string,
  langOverride?: string
): Promise<{ success: boolean; error?: string; data?: any }> {
  if (!phone) return { success: false, error: 'Sin teléfono' };
  const cleanPhone = cleanPhoneForMeta(phone);
  const isEnglish = langOverride === 'en' || !isSpanishOrLatamPhone(phone);
  const portalUrl = `${getSiteUrl()}/public/reservar?phone=${cleanPhone}`;

  const header = 'Condominios Jaroje';
  const footer = isEnglish ? 'Official Booking Portal 24/7' : 'Portal Oficial de Reservas 24/7';
  const buttonText = isEnglish ? 'Check Availability' : 'Ver Disponibilidad';
  const bodyText = isEnglish
    ? '👋 Welcome to Condominios Jaroje 🌴\n\nCheck live availability, suite photos, and book with exclusive direct rates:\n\n• 🛏️ *Select your dates & suites*\n• 📸 *Real photos & amenities in live HD*\n• 🔒 *24-Hour Instant Hold Guarantee*\n• ⚡ *No agency fees / best direct rate*'
    : '👋 ¡Hola! Te damos la bienvenida a Condominios Jaroje 🌴\n\nConsulta disponibilidad en tiempo real, fotos de cada suite y reserva con tarifa directa neta:\n\n• 🛏️ *Elige tus fechas y suites*\n• 📸 *Fotos reales y amenidades en vivo*\n• 🔒 *Garantía de bloqueo por 24 horas*\n• ⚡ *Sin comisiones de agencias intermediarias*';

  console.log(`[WhatsApp In-App] 🚀 Enviando invitación interactiva CTA_URL (In-App Browser) a ${cleanPhone}...`);
  const ctaRes = await sendWhatsAppCTAButtonMessage(
    phone,
    bodyText,
    buttonText,
    portalUrl,
    header,
    footer
  );

  if (ctaRes.success) {
    try {
      const summaryText = `🏨 [Portal de Reservas Directas: ${buttonText}] ${portalUrl}`;
      const newMsg = {
        role_manager: summaryText,
        role_guest: null,
        role_bot: null,
        timestamp: new Date().toISOString(),
      };
      const cleaned = normalizePhone(phone);
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .eq('guest_phone', cleaned)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        const newMessages = [...(existing.messages || []), newMsg];
        await supabase
          .from('conversations')
          .update({ messages: newMessages, timestamp: new Date().toISOString() })
          .eq('id', existing.id);
      }
    } catch (logErr) {
      console.warn('[WhatsApp In-App] Error registrando en conversations:', logErr);
    }
    return ctaRes;
  }

  // Fallback si la sesión de 24h está cerrada en Meta: usar la plantilla oficial bienvenido_cliente_whatsaap_v4
  console.warn(`[WhatsApp In-App] Sesión 24h posiblemente cerrada (${ctaRes.error}), aplicando fallback a plantilla oficial...`);
  return sendTemplate_BienvenidoWhatsApp(phone, undefined, isEnglish ? 'en' : 'es');
}

/**
 * 14. Plantilla de Bienvenida a WhatsApp (bienvenido_cliente_whatsaap_v4)
 * Se envía automáticamente cuando un cliente escribe por WhatsApp y no había interactuado en 1 semana.
 * Contiene botón directo con enlace dinámico al portal de reservas (?phone={{1}}).
 */
export async function sendTemplate_BienvenidoWhatsApp(
  phone: string,
  guestName?: string,
  langOverride?: string,
  bookingId?: string | number
): Promise<{ success: boolean; error?: string; data?: any }> {
  if (!phone) return { success: false, error: 'Sin teléfono' };
  // DESACTIVADO TEMPORALMENTE: fallo en el portal de reservas. Poner en false para reactivar.
  const BIENVENIDO_WHATSAPP_DISABLED = true;
  if (BIENVENIDO_WHATSAPP_DISABLED) {
    console.warn(`[WhatsApp] bienvenido_cliente_whatsaap_v4 desactivada: no se envía a ${phone}`);
    return { success: false, error: 'disabled', data: { status: 'disabled' } };
  }
  const cleanPhone = cleanPhoneForMeta(phone);
  const lang = (langOverride || (isSpanishOrLatamPhone(phone) ? 'es' : 'en')) as 'es' | 'en';
  const name = guestName ? getFirstName(guestName) : 'Huésped';

  if (bookingId && String(bookingId) !== '0' && String(bookingId) !== 'general') {
    return sendTemplate3_ReservacionConfirmada({ id: bookingId, guest_name: name, phone }, true);
  }
  return sendWhatsAppTemplate(phone, 'bienvenido_cliente_whatsaap_v4', [], [cleanPhone], undefined, 'url', false, lang);
}

/**
 * 14.1. Plantilla de Confirmación de Reserva / Paso 2 (confirmar_reserva)
 * Se envía al instante cuando el cliente finaliza la selección de fechas y habitaciones en el portal.
 * Invita al cliente a pulsar el botón "Confirmar Reserva" para abrir el portal y solicitar su nombre completo.
 */
export async function sendTemplate_ConfirmarReserva(
  phone: string,
  langOverride?: string
): Promise<{ success: boolean; error?: string; data?: any }> {
  if (!phone) return { success: false, error: 'Sin teléfono' };
  const cleanPhone = cleanPhoneForMeta(phone);
  // La plantilla 'confirmar_reserva' está aprobada en Meta WhatsApp Business exclusivamente en idioma español ('es')
  const lang = (langOverride || 'es') as 'es' | 'en';
  // El botón URL dinámico en Meta es: https://jaroje-app.vercel.app/public/reservar?phone={{1}}
  // Pasamos `${cleanPhone}&step=confirm` para que la web reconozca exclusivamente que es el Paso 2 de confirmación
  return sendWhatsAppTemplate(phone, 'confirmar_reserva', [], [`${cleanPhone}&step=confirm`], undefined, 'url', false, lang);
}

/**
 * 15. Plantilla de WiFi, Claves e Información Importante (wifi_informacion)
 * Se envía cuando el huésped pulsa "Ver WiFi y claves" o solicita información de acceso.
 */
export async function sendTemplate_WiFiInformacion(
  bookingOrPhone: any,
  langOverrideOrBypass?: any
): Promise<{ success: boolean; error?: string; data?: any }> {
  const phone = typeof bookingOrPhone === 'string' 
    ? bookingOrPhone 
    : (bookingOrPhone?.phone || bookingOrPhone?.mobile || bookingOrPhone?.guest_phone);
  if (!phone) return { success: false, error: 'Sin teléfono' };

  let lang = typeof bookingOrPhone === 'object' 
    ? (bookingOrPhone.lang || bookingOrPhone.language) 
    : (typeof langOverrideOrBypass === 'string' ? langOverrideOrBypass : undefined);
  if (!lang) {
    lang = isSpanishOrLatamPhone(phone) ? 'es' : 'en';
  }
  const bookingId = typeof bookingOrPhone === 'object' ? bookingOrPhone.id : undefined;
  const bypassPause = typeof langOverrideOrBypass === 'boolean' ? langOverrideOrBypass : false;

  return sendWhatsAppTemplate(phone, 'wifi_informacion', [], undefined, bookingId, undefined, bypassPause, lang as 'es' | 'en');
}

