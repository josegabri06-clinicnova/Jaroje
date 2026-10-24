import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { 
  getBeds24Token, 
  clearBeds24Cache, 
  fetchAllRawBeds24Bookings,
  getParentMapping,
  getChildRoomId,
  syncBeds24BookingLocal
} from '@/lib/beds24';
import { normalizePhone, cleanPhoneForMeta, sendTemplate1_SolicitudRecibida } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ROOM_MAP: Record<string, { roomId: string; name: string; units: { unitId: string; name: string }[] }> = {
  'doble': {
    roomId: '679077',
    name: 'Habitación Doble',
    units: [
      { unitId: '1', name: '301' },
      { unitId: '2', name: '302' },
      { unitId: '3', name: '303' },
      { unitId: '4', name: '304' },
      { unitId: '5', name: '305' },
      { unitId: '6', name: '306' }
    ]
  },
  '1rec': {
    roomId: '679087',
    name: 'Condominio de 1 dormitorio',
    units: [
      { unitId: '1', name: '402' }
    ]
  },
  '2rec': {
    roomId: '679091',
    name: 'Condominio de 2 dormitorios',
    units: [
      { unitId: '1', name: '201' },
      { unitId: '2', name: '202' },
      { unitId: '3', name: '203' },
      { unitId: '4', name: '204' },
      { unitId: '5', name: '205' },
      { unitId: '6', name: '206' }
    ]
  },
  '3rec': {
    roomId: '679092',
    name: 'Condominio de 3 dormitorios',
    units: [
      { unitId: '1', name: '101' },
      { unitId: '2', name: '102' },
      { unitId: '3', name: '103' },
      { unitId: '4', name: '104' },
      { unitId: '5', name: '105' },
      { unitId: '6', name: '106' },
      { unitId: '7', name: '107' }
    ]
  },
  'casa': {
    roomId: '679093',
    name: 'Casa de Lujo',
    units: [
      { unitId: '1', name: '401' }
    ]
  }
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      guestName,
      guestPhone,
      guestEmail,
      checkIn,
      checkOut,
      adults = 2,
      children = 0,
      rooms = [],
      notes = ''
    } = body;

    // 1. Validaciones básicas
    if (!guestName || !guestPhone) {
      return NextResponse.json({ error: 'Nombre y teléfono son obligatorios.' }, { status: 400 });
    }

    if (!checkIn || !checkOut) {
      return NextResponse.json({ error: 'Fechas de llegada y salida son obligatorias.' }, { status: 400 });
    }

    const cleanPhone = normalizePhone(guestPhone);
    if (!cleanPhone || cleanPhone.length < 10) {
      return NextResponse.json({ error: 'El número de teléfono no es válido.' }, { status: 400 });
    }

    const reqIn = new Date(checkIn);
    const reqOut = new Date(checkOut);
    const diffTime = reqOut.getTime() - reqIn.getTime();
    const nights = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));

    if (nights <= 0 || isNaN(diffTime)) {
      return NextResponse.json({ error: 'El rango de fechas no es válido.' }, { status: 400 });
    }

    // Filtrar habitaciones solicitadas con cantidad > 0
    const validRooms = rooms.filter((r: any) => Number(r.quantity || 0) > 0);
    if (validRooms.length === 0) {
      return NextResponse.json({ error: 'Debes seleccionar al menos una habitación.' }, { status: 400 });
    }

    // Validación estricta de ocupación máxima de habitaciones
    const totalGuests = Number(adults || 0) + Number(children || 0);
    const ROOM_CAPACITIES: Record<string, number> = {
      'doble': 4,
      '1rec': 4,
      '2rec': 8,
      '3rec': 8,
      'casa': 12
    };
    let totalMaxCapacity = 0;
    validRooms.forEach((r: any) => {
      totalMaxCapacity += (ROOM_CAPACITIES[r.key] || 4) * Number(r.quantity || 1);
    });

    if (totalGuests > totalMaxCapacity) {
      return NextResponse.json({
        error: `Ha seleccionado ${totalGuests} huéspedes pero la ocupación máxima de las habitaciones que ha seleccionado es ${totalMaxCapacity}.`
      }, { status: 400 });
    }

    // 2. Candado anti-spam por teléfono (máximo 1 reserva creada cada 5 minutos por el mismo número)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const last10 = cleanPhone.slice(-10);
    const { data: recentCreated } = await supabase
      .from('beds24_reservations')
      .select('id, created_at')
      .gte('created_at', fiveMinutesAgo)
      .or(`phone.like.%${last10}%,guest_phone.like.%${last10}%`)
      .limit(1);

    if (recentCreated && recentCreated.length > 0) {
      return NextResponse.json({
        error: 'Ya registraste una solicitud recientemente. Por favor revisa tu WhatsApp o espera unos minutos antes de intentar de nuevo.'
      }, { status: 429 });
    }

    // 3. Verificar disponibilidad física en tiempo real en Beds24
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + 400);

    const bookingsRaw = await fetchAllRawBeds24Bookings(
      fromDate.toISOString().split('T')[0],
      toDate.toISOString().split('T')[0]
    );

    const occupiedUnitIds = new Set<string>();
    (bookingsRaw || []).forEach((b: any) => {
      if (String(b.status) !== '0' && b.status !== 'cancelled') {
        const bIn = new Date(b.arrival);
        const bOut = new Date(b.departure);
        if (bIn < reqOut && bOut > reqIn) {
          const parent = getParentMapping(b.roomId, b.unitId);
          if (parent.roomId && parent.unitId) {
            occupiedUnitIds.add(`${parent.roomId}_${parent.unitId}`);
          }
        }
      }
    });

    // Separar nombre y apellido
    const nameParts = guestName.trim().split(' ');
    const firstName = nameParts[0] || 'Huésped';
    const lastName = nameParts.slice(1).join(' ') || '';

    // 4. Preparar payload para Beds24 API v2
    const beds24Payload: any[] = [];
    let grandTotalPrice = 0;
    const roomSummaries: string[] = [];

    for (const r of validRooms) {
      const catConfig = ROOM_MAP[r.key];
      if (!catConfig) continue;

      const qty = Number(r.quantity);
      // Buscar unidades físicas libres de esta categoría
      const freeUnits = catConfig.units.filter(u => !occupiedUnitIds.has(`${catConfig.roomId}_${u.unitId}`));

      if (freeUnits.length < qty) {
        return NextResponse.json({
          error: `Lo sentimos, ya no hay suficientes unidades disponibles de ${catConfig.name} para las fechas seleccionadas.`
        }, { status: 409 });
      }

      // Asignar unidades libres
      for (let i = 0; i < qty; i++) {
        const assignedUnit = freeUnits[i];
        occupiedUnitIds.add(`${catConfig.roomId}_${assignedUnit.unitId}`);

        const itemPrice = Math.round(Number(r.pricePerNight || 0) * nights);
        grandTotalPrice += itemPrice;

        roomSummaries.push(`${catConfig.name} (${assignedUnit.name})`);

        beds24Payload.push({
          roomId: Number(catConfig.roomId),
          unitId: Number(assignedUnit.unitId),
          arrival: checkIn,
          departure: checkOut,
          numAdult: Math.max(1, Math.round(Number(adults) / validRooms.length)),
          numChild: Number(children) > 0 ? 1 : 0,
          firstName: firstName,
          lastName: lastName,
          phone: `+${cleanPhoneForMeta(cleanPhone)}`,
          email: guestEmail || '',
          status: 'confirmed', // Bloqueado en Beds24 por 24 horas
          channel: 'Directo whatssap',
          price: itemPrice,
          deposit: 0,
          comments: `Reserva directa creada desde Portal WhatsApp. Habitación: ${assignedUnit.name}. Notas: ${notes || 'Ninguna'}`
        });
      }
    }

    if (beds24Payload.length === 0) {
      return NextResponse.json({ error: 'No se pudieron asignar habitaciones válidas.' }, { status: 400 });
    }

    const totalExtraGuestsFee = Number(body.extraGuestsFee || 0);
    if (totalExtraGuestsFee > 0 && beds24Payload.length > 0) {
      beds24Payload[0].price += totalExtraGuestsFee;
      grandTotalPrice += totalExtraGuestsFee;
    }

    const depositRequired = Math.round(grandTotalPrice * 0.5);

    // 5. Enviar creación a Beds24 API v2
    const BEDS24_TOKEN = await getBeds24Token();
    const beds24Res = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: {
        'token': BEDS24_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(beds24Payload),
      cache: 'no-store'
    });

    if (!beds24Res.ok) {
      const errText = await beds24Res.text();
      console.error("[Reservar API] Error creando reserva en Beds24:", errText);
      return NextResponse.json({ error: 'Error al bloquear habitación en Beds24: ' + errText }, { status: 502 });
    }

    const b24Data = await beds24Res.json();
    console.log("[Reservar API] Respuesta de Beds24:", JSON.stringify(b24Data));

    // Extraer IDs creados (en Beds24 v2 POST los nuevos IDs vienen en cb.new.id o cb.new.bookId)
    const createdBookings: any[] = Array.isArray(b24Data) ? b24Data : (b24Data.data || []);
    const successfulBookingIds: string[] = [];

    createdBookings.forEach((cb: any) => {
      const bId = cb.id || cb.bookId || cb.new?.id || cb.new?.bookId || (cb.info && cb.info[0]?.id) || (cb.success && (cb.id || cb.new?.id));
      if (bId) {
        successfulBookingIds.push(String(bId));
      }
    });

    if (successfulBookingIds.length === 0) {
      const firstError = createdBookings[0];
      const errorMsg = firstError?.errors
        ? firstError.errors.map((e: any) => `${e.field || ''}: ${e.message || ''}`).join(', ')
        : firstError?.message || 'Beds24 no retornó IDs de reserva válidos.';
      return NextResponse.json({
        error: errorMsg,
        details: b24Data
      }, { status: 500 });
    }

    const masterBookingId = successfulBookingIds[0];

    // 6. Si es multi-habitación, enlazar las reservas hermanas con master_id en Beds24
    if (successfulBookingIds.length > 1) {
      try {
        const linkPayload = successfulBookingIds.map(bId => ({
          id: Number(bId),
          masterId: Number(masterBookingId)
        }));
        await fetch('https://api.beds24.com/v2/bookings', {
          method: 'POST',
          headers: {
            'token': BEDS24_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(linkPayload)
        });
      } catch (linkErr) {
        console.warn("[Reservar API] Error vinculando master_id en Beds24:", linkErr);
      }
    }

    // 7. Sincronizar de inmediato a Supabase 'beds24_reservations' y 'local_reservas'
    for (let i = 0; i < successfulBookingIds.length; i++) {
      const bId = successfulBookingIds[i];
      const payloadItem = beds24Payload[i];
      const assignedRoomSummary = roomSummaries[i] || 'Condominio Jaroje';

      try {
        await supabase.from('beds24_reservations').upsert({
          id: bId,
          master_id: successfulBookingIds.length > 1 ? masterBookingId : null,
          check_in: checkIn,
          check_out: checkOut,
          guest_name: guestName.trim(),
          guest_phone: cleanPhone,
          guest_email: guestEmail || null,
          status: 'confirmed',
          channel: 'Directo whatssap',
          room_name: assignedRoomSummary,
          room_id: String(payloadItem.roomId),
          unit_id: String(payloadItem.unitId),
          price: payloadItem.price,
          deposit: 0,
          balance: payloadItem.price,
          num_adult: payloadItem.numAdult,
          num_child: payloadItem.numChild,
          notes: payloadItem.comments,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } catch (dbErr) {
        console.error(`[Reservar API] Error guardando reserva ${bId} en Supabase:`, dbErr);
      }
    }

    // Limpiar caché en memoria de Beds24
    clearBeds24Cache();

    // 8. Disparar automáticamente la Plantilla 1 de WhatsApp (solicitud_recibida con temporizador de 24 horas)
    try {
      const bookingForWhatsApp = {
        id: masterBookingId,
        guest_name: firstName,
        phone: cleanPhone,
        check_in: checkIn,
        check_out: checkOut,
        price: grandTotalPrice,
        deposit: 0
      };
      const waRes = await sendTemplate1_SolicitudRecibida(bookingForWhatsApp, true);
      console.log(`[Reservar API] Plantilla 1 enviada a ${cleanPhone} (Reserva ${masterBookingId}):`, waRes);
    } catch (waErr) {
      console.error("[Reservar API] Error al disparar Plantilla 1 de WhatsApp:", waErr);
    }

    // 8.1. Actualizar la cotización pendiente en 'conversations' a confirmed
    try {
      const { data: conv } = await supabase
        .from('conversations')
        .select('*')
        .eq('guest_phone', cleanPhone)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (conv && Array.isArray(conv.messages)) {
        let changed = false;
        const updatedMessages = conv.messages.map((m: any) => {
          if (m.quote_data && m.quote_data.status === 'pending_name') {
            changed = true;
            return {
              ...m,
              quote_data: {
                ...m.quote_data,
                status: 'confirmed',
                confirmedBookingId: masterBookingId
              }
            };
          }
          return m;
        });
        if (changed) {
          await supabase
            .from('conversations')
            .update({ 
              messages: updatedMessages,
              guest_name: guestName.trim(),
              booking_created: true 
            })
            .eq('id', conv.id);
        }
      }
    } catch (qUpdErr) {
      console.warn("[Reservar API] Error actualizando pendingQuote a confirmed:", qUpdErr);
    }

    return NextResponse.json({
      success: true,
      masterBookingId,
      bookingIds: successfulBookingIds,
      guestName: guestName.trim(),
      guestPhone: cleanPhone,
      checkIn,
      checkOut,
      nights,
      rooms: roomSummaries,
      totalAmount: grandTotalPrice,
      depositRequired,
      balanceRemaining: grandTotalPrice,
      portalUrl: `/public/reserva/${masterBookingId}`
    });

  } catch (error: any) {
    console.error("[Reservar API] Error general al procesar la reserva:", error);
    return NextResponse.json({ error: error.message || 'Error procesando la reservación' }, { status: 500 });
  }
}
