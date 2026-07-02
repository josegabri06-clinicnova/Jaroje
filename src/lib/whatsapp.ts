import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

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
  parameters: string[]
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
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'es_MX' },
        components: [
          {
            type: 'body',
            parameters: parameters.map(p => ({
              type: 'text',
              text: p || '—'
            }))
          }
        ]
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
function getFirstName(fullName: string): string {
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
    getFirstName(booking.guest_name), // {{1}} Nombre
    getPublicReservaLink(booking.id)  // {{2}} LinkPortal
  ];

  return sendWhatsAppTemplate(phone, 'solicitud_recibida', params);
}

// 2. Mensaje 2 - Último aviso para conservar la reservación (ultimo_aviso)
export async function sendTemplate2_UltimoAviso(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name), // {{1}} Nombre
    getPublicReservaLink(booking.id)  // {{2}} LinkPortal
  ];

  return sendWhatsAppTemplate(phone, 'ultimo_aviso', params);
}

// 3. Mensaje 3 - Reservación confirmada (reservacion_confirmada)
export async function sendTemplate3_ReservacionConfirmada(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const guestsCount = String(Number(booking.num_adult || 1) + Number(booking.num_child || 0));

  const params = [
    getFirstName(booking.guest_name), // {{1}} Nombre
    getPublicReservaLink(booking.id), // {{2}} LinkPortal
    guestsCount                       // {{3}} Huéspedes
  ];

  return sendWhatsAppTemplate(phone, 'reservacion_confirmada', params);
}

// 4. Mensaje 4 - Disponibilidad liberada (disponibilidad_liberada)
export async function sendTemplate4_DisponibilidadLiberada(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name), // {{1}} Nombre
    getPublicReservaLink(booking.id)  // {{2}} LinkPortal
  ];

  return sendWhatsAppTemplate(phone, 'disponibilidad_liberada', params);
}

// 5. Mensaje 5 - Preparación para tu llegada (preparacion_llegada)
export async function sendTemplate5_PreparacionLlegada(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const guestsCount = String(Number(booking.num_adult || 1) + Number(booking.num_child || 0));

  const params = [
    getFirstName(booking.guest_name), // {{1}} Nombre
    getPublicReservaLink(booking.id), // {{2}} LinkPortal
    guestsCount                       // {{3}} Huéspedes
  ];

  return sendWhatsAppTemplate(phone, 'preparacion_llegada', params);
}

// 6. Mensaje 6 - Bienvenida después del check-in (bienvenida_checkin)
export async function sendTemplate6_BienvenidaCheckin(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name), // {{1}} Nombre
    getPublicReservaLink(booking.id)  // {{2}} LinkPortal
  ];

  return sendWhatsAppTemplate(phone, 'bienvenida_checkin', params);
}

// 7. Mensaje 7 - Seguimiento de satisfacción (seguimiento_satisfaccion)
export async function sendTemplate7_SeguimientoSatisfaccion(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name), // {{1}} Nombre
    getPublicReservaLink(booking.id)  // {{2}} LinkPortal
  ];

  return sendWhatsAppTemplate(phone, 'seguimiento_satisfaccion', params);
}

// 8. Mensaje 8 - Día de salida (salida_checkout)
export async function sendTemplate8_SalidaCheckout(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'salida_checkout', params);
}

// 9. Mensaje 9 - Comparte tu experiencia (comparte_experiencia)
export async function sendTemplate9_ComparteExperiencia(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'comparte_experiencia', params);
}

// 10. Mensaje 10 - ¡Nos encantaría recibirte nuevamente! (recibimiento_nuevamente)
export async function sendTemplate10_RecibimientoNuevamente(booking: any) {
  const phone = booking.phone || booking.mobile || booking.guest_phone;
  if (!phone) return { success: false, error: 'Sin teléfono' };

  const params = [
    getFirstName(booking.guest_name) // {{1}} Nombre
  ];

  return sendWhatsAppTemplate(phone, 'recibimiento_nuevamente', params);
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
    formatCurrency(bal),                   // {{3}} SaldoPendiente
    getPublicReservaLink(booking.id)       // {{4}} LinkPortal
  ];

  return sendWhatsAppTemplate(phone, 'pago_anticipo_recibido', params);
}
