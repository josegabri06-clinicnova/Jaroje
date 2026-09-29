import { NextResponse } from 'next/server';
import { getBeds24Token, getBeds24Bookings, clearBeds24Cache } from '@/lib/beds24';
import { supabase } from '@/lib/supabase';
import { sendTemplate3_ReservacionConfirmada, sendTemplate6_BienvenidaCheckin } from '@/lib/whatsapp';

// POST: Registrar un cobro/pago en Beds24 asociado a una reserva o localmente en Supabase
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { bookId, amount, paymentMethod, employeeNum, description: customDescription, currentDeposit: bodyDeposit } = body;

    if (!bookId || !amount || !paymentMethod) {
      return NextResponse.json({ 
        success: false, 
        error: 'Faltan parámetros: bookId, amount, paymentMethod' 
      }, { status: 400 });
    }

    // 1. Intentamos buscar si la reserva es local en Supabase
    const { data: localRes } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('id', Number(bookId))
      .maybeSingle();

    if (localRes) {
      // Es local! Registrar el pago actualizando el depósito en la tabla local_reservas
      const newDeposit = Number(localRes.deposit || 0) + Number(amount);
      const { error: updateErr } = await supabase
        .from('local_reservas')
        .update({ deposit: newDeposit })
        .eq('id', Number(bookId));

      if (updateErr) {
        console.error("Error al registrar pago en local_reservas:", updateErr);
        throw new Error(`Error en base de datos local: ${updateErr.message}`);
      }

      // Enviar confirmación por WhatsApp en segundo plano sólo si NO es cobro de check-in y la reserva no ha hecho check-in
      const isCheckInPaymentLocal = (customDescription || '').toLowerCase().includes('check-in') || 
                                    (customDescription || '').toLowerCase().includes('checkin') || 
                                    (customDescription || '').toLowerCase().includes('walk-in') || 
                                    (customDescription || '').toLowerCase().includes('walkin');

      if (localRes.phone && !isCheckInPaymentLocal) {
        (async () => {
          try {
            const { data: dbCheckin } = await supabase
              .from('checkins')
              .select('status')
              .eq('reservation_id', String(localRes.id).toLowerCase().trim())
              .maybeSingle();

            if (dbCheckin?.status === 'checked_in' || dbCheckin?.status === 'checked_out') {
              console.log(`[Payment local] Reserva ${localRes.id} ya tiene check-in (status: ${dbCheckin?.status}), se omite reservacion_confirmada.`);
              return;
            }

            const { data: existingLogs } = await supabase
              .from('whatsapp_logs')
              .select('id')
              .eq('reservation_id', String(localRes.id))
              .eq('template_name', 'reservacion_confirmada')
              .limit(1);

            if (existingLogs && existingLogs.length > 0) {
              console.log(`[Payment local] reservacion_confirmada ya enviada previamente a ${localRes.id}, omitiendo.`);
              return;
            }

            const UNIT_TO_ROOM: Record<string, string> = {
              '1': '500', '2': '501', '3': '502', '4': '503',
              '5': '504', '6': '505', '7': '506', '8': '507'
            };
            const physicalName = localRes.unit_id ? (UNIT_TO_ROOM[String(localRes.unit_id)] || String(localRes.unit_id)) : '';
            const bookingForWA = {
              id: localRes.id,
              guest_name: localRes.guest_name,
              phone: localRes.phone,
              room_name: `Habitación ${physicalName}`,
              check_in: localRes.check_in,
              check_out: localRes.check_out,
              price: Number(localRes.price || 0),
              deposit: newDeposit, // nuevo depósito acumulado
              nights: Math.max(1, Math.round((new Date(localRes.check_out).getTime() - new Date(localRes.check_in).getTime()) / (1000 * 60 * 60 * 24))),
              num_adult: Number(localRes.num_adult || 1),
              num_child: Number(localRes.num_child || 0)
            };

            const waRes = await sendTemplate3_ReservacionConfirmada(bookingForWA);
            if (waRes?.success) {
              await supabase.from('whatsapp_logs').insert([{
                reservation_id: String(localRes.id),
                template_name: 'reservacion_confirmada',
                phone: localRes.phone,
                sent_at: new Date().toISOString(),
                status: 'sent'
              }]);
            }
          } catch (waErr) {
            console.error("Error enviando WhatsApp en payment local:", waErr);
          }
        })();
      }

      return NextResponse.json({ 
        success: true, 
        message: "Pago registrado localmente.", 
        data: { success: true }
      });
    }

    const BEDS24_TOKEN = await getBeds24Token();

    // Evitamos la llamada GET lenta a Beds24 usando el depósito provisto por el frontend
    const currentDeposit = bodyDeposit !== undefined ? Number(bodyDeposit) : 0;
    const newDeposit = currentDeposit + Number(amount);

    // Estructurar el pago según la especificación contable de Beds24 API v2:
    // - Las entradas de dinero (pagos recibidos) se mandan con qty = -1 y price = valor positivo.
    // - Se envía deposit: newDeposit para que el resumen del depósito se actualice explícitamente.
    const description = customDescription || `Cobro Check-In ${paymentMethod.toUpperCase()}${employeeNum ? ` (Operador: ${employeeNum})` : ''} [Jaroje OS]`;

    const beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: { 
        'token': BEDS24_TOKEN, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify([{
        id: Number(bookId),
        bookId: Number(bookId),
        status: 'confirmed', // 'confirmed' = Confirmed in Beds24 API V2
        deposit: newDeposit,
        invoiceItems: [
          {
            description: description,
            type: 'payment',
            amount: Number(amount)
          }
        ]
      }])
    });

    if (!beds24Response.ok) {
      const errText = await beds24Response.text();
      throw new Error(`Beds24 rechazó la transacción: ${errText}`);
    }

    const dataB24 = await beds24Response.json();
    clearBeds24Cache();

    // Enviar confirmación por WhatsApp en segundo plano para Beds24 sólo si NO es cobro de check-in y la reserva no ha hecho check-in
    const isCheckInPaymentB24 = (description || '').toLowerCase().includes('check-in') || 
                                (description || '').toLowerCase().includes('checkin') || 
                                (description || '').toLowerCase().includes('walk-in') || 
                                (description || '').toLowerCase().includes('walkin');

    if (!isCheckInPaymentB24) {
      (async () => {
        try {
          const { data: dbCheckin } = await supabase
            .from('checkins')
            .select('status')
            .eq('reservation_id', String(bookId).toLowerCase().trim())
            .maybeSingle();

          if (dbCheckin?.status === 'checked_in' || dbCheckin?.status === 'checked_out') {
            console.log(`[Payment Beds24] Reserva ${bookId} ya tiene check-in (status: ${dbCheckin?.status}), se omite reservacion_confirmada.`);
            return;
          }

          const { data: existingLogs } = await supabase
            .from('whatsapp_logs')
            .select('id')
            .eq('reservation_id', String(bookId))
            .eq('template_name', 'reservacion_confirmada')
            .limit(1);

          if (existingLogs && existingLogs.length > 0) {
            console.log(`[Payment Beds24] reservacion_confirmada ya enviada previamente a ${bookId}, omitiendo.`);
            return;
          }

          const allBookings = await getBeds24Bookings(true);
          const booking = allBookings.find(r => r.id === Number(bookId));
          if (booking && (booking.phone || booking.mobile || booking.guest_phone)) {
            const guestPhone = booking.phone || booking.mobile || booking.guest_phone;
            const waRes = await sendTemplate3_ReservacionConfirmada(booking);
            if (waRes?.success) {
              await supabase.from('whatsapp_logs').insert([{
                reservation_id: String(bookId),
                template_name: 'reservacion_confirmada',
                phone: guestPhone,
                sent_at: new Date().toISOString(),
                status: 'sent'
              }]);
            }
          }
        } catch (waErr) {
          console.error("Error enviando WhatsApp en payment Beds24:", waErr);
        }
      })();
    }

    return NextResponse.json({ 
      success: true, 
      message: "Pago sincronizado con Beds24.", 
      data: dataB24 
    });

  } catch (err: any) {
    console.error("Error registrando pago en Beds24:", err);
    return NextResponse.json({ 
      success: false, 
      error: err.message || 'Error interno del servidor' 
    }, { status: 500 });
  }
}
