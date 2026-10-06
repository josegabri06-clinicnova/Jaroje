import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { 
  normalizePhone, 
  sendTemplate1_SolicitudRecibida, 
  sendTemplate3_ReservacionConfirmada, 
  sendTemplate4_DisponibilidadLiberada, 
  detectLanguageFromPhone 
} from '@/lib/whatsapp';
import { getBeds24Token, clearBeds24Cache, syncBeds24BookingLocal, isInvoicePayment, extractPhoneFromBookingData, updateBeds24BookingPhone } from '@/lib/beds24';
import { deleteCancelledReservationFinances } from '@/lib/finances';

// POST: Beds24 envía un Webhook aquí cuando entra una reserva en Airbnb/Booking/Google/Directo o se cancela
export async function POST(req: Request) {
  try {
    clearBeds24Cache();

    const payload = await req.json();
    
    // Beds24 template mapping:
    // { "roomId": "[ROOMID]", "checkIn": "[FIRSTNIGHT]", "checkOut": "[LASTNIGHT]", "source": "[SOURCE]", "bookingId": "[BOOKID]", "guestName": "[GUESTNAME]" }
    const { roomId, checkIn, checkOut, source, bookingId, guestName } = payload;

    if (!bookingId) {
      return NextResponse.json({ error: 'Falta bookingId' }, { status: 400 });
    }

    const bookingIdStr = bookingId.toString();

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
          text: `${guestName || 'Desconocido'} (ID: ${bookingId}) - Webhook recibido por ${source || 'Beds24'} para fechas ${checkIn} a ${checkOut} (Habitación Beds24: ${roomId}).`,
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

    // Consultar detalles completos de la reserva a Beds24 (incluyendo canceladas e ítems de factura)
    try {
      const BEDS24_TOKEN = await getBeds24Token();
      let b24Res = await fetch(`https://api.beds24.com/v2/bookings?id=${bookingId}&includeInvoiceItems=true&includeCancelled=true`, {
        headers: { 'token': BEDS24_TOKEN }
      });
      
      let dataList: any[] = [];
      if (b24Res.ok) {
        const b24Json = await b24Res.json();
        dataList = b24Json.data || [];
      }

      // Si por alguna razón Beds24 no devuelve la reserva vía API (o ya no está activa en su caché), consultar Supabase
      if (dataList.length === 0) {
        try {
          const { data: dbBooking } = await supabase
            .from('beds24_reservations')
            .select('*')
            .eq('id', bookingIdStr)
            .maybeSingle();

          if (dbBooking) {
            const nameParts = (dbBooking.guest_name || 'Huésped').split(' ');
            dataList = [{
              id: dbBooking.id,
              masterId: dbBooking.master_id,
              firstName: nameParts[0] || '',
              lastName: nameParts.slice(1).join(' ') || '',
              guestName: dbBooking.guest_name,
              phone: dbBooking.guest_phone,
              email: dbBooking.guest_email,
              status: dbBooking.status || '0',
              arrival: dbBooking.check_in,
              departure: dbBooking.check_out,
              channel: dbBooking.channel,
              deposit: dbBooking.deposit,
              invoiceItems: dbBooking.invoice_items || []
            }];
          }
        } catch (dbFallbackErr) {
          console.error("[Webhook Beds24] Error en fallback de consulta a Supabase:", dbFallbackErr);
        }
      }

      if (dataList.length > 0) {
        let b = dataList[0];
        let country = b.country2 || b.country || b.guestCountry2 || b.guestCountry;

        // Reintento: si el país viene vacío y no está cancelada, esperamos 2 segundos y re-consultamos a Beds24
        const bStatusInitial = String(b.status || '').toLowerCase().trim();
        if (!country && bStatusInitial !== '0' && bStatusInitial !== 'cancelled') {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const b24ResRetry = await fetch(`https://api.beds24.com/v2/bookings?id=${bookingId}&includeInvoiceItems=true&includeCancelled=true`, {
            headers: { 'token': BEDS24_TOKEN }
          });
          if (b24ResRetry.ok) {
            const b24JsonRetry = await b24ResRetry.json();
            if (b24JsonRetry.success && b24JsonRetry.data && b24JsonRetry.data.length > 0) {
              const bRetry = b24JsonRetry.data[0];
              const newCountry = bRetry.country2 || bRetry.country || bRetry.guestCountry2 || bRetry.guestCountry;
              if (newCountry) {
                b = bRetry;
                country = newCountry;
              }
            }
          }
        }

        // Guardar o actualizar la reserva completa localmente en Supabase (Supabase-First)
        try {
          await syncBeds24BookingLocal(b);
          console.log(`[Webhook Beds24] ✅ Reserva ${bookingIdStr} guardada/actualizada localmente en Supabase.`);
        } catch (dbSyncErr) {
          console.error(`[Webhook Beds24] Error al guardar reserva ${bookingIdStr} localmente:`, dbSyncErr);
        }

        let phone = extractPhoneFromBookingData(b);
        if (!phone && bookingIdStr) {
          try {
            const { data: dbB } = await supabase
              .from('beds24_reservations')
              .select('guest_phone, phone')
              .eq('id', bookingIdStr)
              .maybeSingle();
            if (dbB?.guest_phone || dbB?.phone) {
              phone = dbB.guest_phone || dbB.phone;
            }
          } catch (_) {}
        }

        // Si se extrajo un teléfono válido de notas/mensajes y Beds24 no lo tenía en sus campos nativos, sincronizarlo a Beds24
        if (phone && (!b.phone || !b.mobile)) {
          updateBeds24BookingPhone(bookingIdStr, phone).catch(err => {
            console.warn("[Webhook Beds24] No se pudo sincronizar teléfono a Beds24:", err);
          });
        }
        const bStatus = String(b.status || '').toLowerCase().trim();
        const isCancelled = bStatus === '0' || bStatus === 'cancelled';

        const rawSource = String(`${b.channel || ''} ${source || ''} ${b.referer || ''} ${b.source || ''} ${b.apiSource || ''} ${b.apiReference || ''}`).toLowerCase();
        const guestNameUpper = `${b.firstName || ''} ${b.lastName || ''}`.toUpperCase();
        const isPrepaidOTA = ['airbnb', 'booking', 'vrbo'].some(ota => rawSource.includes(ota))
          || guestNameUpper.includes('PAGADO A') || guestNameUpper.includes('PAGADO B');

        // ═══════════════════════════════════════════════════════════════════════
        // CASO 1: RESERVACIÓN CANCELADA
        // ═══════════════════════════════════════════════════════════════════════
        if (isCancelled) {
          console.log(`[Webhook Beds24] Reservación cancelada detectada para ID ${bookingIdStr}`);
          await supabase.from('checkins').delete().eq('reservation_id', bookingIdStr.toLowerCase().trim());

          // Revertir y eliminar transacciones en Finanzas de la reserva cancelada
          try {
            await deleteCancelledReservationFinances(bookingIdStr, 'Cancelación recibida por Webhook Beds24');
          } catch (finErr) {
            console.error("[Webhook Beds24] Error limpiando finanzas de reserva cancelada:", finErr);
          }

          if (phone) {
            try {
              const normalizedBooking = {
                id: b.id,
                guest_name: `${b.firstName || ''} ${b.lastName || ''}`.trim() || (b.guestName || guestName || 'Huésped'),
                phone: phone
              };
              const waRes = await sendTemplate4_DisponibilidadLiberada(normalizedBooking, true);
              if (waRes.success) {
                console.log(`[Webhook Beds24] ✅ WhatsApp disponibilidad_liberada enviado AL INSTANTE a ${normalizedBooking.guest_name} (ID: ${bookingIdStr}).`);
              } else {
                console.error(`[Webhook Beds24] Error al enviar WhatsApp de disponibilidad liberada:`, waRes.error);
              }
            } catch (waErr) {
              console.error("[Webhook Beds24] Error al enviar WhatsApp de disponibilidad liberada en webhook:", waErr);
            }
          }

          return NextResponse.json({ success: true, message: 'Reservación cancelada procesada.' });
        }

        // ═══════════════════════════════════════════════════════════════════════
        // CASO 2: RESERVACIÓN ACTIVA / NUEVA
        // ═══════════════════════════════════════════════════════════════════════
        if (phone) {
          // Inicializar la configuración de idioma y pagos en booking_portal_settings si no existe
          try {
            const autoLang = detectLanguageFromPhone(phone);
            const { data: existingSettings } = await supabase
              .from('booking_portal_settings')
              .select('booking_id')
              .eq('booking_id', bookingIdStr)
              .maybeSingle();
              
            if (!existingSettings) {
              await supabase
                .from('booking_portal_settings')
                .insert({
                  booking_id: bookingIdStr,
                  show_card_payment: true,
                  transfer_account: 'santander',
                  language: autoLang
                });
            }
          } catch (settErr) {
            console.error("[Webhook Beds24] Error al inicializar portal settings:", settErr);
          }

          // 1. Verificar si ya hizo checkin
          const { data: dbCheckin } = await supabase
            .from('checkins')
            .select('status')
            .eq('reservation_id', bookingIdStr.toLowerCase().trim())
            .maybeSingle();

          if (dbCheckin?.status === 'checked_in' || dbCheckin?.status === 'checked_out') {
            console.log(`[Webhook Beds24] Huésped ya hizo check-in (status: ${dbCheckin.status}), omitiendo confirmación.`);
            return NextResponse.json({ success: true, message: 'Check-in ya realizado, se omite confirmación.' });
          }

          // 2. Deduplicación por bookingId exacto: verificar si ya se envió a este bookingId
          const { data: existingLog } = await supabase
            .from('whatsapp_logs')
            .select('id')
            .eq('reservation_id', bookingIdStr)
            .in('template_name', ['solicitud_recibida', 'reservacion_confirmada', 'pago_anticipo_recibido'])
            .limit(1);

          if (existingLog && existingLog.length > 0) {
            console.log(`[Webhook Beds24] Omitiendo duplicado exacto a reserva ${bookingIdStr}`);
            return NextResponse.json({ success: true, message: 'Plantilla ya enviada anteriormente para esta reserva.' });
          }

          // 3. Si Beds24 indica explícitamente que es sibling/hijo de un grupo (masterId distinto de id y distinto de 0)
          const isExplicitChild = b.masterId && String(b.masterId) !== String(b.id) && Number(b.masterId) !== 0;
          if (isExplicitChild) {
            await supabase.from('whatsapp_logs').insert([{
              reservation_id: bookingIdStr,
              template_name: 'omitido_multi_habitacion_sibling',
              phone: phone,
              sent_at: new Date().toISOString(),
              status: 'sent'
            }]);
            console.log(`[Webhook Beds24] Omitiendo reserva sibling explícita ${bookingIdStr} (masterId: ${b.masterId})`);
            return NextResponse.json({ success: true, message: 'Reserva sibling explícita, se omite notificación.' });
          }

          // 4. Deduplicación por teléfono exclusiva para reservas multi-habitación simultáneas (ventana de 15 minutos)
          const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
          const cleanPhoneDigits = phone.replace(/\D/g, '');
          const { data: recentPhoneLog } = await supabase
            .from('whatsapp_logs')
            .select('id, reservation_id')
            .in('template_name', ['solicitud_recibida', 'reservacion_confirmada', 'bienvenida_checkin', 'omitido_multi_habitacion'])
            .gte('sent_at', fifteenMinutesAgo)
            .limit(50);

          const phoneAlreadyNotified = (recentPhoneLog || []).some((l: any) => {
            const lDigits = String(l.phone || '').replace(/\D/g, '');
            return lDigits && cleanPhoneDigits && (lDigits.includes(cleanPhoneDigits) || cleanPhoneDigits.includes(lDigits));
          });

          if (phoneAlreadyNotified) {
            await supabase.from('whatsapp_logs').insert([{
              reservation_id: bookingIdStr,
              template_name: 'omitido_multi_habitacion',
              phone: phone,
              sent_at: new Date().toISOString(),
              status: 'sent'
            }]);
            console.log(`[Webhook Beds24] Omitiendo duplicado simultáneo multi-habitación para teléfono ${phone} (reserva ${bookingIdStr})`);
            return NextResponse.json({ success: true, message: 'Notificación inicial ya enviada a la habitación principal del grupo.' });
          }

          // 5. Preparar datos de la reserva para WhatsApp y calcular si está confirmada
          const bookingForWA = {
            id: bookingIdStr,
            firstName: b.firstName || '',
            lastName: b.lastName || '',
            guest_name: `${b.firstName || ''} ${b.lastName || ''}`.trim() || b.guestName || guestName || 'Huésped',
            phone: phone,
            channel: b.channel || source || 'OTA',
            num_adult: Number(b.numAdult || 1),
            num_child: Number(b.numChild || 0),
            deposit: Number(b.deposit || 0)
          };

          let actualPaid = 0;
          if (b.invoiceItems && Array.isArray(b.invoiceItems)) {
            b.invoiceItems.forEach((item: any) => {
              const itemBookingId = String(item.bookingId || item.bookId || '');
              if (itemBookingId && itemBookingId !== String(b.id)) {
                return;
              }
              const lineTotal = item.lineTotal !== undefined ? Number(item.lineTotal) : (Number(item.qty || 0) * Number(item.price || 0));
              if (isInvoicePayment(item)) {
                actualPaid += Math.abs(lineTotal);
              }
            });
          }

          const isConfirmedBooking = isPrepaidOTA || actualPaid > 0 || Number(b.deposit || 0) > 0;

          if (isConfirmedBooking) {
            // RESERVACIÓN CONFIRMADA (Booking.com, Airbnb, con anticipo pagado, etc.):
            // Se envía Mensaje 3 (reservacion_confirmada) INMEDIATAMENTE sin importar la anticipación de la fecha de entrada
            const waRes = await sendTemplate3_ReservacionConfirmada(bookingForWA, true);
            if (waRes.success) {
              console.log(`[Webhook Beds24] ✅ WhatsApp reservacion_confirmada enviado AL INSTANTE a reserva ${bookingIdStr} (${bookingForWA.guest_name})`);
            } else {
              console.error(`[Webhook Beds24] Error al enviar WhatsApp de reservacion_confirmada:`, waRes.error);
            }
          } else {
            // RESERVACIÓN NO CONFIRMADA / SOLICITUD DE ANTICIPO:
            // La ventana de 7 días previos aplica EXCLUSIVAMENTE para Expedia (sin pago).
            // Para reservas directas y demás canales, se envía la solicitud de anticipo (24h) de inmediato.
            const isExpediaBooking = rawSource.includes('expedia');

            if (isExpediaBooking) {
              const todayMexicoStr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
              const arrivalClean = (b.arrival || '').split('T')[0].split(' ')[0];
              
              let daysUntilArrival = 0;
              if (arrivalClean) {
                const arrDate = new Date(`${arrivalClean}T00:00:00Z`);
                const todayDate = new Date(`${todayMexicoStr}T00:00:00Z`);
                daysUntilArrival = Math.round((arrDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
              }

              if (daysUntilArrival > 7) {
                console.log(`[Webhook Beds24] Reserva Expedia no confirmada ${bookingIdStr} (${b.firstName || ''} ${b.lastName || ''}) con llegada ${arrivalClean} (${daysUntilArrival} días en el futuro > 7 días). Solicitud de anticipo 24h pospuesta para 7 días previos al check-in vía Cron.`);
                return NextResponse.json({ 
                  success: true, 
                  message: `Reserva Expedia procesada. Solicitud de anticipo programada para 7 días antes de la llegada (${arrivalClean}).` 
                });
              }
            }

            const waRes = await sendTemplate1_SolicitudRecibida(bookingForWA, true);
            if (waRes.success) {
              console.log(`[Webhook Beds24] ✅ WhatsApp solicitud_recibida enviado AL INSTANTE a reserva ${bookingIdStr} (${bookingForWA.guest_name})`);
            } else {
              console.error(`[Webhook Beds24] Error al enviar WhatsApp de solicitud_recibida:`, waRes.error);
            }
          }
        }
      }
    } catch (waErr) {
      console.error("[Webhook Beds24] Error en proceso de webhook Beds24:", waErr);
    }

    return NextResponse.json({ success: true, message: "Webhook procesado exitosamente." });
  } catch (err: any) {
    console.error("[Webhook Beds24] Error fatal:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

