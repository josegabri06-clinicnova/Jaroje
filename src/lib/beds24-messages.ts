import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getBeds24Token, updateBeds24BookingPhone, extractPhoneFromBookingData } from '@/lib/beds24';
import { 
  normalizePhone, 
  sendTemplate1_SolicitudRecibida, 
  sendTemplate3_ReservacionConfirmada 
} from '@/lib/whatsapp';

export interface SendOtaMessageOptions {
  bookingId: string | number;
  guestName?: string;
  channel?: string;
  country?: string;
  force?: boolean;
}

/**
 * Detecta si el canal de la reserva es una OTA que oculta o anonimiza teléfonos (Booking, Airbnb, Expedia, etc.)
 */
export function isOtaChannel(channel?: string): boolean {
  if (!channel) return false;
  const c = channel.toLowerCase().trim();
  return (
    c.includes('airbnb') ||
    c.includes('booking') ||
    c.includes('expedia') ||
    c.includes('vrbo') ||
    c.includes('agoda')
  );
}

/**
 * Genera la plantilla de bienvenida para centros de mensajes OTA orientada a obtener el WhatsApp
 */
export function generateOtaWelcomeMessage(guestName: string = 'Huésped', country?: string): string {
  const cleanName = (guestName || 'Huésped').trim().split(' ')[0] || 'Huésped';
  const cUpper = String(country || '').toUpperCase().trim();
  const isEnglish = ['US', 'USA', 'CA', 'CAN', 'GB', 'GBR', 'UK', 'AU', 'AUS'].includes(cUpper);

  if (isEnglish) {
    return `Hello, ${cleanName}! 🌴 Thank you for choosing Condominios Jaroje.\n\n` +
      `To send you arrival instructions, your digital door access code, and WiFi password prior to Check-in, ` +
      `please reply to this message with your WhatsApp phone number (including country code).\n\n` +
      `As soon as you share it, our system will send your complete confirmation. We look forward to welcoming you!`;
  }

  return `¡Hola, ${cleanName}! 🌴 Gracias por reservar en Condominios Jaroje.\n\n` +
    `Para poder enviarte las indicaciones de llegada, el código de acceso a tu condominio y la clave de WiFi antes de tu Check-in, ` +
    `por favor respóndenos a este mensaje con tu número de teléfono de WhatsApp (incluyendo clave de país).\n\n` +
    `En cuanto nos lo compartas, nuestro sistema te enviará tu confirmación completa. ¡Te esperamos!`;
}

/**
 * Verifica si ya se ha enviado un mensaje OTA a esta reserva para evitar duplicados / spam
 */
export async function hasOtaMessageBeenSent(
  bookingId: string | number,
  templateType: string = 'ota_welcome_request_phone'
): Promise<boolean> {
  const cleanId = String(bookingId).trim();

  // 1. Verificar en tabla principal ota_messages_log
  try {
    const { data, error } = await supabase
      .from('ota_messages_log')
      .select('id')
      .eq('booking_id', cleanId)
      .eq('template_type', templateType)
      .eq('status', 'sent')
      .limit(1);

    if (!error && data && data.length > 0) {
      return true;
    }
  } catch (_) {}

  // 2. Fallback resiliente: verificar en whatsapp_logs
  try {
    const { data: wLog, error: wErr } = await supabase
      .from('whatsapp_logs')
      .select('id')
      .eq('reservation_id', cleanId)
      .eq('template_name', templateType)
      .eq('status', 'sent')
      .limit(1);

    if (!wErr && wLog && wLog.length > 0) {
      return true;
    }
  } catch (_) {}

  return false;
}

/**
 * Registra el resultado del mensaje OTA en Supabase con tolerancia a fallos
 */
export async function recordOtaMessageLog({
  bookingId,
  channel,
  guestName,
  message,
  templateType = 'ota_welcome_request_phone',
  status = 'sent',
  responsePayload
}: {
  bookingId: string | number;
  channel?: string;
  guestName?: string;
  message: string;
  templateType?: string;
  status?: string;
  responsePayload?: any;
}) {
  const cleanId = String(bookingId).trim();

  // Intento 1: tabla dedicada ota_messages_log
  try {
    const { error } = await supabase.from('ota_messages_log').insert([{
      booking_id: cleanId,
      channel: channel || 'OTA',
      guest_name: guestName || null,
      message: message,
      template_type: templateType,
      status: status,
      response_payload: responsePayload || null
    }]);

    if (!error) return;
  } catch (_) {}

  // Intento 2: fallback a whatsapp_logs para que la deduplicación funcione sin interrupciones
  try {
    await supabase.from('whatsapp_logs').insert([{
      reservation_id: cleanId,
      template_name: templateType,
      phone: `OTA_${(channel || 'CHANNEL').toUpperCase()}`,
      sent_at: new Date().toISOString(),
      status: status
    }]);
  } catch (err) {
    console.error('[OTA Messages] Error registrando log en fallback:', err);
  }
}

/**
 * Envía un mensaje directo a través de la API v2 de Beds24
 */
export async function sendBeds24OtaMessage(
  bookingId: string | number,
  message: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const cleanId = Number(String(bookingId).replace(/\D/g, ''));
  if (!cleanId || !message?.trim()) {
    return { success: false, error: 'bookingId o mensaje inválidos' };
  }

  const payload = [{
    bookingId: cleanId,
    message: message.trim()
  }];

  let token = await getBeds24Token();

  const doRequest = async (authToken: string) => {
    return fetch('https://api.beds24.com/v2/bookings/messages', {
      method: 'POST',
      headers: {
        'token': authToken,
        'Content-Type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
  };

  try {
    let res = await doRequest(token);

    // Si expiró el token, forzar renovación y reintentar una vez
    if (res.status === 401) {
      console.warn('[Beds24 Messages] Token expirado al enviar mensaje, renovando...');
      token = await getBeds24Token(true);
      res = await doRequest(token);
    }

    const resJson = await res.json().catch(() => null);

    if (res.ok && resJson) {
      // Beds24 v2 responde con array de resultados: [{ success: boolean, ... }]
      const item = Array.isArray(resJson) ? resJson[0] : resJson;
      if (item && item.success !== false) {
        return { success: true, data: resJson };
      }
      const errDetail = item?.errors ? JSON.stringify(item.errors) : JSON.stringify(item);
      return { success: false, error: errDetail, data: resJson };
    }

    return {
      success: false,
      error: `HTTP ${res.status}: ${JSON.stringify(resJson || {})}`
    };
  } catch (err: any) {
    console.error('[Beds24 Messages] Error en fetch a /bookings/messages:', err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Envía la plantilla de bienvenida solicitando WhatsApp al huésped de una OTA
 */
export async function sendOtaWelcomeMessage({
  bookingId,
  guestName = 'Huésped',
  channel = 'OTA',
  country,
  force = false
}: SendOtaMessageOptions): Promise<{ success: boolean; alreadySent?: boolean; error?: string }> {
  const cleanId = String(bookingId).trim();

  // Deduplicación e Idempotencia
  if (!force) {
    const alreadySent = await hasOtaMessageBeenSent(cleanId, 'ota_welcome_request_phone');
    if (alreadySent) {
      return { success: true, alreadySent: true };
    }
  }

  const messageText = generateOtaWelcomeMessage(guestName, country);
  const sendRes = await sendBeds24OtaMessage(cleanId, messageText);

  if (sendRes.success) {
    await recordOtaMessageLog({
      bookingId: cleanId,
      channel: channel,
      guestName: guestName,
      message: messageText,
      templateType: 'ota_welcome_request_phone',
      status: 'sent',
      responsePayload: sendRes.data
    });
    return { success: true };
  } else {
    await recordOtaMessageLog({
      bookingId: cleanId,
      channel: channel,
      guestName: guestName,
      message: messageText,
      templateType: 'ota_welcome_request_phone',
      status: 'failed',
      responsePayload: sendRes.error
    });
    return { success: false, error: sendRes.error };
  }
}

/**
 * Consulta el historial de mensajes de una reserva en Beds24 API v2
 */
export async function fetchBeds24OtaMessages(bookingId: string | number): Promise<any[]> {
  const cleanId = String(bookingId).replace(/\D/g, '');
  if (!cleanId) return [];

  let token = await getBeds24Token();

  const doFetch = async (authToken: string) => {
    return fetch(`https://api.beds24.com/v2/bookings/messages?bookingId=${cleanId}`, {
      headers: {
        'token': authToken,
        'accept': 'application/json'
      },
      cache: 'no-store'
    });
  };

  try {
    let res = await doFetch(token);
    if (res.status === 401) {
      token = await getBeds24Token(true);
      res = await doFetch(token);
    }

    if (!res.ok) {
      console.warn(`[Beds24 Messages] GET messages falló con status ${res.status}`);
      return [];
    }

    const json = await res.json();
    return json?.data || [];
  } catch (err) {
    console.error(`[Beds24 Messages] Error consultando mensajes para ${bookingId}:`, err);
    return [];
  }
}

/**
 * Extrae número de teléfono de mensajes entrantes del huésped
 */
export function extractPhoneFromMessages(messages: any[], country?: string, bookingId?: string | number): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  // Filtrar solo mensajes que provengan del huésped (source !== 'host')
  const guestMessages = messages.filter(m => {
    const src = String(m?.source || '').toLowerCase();
    return src !== 'host';
  });

  if (guestMessages.length === 0) return null;

  // Evaluar cada mensaje del huésped
  for (const m of guestMessages) {
    const text = String(m.message || m.text || m.body || '').trim();
    if (!text) continue;

    const dummyBooking = {
      id: bookingId,
      country: country,
      messages: [{ message: text }]
    };

    const phone = extractPhoneFromBookingData(dummyBooking);
    if (phone) return phone;

    // Extractor directo con espacios libres para chats de Airbnb / Booking / Expedia
    const flexibleMatches = text.match(/(?:\+|00)?\s*(?:\d[\s().-]*){8,16}\d/g);
    if (flexibleMatches) {
      const bookingIdStr = String(bookingId || '').replace(/\D/g, '');
      for (const raw of flexibleMatches) {
        const digits = raw.replace(/\D/g, '');
        if (digits.length >= 9 && digits.length <= 16 && digits !== bookingIdStr && !isDummyOrInvalidPhone(digits)) {
          const norm = normalizePhone(raw, country);
          if (norm && !isDummyOrInvalidPhone(norm)) {
            return norm;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Detecta si un teléfono es ficticio, dummy o inválido (común en OTAs como Expedia)
 */
export function isDummyOrInvalidPhone(phone?: string | null): boolean {
  if (!phone) return true;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 10) return true;
  if (/^(\d)\1+$/.test(digits)) return true; // ej: 11111111111, 0000000000
  if (digits === '1234567890' || digits === '0123456789') return true;
  return false;
}

/**
 * Procesa respuestas pendientes de huéspedes en OTAs:
 * Revisa reservas OTA recientes sin teléfono, consulta mensajes entrantes, extrae teléfono y dispara WhatsApp
 */
export async function checkAndProcessOtaGuestReplies(): Promise<{
  processedCount: number;
  upgradedCount: number;
  details: any[];
}> {
  const details: any[] = [];
  let upgradedCount = 0;

  try {
    // 1. Obtener IDs de reservas que ya tuvieron su respuesta de teléfono capturada para no repetir
    const { data: capturedLogs } = await supabase
      .from('ota_messages_log')
      .select('booking_id')
      .eq('template_type', 'ota_guest_reply_captured');

    const alreadyCapturedSet = new Set((capturedLogs || []).map(l => String(l.booking_id)));

    // 2. Obtener reservas a las que se les envió la solicitud de WhatsApp
    const { data: requestedLogs } = await supabase
      .from('ota_messages_log')
      .select('booking_id')
      .eq('template_type', 'ota_welcome_request_phone');

    const requestedSet = new Set((requestedLogs || []).map(l => String(l.booking_id)));

    // 3. Buscar reservas de OTAs activas de los últimos 45 días
    const thirtyDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: otaBookings, error } = await supabase
      .from('beds24_reservations')
      .select('id, guest_name, channel, check_in, check_out, guest_phone, status, deposit, price')
      .in('channel', ['Booking.com', 'Airbnb', 'Expedia', 'Vrbo', 'Agoda'])
      .neq('status', 'cancelled')
      .neq('status', '0')
      .gte('check_in', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error || !otaBookings) {
      console.error('[OTA Replies Worker] Error consultando beds24_reservations:', error);
      return { processedCount: 0, upgradedCount: 0, details };
    }

    // 4. Filtrar candidatas: aquellas sin teléfono válido O a las que se les pidió WhatsApp y aún no capturamos respuesta
    const pendingBookings = otaBookings.filter(b => {
      const bId = String(b.id);
      if (alreadyCapturedSet.has(bId)) return false;

      const hasInvalidPhone = isDummyOrInvalidPhone(b.guest_phone);
      const wasRequested = requestedSet.has(bId);

      return hasInvalidPhone || wasRequested;
    });

    for (const b of pendingBookings) {
      const bId = String(b.id);
      const messages = await fetchBeds24OtaMessages(bId);

      if (!messages || messages.length === 0) continue;

      const detectedPhone = extractPhoneFromMessages(messages, undefined, bId);

      if (detectedPhone) {
        console.log(`[OTA Replies Worker] 🎯 ¡Teléfono detectado para reserva ${bId} (${b.guest_name}): ${detectedPhone}!`);

        // 1. Actualizar en Supabase (beds24_reservations)
        await supabase
          .from('beds24_reservations')
          .update({ guest_phone: detectedPhone, updated_at: new Date().toISOString() })
          .eq('id', bId);

        // 2. Actualizar en checkins si existe
        await supabase
          .from('checkins')
          .update({ phone: detectedPhone })
          .eq('reservation_id', bId.toLowerCase().trim());

        // 3. Sincronizar hacia Beds24 para que quede guardado en el Channel Manager
        updateBeds24BookingPhone(bId, detectedPhone).catch(err => {
          console.warn(`[OTA Replies Worker] No se pudo guardar teléfono en Beds24 para ${bId}:`, err);
        });

        // 4. Registrar captura en ota_messages_log para evitar reprocesamiento
        await recordOtaMessageLog({
          bookingId: bId,
          channel: b.channel,
          guestName: b.guest_name,
          message: `Teléfono capturado del chat de la OTA: ${detectedPhone}`,
          templateType: 'ota_guest_reply_captured',
          status: 'captured',
          responsePayload: { detectedPhone }
        });

        // 5. Disparar WhatsApp oficial con portal del huésped
        const bookingForWA = {
          id: bId,
          guest_name: b.guest_name,
          phone: detectedPhone,
          channel: b.channel,
          check_in: b.check_in,
          check_out: b.check_out,
          price: b.price,
          deposit: b.deposit
        };

        // 5. Disparar WhatsApp oficial: Enviar INMEDIATAMENTE la plantilla de reservación confirmada
        // Se utiliza forceResend: true y bypassPause: true para garantizar la entrega inmediata al número recién captado
        console.log(`[OTA Replies Worker] 🚀 Enviando plantilla de reserva confirmada por WhatsApp a ${detectedPhone} (reserva ${bId})...`);
        const waResult = await sendTemplate3_ReservacionConfirmada(bookingForWA, true, true);
        if (waResult?.success) {
          console.log(`[OTA Replies Worker] ✅ WhatsApp reservacion_confirmada entregado exitosamente a ${detectedPhone} para reserva ${bId}.`);
        } else {
          console.warn(`[OTA Replies Worker] ⚠️ Resultado envío WhatsApp para ${bId}:`, waResult?.error);
        }

        upgradedCount++;
        details.push({
          bookingId: bId,
          guestName: b.guest_name,
          channel: b.channel,
          phone: detectedPhone,
          waSent: waResult?.success ?? false
        });
      }
    }

    return {
      processedCount: pendingBookings.length,
      upgradedCount,
      details
    };
  } catch (err: any) {
    console.error('[OTA Replies Worker] Error inesperado:', err);
    return { processedCount: 0, upgradedCount, details };
  }
}

