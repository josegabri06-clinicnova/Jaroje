import { NextResponse } from 'next/server';
import { getBeds24Token, getBeds24Bookings } from '@/lib/beds24';
import { supabase } from '@/lib/supabase';
import { sendTemplate3_ReservacionConfirmada } from '@/lib/whatsapp';

// POST: Registrar un cobro/pago en Beds24 asociado a una reserva o localmente en Supabase
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { bookId, amount, paymentMethod, employeeNum, description: customDescription } = body;

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

      // Enviar confirmación por WhatsApp en segundo plano
      if (localRes.phone) {
        (async () => {
          try {
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
            await sendTemplate3_ReservacionConfirmada(bookingForWA);
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

    // Estructurar el pago según la especificación contable de Beds24 API v2:
    // - Las entradas de dinero (pagos recibidos) se mandan con qty = -1 y price = valor positivo.
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
        status: 1, // 1 = Confirmed in Beds24 API V2
        invoiceItems: [
          {
            description: description,
            qty: -1,
            price: Number(amount)
          }
        ]
      }])
    });

    if (!beds24Response.ok) {
      const errText = await beds24Response.text();
      throw new Error(`Beds24 rechazó la transacción: ${errText}`);
    }

    const dataB24 = await beds24Response.json();

    // Enviar confirmación por WhatsApp en segundo plano para Beds24
    (async () => {
      try {
        const allBookings = await getBeds24Bookings(true);
        const booking = allBookings.find(r => r.id === Number(bookId));
        if (booking && (booking.phone || booking.mobile || booking.guest_phone)) {
          await sendTemplate3_ReservacionConfirmada(booking);
        }
      } catch (waErr) {
        console.error("Error enviando WhatsApp en payment Beds24:", waErr);
      }
    })();

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
