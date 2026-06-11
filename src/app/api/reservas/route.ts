import { NextResponse } from 'next/server';
import { getBeds24Bookings, getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

// GET: Obtener todas las reservas activas procesadas desde Beds24
export async function GET() {
  try {
    const mappedBookings = await getBeds24Bookings();
    return NextResponse.json({ success: true, data: mappedBookings });
  } catch (err: any) {
    if (err.message === 'TOKEN_EXPIRED' || err.message === 'REFRESH_TOKEN_EXPIRED') {
      return NextResponse.json({ 
        success: false, 
        error: err.message,
        message: err.message === 'REFRESH_TOKEN_EXPIRED'
          ? 'El refresh token de Beds24 ha caducado. Genera uno nuevo en Beds24 > Marketplace > API.'
          : 'Token de Beds24 caducado o inválido. Intentando renovar automáticamente...'
      }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Crear reserva manual desde la App y enviarla a Beds24
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      roomId, 
      unitId, 
      checkIn, 
      checkOut, 
      guestName, 
      isBlock = false, 
      price,
      deposit,
      phone,
      numAdult,
      numChild,
      notes
    } = body;

    if (!roomId || !unitId || !checkIn || !checkOut) {
      return NextResponse.json({ error: 'Faltan parámetros: roomId, unitId, checkIn, checkOut' }, { status: 400 });
    }

    // Usamos el roomId (ID de tipo de habitación en Beds24) y unitId (unidad física asignada)
    // directamente como están definidos en la base de datos de Beds24 del usuario.
    const finalRoomId = Number(roomId);
    const finalUnitId = Number(unitId);

    const BEDS24_TOKEN = await getBeds24Token();

    const beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        roomId: finalRoomId,
        unitId: finalUnitId,
        roomQty: 1,
        arrival: checkIn,
        departure: checkOut,
        firstName: guestName || (isBlock ? 'Bloqueo' : 'Reserva Directa'),
        status: isBlock ? "black" : "confirmed",
        ...(!isBlock && price !== undefined && price !== null ? { price: Number(price) } : {}),
        ...(!isBlock && deposit !== undefined && deposit !== null ? { deposit: Number(deposit) } : {}),
        ...(!isBlock ? {
          mobile: phone || '',
          phone: phone || '',
          numAdult: numAdult !== undefined ? Number(numAdult) : 1,
          numChild: numChild !== undefined ? Number(numChild) : 0,
          notes: notes || '',
          comments: notes || ''
        } : {}),
        actions: {
          checkAvailability: true,
          assignBooking: true
        }
      }])
    });

    if (!beds24Response.ok) {
      const errText = await beds24Response.text();
      throw new Error(`Beds24 rechazó la reserva: ${errText}`);
    }

    const dataB24 = await beds24Response.json();
    
    // Validar errores individuales en el array de respuesta de Beds24 v2
    if (dataB24 && Array.isArray(dataB24.data)) {
      const firstResult = dataB24.data[0];
      if (firstResult && firstResult.success === false) {
        const errorMsg = firstResult.errors 
          ? firstResult.errors.map((e: any) => `${e.field}: ${e.message}`).join(', ')
          : firstResult.message || 'Error individual en Beds24';
        return NextResponse.json({ error: `Beds24 rechazó la reserva: ${errorMsg}` }, { status: 400 });
      }
    }

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

    // Validar errores individuales en el array de respuesta de Beds24 v2
    if (dataB24 && Array.isArray(dataB24.data)) {
      const firstResult = dataB24.data[0];
      if (firstResult && firstResult.success === false) {
        const errorMsg = firstResult.errors 
          ? firstResult.errors.map((e: any) => `${e.field}: ${e.message}`).join(', ')
          : firstResult.message || 'Error individual al cancelar en Beds24';
        return NextResponse.json({ error: `Beds24 rechazó la cancelación: ${errorMsg}` }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true, message: "Reserva cancelada en Beds24 y liberada localmente.", data: dataB24 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT: Modificar datos de una reserva en Beds24 y en Supabase (habitación, nombre, teléfono, pax, tarifa)
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, roomName, guestName, phone, numAdult, numChild, price, notes, deposit } = body;

    if (!id) {
      return NextResponse.json({ error: 'Falta el parámetro id' }, { status: 400 });
    }

    const { getBeds24RoomIdAndUnit, getRoomMetadata } = await import('@/lib/beds24');

    const updatePayload: any = {
      id: Number(id)
    };

    let displayRoomName = '';
    if (roomName) {
      const mapping = getBeds24RoomIdAndUnit(roomName);
      if (!mapping) {
        return NextResponse.json({ error: `La habitación ${roomName} no es una habitación física válida en staySync.` }, { status: 400 });
      }
      updatePayload.roomId = Number(mapping.roomId);
      updatePayload.unitId = Number(mapping.unitId);

      const roomData = getRoomMetadata(mapping.roomId, null);
      displayRoomName = roomData?.nombre || `Habitación ${roomName}`;
    }

    if (guestName) {
      updatePayload.firstName = guestName;
    }
    if (phone !== undefined) {
      updatePayload.phone = phone;
      updatePayload.mobile = phone;
    }
    if (numAdult !== undefined) {
      updatePayload.numAdult = Number(numAdult);
    }
    if (numChild !== undefined) {
      updatePayload.numChild = Number(numChild);
    }
    if (price !== undefined) {
      updatePayload.price = Number(price);
    }
    if (deposit !== undefined) {
      updatePayload.deposit = Number(deposit);
    }
    if (notes !== undefined) {
      updatePayload.notes = notes;
    }

    const BEDS24_TOKEN = await getBeds24Token();

    // 1. Modificar en Beds24
    const beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify([updatePayload])
    });

    if (!beds24Response.ok) {
      const errText = await beds24Response.text();
      throw new Error(`Beds24 rechazó la modificación: ${errText}`);
    }

    // 2. Actualizar registro local de checkin en Supabase si existe
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const dbUpdate: any = {};
    if (displayRoomName) {
      dbUpdate.room = displayRoomName;
    }
    if (guestName) {
      dbUpdate.guest_name = guestName;
    }

    if (Object.keys(dbUpdate).length > 0) {
      await supabase
        .from('checkins')
        .update(dbUpdate)
        .eq('reservation_id', id.toString());
    }

    const dataB24 = await beds24Response.json();

    // Validar errores individuales en el array de respuesta de Beds24 v2
    if (dataB24 && Array.isArray(dataB24.data)) {
      const firstResult = dataB24.data[0];
      if (firstResult && firstResult.success === false) {
        const errorMsg = firstResult.errors 
          ? firstResult.errors.map((e: any) => `${e.field}: ${e.message}`).join(', ')
          : firstResult.message || 'Error individual en Beds24';
        return NextResponse.json({ error: `Beds24 rechazó la actualización: ${errorMsg}` }, { status: 400 });
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Reserva actualizada exitosamente.`, 
      room_name: displayRoomName,
      data: dataB24 
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
