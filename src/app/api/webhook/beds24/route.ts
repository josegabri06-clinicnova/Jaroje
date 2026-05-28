import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST: Beds24 envía un Webhook aquí cuando entra una reserva en Airbnb/Booking
export async function POST(req: Request) {
  try {
    const payload = await req.json();
    
    // Beds24 template mapping. Asumimos el siguiente JSON config en Beds24:
    // { "roomId": "[ROOMID]", "checkIn": "[FIRSTNIGHT]", "checkOut": "[LASTNIGHT]", "source": "[SOURCE]", "bookingId": "[BOOKID]", "guestName": "[GUESTNAME]" }
    const { roomId, checkIn, checkOut, source, bookingId, guestName } = payload;

    if (!roomId || !checkIn || !checkOut) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios' }, { status: 400 });
    }

    // Buscamos si ya existe la habitación localmente, si no, intentamos asociarla o la dejamos pendiente.
    // Para simplificar, insertamos directamente con el beds24_room_id mapeado a room_id si la DB lo permite
    // Asumiendo que room_id es UUID pero Beds24 manda su propio ID, necesitamos mapearlo.
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('id')
      .eq('beds24_room_id', roomId)
      .single();

    if (roomError || !roomData) {
      console.error("Habitación no mapeada:", roomId);
      // Para MVP agresivo: seguimos adelante y guardamos el error o insertamos con room_id nulo para revisión
      // En producción, retornamos error para que no bloquee en una habitación inexistente.
    }

    const { error } = await supabase.from('bookings').insert({
      room_id: roomData?.id || null, // Relación con nuestra tabla
      beds24_room_id: roomId.toString(),
      beds24_booking_id: bookingId?.toString(),
      check_in: checkIn,
      check_out: checkOut,
      source: source || 'beds24_webhook',
      guest_name: guestName || 'Desconocido',
      status: 'confirmed'
    });

    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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
          text: `Entró nueva reserva OTA (${source || 'Beds24'}) de ${guestName || 'Huésped'} para fechas ${checkIn} a ${checkOut} (Beds24 ID: ${bookingId})`,
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

    return NextResponse.json({ success: true, message: "Fechas bloqueadas en Jaroje App." });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
