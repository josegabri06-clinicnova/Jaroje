import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { handleInboundMessage } from '@/lib/inbound-handler';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function normalizePhone(rawPhone: string): string {
  let cleaned = String(rawPhone || '').replace(/\D/g, '');
  if (cleaned.length === 10) {
    cleaned = '521' + cleaned;
  }
  if (cleaned.startsWith('52') && !cleaned.startsWith('521') && cleaned.length === 12) {
    cleaned = '521' + cleaned.substring(2);
  }
  if (cleaned.length === 9) {
    cleaned = '34' + cleaned;
  }
  return cleaned;
}

// GET para verificación de webhook de YCloud si lo solicita
export async function GET() {
  return NextResponse.json({ status: 'ok', provider: 'ycloud' });
}

// POST para recibir eventos en tiempo real de YCloud
export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const eventType = String(payload.type || '');

    // ── 1. MENSAJE ENTRANTE DEL HUÉSPED (whatsapp.inbound_message.received / whatsapp.inbound_message) ─
    const isInbound = 
      eventType === 'whatsapp.inbound_message.received' ||
      eventType === 'whatsapp.inbound_message' ||
      eventType.includes('inbound_message') ||
      Boolean(payload.whatsappInboundMessage);

    if (isInbound && (payload.whatsappInboundMessage || payload.whatsapp_inbound_message || payload.message || payload.data)) {
      const msg = payload.whatsappInboundMessage || payload.whatsapp_inbound_message || payload.message || payload.data;
      const rawPhone = msg.from || msg.senderPhone || payload.from;
      const cleanPhone = normalizePhone(rawPhone);
      const senderName = msg.senderName || msg.fromName || cleanPhone;

      let guestText = '';
      let buttonPayload = '';

      if (msg.type === 'text' && msg.text?.body) {
        guestText = msg.text.body;
      } else if (msg.type === 'button' && msg.button) {
        guestText = msg.button.text || '';
        buttonPayload = msg.button.payload || '';
      } else if (msg.type === 'interactive' && msg.interactive) {
        if (msg.interactive.button_reply) {
          guestText = msg.interactive.button_reply.title || '';
          buttonPayload = msg.interactive.button_reply.id || '';
        } else if (msg.interactive.list_reply) {
          guestText = msg.interactive.list_reply.title || '';
          buttonPayload = msg.interactive.list_reply.id || '';
        }
      } else if (msg.type === 'image') {
        guestText = '[Imagen recibida]';
      } else if (msg.type === 'document') {
        guestText = '[Documento recibido]';
      } else if (typeof msg.text === 'string') {
        guestText = msg.text;
      } else {
        guestText = msg.body || msg.text?.body || `[Mensaje ${msg.type || 'recibido'}]`;
      }

      // Procesar el mensaje entrante directamente de forma síncrona
      try {
        const result = await handleInboundMessage({
          guest_phone: cleanPhone,
          guest_name: senderName,
          message_from_guest: guestText,
          button_payload: buttonPayload,
          timestamp: msg.sendTime || msg.createTime || new Date().toISOString()
        });
        console.log(`[YCloud Webhook] ✅ Mensaje procesado para ${cleanPhone}:`, result);
      } catch (convErr) {
        console.error("[YCloud Webhook] Error procesando mensaje entrante:", convErr);
      }

      return NextResponse.json({ success: true, event: 'inbound_message_processed' });
    }

    // ── 2. ACTUALIZACIÓN DE ESTADO DE ENTREGA (delivered, read, failed) ───────
    const isStatusUpdate = 
      eventType === 'whatsapp.message.updated' ||
      eventType.includes('message.updated') ||
      Boolean(payload.whatsappMessage);

    if (isStatusUpdate && (payload.whatsappMessage || payload.message)) {
      const waMsg = payload.whatsappMessage || payload.message;
      const status = waMsg.status; // 'sent' | 'delivered' | 'read' | 'failed'
      const recipientPhone = normalizePhone(waMsg.to || waMsg.recipientPhone);

      if (recipientPhone && status) {
        try {
          await supabase
            .from('whatsapp_logs')
            .update({ status })
            .eq('phone', recipientPhone)
            .order('sent_at', { ascending: false })
            .limit(1);
        } catch (statusErr) {
          console.error("[YCloud Webhook] Error actualizando whatsapp_logs:", statusErr);
        }

        // Si la entrega falló por parte de Meta/WhatsApp, auditar el motivo exacto en employee_logs
        if (status === 'failed') {
          try {
            const errCode = String(waMsg.errorCode || waMsg.whatsappApiError?.code || '');
            const errMsg = String(waMsg.errorMessage || waMsg.whatsappApiError?.message || waMsg.whatsappApiError?.error_data?.details || '');
            const templateName = waMsg.template?.name || 'plantilla';

            let explanation = `Fallo en entrega de WhatsApp al teléfono ${recipientPhone}.`;
            if (errCode === '131049') {
              explanation = `⚠️ Meta WhatsApp rechazó la entrega de '${templateName}' al ${recipientPhone} (Error 131049: Límite de frecuencia de Marketing por Meta. Recomendación: categorizar la plantilla como UTILITY).`;
            } else if (errCode === '100') {
              explanation = `⚠️ Meta WhatsApp bloqueó el envío al ${recipientPhone} (Error 100: No se puede enviar un mensaje al mismo número de WhatsApp Business del hotel).`;
            } else if (errMsg) {
              explanation = `⚠️ Meta WhatsApp no pudo entregar '${templateName}' al ${recipientPhone}: ${errMsg} (Código ${errCode})`;
            }

            await supabase.from('employee_logs').insert([{
              employee_num: '000',
              employee_name: 'WhatsApp Bot',
              department: 'whatsapp',
              module: 'whatsapp',
              action: 'whatsapp_envio_fallido',
              room: recipientPhone,
              details: JSON.stringify({
                text: explanation,
                phone: recipientPhone,
                errorCode: errCode,
                errorMessage: errMsg,
                template: templateName
              }),
              created_at: new Date().toISOString()
            }]);
          } catch (auditErr) {
            console.error("[YCloud Webhook] Error registrando auditoría de fallo:", auditErr);
          }
        }
      }

      return NextResponse.json({ success: true, event: 'status_updated' });
    }

    return NextResponse.json({ success: true, event: 'ignored', type: eventType });
  } catch (err: any) {
    console.error("[YCloud Webhook] Error procesando evento:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
