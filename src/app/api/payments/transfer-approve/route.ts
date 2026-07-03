import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { addBeds24Payment, getBeds24Token } from '@/lib/beds24';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { receiptId, bookingId, amount, action, notes } = await req.json();

    if (!receiptId || !bookingId || !action) {
      return NextResponse.json({ error: 'Faltan datos obligatorios (receiptId, bookingId, action)' }, { status: 400 });
    }

    if (action === 'approve') {
      console.log(`[Approve Transfer] Approving receipt ${receiptId} for booking ${bookingId}`);

      // 1. Registrar pago en Beds24
      const desc = `Abono por transferencia bancaria (Ref: ${receiptId.substring(0, 8)})`;
      const beds24Success = await addBeds24Payment(bookingId, amount, desc);

      if (!beds24Success) {
        return NextResponse.json({ error: 'Fallo al registrar el pago en Beds24. Revisa las credenciales de la API.' }, { status: 500 });
      }

      // 2. Actualizar estado en Supabase transfer_receipts
      const { error: dbError } = await supabase
        .from('transfer_receipts')
        .update({ status: 'approved', notes })
        .eq('id', receiptId);

      if (dbError) {
        console.error("[Approve Transfer] DB update error:", dbError);
      }

      // 3. Obtener info de la reserva en Beds24 para disparar WhatsApp de confirmación
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
            const phone = rawB.phone || rawB.mobile || rawB.guestPhone || rawB.guestMobile;
            if (phone) {
              const guestName = `${rawB.firstName || ''} ${rawB.lastName || ''}`.trim() || 'Huésped';
              const linkPortal = `https://jaroje-app.vercel.app/public/reserva/${bookingId}`;
              const guestsCount = String(Number(rawB.numAdult || 1) + Number(rawB.numChild || 0));

              // 2.5 Registrar en Finanzas locales de Supabase
              try {
                const { data: accounts } = await supabase.from('accounts').select('*');
                let accountId = null;
                if (accounts && accounts.length > 0) {
                  const santanderAcc = accounts.find(a => a.name.toUpperCase().includes('SANTANDER'));
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

              const price = Number(rawB.price || 0);
              const deposit = Number(rawB.deposit || 0);
              const balance = Math.max(0, price - deposit);

              if (balance > 0) {
                console.log(`[Approve Transfer] Sending WhatsApp pago_anticipo_recibido to ${phone}`);
                const formattedAmount = Number(amount).toLocaleString('es-MX', { maximumFractionDigits: 0 });
                const formattedBalance = Number(balance).toLocaleString('es-MX', { maximumFractionDigits: 0 });
                // plantilla: pago_anticipo_recibido (variables: {{1}} nombre, {{2}} monto, {{3}} saldo, {{4}} link)
                const waRes = await sendWhatsAppTemplate(phone, 'pago_anticipo_recibido', [guestName, formattedAmount, formattedBalance, linkPortal]);
                if (!waRes.success) {
                  console.warn("[Approve Transfer] WhatsApp send template failed:", waRes.error);
                }
              } else {
                console.log(`[Approve Transfer] Sending WhatsApp confirm_reservacion to ${phone}`);
                // plantilla: reservacion_confirmada (variables: {{1}} nombre, {{2}} link, {{3}} huespedes)
                const waRes = await sendWhatsAppTemplate(phone, 'reservacion_confirmada', [guestName, linkPortal, guestsCount]);
                if (!waRes.success) {
                  console.warn("[Approve Transfer] WhatsApp send template failed:", waRes.error);
                }
              }
            }
          }
        }
      } catch (errWa) {
        console.error("[Approve Transfer] Error fetching booking for WA notification:", errWa);
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

      // Notificar rechazo vía WhatsApp
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
            const phone = rawB.phone || rawB.mobile || rawB.guestPhone || rawB.guestMobile;
            if (phone) {
              const guestName = `${rawB.firstName || ''} ${rawB.lastName || ''}`.trim() || 'Huésped';
              const linkPortal = `https://jaroje-app.vercel.app/public/reserva/${bookingId}`;
              
              console.log(`[Reject Transfer] Sending WhatsApp reject alert to ${phone}`);
              // Usar 'ultimo_aviso' template (variables: {{1}} nombre, {{2}} link) para invitar a volver a subir
              const waRes = await sendWhatsAppTemplate(phone, 'ultimo_aviso', [guestName, linkPortal]);
              if (!waRes.success) {
                console.warn("[Reject Transfer] WhatsApp send template failed:", waRes.error);
              }
            }
          }
        }
      } catch (errWa) {
        console.error("[Reject Transfer] Error notifying rejection:", errWa);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

  } catch (err: any) {
    console.error("[Approve Transfer] Exception:", err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
