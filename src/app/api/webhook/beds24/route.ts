import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST: Beds24 envía un Webhook aquí cuando entra una reserva en Airbnb/Booking
export async function POST(req: Request) {
  try {
    const payload = await req.json();
    
    // Beds24 template mapping. Asumimos el siguiente JSON config en Beds24:
    // { "roomId": "[ROOMID]", "checkIn": "[FIRSTNIGHT]", "checkOut": "[LASTNIGHT]", "source": "[SOURCE]", "bookingId": "[BOOKID]", "guestName": "[GUESTNAME]" }
    const { roomId, checkIn, checkOut, source, bookingId, guestName } = payload;

    if (!roomId || !checkIn || !checkOut) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios' }, { status: 400 });
    }



    // Registrar log de auditoría 360 automatizado
    try {
      await supabase.from('employee_logs').insert([{
        employee_num: '000',
        employee_name: 'Beds24 Sync',
        department: 'recepcion',
        module: 'recepcion',
        action: 'reserva_creada_webhook',
        room: guestName || 'Desconocido',
        details: JSON.stringify({
          text: `${guestName || 'Desconocido'} (ID: ${bookingId}) - Nueva reserva recibida por ${source || 'Beds24'} para fechas ${checkIn} a ${checkOut} (Habitación Beds24: ${roomId}).`,
          reserva: {
            guestName: guestName || 'Desconocido',
            roomId: roomId,
            bookingId: bookingId,
            checkIn: checkIn,
            checkOut: checkOut,
            channel: source || 'Beds24 Webhook',
            isOTA: true
          }
        }),
        created_at: new Date().toISOString()
      }]);
    } catch (logErr) {
      console.error("Error al registrar log de webhook Beds24:", logErr);
    }

    // Enviar WhatsApp de reservación confirmada (Mensaje 3)
    if (bookingId) {
      try {
        const { getBeds24Token } = await import('@/lib/beds24');
        const { sendTemplate3_ReservacionConfirmada } = await import('@/lib/whatsapp');
        
        const BEDS24_TOKEN = await getBeds24Token();
        const b24Res = await fetch(`https://api.beds24.com/v2/bookings?id=${bookingId}`, {
          headers: { 'token': BEDS24_TOKEN }
        });
        
        if (b24Res.ok) {
          const b24Json = await b24Res.json();
          if (b24Json.success && b24Json.data && b24Json.data.length > 0) {
            const b = b24Json.data[0];
            const phone = b.phone || b.mobile || b.guestPhone || '';
            if (phone) {
              // Inicializar la configuración de idioma y pagos en booking_portal_settings
              try {
                const { detectLanguageFromPhone } = await import('@/lib/whatsapp');
                const autoLang = detectLanguageFromPhone(phone);
                
                // Verificar si ya existe configuración para no pisarla
                const { data: existingSettings } = await supabase
                  .from('booking_portal_settings')
                  .select('booking_id')
                  .eq('booking_id', bookingId.toString())
                  .maybeSingle();
                  
                if (!existingSettings) {
                  await supabase
                    .from('booking_portal_settings')
                    .insert({
                      booking_id: bookingId.toString(),
                      show_card_payment: true,
                      transfer_account: 'santander',
                      language: autoLang
                    });
                }
              } catch (settErr) {
                console.error("[Webhook Beds24] Error al inicializar portal settings:", settErr);
              }

              // ─────────────────────────────────────────────────────────────────
              // DEDUPLICACIÓN DUAL
              // 1) Por reservation_id exacto (misma habitación, mismo booking)
              // 2) Por phone + ventana de 5 minutos (reservas multi-habitación:
              //    el mismo huésped reserva varias habitaciones → Beds24 dispara
              //    un webhook por cada una, con bookingId diferente)
              // ─────────────────────────────────────────────────────────────────
              const bookingIdStr = bookingId.toString();
              const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

              // 1. Deduplicación por bookingId exacto
              const { data: existingLog } = await supabase
                .from('whatsapp_logs')
                .select('id')
                .eq('reservation_id', bookingIdStr)
                .in('template_name', ['solicitud_recibida', 'reservacion_confirmada', 'pago_anticipo_recibido'])
                .limit(1);

              if (existingLog && existingLog.length > 0) {
                console.log(`[Webhook Beds24] Omitiendo duplicado exacto a reserva ${bookingIdStr}`);
              } else {
                // 2. Deduplicación por teléfono en ventana de 5 minutos
                const { data: recentPhoneLog } = await supabase
                  .from('whatsapp_logs')
                  .select('id, reservation_id')
                  .eq('phone', phone)
                  .in('template_name', ['solicitud_recibida', 'reservacion_confirmada'])
                  .gte('created_at', fiveMinutesAgo)
                  .limit(1);

                if (recentPhoneLog && recentPhoneLog.length > 0) {
                  // Ya se envió plantilla a este teléfono hace menos de 5 min (multi-habitación)
                  // Registrar en whatsapp_logs como "omitido" para trazabilidad, pero NO enviar WA
                  await supabase.from('whatsapp_logs').insert([{
                    reservation_id: bookingIdStr,
                    template_name: 'omitido_multi_habitacion',
                    phone: phone
                  }]);
                  console.log(`[Webhook Beds24] Omitiendo duplicado multi-habitación para teléfono ${phone} (reserva ${bookingIdStr}, ya enviado a reserva ${recentPhoneLog[0].reservation_id})`);
                } else {
                  // Enviar plantilla (primer mensaje para este teléfono en esta ventana de tiempo)
                  const rawSource = String(`${b.referer || ''} ${b.source || ''} ${b.apiSource || ''} ${b.apiReference || ''}`).toLowerCase();
                  const guestNameUpper = `${b.firstName || ''} ${b.lastName || ''}`.toUpperCase();
                  const isOTA = rawSource.includes('airbnb') || rawSource.includes('booking') || rawSource.includes('expedia')
                    || guestNameUpper.includes('PAGADO A') || guestNameUpper.includes('PAGADO B');

                  const bookingForWA = {
                    id: bookingId.toString(),
                    guest_name: b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : (b.guestName || guestName || 'Huésped'),
                    phone: phone,
                    num_adult: Number(b.numAdult || 1),
                    num_child: Number(b.numChild || 0),
                    deposit: Number(b.deposit || 0)
                  };

                  let waRes;
                  let templateName = 'reservacion_confirmada';

                  if (!isOTA && bookingForWA.deposit === 0) {
                    console.log(`[Webhook Beds24] Reserva sin anticipo ${bookingId} agendada en NUEVAS. Esperando clic en REVISADO para enviar Mensaje 1.`);
                  } else {
                    const waRes = await sendTemplate3_ReservacionConfirmada(bookingForWA);
                    if (waRes.success) {
                      await supabase.from('whatsapp_logs').insert([{
                        reservation_id: bookingId.toString(),
                        template_name: 'reservacion_confirmada',
                        phone: phone
                      }]);
                      console.log(`[Webhook Beds24] WhatsApp reservacion_confirmada enviado a reserva ${bookingId}`);
                    } else {
                      console.error(`[Webhook Beds24] Error al enviar WhatsApp:`, waRes.error);
                    }
                  }
                } // fin else deduplicación por teléfono
              } // fin else deduplicación por bookingId
            }
          }
        }
      } catch (waErr) {
        console.error("[Webhook Beds24] Error en proceso de envío de WhatsApp:", waErr);
      }
    }

    return NextResponse.json({ success: true, message: "Fechas bloqueadas en Jaroje App." });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
