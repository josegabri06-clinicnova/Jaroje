import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';

// Detecta si un teléfono pertenece a un país angloparlante o turístico no-hispano común para mandar en inglés
export function detectLanguageFromPhone(phone: string): string {
  if (!phone) return 'es';
  const cleaned = phone.replace(/\D/g, '');
  // EE.UU./Canadá (+1), Reino Unido (+44), Alemania (+49), Francia (+33), Países Bajos (+31)
  if (cleaned.startsWith('1') || cleaned.startsWith('44') || cleaned.startsWith('49') || cleaned.startsWith('33') || cleaned.startsWith('31')) {
    return 'en';
  }
  return 'es';
}

// Normaliza y limpia el número de teléfono para base de datos y búsqueda
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    cleaned = '521' + cleaned;
  } else if (cleaned.startsWith('52') && !cleaned.startsWith('521') && cleaned.length === 12) {
    cleaned = '521' + cleaned.substring(2);
  } else if (cleaned.length === 9) {
    cleaned = '34' + cleaned;
  }
  return cleaned;
}

// Limpia el teléfono específicamente para la llamada de Meta (removiendo el '1' de México)
export function cleanPhoneForMeta(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('521') && cleaned.length === 13) {
    cleaned = '52' + cleaned.substring(3);
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

// Envía una plantilla genérica de WhatsApp llamando a Meta Cloud API
export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  parameters: string[],
  buttonParameters?: string[],
  bookingId?: string | number,
  buttonType?: 'url' | 'quick_reply'
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    if (!token || !phoneId) {
      return { success: false, error: 'Credenciales de WhatsApp no configuradas en el servidor' };
    }

    const cleanedPhone = normalizePhone(phone);
    if (!cleanedPhone) {
      return { success: false, error: 'Formato de teléfono no válido' };
    }

    // Resolve language preference
    let languageCode = 'es_MX';
    let detectedLang = detectLanguageFromPhone(phone);

    if (bookingId) {
      try {
        const { data: settings } = await supabase
          .from('booking_portal_settings')
          .select('language')
          .eq('booking_id', String(bookingId))
          .maybeSingle();
        
        if (settings?.language) {
          detectedLang = settings.language;
        }
      } catch (dbErr) {
        console.error("Error fetching booking language from DB:", dbErr);
      }
    }

    if (detectedLang === 'en') {
      languageCode = 'en';
    }

    const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;

    const components: any[] = [
      {
        type: 'body',
        parameters: parameters.map(p => ({
          type: 'text',
          text: p || '—'
        }))
      }
    ];

    if (buttonParameters && buttonParameters.length > 0) {
      const isQuickReply = buttonType === 'quick_reply' || buttonParameters[0].startsWith('VIEW_BOOKING_');
      
      if (isQuickReply) {
        components.push({
          type: 'button',
          sub_type: 'quick_reply',
          index: '0',
          parameters: [
            {
              type: 'payload',
              payload: buttonParameters[0]
            }
          ]
        });
      } else {
        components.push({
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: buttonParameters.map(p => ({
            type: 'text',
            text: p || ''
          }))
        });
      }
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhoneForMeta(cleanedPhone),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components
      }
    };

    let response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let status = response.status;
    let resBody = await response.json();

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

    if (status !== 200) {
      console.error(`Meta API error template ${templateName}:`, resBody);
      return { success: false, error: resBody.error?.message || 'Error de la API de Meta' };
    }

    // Registrar el envío de plantilla en la tabla 'conversations'
    try {
      const getTemplateText = (tName: string, params: string[]) => {
        const name = params[0] || 'Huésped';
        switch (tName) {
          case 'solicitud_recibida':
            return `¡Hola ${name}!\nHemos recibido tu solicitud de reservación en Condominios Jaroje. Tu habitación está pre-reservada.\n\nPara completar tu reservación, revisar el desglose y realizar tu depósito de garantía, por favor ingresa a tu portal del huésped.\n\n🔗 *Portal del Huésped:* https://jaroje-app.vercel.app/public/reserva/[BOOKID]\n\n[Botón: Ver Mi Reservación]`;
          case 'ultimo_aviso':
            return `¡Hola ${name}!\nTe recordamos que tienes una solicitud de reservación pendiente. Es necesario completar tu anticipo para garantizar tu estancia y evitar que se libere la habitación.\n\nRevisa todos los detalles y métodos de pago aquí:\n🔗 *Portal del Huésped:* https://jaroje-app.vercel.app/public/reserva/[BOOKID]\n\n[Botón: Ver Mi Reservación]`;
          case 'reservacion_confirmada':
            return `¡Hola ${name}!\nNos complace informarte que tu reservación en Condominios Jaroje está oficialmente *CONFIRMADA*. ¡Tu estancia en Huatulco está lista! 🎉\n\nPuedes consultar el reglamento, la ubicación y todos los detalles en tu portal:\n🔗 *Portal del Huésped:* https://jaroje-app.vercel.app/public/reserva/[BOOKID]\n\n[Botón: Ver Mi Reservación]`;
          case 'disponibilidad_liberada':
            return `Hola ${name}.\nTe informamos que, al no recibir la confirmación de tu anticipo, la disponibilidad de tu habitación ha sido liberada.\n\nSi aún deseas hospedarte con nosotros, puedes consultar disponibilidad en el portal o escribirnos:\n🔗 *Portal del Huésped:* https://jaroje-app.vercel.app/public/reserva/[BOOKID]\n\n[Botón: Ver Reservación]`;
          case 'preparacion_llegada':
            return `¡Hola ${name}!\nYa nos estamos preparando para tu llegada a Condominios Jaroje. En tu portal de huésped encontrarás las instrucciones de llegada, indicaciones para llegar y datos importantes.\n\nPor favor, revísalo aquí:\n🔗 *Portal del Huésped:* https://jaroje-app.vercel.app/public/reserva/[BOOKID]\n\n[Botón: Ver Mi Reservación]`;
          case 'bienvenida_checkin':
            return `¡Hola ${name}!\nTe damos la más cordial bienvenida a Condominios Jaroje. Esperamos que disfrutes al máximo de tu estancia en Huatulco. 🌴☀️\n\nRecuerda que en tu portal puedes consultar la clave de WiFi, el reglamento y solicitar servicios adicionales:\n🔗 *Portal del Huésped:* https://jaroje-app.vercel.app/public/reserva/[BOOKID]\n\n[Botón: Ver Mi Reservación]`;
          case 'seguimiento_satisfaccion':
            return `Hola ${name}.\nEsperamos que estés disfrutando tu estancia. ¿Todo va bien en tu condominio? Si requieres asistencia, toallas extra, reportar algún detalle o tienes alguna sugerencia, no dudes en escribirnos por aquí o revisar tu portal:\n🔗 *Portal del Huésped:* https://jaroje-app.vercel.app/public/reserva/[BOOKID]\n\n[Botón: Ver Mi Reservación]`;
          case 'salida_checkout':
            return `Hola ${name}.\nTe recordamos que hoy es tu día de salida. El horario de checkout es antes de las 11:00 AM.\n\nEsperamos que hayas tenido una estancia increíble. Puedes ver las indicaciones de salida en tu portal:\n🔗 *Portal del Huésped:* https://jaroje-app.vercel.app/public/reserva/[BOOKID]`;
          case 'comparte_experiencia':
            return `Hola ${name}.\nAgradecemos mucho tu preferencia. Nos ayudaría muchísimo si compartes tu experiencia dejándonos una reseña en Google Maps para seguir mejorando. ¡Buen viaje de regreso! ✈️\n\n🔗 *Portal del Huésped:* https://jaroje-app.vercel.app/public/reserva/[BOOKID]`;
          case 'recibimiento_nuevamente':
            return `¡Hola ${name}!\nEsperamos que hayas regresado con bien a casa. Nos encantaría recibirte nuevamente en Condominios Jaroje en tus próximas vacaciones en Huatulco.\n\nConsulta tus beneficios de cliente frecuente aquí:\n🔗 *Portal del Huésped:* https://jaroje-app.vercel.app/public/reserva/[BOOKID]\n\n[Botón: Ver Mi Reservación]`;
          case 'pago_anticipo_recibido':
            const abonado = params[1] || '$0.00';
            const saldo = params[2] || '$0.00';
            return `¡Hola ${name}!\nHemos registrado con éxito tu pago por la cantidad de *${abonado} MXN*.\n\nTu saldo pendiente actual es de *${saldo} MXN*.\n\nRevisa tu estado de cuenta actualizado aquí:\n🔗 *Portal del Huésped:* https://jaroje-app.vercel.app/public/reserva/[BOOKID]\n\n[Botón: Ver Mi Reservación]`;
          case 'portal_huesped_link':
            return `Hola ${name}, aquí tienes acceso a tu reservación en tiempo real. Desde tu portal puedes ver el estado de tu habitación, reglamento, datos de WiFi y registrar pagos adicionales.✅\n\n🔗 *Portal del Huésped:* https://jaroje-app.vercel.app/public/reserva/[BOOKID]\n\n[Botón: Ver Mi Reservación]`;
          case 'portal_huesped_link_en':
            return `Hello ${name}, here is your access to your real-time booking details. From your portal you can view your room status, guidelines, WiFi info, and record additional payments.✅\n\n🔗 *Guest Portal:* https://jaroje-app.vercel.app/public/reserva/[BOOKID]\n\n[Button: View My Booking]`;
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

    // Registrar el envío de plantilla en whatsapp_logs para trazabilidad y búsquedas
    if (bookingId) {
      try {
        await supabase.from('whatsapp_logs').insert([{
          reservation_id: String(bookingId),
          template_name: templateName,
          phone: cleanedPhone,
          sent_at: new Date().toISOString(),
          status: 'sent'
        }]);
        console.log(`[WhatsApp Logs] ✅ Registrado envío de plantilla ${templateName} para reserva ${bookingId} al teléfono ${cleanedPhone}`);
      } catch (logErr) {
        console.error("[WhatsApp Logs] Error al registrar en whatsapp_logs:", logErr);
      }
    }

    return { success: true, data: resBody };
  } catch (err: any) {
    console.error(`Exception sending WhatsApp template ${templateName}:`, err);
    return { success: false, error: err.message || 'Error de red' };
  }
}

// Envía un mensaje de texto libre por WhatsApp llamando a Meta Cloud API
export async function sendWhatsAppTextMessage(
  phone: string,
  body: string
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    if (!token || !phoneId) {
      return { success: false, error: 'Credenciales de WhatsApp no configuradas en el servidor' };
    }

    const cleanedPhone = normalizePhone(phone);
    if (!cleanedPhone) {
      return { success: false, error: 'Formato de teléfono no válido' };
    }

    const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhoneForMeta(cleanedPhone),
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

    if (status !== 200) {
      console.error(`Meta API error text message to ${cleanedPhone}:`, resBody);
      return { success: false, error: resBody.error?.message || 'Error de la API de Meta' };
    }

    return { success: true, data: resBody };
  } catch (err: any) {
    console.error(`Exception sending WhatsApp text message to ${phone}:`, err);
    return { success: false, error: err.message || 'Error de red' };
  }
}


// Helper para extraer el primer nombre
export function getFirstName(fullName: string): string {
  if (!fullName) return '';
  return fullName.trim().split(' ')[0];
}

// Retorna el enlace de la página pública de detalles de la reserva
function getPublicReservaLink(bookingId: string | number): string {
  return `${getSiteUrl()}/public/reserva/${bookingId}`;
}

// 1. Mensaje 1 - Solicitud de reservación recibida (solicitud_recibida)
export async function sendTemplate1_SolicitudRecibida(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  const buttonParams = [
    `VIEW_BOOKING_${booking.id}` // Payload para el botón Quick Reply
  ];

  return sendWhatsAppTemplate(phone, 'solicitud_recibida', params, buttonParams, booking.id, 'quick_reply');
}

// 2. Mensaje 2 - Último aviso para conservar la reservación (ultimo_aviso)
export async function sendTemplate2_UltimoAviso(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  const buttonParams = [
    `VIEW_BOOKING_${booking.id}` // Payload para el botón Quick Reply
  ];

  return sendWhatsAppTemplate(phone, 'ultimo_aviso', params, buttonParams, booking.id, 'quick_reply');
}

// 3. Mensaje 3 - Reservación confirmada (reservacion_confirmada)
export async function sendTemplate3_ReservacionConfirmada(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  const buttonParams = [
    `VIEW_BOOKING_${booking.id}` // Payload para el botón Quick Reply
  ];

  return sendWhatsAppTemplate(phone, 'reservacion_confirmada', params, buttonParams, booking.id, 'quick_reply');
}

// 4. Mensaje 4 - Disponibilidad liberada (disponibilidad_liberada)
export async function sendTemplate4_DisponibilidadLiberada(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre en el cuerpo del mensaje
  ];

  const buttonParams = [
    `VIEW_BOOKING_${booking.id}` // Payload para el botón Quick Reply
  ];

  return sendWhatsAppTemplate(phone, 'disponibilidad_liberada', params, buttonParams, booking.id, 'quick_reply');
}

// 5. Mensaje 5 - Preparación para tu llegada (preparacion_llegada)
export async function sendTemplate5_PreparacionLlegada(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  const buttonParams = [
    `VIEW_BOOKING_${booking.id}` // Payload para el botón Quick Reply
  ];

  return sendWhatsAppTemplate(phone, 'preparacion_llegada', params, buttonParams, booking.id, 'quick_reply');
}

// 6. Mensaje 6 - Bienvenida después del check-in (bienvenida_checkin)
export async function sendTemplate6_BienvenidaCheckin(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  const buttonParams = [
    `VIEW_BOOKING_${booking.id}` // Payload para el botón Quick Reply
  ];

  return sendWhatsAppTemplate(phone, 'bienvenida_checkin', params, buttonParams, booking.id, 'quick_reply');
}

// 7. Mensaje 7 - Seguimiento de satisfacción (seguimiento_satisfaccion)
export async function sendTemplate7_SeguimientoSatisfaccion(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  const buttonParams = [
    `VIEW_BOOKING_${booking.id}` // Payload para el botón Quick Reply
  ];

  return sendWhatsAppTemplate(phone, 'seguimiento_satisfaccion', params, buttonParams, booking.id, 'quick_reply');
}

// 8. Mensaje 8 - Día de salida (salida_checkout)
export async function sendTemplate8_SalidaCheckout(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'salida_checkout', params, undefined, booking.id);
}

// 9. Mensaje 9 - Comparte tu experiencia (comparte_experiencia)
export async function sendTemplate9_ComparteExperiencia(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'comparte_experiencia', params, undefined, booking.id);
}

// 10. Mensaje 10 - ¡Nos encantaría recibirte nuevamente! (recibimiento_nuevamente)
export async function sendTemplate10_RecibimientoNuevamente(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  const buttonParams = [
    `VIEW_BOOKING_${booking.id}` // Payload para el botón Quick Reply
  ];

  return sendWhatsAppTemplate(phone, 'recibimiento_nuevamente', params, buttonParams, booking.id, 'quick_reply');
}

// 11. Mensaje 11 - Confirmación de anticipo recibido (pago_anticipo_recibido)
export async function sendTemplate11_PagoAnticipoRecibido(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const total = Number(booking.price || booking.price_estimate || 0);
  const dep = Number(booking.deposit || 0);
  const bal = Math.max(0, total - dep);
  const lastPayment = Number(booking.last_payment_amount || dep || 0);

  const params = [
    getFirstName(booking.guest_name),      // {{1}} Nombre
    formatCurrency(lastPayment),           // {{2}} MontoAbonado
    formatCurrency(bal)                    // {{3}} SaldoPendiente
  ];

  const buttonParams = [
    `VIEW_BOOKING_${booking.id}` // Payload para el botón Quick Reply
  ];

  return sendWhatsAppTemplate(phone, 'pago_anticipo_recibido', params, buttonParams, booking.id, 'quick_reply');
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

  const templateName = lang === 'en' ? 'portal_huesped_link_en' : 'portal_huesped_link';
  const firstName = (guestName || '').trim() ? (guestName || '').trim().split(' ')[0] : 'Huésped';

  // Parámetro body: {{1}} = nombre del huésped
  const bodyParams = [firstName];

  // Parámetro botón URL: sufijo que se añade a la URL base del template en Meta
  // URL base en Meta: https://jaroje-app.vercel.app/public/reserva/
  // Sufijo: "<bookingId>?lang=es"
  const buttonParams = [`${bookingId}?lang=${lang}`];

  return sendWhatsAppTemplate(phone, templateName, bodyParams, buttonParams, bookingId, 'url');
}
