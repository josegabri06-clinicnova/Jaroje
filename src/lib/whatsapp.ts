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
  buttonType?: 'url' | 'quick_reply',
  bypassPause: boolean = false
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

    // Verificar si los envíos automáticos de WhatsApp están deshabilitados en la base de datos (solo si no es un envío manual)
    if (!bypassPause) {
      try {
        const { data: disableSetting } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'disable_automatic_whatsapp')
          .maybeSingle();

        if (disableSetting && (disableSetting.value === true || disableSetting.value === 'true')) {
          console.log(`[WhatsApp API] Envíos automáticos pausados por configuración (disable_automatic_whatsapp: true)`);
          return { success: true, data: { status: 'paused', message: 'WhatsApp automatizado pausado por administrador.' } };
        }
      } catch (e) {
        console.error("Error al consultar configuración de pausa de WhatsApp:", e);
      }
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

    const urlTemplates = [
      'solicitud_recibida',
      'ultimo_aviso',
      'reservacion_confirmada',
      'preparacion_llegada',
      'bienvenida_checkin',
      'seguimiento_satisfaccion',
      'recibimiento_nuevamente',
      'pago_anticipo_recibido',
      'portal_huesped_link',
      'portal_huesped_link_en'
    ];

    let resolvedButtonType = buttonType;
    let finalButtonParams = buttonParameters;

    if (urlTemplates.includes(templateName)) {
      resolvedButtonType = 'url';
      if (bookingId) {
        finalButtonParams = [`${bookingId}?lang=${detectedLang}`];
      }
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
            return `📋 Solicitud de reservación recibida (24 h para confirmar)\n\nHola, ${name}.\n\n¡Gracias por elegir Condominios Jaroje para tus próximas vacaciones en Huatulco! 🌴\n\nEn tu "Portal del Huésped" encontrarás toda la información sobre tu reservación, incluyendo las fotos y la descripción de tu alojamiento, los datos de tu reservación, las políticas del hotel y de cancelación, así como las opciones de pago, si las necesitas.\n\n👇 Portal del Huésped\n\n[Botón: Portal del Huésped] [Botón: Hablar con nosotros]`;
          case 'ultimo_aviso':
            return `⏳ Último recordatorio (queda 1 hora para confirmar tu reservación)\n\nHola, ${name}.\n\nSolo falta realizar tu depósito para confirmar tu reservación. Recuerda que el plazo para recibirlo vence en aproximadamente 1 hora.\n\nEn "Realizar depósito" encontrarás las opciones de pago disponibles. Si ya realizaste tu depósito, por favor envíanos tu comprobante.\n\n👇 Realizar Depósito\n\n[Botón: Realizar depósito] [Botón: Hablar con nosotros]`;
          case 'reservacion_confirmada':
            return `🎉 ¡Tu reservación está confirmada!\n\n¡Excelente, ${name}!\n\nNos da mucho gusto confirmar que tu reservación ya quedó lista. Estamos listos para recibirte.\n\nEn "Portal del Huésped" podrás consultar cualquier actualización de tu reservación en tiempo real, así como las fotos, la descripción y los servicios de tu alojamiento.\n\n👥 ¿Cambió el número de huéspedes? Actualízalo desde "Mi reservación" antes de tu llegada para evitar cargos adicionales al momento del check-in.\n\n[Botón: Portal del Huésped] [Botón: Cómo llegar] [Botón: Hablar con nosotros]`;
          case 'disponibilidad_liberada':
            return `😔 Disponibilidad liberada\n\nHola, ${name}.\n\nLamentamos informarte que, al no recibir el depósito dentro del plazo indicado, la disponibilidad de tu alojamiento fue liberada.\n\nSi aún deseas hospedarte con nosotros, presiona “Verificar disponibilidad” para consultar si todavía contamos con alojamiento disponible para las fechas de tu viaje y, en caso de haber disponibilidad, realizar una nueva reservación.\n\n👇 Verificar disponibilidad\n\n[Botón: Verificar disponibilidad] [Botón: Hablar con nosotros]`;
          case 'preparacion_llegada':
            return `🚗 Todo listo para tu llegada\n\nHola, ${name}.\n\n¡Ya falta muy poco para recibirte en Condominios Jaroje! Queremos que tu llegada sea lo más cómoda posible.\n\n👥 ¿Cambió el número de huéspedes? Actualízalo desde "Mi reservación" antes de tu llegada para evitar cargos adicionales al momento del check-in.\n\nEn "Mi reservación" encontrarás el código del portón, la ubicación, las indicaciones para llegar, las fotos, la descripción y los servicios de tu alojamiento, así como todo lo necesario para preparar tu llegada.\n\n¿Llegarás después de las 8:00 p.m.? Avísanos con anticipación para recibirte.\n\n¡Te deseamos un excelente viaje!\n\n[Botón: Mi reservación] [Botón: Cómo llegar] [Botón: WiFi y Claves]`;
          case 'bienvenida_checkin':
            return `🏡 ¡Bienvenido a Condominios Jaroje!\n\n¡Qué gusto recibirte, ${name}!\n\nEsperamos que hayas tenido un excelente viaje. Deseamos que disfrutes una excelente estancia y que te sientas como en casa.\n\nEn "Mi estancia" encontrarás el código del portón, la red WiFi y su contraseña, las fotos, la descripción y los servicios de tu alojamiento, así como toda la información necesaria para disfrutar tu estancia.\n\nSi durante tu estancia necesitas reportar algún detalle de mantenimiento podrás hacerlo desde "Mi estancia".\n\nDeseamos que disfrutes tu estancia. Si necesitas cualquier cosa, aquí estamos para ayudarte.\n\n👇 Mi estancia\n\n[Botón: Mi estancia] [Botón: WiFi y Claves]`;
          case 'seguimiento_satisfaccion':
            return `😊 ¿Cómo va tu estancia?\n\nBuenos días, ${name}.\n\nQueremos asegurarnos de que todo esté transcurriendo como esperabas.\n\nSi hay algo que podamos hacer para que disfrutes aún más tu estancia, con gusto estaremos para servirte.\n\n👇 Mi estancia\n\n[Botón: Mi estancia] [Botón: WiFi y Claves]`;
          case 'salida_checkout':
            return `🚪 Check-out 12:00 p.m.\n\nMuy buenos días, ${name}.\n\nHoy finaliza tu estancia con nosotros. Muchas gracias por habernos elegido y esperamos que hayas disfrutado tu estancia.\n\nSi necesitas resguardar tu equipaje después del check-out o requieres apoyo con tu salida, con gusto estaremos para ayudarte.\n\nSi hubo algo que no cumplió tus expectativas, por favor háznoslo saber para poder ayudarte.\n\nSi consideras que tu experiencia fue de ⭐⭐⭐⭐⭐, nos encantará que compartas tu opinión.\n\n👇 Escribir reseña\n\n[Botón: Escribir reseña] [Botón: Hablar con nosotros]`;
          case 'comparte_experiencia':
            return `⭐ ¿Cómo estuvo tu experiencia?\n\nHola, ${name}.\n\nEsperamos que hayas llegado con bien a casa y que conserves un excelente recuerdo de tu estancia con nosotros.\n\nSi hubo algo que no cumplió tus expectativas, por favor háznoslo saber para poder ayudarte.\n\nSi tu experiencia fue de ⭐⭐⭐⭐⭐, nos haría muy feliz que compartieras tu reseña. Tu reseña ayuda a otros viajeros a elegirnos con mayor confianza y nos motiva a seguir mejorando.\n\n👇 Calificar alojamiento\n\n[Botón: Califica tu alojamiento] [Botón: Hablar con nosotros]`;
          case 'recibimiento_nuevamente':
            return `🌴 ¡Nos encantará recibirte nuevamente!\n\nHola de nuevo, ${name}.\n\nHoy nos acordamos de tu estancia con nosotros y quisimos saludarte. Esperamos que guardes un excelente recuerdo de Huatulco y de tu estancia con nosotros.\n\nSi estás pensando en regresar a Huatulco, será un placer recibirte nuevamente. En "Verificar disponibilidad" podrás consultar disponibilidad y comenzar una nueva reservación.\n\n👇 Verificar disponibilidad\n\n[Botón: Verificar disponibilidad] [Botón: Hablar con nosotros]`;
          case 'pago_anticipo_recibido':
            const abonado = params[1] || '$0.00';
            const saldo = params[2] || '$0.00';
            return `¡Hola ${name}!\n\nHemos registrado con éxito tu pago por la cantidad de *${abonado} MXN*.\n\nTu saldo pendiente actual es de *${saldo} MXN*.\n\n👇 *Portal del Huésped*\n\n[Botón: Portal del Huésped]`;
          case 'portal_huesped_link':
            return `Hola ${name}, aquí tienes acceso a tu reservación en tiempo real. Desde tu portal puedes ver el estado de tu habitación, reglamento, datos de WiFi y registrar pagos adicionales.✅\n\n👇 *Portal del Huésped*\n\n[Botón: Portal del Huésped]`;
          case 'portal_huesped_link_en':
            return `Hello ${name}, here is your access to your real-time booking details. From your portal you can view your room status, guidelines, WiFi info, and record additional payments.✅\n\n👇 *Guest Portal*\n\n[Button: Guest Portal]`;
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
export async function sendTemplate1_SolicitudRecibida(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'solicitud_recibida', params, undefined, booking.id, 'url', bypassPause);
}

// 2. Mensaje 2 - Último aviso para conservar la reservación (ultimo_aviso)
export async function sendTemplate2_UltimoAviso(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'ultimo_aviso', params, undefined, booking.id, 'url', bypassPause);
}

// Mensaje de Comprobante Rechazado con motivo personalizado de Roland y botones interactivos (Portal + Contacto)
export async function sendTemplate_ComprobanteRechazado(booking: any, reason?: string, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const rejectionReason = reason || booking.notes || 'El comprobante no pudo ser verificado. Por favor sube una imagen legible o contáctanos.';

  const params = [
    getFirstName(booking.guest_name), // {{1}} Nombre
    String(booking.id),               // {{2}} ID Reserva
    rejectionReason                   // {{3}} Motivo del rechazo
  ];

  // Intenta enviar con plantilla específica 'comprobante_rechazado' o 'ultimo_aviso'
  return sendWhatsAppTemplate(phone, 'comprobante_rechazado', params, undefined, booking.id, 'url', bypassPause);
}

// 3. Mensaje 3 - Reservación confirmada (reservacion_confirmada)
export async function sendTemplate3_ReservacionConfirmada(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'reservacion_confirmada', params, undefined, booking.id, 'url', bypassPause);
}

// 4. Mensaje 4 - Disponibilidad liberada (disponibilidad_liberada)
export async function sendTemplate4_DisponibilidadLiberada(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre en el cuerpo del mensaje
  ];

  return sendWhatsAppTemplate(phone, 'disponibilidad_liberada', params, undefined, booking.id, undefined, bypassPause);
}

// 5. Mensaje 5 - Preparación para tu llegada (preparacion_llegada)
export async function sendTemplate5_PreparacionLlegada(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'preparacion_llegada', params, undefined, booking.id, 'url', bypassPause);
}

// 6. Mensaje 6 - Bienvenida después del check-in (bienvenida_checkin)
export async function sendTemplate6_BienvenidaCheckin(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'bienvenida_checkin', params, undefined, booking.id, 'url', bypassPause);
}

// 7. Mensaje 7 - Seguimiento de satisfacción (seguimiento_satisfaccion)
export async function sendTemplate7_SeguimientoSatisfaccion(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'seguimiento_satisfaccion', params, undefined, booking.id, 'url', bypassPause);
}

// 8. Mensaje 8 - Día de salida (salida_checkout)
export async function sendTemplate8_SalidaCheckout(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'salida_checkout', params, undefined, booking.id, undefined, bypassPause);
}

// 9. Mensaje 9 - Comparte tu experiencia (comparte_experiencia)
export async function sendTemplate9_ComparteExperiencia(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'comparte_experiencia', params, undefined, booking.id, undefined, bypassPause);
}

// 10. Mensaje 10 - ¡Nos encantaría recibirte nuevamente! (recibimiento_nuevamente)
export async function sendTemplate10_RecibimientoNuevamente(booking: any, bypassPause: boolean = false) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'recibimiento_nuevamente', params, undefined, booking.id, undefined, bypassPause);
}

// 11. Mensaje 11 - Confirmación de anticipo recibido (pago_anticipo_recibido)
export async function sendTemplate11_PagoAnticipoRecibido(booking: any, bypassPause: boolean = false) {
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

  return sendWhatsAppTemplate(phone, 'pago_anticipo_recibido', params, undefined, booking.id, 'url', bypassPause);
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
