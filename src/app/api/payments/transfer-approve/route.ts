import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { addBeds24Payment, getBeds24Token } from '@/lib/beds24';
import { sendTemplate11_PagoAnticipoRecibido, sendTemplate3_ReservacionConfirmada, sendTemplate2_UltimoAviso, getFirstName } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { receiptId, bookingId, amount, action, notes } = await req.json();

    if (!receiptId || !bookingId || !action) {
      return NextResponse.json({ error: 'Faltan datos obligatorios (receiptId, bookingId, action)' }, { status: 400 });
    }

    const bookingIdNum = Number(bookingId);

    // 0. Buscar si es una reserva local en Supabase
    const { data: localRes } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('id', bookingIdNum)
      .maybeSingle();

    if (action === 'approve') {
      console.log(`[Approve Transfer] Approving receipt ${receiptId} for booking ${bookingId}`);

      let newDeposit = 0;
      let guestName = 'Huésped';
      let phone = '';
      let price = 0;
      let guestsCount = '1';
      let checkIn = '';
      let checkOut = '';
      let numAdult = 1;
      let numChild = 0;

      if (localRes) {
        // Reserva local: Actualizar depósito en local_reservas
        newDeposit = Number(localRes.deposit || 0) + Number(amount);
        const { error: dbError } = await supabase
          .from('local_reservas')
          .update({ deposit: newDeposit })
          .eq('id', bookingIdNum);

        if (dbError) {
          console.error("[Approve Transfer] Local DB update error:", dbError);
          return NextResponse.json({ error: 'Fallo al actualizar el depósito en la reserva local.' }, { status: 500 });
        }

        guestName = localRes.guest_name || 'Huésped';
        phone = localRes.phone || '';
        price = Number(localRes.price || 0);
        guestsCount = String(Number(localRes.num_adult || 1) + Number(localRes.num_child || 0));
        checkIn = localRes.check_in || '';
        checkOut = localRes.check_out || '';
        numAdult = Number(localRes.num_adult || 1);
        numChild = Number(localRes.num_child || 0);
      } else {
        // Reserva de Beds24: Registrar pago en Beds24
        const desc = `Abono por transferencia bancaria (Ref: ${receiptId.substring(0, 8)})`;
        const beds24Success = await addBeds24Payment(bookingId, amount, desc);

        if (!beds24Success) {
          return NextResponse.json({ error: 'Fallo al registrar el pago en Beds24. Revisa las credenciales de la API.' }, { status: 500 });
        }

        // Obtener datos actualizados de Beds24
        try {
          const beds24Token = await getBeds24Token();
          const b24Res = await fetch(`https://api.beds24.com/v2/bookings?id=${bookingId}`, {
            headers: { 'token': beds24Token },
            cache: 'no-store'
          });
          if (b24Res.ok) {
            const rawBookingData = await b24Res.json();
            if (rawBookingData && rawBookingData.success && Array.isArray(rawBookingData.data) && rawBookingData.data.length > 0) {
              const rawB = rawBookingData.data[0];
              guestName = `${rawB.firstName || ''} ${rawB.lastName || ''}`.trim() || 'Huésped';
              phone = rawB.phone || rawB.mobile || rawB.guestPhone || rawB.guestMobile || '';
              price = Number(rawB.price || 0);
              newDeposit = Number(rawB.deposit || 0);
              guestsCount = String(Number(rawB.numAdult || 1) + Number(rawB.numChild || 0));
              checkIn = rawB.arrival || '';
              checkOut = rawB.departure || '';
              numAdult = Number(rawB.numAdult || 1);
              numChild = Number(rawB.numChild || 0);
            }
          }
        } catch (errB24) {
          console.error("[Approve Transfer] Error fetching Beds24 details:", errB24);
        }
      }

      // 2. Actualizar estado en Supabase transfer_receipts
      const { error: dbError } = await supabase
        .from('transfer_receipts')
        .update({ status: 'approved', notes })
        .eq('id', receiptId);

      if (dbError) {
        console.error("[Approve Transfer] DB update error:", dbError);
      }

      // 2.5 Registrar en Finanzas locales de Supabase
      try {
        const { data: accounts } = await supabase.from('accounts').select('*');
        let accountId = null;
        if (accounts && accounts.length > 0) {
          const santanderAcc = accounts.find(a => (a.name || '').toUpperCase().includes('SANTANDER'));
          if (santanderAcc) {
            accountId = santanderAcc.id;
          } else {
            const bancoAcc = accounts.find(a => a.group_type === 'BANCOS');
            if (bancoAcc) {
              accountId = bancoAcc.id;
            } else {
              accountId = accounts[0].id;
            }
          }
        }

        if (accountId) {
          const todayStr = new Date().toISOString().split('T')[0];
          const { error: finErr } = await supabase.from('finances').insert({
            type: 'ingreso',
            amount: Number(amount),
            category: 'Alojamiento',
            description: `${guestName} (ID: ${bookingId}) - Abono por transferencia Santander (Ref: ${receiptId.substring(0, 8)})`,
            payment_method: 'transferencia',
            account_id: accountId,
            date: todayStr
          });
          if (finErr) console.error("[Approve Transfer] Error inserting finance log:", finErr);

          const matchedAcc = accounts?.find(a => a.id === accountId);
          if (matchedAcc) {
            const newBalance = Number(matchedAcc.balance || 0) + Number(amount);
            const { error: accErr } = await supabase.from('accounts').update({ balance: newBalance }).eq('id', accountId);
            if (accErr) console.error("[Approve Transfer] Error updating account balance:", accErr);
          }
        }
      } catch (errFin) {
        console.error("[Approve Transfer] Error logging finances:", errFin);
      }

      // 3. Notificar vía WhatsApp
      if (phone) {
        const balance = Math.max(0, price - newDeposit);
        const bookingForWA = {
          id: String(bookingId),
          guest_name: guestName,
          phone: phone,
          price: price,
          deposit: newDeposit,
          last_payment_amount: Number(amount),
          check_in: checkIn,
          check_out: checkOut,
          num_adult: numAdult,
          num_child: numChild,
          nights: checkIn && checkOut
            ? Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)))
            : 1
        };

        let waRes: { success: boolean; error?: string; data?: any };
        let templateLogged = '';

        if (balance > 0) {
          // Pago parcial: Anticipo recibido (balance pendiente)
          console.log(`[Approve Transfer] Sending WhatsApp pago_anticipo_recibido to ${phone} (saldo: $${balance})`);
          waRes = await sendTemplate11_PagoAnticipoRecibido(bookingForWA);
          templateLogged = 'pago_anticipo_recibido';
        } else {
          // Pago completo: Reservación confirmada
          console.log(`[Approve Transfer] Sending WhatsApp reservacion_confirmada to ${phone} (pago completo)`);
          waRes = await sendTemplate3_ReservacionConfirmada(bookingForWA);
          templateLogged = 'reservacion_confirmada';
        }

        if (waRes.success) {
          // Registrar en whatsapp_logs para evitar que el cron reenvíe mensajes
          await supabase.from('whatsapp_logs').insert([{
            reservation_id: String(bookingId),
            template_name: templateLogged,
            phone: phone
          }]);
          console.log(`[Approve Transfer] WhatsApp ${templateLogged} enviado y registrado en logs (reserva ${bookingId})`);
        } else {
          console.warn('[Approve Transfer] WhatsApp send template failed:', waRes.error);
        }
      }

      return NextResponse.json({ success: true });

    } else if (action === 'reject') {
      console.log(`[Reject Transfer] Rejecting receipt ${receiptId} for booking ${bookingId}`);

      // Actualizar estado en Supabase a 'rejected'
      const { error: dbError } = await supabase
        .from('transfer_receipts')
        .update({ status: 'rejected', notes })
        .eq('id', receiptId);

      if (dbError) {
        console.error("[Reject Transfer] DB update error:", dbError);
        return NextResponse.json({ error: 'Error al actualizar registro en base de datos.' }, { status: 500 });
      }

      let phone = '';
      let guestName = 'Huésped';

      if (localRes) {
        phone = localRes.phone || '';
        guestName = localRes.guest_name || 'Huésped';
      } else {
        try {
          const beds24Token = await getBeds24Token();
          const b24Res = await fetch(`https://api.beds24.com/v2/bookings?id=${bookingId}`, {
            headers: { 'token': beds24Token },
            cache: 'no-store'
          });
          if (b24Res.ok) {
            const rawBookingData = await b24Res.json();
            if (rawBookingData && rawBookingData.success && Array.isArray(rawBookingData.data) && rawBookingData.data.length > 0) {
              const rawB = rawBookingData.data[0];
              phone = rawB.phone || rawB.mobile || rawB.guestPhone || rawB.guestMobile || '';
              guestName = `${rawB.firstName || ''} ${rawB.lastName || ''}`.trim() || 'Huésped';
            }
          }
        } catch (errWa) {
          console.error("[Reject Transfer] Error fetching booking for rejection notification:", errWa);
        }
      }

      // Notificar rechazo vía WhatsApp
      if (phone) {
        console.log(`[Reject Transfer] Sending WhatsApp ultimo_aviso to ${phone}`);
        const waRes = await sendTemplate2_UltimoAviso({
          id: String(bookingId),
          guest_name: guestName,
          phone: phone,
          deposit: 0
        });
        if (!waRes.success) console.warn('[Reject Transfer] WhatsApp send template failed:', waRes.error);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

  } catch (err: any) {
    console.error("[Approve Transfer] Exception:", err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
