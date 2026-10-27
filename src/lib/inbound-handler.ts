import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppTextMessage, sendWhatsAppTemplate, normalizePhone, cleanPhoneForMeta } from '@/lib/whatsapp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const requestCache = new Map<string, number>();
const welcomeSentMemoryCache = new Map<string, number>();

function phonesMatch(phoneA: string, phoneB: string): boolean {
  const normA = normalizePhone(phoneA);
  const normB = normalizePhone(phoneB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  const lastA = normA.slice(-10);
  const lastB = normB.slice(-10);
  return lastA.length === 10 && lastA === lastB;
}

export async function findGuestBooking(phone: string): Promise<{
  id: string;
  guest_name: string;
  status?: string;
  check_in?: string;
  check_out?: string;
  source: 'beds24' | 'local' | 'logs';
} | null> {
  if (!phone) return null;
  const rawSuffix = phone.length >= 10 ? phone.slice(-10) : phone;

  try {
    // 1. Beds24 reservations (columna real: guest_phone)
    const { data: b24List } = await supabase
      .from('beds24_reservations')
      .select('id, guest_name, guest_phone, status, check_in, check_out')
      .ilike('guest_phone', `%${rawSuffix}%`)
      .neq('status', 'cancelled');

    if (b24List && b24List.length > 0) {
      const matched = b24List.filter(b => phonesMatch(b.guest_phone, phone));
      if (matched.length > 0) {
        matched.sort((a, b) => new Date(b.check_in || 0).getTime() - new Date(a.check_in || 0).getTime());
        return {
          id: String(matched[0].id),
          guest_name: matched[0].guest_name || 'Huésped',
          status: matched[0].status,
          check_in: matched[0].check_in,
          check_out: matched[0].check_out,
          source: 'beds24'
        };
      }
    }
  } catch (err) {
    console.error('[Inbound Handler] Error buscando en beds24_reservations:', err);
  }

  try {
    // 2. Local reservations (columna: phone)
    const { data: locList } = await supabase
      .from('local_reservas')
      .select('id, guest_name, phone, status, check_in, check_out')
      .ilike('phone', `%${rawSuffix}%`)
      .neq('status', 'cancelled');

    if (locList && locList.length > 0) {
      const matched = locList.filter(b => phonesMatch(b.phone, phone));
      if (matched.length > 0) {
        matched.sort((a, b) => new Date(b.check_in || 0).getTime() - new Date(a.check_in || 0).getTime());
        return {
          id: String(matched[0].id),
          guest_name: matched[0].guest_name || 'Huésped',
          status: matched[0].status,
          check_in: matched[0].check_in,
          check_out: matched[0].check_out,
          source: 'local'
        };
      }
    }
  } catch (err) {
    console.error('[Inbound Handler] Error buscando en local_reservas:', err);
  }

  try {
    // 3. Fallback a whatsapp_logs con reservation_id numérico válido
    const { data: logs } = await supabase
      .from('whatsapp_logs')
      .select('reservation_id, phone, sent_at')
      .or(`phone.eq.${phone},phone.ilike.%${rawSuffix}%`)
      .order('sent_at', { ascending: false })
      .limit(10);

    if (logs && logs.length > 0) {
      for (const l of logs) {
        const rId = String(l.reservation_id || '');
        if (rId && rId !== 'system_manual' && rId !== 'general' && rId !== '0') {
          return { id: rId, guest_name: 'Huésped', source: 'logs' };
        }
      }
    }
  } catch (err) {
    console.error('[Inbound Handler] Error buscando en whatsapp_logs:', err);
  }

  return null;
}

export interface InboundMessageParams {
  guest_phone: string;
  guest_name?: string;
  message_from_guest?: string;
  button_payload?: string;
  timestamp?: string;
  bot_response?: string;
  booking_created?: boolean;
  resolved?: boolean;
}

/**
 * Procesa un mensaje entrante de WhatsApp recibido vía YCloud / Meta Webhooks.
 * Responde automáticamente a comandos rápidos como "WiFi y Claves", "Ver mi reserva" o "Administrador".
 */
export async function handleInboundMessage(params: InboundMessageParams) {
  const phone = normalizePhone(params.guest_phone || 'desconocido');
  const timestamp = params.timestamp || new Date().toISOString();
  const guestMsgText = String(params.message_from_guest || '').trim();

  if (phone === 'desconocido' || !phone) {
    return { success: false, error: 'Teléfono no válido' };
  }

  // Deduplicación concurrente en memoria (evita carreras de retries de webhooks)
  if (guestMsgText) {
    const cacheKey = `${phone}_${guestMsgText}`;
    const now = Date.now();
    if (requestCache.has(cacheKey)) {
      const lastTime = requestCache.get(cacheKey)!;
      if (now - lastTime < 6000) {
        console.log(`[Inbound Handler] Ignorando duplicado concurrente: ${cacheKey} (${now - lastTime}ms)`);
        return { success: true, message: 'Duplicate message ignored.' };
      }
    }
    requestCache.set(cacheKey, now);

    if (requestCache.size > 50) {
      const oldestKeys = Array.from(requestCache.keys()).slice(0, 10);
      oldestKeys.forEach(k => requestCache.delete(k));
    }
  }

  // 1. Buscar la última conversación de este teléfono
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('guest_phone', phone)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Deduplicación basada en historial reciente
  if (existing && Array.isArray(existing.messages) && existing.messages.length > 0) {
    const lastMsg = existing.messages[existing.messages.length - 1];
    const lastGuestMsg = String(lastMsg.role_guest || '').trim();
    if (guestMsgText && lastGuestMsg === guestMsgText && lastMsg.timestamp) {
      const lastTime = new Date(lastMsg.timestamp).getTime();
      const currentTime = new Date(timestamp).getTime();
      const diffSeconds = Math.abs(currentTime - lastTime) / 1000;
      if (diffSeconds < 6) {
        console.log(`[Inbound Handler] Ignorando duplicado de base de datos para ${phone} (diff: ${diffSeconds}s)`);
        return { success: true, message: 'Duplicate database message ignored.' };
      }
    }
  }

  const rawPayload = String(params.button_payload || '').toLowerCase();
  const guestMsgClean = guestMsgText.toLowerCase();

  // Detección de intenciones explícitas de cotización, disponibilidad y reserva
  const isExplicitBookingIntent = 
    guestMsgClean.includes('disponibili') || 
    guestMsgClean.includes('cotización') || 
    guestMsgClean.includes('cotizacion') || 
    guestMsgClean.includes('cotizar') || 
    guestMsgClean.includes('cotiz') || 
    guestMsgClean.includes('tarifa') || 
    guestMsgClean.includes('tarifas') || 
    guestMsgClean.includes('precio') || 
    guestMsgClean.includes('precios') || 
    guestMsgClean.includes('costo') || 
    guestMsgClean.includes('costos') || 
    guestMsgClean.includes('presupuesto') || 
    guestMsgClean.includes('habitacion') || 
    guestMsgClean.includes('habitación') || 
    guestMsgClean.includes('habitaciones') || 
    guestMsgClean.includes('cuartos') || 
    guestMsgClean.includes('cuarto') || 
    guestMsgClean.includes('hospedaje') || 
    guestMsgClean.includes('alojamiento') || 
    guestMsgClean.includes('reserva ya') || 
    guestMsgClean.includes('¡reserva ya!') || 
    guestMsgClean.includes('reservar') || 
    (guestMsgClean.includes('reserva') && !guestMsgClean.includes('mi reserva') && !guestMsgClean.includes('mi reservacion') && !guestMsgClean.includes('mi reservación')) || 
    guestMsgClean.includes('quote & availability') || 
    guestMsgClean.includes('book now') || 
    guestMsgClean.includes('booking') || 
    rawPayload.includes('cotizar') || 
    rawPayload.includes('disponibilidad') || 
    rawPayload.includes('book_now');

  // Comprobar si es número de fundadores / socios para pruebas
  const cleanDigits = phone.replace(/\D/g, '');
  const isFounderOrTester = 
    cleanDigits.endsWith('639367930') || 
    cleanDigits.endsWith('608290664') ||
    cleanDigits.endsWith('636961103');

  // Detección de saludos iniciales de prospectos
  const isGreeting = 
    guestMsgClean === 'hola' ||
    guestMsgClean.startsWith('hola ') ||
    guestMsgClean.startsWith('hola,') ||
    guestMsgClean.startsWith('hola!') ||
    guestMsgClean.startsWith('hola.') ||
    guestMsgClean.startsWith('hola qué tal') ||
    guestMsgClean.startsWith('hola que tal') ||
    guestMsgClean === 'buenas' ||
    guestMsgClean.startsWith('buenas ') ||
    guestMsgClean.startsWith('buen dia') ||
    guestMsgClean.startsWith('buen día') ||
    guestMsgClean.startsWith('buenos dias') ||
    guestMsgClean.startsWith('buenos días') ||
    guestMsgClean.startsWith('buenas tardes') ||
    guestMsgClean.startsWith('buenas noches') ||
    guestMsgClean === 'info' ||
    guestMsgClean.startsWith('info ') ||
    guestMsgClean === 'informacion' ||
    guestMsgClean === 'información' ||
    guestMsgClean === 'hi' ||
    guestMsgClean === 'hello';

  // ── EXCLUSIÓN DE CONTACTOS PERSONALES DE ROLANDO Y STAFF ──
  // Si el remitente es un contacto personal de Rolando (ej. Francisco San Martin) o empleado,
  // NO enviar jamás plantilla de bienvenida ni respuestas automáticas del bot para no interferir en sus conversaciones personales.
  // EXCEPCIÓN: Si solicita explícitamente cotizar/reservar o es un número de prueba de socios, permitir el flujo comercial.
  const { isExcludedPersonalContact } = await import('@/lib/personal-contacts');
  const personalCheck = await isExcludedPersonalContact(phone);
  if (personalCheck.isExcluded && !isExplicitBookingIntent && !isFounderOrTester) {
    console.log(`[Inbound Handler] 🛑 Mensaje de contacto personal/staff (${phone} - ${personalCheck.contact?.name}): "${guestMsgText}". Omitiendo bot y plantilla de bienvenida.`);
    
    // Guardar el mensaje en el historial para visibilidad en el Inbox sin activar bot
    if (guestMsgText || params.button_payload) {
      try {
        const newMsgItem = {
          role_guest: guestMsgText || `[${params.button_payload}]`,
          role_manager: null,
          role_bot: null,
          timestamp: timestamp || new Date().toISOString()
        };

        if (existing) {
          const currentMsgs = Array.isArray(existing.messages) ? existing.messages : [];
          await supabase
            .from('conversations')
            .update({
              guest_name: personalCheck.contact?.name || existing.guest_name || params.guest_name || 'Contacto Personal',
              messages: [...currentMsgs, newMsgItem],
              timestamp: timestamp || new Date().toISOString(),
              human_mode: true
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('conversations')
            .insert([{
              id: `wa_${Date.now()}`,
              guest_phone: phone,
              guest_name: personalCheck.contact?.name || params.guest_name || 'Contacto Personal',
              messages: [newMsgItem],
              timestamp: timestamp || new Date().toISOString(),
              human_mode: true,
              booking_created: false,
              resolved: false
            }]);
        }
      } catch (saveErr) {
        console.warn("[Inbound Handler] Error guardando mensaje de contacto personal:", saveErr);
      }
    }

    return {
      success: true,
      isPersonalContact: true,
      message: 'Personal contact message recorded in human mode. Bot response skipped.'
    };
  }

  let forceHuman = existing ? existing.human_mode : false;
  let finalBotResponse = params.bot_response || null;
  let isAutoReplyTriggered = false;

  // ── BUSCAR SI EL CLIENTE YA TIENE RESERVACIÓN EN EL HOTEL ──
  const guestBooking = await findGuestBooking(phone);
  if (guestBooking) {
    console.log(`[Inbound Handler] 🏨 Huésped identificado con reserva #${guestBooking.id} (${guestBooking.guest_name})`);
  }

  // ── AUTO-VINCULACIÓN INTELIGENTE DE RESERVAS SIN TELÉFONO (Booking.com / Expedia) ──
  try {
    const { data: unlinkedBookings } = await supabase
      .from('beds24_reservations')
      .select('id, guest_name, check_in, check_out, guest_phone, status')
      .or('guest_phone.is.null,guest_phone.eq.')
      .neq('status', 'cancelled')
      .gte('check_out', new Date().toISOString().split('T')[0])
      .order('check_in', { ascending: true })
      .limit(20);

    if (unlinkedBookings && unlinkedBookings.length > 0) {
      let matchedBooking: any = null;

      // Match A: Por ID de reserva presente en el texto del mensaje (ej: "94232573")
      for (const ub of unlinkedBookings) {
        const bIdStr = String(ub.id);
        if (guestMsgText.includes(bIdStr) || rawPayload.includes(bIdStr)) {
          matchedBooking = ub;
          break;
        }
      }

      // Match B: Por coincidencia de nombre completo si el senderName o el mensaje contiene el nombre del huésped
      if (!matchedBooking) {
        const candidateName = String(params.guest_name || '').toLowerCase().trim();
        for (const ub of unlinkedBookings) {
          const bName = String(ub.guest_name || '').toLowerCase().trim();
          if (bName && bName.length > 3 && (candidateName.includes(bName) || guestMsgClean.includes(bName))) {
            matchedBooking = ub;
            break;
          }
        }
      }

      if (matchedBooking) {
        console.log(`[Inbound Handler] 🔗 Vinculando teléfono ${phone} con la reserva ${matchedBooking.id} (${matchedBooking.guest_name})`);
        await supabase
          .from('beds24_reservations')
          .update({ guest_phone: phone })
          .eq('id', matchedBooking.id);

        const { updateBeds24BookingPhone } = await import('@/lib/beds24');
        updateBeds24BookingPhone(matchedBooking.id, phone).catch(console.error);

        await supabase.from('employee_logs').insert([{
          employee_num: 'wa-bot',
          employee_name: 'WhatsApp Auto-Linker',
          department: 'recepcion',
          module: 'recepcion',
          action: 'telefono_vinculado_inbound',
          details: `Teléfono ${phone} vinculado automáticamente a la reserva ${matchedBooking.id} (${matchedBooking.guest_name}) por mensaje entrante de WhatsApp.`,
          created_at: new Date().toISOString()
        }]);
      }
    }
  } catch (linkErr) {
    console.warn("[Inbound Handler] Error en auto-vinculación de reserva:", linkErr);
  }

  // ── DETECCIÓN DE COMPROBANTES DE PAGO / TRANSFERENCIAS / IMÁGENES ──
  const isImageOrReceipt = 
    guestMsgClean.includes('[imagen recibida]') || 
    guestMsgClean.includes('comprobante') || 
    guestMsgClean.includes('transferencia') || 
    guestMsgClean.includes('deposito') || 
    guestMsgClean.includes('depósito') || 
    guestMsgClean.includes('ficha') || 
    guestMsgClean.includes('voucher') ||
    guestMsgClean.includes('pago');

  if (isImageOrReceipt && guestBooking) {
    forceHuman = true;
    const { isSpanishOrLatamPhone, sendTemplate_PortalHuespedLink } = await import('@/lib/whatsapp');
    const isEnglish = !isSpanishOrLatamPhone(phone);
    const lang = isEnglish ? 'en' : 'es';
    console.log(`[Inbound Handler] 📸 Comprobante/imagen recibida de ${guestBooking.guest_name} (Reserva #${guestBooking.id}).`);

    try {
      await supabase.from('employee_logs').insert([{
        employee_num: 'wa-bot',
        employee_name: guestBooking.guest_name,
        department: 'recepcion',
        module: 'recepcion',
        action: 'comprobante_recibido_inbound',
        details: `Comprobante/imagen recibida en WhatsApp para la reservación #${guestBooking.id} (${guestBooking.guest_name}). Se envía plantilla Portal del Huésped.`,
        created_at: new Date().toISOString()
      }]);
    } catch (_) {}

    welcomeSentMemoryCache.set(phone, Date.now());
    const portalRes = await sendTemplate_PortalHuespedLink(phone, guestBooking.id, guestBooking.guest_name, lang);
    if (!portalRes.success) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jaroje-app.vercel.app';
      finalBotResponse = lang === 'en'
        ? `📸 *Payment receipt received!*\n\nThank you, ${guestBooking.guest_name}. Our reception desk is verifying your payment.\n\nYou can track your updated reservation and balance anytime in your Guest Portal:\n👉 ${siteUrl}/public/reserva/${guestBooking.id}?lang=en`
        : `📸 *¡Comprobante de pago recibido!*\n\nMuchas gracias, ${guestBooking.guest_name}. Nuestro equipo de recepción está validando tu depósito.\n\nPuedes consultar tu saldo actualizado y los detalles de tu estancia en tu Portal del Huésped:\n👉 ${siteUrl}/public/reserva/${guestBooking.id}?lang=es`;
      isAutoReplyTriggered = true;
    } else {
      isAutoReplyTriggered = false;
      finalBotResponse = null;
    }

    const newMessage = {
      role_guest: guestMsgText || '[Comprobante]',
      role_bot: finalBotResponse,
      role_manager: null,
      timestamp,
    };
    if (existing) {
      await supabase.from('conversations').update({
        messages: [...(existing.messages || []), newMessage],
        timestamp,
        human_mode: true
      }).eq('id', existing.id);
    }
    return { success: true, isAutoReplyTriggered, finalBotResponse };
  }

  // ── DETECCIÓN DE INTENCIONES AUTOMÁTICAS ────────────────────────────────────

  // A. Contactar con administrador / humano
  if (
    guestMsgClean.includes('administrador') || 
    guestMsgClean.includes('administracion') || 
    guestMsgClean.includes('administración') ||
    guestMsgClean.includes('recepcion') ||
    guestMsgClean.includes('recepción') ||
    guestMsgClean.includes('hablar con alguien')
  ) {
    forceHuman = true;
    finalBotResponse = "Entendido. He pausado el asistente virtual. En un momento, un agente de nuestra recepción continuará la conversación contigo por este medio.";
    isAutoReplyTriggered = true;

    try {
      await supabase.from('employee_logs').insert([{
        employee_num: 'wa-guest',
        employee_name: String(existing?.guest_name || params.guest_name || phone).slice(0, 50),
        department: 'recepcion',
        module: 'recepcion',
        action: 'human_mode_activated',
        details: `Huésped solicitó hablar con el administrador. Asistente IA pausado. Teléfono: ${phone}`,
        created_at: new Date().toISOString()
      }]);
    } catch (logErr) {
      console.error("Error logging human_mode_activated:", logErr);
    }
  } 
  // B. Botón / Consulta de WiFi, Claves y Reglas
  else if (
    guestMsgClean.includes('wifi') || 
    guestMsgClean.includes('wi-fi') || 
    guestMsgClean.includes('clave') || 
    guestMsgClean.includes('claves') || 
    guestMsgClean.includes('porton') || 
    guestMsgClean.includes('portón') || 
    guestMsgClean.includes('contraseña') || 
    guestMsgClean.includes('password') || 
    guestMsgClean.includes('reglas') ||
    rawPayload.includes('wifi') ||
    rawPayload.includes('claves')
  ) {
    const { isSpanishOrLatamPhone, sendTemplate_WiFiInformacion } = await import('@/lib/whatsapp');
    const isEnglish = guestMsgClean.includes('password') || rawPayload.includes('wifi_en') || !isSpanishOrLatamPhone(phone);
    const lang = isEnglish ? 'en' : 'es';
    try {
      const wifiRes = await sendTemplate_WiFiInformacion(phone, lang);
      if (wifiRes.success) {
        finalBotResponse = null;
        isAutoReplyTriggered = false;
      } else {
        finalBotResponse = lang === 'en'
          ? "📶 *WiFi, Access Codes & Important Info - Condominios Jaroje*\n\n• *WiFi Network:* JAROJE\n• *Password:* HUXX2025\n• *Gate Code:* 3456\n• *Pool Hours:* 9:00 AM – 10:00 PM\n\nIf you need anything else, feel free to reply directly here! 😊"
          : "📶 *WiFi, Claves e Información Importante - Condominios Jaroje*\n\n• *Red WiFi:* JAROJE\n• *Contraseña:* HUXX2025\n• *Portón:* 3456\n• *Horario alberca:* 9:00 a 22:00 hrs.\n\n¿Necesitas algo más? Con gusto estamos para servirte. 😊";
        isAutoReplyTriggered = true;
      }
    } catch (wifiErr) {
      finalBotResponse = "📶 *WiFi:* JAROJE | *Password:* HUXX2025 | *Portón:* 3456";
      isAutoReplyTriggered = true;
    }
  }
  // C. Ver mi reserva / Portal del Huésped
  else if (
    guestMsgClean.includes('ver mi reserva') || 
    guestMsgClean.includes('ver mi reservacion') || 
    guestMsgClean.includes('ver mi reservación') || 
    guestMsgClean.includes('mi reserva') || 
    guestMsgClean.includes('mi estancia') || 
    guestMsgClean.includes('portal del huesped') || 
    guestMsgClean.includes('portal del huésped') || 
    guestMsgClean.includes('view my reservation') || 
    guestMsgClean.includes('view_booking_') ||
    rawPayload.includes('view_booking_') ||
    rawPayload.includes('portal')
  ) {
    forceHuman = true;
    isAutoReplyTriggered = true;

    let bookingId = '';
    let guestNameFromSearch = '';

    const payloadMatch = guestMsgClean.match(/view_booking_(\d+)/) || 
                         rawPayload.match(/view_booking_(\d+)/);
    
    if (payloadMatch) {
      bookingId = payloadMatch[1];
    }

    if (!bookingId && guestBooking) {
      bookingId = guestBooking.id;
      guestNameFromSearch = guestBooking.guest_name;
    }

    if (bookingId) {
      const isEnglish = guestMsgClean.includes('view my reservation') || guestMsgClean.includes('view_booking_');
      const lang = isEnglish ? 'en' : 'es';
      try {
        const { sendTemplate_PortalHuespedLink } = await import('@/lib/whatsapp');
        const templateResult = await sendTemplate_PortalHuespedLink(phone, bookingId, guestNameFromSearch, lang);
        if (!templateResult.success) {
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jaroje-app.vercel.app';
          finalBotResponse = `🔑 *Aquí tienes el enlace a tu reservación:*\n\n👉 ${siteUrl}/public/reserva/${bookingId}?lang=${lang}`;
        } else {
          finalBotResponse = null;
        }
      } catch (templateErr) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jaroje-app.vercel.app';
        finalBotResponse = `🔑 *Aquí tienes el enlace a tu reservación:*\n\n👉 ${siteUrl}/public/reserva/${bookingId}?lang=${lang}`;
      }
    } else {
      finalBotResponse = `Hola. No logramos encontrar una reservación activa vinculada a tu número en nuestro sistema.\n\nPor favor, indícanos tu nombre completo o tu código de reservación para que nuestro equipo de recepción te asista de inmediato. 🌴`;
    }
  }
  // ── VERIFICACIÓN DE ENFRIAMIENTO (7 DÍAS) PARA PLANTILLAS DE BIENVENIDA ──
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let lastWelcomeSentAt = 0;

  // A. Revisar en memoria para evitar colisiones rápidas
  const memSentTime = welcomeSentMemoryCache.get(phone);
  if (memSentTime && now - memSentTime < ONE_WEEK_MS) {
    lastWelcomeSentAt = Math.max(lastWelcomeSentAt, memSentTime);
  }

  // B. Revisar en whatsapp_logs si se le envió plantilla de bienvenida o portal en los últimos 7 días
  try {
    const { data: lastWelcomeLog } = await supabase
      .from('whatsapp_logs')
      .select('sent_at, template_name')
      .eq('phone', phone)
      .or('template_name.ilike.%bienvenido%,template_name.eq.portal_huesped_link')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastWelcomeLog?.sent_at) {
      const logTime = new Date(lastWelcomeLog.sent_at).getTime();
      if (!isNaN(logTime) && logTime > lastWelcomeSentAt) {
        lastWelcomeSentAt = logTime;
      }
    }
  } catch (logChkErr) {
    console.warn("[Inbound Handler] Error verificando whatsapp_logs para welcome template:", logChkErr);
  }

  // C. Revisar en historial de conversaciones si hay registro reciente en los últimos 7 días
  if (existing && Array.isArray(existing.messages)) {
    for (let i = existing.messages.length - 1; i >= 0; i--) {
      const msg = existing.messages[i];
      const botText = String(msg.role_bot || msg.role_manager || '');
      if (
        botText.includes('bienvenido_cliente') || 
        botText.includes('portal_huesped') ||
        botText.includes('Portal del Huésped')
      ) {
        const msgTime = new Date(msg.timestamp || 0).getTime();
        if (!isNaN(msgTime) && msgTime > lastWelcomeSentAt) {
          lastWelcomeSentAt = msgTime;
        }
        break;
      }
    }
  }

  const isWelcomeCoolingDown = lastWelcomeSentAt > 0 && (now - lastWelcomeSentAt < ONE_WEEK_MS);

  // D. Intenciones de Cotización, Disponibilidad y Reserva explícitas ("cotizar", "disponibilidad", "reservar", etc.)
  if (isExplicitBookingIntent) {
    // Debounce rápido de 15 segundos para evitar duplicados concurrentes de webhook
    const FIFTEEN_SEC_MS = 15 * 1000;
    const isRapidDuplicate = lastWelcomeSentAt > 0 && (now - lastWelcomeSentAt < FIFTEEN_SEC_MS);
    if (!isRapidDuplicate) {
      const { sendTemplate_BienvenidoWhatsApp } = await import('@/lib/whatsapp');
      try {
        console.log(`[Inbound Handler] 🌟 Intención de cotización/reserva detectada para ${phone}. Despachando plantilla oficial 'bienvenido_cliente_whatsaap_v4'...`);
        const welcomeResult = await sendTemplate_BienvenidoWhatsApp(phone);
        if (welcomeResult.success) {
          welcomeSentMemoryCache.set(phone, Date.now());
          isAutoReplyTriggered = false;
          finalBotResponse = null;
        } else {
          console.error('[Inbound Handler] Error enviando plantilla oficial bienvenido_cliente_whatsaap_v4:', welcomeResult.error);
        }
      } catch (err) {
        console.error('[Inbound Handler] Excepción enviando plantilla oficial:', err);
      }
    }
  }

  // E. Botón / Consulta de Ubicación (Botón "Ubicación" de bienvenido_cliente_whatsaap_v4)
  else if (
    guestMsgClean.includes('ubicacion') || 
    guestMsgClean.includes('ubicación') || 
    guestMsgClean.includes('como llegar') || 
    guestMsgClean.includes('cómo llegar') || 
    guestMsgClean.includes('location') || 
    guestMsgClean.includes('maps') || 
    rawPayload.includes('ubicacion') || 
    rawPayload.includes('ubicación')
  ) {
    const isEnglish = guestMsgClean.includes('location') || guestMsgClean.includes('maps');
    const mapsUrl = 'https://maps.app.goo.gl/ZEYCWntV2rdT48kK8';
    isAutoReplyTriggered = true;
    finalBotResponse = isEnglish
      ? `📍 *Location - Condominios Jaroje*\n\nWe are located in Santa María Huatulco, Oaxaca.\n\n👉 Google Maps directions: ${mapsUrl}`
      : `📍 *Ubicación - Condominios Jaroje*\n\nEstamos ubicados en Santa María Huatulco, Oaxaca.\n\n👉 Cómo llegar en Google Maps: ${mapsUrl}`;
  }

  // ── REGLA DE BIENVENIDA A WHATSAPP (MÁXIMO 1 VEZ CADA 7 DÍAS) ──
  // Aplica ÚNICAMENTE a prospectos nuevos SIN reservación previa que inician conversación con un saludo
  // Huéspedes con reservación NUNCA reciben plantillas automáticas al hablar (se atienden por recepción o comandos específicos)
  const shouldSendWelcome = !guestBooking && isGreeting && !isWelcomeCoolingDown && !isExplicitBookingIntent;

  if (shouldSendWelcome) {
    try {
      welcomeSentMemoryCache.set(phone, now);
      if (welcomeSentMemoryCache.size > 100) {
        const oldest = Array.from(welcomeSentMemoryCache.keys()).slice(0, 20);
        oldest.forEach(k => welcomeSentMemoryCache.delete(k));
      }

      console.log(`[Inbound Handler] 🌟 Prospecto nuevo escribió a WhatsApp (sin contacto en 1 semana). Enviando 'bienvenido_cliente_whatsaap_v4' a ${phone}...`);
      const { sendTemplate_BienvenidoWhatsApp } = await import('@/lib/whatsapp');
      const welcomeResult = await sendTemplate_BienvenidoWhatsApp(phone);
      console.log(`[Inbound Handler] Resultado envío bienvenida WhatsApp:`, welcomeResult);
      if (welcomeResult.success) {
        isAutoReplyTriggered = false;
        finalBotResponse = null;
      }
    } catch (welcomeErr) {
      console.error("[Inbound Handler] Error enviando bienvenida WhatsApp:", welcomeErr);
    }
  }

  // 2. Enviar respuesta automática por WhatsApp si aplica
  if (isAutoReplyTriggered && finalBotResponse) {
    try {
      console.log(`[Inbound Handler] Enviando respuesta automática a ${phone}: "${finalBotResponse.slice(0, 60)}..."`);
      const waSendRes = await sendWhatsAppTextMessage(phone, finalBotResponse);
      if (!waSendRes.success) {
        console.error(`[Inbound Handler] Error enviando mensaje a ${phone}:`, waSendRes.error);
      }
    } catch (sendErr) {
      console.error("[Inbound Handler] Excepción enviando WhatsApp automático:", sendErr);
    }
  }

  // 3. Guardar mensaje en Supabase conversations
  const newMessage = {
    role_guest:   guestMsgText || null,
    role_bot:     finalBotResponse,
    role_manager: null,
    timestamp,
  };

  const newConvId = `wa_${Date.now()}`;

  if (existing) {
    const updatedMessages = [...(existing.messages || []), newMessage];
    await supabase
      .from('conversations')
      .update({
        messages:        updatedMessages,
        timestamp,
        booking_created: params.booking_created ?? existing.booking_created,
        resolved:        params.resolved ?? false,
        archived:        false,
        human_mode:      forceHuman,
      })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('conversations')
      .insert({
        id:              newConvId,
        guest_name:      params.guest_name || phone,
        guest_phone:     phone,
        timestamp,
        booking_created: params.booking_created || false,
        resolved:        params.resolved ?? false,
        human_mode:      forceHuman,
        messages:        [newMessage],
      });
  }

  return { success: true, isAutoReplyTriggered, finalBotResponse };
}
