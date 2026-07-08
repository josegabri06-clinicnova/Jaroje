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

              // Evitar envíos duplicados concurrentes en el mismo minuto a este teléfono
              const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
              const { data: recentLogs } = await supabase
                .from('whatsapp_logs')
                .select('id')
                .eq('phone', phone)
                .eq('template_name', 'reservacion_confirmada')
                .gt('created_at', oneMinuteAgo)
                .limit(1);

              if (recentLogs && recentLogs.length > 0) {
                console.log(`[Webhook Beds24] Omitiendo envío duplicado a ${phone} (ya se envió en el último minuto)`);
              } else {
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
                  const { sendTemplate1_SolicitudRecibida } = await import('@/lib/whatsapp');
                  waRes = await sendTemplate1_SolicitudRecibida(bookingForWA);
                  templateName = 'solicitud_recibida';
                } else {
                  waRes = await sendTemplate3_ReservacionConfirmada(bookingForWA);
                }

                if (waRes.success) {
                  await supabase.from('whatsapp_logs').insert([{
                    reservation_id: bookingId.toString(),
                    template_name: templateName,
                    phone: phone
                  }]);
                  console.log(`[Webhook Beds24] WhatsApp ${templateName} enviado a reserva ${bookingId}`);
                } else {
                  console.error(`[Webhook Beds24] Error al enviar WhatsApp:`, waRes.error);
                }
              }
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
