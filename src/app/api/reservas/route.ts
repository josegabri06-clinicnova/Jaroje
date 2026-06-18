import { NextResponse } from 'next/server';
import { getBeds24Bookings, getBeds24Token, getOtaRoom500Bookings } from '@/lib/beds24';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Mapeo unitId → nombre físico para las habitaciones locales 500-507
const UNIT_TO_ROOM: Record<string, string> = {
  '1': '500', '2': '501', '3': '502', '4': '503',
  '5': '504', '6': '505', '7': '506', '8': '507'
};
// unitIds disponibles para auto-asignación OTA (501-507 = unitId 2-8)
const OTA_ASSIGNABLE_UNITS = ['2', '3', '4', '5', '6', '7', '8'];

// GET: Obtener todas las reservas activas procesadas desde Beds24 y locales de Supabase
export async function GET() {
  try {
    const mappedBookings = await getBeds24Bookings();
    
    // Obtener reservas locales de Supabase
    let localBookings: any[] = [];
    let localRawData: any[] = [];
    try {
      const { data } = await supabase
        .from('local_reservas')
        .select('*')
        .neq('status', 'cancelled');
      
      if (data) {
        localRawData = data;
        localBookings = data.map((b: any) => {
          const arrivalDate = b.check_in ? new Date(b.check_in) : null;
          const departureDate = b.check_out ? new Date(b.check_out) : null;
          const nights = (arrivalDate && departureDate)
            ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
            : 1;

          const physicalName = b.unit_id ? (UNIT_TO_ROOM[b.unit_id] || b.unit_id) : '';

          return {
            id: b.id,
            roomId: Number(b.room_id),
            unitId: Number(b.unit_id),
            roomName: `Habitación ${physicalName}`,
            room_name: `Habitación ${physicalName}`,
            arrival: b.check_in,
            departure: b.check_out,
            check_in: b.check_in,
            check_out: b.check_out,
            guest_name: b.guest_name,
            firstName: b.guest_name,
            lastName: '',
            status: b.status || 'confirmed',
            price: Number(b.price || 0),
            price_estimate: Number(b.price || 0),
            deposit: Number(b.deposit || 0),
            balance: Number(b.price || 0) - Number(b.deposit || 0),
            phone: b.phone || '',
            mobile: b.phone || '',
            numAdult: Number(b.num_adult || 1),
            numChild: Number(b.num_child || 0),
            notes: b.notes || '',
            comments: b.notes || '',
            channel: b.channel || 'Recepción',
            isLocal: true,
            booking_time: b.created_at || b.check_in || null,
            nights
          };
        });
      }
    } catch (dbErr) {
      console.error("[Reservas GET] Error reading local_reservas:", dbErr);
    }

    // --- Auto-sync: OTA bookings de Beds24 hab 500 → local rooms 501-507 ---
    try {
      const otaBookings = getOtaRoom500Bookings();
      if (otaBookings.length > 0) {
        for (const ota of otaBookings) {
          // Verificar si ya existe en local_reservas (por beds24_id en notes, o por nombre+fechas+canal)
          const alreadySynced = localRawData.some(lr => {
            if (lr.notes && lr.notes.includes(`B24:${ota.beds24_id}`)) return true;
            if (lr.guest_name === ota.guest_name && lr.check_in === ota.check_in && lr.check_out === ota.check_out && lr.channel === ota.channel) return true;
            return false;
          });
          if (alreadySynced) continue;

          // Encontrar habitaciones locales disponibles (501-507) para las fechas
          const occupiedUnits = localRawData
            .filter(lr => lr.status !== 'cancelled' && lr.check_in < ota.check_out && lr.check_out > ota.check_in)
            .map(lr => String(lr.unit_id));

          const availableUnits = OTA_ASSIGNABLE_UNITS.filter(u => !occupiedUnits.includes(u));
          if (availableUnits.length === 0) {
            console.warn(`[OTA Sync] No hay hab locales 501-507 disponibles para B24:${ota.beds24_id} (${ota.guest_name})`);
            continue;
          }

          // Seleccionar habitación aleatoria de las disponibles
          const randomUnit = availableUnits[Math.floor(Math.random() * availableUnits.length)];
          const roomName = UNIT_TO_ROOM[randomUnit];

          const { data: inserted, error: insertErr } = await supabase
            .from('local_reservas')
            .insert([{
              room_id: '685542',
              unit_id: randomUnit,
              guest_name: ota.guest_name,
              check_in: ota.check_in,
              check_out: ota.check_out,
              price: ota.price,
              deposit: ota.deposit,
              phone: ota.phone,
              num_adult: ota.num_adult,
              num_child: ota.num_child,
              notes: `OTA Auto-Sync | ${ota.channel} | B24:${ota.beds24_id}`,
              channel: ota.channel,
              status: 'confirmed'
            }])
            .select()
            .single();

          if (insertErr) {
            console.error(`[OTA Sync] Error insertando B24:${ota.beds24_id}:`, insertErr);
          } else {
            console.log(`[OTA Sync] ✅ B24:${ota.beds24_id} (${ota.guest_name}) → Hab ${roomName}`);
            const nights = ota.nights || 1;
            localBookings.push({
              id: inserted.id, roomId: 685542, unitId: Number(randomUnit),
              roomName: `Habitación ${roomName}`, room_name: `Habitación ${roomName}`,
              arrival: ota.check_in, departure: ota.check_out,
              check_in: ota.check_in, check_out: ota.check_out,
              guest_name: ota.guest_name, firstName: ota.guest_name, lastName: '',
              status: 'confirmed', price: ota.price, price_estimate: ota.price,
              deposit: ota.deposit, balance: ota.price - ota.deposit,
              phone: ota.phone, mobile: ota.phone,
              numAdult: ota.num_adult, numChild: ota.num_child,
              notes: `OTA Auto-Sync | ${ota.channel} | B24:${ota.beds24_id}`,
              comments: `OTA Auto-Sync | ${ota.channel} | B24:${ota.beds24_id}`,
              channel: ota.channel, isLocal: true,
              booking_time: new Date().toISOString(), nights
            });
            // Actualizar localRawData para siguiente iteración
            localRawData.push({
              id: inserted.id, room_id: '685542', unit_id: randomUnit,
              guest_name: ota.guest_name, check_in: ota.check_in, check_out: ota.check_out,
              price: ota.price, deposit: ota.deposit, phone: ota.phone,
              num_adult: ota.num_adult, num_child: ota.num_child,
              notes: `OTA Auto-Sync | ${ota.channel} | B24:${ota.beds24_id}`,
              channel: ota.channel, status: 'confirmed'
            });
          }
        }
      }
    } catch (syncErr) {
      console.error("[OTA Sync] Error en auto-sync:", syncErr);
    }

    const combined = [...mappedBookings, ...localBookings];
    return NextResponse.json({ success: true, data: combined });
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

    const finalRoomId = Number(roomId);
    const finalUnitId = Number(unitId);

    if (finalRoomId === 685542) {
      // Es local! Guardar en local_reservas de Supabase
      const { data, error } = await supabase
        .from('local_reservas')
        .insert([{
          room_id: roomId.toString(),
          unit_id: unitId.toString(),
          guest_name: guestName || (isBlock ? 'Bloqueo' : 'Reserva Directa'),
          check_in: checkIn,
          check_out: checkOut,
          price: price ? Number(price) : 0,
          deposit: deposit ? Number(deposit) : 0,
          phone: phone || '',
          num_adult: numAdult ? Number(numAdult) : 1,
          num_child: numChild ? Number(numChild) : 0,
          notes: notes || '',
          channel: isBlock ? 'Bloqueo' : 'Recepción',
          status: isBlock ? 'black' : 'confirmed'
        }])
        .select()
        .single();

      if (error) {
        console.error("[Reservas POST] Error inserting local reservation:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        message: "Reserva registrada localmente.", 
        data: { data: [{ id: data.id, success: true }] } 
      });
    }

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
        ...(() => {
          const fullName = guestName || (isBlock ? 'Bloqueo' : 'Reserva Directa');
          const parts = fullName.trim().split(/\s+/);
          return parts.length > 1
            ? { firstName: parts[0], lastName: parts.slice(1).join(' ') }
            : { firstName: fullName.trim(), lastName: '' };
        })(),
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

    // 1. Intentamos buscar si la reserva es local en Supabase
    const { data: localRes } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('id', Number(id))
      .maybeSingle();

    if (localRes) {
      // Es local! Cancelar localmente en Supabase
      const { error: cancelErr } = await supabase
        .from('local_reservas')
        .update({ status: 'cancelled' })
        .eq('id', Number(id));

      if (cancelErr) {
        console.error("[Reservas DELETE] Error cancelling local reservation:", cancelErr);
        return NextResponse.json({ error: cancelErr.message }, { status: 500 });
      }

      // Liberar registro de checkin local en Supabase si existía
      await supabase.from('checkins').delete().eq('reservation_id', id.toString());

      return NextResponse.json({ 
        success: true, 
        message: "Reserva local cancelada y liberada.", 
        data: { data: [{ id, success: true }] } 
      });
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

    // 1. Intentamos buscar si la reserva es local en Supabase
    const { data: localRes } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('id', Number(id))
      .maybeSingle();

    if (localRes) {
      // Es local! Modificar localmente
      const localUpdate: any = {};
      if (guestName) localUpdate.guest_name = guestName;
      if (phone !== undefined) localUpdate.phone = phone;
      if (numAdult !== undefined) localUpdate.num_adult = Number(numAdult);
      if (numChild !== undefined) localUpdate.num_child = Number(numChild);
      if (price !== undefined) localUpdate.price = Number(price);
      if (deposit !== undefined) localUpdate.deposit = Number(deposit);
      if (notes !== undefined) localUpdate.notes = notes;
      
      let displayRoomName = '';
      if (roomName) {
        const { getBeds24RoomIdAndUnit, getRoomMetadata } = await import('@/lib/beds24');
        const mapping = getBeds24RoomIdAndUnit(roomName);
        if (!mapping) {
          return NextResponse.json({ error: `La habitación ${roomName} no es válida.` }, { status: 400 });
        }
        localUpdate.room_id = mapping.roomId;
        localUpdate.unit_id = mapping.unitId;

        const roomData = getRoomMetadata(mapping.roomId, null);
        displayRoomName = roomData?.nombre || `Habitación ${roomName}`;
      }

      const { error: localErr } = await supabase
        .from('local_reservas')
        .update(localUpdate)
        .eq('id', Number(id));

      if (localErr) {
        console.error("[Reservas PUT] Error updating local reservation:", localErr);
        return NextResponse.json({ error: localErr.message }, { status: 500 });
      }

      // Actualizar checkin local si existe
      const dbUpdate: any = {};
      if (displayRoomName) dbUpdate.room = displayRoomName;
      if (guestName) dbUpdate.guest_name = guestName;

      if (Object.keys(dbUpdate).length > 0) {
        await supabase
          .from('checkins')
          .update(dbUpdate)
          .eq('reservation_id', id.toString());
      }

      return NextResponse.json({
        success: true,
        message: "Reserva local actualizada exitosamente.",
        room_name: displayRoomName || undefined,
        data: { data: [{ id, success: true }] }
      });
    }

    const { getBeds24RoomIdAndUnit, getRoomMetadata } = await import('@/lib/beds24');

    const updatePayload: any = {
      id: Number(id),
      bookId: Number(id)
    };

    let displayRoomName = '';
    if (roomName) {
      const mapping = getBeds24RoomIdAndUnit(roomName);
      if (!mapping) {
        return NextResponse.json({ error: `La habitación ${roomName} no es una habitación física válida en staySync.` }, { status: 400 });
      }

      // Bloquear reasignación de reservas Beds24 a habitaciones locales (500-507 = roomId 685542)
      if (mapping.roomId === '685542') {
        return NextResponse.json({ 
          error: `Las habitaciones 500-507 son locales y no están conectadas a Beds24. No se puede reasignar una reserva de Beds24 a una habitación local. Crea la reserva manualmente en la app para las habitaciones 500-507.` 
        }, { status: 400 });
      }

      updatePayload.roomId = Number(mapping.roomId);
      updatePayload.unitId = Number(mapping.unitId);

      const roomData = getRoomMetadata(mapping.roomId, null);
      displayRoomName = roomData?.nombre || `Habitación ${roomName}`;
    }

    if (guestName) {
      // Beds24 usa firstName + lastName separados.
      // Si solo enviamos firstName, el lastName viejo persiste y se concatena.
      // Solución: dividir el nombre y limpiar lastName explícitamente.
      const nameParts = guestName.trim().split(/\s+/);
      if (nameParts.length > 1) {
        updatePayload.firstName = nameParts[0];
        updatePayload.lastName = nameParts.slice(1).join(' ');
      } else {
        updatePayload.firstName = guestName.trim();
        updatePayload.lastName = '';
      }
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

    const BEDS24_TOKEN = await getBeds24Token();

    // 1. Obtener detalles actuales de la reserva (incluyendo invoice items) para actualizar la tarifa
    let currentBooking: any = null;
    if (price !== undefined) {
      try {
        // Probamos primero con la sintaxis de array id[] que es recomendada en la API v2 de Beds24
        let getRes = await fetch(`https://api.beds24.com/v2/bookings?id[]=${id}&includeInvoiceItems=true`, {
          headers: { 
            'token': BEDS24_TOKEN,
            'Content-Type': 'application/json'
          }
        });
        let getJson = await getRes.json().catch(() => null);

        // Si no se encuentra con la sintaxis id[], probamos con la sintaxis singular por si acaso
        if (!getJson || !getJson.data || getJson.data.length === 0) {
          console.log(`[Reservas PUT] No se encontró reserva usando id[]=${id}, probando fallback con id=${id}`);
          getRes = await fetch(`https://api.beds24.com/v2/bookings?id=${id}&includeInvoiceItems=true`, {
            headers: { 
              'token': BEDS24_TOKEN,
              'Content-Type': 'application/json'
            }
          });
          getJson = await getRes.json().catch(() => null);
        }

        if (getJson && getJson.data && getJson.data.length > 0) {
          currentBooking = getJson.data[0];
          console.log(`[Reservas PUT] Reserva ${id} recuperada exitosamente para actualización de factura. Ítems: ${currentBooking.invoiceItems?.length || 0}`);
        } else {
          console.error(`[Reservas PUT] Error: no se pudo recuperar la reserva ${id} con id[] ni con id. Respuesta:`, getJson);
        }
      } catch (getErr) {
        console.error("[Reservas PUT] Error fetching current booking for invoice update:", getErr);
      }
    }

    if (price !== undefined) {
      updatePayload.price = Number(price);
      // Incluso si currentBooking es null (error de red/API), o si invoiceItems no es un array, definimos la factura.
      // Pero si pudimos recuperar la reserva, actualizamos/borramos los ítems de cargo existentes de forma segura.
      const currentItems = (currentBooking && Array.isArray(currentBooking.invoiceItems)) ? currentBooking.invoiceItems : [];
      const charges = currentItems.filter((item: any) => Number(item.qty || 0) > 0);
      const invoiceItemsUpdate: any[] = [];
      
      if (charges.length > 0) {
        const firstCharge = charges[0];
        invoiceItemsUpdate.push({
          id: firstCharge.id,
          description: firstCharge.description || "Room Charge",
          qty: 1,
          price: Number(price)
        });
        for (let i = 1; i < charges.length; i++) {
          invoiceItemsUpdate.push({
            id: charges[i].id,
            description: "",
            qty: "",
            price: "",
            status: ""
          });
        }
      } else {
        invoiceItemsUpdate.push({
          description: "Room Charge",
          qty: 1,
          price: Number(price)
        });
      }
      updatePayload.invoiceItems = invoiceItemsUpdate;
    }
    if (deposit !== undefined) {
      updatePayload.deposit = Number(deposit);
    }
    if (notes !== undefined) {
      updatePayload.notes = notes;
    }

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
