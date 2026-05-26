import { NextResponse } from 'next/server';
import { getBeds24Bookings, getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

// GET: Obtener todas las reservas activas procesadas desde Beds24
export async function GET() {
  try {
    const mappedBookings = await getBeds24Bookings();
    return NextResponse.json({ success: true, data: mappedBookings });
  } catch (err: any) {
    if (err.message === 'TOKEN_EXPIRED') {
      return NextResponse.json({ 
        success: false, 
        error: 'TOKEN_EXPIRED',
        message: 'Token de Beds24 caducado o inválido. Genera uno nuevo en Beds24 > Marketplace > API.'
      }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Crear reserva manual desde la App y enviarla a Beds24
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { roomId, unitId, checkIn, checkOut, guestName, isBlock = false, price } = body;

    if (!roomId || !unitId || !checkIn || !checkOut) {
      return NextResponse.json({ error: 'Faltan parámetros: roomId, unitId, checkIn, checkOut' }, { status: 400 });
    }

    // Mapeo inverso contable: Traduce de Padre + Unidad Virtual a ID de Habitación Específica en Beds24
    // Esto asegura que la App siga funcionando con las interfaces de selección actuales pero registrando
    // en los nuevos Room IDs específicos que tiene Beds24 para evitar conflictos en OTA channels.
    let finalRoomId = Number(roomId);
    let finalUnitId = Number(unitId);

    const parentToChild: Record<string, Record<string, number>> = {
      '679077': { '1': 685531, '2': 685532, '3': 685533, '4': 685534, '5': 685535, '6': 685536 }, // Dobles 301-306
      '679091': { '1': 685312, '2': 685313, '3': 685314, '4': 685315, '5': 685316, '6': 685317 }, // Premier 201-206
      '679092': { '1': 685321, '2': 685322, '3': 685323, '4': 685324, '5': 685325, '6': 685326, '7': 685327 }, // Premier 101-107
      '679093': { '1': 679008 } // Casa Vacacional
    };

    const parentRoomKey = String(roomId);
    const unitKey = String(unitId);

    if (parentToChild[parentRoomKey] && parentToChild[parentRoomKey][unitKey]) {
      finalRoomId = parentToChild[parentRoomKey][unitKey];
      finalUnitId = 1; // Las habitaciones específicas son independientes en Beds24 (se registran en unit 1)
    }

    const BEDS24_TOKEN = await getBeds24Token();

    const beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        roomId: finalRoomId,
        unitId: finalUnitId,
        roomQty: 1,
        checkAvailability: true,
        assignBooking: true,
        arrival: checkIn,
        departure: checkOut,
        firstName: guestName || (isBlock ? 'Bloqueo' : 'Reserva Directa'),
        status: "confirmed",
        ...(!isBlock && price !== undefined && price !== null ? { price: Number(price) } : {})
      }])
    });

    if (!beds24Response.ok) {
      const errText = await beds24Response.text();
      throw new Error(`Beds24 rechazó la reserva: ${errText}`);
    }

    const dataB24 = await beds24Response.json();
    return NextResponse.json({ success: true, message: "Reserva registrada en Beds24.", data: dataB24 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Cancelar reserva en Beds24 y liberar checkins en Supabase
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Falta el parámetro id de la reserva' }, { status: 400 });
    }

    const BEDS24_TOKEN = await getBeds24Token();

    // 1. Cancelar en Beds24
    const beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        id: Number(id),
        status: "cancelled"
      }])
    });

    if (!beds24Response.ok) {
      const errText = await beds24Response.text();
      throw new Error(`Beds24 rechazó la cancelación: ${errText}`);
    }

    // 2. Liberar registro de checkin local en Supabase si existía
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('checkins').delete().eq('reservation_id', id.toString());

    const dataB24 = await beds24Response.json();
    return NextResponse.json({ success: true, message: "Reserva cancelada en Beds24 y liberada localmente.", data: dataB24 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
