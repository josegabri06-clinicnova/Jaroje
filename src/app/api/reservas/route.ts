import { NextResponse } from 'next/server';
import { getBeds24Bookings, getBeds24Token, getOtaRoom500Bookings, fetchBeds24RatesMap, clearBeds24Cache } from '@/lib/beds24';
import { supabase } from '@/lib/supabase';
import { 
  sendTemplate1_SolicitudRecibida, 
  sendTemplate3_ReservacionConfirmada,
  sendTemplate4_DisponibilidadLiberada,
  detectLanguageFromPhone,
  normalizePhone
} from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

// Mapeo unitId → nombre físico para las habitaciones locales 500-507
const UNIT_TO_ROOM: Record<string, string> = {
  '1': '500', '2': '501', '3': '502', '4': '503',
  '5': '504', '6': '505', '7': '506', '8': '507'
};
// unitIds disponibles para auto-asignación OTA (501-507 = unitId 2-8)
const OTA_ASSIGNABLE_UNITS = ['2', '3', '4', '5', '6', '7', '8'];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const includeCancelled = searchParams.get('includeCancelled') === 'true';
    const bypassCache = searchParams.get('bypassCache') === 'true';

    if (bypassCache) {
      console.log("[Reservas GET] bypassCache detectado. Forzando recarga de Beds24 y sincronización con Supabase...");
      try {
        await getBeds24Bookings(true, true, true);
      } catch (err) {
        console.error("Error al forzar getBeds24Bookings en GET:", err);
      }
    }

    let query = supabase.from('beds24_reservations').select('*');
    if (!includeCancelled) {
      const formatter = new Intl.DateTimeFormat('fr-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const yesterdayStr = formatter.format(new Date(Date.now() - 24 * 60 * 60 * 1000));
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      // Traer las no canceladas que tengan checkout ayer o posterior (activas y completadas recientes < 24h),
      // y además las canceladas de las últimas 48 horas.
      query = query.or(`and(status.neq.cancelled,check_out.gte.${yesterdayStr}),and(status.eq.cancelled,updated_at.gte.${fortyEightHoursAgo})`);
    }
    // Excluir la categoría virtual 500 (room_id 685542) para evitar duplicados, ya que se asigna localmente
    query = query.neq('room_id', '685542');
    const { data: dbB24Reservations, error: dbB24Error } = await query;
    if (dbB24Error) {
      console.error("[Reservas GET] Error al leer beds24_reservations de Supabase:", dbB24Error);
    }

    const mappedBookings = (dbB24Reservations || []).map((b: any) => {
      const arrivalDate = b.check_in ? new Date(b.check_in) : null;
      const departureDate = b.check_out ? new Date(b.check_out) : null;
      const nights = (arrivalDate && departureDate)
        ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 1;

      return {
        id: b.id,
        masterId: b.master_id || null,
        actualPaid: Number(b.actual_paid || 0),
        rawDeposit: Number(b.deposit || 0),
        check_in: b.check_in,
        check_out: b.check_out,
        arrival: b.check_in,
        departure: b.check_out,
        guest_name: b.guest_name || 'Huésped',
        firstName: b.guest_name || 'Huésped',
        lastName: '',
        guest_phone: b.guest_phone || null,
        phone: b.guest_phone || '',
        mobile: b.guest_phone || '',
        guest_email: b.guest_email || null,
        email: b.guest_email || null,
        status: b.status,
        source: 'beds24',
        channel: b.channel || 'Directo',
        room_name: b.room_name,
        room: b.room || '',
        room_id: Number(b.room_id || 0),
        roomId: Number(b.room_id || 0),
        unit_id: String(b.unit_id || ''),
        unitId: Number(b.unit_id || 0),
        nights: nights,
        price_estimate: Number(b.price || 0),
        price: Number(b.price || 0),
        deposit: Number(b.deposit || 0),
        balance: Number(b.balance || 0),
        notes: b.notes || null,
        comments: b.notes || null,
        num_adult: Number(b.num_adult || 1),
        numAdult: Number(b.num_adult || 1),
        num_child: Number(b.num_child || 0),
        numChild: Number(b.num_child || 0),
        rooms: { name: b.room_name },
        invoiceItems: b.invoice_items || [],
        last_notice_sent: Boolean(b.last_notice_sent),
        is_acknowledged: Boolean(b.is_acknowledged),
        booking_time: b.created_at || b.check_in || null,
        cancelled_at: b.status === 'cancelled' ? (b.updated_at || null) : null
      };
    });
    
    // Obtener reservas locales de Supabase
    let localBookings: any[] = [];
    let localRawData: any[] = [];
    try {
      let localQuery = supabase.from('local_reservas').select('*');
      if (!includeCancelled) {
        const formatter = new Intl.DateTimeFormat('fr-CA', {
          timeZone: 'America/Mexico_City',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const yesterdayStr = formatter.format(new Date(Date.now() - 24 * 60 * 60 * 1000));
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        // Traer las no canceladas que tengan checkout ayer o posterior (activas y completadas recientes < 24h),
        // y además las canceladas de las últimas 48 horas (probando updated_at primero).
        localQuery = localQuery.or(`and(status.neq.cancelled,check_out.gte.${yesterdayStr}),and(status.eq.cancelled,updated_at.gte.${fortyEightHoursAgo})`);
      }
      let { data, error } = await localQuery;

      if (error && error.message.includes('updated_at')) {
        console.warn("[Reservas GET] La columna 'updated_at' no existe en 'local_reservas'. Ejecutando fallback a 'created_at'...");
        const formatter = new Intl.DateTimeFormat('fr-CA', {
          timeZone: 'America/Mexico_City',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const yesterdayStr = formatter.format(new Date(Date.now() - 24 * 60 * 60 * 1000));
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const fallbackRes = await supabase.from('local_reservas').select('*')
          .or(`and(status.neq.cancelled,check_out.gte.${yesterdayStr}),and(status.eq.cancelled,created_at.gte.${fortyEightHoursAgo})`);
        data = fallbackRes.data;
        error = fallbackRes.error;
      }
      
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
            room: physicalName || '',
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
            guest_phone: b.phone || '',
            numAdult: Number(b.num_adult || 1),
            numChild: Number(b.num_child || 0),
            num_adult: Number(b.num_adult || 1),
            num_child: Number(b.num_child || 0),
            notes: b.notes || '',
            comments: b.notes || '',
            channel: b.channel || 'Recepción',
            isLocal: true,
            is_acknowledged: Boolean(b.is_acknowledged),
            last_notice_sent: Boolean(b.last_notice_sent),
            booking_time: b.created_at || b.check_in || null,
            nights,
            cancelled_at: b.status === 'cancelled' ? (b.updated_at || b.created_at || null) : null
          };
        });
      }
    } catch (dbErr) {
      console.error("[Reservas GET] Error reading local_reservas:", dbErr);
    }

    // --- Auto-sync: bookings de Beds24 hab 500 → local rooms ---
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

          let targetUnit = ota.unit_id;
          let roomName = UNIT_TO_ROOM[targetUnit] || '500';

          if (ota.isOTA) {
            // Si es OTA, recolocar en una de las locales 501-507 (unit_id 2-8) disponibles para liberar la 500
            const occupiedUnits = localRawData
              .filter(lr => lr.status !== 'cancelled' && lr.check_in < ota.check_out && lr.check_out > ota.check_in)
              .map(lr => String(lr.unit_id));

            const availableUnits = OTA_ASSIGNABLE_UNITS.filter(u => !occupiedUnits.includes(u));
            if (availableUnits.length === 0) {
              console.warn(`[OTA Sync] No hay hab locales 501-507 disponibles para B24:${ota.beds24_id} (${ota.guest_name})`);
              // Como fallback, la dejamos en su unidad original asignada en Beds24
              targetUnit = ota.unit_id;
              roomName = UNIT_TO_ROOM[targetUnit] || '500';
            } else {
              targetUnit = availableUnits[Math.floor(Math.random() * availableUnits.length)];
              roomName = UNIT_TO_ROOM[targetUnit];
            }
          }

          const { data: inserted, error: insertErr } = await supabase
            .from('local_reservas')
            .insert([{
              room_id: '685542',
              unit_id: targetUnit,
              guest_name: ota.guest_name,
              check_in: ota.check_in,
              check_out: ota.check_out,
              price: ota.price,
              deposit: ota.deposit,
              phone: ota.phone,
              num_adult: ota.num_adult,
              num_child: ota.num_child,
              notes: `Beds24 Auto-Sync | ${ota.channel} | B24:${ota.beds24_id}`,
              channel: ota.channel,
              status: 'confirmed'
            }])
            .select()
            .single();

          if (insertErr) {
            console.error(`[Beds24 Sync] Error insertando B24:${ota.beds24_id}:`, insertErr);
          } else {
            console.log(`[Beds24 Sync] ✅ B24:${ota.beds24_id} (${ota.guest_name}) → Hab ${roomName}`);
            const nights = ota.nights || 1;
            localBookings.push({
              id: inserted.id, roomId: 685542, unitId: Number(targetUnit),
              roomName: `Habitación ${roomName}`, room_name: `Habitación ${roomName}`,
              room: roomName || '',
              arrival: ota.check_in, departure: ota.check_out,
              check_in: ota.check_in, check_out: ota.check_out,
              guest_name: ota.guest_name, firstName: ota.guest_name, lastName: '',
              status: 'confirmed', price: ota.price, price_estimate: ota.price,
              deposit: ota.deposit, balance: ota.price - ota.deposit,
              phone: ota.phone, mobile: ota.phone,
              numAdult: ota.num_adult, numChild: ota.num_child,
              notes: `Beds24 Auto-Sync | ${ota.channel} | B24:${ota.beds24_id}`,
              comments: `Beds24 Auto-Sync | ${ota.channel} | B24:${ota.beds24_id}`,
              channel: ota.channel, isLocal: true,
              booking_time: new Date().toISOString(), nights
            });
            // Actualizar localRawData para siguiente iteración
            localRawData.push({
              id: inserted.id, room_id: '685542', unit_id: targetUnit,
              guest_name: ota.guest_name, check_in: ota.check_in, check_out: ota.check_out,
              price: ota.price, deposit: ota.deposit, phone: ota.phone,
              num_adult: ota.num_adult, num_child: ota.num_child,
              notes: `Beds24 Auto-Sync | ${ota.channel} | B24:${ota.beds24_id}`,
              channel: ota.channel, status: 'confirmed'
            });
          }
        }
      }
    } catch (syncErr) {
      console.error("[Beds24 Sync] Error en auto-sync de habitaciones locales:", syncErr);
    }

    // Excluir reservas de Beds24 que ya han sido clonadas o reasignadas localmente
    const reassignedB24Ids = new Set<string>();
    const cleanName = (s: string) => {
      return (s || '')
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/[^a-z0-9]/g, ''); // Dejar sólo letras y números
    };

    localRawData.forEach(lr => {
      // 1. Por ID explícito en notas
      if (lr.notes) {
        const match = lr.notes.match(/B24:\s*(\d+)/);
        if (match) {
          reassignedB24Ids.add(match[1]);
        }
      }
    });

    const filteredMappedBookings = mappedBookings.filter(b => {
      // Exclusión directa por ID de Beds24
      if (reassignedB24Ids.has(String(b.id))) return false;

      // Exclusión laxa por coincidencia de estancia (fechas y nombres laxos)
      const bNameClean = cleanName(b.guest_name);
      const isReassignedLax = localRawData.some(lr => {
        if (lr.status === 'cancelled') return false;

        // Comprobación de fechas: coincidencia de check-in O check-out
        const dateMatches = lr.check_in === b.check_in || lr.check_out === b.check_out;
        if (!dateMatches) return false;

        // Comprobación laxa de nombre (coincidencia de subcadenas)
        const lrNameClean = cleanName(lr.guest_name);
        const nameMatches = bNameClean.includes(lrNameClean) || lrNameClean.includes(bNameClean);
        return nameMatches;
      });

      if (isReassignedLax) {
        return false;
      }
      return true;
    });

    const combined = [...filteredMappedBookings, ...localBookings];

    // --- REDISTRIBUCIÓN AUTOMÁTICA DE ANTICIPOS GRUPALES EN TIEMPO REAL ---
    try {
      const groupMap = new Map<string, any[]>();
      combined.forEach((b: any) => {
        if (b.status === 'cancelled') return;
        const cleanStr = (s: string) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
        const guestKey = cleanStr(b.guest_name);
        const bPhone = b.guest_phone || b.phone || b.mobile || '';
        const phoneKey = bPhone ? normalizePhone(bPhone) : '';

        let key = '';
        if (b.masterId) {
          key = `master_${b.masterId}`;
        } else if (guestKey) {
          const isOta = ['booking.com', 'airbnb', 'expedia'].some(c => (b.channel || '').toLowerCase().includes(c));
          if (isOta) {
            key = `name_${guestKey}_${b.check_in}_${b.check_out}`;
          } else if (phoneKey) {
            key = `phone_${phoneKey}_${b.check_in}_${b.check_out}`;
          } else {
            key = `name_${guestKey}_${b.check_in}_${b.check_out}`;
          }
        }
        if (key) {
          if (!groupMap.has(key)) {
            groupMap.set(key, []);
          }
          groupMap.get(key)!.push(b);
        }
      });

      groupMap.forEach((group) => {
        if (group.length > 1) {
          // 1. Calcular el total del precio del grupo primero
          const totalPriceInGroup = group.reduce((sum, b) => sum + Number(b.price_estimate || b.price || 0), 0);

          // 2. Calcular el total del depósito del grupo de forma segura
          const totalPaidFromInvoices = group.reduce((sum, b) => sum + (b.actualPaid || 0), 0);
          let totalDepositInGroup = 0;
          if (totalPaidFromInvoices > 0) {
            totalDepositInGroup = totalPaidFromInvoices;
          } else {
            const nonZeroDeps = group.map(b => Number(b.rawDeposit || b.deposit || 0)).filter(d => d > 0);
            if (nonZeroDeps.length > 0) {
              const firstDep = nonZeroDeps[0];
              const allSame = nonZeroDeps.every(d => d === firstDep);
              const totalSumOfDeps = nonZeroDeps.reduce((sum, d) => sum + d, 0);
              if (allSame && group.length > 1 && totalSumOfDeps > totalPriceInGroup) {
                totalDepositInGroup = firstDep;
              } else {
                totalDepositInGroup = totalSumOfDeps;
              }
            }
          }

          totalDepositInGroup = Math.min(totalDepositInGroup, totalPriceInGroup);

          // 2. Redistribuir proporcionalmente
          group.forEach((b: any) => {
            const bPrice = Number(b.price_estimate || b.price || 0);
            const prop = totalPriceInGroup > 0 ? (bPrice / totalPriceInGroup) : (1 / group.length);
            b.deposit = Math.round(totalDepositInGroup * prop * 100) / 100;
            b.balance = Math.max(0, bPrice - b.deposit);
          });
        }
      });
    } catch (rebalanceErr) {
      console.error("[Reservas GET] Error en rebalanceo automatico:", rebalanceErr);
    }

    // --- REGLA DE NEGOCIO: SI EL HUÉSPED HIZO CHECK-IN (EN CASA) O CHECK-OUT, EL ADEUDO ES CERO Y EL ANTICIPO ES EL TOTAL ---
    try {
      combined.forEach((b: any) => {
        const isCheckedIn = b.is_checked_in || b.status === 'checked_in' || String(b.status).toLowerCase() === 'checked_in';
        const isCheckedOut = b.is_checked_out || b.status === 'checked_out' || String(b.status).toLowerCase() === 'checked_out';
        if (isCheckedIn || isCheckedOut) {
          const bPrice = Number(b.price_estimate || b.price || 0);
          b.deposit = bPrice;
          b.balance = 0;
        }
      });
    } catch (overrideErr) {
      console.error("[Reservas GET] Error al aplicar regla check-in/out:", overrideErr);
    }

    // --- DEBUG LOGGING REMOVED FOR HIGH PERFORMANCE ---

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
      notes,
      sendWhatsApp = true,
      portalSettings
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
          status: isBlock ? 'black' : (Number(deposit || 0) > 0 ? 'confirmed' : 'request')
        }])
        .select()
        .single();

      if (error) {
        console.error("[Reservas POST] Error inserting local reservation:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Guardar ajustes de portal (se inserta siempre para inicializar el idioma)
      try {
        await supabase
          .from('booking_portal_settings')
          .upsert({
            booking_id: String(data.id),
            show_card_payment: portalSettings?.showCardPayment ?? true,
            transfer_account: portalSettings?.transferAccount ?? 'santander',
            language: portalSettings?.language || detectLanguageFromPhone(data.phone)
          });
      } catch (dbErr) {
        console.error("Error al guardar portal settings locales:", dbErr);
      }

      // Enviar WhatsApp en segundo plano (reserva local)
      if (!isBlock && phone && sendWhatsApp) {
        (async () => {
          try {
            const physicalName = unitId ? (UNIT_TO_ROOM[String(unitId)] || String(unitId)) : '';
            const bookingIdStr = String(data.id);
            const bookingForWA = {
              id: bookingIdStr,
              guest_name: data.guest_name,
              phone: data.phone,
              room_name: `Habitación ${physicalName}`,
              check_in: data.check_in,
              check_out: data.check_out,
              price: Number(data.price || 0),
              deposit: Number(data.deposit || 0),
              nights: Math.max(1, Math.round((new Date(data.check_out).getTime() - new Date(data.check_in).getTime()) / (1000 * 60 * 60 * 24))),
              num_adult: Number(data.num_adult || 1),
              num_child: Number(data.num_child || 0)
            };

            // Verificar que no se haya enviado ya este mensaje a esta reserva
            const templateName = bookingForWA.deposit > 0 ? 'reservacion_confirmada' : 'solicitud_recibida';
            const { data: dbCheckin } = await supabase
              .from('checkins')
              .select('status')
              .eq('reservation_id', bookingIdStr.toLowerCase().trim())
              .maybeSingle();

            if (dbCheckin?.status === 'checked_in' || dbCheckin?.status === 'checked_out') {
              console.log(`[WA reservas local] Huésped ya hizo check-in, omitiendo confirmación.`);
              return;
            }

            const { data: existingLog } = await supabase
              .from('whatsapp_logs')
              .select('id')
              .eq('reservation_id', bookingIdStr)
              .in('template_name', ['solicitud_recibida', 'reservacion_confirmada', 'pago_anticipo_recibido'])
              .limit(1);

            if (existingLog && existingLog.length > 0) {
              console.log(`[WA reservas local] Omitiendo, ya se envió mensaje inicial a reserva ${bookingIdStr}`);
              return;
            }

            let waRes;
            if (bookingForWA.deposit > 0) {
              waRes = await sendTemplate3_ReservacionConfirmada(bookingForWA);
              if (waRes?.success) {
                await supabase.from('whatsapp_logs').insert([{
                  reservation_id: bookingIdStr,
                  template_name: 'reservacion_confirmada',
                  phone: data.phone
                }]);
                console.log(`[WA reservas local] reservacion_confirmada enviado a reserva ${bookingIdStr}`);
              }
            } else {
              console.log(`[WA reservas local] Reserva sin anticipo ${bookingIdStr} agendada en NUEVAS. Esperando clic en REVISADO para enviar Mensaje 1.`);
            }
          } catch (waErr) {
            console.error("Error en WhatsApp local:", waErr);
          }
        })();
      }

      return NextResponse.json({ 
        success: true, 
        message: "Reserva registrada localmente.", 
        data: { data: [{ id: data.id, success: true }] } 
      });
    }

    const BEDS24_TOKEN = await getBeds24Token();

    // Mapear el roomId y unitId usando getParentMapping para garantizar que enviamos el ID padre
    // que la API de Beds24 acepta, en lugar de IDs de room types individuales.
    const { getParentMapping } = await import('@/lib/beds24');
    const parentMapping = getParentMapping(finalRoomId.toString(), finalUnitId.toString());
    const targetRoomId = Number(parentMapping.roomId);
    const targetUnitId = Number(parentMapping.unitId);

    console.log(`[Reservas POST] Enviando a Beds24: roomId=${targetRoomId} unitId=${targetUnitId} (original: roomId=${finalRoomId} unitId=${finalUnitId})`);

    const bookingPayload = [{
      roomId: targetRoomId,
      unitId: targetUnitId,
      roomQty: 1,
      arrival: checkIn,
      departure: checkOut,
      ...(() => {
        if (isBlock) {
          const rawDesc = guestName ? guestName.trim() : 'Mantenimiento';
          // Si ya empieza con "bloqueo" (caso insensible), no lo duplicamos
          const hasPrefix = /^bloqueo:/i.test(rawDesc);
          const desc = hasPrefix ? rawDesc.substring(8).trim() : rawDesc;
          return {
            firstName: 'BLOQUEO:',
            lastName: desc || 'Mantenimiento'
          };
        }
        const fullName = guestName || 'Reserva Directa';
        const parts = fullName.trim().split(/\s+/);
        return parts.length > 1
          ? { firstName: parts[0], lastName: parts.slice(1).join(' ') }
          : { firstName: fullName.trim(), lastName: '' };
      })(),
      status: isBlock ? "black" : (Number(deposit || 0) > 0 ? "confirmed" : "request"),
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
        checkAvailability: !isBlock,
        assignBooking: true
      }
    }];

    console.log("[Reservas POST] Payload Beds24:", JSON.stringify(bookingPayload, null, 2));

    let beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingPayload)
    });

    if (beds24Response.status === 429) {
      console.warn('[Beds24 POST] Rate limit (429) detectado. Reintentando en 2.5 segundos...');
      await new Promise(res => setTimeout(res, 2500));
      beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
        method: 'POST',
        headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingPayload)
      });
    }

    if (!beds24Response.ok) {
      const errText = await beds24Response.text();
      console.error("[Reservas POST] Error en respuesta Beds24 HTTP:", errText);
      if (beds24Response.status === 429 || errText.includes('Credit limit exceeded')) {
        return NextResponse.json({ 
          error: '⏳ El servidor de Beds24 está temporalmente en su límite de solicitudes por minuto. Por favor, reintenta en 10 segundos.' 
        }, { status: 429 });
      }
      throw new Error(`Beds24 rechazó la reserva: ${errText}`);
    }

    const dataB24 = await beds24Response.json();
    console.log("[Reservas POST] Respuesta Beds24 JSON:", JSON.stringify(dataB24, null, 2));
    
    // Validar errores individuales en el array de respuesta de Beds24 v2 (soporta array directo u objeto con campo data)
    const resultsArray = Array.isArray(dataB24) ? dataB24 : (dataB24 && Array.isArray(dataB24.data) ? dataB24.data : []);
    const firstResult = resultsArray[0];

    if (firstResult && firstResult.success === false) {
      const errorMsg = firstResult.errors 
        ? firstResult.errors.map((e: any) => `${e.field}: ${e.message}`).join(', ')
        : firstResult.message || 'Error individual en Beds24';
      console.error("[Reservas POST] Falló creación en Beds24:", errorMsg);
      return NextResponse.json({ error: `Beds24 rechazó la reserva: ${errorMsg}` }, { status: 400 });
    }

    const bookingId = firstResult
      ? (firstResult.id || firstResult.bookId || firstResult.new?.id || firstResult.new?.bookId || (firstResult.info && firstResult.info[0]?.id))
      : null;

    // Guardar ajustes de portal si se especificaron
    if (portalSettings && bookingId) {
      try {
        await supabase
          .from('booking_portal_settings')
          .upsert({
            booking_id: String(bookingId),
            show_card_payment: portalSettings.showCardPayment ?? true,
            transfer_account: portalSettings.transferAccount ?? 'santander',
            language: portalSettings.language || detectLanguageFromPhone(phone)
          });
      } catch (dbErr) {
        console.error("Error al guardar portal settings Beds24:", dbErr);
      }
    }

    // Enviar WhatsApp en segundo plano para Beds24 (busca en la raíz, en el objeto 'new' o en 'info')
    if (!isBlock && phone && bookingId && sendWhatsApp) {
      (async () => {
        try {
          const physicalName = unitId ? (UNIT_TO_ROOM[String(unitId)] || String(unitId)) : '';
          const bookingIdStr = String(bookingId);
          const bookingForWA = {
            id: bookingIdStr,
            guest_name: guestName || 'Huésped',
            phone: phone,
            room_name: `Habitación ${physicalName}`,
            check_in: checkIn,
            check_out: checkOut,
            price: price ? Number(price) : 0,
            deposit: deposit ? Number(deposit) : 0,
            nights: Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24))),
            num_adult: numAdult ? Number(numAdult) : 1,
            num_child: numChild ? Number(numChild) : 0
          };

          // Verificar que no se haya enviado ya este mensaje a esta reserva
          const templateName = bookingForWA.deposit > 0 ? 'reservacion_confirmada' : 'solicitud_recibida';
          const { data: dbCheckin } = await supabase
            .from('checkins')
            .select('status')
            .eq('reservation_id', bookingIdStr.toLowerCase().trim())
            .maybeSingle();

          if (dbCheckin?.status === 'checked_in' || dbCheckin?.status === 'checked_out') {
            console.log(`[WA reservas B24] Huésped ya hizo check-in, omitiendo confirmación.`);
            return;
          }

          const { data: existingLog } = await supabase
            .from('whatsapp_logs')
            .select('id')
            .eq('reservation_id', bookingIdStr)
            .in('template_name', ['solicitud_recibida', 'reservacion_confirmada', 'pago_anticipo_recibido'])
            .limit(1);

          if (existingLog && existingLog.length > 0) {
            console.log(`[WA reservas B24] Omitiendo, ya se envió mensaje inicial a reserva ${bookingIdStr}`);
            return;
          }

          let waRes;
          if (bookingForWA.deposit > 0) {
            waRes = await sendTemplate3_ReservacionConfirmada(bookingForWA);
            if (waRes?.success) {
              await supabase.from('whatsapp_logs').insert([{
                reservation_id: bookingIdStr,
                template_name: 'reservacion_confirmada',
                phone: phone
              }]);
              console.log(`[WA reservas B24] reservacion_confirmada enviado a reserva ${bookingIdStr}`);
            }
          } else {
            console.log(`[WA reservas B24] Reserva sin anticipo ${bookingIdStr} agendada en NUEVAS. Esperando clic en REVISADO para enviar Mensaje 1.`);
          }
        } catch (waErr) {
          console.error("Error en WhatsApp Beds24:", waErr);
        }
      })();
    }

    // Sincronizar de inmediato la reserva recién creada en Supabase (Supabase-First)
    if (bookingId) {
      try {
        console.log(`[Reservas POST] Sincronizando reserva recién creada en Beds24 (${bookingId}) en Supabase...`);
        const b24FetchRes = await fetch(`https://api.beds24.com/v2/bookings?id=${bookingId}&includeInvoiceItems=true`, {
          method: 'GET',
          headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
          cache: 'no-store'
        });
        if (b24FetchRes.ok) {
          const fetchJson = await b24FetchRes.json();
          const freshBooking = fetchJson.data?.[0];
          if (freshBooking) {
            const { syncBeds24BookingLocal } = await import('@/lib/beds24');
            await syncBeds24BookingLocal(freshBooking);
            console.log(`[Reservas POST] ✅ Reserva ${bookingId} sincronizada con éxito en Supabase.`);
          }
        }
      } catch (syncErr) {
        console.error(`[Reservas POST] Error sincronizando reserva creada ${bookingId}:`, syncErr);
      }
    }

    // Invalidar caché tras creación
    clearBeds24Cache();

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

      // Enviar WhatsApp de disponibilidad liberada
      try {
        await sendTemplate4_DisponibilidadLiberada(localRes);
      } catch (waErr) {
        console.error("[Reservas DELETE] Error sending WhatsApp cancellation for local booking:", waErr);
      }

      return NextResponse.json({ 
        success: true, 
        message: "Reserva local cancelada y liberada.", 
        data: { data: [{ id, success: true }] } 
      });
    }

    const BEDS24_TOKEN = await getBeds24Token();

    // Obtener detalles de la reserva de Beds24 antes de cancelarla
    let bookingForWA: any = null;
    let bookingB24Raw: any = null;
    try {
      // Agregamos un rango de fechas muy amplio para asegurar que encuentre reservas futuras o pasadas por ID
      const b24Res = await fetch(`https://api.beds24.com/v2/bookings?id=${id}&arrivalFrom=2024-01-01&arrivalTo=2035-12-31&includeCancelled=true`, {
        headers: { 'token': BEDS24_TOKEN }
      });
      if (b24Res.ok) {
        const b24Json = await b24Res.json();
        let dataList = b24Json.data || [];

        if (b24Json.success && dataList.length === 0) {
          const b24ResCancel = await fetch(`https://api.beds24.com/v2/bookings?id=${id}&arrivalFrom=2024-01-01&arrivalTo=2035-12-31&status=cancelled`, {
            headers: { 'token': BEDS24_TOKEN }
          });
          if (b24ResCancel.ok) {
            const b24JsonCancel = await b24ResCancel.json();
            if (b24JsonCancel.success && b24JsonCancel.data && b24JsonCancel.data.length > 0) {
              dataList = b24JsonCancel.data;
            }
          }
        }

        if (b24Json.success && dataList.length > 0) {
          const b = dataList[0];
          bookingB24Raw = b;
          bookingForWA = {
            id: id.toString(),
            guest_name: b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : (b.guestName || 'Huésped'),
            phone: b.phone || b.mobile || b.guestPhone || '',
            arrival: b.arrival || null,
            departure: b.departure || null,
            roomId: b.roomId || null,
            unitId: b.unitId || null
          };
        }
      }
    } catch (err) {
      console.error("Error fetching reservation from Beds24 before cancellation:", err);
    }

    if (!bookingForWA) {
      return NextResponse.json({ 
        error: "Beds24 no devolvió los detalles de la reserva. Verifique que el ID de reserva sea correcto." 
      }, { status: 400 });
    }

    // 1. Cancelar en Beds24
    const cancelPayload = {
      id: Number(id),
      status: 'cancelled'
    };

    let beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify([cancelPayload])
    });

    if (beds24Response.status === 429) {
      console.warn('[Beds24 DELETE] Rate limit (429) detectado. Reintentando en 2.5 segundos...');
      await new Promise(res => setTimeout(res, 2500));
      beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
        method: 'POST',
        headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify([cancelPayload])
      });
    }

    if (!beds24Response.ok) {
      const errText = await beds24Response.text();
      if (beds24Response.status === 429 || errText.includes('Credit limit exceeded')) {
        return NextResponse.json({ 
          error: '⏳ El servidor de Beds24 está temporalmente en su límite de solicitudes por minuto. Por favor, reintenta en 10 segundos.' 
        }, { status: 429 });
      }
      throw new Error(`Beds24 rechazó la cancelación: ${errText}`);
    }

    // 2. Liberar registro de checkin local en Supabase si existía
    await supabase.from('checkins').delete().eq('reservation_id', id.toString());

    const dataB24 = await beds24Response.json();

    // Validar errores individuales en el array de respuesta de Beds24 v2 (soporta array directo u objeto con data)
    const resultsArray = Array.isArray(dataB24) ? dataB24 : (dataB24 && Array.isArray(dataB24.data) ? dataB24.data : []);
    const firstResult = resultsArray[0];
    if (firstResult && firstResult.success === false) {
      const errorMsg = firstResult.errors 
        ? firstResult.errors.map((e: any) => `${e.field}: ${e.message}`).join(', ')
        : firstResult.message || 'Error individual al cancelar en Beds24';
      return NextResponse.json({ error: `Beds24 rechazó la cancelación: ${errorMsg}` }, { status: 400 });
    }

    // Enviar WhatsApp de disponibilidad liberada para Beds24
    if (bookingForWA) {
      try {
        await sendTemplate4_DisponibilidadLiberada(bookingForWA);
      } catch (waErr) {
        console.error("[Reservas DELETE] Error sending WhatsApp cancellation for Beds24 booking:", waErr);
      }
    }

    // Actualizar de inmediato en Supabase local (Supabase-First)
    if (bookingB24Raw) {
      try {
        const { syncBeds24BookingLocal } = await import('@/lib/beds24');
        const b24CancelledObj = {
          ...bookingB24Raw,
          status: '0' // cancelado en Beds24
        };
        await syncBeds24BookingLocal(b24CancelledObj);
        console.log(`[Reservas DELETE] ✅ Estado cancelado sincronizado síncronamente en Supabase para B24:${id}`);
      } catch (syncErr) {
        console.error("[Reservas DELETE] Error al sincronizar cancelación local:", syncErr);
      }
    }

    // Invalidar caché de Beds24 ya que acabamos de cancelar una reserva
    clearBeds24Cache();

    return NextResponse.json({ success: true, message: "Reserva cancelada en Beds24 y liberada localmente.", data: dataB24 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT: Modificar datos de una reserva en Beds24 y en Supabase (habitación, nombre, teléfono, pax, tarifa)
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, roomName, guestName, phone, numAdult, numChild, price, notes, deposit, checkIn, checkOut, portalSettings, preview } = body;

    if (!id) {
      return NextResponse.json({ error: 'Falta el parámetro id' }, { status: 400 });
    }

    if (body.action === 'reactivate') {
      // 1. Intentamos buscar si la reserva es local en Supabase
      const { data: localRes } = await supabase
        .from('local_reservas')
        .select('*')
        .eq('id', Number(id))
        .maybeSingle();

      if (localRes) {
        // Es local! Reactivar localmente en Supabase como 'pending' (nueva) y resetear banderas de avisos
        const { error: reactivateErr } = await supabase
          .from('local_reservas')
          .update({ 
            status: 'pending',
            last_notice_sent: false,
            is_acknowledged: false
          })
          .eq('id', Number(id));

        if (reactivateErr) {
          console.error("[Reservas PUT Reactivate] Error reactivating local reservation:", reactivateErr);
          return NextResponse.json({ error: reactivateErr.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: "Reserva local reactivada con éxito." });
      }

      // 2. Reactivar en Beds24
      const BEDS24_TOKEN = await getBeds24Token();

      // Las reservas reactivadas siempre regresan a status 'request' (Pendiente / Nueva)
      const reactivatePayload = {
        id: Number(id),
        status: 'request'
      };

      const beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
        method: 'POST',
        headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify([reactivatePayload])
      });

      if (!beds24Response.ok) {
        const errText = await beds24Response.text();
        return NextResponse.json({ error: `Beds24 rechazó la reactivación: ${errText}` }, { status: 400 });
      }

      const dataB24 = await beds24Response.json();
      const resultsArray = Array.isArray(dataB24) ? dataB24 : (dataB24 && Array.isArray(dataB24.data) ? dataB24.data : []);
      const firstResult = resultsArray[0];
      if (firstResult && firstResult.success === false) {
        const errorMsg = firstResult.errors 
          ? firstResult.errors.map((e: any) => `${e.field}: ${e.message}`).join(', ')
          : firstResult.message || 'Error individual al reactivar en Beds24';
        return NextResponse.json({ error: `Beds24 rechazó la reactivación: ${errorMsg}` }, { status: 400 });
      }

      // Sincronizar de inmediato localmente
      try {
        const { syncBeds24BookingLocal } = await import('@/lib/beds24');
        const b24ResFull = await fetch(`https://api.beds24.com/v2/bookings?id=${id}&arrivalFrom=2024-01-01&arrivalTo=2035-12-31`, {
          headers: { 'token': BEDS24_TOKEN }
        });
        if (b24ResFull.ok) {
          const b24JsonFull = await b24ResFull.json();
          const rawBooking = b24JsonFull.data?.[0];
          if (rawBooking) {
            // Esto guardará la reserva con status 'pending' (debido a status 'request' de Beds24)
            await syncBeds24BookingLocal(rawBooking);

            // Restablecer las banderas de aviso en nuestra base de datos para habilitar enviar último aviso de nuevo
            await supabase
              .from('beds24_reservations')
              .update({
                last_notice_sent: false,
                is_acknowledged: false
              })
              .eq('id', String(id));
          }
        }
      } catch (syncErr) {
        console.error("[Reservas PUT Reactivate] Error al sincronizar tras reactivación:", syncErr);
      }

      return NextResponse.json({ success: true, message: "Reserva reactivada con éxito en Beds24." });
    }

    // Guardar ajustes de portal si vienen en la petición
    if (portalSettings) {
      try {
        const updateObj: any = {
          booking_id: String(id)
        };
        if (portalSettings.showCardPayment !== undefined) updateObj.show_card_payment = portalSettings.showCardPayment;
        if (portalSettings.transferAccount !== undefined) updateObj.transfer_account = portalSettings.transferAccount;
        if (portalSettings.language !== undefined) updateObj.language = portalSettings.language;

        await supabase
          .from('booking_portal_settings')
          .upsert(updateObj);
      } catch (dbErr) {
        console.error("[Reservas PUT] Error al guardar portal settings:", dbErr);
      }
    }

    // 1. Intentamos buscar si la reserva es local en Supabase
    const { data: localRes } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('id', Number(id))
      .maybeSingle();

    if (localRes) {
      if (preview) {
        return NextResponse.json({
          success: true,
          preview: true,
          old_price: localRes.price || 0,
          recalculated_price: localRes.price || 0,
          price_changed: false,
          same_room_type: true
        });
      }
      // Es local! Modificar localmente
      const localUpdate: any = {};
      if (guestName) localUpdate.guest_name = guestName;
      if (phone !== undefined) localUpdate.phone = phone;
      if (numAdult !== undefined) localUpdate.num_adult = Number(numAdult);
      if (numChild !== undefined) localUpdate.num_child = Number(numChild);
      if (price !== undefined) localUpdate.price = Number(price);
      if (deposit !== undefined) localUpdate.deposit = Number(deposit);
      if (notes !== undefined) localUpdate.notes = notes;
      if (checkIn) localUpdate.check_in = checkIn;
      if (checkOut) localUpdate.check_out = checkOut;
      
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
      if (checkIn) dbUpdate.check_in_date = checkIn;
      if (checkOut) dbUpdate.check_out_date = checkOut;

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

    if (checkIn) {
      updatePayload.arrival = checkIn;
    }
    if (checkOut) {
      updatePayload.departure = checkOut;
    }

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

    // ── Recálculo automático de tarifas al reasignar habitación ──────────────
    // Si solo viene roomName (reasignación pura, sin price explícito), obtenemos la reserva,
    // consultamos las tarifas de la nueva habitación y recalculamos el total.
    let recalculatedPrice: number | undefined = undefined;
    let currentBooking: any = null;

    // Siempre obtener la reserva actual si es reasignación O si se está cambiando el precio manualmente
    if (roomName || price !== undefined) {
      try {
        let getRes = await fetch(`https://api.beds24.com/v2/bookings?id[]=${id}&includeInvoiceItems=true`, {
          headers: { 
            'token': BEDS24_TOKEN,
            'Content-Type': 'application/json'
          }
        });
        let getJson = await getRes.json().catch(() => null);

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
          console.log(`[Reservas PUT] Reserva ${id} recuperada exitosamente. Ítems: ${currentBooking.invoiceItems?.length || 0}`);
        } else {
          console.error(`[Reservas PUT] Error: no se pudo recuperar la reserva ${id}. Respuesta:`, getJson);
        }
      } catch (getErr) {
        console.error("[Reservas PUT] Error fetching current booking:", getErr);
      }
    }

    // Recalcular tarifa si hay cambios reales en las fechas o en el tipo de habitación (roomId)
    if (price === undefined && currentBooking) {
      try {
        const arrival = checkIn || currentBooking.arrival;
        const departure = checkOut || currentBooking.departure;
        const newRoomId = updatePayload.roomId ? String(updatePayload.roomId) : (currentBooking.roomId ? String(currentBooking.roomId) : null);
        const newUnitId = updatePayload.unitId ? String(updatePayload.unitId) : (currentBooking.unitId ? String(currentBooking.unitId) : '1');

        const { getParentMapping, getAverageRatesForDates } = await import('@/lib/beds24');
        const currentParent = getParentMapping(currentBooking.roomId, currentBooking.unitId || '1');
        const newParent = getParentMapping(newRoomId, newUnitId);

        // Detectar si hay cambios reales respecto a los valores actuales
        const arrivalChanged = arrival && arrival !== currentBooking.arrival;
        const departureChanged = departure && departure !== currentBooking.departure;
        const roomTypeChanged = currentParent.roomId !== newParent.roomId;
        // También detectar cambio de unitId dentro del mismo tipo (ej: 301 → 302)
        const unitChanged = roomName && (String(currentBooking.roomId) !== String(newRoomId) || String(currentBooking.unitId || '1') !== String(newUnitId));

        // Recalcular si cambiaron las fechas O si cambió el tipo de habitación (upgrade/downgrade de categoría)
        if ((arrivalChanged || departureChanged || roomTypeChanged) && arrival && departure && newRoomId) {
          console.log(`[Reservas PUT] Detectado cambio de fechas que requiere recálculo. Rango: ${arrival} al ${departure}`);
          
          const ratesMap = await fetchBeds24RatesMap(BEDS24_TOKEN, arrival, departure);
          const nightsCount = Math.round((new Date(departure + 'T12:00:00').getTime() - new Date(arrival + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24));
          
          // Cargar dynamicSettings de Supabase para multiplicadores de canal y descuentos por estancia
          let dynamicSettings: any = null;
          try {
            const { data: settingsData } = await supabase
              .from('settings')
              .select('value')
              .eq('key', 'pricing_unit_settings')
              .maybeSingle();
            if (settingsData && settingsData.value) {
              dynamicSettings = typeof settingsData.value === 'string' ? JSON.parse(settingsData.value) : settingsData.value;
            }
          } catch (dsErr) {
            console.warn("[Reservas PUT] No se pudieron cargar dynamicSettings:", dsErr);
          }

          // Detectar canal de la reserva para aplicar multiplicadores correctos
          const rawSource = String(`${currentBooking.referer || ''} ${currentBooking.source || ''} ${currentBooking.apiSource || ''} ${currentBooking.apiReference || ''}`).toLowerCase();

          const averagePrice = getAverageRatesForDates(
            newParent.roomId,
            arrival,
            departure,
            rawSource || 'Directo',
            ratesMap,
            newParent.unitId,
            dynamicSettings
          );
          
          const totalNewPrice = Math.round(averagePrice * nightsCount);
          const oldPrice = currentBooking.price || 0;

          if (totalNewPrice > 0 && totalNewPrice !== oldPrice) {
            recalculatedPrice = totalNewPrice;
            console.log(`[Reservas PUT] Tarifa recalculada por cambio de fechas: $${oldPrice} → $${totalNewPrice}`);
          }
        } else {
          console.log(`[Reservas PUT] Reasignación de habitación o sin cambio de fechas. Manteniendo tarifa original.`);
        }
      } catch (rateErr) {
        console.error("[Reservas PUT] Error recalculando tarifas:", rateErr);
      }
    }

    // Si es una petición de vista previa, retornar el precio actual sin marcar cambios
    if (preview) {
      const currentRoomId = currentBooking?.roomId ? String(currentBooking.roomId) : null;
      const newRoomId = updatePayload.roomId ? String(updatePayload.roomId) : currentRoomId;
      
      const { getParentMapping } = await import('@/lib/beds24');
      const currentParent = getParentMapping(currentBooking?.roomId, currentBooking?.unitId || '1');
      const newParent = getParentMapping(newRoomId, updatePayload.unitId || currentBooking?.unitId || '1');
      const roomTypeChanged = currentParent.roomId !== newParent.roomId;

      return NextResponse.json({
        success: true,
        preview: true,
        old_price: currentBooking?.price || 0,
        recalculated_price: currentBooking?.price || 0,
        price_changed: false,
        same_room_type: !roomTypeChanged
      });
    }

    // Determinar el precio final a usar (explícito > recalculado > original)
    // Si no hay recálculo automático y no viene un precio explícito, enviamos el precio actual de la reserva.
    // Esto previene que los servidores de Beds24 recalculen e impongan tarifas por defecto.
    const finalPrice = price !== undefined 
      ? Number(price) 
      : (recalculatedPrice !== undefined 
          ? recalculatedPrice 
          : (currentBooking ? Number(currentBooking.price) : undefined));

    if (finalPrice !== undefined) {
      updatePayload.price = finalPrice;
      // Actualizar la factura de Beds24 con el precio final (explícito o recalculado)
      const currentItems = (currentBooking && Array.isArray(currentBooking.invoiceItems)) 
        ? currentBooking.invoiceItems.filter((item: any) => {
            const itemBookingId = String(item.bookingId || item.bookId || '');
            return !itemBookingId || itemBookingId === String(id);
          })
        : [];
      const charges = currentItems.filter((item: any) => Number(item.qty || 0) > 0);
      const invoiceItemsUpdate: any[] = [];
      
      if (charges.length > 0) {
        const firstCharge = charges[0];
        invoiceItemsUpdate.push({
          id: firstCharge.id,
          description: firstCharge.description || "Room Charge",
          qty: 1,
          amount: finalPrice
        });
        for (let i = 1; i < charges.length; i++) {
          invoiceItemsUpdate.push({
            id: charges[i].id,
            description: "",
            qty: "",
            amount: "",
            status: ""
          });
        }
      } else {
        invoiceItemsUpdate.push({
          description: "Room Charge",
          qty: 1,
          amount: finalPrice
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
    let beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify([updatePayload])
    });

    if (beds24Response.status === 429) {
      console.warn('[Beds24 PUT] Rate limit (429) detectado. Reintentando en 2.5 segundos...');
      await new Promise(res => setTimeout(res, 2500));
      beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
        method: 'POST',
        headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify([updatePayload])
      });
    }

    if (!beds24Response.ok) {
      const errText = await beds24Response.text();
      if (beds24Response.status === 429 || errText.includes('Credit limit exceeded')) {
        return NextResponse.json({ 
          error: '⏳ El servidor de Beds24 está temporalmente en su límite de solicitudes por minuto. Por favor, reintenta en 10 segundos.' 
        }, { status: 429 });
      }
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
    if (checkIn) {
      dbUpdate.check_in_date = checkIn;
    }
    if (checkOut) {
      dbUpdate.check_out_date = checkOut;
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

    // Sincronizar de inmediato la reserva modificada en Supabase (Supabase-First)
    try {
      console.log(`[Reservas PUT] Sincronizando reserva modificada B24:${id} en Supabase...`);
      const { getBeds24Token } = await import('@/lib/beds24');
      const BEDS24_TOKEN = await getBeds24Token();
      const b24FetchRes = await fetch(`https://api.beds24.com/v2/bookings?id=${id}&includeInvoiceItems=true`, {
        method: 'GET',
        headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
        cache: 'no-store'
      });
      if (b24FetchRes.ok) {
        const fetchJson = await b24FetchRes.json();
        const freshBooking = fetchJson.data?.[0];
        if (freshBooking) {
          const { syncBeds24BookingLocal } = await import('@/lib/beds24');
          await syncBeds24BookingLocal(freshBooking);
          console.log(`[Reservas PUT] ✅ Reserva ${id} Sincronizada con éxito en Supabase.`);
        }
      }
    } catch (syncErr) {
      console.error(`[Reservas PUT] Error al sincronizar reserva modificada ${id}:`, syncErr);
    }

    // Invalidar caché tras modificación
    clearBeds24Cache();

    return NextResponse.json({ 
      success: true, 
      message: `Reserva actualizada exitosamente.`, 
      room_name: displayRoomName,
      recalculated_price: recalculatedPrice || undefined,
      old_price: currentBooking?.price || undefined,
      data: dataB24 
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
