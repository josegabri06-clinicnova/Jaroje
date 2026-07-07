import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { addBeds24Payment, getBeds24Token } from '@/lib/beds24';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import Stripe from 'stripe';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Falta stripe-signature' }, { status: 400 });
    }

    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'STRIPE_SECRET_KEY no está configurado en el servidor' }, { status: 500 });
    }

    const stripe = new Stripe(apiKey, {
      apiVersion: '2023-10-16' as any,
    });

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET no está configurado en el servidor' }, { status: 500 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook signature verification failed:`, err.message);
      return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      const bookingId = session.metadata?.bookingId;
      const amount = Number(session.metadata?.amount || 0);
      const guestName = session.metadata?.guestName || 'Huésped';

      if (!bookingId || !amount) {
        console.error("[Stripe Webhook] Missing bookingId or amount in metadata:", session.metadata);
        return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
      }

      console.log(`[Stripe Webhook] Received payment for Booking #${bookingId}, Amount: ${amount}`);

      // 1. Registrar pago en Beds24
      const desc = `Pago con tarjeta via Stripe (Ref: ${session.id.substring(0, 8)})`;
      const beds24Success = await addBeds24Payment(bookingId, amount, desc);

      if (!beds24Success) {
        console.error(`[Stripe Webhook] Failed to register payment on Beds24 for Booking ${bookingId}`);
        return NextResponse.json({ error: 'Failed to update Beds24' }, { status: 500 });
      }

      // 2. Registrar en Finanzas locales de Supabase
      const { data: accounts } = await supabase.from('accounts').select('*');
      let accountId = null;
      if (accounts && accounts.length > 0) {
        const stripeAcc = accounts.find(a => (a.name || '').toUpperCase().includes('STRIPE'));
        if (stripeAcc) {
          accountId = stripeAcc.id;
        } else {
          const mpAcc = accounts.find(a => (a.name || '').toUpperCase().includes('MERCADO PAGO'));
          if (mpAcc) {
            accountId = mpAcc.id;
          } else {
            const hsbcAcc = accounts.find(a => (a.name || '').toUpperCase().includes('HSBC FISCAL'));
            if (hsbcAcc) {
              accountId = hsbcAcc.id;
            } else {
              accountId = accounts[0].id;
            }
          }
        }
      }

      if (accountId) {
        const todayStr = new Date().toISOString().split('T')[0];
        const { error: finErr } = await supabase.from('finances').insert({
          type: 'ingreso',
          amount: amount,
          category: 'Alojamiento',
          description: `${guestName} (ID: ${bookingId}) - Pago con tarjeta via Stripe`,
          payment_method: 'tarjeta',
          account_id: accountId,
          date: todayStr
        });
        if (finErr) {
          console.error("[Stripe Webhook] Error inserting finance log:", finErr);
        }

        const matchedAcc = accounts?.find(a => a.id === accountId);
        if (matchedAcc) {
          const newBalance = Number(matchedAcc.balance || 0) + amount;
          const { error: accErr } = await supabase.from('accounts').update({ balance: newBalance }).eq('id', accountId);
          if (accErr) {
            console.error("[Stripe Webhook] Error updating account balance:", accErr);
          }
        }
      }

      // 3. Obtener el número telefónico del huésped desde Beds24
      // para disparar el mensaje de WhatsApp adecuado
      try {
        const token = await getBeds24Token();
        const b24Res = await fetch(`https://api.beds24.com/v2/bookings?id=${bookingId}`, {
          headers: { 'token': token },
          cache: 'no-store'
        });
        if (b24Res.ok) {
          const rawBookingData = await b24Res.json();
          if (rawBookingData && rawBookingData.success && Array.isArray(rawBookingData.data) && rawBookingData.data.length > 0) {
            const rawB = rawBookingData.data[0];
            const phone = rawB.phone || rawB.mobile || rawB.guestPhone || rawB.guestMobile;
            if (phone) {
              const formattedName = `${rawB.firstName || ''} ${rawB.lastName || ''}`.trim() || guestName;
              const linkPortal = `https://jaroje-app.vercel.app/public/reserva/${bookingId}`;
              const guestsCount = String(Number(rawB.numAdult || 1) + Number(rawB.numChild || 0));

              const price = Number(rawB.price || 0);
              const deposit = Number(rawB.deposit || 0);
              const balance = Math.max(0, price - deposit);

              if (balance > 0) {
                console.log(`[Stripe Webhook] Sending WhatsApp pago_anticipo_recibido to ${phone}`);
                const formattedAmount = Number(amount).toLocaleString('es-MX', { maximumFractionDigits: 0 });
                const formattedBalance = Number(balance).toLocaleString('es-MX', { maximumFractionDigits: 0 });
                await sendWhatsAppTemplate(phone, 'pago_anticipo_recibido', [formattedName, formattedAmount, formattedBalance, linkPortal]);
              } else {
                console.log(`[Stripe Webhook] Sending WhatsApp reservacion_confirmada to ${phone}`);
                await sendWhatsAppTemplate(phone, 'reservacion_confirmada', [formattedName, linkPortal, guestsCount]);
              }
            }
          }
        }
      } catch (errWa) {
        console.error("[Stripe Webhook] Error sending WhatsApp notification:", errWa);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Error en webhook de Stripe:", err);
    return NextResponse.json({ error: err.message || 'Error de webhook' }, { status: 500 });
  }
}
