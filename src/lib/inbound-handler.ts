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
  return normA === normB;
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

  let forceHuman = existing ? existing.human_mode : false;
  let finalBotResponse = params.bot_response || null;
  let isAutoReplyTriggered = false;

  const rawPayload = String(params.button_payload || '').toLowerCase();
  const guestMsgClean = guestMsgText.toLowerCase();

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

    if (!bookingId) {
      try {
        const rawSuffix = phone.length > 9 ? phone.substring(phone.length - 9) : phone;
        const { data: lastLog } = await supabase
          .from('whatsapp_logs')
          .select('reservation_id')
          .or(`phone.eq.${phone},phone.eq.${rawSuffix},phone.like.%${rawSuffix}`)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastLog?.reservation_id) {
          bookingId = String(lastLog.reservation_id);
        }
      } catch (logErr) {
        console.error("[Inbound Handler] Error buscando en whatsapp_logs:", logErr);
      }

      if (!bookingId) {
        try {
          const [b24Res, localRes] = await Promise.all([
            supabase.from('beds24_reservations').select('id, guest_phone, phone, status, check_in, check_out, guest_name'),
            supabase.from('local_reservas').select('id, phone, status, check_in, check_out, guest_name')
          ]);

          const allBookings = [
            ...(b24Res.data || []).map((b: any) => ({ ...b, phone: b.guest_phone || b.phone || '' })),
            ...(localRes.data || []).map((b: any) => ({ ...b, phone: b.phone || '' }))
          ];

          const matches = allBookings.filter((b: any) => phonesMatch(b.phone, phone));
          if (matches.length > 0) {
            const todayTime = new Date().setHours(0,0,0,0);
            matches.sort((a: any, b: any) => {
              const aIn = new Date(a.check_in || 0).getTime();
              const bIn = new Date(b.check_in || 0).getTime();
              return bIn - aIn;
            });
            bookingId = String(matches[0].id);
            guestNameFromSearch = matches[0].guest_name || '';
          }
        } catch (bErr) {
          console.error("[Inbound Handler] Error buscando reservas:", bErr);
        }
      }
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
  // D. Botones de Cotización, Disponibilidad y Reserva Directa ("Disponibili. y cotización" / "¡Reserva YA!")
  else if (
    guestMsgClean.includes('disponibili') || 
    guestMsgClean.includes('cotización') || 
    guestMsgClean.includes('cotizacion') || 
    guestMsgClean.includes('cotizar') || 
    guestMsgClean.includes('reserva ya') || 
    guestMsgClean.includes('¡reserva ya!') || 
    guestMsgClean.includes('reservar') || 
    guestMsgClean.includes('disponibilidad') || 
    guestMsgClean.includes('quote & availability') || 
    guestMsgClean.includes('book now') || 
    rawPayload.includes('cotizar') || 
    rawPayload.includes('disponibilidad') || 
    rawPayload.includes('reserva_ya') || 
    rawPayload.includes('book_now')
  ) {
    const { isSpanishOrLatamPhone } = await import('@/lib/whatsapp');
    const isEnglish = guestMsgClean.includes('quote') || guestMsgClean.includes('book now') || !isSpanishOrLatamPhone(phone);
    const lang = isEnglish ? 'en' : 'es';
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jaroje-app.vercel.app';
    const cleanPhoneDigits = phone.replace(/\D/g, '');
    const bookingEngineUrl = `${siteUrl}/public/reservar?phone=${cleanPhoneDigits}&lang=${lang}`;

    isAutoReplyTriggered = true;
    finalBotResponse = lang === 'en'
      ? `🏨 *Direct Booking Portal - Condominios Jaroje*\n\nYou can check live availability, photos, and book with exclusive direct rates right here:\n\n👉 ${bookingEngineUrl}\n\n✨ Instant confirmation, 24-hour payment hold, and zero OTA markups!`
      : `🏨 *Portal de Reservas Directas - Condominios Jaroje*\n\nConsulta disponibilidad en tiempo real, fotos de cada alojamiento y reserva con tarifa directa neta aquí:\n\n👉 ${bookingEngineUrl}\n\n✨ Confirmación inmediata, 24 hrs para transferir tu anticipo del 50% y sin comisiones de agencias.`;
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

  // ── REGLA DE BIENVENIDA AUTOMÁTICA A WHATSAPP (1 VEZ POR SEMANA / 7 DÍAS) ──
  // Plantilla: bienvenido_cliente_whatsaap_v4
  // Cuando el cliente le habla por WhatsApp a Rolando y no había interactuado en 1 semana.
  // Regla estricta: Solo le llega como máximo 1 vez cada 7 días.
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  let lastWelcomeSentAt = 0;

  // A. Revisar en memoria para evitar colisiones rápidas
  const memSentTime = welcomeSentMemoryCache.get(phone);
  if (memSentTime && now - memSentTime < ONE_WEEK_MS) {
    lastWelcomeSentAt = Math.max(lastWelcomeSentAt, memSentTime);
  }

  // B. Revisar en whatsapp_logs si se le envió plantilla de bienvenida en los últimos 7 días
  try {
    const { data: lastWelcomeLog } = await supabase
      .from('whatsapp_logs')
      .select('sent_at, template_name')
      .eq('phone', phone)
      .ilike('template_name', '%bienvenido%')
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
      if (botText.includes('bienvenido_cliente_whatsaap') || botText.includes('bienvenido_cliente_final_v2') || botText.includes('bienvenido_cliente')) {
        const msgTime = new Date(msg.timestamp || 0).getTime();
        if (!isNaN(msgTime) && msgTime > lastWelcomeSentAt) {
          lastWelcomeSentAt = msgTime;
        }
        break;
      }
    }
  }

  const isWelcomeCoolingDown = lastWelcomeSentAt > 0 && (now - lastWelcomeSentAt < ONE_WEEK_MS);
  const shouldSendWelcome = !isWelcomeCoolingDown;

  if (shouldSendWelcome && !isAutoReplyTriggered) {
    try {
      console.log(`[Inbound Handler] 🌟 Cliente escribió a WhatsApp (sin contacto en 1 semana). Enviando 'bienvenido_cliente_whatsaap_v4' a ${phone}...`);
      welcomeSentMemoryCache.set(phone, now);
      if (welcomeSentMemoryCache.size > 100) {
        const oldest = Array.from(welcomeSentMemoryCache.keys()).slice(0, 20);
        oldest.forEach(k => welcomeSentMemoryCache.delete(k));
      }
      const { sendTemplate_BienvenidoWhatsApp } = await import('@/lib/whatsapp');
      const welcomeResult = await sendTemplate_BienvenidoWhatsApp(phone);
      console.log(`[Inbound Handler] Resultado envío bienvenida WhatsApp:`, welcomeResult);
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
