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

// Normaliza y limpia el número de teléfono para Meta Cloud API
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    cleaned = '52' + cleaned;
  } else if (cleaned.startsWith('521') && cleaned.length === 13) {
    cleaned = '52' + cleaned.slice(3);
  } else if (cleaned.length === 9) {
    cleaned = '34' + cleaned;
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
  bookingId?: string | number
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

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components
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
      console.error(`Meta API error template ${templateName}:`, resBody);
      return { success: false, error: resBody.error?.message || 'Error de la API de Meta' };
    }

    // Registrar el envío de plantilla en la tabla 'conversations'
    try {
      let summaryText = `[Plantilla: ${templateName}]`;
      if (templateName === 'solicitud_recibida') {
        summaryText = `📥 Solicitud de reservación recibida (Instrucciones de pago enviadas).`;
      } else if (templateName === 'reservacion_confirmada') {
        summaryText = `✅ Reservación confirmada. ¡Tu estancia está lista!`;
      } else if (templateName === 'pago_anticipo_recibido') {
        summaryText = `💰 Anticipo recibido registrado con éxito.`;
      } else if (templateName === 'ultimo_aviso') {
        summaryText = `⏳ Último aviso para confirmar tu reservación.`;
      } else if (templateName === 'preparacion_llegada') {
        summaryText = `🔑 Instrucciones de llegada e indicaciones del condominio enviadas.`;
      } else if (templateName === 'bienvenida_checkin') {
        summaryText = `👋 ¡Bienvenido! Check-in realizado.`;
      } else if (templateName === 'seguimiento_satisfaccion') {
        summaryText = `⭐ Seguimiento de satisfacción y asistencia.`;
      } else if (templateName === 'salida_checkout') {
        summaryText = `🚪 Instrucciones de salida y checkout.`;
      } else if (templateName === 'comparte_experiencia') {
        summaryText = `💬 Invitación a compartir experiencia y reseña en Google.`;
      } else if (templateName === 'recibimiento_nuevamente') {
        summaryText = `🔄 Invitación para recibirte nuevamente en el futuro.`;
      }

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
      to: cleanedPhone,
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
    `public/reserva/${booking.id}` // {{1}} Enlace dinámico para el botón
  ];

  return sendWhatsAppTemplate(phone, 'solicitud_recibida', params, buttonParams, booking.id);
}

// 2. Mensaje 2 - Último aviso para conservar la reservación (ultimo_aviso)
export async function sendTemplate2_UltimoAviso(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  const buttonParams = [
    `public/reserva/${booking.id}` // {{1}} Enlace dinámico para el botón
  ];

  return sendWhatsAppTemplate(phone, 'ultimo_aviso', params, buttonParams, booking.id);
}

// 3. Mensaje 3 - Reservación confirmada (reservacion_confirmada)
export async function sendTemplate3_ReservacionConfirmada(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const guestsCount = String(Number(booking.num_adult || 1) + Number(booking.num_child || 0));

  const params = [
    getFirstName(booking.guest_name), // {{1}} Nombre
    guestsCount                       // {{2}} Huéspedes
  ];

  const buttonParams = [
    `public/reserva/${booking.id}` // {{1}} Enlace dinámico para el botón
  ];

  return sendWhatsAppTemplate(phone, 'reservacion_confirmada', params, buttonParams, booking.id);
}

// 4. Mensaje 4 - Disponibilidad liberada (disponibilidad_liberada)
export async function sendTemplate4_DisponibilidadLiberada(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre en el cuerpo del mensaje
  ];

  const buttonParams = [
    `public/reserva/${booking.id}` // {{1}} Enlace dinámico para el botón
  ];

  return sendWhatsAppTemplate(phone, 'disponibilidad_liberada', params, buttonParams, booking.id);
}

// 5. Mensaje 5 - Preparación para tu llegada (preparacion_llegada)
export async function sendTemplate5_PreparacionLlegada(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const guestsCount = String(Number(booking.num_adult || 1) + Number(booking.num_child || 0));

  const params = [
    getFirstName(booking.guest_name), // {{1}} Nombre
    guestsCount                       // {{2}} Huéspedes
  ];

  const buttonParams = [
    `public/reserva/${booking.id}` // {{1}} Enlace dinámico para el botón
  ];

  return sendWhatsAppTemplate(phone, 'preparacion_llegada', params, buttonParams, booking.id);
}

// 6. Mensaje 6 - Bienvenida después del check-in (bienvenida_checkin)
export async function sendTemplate6_BienvenidaCheckin(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  const buttonParams = [
    `public/reserva/${booking.id}` // {{1}} Enlace dinámico para el botón
  ];

  return sendWhatsAppTemplate(phone, 'bienvenida_checkin', params, buttonParams, booking.id);
}

// 7. Mensaje 7 - Seguimiento de satisfacción (seguimiento_satisfaccion)
export async function sendTemplate7_SeguimientoSatisfaccion(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  const buttonParams = [
    `public/reserva/${booking.id}` // {{1}} Enlace dinámico para el botón
  ];

  return sendWhatsAppTemplate(phone, 'seguimiento_satisfaccion', params, buttonParams, booking.id);
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

  return sendWhatsAppTemplate(phone, 'recibimiento_nuevamente', params, undefined, booking.id);
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
    `public/reserva/${booking.id}` // {{1}} Enlace dinámico para el botón
  ];

  return sendWhatsAppTemplate(phone, 'pago_anticipo_recibido', params, buttonParams, booking.id);
}
