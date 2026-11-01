import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { handleInboundMessage } from '@/lib/inbound-handler';
import { normalizePhone } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

/**
 * GET: Handshake de verificación de Meta Cloud API Webhooks.
 * Meta envía hub.mode, hub.challenge y hub.verify_token para validar el endpoint.
 */
export async function GET(req: Request) {
  try {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
    if (!verifyToken) {
      console.error('[Meta Webhook GET] ❌ WHATSAPP_VERIFY_TOKEN no está configurado en el servidor.');
      return new Response('Server configuration error: missing verify token', { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = (searchParams.get('hub.verify_token') || '').trim();
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token) {
      const expectedHash = crypto.createHash('sha256').update(verifyToken).digest();
      const providedHash = crypto.createHash('sha256').update(token).digest();

      if (crypto.timingSafeEqual(expectedHash, providedHash)) {
        console.log('[Meta Webhook GET] ✅ Handshake de Meta aprobado con éxito.');
        return new Response(challenge, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }

    console.warn('[Meta Webhook GET] ❌ Token de verificación inválido recibido durante handshake.');
    return new Response('Forbidden', { status: 403 });
  } catch (err: any) {
    console.error('[Meta Webhook GET] Error en verificación:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * POST: Receptor de eventos en tiempo real de Meta WhatsApp Cloud API.
 * Valida la firma criptográfica X-Hub-Signature-256 de Meta para garantizar autenticidad.
 * Procesa mensajes entrantes, clics de botones quick_reply y URLs interactivas.
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
    const signatureHeader = req.headers.get('x-hub-signature-256') || '';

    // Si WHATSAPP_APP_SECRET está configurado, validar obligatoriamente la firma HMAC
    if (appSecret) {
      if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
        console.warn('[Meta Webhook POST] ❌ Rechazado: Cabecera x-hub-signature-256 ausente o con formato incorrecto.');
        return new Response('Unauthorized', { status: 401 });
      }

      const expectedSignature = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
      const expectedBuf = crypto.createHash('sha256').update(expectedSignature).digest();
      const providedBuf = crypto.createHash('sha256').update(signatureHeader).digest();

      if (!crypto.timingSafeEqual(expectedBuf, providedBuf)) {
        console.warn('[Meta Webhook POST] ❌ Rechazado: Firma HMAC de Meta no coincide.');
        return new Response('Unauthorized: Invalid webhook signature', { status: 401 });
      }
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      return NextResponse.json({ error: 'JSON malformado' }, { status: 400 });
    }

    // Confirmación inmediata a Meta (debe responder 200 rápido para evitar reintentos)
    if (payload.object !== 'whatsapp_business_account' && !payload.entry) {
      console.log('[Meta Webhook] Evento ignorado (no es de whatsapp_business_account)');
      return NextResponse.json({ status: 'ignored' });
    }

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const val = change.value;
        if (!val) continue;

        // 1. Mensajes entrantes del huésped
        if (Array.isArray(val.messages) && val.messages.length > 0) {
          const contacts = val.contacts || [];
          const contactName = contacts[0]?.profile?.name || '';

          for (const msg of val.messages) {
            const rawPhone = msg.from;
            const cleanPhone = normalizePhone(rawPhone);
            const msgType = msg.type;
            const timestamp = msg.timestamp
              ? new Date(Number(msg.timestamp) * 1000).toISOString()
              : new Date().toISOString();

            let messageText = '';
            let buttonPayload = '';

            if (msgType === 'text' && msg.text?.body) {
              messageText = msg.text.body;
            } else if (msgType === 'interactive') {
              if (msg.interactive?.button_reply) {
                messageText = msg.interactive.button_reply.title || '';
                buttonPayload = msg.interactive.button_reply.id || '';
              } else if (msg.interactive?.list_reply) {
                messageText = msg.interactive.list_reply.title || '';
                buttonPayload = msg.interactive.list_reply.id || '';
              }
            } else if (msgType === 'button') {
              messageText = msg.button?.text || '';
              buttonPayload = msg.button?.payload || '';
            } else if (msgType === 'image') {
              messageText = '[Imagen recibida]';
            } else if (msgType === 'document') {
              messageText = '[Documento recibido]';
            } else {
              messageText = `[Mensaje ${msgType || 'recibido'}]`;
            }

            console.log(`[Meta Webhook POST] 📩 Mensaje entrante de ${cleanPhone} (${contactName}): "${messageText}" (payload: "${buttonPayload}")`);

            // Procesar con el motor central de inbound
            try {
              const res = await handleInboundMessage({
                guest_phone: cleanPhone,
                guest_name: contactName,
                message_from_guest: messageText,
                button_payload: buttonPayload,
                timestamp
              });
              console.log(`[Meta Webhook POST] Resultado procesamiento para ${cleanPhone}:`, res);
            } catch (procErr) {
              console.error(`[Meta Webhook POST] Error procesando mensaje de ${cleanPhone}:`, procErr);
            }
          }
        }

        // 2. Estados de entrega (sent, delivered, read, failed)
        if (Array.isArray(val.statuses) && val.statuses.length > 0) {
          for (const st of val.statuses) {
            if (st.status === 'failed') {
              console.error(`[Meta Webhook POST] ⚠️ Fallo de entrega a ${st.recipient_id}:`, JSON.stringify(st.errors || []));
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Meta Webhook POST] Error fatal procesando webhook:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
