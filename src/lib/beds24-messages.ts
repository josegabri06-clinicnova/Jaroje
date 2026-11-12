import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getBeds24Token, updateBeds24BookingPhone, extractPhoneFromBookingData, isDummyOrInvalidPhone } from '@/lib/beds24';
import { maskPhone } from '@/lib/log-mask';
import { trackBeds24 } from '@/lib/beds24-credits';
import { hasDepositPaid } from '@/lib/deposit-rule';
import {
  normalizePhone,
  sendTemplate3_ReservacionConfirmada,
  isWhatsAppAutomationsPaused,
  detectLanguageFromPhone
} from '@/lib/whatsapp';

export interface SendOtaMessageOptions {
  bookingId: string | number;
  guestName?: string;
  channel?: string;
  country?: string;
  force?: boolean;
}

/**
 * Detecta si el canal de la reserva es una OTA (Booking, Airbnb, Expedia, etc.)
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
 * Determina si el canal permite enlaces externos directos (Airbnb y Expedia sí, Booking.com no)
 */
export function canOtaReceiveLinks(channel?: string): boolean {
  if (!channel) return false;
  const c = channel.toLowerCase().trim();
  if (c.includes('booking')) return false; // Booking.com bloquea/censura URLs externas
  return c.includes('airbnb') || c.includes('expedia') || c.includes('vrbo') || c.includes('agoda');
}

/**
 * Plantilla inicial para el centro de mensajes de la OTA: solicita WhatsApp activamente
 */
export function generateOtaWelcomeMessage(guestName: string = 'Huésped', country?: string): string {
  const cleanName = (guestName || 'Huésped').trim().split(' ')[0] || 'Huésped';
  const cUpper = String(country || '').toUpperCase().trim();
  const isEnglish = ['US', 'USA', 'CA', 'CAN', 'GB', 'GBR', 'UK', 'AU', 'AUS'].includes(cUpper);

  if (isEnglish) {
    return `Hello, ${cleanName}! 🌴 Thank you for choosing Condominios Jaroje.\n\n` +
      `To send you arrival instructions and WiFi password prior to Check-in, ` +
      `please reply to this message with your WhatsApp phone number (including country code).\n\n` +
      `As soon as you share it, our system will send your complete confirmation. We look forward to welcoming you!`;
  }

  return `¡Hola, ${cleanName}! 🌴 Gracias por reservar en Condominios Jaroje.\n\n` +
    `Para poder enviarte las indicaciones de llegada y la clave de WiFi antes de tu Check-in, ` +
    `por favor respóndenos a este mensaje con tu número de teléfono de WhatsApp (incluyendo clave de país).\n\n` +
    `En cuanto nos lo compartas, nuestro sistema te enviará tu confirmación completa. ¡Te esperamos!`;
}

/**
 * Dominio de producción para los enlaces que se envían al huésped.
 * Mismo criterio que lib/whatsapp.ts (NEXT_PUBLIC_SITE_URL o el dominio real de la app).
 */
function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://jaroje-app.vercel.app').replace(/\/+$/, '');
}

/**
 * Genera el texto EXACTO oficial de las plantillas de Meta para su envío en centros de mensajes de OTAs
 */
export function getOfficialOtaTemplateText(
  templateName: string,
  {
    bookingId,
    guestName = 'Huésped',
    lang = 'es',
    channel = 'OTA'
  }: {
    bookingId: string | number;
    guestName?: string;
    lang?: string;
    channel?: string;
  }
): string {
  const name = (guestName || 'Huésped').trim().split(' ')[0] || 'Huésped';
  const cleanBookingId = String(bookingId).trim();
  const allowLinks = canOtaReceiveLinks(channel);
  const siteUrl = getSiteUrl();
  const portalUrl = `${siteUrl}/public/reserva/${encodeURIComponent(cleanBookingId)}?lang=${encodeURIComponent(lang)}`;
  const catalogUrl = `${siteUrl}/public/reservar`;

  const isEn = lang === 'en';

  switch (templateName) {
    case 'reservacion_confirmada':
    case 'confirmacion_reserva_util':
      if (isEn) {
        let msg = `🎉 Your reservation is confirmed!\n\n` +
          `Excellent, ${name}!\n\n` +
          `We are very pleased to confirm that your reservation is ready. We are ready to welcome you.\n\n` +
          `In "Guest Portal" you will be able to check any updates to your reservation in real time, as well as the photos, description and services of your accommodation.\n\n` +
          `👥 Did the number of guests change? Update it from "My reservation" before your arrival to avoid additional charges at check-in.`;
        if (allowLinks) {
          msg += `\n\n👇 Guest Portal\n${portalUrl}`;
        }
        return msg;
      } else {
        let msg = `🎉 ¡Tu reservación está confirmada!\n\n` +
          `¡Excelente, ${name}!\n\n` +
          `Nos da mucho gusto confirmar que tu reservación ya quedó lista. Estamos listos para recibirte.\n\n` +
          `En "Portal del Huésped" podrás consultar cualquier actualización de tu reservación en tiempo real, así como las fotos, la descripción y los servicios de tu alojamiento.\n\n` +
          `👥 ¿Cambió el número de huéspedes? Actualízalo desde "Mi reservación" antes de tu llegada para evitar cargos adicionales al momento del check-in.`;
        if (allowLinks) {
          msg += `\n\n👇 Portal del Huésped\n${portalUrl}`;
        }
        return msg;
      }

    case 'solicitud_recibida':
      if (isEn) {
        let msg = `📋 Reservation request received (24 h to confirm)\n\n` +
          `Hello, ${name}.\n\n` +
          `Thank you for choosing Condominios Jaroje for your next vacation in Huatulco! 🌴\n\n` +
          `In your "Guest Portal" you will find all the information about your reservation, including photos and description of your accommodation, reservation details, hotel and cancellation policies, as well as payment options, if you need them.`;
        if (allowLinks) {
          msg += `\n\n👇 Guest Portal\n${portalUrl}`;
        }
        return msg;
      } else {
        let msg = `📋 Solicitud de reservación recibida (24 h para confirmar)\n\n` +
          `Hola, ${name}.\n\n` +
          `¡Gracias por elegir Condominios Jaroje para tus próximas vacaciones en Huatulco! 🌴\n\n` +
          `En tu "Portal del Huésped" encontrarás toda la información sobre tu reservación, incluyendo las fotos y la descripción de tu alojamiento, los datos de tu reservación, las políticas del hotel y de cancelación, así como las opciones de pago, si las necesitas.`;
        if (allowLinks) {
          msg += `\n\n👇 Portal del Huésped\n${portalUrl}`;
        }
        return msg;
      }

    case 'disponibilidad_liberada':
    case 'disponibilidad_liberada_v2':
      if (isEn) {
        let msg = `😔 Availability released\n\n` +
          `Hello, ${name}.\n\n` +
          `We regret to inform you that since we did not receive the deposit within the indicated period or the stay was cancelled, the availability of your accommodation was released.\n\n` +
          `If you still wish to stay with us, check if we still have accommodation available for your travel dates and make a new reservation.`;
        if (allowLinks) {
          msg += `\n\n👇 Availability and Quote\n${catalogUrl}`;
        }
        return msg;
      } else {
        let msg = `😔 Disponibilidad liberada\n\n` +
          `Hola, ${name}.\n\n` +
          `Lamentamos informarte que, al no recibir el anticipo dentro del plazo indicado o haberse cancelado la estancia, la disponibilidad de tu alojamiento fue liberada.\n\n` +
          `Si aún deseas hospedarte con nosotros, consulta si todavía contamos con alojamiento disponible para las fechas de tu viaje y, en caso de haber disponibilidad, realizar una nueva reservación.`;
        if (allowLinks) {
          msg += `\n\n👇 Verificar disponibilidad\n${catalogUrl}`;
        }
        return msg;
      }

    case 'recordatorio_7_dias':
      if (isEn) {
        let msg = `📅 7 days until your arrival\n\n` +
          `Hello, ${name}.\n\n` +
          `Only one week left to welcome you to Condominios Jaroje! 🌴\n\n` +
          `If for any reason you will not be able to arrive, please let us know as soon as possible by replying to this message so we can help you.\n\n` +
          `👥 Did the number of guests change? Update it from "My reservation" before your arrival to avoid additional charges at check-in.\n\n` +
          `In "My reservation" you can check your reservation details, the location and how to get here.`;
        if (allowLinks) {
          msg += `\n\n👇 My reservation\n${portalUrl}`;
        }
        return msg;
      } else {
        let msg = `📅 Faltan 7 días para tu llegada\n\n` +
          `Hola, ${name}.\n\n` +
          `¡Ya falta una semana para recibirte en Condominios Jaroje! 🌴\n\n` +
          `Si por algún motivo no podrás llegar, por favor avísanos lo antes posible respondiendo a este mensaje, así podemos ayudarte.\n\n` +
          `👥 ¿Cambió el número de huéspedes? Actualízalo desde "Mi reservación" antes de tu llegada para evitar cargos adicionales al momento del check-in.\n\n` +
          `En "Mi reservación" puedes consultar los datos de tu reservación, la ubicación y cómo llegar.`;
        if (allowLinks) {
          msg += `\n\n👇 Mi reservación\n${portalUrl}`;
        }
        return msg;
      }

    case 'preparacion_llegada':
    case 'preparacion_llegada_v2':
      if (isEn) {
        let msg = `🚗 Everything ready for your arrival\n\n` +
          `Hello, ${name}.\n\n` +
          `Very soon we will welcome you to Condominios Jaroje! We want your arrival to be as comfortable as possible.\n\n` +
          `👥 Did the number of guests change? Update it from "My reservation" before your arrival to avoid additional charges at check-in.\n\n` +
          `In "My reservation" you will find the gate code, location, directions, photos, description and services of your accommodation, as well as everything you need to prepare for your arrival.\n\n` +
          `Arriving after 8:00 p.m.? Let us know in advance to welcome you.\n\n` +
          `We wish you an excellent trip!`;
        if (allowLinks) {
          msg += `\n\n👇 My reservation\n${portalUrl}`;
        }
        return msg;
      } else {
        let msg = `🚗 Todo listo para tu llegada\n\n` +
          `Hola, ${name}.\n\n` +
          `¡Ya falta muy poco para recibirte en Condominios Jaroje! Queremos que tu llegada sea lo más cómoda posible.\n\n` +
          `👥 ¿Cambió el número de huéspedes? Actualízalo desde "Mi reservación" antes de tu llegada para evitar cargos adicionales al momento del check-in.\n\n` +
          `En "Mi reservación" encontrarás el código del portón, la ubicación, las indicaciones para llegar, las fotos, la descripción y los servicios de tu alojamiento, así como todo lo necesario para preparar tu llegada.\n\n` +
          `¿Llegarás después de las 8:00 p.m.? Avísanos con anticipación para recibirte.\n\n` +
          `¡Te deseamos un excelente viaje!`;
        if (allowLinks) {
          msg += `\n\n👇 Mi reservación\n${portalUrl}`;
        }
        return msg;
      }

    case 'bienvenida_checkin':
    case 'bienvenida_checkin_v2':
      if (isEn) {
        let msg = `🏡 Welcome to Condominios Jaroje!\n\n` +
          `What a pleasure to welcome you, ${name}!\n\n` +
          `We hope you had an excellent trip. We hope you enjoy an excellent stay and feel at home.\n\n` +
          `In "My stay" you will find the gate code, WiFi network and password, photos, description and services of your accommodation, as well as all the necessary information to enjoy your stay.\n\n` +
          `If during your stay you need to report any maintenance details, you can do so from "My stay".\n\n` +
          `We wish you a wonderful stay. If you need anything, we are here to help.`;
        if (allowLinks) {
          msg += `\n\n👇 My stay\n${portalUrl}`;
        }
        return msg;
      } else {
        let msg = `🏡 ¡Bienvenido a Condominios Jaroje!\n\n` +
          `¡Qué gusto recibirte, ${name}!\n\n` +
          `Esperamos que hayas tenido un excelente viaje. Deseamos que disfrutes una excelente estancia y que te sientas como en casa.\n\n` +
          `En "Mi estancia" encontrarás el código del portón, la red WiFi y su contraseña, las fotos, la descripción y los servicios de tu alojamiento, así como toda la información necesaria para disfrutar tu estancia.\n\n` +
          `Si durante tu estancia necesitas reportar algún detalle de mantenimiento podrás hacerlo desde "Mi estancia".\n\n` +
          `Deseamos que disfrutes tu estancia. Si necesitas cualquier cosa, aquí estamos para ayudarte.`;
        if (allowLinks) {
          msg += `\n\n👇 Mi estancia\n${portalUrl}`;
        }
        return msg;
      }

    case 'alojamiento_listo':
      if (isEn) {
        let msg = `✨ Great news, ${name}!\n\n` +
          `Your accommodation is now clean, sanitized, and ready to welcome you.\n\n` +
          `If you are already in Huatulco, you can check in whenever you like. In "My stay" you will find all the arrival information, including gate access, WiFi, and your stay details.\n\n` +
          `We look forward to seeing you! 🏡`;
        if (allowLinks) {
          msg += `\n\n👇 My stay\n${portalUrl}`;
        }
        return msg;
      } else {
        let msg = `✨ ¡Buenas noticias, ${name}!\n\n` +
          `Tu alojamiento ya está limpio, desinfectado y listo para recibirte.\n\n` +
          `Si ya te encuentras en Huatulco, puedes dirigirte cuando gustes. En "Mi estancia" encontrarás toda la información para tu llegada, incluyendo el acceso, la red WiFi y los detalles de tu estancia.\n\n` +
          `¡Te esperamos! 🏡`;
        if (allowLinks) {
          msg += `\n\n👇 Mi estancia\n${portalUrl}`;
        }
        return msg;
      }

    case 'ultimo_aviso':
    case 'ultimo_aviso_v2':
      if (isEn) {
        let msg = `⏳ Last reminder (1 hour left to confirm your reservation)\n\n` +
          `Hello, ${name}.\n\n` +
          `We just need your deposit to confirm your reservation. Remember that the deadline to receive it expires in approximately 1 hour.\n\n` +
          `In "Make deposit" you will find the available payment options. If you have already made your deposit, please send us your receipt.`;
        if (allowLinks) {
          msg += `\n\n👇 Make Deposit\n${portalUrl}`;
        }
        return msg;
      } else {
        let msg = `⏳ Último recordatorio (queda 1 hora para confirmar tu reservación)\n\n` +
          `Hola, ${name}.\n\n` +
          `Solo falta realizar tu depósito para confirmar tu reservación. Recuerda que el plazo para recibirlo vence en aproximadamente 1 hora.\n\n` +
          `En "Realizar depósito" encontrarás las opciones de pago disponibles. Si ya realizaste tu depósito, por favor envíanos tu comprobante.`;
        if (allowLinks) {
          msg += `\n\n👇 Realizar Depósito\n${portalUrl}`;
        }
        return msg;
      }

    case 'seguimiento_satisfaccion':
    case 'seguimiento_satisfaccion_v2':
      if (isEn) {
        let msg = `😊 How is your stay going?\n\n` +
          `Good morning, ${name}.\n\n` +
          `We want to make sure everything is going as you expected.\n\n` +
          `If there is anything we can do to help you enjoy your stay even more, we will be more than happy to help.`;
        if (allowLinks) {
          msg += `\n\n👇 My stay\n${portalUrl}`;
        }
        return msg;
      } else {
        let msg = `😊 ¿Cómo va tu estancia?\n\n` +
          `Buenos días, ${name}.\n\n` +
          `Queremos asegurarnos de que todo esté transcurriendo como esperabas.\n\n` +
          `Si hay algo que podamos hacer para que disfrutes aún más tu estancia, con gusto estaremos para servirte.`;
        if (allowLinks) {
          msg += `\n\n👇 Mi estancia\n${portalUrl}`;
        }
        return msg;
      }

    case 'salida_checkout':
      if (isEn) {
        let msg = `🚪 Check-out 12:00 p.m.\n\n` +
          `Good morning, ${name}.\n\n` +
          `Today your stay with us comes to an end. Thank you very much for choosing us and we hope you enjoyed your stay.\n\n` +
          `If you need luggage storage after check-out or require assistance with your departure, we will be happy to assist you.\n\n` +
          `If anything did not meet your expectations, please let us know so we can help.\n\n` +
          `If you consider that your experience was ⭐⭐⭐⭐⭐, we would love for you to share your review.`;
        if (allowLinks) {
          msg += `\n\n👇 Write a review\n${portalUrl}`;
        }
        return msg;
      } else {
        let msg = `🚪 Check-out 12:00 p.m.\n\n` +
          `Muy buenos días, ${name}.\n\n` +
          `Hoy finaliza tu estancia con nosotros. Muchas gracias por habernos elegido y esperamos que hayas disfrutado tu estancia.\n\n` +
          `Si necesitas resguardar tu equipaje después del check-out o requieres apoyo con tu salida, con gusto estaremos para ayudarte.\n\n` +
          `Si hubo algo que no cumplió tus expectativas, por favor háznoslo saber para poder ayudarte.\n\n` +
          `Si consideras que tu experiencia fue de ⭐⭐⭐⭐⭐, nos encantará que compartas tu opinión.`;
        if (allowLinks) {
          msg += `\n\n👇 Escribir reseña\n${portalUrl}`;
        }
        return msg;
      }

    case 'comparte_experiencia':
      if (isEn) {
        let msg = `⭐ How was your experience?\n\n` +
          `Hello, ${name}.\n\n` +
          `We hope you had a safe trip home and have fond memories of your stay with us.\n\n` +
          `If anything did not meet your expectations, please let us know so we can help.\n\n` +
          `If your experience was ⭐⭐⭐⭐⭐, we would be delighted if you could share your review. Your review helps other travelers choose us with greater confidence and motivates us to keep improving.`;
        if (allowLinks) {
          msg += `\n\n👇 Rate accommodation\n${portalUrl}`;
        }
        return msg;
      } else {
        let msg = `⭐ ¿Cómo estuvo tu experiencia?\n\n` +
          `Hola, ${name}.\n\n` +
          `Esperamos que hayas llegado con bien a casa y que conserves un excelente recuerdo de tu estancia con nosotros.\n\n` +
          `Si hubo algo que no cumplió tus expectativas, por favor háznoslo saber para poder ayudarte.\n\n` +
          `Si tu experiencia fue de ⭐⭐⭐⭐⭐, nos haría muy feliz que compartieras tu reseña. Tu reseña ayuda a otros viajeros a elegirnos con mayor confianza y nos motiva a seguir mejorando.`;
        if (allowLinks) {
          msg += `\n\n👇 Calificar alojamiento\n${portalUrl}`;
        }
        return msg;
      }

    case 'recibimiento_nuevamente':
      if (isEn) {
        let msg = `🌴 We'd love to welcome you back!\n\n` +
          `Hello again, ${name}.\n\n` +
          `Today we remembered your stay with us and wanted to say hello. We hope you have fond memories of Huatulco and your stay with us.\n\n` +
          `If you're thinking of returning to Huatulco, it will be a pleasure to welcome you again. You can check availability and start a new reservation whenever you like.`;
        if (allowLinks) {
          msg += `\n\n👇 Check availability\n${catalogUrl}`;
        }
        return msg;
      } else {
        let msg = `🌴 ¡Nos encantará recibirte nuevamente!\n\n` +
          `Hola de nuevo, ${name}.\n\n` +
          `Hoy nos acordamos de tu estancia con nosotros y quisimos saludarte. Esperamos que guardes un excelente recuerdo de Huatulco y de tu estancia con nosotros.\n\n` +
          `Si estás pensando en regresar a Huatulco, será un placer recibirte nuevamente. En “Verificar disponibilidad” podrás consultar disponibilidad y comenzar una nueva reservación.`;
        if (allowLinks) {
          msg += `\n\n👇 Verificar disponibilidad\n${catalogUrl}`;
        }
        return msg;
      }

    default:
      return generateOtaWelcomeMessage(name);
  }
}

/**
 * Verifica si ya se ha enviado un tipo de mensaje OTA específico a esta reserva
 */
export async function hasOtaMessageBeenSent(
  bookingId: string | number,
  templateType: string = 'ota_welcome_request_phone'
): Promise<boolean> {
  const cleanId = String(bookingId).trim();

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

  return false;
}

/**
 * Registra el resultado del mensaje OTA en Supabase
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

  // FRENO DE EMERGENCIA: todos los mensajes a OTAs son automáticos (crons y webhook), así que
  // este es el punto único por el que pasan. Si el administrador pausó los envíos, no sale nada.
  if (await isWhatsAppAutomationsPaused()) {
    return { success: false, error: 'paused' };
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

    if (res.status === 401) {
      console.warn('[Beds24 Messages] Token expirado al enviar mensaje, renovando...');
      token = await getBeds24Token(true);
      res = await doRequest(token);
    }

    const resJson = await res.json().catch(() => null);

    if (res.ok && resJson) {
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
 * Envía un mensaje oficial de Meta a una OTA (con URL si el canal lo permite)
 */
export async function sendOfficialOtaTemplate(
  bookingId: string | number,
  templateName: string,
  {
    guestName,
    channel,
    lang = 'es',
    force = false
  }: {
    guestName?: string;
    channel?: string;
    lang?: string;
    force?: boolean;
  }
): Promise<{ success: boolean; alreadySent?: boolean; error?: string }> {
  const cleanId = String(bookingId).trim();

  if (!force) {
    const alreadySent = await hasOtaMessageBeenSent(cleanId, templateName);
    if (alreadySent) {
      return { success: true, alreadySent: true };
    }
  }

  // Pausa global: no enviar y tampoco registrar un "failed" (se reintenta solo al reanudar)
  if (await isWhatsAppAutomationsPaused()) {
    return { success: false, error: 'paused' };
  }

  const messageText = getOfficialOtaTemplateText(templateName, {
    bookingId: cleanId,
    guestName,
    lang,
    channel
  });

  const sendRes = await sendBeds24OtaMessage(cleanId, messageText);

  await recordOtaMessageLog({
    bookingId: cleanId,
    channel: channel,
    guestName: guestName,
    message: messageText,
    templateType: templateName,
    status: sendRes.success ? 'sent' : 'failed',
    responsePayload: sendRes.success ? sendRes.data : sendRes.error
  });

  return sendRes;
}

/**
 * Envía la plantilla inicial solicitando WhatsApp al huésped
 */
export async function sendOtaWelcomeMessage({
  bookingId,
  guestName = 'Huésped',
  channel = 'OTA',
  country,
  force = false
}: SendOtaMessageOptions): Promise<{ success: boolean; alreadySent?: boolean; error?: string }> {
  const cleanId = String(bookingId).trim();

  if (!force) {
    const alreadySent = await hasOtaMessageBeenSent(cleanId, 'ota_welcome_request_phone');
    if (alreadySent) {
      return { success: true, alreadySent: true };
    }
  }

  // Pausa global: no enviar y tampoco registrar un "failed" (se reintenta solo al reanudar)
  if (await isWhatsAppAutomationsPaused()) {
    return { success: false, error: 'paused' };
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
export async function fetchBeds24OtaMessages(bookingId: string | number, tracker?: { add(res: Response): void }): Promise<any[]> {
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
    tracker?.add(res); // medición de créditos (solo registra)
    if (res.status === 401) {
      token = await getBeds24Token(true);
      res = await doFetch(token);
      tracker?.add(res);
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
 * Extrae número de teléfono de mensajes entrantes del huésped con tolerancia a espaciados libres
 */
export function extractPhoneFromMessages(messages: any[], country?: string, bookingId?: string | number): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const guestMessages = messages.filter(m => {
    const src = String(m?.source || '').toLowerCase();
    return src !== 'host';
  });

  if (guestMessages.length === 0) return null;

  for (const m of guestMessages) {
    const rawText = String(m.message || m.text || m.body || '').trim();
    if (!rawText) continue;

    // Pre-sanitizar caracteres invisibles, espacios duros y guiones unicode no estándar
    const text = rawText
      .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, '')
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      .replace(/[\u2010-\u2015\u2212]/g, '-');

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

// Re-exportar validador centralizado de teléfonos dummy / inválidos
export { isDummyOrInvalidPhone };

/**
 * FASE 1: Procesa respuestas de huéspedes en los chats de las OTAs
 */
export async function checkAndProcessOtaGuestReplies(): Promise<{
  processedCount: number;
  upgradedCount: number;
  details: any[];
}> {
  const details: any[] = [];
  let upgradedCount = 0;

  try {
    const { data: capturedLogs } = await supabase
      .from('ota_messages_log')
      .select('booking_id')
      .eq('template_type', 'ota_guest_reply_captured');

    const alreadyCapturedSet = new Set((capturedLogs || []).map(l => String(l.booking_id)));

    const { data: requestedLogs } = await supabase
      .from('ota_messages_log')
      .select('booking_id')
      .eq('template_type', 'ota_welcome_request_phone');

    const requestedSet = new Set((requestedLogs || []).map(l => String(l.booking_id)));

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

    const pendingBookings = otaBookings.filter(b => {
      const bId = String(b.id);
      if (alreadyCapturedSet.has(bId)) return false;

      const hasInvalidPhone = isDummyOrInvalidPhone(b.guest_phone);
      const wasRequested = requestedSet.has(bId);

      return hasInvalidPhone || wasRequested;
    });

    // Medición de créditos: una fila por ejecución del cron con todas sus consultas de mensajes (una por reserva pendiente)
    const msgTracker = trackBeds24('cron:ota-messages', 'mensajes', { reservas_pendientes: pendingBookings.length });
    for (const b of pendingBookings) {
      const bId = String(b.id);
      const messages = await fetchBeds24OtaMessages(bId, msgTracker);

      if (!messages || messages.length === 0) continue;

      const detectedPhone = extractPhoneFromMessages(messages, undefined, bId);

      if (detectedPhone) {
        console.log(`[OTA Replies Worker] 🎯 ¡Teléfono detectado para reserva ${bId} (${b.guest_name}): ${maskPhone(detectedPhone)}!`);

        // 1. Guardar en Supabase
        await supabase
          .from('beds24_reservations')
          .update({ guest_phone: detectedPhone, updated_at: new Date().toISOString() })
          .eq('id', bId);

        // 2. Guardar en checkins
        await supabase
          .from('checkins')
          .update({ phone: detectedPhone })
          .eq('reservation_id', bId.toLowerCase().trim());

        // 3. Sincronizar hacia Beds24
        updateBeds24BookingPhone(bId, detectedPhone).catch(err => {
          console.warn(`[OTA Replies Worker] No se pudo guardar teléfono en Beds24 para ${bId}:`, err);
        });

        // 4. Registrar captura
        await recordOtaMessageLog({
          bookingId: bId,
          channel: b.channel,
          guestName: b.guest_name,
          message: `Teléfono capturado del chat de la OTA: ${detectedPhone}`,
          templateType: 'ota_guest_reply_captured',
          status: 'captured',
          responsePayload: { detectedPhone }
        });

        // 5. Disparar WhatsApp oficial: Enviar INMEDIATAMENTE la plantilla de reservación confirmada
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

        console.log(`[OTA Replies Worker] 🚀 Enviando plantilla de reserva confirmada por WhatsApp a ${maskPhone(detectedPhone)} (reserva ${bId})...`);
        const waResult = await sendTemplate3_ReservacionConfirmada(bookingForWA, true, true);
        if (waResult?.success) {
          console.log(`[OTA Replies Worker] ✅ WhatsApp reservacion_confirmada entregado exitosamente a ${maskPhone(detectedPhone)} para reserva ${bId}.`);
        } else {
          console.warn(`[OTA Replies Worker] ⚠️ Resultado envío WhatsApp para ${bId}:`, waResult?.error);
        }

        // Copia en la bandeja de la OTA, en paralelo al WhatsApp (el número que dio el huésped puede no tener WhatsApp).
        // Si el fallback de 20 minutos ya la envió, el registro de la bandeja evita repetirla.
        try {
          await sendOfficialOtaTemplate(bId, 'reservacion_confirmada', {
            guestName: b.guest_name,
            channel: b.channel,
            lang: detectLanguageFromPhone(detectedPhone)
          });
        } catch (otaCopyErr) {
          console.warn(`[OTA Replies Worker] No se pudo enviar la copia a la bandeja de la OTA para ${bId}:`, otaCopyErr);
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

    await msgTracker.flush();

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

/**
 * FASE 2: Fallback temporal de 20 minutos para Airbnb y Expedia
 * Si pasaron más de 20 minutos desde la solicitud inicial y el huésped no dio su WhatsApp:
 * Envía automáticamente la plantilla oficial de Meta correspondiente con el enlace directo al portal.
 */
export async function processOta20MinuteFallback(): Promise<{
  checkedCount: number;
  fallbackSentCount: number;
  details: any[];
}> {
  const details: any[] = [];
  let fallbackSentCount = 0;

  try {
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    // 1. Obtener solicitudes enviadas hace más de 20 minutos
    const { data: initialLogs, error: logErr } = await supabase
      .from('ota_messages_log')
      .select('booking_id, channel, guest_name, created_at')
      .eq('template_type', 'ota_welcome_request_phone')
      .lte('created_at', twentyMinutesAgo)
      .eq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(50);

    if (logErr || !initialLogs || initialLogs.length === 0) {
      return { checkedCount: 0, fallbackSentCount: 0, details };
    }

    // 2. Obtener los IDs que ya tuvieron su fallback enviado o teléfono capturado
    const bookingIds = initialLogs.map(l => String(l.booking_id));

    const { data: alreadyHandled } = await supabase
      .from('ota_messages_log')
      .select('booking_id, template_type')
      .in('booking_id', bookingIds)
      .in('template_type', ['ota_guest_reply_captured', 'ota_fallback_portal_link', 'reservacion_confirmada', 'solicitud_recibida']);

    const handledSet = new Set((alreadyHandled || []).map(h => String(h.booking_id)));

    // 3. Consultar las reservas en Supabase
    const { data: dbBookings } = await supabase
      .from('beds24_reservations')
      .select('id, guest_name, channel, check_in, check_out, guest_phone, status, deposit, price, invoice_items, actual_paid')
      .in('id', bookingIds);

    const bookingMap = new Map((dbBookings || []).map(b => [String(b.id), b]));

    for (const log of initialLogs) {
      const bId = String(log.booking_id);
      const channel = log.channel || 'OTA';

      // Solo aplica para canales que permiten enlaces (Airbnb, Expedia, Vrbo)
      if (!canOtaReceiveLinks(channel)) {
        continue;
      }

      // Si ya se manejó o se envió el fallback previamente, omitir
      if (handledSet.has(bId)) {
        continue;
      }

      const b = bookingMap.get(bId);
      if (!b) continue;

      // Si ya tiene un teléfono válido, no necesita fallback por OTA
      if (!isDummyOrInvalidPhone(b.guest_phone)) {
        continue;
      }

      // Determinar la plantilla oficial según el estado de la reserva
      const bStatus = String(b.status || '').toLowerCase().trim();
      const isCancelled = bStatus === 'cancelled' || bStatus === '0';
      if (isCancelled) continue; // Cancelaciones se manejan por su propio evento

      // Airbnb y Expedia llegan con el pago anticipado ya hecho: nunca se les pide el anticipo de 24 h
      // (una reserva en estado "request" todavía no está confirmada, aunque venga de una OTA prepagada)
      const isPrepaidOta = bStatus !== 'request' && ['airbnb', 'expedia'].some(ota => channel.toLowerCase().includes(ota));
      const effectivePaid = Number(b.actual_paid || b.deposit || 0);
      // Con cualquier anticipo la reserva se considera confirmada (el gerente puede autorizar anticipos menores al 50%)
      const isConfirmed = isPrepaidOta || (hasDepositPaid(effectivePaid) && bStatus === 'confirmed');

      const templateToSend = isConfirmed ? 'reservacion_confirmada' : 'solicitud_recibida';

      console.log(`[OTA 20min Fallback] ⏱️ Han pasado >20 min sin WhatsApp para reserva ${bId} (${channel}). Enviando plantilla oficial '${templateToSend}' con enlace al Portal...`);

      // Obtener idioma preferido si existe
      let lang = 'es';
      try {
        const { data: portalSetting } = await supabase
          .from('booking_portal_settings')
          .select('language')
          .eq('booking_id', bId)
          .maybeSingle();
        if (portalSetting?.language) {
          lang = portalSetting.language;
        }
      } catch (_) {}

      const sendRes = await sendOfficialOtaTemplate(bId, templateToSend, {
        guestName: b.guest_name || log.guest_name,
        channel: channel,
        lang: lang,
        force: true
      });

      if (sendRes.success) {
        // Registrar fallback general
        await recordOtaMessageLog({
          bookingId: bId,
          channel: channel,
          guestName: b.guest_name,
          message: `Fallback de 20 minutos enviado: ${templateToSend}`,
          templateType: 'ota_fallback_portal_link',
          status: 'sent',
          responsePayload: { template: templateToSend }
        });

        fallbackSentCount++;
        details.push({
          bookingId: bId,
          channel: channel,
          guestName: b.guest_name,
          template: templateToSend,
          status: 'sent'
        });
      }
    }

    return {
      checkedCount: initialLogs.length,
      fallbackSentCount,
      details
    };
  } catch (err: any) {
    console.error('[OTA 20min Fallback] Error fatal:', err);
    return { checkedCount: 0, fallbackSentCount, details };
  }
}
