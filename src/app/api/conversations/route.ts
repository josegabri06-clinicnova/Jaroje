import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function normalizePhone(rawPhone: string): string {
  let cleaned = String(rawPhone || '').replace(/\D/g, '');
  
  // Si tiene 10 dígitos (México sin lada), agregar '521'
  if (cleaned.length === 10) {
    cleaned = '521' + cleaned;
  }
  // Si tiene 12 dígitos y empieza con '52' pero no '521' (ej. 529711490086), normalizar agregando el '1' -> 5219711490086
  if (cleaned.startsWith('52') && !cleaned.startsWith('521') && cleaned.length === 12) {
    cleaned = '521' + cleaned.substring(2);
  }
  // Si tiene 9 dígitos (España sin lada), agregar '34'
  if (cleaned.length === 9) {
    cleaned = '34' + cleaned;
  }
  
  return cleaned;
}

function cleanPhoneForCompare(phoneStr: string): string {
  if (!phoneStr) return '';
  return phoneStr.replace(/\D/g, '');
}

function phonesMatch(phoneA: string, phoneB: string): boolean {
  const cleanA = cleanPhoneForCompare(phoneA);
  const cleanB = cleanPhoneForCompare(phoneB);
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;

  const minLength = 9;
  const suffixA = cleanA.substring(Math.max(0, cleanA.length - minLength));
  const suffixB = cleanB.substring(Math.max(0, cleanB.length - minLength));
  return suffixA === suffixB;
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
      const WHATSAPP_TOKEN    = process.env.WHATSAPP_TOKEN;
      const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

      if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
        return NextResponse.json({
          success: false,
          error: 'Faltan WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en las variables de entorno.'
        }, { status: 500 });
      }

      const cleanPhone = normalizePhone(guestPhone);

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
        console.error("=== ERROR EN WHATSAPP CLOUD API ===");
        console.error("Status:", waRes.status);
        console.error("Payload enviado:", JSON.stringify({
          to: cleanPhone,
          phoneId: WHATSAPP_PHONE_ID
        }));
        console.error("Token utilizado (primeros 15 chars):", WHATSAPP_TOKEN.substring(0, 15));
        console.error("Respuesta de Meta:", JSON.stringify(errBody, null, 2));
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
          to: normalizePhone(guestPhone),
          type: 'text',
          text: { body: message },
        }),
      });

      if (!waRes.ok) {
        const errBody = await waRes.json();
        console.error("=== ERROR EN MANUAL REPLY WHATSAPP CLOUD API ===");
        console.error("Status:", waRes.status);
        console.error("Token utilizado (primeros 15 chars):", WHATSAPP_TOKEN.substring(0, 15));
        console.error("Respuesta de Meta:", JSON.stringify(errBody, null, 2));
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
    const phone     = normalizePhone(body.guest_phone || 'desconocido');
    const timestamp = body.timestamp   || new Date().toISOString();

    // Buscar la última conversación de este teléfono para mantener un historial unificado (SaaS CRM)
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('guest_phone', phone)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    // ── Interceptar si el cliente hizo clic en botones de interacción rápida ──
    let forceHuman = existing ? existing.human_mode : false;
    let finalBotResponse = body.bot_response || null;
    let isAutoReplyTriggered = false;

    const guestMsgClean = String(body.message_from_guest || '').toLowerCase();

    if (guestMsgClean.includes('administrador') || guestMsgClean.includes('administracion') || guestMsgClean.includes('administración')) {
      forceHuman = true;
      finalBotResponse = "Entendido. He pausado el asistente virtual. En un momento, un agente de nuestra recepción continuará la conversación contigo por este medio.";
      isAutoReplyTriggered = true;

      // Registrar log de auditoría en employee_logs para timbrar en la recepción en tiempo real
      try {
        await supabase
          .from('employee_logs')
          .insert([{
            employee_num: 'wa-guest',
            employee_name: String(existing?.guest_name || body.guest_name || phone).slice(0, 50),
            department: 'recepcion',
            module: 'recepcion',
            action: 'human_mode_activated',
            details: `Huésped solicitó hablar con el administrador. Asistente IA pausado. Teléfono: ${phone}`,
            created_at: new Date().toISOString()
          }]);
      } catch (logErr) {
        console.error("Error logging human_mode_activated event:", logErr);
      }
    } else if (
      guestMsgClean.includes('ver mi reserva') || 
      guestMsgClean.includes('ver mi reservacion') || 
      guestMsgClean.includes('ver mi reservación') || 
      guestMsgClean.includes('view my reservation') || 
      guestMsgClean.includes('view_booking_') || 
      (body.button_payload && String(body.button_payload).toLowerCase().includes('view_booking_'))
    ) {
      forceHuman = true;
      isAutoReplyTriggered = true;

      let bookingId = '';
      let guestNameFromSearch = ''; // Nombre del huésped encontrado por teléfono
      const payloadMatch = guestMsgClean.match(/view_booking_(\d+)/) || 
                           String(body.button_payload || '').toLowerCase().match(/view_booking_(\d+)/) ||
                           String(body.message_from_guest || '').toLowerCase().match(/view_booking_(\d+)/);
      
      if (payloadMatch) {
        bookingId = payloadMatch[1];
      }

      if (!bookingId) {
        try {
          const { getBeds24Bookings } = await import('@/lib/beds24');
          const [mappedBookings, localRes] = await Promise.all([
            getBeds24Bookings().catch(() => []),
            supabase.from('local_reservas').select('*').neq('status', 'cancelled')
          ]);

          const localBookings = localRes.data || [];
          const allBookings = [
            ...mappedBookings,
            ...localBookings.map((b: any) => ({
              id: b.id,
              phone: b.phone || '',
              guest_phone: b.phone || '',
              mobile: b.phone || '',
              status: b.status || 'confirmed',
              check_in: b.check_in || b.arrival
            }))
          ];

          const matchingBookings = allBookings.filter((b: any) => {
            if (b.status === 'cancelled') return false;
            const bPhone = b.phone || b.mobile || b.guest_phone || '';
            return phonesMatch(bPhone, phone);
          });

          if (matchingBookings.length > 0) {
            matchingBookings.sort((a: any, b: any) => {
              const dateA = new Date(a.check_in || a.arrival || 0).getTime();
              const dateB = new Date(b.check_in || b.arrival || 0).getTime();
              return dateB - dateA;
            });
            bookingId = String(matchingBookings[0].id);
            guestNameFromSearch = matchingBookings[0].guest_name || '';
          }
        } catch (err) {
          console.error("Error buscando reserva por teléfono:", err);
        }
      }

      if (bookingId) {
        const isEnglish = guestMsgClean.includes('view my reservation') || guestMsgClean.includes('view_booking_');
        const lang = isEnglish ? 'en' : 'es';
        // Buscar el nombre del huésped en el listado ya disponible para pasarlo al template
        const guestNameForTemplate = guestNameFromSearch;
        
        // Enviar el nuevo template con botón CTA URL (en lugar de texto con link feo)
        try {
          const { sendTemplate_PortalHuespedLink } = await import('@/lib/whatsapp');
          const templateResult = await sendTemplate_PortalHuespedLink(phone, bookingId, guestNameForTemplate, lang);
          if (!templateResult.success) {
            // Si falla el template, usar texto libre como fallback
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jaroje-app.vercel.app';
            const portalUrl = `${siteUrl}/public/reserva/${bookingId}?lang=${lang}`;
            finalBotResponse = isEnglish
              ? `🔑 *Here is the link to your reservation:*\n\n👉 ${portalUrl}`
              : `🔑 *Aquí tienes el enlace a tu reservación:*\n\n👉 ${portalUrl}`;
          } else {
            // El template ya se envía directamente a Meta — no necesitamos enviar un mensaje adicional
            finalBotResponse = null; // evitar el envío duplicado de texto
          }
        } catch (templateErr) {
          console.error("Error enviando template portal_huesped_link:", templateErr);
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jaroje-app.vercel.app';
          const portalUrl = `${siteUrl}/public/reserva/${bookingId}?lang=${lang}`;
          finalBotResponse = isEnglish
            ? `🔑 *Here is the link to your reservation:*\n\n👉 ${portalUrl}`
            : `🔑 *Aquí tienes el enlace a tu reservación:*\n\n👉 ${portalUrl}`;
        }
      } else {
        const isEnglish = guestMsgClean.includes('view my reservation') || guestMsgClean.includes('view_booking_');
        if (isEnglish) {
          finalBotResponse = `Hello. We were unable to find any active reservation linked to your phone number in our system.\n\nPlease provide us with your full name or your reservation code so that our front desk team can assist you manually right away. 🌴`;
        } else {
          finalBotResponse = `Hola. No logramos encontrar ninguna reservación activa vinculada a tu número de teléfono en nuestro sistema.\n\nPor favor, indícanos tu nombre completo o tu código de reservación para que nuestro equipo de recepción te asista de forma manual de inmediato. 🌴`;
        }
      }
    } else if (guestMsgClean.includes('reglas') || guestMsgClean.includes('wifi') || guestMsgClean.includes('wi-fi')) {
      finalBotResponse = "📶 *Información de Wi-Fi y Reglas de Jaroje* 🌴\n\n• *Red Wi-Fi:* Jaroje\n• *Contraseña:* HUXX2025\n• *Servicios:* Piscina, terraza y estacionamiento incluidos.\n• *Reglas de convivencia:* Favor de moderar el ruido a partir de las 10:00 PM para la comodidad de todos los huéspedes.\n\nCualquier otra duda o solicitud especial, escríbenos directamente aquí y te atenderemos con gusto.";
      isAutoReplyTriggered = true;
    }

    // Enviar respuesta automática por WhatsApp si se activó algún disparador
    // Solo enviar texto si finalBotResponse no es null (el template CTA lo envía directamente)
    if (isAutoReplyTriggered && finalBotResponse) {
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
          console.error("Error sending automatic response to WhatsApp:", e);
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
          resolved:        body.resolved        ?? false, // Si escribe el cliente, reactivar (no resuelta)
          archived:        false,                    // Desarchivar de forma automática al recibir mensaje
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
