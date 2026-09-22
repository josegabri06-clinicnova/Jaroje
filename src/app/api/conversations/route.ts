import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppTextMessage, sendWhatsAppTemplate } from '@/lib/whatsapp';
import { handleInboundMessage } from '@/lib/inbound-handler';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Memory cache to prevent concurrent race conditions from Meta retries or n8n loops
const requestCache = new Map<string, number>();

function normalizePhone(rawPhone: string): string {
  let cleaned = String(rawPhone || '').replace(/\D/g, '');
  
  // Si tiene 10 dígitos (México sin lada), agregar '521'
  if (cleaned.length === 10) {
    cleaned = '521' + cleaned;
  }
  // Si tiene 12 dígitos y empieza con '52' pero no '521', agregar el '1' -> 521...
  if (cleaned.startsWith('52') && !cleaned.startsWith('521') && cleaned.length === 12) {
    cleaned = '521' + cleaned.substring(2);
  }
  // Si tiene 9 dígitos (España sin lada), agregar '34'
  if (cleaned.length === 9) {
    cleaned = '34' + cleaned;
  }
  
  return cleaned;
}

function cleanPhoneForMeta(phone: string): string {
  let cleaned = String(phone || '').replace(/\D/g, '');
  if (cleaned.startsWith('521') && cleaned.length === 13) {
    cleaned = '52' + cleaned.substring(3);
  }
  return cleaned;
}

function cleanPhoneForCompare(phoneStr: string): string {
  if (!phoneStr) return '';
  return phoneStr.replace(/\D/g, '');
}

function phonesMatch(phoneA: string, phoneB: string): boolean {
  const normA = normalizePhone(phoneA);
  const normB = normalizePhone(phoneB);
  if (!normA || !normB) return false;
  return normA === normB;
}


// ── GET: Obtener todas las conversaciones ─────────────────────────────────────
export async function GET() {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? [], total: data?.length ?? 0 });
}

// ── POST: Recibir desde n8n O acciones del gerente ───────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // ── MODO: Iniciar nuevo chat con plantilla ──────────────────────────────────
    if (body.action === 'start_new_chat') {
      const { guestName, guestPhone } = body;
      const cleanPhone = normalizePhone(guestPhone);

      // Enviar plantilla de WhatsApp mediante el driver unificado (YCloud o Meta)
      const waRes = await sendWhatsAppTemplate(
        cleanPhone,
        'presentacion_cliente_jaroje_2',
        [guestName || 'Cliente']
      );

      if (!waRes.success) {
        console.error("=== ERROR ENVIANDO PLANTILLA INICIAL WHATSAPP ===", waRes.error);
        return NextResponse.json({ success: false, error: waRes.error }, { status: 502 });
      }

      // Redactar el texto del mensaje enviado para guardarlo localmente
      const templateText = `¡Hola, ${guestName || 'Cliente'}! 🌴\n\nTe damos la más cálida bienvenida a Jaroje Condominios. Es un placer tenerte con nosotros y ser parte de tu estancia.\n\nAquí tienes información útil para iniciar tu estancia:\n• Wi-Fi: Red "Jaroje_Guest" (Sin contraseña).\n• Servicios: Piscina, terraza y estacionamiento incluidos.\n\nCualquier duda o solicitud especial, escríbenos directamente aquí. ¡Disfruta tu estancia!`;

      // Buscar si ya existe una conversación con este teléfono
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .eq('guest_phone', cleanPhone)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      const newMsg = {
        role_manager: templateText,
        role_guest:   null,
        role_bot:     null,
        timestamp:    new Date().toISOString(),
      };

      let newConvId = '';
      if (existing) {
        newConvId = existing.id;
        const newMessages = [...(existing.messages || []), newMsg];
        await supabase
          .from('conversations')
          .update({ 
            messages: newMessages, 
            timestamp: new Date().toISOString(),
            human_mode: true, // Forzar gerente activo al iniciar
            resolved: false
          })
          .eq('id', existing.id);
      } else {
        newConvId = `wa_${Date.now()}`;
        await supabase
          .from('conversations')
          .insert({
            id: newConvId,
            guest_name: guestName || cleanPhone,
            guest_phone: cleanPhone,
            timestamp: new Date().toISOString(),
            booking_created: false,
            resolved: false,
            human_mode: true,
            messages: [newMsg],
          });
      }

      return NextResponse.json({ success: true, conversationId: newConvId, message: 'Plantilla enviada correctamente.' });
    }

    // ── MODO: Respuesta manual del gerente ────────────────────────────────────
    if (body.action === 'send_manual_reply') {
      const { conversationId, message, guestPhone } = body;

      // Enviar mensaje real por WhatsApp mediante el driver unificado (YCloud o Meta)
      const waRes = await sendWhatsAppTextMessage(guestPhone, message);

      if (!waRes.success) {
        console.error("=== ERROR EN MANUAL REPLY WHATSAPP ===", waRes.error);
        return NextResponse.json({ success: false, error: waRes.error }, { status: 502 });
      }

      // Añadir el mensaje del gerente al array de mensajes en Supabase
      const { data: conv } = await supabase
        .from('conversations')
        .select('messages, timestamp')
        .eq('id', conversationId)
        .single();

      if (conv) {
        const newMessages = [
          ...(conv.messages || []),
          {
            role_manager: message,
            role_guest:   null,
            role_bot:     null,
            timestamp:    new Date().toISOString(),
          },
        ];
        const { error: replyErr } = await supabase
          .from('conversations')
          .update({ messages: newMessages, timestamp: new Date().toISOString() })
          .eq('id', conversationId);

        if (replyErr) {
          console.error("Supabase error updating manual reply:", replyErr);
          return NextResponse.json({ success: false, error: replyErr.message, details: replyErr }, { status: 500 });
        }
      }

      return NextResponse.json({ success: true, message: 'Mensaje enviado correctamente.' });
    }

    // ── MODO: Toggle Bot/Humano ────────────────────────────────────────────────
    if (body.action === 'toggle_mode') {
      const { error } = await supabase
        .from('conversations')
        .update({ human_mode: body.human_mode })
        .eq('id', body.conversationId);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 404 });
      }
      return NextResponse.json({ success: true, human_mode: body.human_mode });
    }

    // ── MODO: Toggle Archivar/Desarchivar ──────────────────────────────────────
    if (body.action === 'toggle_archive') {
      const { error } = await supabase
        .from('conversations')
        .update({ archived: body.archived })
        .eq('id', body.conversationId);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 404 });
      }
      return NextResponse.json({ success: true, archived: body.archived });
    }

    // ── MODO: Recibir mensaje de huésped (Webhook YCloud / n8n) ─────────────
    const result = await handleInboundMessage(body);
    return NextResponse.json(result);

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ── DELETE: Limpiar todas o una conversación específica ───────────────────────
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const { error } = await supabase.from('conversations').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Conversación eliminada.' });
    } else {
      const { error } = await supabase.from('conversations').delete().neq('id', '');
      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Todas las conversaciones eliminadas.' });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
