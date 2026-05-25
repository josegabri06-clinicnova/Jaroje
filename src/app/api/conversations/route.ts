import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

    // ── MODO: Respuesta manual del gerente ────────────────────────────────────
    if (body.action === 'send_manual_reply') {
      const { conversationId, message, guestPhone } = body;
      const WHATSAPP_TOKEN    = process.env.WHATSAPP_TOKEN;
      const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

      if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
        return NextResponse.json({
          success: false,
          error: 'Faltan WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en las variables de entorno.'
        }, { status: 500 });
      }

      // Enviar mensaje real por WhatsApp Cloud API
      const waRes = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: guestPhone.replace(/\D/g, ''),
          type: 'text',
          text: { body: message },
        }),
      });

      if (!waRes.ok) {
        const errBody = await waRes.json();
        return NextResponse.json({ success: false, error: errBody }, { status: 502 });
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

    // ── MODO: Recibir mensaje desde n8n ───────────────────────────────────────
    const phone     = body.guest_phone || 'desconocido';
    const timestamp = body.timestamp   || new Date().toISOString();

    // Buscar conversación activa del mismo teléfono en las últimas 3 horas
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('guest_phone', phone)
      .gte('timestamp', threeHoursAgo)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    const newMessage = {
      role_guest:   body.message_from_guest || null,
      role_bot:     body.bot_response       || null,
      role_manager: null,
      timestamp,
    };

    if (existing) {
      // Actualizar conversación existente
      const updatedMessages = [...(existing.messages || []), newMessage];
      const { error: updateErr } = await supabase
        .from('conversations')
        .update({
          messages:        updatedMessages,
          timestamp,
          booking_created: body.booking_created ?? existing.booking_created,
          resolved:        body.resolved        ?? existing.resolved,
        })
        .eq('id', existing.id);

      if (updateErr) {
        console.error("Supabase error updating conversation:", updateErr);
        return NextResponse.json({ success: false, error: updateErr.message, details: updateErr }, { status: 500 });
      }
    } else {
      // Crear nueva conversación
      const { error: insertErr } = await supabase
        .from('conversations')
        .insert({
          id:              `wa_${Date.now()}`,
          guest_name:      body.guest_name || phone,
          guest_phone:     phone,
          timestamp,
          booking_created: body.booking_created || false,
          resolved:        body.resolved        || false,
          human_mode:      false,
          messages:        [newMessage],
        });

      if (insertErr) {
        console.error("Supabase error inserting new conversation:", insertErr);
        return NextResponse.json({ success: false, error: insertErr.message, details: insertErr }, { status: 500 });
      }
    }

    // Contar total
    const { count } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success:             true,
      message:             'Conversación registrada.',
      total_conversations: count ?? 0,
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ── DELETE: Limpiar todas las conversaciones ──────────────────────────────────
export async function DELETE() {
  const { error } = await supabase.from('conversations').delete().neq('id', '');
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: 'Conversaciones eliminadas.' });
}
