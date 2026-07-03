import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

export async function POST(req: Request) {
  try {
    const { bookingId, amount, splitType, guestName } = await req.json();

    if (!bookingId || !amount) {
      return NextResponse.json({ success: false, error: 'Faltan parámetros bookingId o amount' }, { status: 400 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ success: false, error: 'STRIPE_SECRET_KEY no está configurado en el servidor' }, { status: 500 });
    }

    const origin = req.headers.get('origin') || 'https://jaroje-app.vercel.app';

    // Crear la sesión de Checkout en Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: `Reserva #${bookingId} - Condominios Jaroje`,
              description: splitType === '50' ? 'Abono de Anticipo (50%)' : 'Abono de Liquidación Total (100%)',
            },
            unit_amount: Math.round(Number(amount) * 100), // Stripe recibe centavos (cents)
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/public/reserva/${bookingId}?payment_status=success`,
      cancel_url: `${origin}/public/reserva/${bookingId}?payment_status=cancelled`,
      metadata: {
        bookingId: String(bookingId),
        amount: String(amount),
        splitType: String(splitType || '100'),
        guestName: guestName || 'Huésped'
      },
    });

    return NextResponse.json({ success: true, url: session.url });
  } catch (err: any) {
    console.error("Error al crear sesión de Stripe Checkout:", err);
    return NextResponse.json({ success: false, error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
