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
      const fortyEightHoursAgoStr = formatter.format(new Date(Date.now() - 48 * 60 * 60 * 1000));
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      // Traer las no canceladas operativas (checkout en últimas 48h o futuro)
      // y únicamente las canceladas recientes (< 48 horas y checkout en ventana operativa)
      query = query.or(`and(status.neq.cancelled,check_out.gte.${fortyEightHoursAgoStr}),and(status.eq.cancelled,check_out.gte.${fortyEightHoursAgoStr},updated_at.gte.${fortyEightHoursAgo})`);
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
        commission: (b.commission !== undefined && Number(b.commission) > 0)
          ? Number(b.commission)
          : Number((b.invoice_items || []).find((it: any) => it.metaType === 'beds24_commission_info')?.commission || 0),
        rate_description: b.rate_description || (b.invoice_items || []).find((it: any) => it.metaType === 'beds24_commission_info')?.rateDescription || '',
        rateDescription: b.rate_description || (b.invoice_items || []).find((it: any) => it.metaType === 'beds24_commission_info')?.rateDescription || '',
        last_notice_sent: Boolean(b.last_notice_sent),
        is_acknowledged: Boolean(b.is_acknowledged),
        booking_time: b.created_at || b.check_in || null,
        cancelled_at: b.status === 'cancelled' 
          ? (b.cancelled_at || (b.invoice_items || []).find((it: any) => it.metaType === 'beds24_commission_info')?.cancelTime || b.updated_at || null)
          : null
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
          const chKey = (b.channel || 'directo').toLowerCase().trim();
          const isOta = ['booking.com', 'airbnb', 'expedia'].some(c => (b.channel || '').toLowerCase().includes(c));
          if (isOta) {
            key = `ota_${chKey}_${guestKey}_${b.check_in}_${b.check_out}`;
          } else if (phoneKey) {
            key = `phone_${chKey}_${phoneKey}_${b.check_in}_${b.check_out}`;
          } else {
            key = `name_${chKey}_${guestKey}_${b.check_in}_${b.check_out}`;
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
        const isOta = b.channel && ['airbnb', 'booking', 'expedia'].some((c: string) => b.channel.toLowerCase().includes(c));
        if (isCheckedIn || isCheckedOut) {
          const bPrice = Number(b.price_estimate || b.price || 0);
          b.deposit = bPrice;
          b.balance = 0;
        } else if (isOta) {
          b.deposit = 0;
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
              waRes = await sendTemplate1_SolicitudRecibida(bookingForWA);
              if (waRes?.success) {
                await supabase.from('whatsapp_logs').insert([{
                  reservation_id: bookingIdStr,
                  template_name: 'solicitud_recibida',
                  phone: data.phone
                }]);
                console.log(`[WA reservas local] solicitud_recibida enviado al instante a reserva ${bookingIdStr}`);
              }
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
      ...(!isBlock && price !== undefined && price !== null ? { 
        price: Number(price),
        invoiceItems: [
          {
            description: '[ROOMNAME1] | [FIRSTNIGHT] - [LEAVINGDAY]',
            type: 'charge',
            amount: Number(price),
            qty: 1,
            vatRate: 19
          },
          {
            description: 'IVA 16% (Incluido en el precio)',
            type: 'charge',
            amount: 0,
            qty: 1,
            vatRate: 0
          },
          {
            description: 'Tax Hospedaje 3% (Incluido en el precio)',
            type: 'charge',
            amount: 0,
            qty: 1,
            vatRate: 0
          }
        ]
      } : {}),
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
        checkAvailability: false,
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
            waRes = await sendTemplate1_SolicitudRecibida(bookingForWA);
            if (waRes?.success) {
              await supabase.from('whatsapp_logs').insert([{
                reservation_id: bookingIdStr,
                template_name: 'solicitud_recibida',
                phone: phone
              }]);
              console.log(`[WA reservas B24] solicitud_recibida enviado al instante a reserva ${bookingIdStr}`);
            }
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
      const localChannel = String(localRes.channel || '').toLowerCase();
      const isLocalOTA = ['airbnb', 'booking', 'expedia', 'vrbo'].some(ota => localChannel.includes(ota));
      if (isLocalOTA) {
        return NextResponse.json({ 
          error: `No está permitido cancelar reservaciones de canales OTA (${localRes.channel}) desde la app. La cancelación debe gestionarse directamente desde el portal del canal para evitar penalizaciones.` 
        }, { status: 403 });
      }

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
            firstName: b.firstName || '',
            lastName: b.lastName || '',
            guest_name: `${b.firstName || ''} ${b.lastName || ''}`.trim() || b.guestName || 'Huésped',
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

    // Validar si la reserva proviene de un canal OTA (Airbnb, Booking.com, Expedia)
    if (bookingB24Raw) {
      const rawChannel = String(bookingB24Raw.channel || bookingB24Raw.referer || '').toLowerCase();
      const isOTA = ['airbnb', 'booking', 'expedia', 'vrbo'].some(ota => rawChannel.includes(ota));
      if (isOTA) {
        return NextResponse.json({ 
          error: `No está permitido cancelar reservaciones de canales OTA (${bookingB24Raw.channel || 'OTA'}) desde la app. La cancelación debe gestionarse directamente desde el portal del canal para evitar penalizaciones y desincronización de inventario.` 
        }, { status: 403 });
      }
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

    // Enviar WhatsApp de disponibilidad liberada al instante con deduplicación
    if (bookingForWA && bookingForWA.phone) {
      try {
        const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
        const { data: recentCancelLog } = await supabase
          .from('whatsapp_logs')
          .select('id')
          .eq('phone', bookingForWA.phone)
          .eq('template_name', 'disponibilidad_liberada')
          .gte('sent_at', threeMinutesAgo)
          .limit(1);

        if (!recentCancelLog || recentCancelLog.length === 0) {
          const waRes = await sendTemplate4_DisponibilidadLiberada(bookingForWA, true);
          if (waRes.success) {
            await supabase.from('whatsapp_logs').insert([{
              reservation_id: id.toString(),
              template_name: 'disponibilidad_liberada',
              phone: bookingForWA.phone,
              sent_at: new Date().toISOString(),
              status: 'sent'
            }]);
            console.log(`[Reservas DELETE] ✅ WhatsApp disponibilidad_liberada enviado al instante para B24:${id}`);
          }
        }
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
      let targetIds: string[] = [];
      if (Array.isArray(body.ids) && body.ids.length > 0) {
        targetIds = body.ids.map((i: any) => String(i));
      } else if (id) {
        targetIds = [String(id)];
      }

      // Buscar exhaustivamente todas las reservas hermanas del grupo en Supabase/Beds24 para cualquier ID recibido
      try {
        const expandedIds = new Set<string>(targetIds);
        for (const mainId of targetIds) {
          // 1. Buscar en beds24_reservations
          const { data: mainB24 } = await supabase
            .from('beds24_reservations')
            .select('*')
            .eq('id', mainId)
            .maybeSingle();

          if (mainB24) {
            const cleanPhone = normalizePhone(mainB24.guest_phone || '');
            const cleanName = (mainB24.guest_name || '').toLowerCase().trim();
            const masterIdStr = mainB24.master_id ? String(mainB24.master_id) : null;

            // a) Buscar por master_id si existe
            if (masterIdStr) {
              const { data: masterSiblings } = await supabase
                .from('beds24_reservations')
                .select('id')
                .or(`master_id.eq.${masterIdStr},id.eq.${masterIdStr}`);
              if (masterSiblings) {
                masterSiblings.forEach((s: any) => expandedIds.add(String(s.id)));
              }
            }

            // b) Buscar donde esta reserva sea el master_id
            const { data: subSiblings } = await supabase
              .from('beds24_reservations')
              .select('id')
              .eq('master_id', mainId);
            if (subSiblings) {
              subSiblings.forEach((s: any) => expandedIds.add(String(s.id)));
            }

            // c) Buscar por fechas idénticas y coincidencia de teléfono o nombre
            if (mainB24.check_in && mainB24.check_out) {
              const { data: siblings } = await supabase
                .from('beds24_reservations')
                .select('id, guest_phone, guest_name')
                .eq('check_in', mainB24.check_in)
                .eq('check_out', mainB24.check_out)
                .neq('id', mainId);

              if (siblings && siblings.length > 0) {
                siblings.forEach((s: any) => {
                  const sPhone = normalizePhone(s.guest_phone || '');
                  const samePhone = cleanPhone && sPhone && cleanPhone.length >= 7 && (cleanPhone === sPhone || cleanPhone.endsWith(sPhone) || sPhone.endsWith(cleanPhone));
                  const sName = (s.guest_name || '').toLowerCase().trim();
                  const sameName = sName && cleanName && (sName === cleanName || sName.includes(cleanName) || cleanName.includes(sName));
                  if (samePhone || sameName) {
                    expandedIds.add(String(s.id));
                  }
                });
              }
            }
          }

          // 2. Buscar también en local_reservas por si hay habitaciones locales vinculadas
          const { data: mainLocal } = await supabase
            .from('local_reservas')
            .select('*')
            .eq('id', mainId)
            .maybeSingle();

          if (mainLocal) {
            const cleanPhone = normalizePhone(mainLocal.phone || '');
            const cleanName = (mainLocal.guest_name || '').toLowerCase().trim();

            if (mainLocal.check_in && mainLocal.check_out) {
              const { data: localSiblings } = await supabase
                .from('local_reservas')
                .select('id, phone, guest_name')
                .eq('check_in', mainLocal.check_in)
                .eq('check_out', mainLocal.check_out)
                .neq('id', mainId);

              if (localSiblings && localSiblings.length > 0) {
                localSiblings.forEach((s: any) => {
                  const sPhone = normalizePhone(s.phone || '');
                  const samePhone = cleanPhone && sPhone && cleanPhone.length >= 7 && (cleanPhone === sPhone || cleanPhone.endsWith(sPhone) || sPhone.endsWith(cleanPhone));
                  const sName = (s.guest_name || '').toLowerCase().trim();
                  const sameName = sName && cleanName && (sName === cleanName || sName.includes(cleanName) || cleanName.includes(sName));
                  if (samePhone || sameName) {
                    expandedIds.add(String(s.id));
                  }
                });
              }
            }
          }
        }
        targetIds = Array.from(expandedIds);
      } catch (groupSearchErr) {
        console.error("[Reservas PUT Reactivate] Error buscando hermanos de grupo:", groupSearchErr);
      }

      // Separar entre locales y Beds24
      const localIds: number[] = [];
      const beds24Ids: number[] = [];

      for (const tId of targetIds) {
        const isLocal = tId.startsWith('loc_') || 
                        tId.startsWith('walkin_') || 
                        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tId) || 
                        tId.length < 7;
        if (isLocal) {
          localIds.push(Number(tId));
        } else {
          beds24Ids.push(Number(tId));
        }
      }

      // 1. Reactivar en BD Local
      if (localIds.length > 0) {
        const { error: reactivateErr } = await supabase
          .from('local_reservas')
          .update({ 
            status: 'pending',
            last_notice_sent: false,
            is_acknowledged: false
          })
          .in('id', localIds);

        if (reactivateErr) {
          console.error("[Reservas PUT Reactivate] Error reactivating local reservations:", reactivateErr);
          return NextResponse.json({ error: reactivateErr.message }, { status: 500 });
        }
      }

      // 2. Reactivar en Beds24 en lote (batch)
      if (beds24Ids.length > 0) {
        const BEDS24_TOKEN = await getBeds24Token();
        const reactivatePayloads = beds24Ids.map(bId => ({
          id: Number(bId),
          status: 'request' // Las reservas reactivadas regresan a status 'request' (Pendiente / Nueva)
        }));

        const beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
          method: 'POST',
          headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify(reactivatePayloads)
        });

        if (!beds24Response.ok) {
          const errText = await beds24Response.text();
          return NextResponse.json({ error: `Beds24 rechazó la reactivación: ${errText}` }, { status: 400 });
        }

        const dataB24 = await beds24Response.json();
        const resultsArray = Array.isArray(dataB24) ? dataB24 : (dataB24 && Array.isArray(dataB24.data) ? dataB24.data : []);
        const errors = resultsArray.filter((r: any) => r.success === false);
        if (errors.length > 0 && errors.length === resultsArray.length) {
          return NextResponse.json({ error: `Beds24 rechazó la reactivación del grupo.` }, { status: 400 });
        }

        // Sincronizar de inmediato en Supabase localmente para cada miembro reactivado
        try {
          const { syncBeds24BookingLocal, clearBeds24Cache } = await import('@/lib/beds24');
          clearBeds24Cache();

          for (const bId of beds24Ids) {
            const b24ResFull = await fetch(`https://api.beds24.com/v2/bookings?id=${bId}&arrivalFrom=2024-01-01&arrivalTo=2035-12-31&includeInvoiceItems=true&includeCancelled=true`, {
              headers: { 'token': BEDS24_TOKEN }
            });
            if (b24ResFull.ok) {
              const b24JsonFull = await b24ResFull.json();
              const rawBooking = b24JsonFull.data?.[0];
              if (rawBooking) {
                await syncBeds24BookingLocal(rawBooking);
              }
            }

            // Restablecer banderas de aviso en beds24_reservations
            await supabase
              .from('beds24_reservations')
              .update({
                status: 'pending',
                last_notice_sent: false,
                is_acknowledged: false,
                updated_at: new Date().toISOString()
              })
              .eq('id', String(bId));
          }
        } catch (syncErr) {
          console.error("[Reservas PUT Reactivate] Error al sincronizar tras reactivación:", syncErr);
        }
      }

      return NextResponse.json({ 
        success: true, 
        count: targetIds.length,
        message: `Se reactivaron con éxito ${targetIds.length} condominio(s) de la reserva.` 
      });
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

    // 0. Si viene groupBookings (modificación de grupo consolidado), actualizar todos los miembros
    if (Array.isArray(body.groupBookings) && body.groupBookings.length > 0) {
      console.log(`[Reservas PUT Group] Modificando grupo de ${body.groupBookings.length} habitaciones...`);
      const BEDS24_TOKEN = await getBeds24Token();
      const beds24BatchPayload: any[] = [];
      const updatedBeds24Ids: string[] = [];

      for (const m of body.groupBookings) {
        const mIdStr = String(m.id);
        const mIdNum = Number(m.id);

        // A. Verificar si es reserva local
        const { data: localMem } = await supabase
          .from('local_reservas')
          .select('*')
          .eq('id', mIdNum)
          .maybeSingle();

        if (localMem) {
          const localUpdate: any = {};
          if (guestName) localUpdate.guest_name = guestName;
          if (phone !== undefined) localUpdate.phone = phone;
          if (m.numAdult !== undefined) localUpdate.num_adult = Number(m.numAdult);
          if (m.numChild !== undefined) localUpdate.num_child = Number(m.numChild);
          if (m.price !== undefined) localUpdate.price = Number(m.price);
          if (m.deposit !== undefined) localUpdate.deposit = Number(m.deposit);
          if (notes !== undefined) localUpdate.notes = notes;
          if (checkIn) localUpdate.check_in = checkIn;
          if (checkOut) localUpdate.check_out = checkOut;

          await supabase.from('local_reservas').update(localUpdate).eq('id', mIdNum);

          const dbUpdate: any = {};
          if (guestName) dbUpdate.guest_name = guestName;
          if (checkIn) dbUpdate.check_in_date = checkIn;
          if (checkOut) dbUpdate.check_out_date = checkOut;
          if (Object.keys(dbUpdate).length > 0) {
            await supabase.from('checkins').update(dbUpdate).eq('reservation_id', mIdStr);
          }
        } else {
          // B. Es reserva Beds24
          const b24Item: any = {
            id: mIdNum,
            bookId: mIdNum
          };
          if (checkIn) b24Item.arrival = checkIn;
          if (checkOut) b24Item.departure = checkOut;

          if (guestName) {
            const nameParts = guestName.trim().split(/\s+/);
            if (nameParts.length > 1) {
              b24Item.firstName = nameParts[0];
              b24Item.lastName = nameParts.slice(1).join(' ');
            } else {
              b24Item.firstName = guestName.trim();
              b24Item.lastName = '';
            }
          }
          if (phone !== undefined) {
            b24Item.phone = phone;
            b24Item.mobile = phone;
          }
          if (m.numAdult !== undefined) b24Item.numAdult = Number(m.numAdult);
          if (m.numChild !== undefined) b24Item.numChild = Number(m.numChild);
          if (notes !== undefined) b24Item.notes = notes;
          if (m.deposit !== undefined) b24Item.deposit = Number(m.deposit);

          let currentMemBooking: any = null;
          try {
            const getRes = await fetch(`https://api.beds24.com/v2/bookings?id=${mIdStr}&includeInvoiceItems=true`, {
              headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
              cache: 'no-store'
            });
            const getJson = await getRes.json().catch(() => null);
            if (getJson && getJson.data && getJson.data.length > 0) {
              currentMemBooking = getJson.data[0];
            }
          } catch (e) {
            console.error(`[Reservas PUT Group] Error fetching member ${mIdStr}:`, e);
          }

          if (m.price !== undefined) {
            const finalPrice = Number(m.price);
            b24Item.price = finalPrice;
            
            const currentItems = (currentMemBooking && Array.isArray(currentMemBooking.invoiceItems))
              ? currentMemBooking.invoiceItems.filter((item: any) => {
                  const itemBookingId = String(item.bookingId || item.bookId || '');
                  return !itemBookingId || itemBookingId === mIdStr;
                })
              : [];
            const charges = currentItems.filter((item: any) => item.type === 'charge' || !item.type);
            const invoiceItemsUpdate: any[] = [];

            let mainRoomCharge = charges.find((c: any) => 
              (c.description || '').includes('[ROOMNAME1]') || 
              (c.description || '').toLowerCase().includes('room charge')
            );
            const ivaCharge = charges.find((c: any) => 
              (c.description || '').toLowerCase().includes('iva')
            );
            const lodgingTaxCharge = charges.find((c: any) => 
              (c.description || '').toLowerCase().includes('hospedaje') || 
              (c.description || '').toLowerCase().includes('tax')
            );

            if (!mainRoomCharge) {
              mainRoomCharge = charges.find((c: any) => c !== ivaCharge && c !== lodgingTaxCharge);
            }

            if (mainRoomCharge && mainRoomCharge.id) {
              invoiceItemsUpdate.push({
                id: mainRoomCharge.id,
                description: '[ROOMNAME1] | [FIRSTNIGHT] - [LEAVINGDAY]',
                qty: 1,
                amount: finalPrice,
                vatRate: 19
              });
            } else {
              invoiceItemsUpdate.push({
                description: '[ROOMNAME1] | [FIRSTNIGHT] - [LEAVINGDAY]',
                qty: 1,
                amount: finalPrice,
                vatRate: 19
              });
            }

            if (ivaCharge && ivaCharge.id) {
              invoiceItemsUpdate.push({
                id: ivaCharge.id,
                description: 'IVA 16% (Incluido en el precio)',
                qty: 1,
                amount: 0,
                vatRate: 0
              });
            }

            if (lodgingTaxCharge && lodgingTaxCharge.id) {
              invoiceItemsUpdate.push({
                id: lodgingTaxCharge.id,
                description: 'Tax Hospedaje 3% (Incluido en el precio)',
                qty: 1,
                amount: 0,
                vatRate: 0
              });
            }

            // Poner en 0 cualquier cargo duplicado previo para limpiar el folio de Beds24
            charges.forEach((c: any) => {
              if (c.id && c !== mainRoomCharge && c !== ivaCharge && c !== lodgingTaxCharge) {
                invoiceItemsUpdate.push({
                  id: c.id,
                  amount: 0
                });
              }
            });

            b24Item.invoiceItems = invoiceItemsUpdate;
          }

          beds24BatchPayload.push(b24Item);
          updatedBeds24Ids.push(mIdStr);
        }
      }

      // Enviar a Beds24 en lote
      if (beds24BatchPayload.length > 0) {
        let b24Res = await fetch('https://api.beds24.com/v2/bookings', {
          method: 'POST',
          headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify(beds24BatchPayload)
        });

        if (b24Res.status === 429) {
          await new Promise(res => setTimeout(res, 2500));
          b24Res = await fetch('https://api.beds24.com/v2/bookings', {
            method: 'POST',
            headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify(beds24BatchPayload)
          });
        }

        if (!b24Res.ok) {
          const errText = await b24Res.text();
          console.error("[Reservas PUT Group] Error en respuesta Beds24:", errText);
          throw new Error(`Beds24 rechazó la modificación del grupo: ${errText}`);
        }

        // Actualizar Supabase y checkins para cada miembro de Beds24
        for (const bId of updatedBeds24Ids) {
          try {
            const dbUpdate: any = {};
            if (guestName) dbUpdate.guest_name = guestName;
            if (checkIn) dbUpdate.check_in_date = checkIn;
            if (checkOut) dbUpdate.check_out_date = checkOut;
            if (Object.keys(dbUpdate).length > 0) {
              await supabase.from('checkins').update(dbUpdate).eq('reservation_id', bId);
            }

            const b24FetchRes = await fetch(`https://api.beds24.com/v2/bookings?id=${bId}&includeInvoiceItems=true`, {
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
              }
            }
          } catch (syncErr) {
            console.error(`[Reservas PUT Group] Error sincronizando miembro ${bId}:`, syncErr);
          }
        }
      }

      clearBeds24Cache();

      return NextResponse.json({
        success: true,
        message: `Grupo de ${body.groupBookings.length} habitaciones actualizado exitosamente.`,
        count: body.groupBookings.length
      });
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
        let getRes = await fetch(`https://api.beds24.com/v2/bookings?id=${id}&includeInvoiceItems=true`, {
          headers: { 
            'token': BEDS24_TOKEN,
            'Content-Type': 'application/json'
          },
          cache: 'no-store'
        });
        let getJson = await getRes.json().catch(() => null);

        if (!getJson || !getJson.data || getJson.data.length === 0) {
          console.log(`[Reservas PUT] No se encontró reserva usando id[]=${id}, probando fallback con id=${id}`);
          getRes = await fetch(`https://api.beds24.com/v2/bookings?id=${id}&includeInvoiceItems=true`, {
            headers: { 
              'token': BEDS24_TOKEN,
              'Content-Type': 'application/json'
            },
            cache: 'no-store'
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

    let roomTypeChanged = false;

    // Recalcular tarifa si hay cambios reales en las fechas o en el tipo de habitación (roomId)
    if (price === undefined && currentBooking) {
      try {
        const arrival = checkIn || currentBooking.arrival;
        const departure = checkOut || currentBooking.departure;
        const newRoomId = updatePayload.roomId ? String(updatePayload.roomId) : (currentBooking.roomId ? String(currentBooking.roomId) : null);
        const newUnitId = updatePayload.unitId ? String(updatePayload.unitId) : (currentBooking.unitId ? String(currentBooking.unitId) : '1');

        const { getParentMapping } = await import('@/lib/beds24');
        const currentParent = getParentMapping(currentBooking.roomId, currentBooking.unitId || '1');
        const newParent = getParentMapping(newRoomId, newUnitId);

        // Detectar si hay cambios reales respecto a los valores actuales
        const arrivalChanged = arrival && arrival !== currentBooking.arrival;
        const departureChanged = departure && departure !== currentBooking.departure;
        roomTypeChanged = String(currentParent.roomId || '').trim() !== String(newParent.roomId || '').trim();
        // También detectar cambio de unitId dentro del mismo tipo (ej: 301 → 302)
        const unitChanged = roomName && (String(currentBooking.roomId) !== String(newRoomId) || String(currentBooking.unitId || '1') !== String(newUnitId));

        // Recalcular si cambiaron las fechas O si cambió el tipo de habitación (upgrade/downgrade de categoría)
        if ((arrivalChanged || departureChanged || roomTypeChanged) && arrival && departure && newRoomId) {
          console.log(`[Reservas PUT] Detectado cambio de fechas o categoría de habitación que requiere recálculo. Rango: ${arrival} al ${departure}`);
          
          const rawSource = String(`${currentBooking.referer || ''} ${currentBooking.source || ''} ${currentBooking.apiSource || ''} ${currentBooking.apiReference || ''}`).toLowerCase();
          const isOtaChannel = ['airbnb', 'booking', 'expedia'].some(ota => rawSource.includes(ota));
          const oldPrice = currentBooking.price || 0;

          if (isOtaChannel) {
            console.log(`[Reservas PUT] Reserva OTA. Manteniendo tarifa original sin importar cambio de categoría.`);
          } else {
            // Cargar capacitySettings de la base de datos
            let capacitySettings: any = null;
            try {
              const { data: settingsRow } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'capacity_settings')
                .maybeSingle();
              if (settingsRow && settingsRow.value) {
                capacitySettings = typeof settingsRow.value === 'string' ? JSON.parse(settingsRow.value) : settingsRow.value;
              }
            } catch (csErr) {
              console.warn("[Reservas PUT] No se pudieron cargar capacitySettings:", csErr);
            }

            // Cargar pricing rules de la base de datos
            let rulesList: any[] = [];
            try {
              const { data: rulesData } = await supabase
                .from('pricing_rules')
                .select('*');
              if (rulesData) {
                rulesList = rulesData;
              }
            } catch (rulesErr) {
              console.warn("[Reservas PUT] No se pudieron cargar pricing_rules:", rulesErr);
            }

            const { getDirectTotalForStay } = await import('@/lib/beds24');
            const targetRoomString = roomName || currentBooking.room || currentBooking.roomName || '';
            const cleanRoomNum = targetRoomString.replace(/[^0-9]/g, '');
            let numAdults = Number(currentBooking.numAdult || 1);
            let numChildren = Number(currentBooking.numChild || 0);

            // Si la reserva pertenece a un grupo, resolver los huéspedes ajustados de forma proporcional
            // para evitar cobrar recargos de persona extra falsos en habitaciones individuales.
            try {
              const targetName = `${currentBooking.firstName || ''} ${currentBooking.lastName || ''}`.trim().toLowerCase();
              const targetPhone = (currentBooking.phone || currentBooking.mobile || currentBooking.guestPhone || '').trim();

              const resSiblings = await fetch(`https://api.beds24.com/v2/bookings?arrivalFrom=${currentBooking.arrival}&arrivalTo=${currentBooking.arrival}`, {
                headers: { 'token': BEDS24_TOKEN },
                cache: 'no-store'
              });
              const jsonSiblings = await resSiblings.json().catch(() => null);
              const allArrival = jsonSiblings?.data || [];

              const group = allArrival.filter((b: any) => {
                if (b.departure !== currentBooking.departure) return false;
                if (String(b.status) === '0' || b.status === 'cancelled') return false;
                const bName = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
                const bPhone = (b.phone || b.mobile || b.guestPhone || '').trim();
                const sameName = bName && targetName && (bName.includes(targetName) || targetName.includes(bName));
                const samePhone = bPhone && targetPhone && (bPhone.includes(targetPhone) || targetPhone.includes(bPhone));
                return sameName || samePhone;
              });

              if (group.length > 1) {
                // Actualizar la habitación temporalmente en el grupo para usar la capacidad de la habitación destino
                const groupWithNewRoom = group.map((b: any) => {
                  if (String(b.id) === String(id)) {
                    return {
                      ...b,
                      roomName: roomName || b.roomName || b.room || ''
                    };
                  }
                  return b;
                });

                const { detectAndAdjustGroupGuests } = await import('@/lib/beds24');
                const adjustedResult = detectAndAdjustGroupGuests(groupWithNewRoom, capacitySettings);
                const currentAdjusted = adjustedResult.members.find((m: any) => String(m.id) === String(id));
                if (currentAdjusted) {
                  numAdults = currentAdjusted.display_num_adult;
                  numChildren = currentAdjusted.display_num_child;
                  console.log(`[Reservas PUT] Reserva grupal detectada. Distribuidos huéspedes para la habitación ${roomName || currentBooking.roomName}: ${numAdults} adultos, ${numChildren} niños`);
                }
              }
            } catch (groupErr) {
              console.error("[Reservas PUT] Error resolviendo huéspedes grupales:", groupErr);
            }

            const calculatedTotal = getDirectTotalForStay(
              cleanRoomNum,
              arrival,
              departure,
              rulesList,
              numAdults,
              numChildren,
              capacitySettings
            );

            // Cargar multiplicadores de OTA de la base de datos
            let otaMultipliers = { airbnb: 1.20, booking: 1.35 };
            try {
              const { data: otaRow } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'ota_multipliers')
                .maybeSingle();
              if (otaRow && otaRow.value) {
                const parsed = typeof otaRow.value === 'string' ? JSON.parse(otaRow.value) : otaRow.value;
                if (parsed.airbnb) otaMultipliers.airbnb = Number(parsed.airbnb);
                if (parsed.booking) otaMultipliers.booking = Number(parsed.booking);
              }
            } catch (otaErr) {
              console.warn("[Reservas PUT] No se pudieron cargar ota_multipliers:", otaErr);
            }

            let finalCalculated = calculatedTotal;
            const channelLower = String(currentBooking.channel || currentBooking.referer || '').toLowerCase();
            if (channelLower.includes('airbnb')) {
              finalCalculated = Math.round(calculatedTotal * otaMultipliers.airbnb);
              console.log(`[Reservas PUT] Aplicando recargo Airbnb (${otaMultipliers.airbnb}): ${calculatedTotal} → ${finalCalculated}`);
            } else if (channelLower.includes('booking')) {
              finalCalculated = Math.round(calculatedTotal * otaMultipliers.booking);
              console.log(`[Reservas PUT] Aplicando recargo Booking (${otaMultipliers.booking}): ${calculatedTotal} → ${finalCalculated}`);
            }

            if (finalCalculated > 0 && finalCalculated !== oldPrice) {
              recalculatedPrice = finalCalculated;
              console.log(`[Reservas PUT] Tarifa recalculada por cambio de categoría usando getDirectTotalForStay con recargos de canal: $${oldPrice} → $${finalCalculated}`);
            }
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
        recalculated_price: recalculatedPrice !== undefined ? recalculatedPrice : (currentBooking?.price || 0),
        price_changed: recalculatedPrice !== undefined && recalculatedPrice !== currentBooking?.price,
        same_room_type: !roomTypeChanged
      });
    }

    // Determinar el precio final a usar (explícito > recalculado > original)
    // Si no hay recálculo automático y no viene un precio explícito, enviamos el precio actual de la reserva.
    // Esto previene que los servidores de Beds24 recalculen e impongan tarifas por defecto.
    const rawSource = String(`${currentBooking?.referer || ''} ${currentBooking?.source || ''} ${currentBooking?.apiSource || ''} ${currentBooking?.apiReference || ''} ${currentBooking?.channel || ''}`).toLowerCase();
    const isOtaChannel = ['airbnb', 'booking', 'expedia'].some(ota => rawSource.includes(ota));

    if (isOtaChannel && price === undefined) {
      console.log(`[Reservas PUT] Reserva OTA. Omitiendo actualizaciones de tarifas y facturas para proteger el precio del canal.`);
    } else {
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
        const charges = currentItems.filter((item: any) => item.type === 'charge');
        const invoiceItemsUpdate: any[] = [];

        let mainRoomCharge = charges.find((c: any) => 
          (c.description || '').includes('[ROOMNAME1]') || 
          (c.description || '').toLowerCase().includes('room charge')
        );
        const ivaCharge = charges.find((c: any) => 
          (c.description || '').toLowerCase().includes('iva')
        );
        const lodgingTaxCharge = charges.find((c: any) => 
          (c.description || '').toLowerCase().includes('hospedaje') || 
          (c.description || '').toLowerCase().includes('tax')
        );

        if (!mainRoomCharge) {
          mainRoomCharge = charges.find((c: any) => c !== ivaCharge && c !== lodgingTaxCharge);
        }

        // 1. Cargo principal de habitación
        if (mainRoomCharge) {
          invoiceItemsUpdate.push({
            id: mainRoomCharge.id,
            description: '[ROOMNAME1] | [FIRSTNIGHT] - [LEAVINGDAY]',
            qty: 1,
            amount: finalPrice,
            vatRate: 19
          });
        } else {
          invoiceItemsUpdate.push({
            description: '[ROOMNAME1] | [FIRSTNIGHT] - [LEAVINGDAY]',
            qty: 1,
            amount: finalPrice,
            vatRate: 19
          });
        }

        // 2. IVA 16% (Incluido en el precio)
        if (ivaCharge) {
          invoiceItemsUpdate.push({
            id: ivaCharge.id,
            description: 'IVA 16% (Incluido en el precio)',
            qty: 1,
            amount: 0,
            vatRate: 0
          });
        } else {
          invoiceItemsUpdate.push({
            description: 'IVA 16% (Incluido en el precio)',
            qty: 1,
            amount: 0,
            vatRate: 0
          });
        }

        // 3. Tax Hospedaje 3% (Incluido en el precio)
        if (lodgingTaxCharge) {
          invoiceItemsUpdate.push({
            id: lodgingTaxCharge.id,
            description: 'Tax Hospedaje 3% (Incluido en el precio)',
            qty: 1,
            amount: 0,
            vatRate: 0
          });
        } else {
          invoiceItemsUpdate.push({
            description: 'Tax Hospedaje 3% (Incluido en el precio)',
            qty: 1,
            amount: 0,
            vatRate: 0
          });
        }

        // 4. Cancelar / eliminar cualquier otro cargo extra duplicado
        const handledIds = new Set([
          mainRoomCharge?.id,
          ivaCharge?.id,
          lodgingTaxCharge?.id
        ].filter(Boolean));

        charges.forEach((c: any) => {
          if (!handledIds.has(c.id)) {
            // En la API V2 de Beds24, para eliminar por completo un item de la factura,
            // se debe enviar únicamente un objeto con su ID, sin ningún otro campo.
            invoiceItemsUpdate.push({
              id: c.id
            });
          }
        });

        updatePayload.invoiceItems = invoiceItemsUpdate;
      }
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
