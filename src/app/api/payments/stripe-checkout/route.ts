import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { bookingId, splitType, guestName } = await req.json();

    if (!bookingId) {
      return NextResponse.json({ success: false, error: 'Falta el parámetro obligatorio bookingId' }, { status: 400 });
    }

    const cleanBookingId = String(bookingId).replace(/\D/g, '');
    if (!cleanBookingId) {
      return NextResponse.json({ success: false, error: 'ID de reserva inválido' }, { status: 400 });
    }

    // 1. Obtener la reservación directamente de la base de datos (NUNCA confiar en montos enviados por el cliente)
    let booking: any = null;

    const { data: b24Data } = await supabase
      .from('beds24_reservations')
      .select('id, price, deposit, status, guest_name')
      .eq('id', cleanBookingId)
      .maybeSingle();

    if (b24Data) {
      booking = b24Data;
    } else {
      const { data: localData } = await supabase
        .from('local_reservas')
        .select('id, price, deposit, status, guest_name')
        .eq('id', Number(cleanBookingId))
        .maybeSingle();
      if (localData) {
        booking = localData;
      }
    }

    if (!booking) {
      return NextResponse.json({ success: false, error: 'No se encontró la reservación indicada.' }, { status: 404 });
    }

    if (booking.status === 'cancelled' || String(booking.status) === '0') {
      return NextResponse.json({ success: false, error: 'Esta reservación se encuentra cancelada.' }, { status: 400 });
    }

    const totalPrice = Number(booking.price || 0);
    const currentDeposit = Number(booking.deposit || 0);
    const remainingBalance = Math.max(0, totalPrice - currentDeposit);

    if (totalPrice <= 0) {
      return NextResponse.json({ success: false, error: 'La reservación no tiene una tarifa válida registrada.' }, { status: 400 });
    }

    let verifiedAmount = 0;
    const split = String(splitType || '50').trim();

    if (split === '50') {
      const halfRequired = Math.round(totalPrice * 0.5);
      if (currentDeposit < halfRequired) {
        verifiedAmount = halfRequired - currentDeposit;
      } else {
        verifiedAmount = remainingBalance;
      }
    } else {
      verifiedAmount = remainingBalance;
    }

    if (verifiedAmount <= 0) {
      return NextResponse.json({ success: false, error: 'Esta reservación ya se encuentra completamente liquidada.' }, { status: 400 });
    }

    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'STRIPE_SECRET_KEY no está configurado en el servidor' }, { status: 500 });
    }

    const stripe = new Stripe(apiKey, {
      apiVersion: '2023-10-16' as any,
    });

    const origin = req.headers.get('origin') || 'https://jaroje-app.vercel.app';
    const effectiveGuestName = guestName || booking.guest_name || 'Huésped';

    // 2. Crear la sesión de Checkout en Stripe con el monto ESTRICTAMENTE verificado en servidor
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: `Reserva #${cleanBookingId} - Condominios Jaroje`,
              description: split === '50' ? 'Abono de Anticipo (50%)' : 'Abono de Liquidación Total (100%)',
            },
            unit_amount: Math.round(verifiedAmount * 100), // Stripe en centavos (cents)
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/public/reserva/${cleanBookingId}?payment_status=success`,
      cancel_url: `${origin}/public/reserva/${cleanBookingId}?payment_status=cancelled`,
      metadata: {
        bookingId: String(cleanBookingId),
        amount: String(verifiedAmount),
        splitType: split,
        guestName: effectiveGuestName
      },
    });

    return NextResponse.json({ success: true, url: session.url, verifiedAmount });
  } catch (err: any) {
    console.error("Error al crear sesión de Stripe Checkout:", err);
    return NextResponse.json({ success: false, error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
