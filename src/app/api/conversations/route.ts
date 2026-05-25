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
    // ── MODO: Iniciar nuevo chat con plantilla ──────────────────────────────────
    if (body.action === 'start_new_chat') {
      const { guestName, guestPhone } = body;
      const WHATSAPP_TOKEN    = process.env.WHATSAPP_TOKEN;
      const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

      if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
        return NextResponse.json({
          success: false,
          error: 'Faltan WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en las variables de entorno.'
        }, { status: 500 });
      }

      let cleanPhone = guestPhone.replace(/\D/g, '');
      // Si el número tiene exactamente 10 dígitos (estándar de México), autocompletar lada internacional '52'
      if (cleanPhone.length === 10) {
        cleanPhone = '52' + cleanPhone;
      }

      // Enviar plantilla de WhatsApp
      const waRes = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'template',
          template: {
            name: 'presentacion_cliente_jaroje_2',
            language: { code: 'es_MX' },
            components: [
              {
                type: 'header',
                parameters: [
                  {
                    type: 'image',
                    image: {
                      link: process.env.WHATSAPP_TEMPLATE_IMAGE_URL || 'https://cdn.pixabay.com/photo/2016/11/18/16/04/swimming-pool-1835520_1280.jpg'
                    }
                  }
                ]
              },
              {
                type: 'body',
                parameters: [
                  {
                    type: 'text',
                    text: guestName || 'Cliente'
                  }
                ]
              }
            ]
          }
        }),
      });

      if (!waRes.ok) {
        const errBody = await waRes.json();
        return NextResponse.json({ success: false, error: errBody }, { status: 502 });
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

    // ── MODO: Recibir mensaje desde n8n ───────────────────────────────────────
    const phone     = (body.guest_phone || 'desconocido').replace(/\D/g, '');
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

    // ── Interceptar si el cliente hizo clic en el botón de "Hablar con Administrador" ──
    let forceHuman = existing ? existing.human_mode : false;
    let finalBotResponse = body.bot_response || null;

    if (body.message_from_guest && body.message_from_guest.toLowerCase().includes('administrador')) {
      forceHuman = true;
      finalBotResponse = "Entendido. He pausado el asistente virtual. En un momento, un agente de nuestra recepción continuará la conversación contigo por este medio.";

      // Enviar respuesta automática de pausa a WhatsApp
      const WHATSAPP_TOKEN    = process.env.WHATSAPP_TOKEN;
      const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
      if (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
        try {
          await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: phone,
              type: 'text',
              text: { body: finalBotResponse },
            }),
          });
        } catch (e) {
          console.error("Error sending automatic bot pause message to WhatsApp:", e);
        }
      }
    }

    const newMessage = {
      role_guest:   body.message_from_guest || null,
      role_bot:     finalBotResponse,
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
          human_mode:      forceHuman,
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
          resolved:        body.resolved        ?? false,
          human_mode:      forceHuman,
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
