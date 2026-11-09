import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { isTesterPhone } from '@/lib/test-phones';
import { maskPhone } from '@/lib/log-mask';
import { normalizePhone } from '@/lib/phone';

// Se sigue exportando desde aquí: el resto del código servidor lo importa de whatsapp.ts
export { normalizePhone };

export function getWhatsAppToken(): string {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  if (!token) {
    console.warn('[WhatsApp] ⚠️ WHATSAPP_TOKEN no está configurado en las variables de entorno.');
    return '';
  }
  return token;
}

export function getWhatsAppPhoneId(): string {
  const phoneId = process.env.WHATSAPP_PHONE_ID?.trim();
  if (!phoneId) {
    console.warn('[WhatsApp] ⚠️ WHATSAPP_PHONE_ID no está configurado en las variables de entorno.');
    return '';
  }
  return phoneId;
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


// Limpia el teléfono específicamente para la llamada de Meta y enlaces wa.me (removiendo el '1' legado de México y asegurando formato E.164 limpio sin símbolos)
export function cleanPhoneForMeta(phone: string): string {
  const sanitized = String(phone || '')
    .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, '')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .trim();
  let cleaned = sanitized.replace(/\D/g, '');
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

export const WHATSAPP_STATUS_RANK: Record<string, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 99,
};

function isGenericGuestName(name?: string | null): boolean {
  if (!name) return true;
  const trimmed = String(name).trim();
  if (!trimmed || trimmed.length <= 2) return true;
  if (/^\d+$/.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  return [
    'huésped',
    'huesped',
    'guest',
    'cliente',
    'cliente cotización',
    'cliente cotizacion',
    'contacto personal',
    'desconocido',
  ].includes(lower);
}

export function pickBestGuestName(candidates: (string | null | undefined)[], fallback: string): string {
  const realNames = candidates
    .map(c => (c ? String(c).trim() : ''))
    .filter(c => c && !isGenericGuestName(c));
  if (realNames.length > 0) {
    return realNames.sort((a, b) => b.length - a.length)[0];
  }
  const nonEmpty = candidates.map(c => (c ? String(c).trim() : '')).find(Boolean);
  return nonEmpty || fallback;
}

function dedupeAndSortMessages(msgLists: any[][]): any[] {
  const byKey = new Map<string, any>();
  for (const list of msgLists) {
    if (!Array.isArray(list)) continue;
    for (const m of list) {
      if (!m || typeof m !== 'object') continue;
      const key = m.wamid
        ? `wamid:${m.wamid}`
        : `${m.timestamp || ''}|${m.role_guest || ''}|${m.role_bot || ''}|${m.role_manager || ''}|${m.template_name || ''}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, m);
      } else {
        const curStatus = String(existing.delivery_status || '').toLowerCase();
        const newStatus = String(m.delivery_status || '').toLowerCase();
        const curRank = WHATSAPP_STATUS_RANK[curStatus] ?? (curStatus ? 1 : -1);
        const newRank = WHATSAPP_STATUS_RANK[newStatus] ?? (newStatus ? 1 : -1);
        const bestStatus = newRank > curRank ? m.delivery_status : (existing.delivery_status ?? m.delivery_status);

        byKey.set(key, {
          ...existing,
          ...m,
          role_guest: existing.role_guest ?? m.role_guest ?? null,
          role_bot: existing.role_bot ?? m.role_bot ?? null,
          role_manager: existing.role_manager ?? m.role_manager ?? null,
          template_name: existing.template_name ?? m.template_name,
          meta_template: existing.meta_template ?? m.meta_template,
          reservation_id: existing.reservation_id ?? m.reservation_id,
          sent_at: existing.sent_at ?? m.sent_at,
          delivered_at: existing.delivered_at ?? m.delivered_at,
          read_at: existing.read_at ?? m.read_at,
          failed_at: existing.failed_at ?? m.failed_at,
          error_code: existing.error_code ?? m.error_code,
          error_message: existing.error_message ?? m.error_message,
          delivery_status: bestStatus,
        });
      }
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const tA = Date.parse(a.timestamp || '') || 0;
    const tB = Date.parse(b.timestamp || '') || 0;
    return tA - tB;
  });
}

export async function findConversationsByPhone(rawPhone: string): Promise<{
  canonicalPhone: string;
  primary: any | null;
  duplicates: any[];
}> {
  const canonical = normalizePhone(rawPhone) || String(rawPhone || '').replace(/\D/g, '');
  if (!canonical || canonical === 'desconocido') {
    return { canonicalPhone: canonical, primary: null, duplicates: [] };
  }

  const digits = canonical.replace(/\D/g, '');
  const last10 = digits.length >= 10 ? digits.slice(-10) : '';

  let rows: any[] = [];
  if (last10.length >= 10) {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .ilike('guest_phone', `%${last10}`)
      .order('timestamp', { ascending: false })
      .limit(20);
    rows = data || [];
  } else {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('guest_phone', canonical)
      .order('timestamp', { ascending: false })
      .limit(20);
    rows = data || [];
  }

  const matched = rows.filter(r => {
    const rCanon = normalizePhone(r.guest_phone || '');
    if (rCanon && rCanon === canonical) return true;
    const rDigits = String(r.guest_phone || '').replace(/\D/g, '');
    return last10.length === 10 && rDigits.slice(-10) === last10 && rDigits.length <= 13;
  });

  if (matched.length === 0) {
    return { canonicalPhone: canonical, primary: null, duplicates: [] };
  }

  matched.sort((a, b) => {
    const lenA = Array.isArray(a.messages) ? a.messages.length : 0;
    const lenB = Array.isArray(b.messages) ? b.messages.length : 0;
    if (lenB !== lenA) return lenB - lenA;
    if (Boolean(b.booking_created) !== Boolean(a.booking_created)) {
      return Boolean(b.booking_created) ? 1 : -1;
    }
    return (Date.parse(b.timestamp || '') || 0) - (Date.parse(a.timestamp || '') || 0);
  });

  return {
    canonicalPhone: canonical,
    primary: matched[0],
    duplicates: matched.slice(1),
  };
}

export async function upsertConversationMessage(opts: {
  phone: string;
  guestName?: string | null;
  message?: Record<string, any> | null;
  messagesToAppend?: Record<string, any>[];
  updateFields?: Record<string, any>;
  defaultHumanMode?: boolean;
  preferProvidedName?: boolean;
}): Promise<{ conversationId: string | null }> {
  const nowIso = new Date().toISOString();
  const toAppend = [
    ...(opts.message ? [opts.message] : []),
    ...(opts.messagesToAppend || [])
  ];

  const applyMergeAndSave = async () => {
    const { canonicalPhone, primary, duplicates } = await findConversationsByPhone(opts.phone);
    if (!canonicalPhone) return { conversationId: null };

    if (primary) {
      const mergedMessages = dedupeAndSortMessages([
        primary.messages || [],
        ...duplicates.map(d => d.messages || []),
        toAppend
      ]);
      const allNames = opts.preferProvidedName && opts.guestName && !isGenericGuestName(opts.guestName)
        ? [opts.guestName, primary.guest_name, ...duplicates.map(d => d.guest_name)]
        : [primary.guest_name, ...duplicates.map(d => d.guest_name), opts.guestName];
      const bestName = pickBestGuestName(allNames, canonicalPhone);
      const latestMsgTs = mergedMessages.length > 0
        ? mergedMessages[mergedMessages.length - 1]?.timestamp || nowIso
        : nowIso;
      const bestTimestamp = [primary.timestamp, ...duplicates.map(d => d.timestamp), latestMsgTs]
        .filter(Boolean)
        .sort((a, b) => (Date.parse(b) || 0) - (Date.parse(a) || 0))[0] || nowIso;

      const updatePayload: Record<string, any> = {
        guest_phone: canonicalPhone,
        guest_name: bestName,
        messages: mergedMessages,
        timestamp: opts.updateFields?.timestamp || bestTimestamp,
        booking_created: Boolean(primary.booking_created || duplicates.some(d => d.booking_created) || opts.updateFields?.booking_created),
        ...opts.updateFields,
      };

      const { error: updErr } = await supabase
        .from('conversations')
        .update(updatePayload)
        .eq('id', primary.id);

      if (!updErr && duplicates.length > 0) {
        const dupIds = duplicates.map(d => d.id).filter(Boolean);
        if (dupIds.length > 0) {
          await supabase.from('conversations').delete().in('id', dupIds);
        }
      }
      return { conversationId: primary.id };
    }

    const deterministicId = `wa_${canonicalPhone}`;
    const msgTimestamp = opts.updateFields?.timestamp || toAppend[toAppend.length - 1]?.timestamp || nowIso;
    const insertPayload: Record<string, any> = {
      id: deterministicId,
      guest_name: pickBestGuestName([opts.guestName], canonicalPhone),
      guest_phone: canonicalPhone,
      timestamp: msgTimestamp,
      booking_created: false,
      resolved: false,
      archived: false,
      human_mode: opts.defaultHumanMode ?? true,
      messages: toAppend,
      ...opts.updateFields,
    };

    const { error: insErr } = await supabase.from('conversations').insert(insertPayload);
    if (!insErr) {
      return { conversationId: deterministicId };
    }

    if (insErr.code === '23505' || String(insErr.message || '').toLowerCase().includes('duplicate')) {
      const retry = await findConversationsByPhone(opts.phone);
      if (retry.primary) {
        const mergedMessages = dedupeAndSortMessages([
          retry.primary.messages || [],
          ...retry.duplicates.map(d => d.messages || []),
          toAppend,
        ]);
        const retryNames = opts.preferProvidedName && opts.guestName && !isGenericGuestName(opts.guestName)
          ? [opts.guestName, retry.primary.guest_name, ...retry.duplicates.map(d => d.guest_name)]
          : [retry.primary.guest_name, ...retry.duplicates.map(d => d.guest_name), opts.guestName];
        const retryLatestTs = mergedMessages.length > 0
          ? mergedMessages[mergedMessages.length - 1]?.timestamp || nowIso
          : nowIso;
        const retryBestTs = [retry.primary.timestamp, ...retry.duplicates.map(d => d.timestamp), retryLatestTs]
          .filter(Boolean)
          .sort((a, b) => (Date.parse(b) || 0) - (Date.parse(a) || 0))[0] || nowIso;
        const { error: retryUpdErr } = await supabase
          .from('conversations')
          .update({
            guest_phone: retry.canonicalPhone,
            messages: mergedMessages,
            guest_name: pickBestGuestName(retryNames, canonicalPhone),
            timestamp: opts.updateFields?.timestamp || retryBestTs,
            booking_created: Boolean(retry.primary.booking_created || retry.duplicates.some(d => d.booking_created) || opts.updateFields?.booking_created),
            ...opts.updateFields,
          })
          .eq('id', retry.primary.id);
        if (!retryUpdErr && retry.duplicates.length > 0) {
          const dupIds = retry.duplicates.map(d => d.id).filter(Boolean);
          if (dupIds.length > 0) {
            await supabase.from('conversations').delete().in('id', dupIds);
          }
        }
        return { conversationId: retry.primary.id };
      }
    }
    throw insErr;
  };

  try {
    return await applyMergeAndSave();
  } catch (err) {
    console.error('[WhatsApp Conversations] Error consolidando/guardando conversación:', err);
    return { conversationId: null };
  }
}

export async function updateWhatsAppDeliveryStatus(st: {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: any[];
}): Promise<{ matchedConversation: boolean; matchedLog: boolean }> {
  const wamid = String(st?.id || '').trim();
  const nextStatus = String(st?.status || '').toLowerCase().trim();
  const rawRecipient = String(st?.recipient_id || '').trim();

  if (!nextStatus || !['sent', 'delivered', 'read', 'failed'].includes(nextStatus)) {
    return { matchedConversation: false, matchedLog: false };
  }

  const statusIso = st.timestamp && !isNaN(Number(st.timestamp))
    ? new Date(Number(st.timestamp) * 1000).toISOString()
    : new Date().toISOString();

  const firstError = Array.isArray(st.errors) && st.errors.length > 0 ? st.errors[0] : null;
  const errorCode = firstError?.code || null;
  const errorMessage = firstError
    ? (firstError.error_data?.details || firstError.message || firstError.title || 'Fallo de entrega en Meta')
    : null;

  const nextRank = WHATSAPP_STATUS_RANK[nextStatus] ?? 0;

  let matchedConversation = false;
  let matchedLog = false;
  let matchedReservationId: string | null = null;
  let matchedTemplateName: string | null = null;

  try {
    const applyToConversation = async (): Promise<boolean> => {
      const { primary, duplicates } = rawRecipient
        ? await findConversationsByPhone(rawRecipient)
        : { primary: null, duplicates: [] };

      const allConvs = [primary, ...duplicates].filter(Boolean);
      for (const conv of allConvs) {
        if (!Array.isArray(conv.messages)) continue;
        let modified = false;
        const updatedMessages = conv.messages.map((m: any) => {
          if (!m || !wamid || m.wamid !== wamid) return m;
          modified = true;
          matchedConversation = true;
          if (m.reservation_id) matchedReservationId = String(m.reservation_id);
          if (m.template_name) matchedTemplateName = String(m.template_name);

          const curRank = WHATSAPP_STATUS_RANK[String(m.delivery_status || 'sent').toLowerCase()] ?? 1;
          const shouldAdvanceStatus = nextStatus === 'failed' || nextRank > curRank;

          const patched: Record<string, any> = {
            ...m,
            delivery_status: shouldAdvanceStatus ? nextStatus : (m.delivery_status || nextStatus),
          };
          if (nextStatus === 'sent' && !patched.sent_at) patched.sent_at = statusIso;
          if (nextStatus === 'delivered' && !patched.delivered_at) patched.delivered_at = statusIso;
          if (nextStatus === 'read' && !patched.read_at) patched.read_at = statusIso;
          if (nextStatus === 'failed') {
            patched.failed_at = statusIso;
            if (errorCode) patched.error_code = errorCode;
            if (errorMessage) patched.error_message = errorMessage;
          }
          return patched;
        });

        if (modified) {
          await supabase
            .from('conversations')
            .update({ messages: updatedMessages })
            .eq('id', conv.id);
        }
      }
      return matchedConversation;
    };

    await applyToConversation();

    // Si Meta envió el webhook en <1s mientras sendWhatsAppTemplate terminaba de guardar el wamid, reintentar una vez
    if (!matchedConversation && wamid && rawRecipient) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await applyToConversation();
    }

    // Solo actualizar whatsapp_logs si el wamid coincidió exactamente con una plantilla registrada
    // (evita que un fallo 131047 de texto libre fuera de 24h marque como fallida a una plantilla real)
    if (matchedConversation && matchedReservationId && matchedTemplateName) {
      const { data: targetLogs } = await supabase
        .from('whatsapp_logs')
        .select('id, status')
        .eq('reservation_id', matchedReservationId)
        .eq('template_name', matchedTemplateName)
        .order('sent_at', { ascending: false })
        .limit(1);

      const targetLog = targetLogs?.[0];
      if (targetLog?.id) {
        const curLogRank = WHATSAPP_STATUS_RANK[String(targetLog.status || 'sent').toLowerCase()] ?? 1;
        if (nextStatus === 'failed' || nextRank > curLogRank) {
          await supabase
            .from('whatsapp_logs')
            .update({ status: nextStatus })
            .eq('id', targetLog.id);
        }
        matchedLog = true;
      }
    } else if (matchedConversation && matchedTemplateName && rawRecipient) {
      // Plantillas sin reservation_id específico (ej. system_manual: bienvenido_cliente_whatsaap_v4 / llamada_v4)
      const canonicalPhone = normalizePhone(rawRecipient);
      const last10 = canonicalPhone ? canonicalPhone.replace(/\D/g, '').slice(-10) : '';
      if (last10.length === 10) {
        const { data: recentTplLogs } = await supabase
          .from('whatsapp_logs')
          .select('id, status, phone')
          .eq('template_name', matchedTemplateName)
          .ilike('phone', `%${last10}`)
          .order('sent_at', { ascending: false })
          .limit(3);

        const targetLog = (recentTplLogs || []).find(r => normalizePhone(r.phone) === canonicalPhone);
        if (targetLog?.id) {
          const curLogRank = WHATSAPP_STATUS_RANK[String(targetLog.status || 'sent').toLowerCase()] ?? 1;
          if (nextStatus === 'failed' || nextRank > curLogRank) {
            await supabase
              .from('whatsapp_logs')
              .update({ status: nextStatus })
              .eq('id', targetLog.id);
          }
          matchedLog = true;
        }
      }
    }
  } catch (err) {
    console.warn('[WhatsApp Status Webhook] Error actualizando estado de entrega:', err);
  }

  return { matchedConversation, matchedLog };
}

// Envía una plantilla genérica de WhatsApp llamando a Meta Cloud API
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

    // ── GUARDIA DE EXCLUSIÓN TOTAL: Regla absoluta para números en lista 'excluded_person' ──
    // Regla de Floren: A los números registrados en esta sección (contactos personales / staff / excluded_person),
    // NUNCA les va a llegar NINGUNA plantilla automática bajo ninguna circunstancia.
    // Solo un administrador puede forzar un reenvío manual explícito (forceResend: true).
    if (!forceResend) {
      try {
        const { isExcludedPersonalContact } = await import('@/lib/personal-contacts');
        const excludedCheck = await isExcludedPersonalContact(cleanedPhone);
        // Números de prueba del equipo (variable WHATSAPP_TEST_PHONES): reciben las plantillas como cualquier huésped aunque estén excluidos
        const isTester = excludedCheck.isExcluded && isTesterPhone(cleanedPhone);
        if (isTester) console.log(`[WhatsApp API] 🧪 Número de prueba (WHATSAPP_TEST_PHONES): se envía '${templateName}' aunque esté en 'excluded_person'.`);
        if (excludedCheck.isExcluded && !isTester) {
          const name = excludedCheck.contact?.name || 'Contacto Excluido';
          console.log(`[WhatsApp API] 🛑 Omitiendo plantilla '${templateName}' para ${maskPhone(cleanedPhone)} (${name}): número registrado en lista 'excluded_person' (Regla: Cero plantillas automáticas).`);
          return {
            success: false,
            error: 'excluded_person',
            data: {
              status: 'skipped_excluded_person',
              message: `Envío de plantilla cancelado: el número ${cleanedPhone} pertenece a la lista 'excluded_person' (${name}). Regla activa: Cero plantillas automáticas.`
            }
          };
        }
      } catch (exErr) {
        console.warn("[WhatsApp API] Error verificando regla excluded_person:", exErr);
      }
    }

    // Verificar si los envíos automáticos de WhatsApp están deshabilitados en la base de datos (solo si no es un envío manual)
    if (!bypassPause) {
      const isPaused = await isWhatsAppAutomationsPaused();
      if (isPaused) {
        console.log(`[WhatsApp API] ⏸️ Envíos automáticos PAUSADOS por configuración (disable_automatic_whatsapp: true). Omitiendo plantilla '${templateName}' para ${maskPhone(cleanedPhone)}.`);
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
      console.log(`[WhatsApp Deduplicador Memoria] Omitiendo mensaje duplicado para ${maskPhone(cleanedPhone)} (plantilla: ${templateName})`);
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
          console.log(`[WhatsApp Deduplicador DB] Omitiendo ${templateName} para teléfono ${maskPhone(cleanedPhone)}, ya se envió esta misma plantilla en los últimos 10 minutos.`);
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

    const spanishOnlyTemplates = ['confirmar_reserva', 'portal_huesped_link'];
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

    // Único proveedor: Meta Cloud API.
    let response: Response;
    let status: number;
    let resBody: any;
    let resolvedMetaTemplate = templateName;

    {
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
        'disponibilidad_liberada': 'disponibilidad_liberada_v2',
        'recibimiento_nuevamente': 'recibimiento_nuevamente_v2',
        'bienvenido_cliente_final_v2': 'bienvenido_cliente_llamada_v4',
        'bienvenido_cliente_llamada': 'bienvenido_cliente_llamada_v4',
        'bienvenido_cliente_llamada_v2': 'bienvenido_cliente_llamada_v4',
        'bienvenido_cliente_whatsaap': 'bienvenido_cliente_whatsaap_v4',
        'bienvenido_cliente_whatsaap_v2': 'bienvenido_cliente_whatsaap_v4',
        'bienvenido_cliente_whatsaap_v3': 'bienvenido_cliente_whatsaap_v4',
        'bienvenido_cliente_whatsaap_v4': 'bienvenido_cliente_whatsaap_v4',
        'confirmar_reserva': 'confirmar_reserva',
        'cotizacion_reserva': 'cotizacion_reserva',
        'portal_huesped_link_en': 'portal_huesped_link',
      };
      const actualMetaTemplate = META_TEMPLATE_ALIASES[templateName] || templateName;
      resolvedMetaTemplate = actualMetaTemplate;

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
                link: 'https://acbvhhzjbotgtynafemy.supabase.co/storage/v1/object/public/room-photos/general/2.jpg'
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
        'test_mixed_buttons_no_emoji'
      ]);

      // Plantillas que fueron registradas con código de idioma 'en' exclusivamente
      const ENGLISH_CODE_TEMPLATES = new Set<string>([]);

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
          case 'cotizacion_reserva':
            return `🏨 Cotización Condominios Jaroje\n\n(Sujeta a disponibilidad a la hora de Reservar)\n\n✅ *Tarifa de Miembro Jaroje aplicada*\n\n📅 *Check in:* ${params[0] || ''}\n   *Check out:* ${params[1] || ''} (${params[2] || ''})\n\n👥 *Huéspedes:* ${params[3] || ''}\n\n🛏️ *Alojamientos seleccionados:*\n${params[4] || ''}\n\n👤 *Personas adicionales:* ${params[5] || ''}\n\n💰 *DESGLOSE TOTAL:*\n${params[6] || ''}\n• *Total de la estancia (impuestos incluidos):* ${params[7] || ''}\n• *Anticipo requerido para apartar (50%):* ${params[8] || ''}\n• *Saldo restante al check-in (50%):* ${params[9] || ''}\n\n[Botón: ¡¡¡ RESERVA YA !!!]`;
          case 'presentacion_cliente_jaroje_2':
            return `¡Hola, ${name}! 🌴\n\nTe damos la más cálida bienvenida a Jaroje Condominios. Es un placer tenerte con nosotros y ser parte de tu estancia.\n\nAquí tienes información útil para iniciar tu estancia:\n• Wi-Fi: Red "Jaroje_Guest" (Sin contraseña).\n• Servicios: Piscina, terraza y estacionamiento incluidos.\n\nCualquier duda o solicitud especial, escríbenos directamente aquí. ¡Disfruta tu estancia!`;
          default:
            return `[Plantilla: ${tName}]` + (params.length > 0 ? ` (Parámetros: ${params.join(', ')})` : '');
        }
      };

      const summaryText = getTemplateText(templateName, parameters).replace('[BOOKID]', String(bookingId || ''));
      const wamid: string | null = resBody?.messages?.[0]?.id || null;
      const nowConvIso = new Date().toISOString();

      const newMsg: Record<string, any> = {
        role_manager: summaryText,
        role_guest:   null,
        role_bot:     null,
        timestamp:    nowConvIso,
        template_name: templateName,
        meta_template: resolvedMetaTemplate,
        delivery_status: 'sent',
        ...(wamid ? { wamid } : {}),
        ...(bIdStr ? { reservation_id: bIdStr } : {})
      };

      const guestNameCandidate = (parameters && parameters.length > 0) ? parameters[0] : 'Huésped';
      await upsertConversationMessage({
        phone: cleanedPhone,
        guestName: guestNameCandidate,
        message: newMsg,
        defaultHumanMode: true,
        updateFields: {
          timestamp: nowConvIso,
          resolved: false,
          archived: false
        }
      });
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
        console.log(`[WhatsApp Logs] ✅ Confirmado envío de plantilla ${templateName} para reserva ${bookingId || ''} al teléfono ${maskPhone(cleanedPhone)}`);
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
        console.log(`[WhatsApp Logs] ✅ Registrado envío de plantilla ${templateName} al teléfono ${maskPhone(cleanedPhone)}`);
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

// Envía un mensaje de texto libre por WhatsApp (Meta Cloud API)
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
          console.log(`[WhatsApp Text] ✅ Mensaje entregado vía Meta Cloud API a ${maskPhone(standardPhone)}`);
          return { success: true, data: resBody };
        }

        console.error(`Meta API error text message to ${maskPhone(standardPhone)}:`, resBody);
        return { success: false, error: resBody.error?.message || 'Error de la API de Meta' };
      } catch (metaErr: any) {
        console.error(`Excepción enviando texto por Meta a ${maskPhone(standardPhone)}:`, metaErr);
        return { success: false, error: metaErr.message || 'Error de conexión con Meta' };
      }
    }

    return { success: false, error: 'No se pudo enviar el mensaje por Meta (verificar credenciales)' };
  } catch (err: any) {
    console.error(`Exception sending WhatsApp text message to ${maskPhone(phone)}:`, err);
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
        console.log(`[WhatsApp CTA] ✅ Botón CTA In-App Browser enviado a ${maskPhone(standardPhone)}:`, buttonText);
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
    console.error(`Error en sendWhatsAppCTAButtonMessage para ${maskPhone(phone)}:`, err);
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
  const lang = langOverride || (isSpanishOrLatamPhone(phone) ? 'es' : 'en');
  return sendWhatsAppTemplate(phone, 'bienvenido_cliente_llamada_v4', [], [cleanPhone], undefined, 'url', false, lang);
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
  const cleanPhone = cleanPhoneForMeta(phone);
  const lang = (langOverride || (isSpanishOrLatamPhone(phone) ? 'es' : 'en')) as 'es' | 'en';
  const name = guestName ? getFirstName(guestName) : 'Huésped';

  if (bookingId && String(bookingId) !== '0' && String(bookingId) !== 'general') {
    return sendTemplate3_ReservacionConfirmada({ id: bookingId, guest_name: name, phone }, true);
  }
  return sendWhatsAppTemplate(phone, 'bienvenido_cliente_whatsaap_v4', [], [cleanPhone], undefined, 'url', false, lang);
}

/**
 * 14.2. Plantilla Oficial de Cotización / Paso 1 (cotizacion_reserva)
 * Aprobada en Meta para saltarse la ventana de 24 horas y despacharse con botón interactivo de reserva.
 */
// Bandera de activación: false mientras Meta termina de revisar y aprobar 'cotizacion_reserva'.
// Instrucción de Floren: Mantener el envío interactivo / texto hasta que la plantilla esté oficialmente aprobada.
const USE_META_TEMPLATE_COTIZACION = false;

export async function sendTemplate_Cotizacion(
  phone: string,
  data: {
    checkInFormatted: string;
    checkOutFormatted: string;
    nightsText: string;
    guestsText: string;
    roomsText: string;
    extrasText: string;
    desgloseSubtotalText: string;
    totalAmountText: string;
    depositText: string;
    balanceText: string;
    reserveQuerySuffix: string;
    fallbackFullText: string;
    fallbackReserveUrl: string;
    lang?: 'es' | 'en';
  }
): Promise<{ success: boolean; error?: string; data?: any }> {
  if (!phone) return { success: false, error: 'Sin teléfono' };
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return { success: false, error: 'Teléfono no válido' };

  const targetLang = data.lang || (isSpanishOrLatamPhone(cleanPhone) ? 'es' : 'en');
  const isEn = targetLang === 'en';

  if (USE_META_TEMPLATE_COTIZACION) {
    const parameters = [
      data.checkInFormatted,
      data.checkOutFormatted,
      data.nightsText,
      data.guestsText,
      data.roomsText,
      data.extrasText,
      data.desgloseSubtotalText,
      data.totalAmountText,
      data.depositText,
      data.balanceText
    ];

    const buttonParams = [data.reserveQuerySuffix];

    try {
      console.log(`[WhatsApp API] Despachando plantilla oficial 'cotizacion_reserva' [${targetLang}] a ${maskPhone(cleanPhone)}...`);
      const tplRes = await sendWhatsAppTemplate(
        cleanPhone,
        'cotizacion_reserva',
        parameters,
        buttonParams,
        undefined,
        'url',
        true, // bypassPause: solicitado expresamente por el cliente en el botón "Cotizar sin bloquear"
        targetLang,
        true  // forceResend
      );

      if (tplRes.success) {
        console.log(`[WhatsApp API] ✅ Plantilla 'cotizacion_reserva' [${targetLang}] entregada con éxito a ${maskPhone(cleanPhone)}`);
        return tplRes;
      }

      console.warn(`[WhatsApp API] Plantilla 'cotizacion_reserva' no entregada (${tplRes.error}). Aplicando fallback a botón interactivo...`);
    } catch (err: any) {
      console.warn(`[WhatsApp API] Error intentando plantilla 'cotizacion_reserva':`, err);
    }
  }

  // Envío actual por botón interactivo CTA (o texto) sin folio, adaptado a español o inglés
  console.log(`[WhatsApp Cotización] Enviando por CTA interactivo / texto [${targetLang}] a ${maskPhone(cleanPhone)}...`);
  return sendWhatsAppCTAButtonMessage(
    cleanPhone,
    data.fallbackFullText,
    isEn ? 'Book Now' : '¡¡¡ RESERVA YA !!!',
    data.fallbackReserveUrl,
    isEn ? 'YOUR QUOTE – Condominios Jaroje' : '🏨 COTIZACIÓN Condominios Jaroje',
    isEn ? 'Rates and availability are subject to change' : 'Sujeta a disponibilidad al momento de reservar'
  );
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

