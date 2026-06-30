import { NextResponse } from 'next/server';
import { sendTemplate3_ReservacionConfirmada } from '@/lib/whatsapp';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { booking, phone, guestName } = body;

    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    if (!token || !phoneId) {
      return NextResponse.json({
        success: false,
        error: 'Credenciales de WhatsApp no configuradas en el servidor'
      }, { status: 500 });
    }

    if (booking) {
      const res = await sendTemplate3_ReservacionConfirmada(booking);
      if (!res.success) {
        return NextResponse.json({ success: false, error: res.error }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: 'WhatsApp enviado con éxito', data: res.data });
    }

    // Fallback si solo envían datos de contacto básicos
    if (!phone || !guestName) {
      return NextResponse.json({
        success: false,
        error: 'Faltan parámetros requeridos: booking o (phone, guestName)'
      }, { status: 400 });
    }

    const dummyBooking = {
      phone,
      guest_name: guestName,
      id: 'N/A',
      room_name: 'Habitación Jaroje',
      check_in: new Date().toISOString().split('T')[0],
      check_out: new Date().toISOString().split('T')[0],
      price: 0,
      deposit: 0,
      nights: 1,
      num_adult: 1,
      num_child: 0
    };

    const res = await sendTemplate3_ReservacionConfirmada(dummyBooking);
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'WhatsApp enviado con éxito (fallback)',
      data: res.data
    });

  } catch (err: any) {
    console.error("Error enviando WhatsApp de confirmación:", err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Error interno del servidor'
    }, { status: 500 });
  }
}
