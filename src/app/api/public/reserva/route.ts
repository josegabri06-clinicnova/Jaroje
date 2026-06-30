import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getBeds24Bookings } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Falta ID de la reserva' }, { status: 400 });
    }

    const bookingId = Number(id);

    // 1. Buscar en local_reservas de Supabase
    const { data: localRes } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (localRes && localRes.status !== 'cancelled') {
      const UNIT_TO_ROOM: Record<string, string> = {
        '1': '500', '2': '501', '3': '502', '4': '503',
        '5': '504', '6': '505', '7': '506', '8': '507'
      };
      const physicalName = localRes.unit_id ? (UNIT_TO_ROOM[localRes.unit_id] || localRes.unit_id) : '';
      const arrivalDate = localRes.check_in ? new Date(localRes.check_in) : null;
      const departureDate = localRes.check_out ? new Date(localRes.check_out) : null;
      const nights = (arrivalDate && departureDate)
        ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 1;

      // Obtener el estado del check-in
      const { data: checkinData } = await supabase
        .from('checkins')
        .select('status')
        .eq('reservation_id', String(bookingId))
        .maybeSingle();

      return NextResponse.json({
        success: true,
        data: {
          id: localRes.id,
          guest_name: localRes.guest_name,
          room_name: `Habitación ${physicalName}`,
          check_in: localRes.check_in,
          check_out: localRes.check_out,
          price: Number(localRes.price || 0),
          deposit: Number(localRes.deposit || 0),
          balance: Math.max(0, Number(localRes.price || 0) - Number(localRes.deposit || 0)),
          nights,
          num_adult: Number(localRes.num_adult || 1),
          num_child: Number(localRes.num_child || 0),
          is_checked_in: checkinData?.status === 'checked_in',
          is_acknowledged: checkinData?.status === 'acknowledged' || checkinData?.status === 'checked_in'
        }
      });
    }

    // 2. Buscar en Beds24
    const allBeds24 = await getBeds24Bookings(true);
    const booking = allBeds24.find(r => r.id === bookingId);

    if (booking && booking.status !== 'cancelled') {
      const { data: checkinData } = await supabase
        .from('checkins')
        .select('status')
        .eq('reservation_id', String(bookingId))
        .maybeSingle();

      return NextResponse.json({
        success: true,
        data: {
          id: booking.id,
          guest_name: booking.guest_name,
          room_name: booking.room_name,
          check_in: booking.check_in,
          check_out: booking.check_out,
          price: Number(booking.price_estimate || booking.price || 0),
          deposit: Number(booking.deposit || 0),
          balance: Number(booking.balance || 0),
          nights: booking.nights,
          num_adult: Number(booking.num_adult || 1),
          num_child: Number(booking.num_child || 0),
          is_checked_in: checkinData?.status === 'checked_in',
          is_acknowledged: checkinData?.status === 'acknowledged' || checkinData?.status === 'checked_in'
        }
      });
    }

    return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

  } catch (err: any) {
    console.error("Error en api/public/reserva:", err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
