import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getBeds24Bookings, getBeds24Token, getUnitName, JAROJE_CATALOG, detectAndAdjustGroupGuests, clearBeds24Cache, areBookingsInSameGroup, isInvoicePayment } from '@/lib/beds24';
import { normalizePhone, detectLanguageFromPhone } from '@/lib/whatsapp';
import { isGuestAuthorized, grantGuestAccess, normalizeBookingId, guestFileRef, guestFileUrl, hasUsablePhone } from '@/lib/guest-auth';
import { filesProxyUrl } from '@/lib/storage-files';
import { checkGuestAccess, firstNameOf, requireGuestWriteAccess } from '@/lib/guest-access';
import { physicalRoomName } from '@/lib/room-names';
import { isKnownMissingBooking, reserveBeds24Lookup, rememberBookingNotFound } from '@/lib/beds24-public-cache';
import { rateLimitResponse } from '@/lib/public-rate-limit';

export const dynamic = 'force-dynamic';

// Esta ruta es pública (basta el número de reserva): nunca devuelve enlaces de almacenamiento. Indica si hay archivo y,
// solo si el huésped está autorizado (cookie de su reserva), un enlace propio que pasa por /api/public/reserva/file.
function publicTransferReceipts(list: any[] | null | undefined, bookingId: string, authorized: boolean) {
  return (list || []).map(({ receipt_url, booking_id, ...rest }: any) => ({
    ...rest,
    has_file: Boolean(receipt_url),
    ...(authorized && receipt_url && String(booking_id) === bookingId
      ? { receipt_url: guestFileUrl(bookingId, 'transfer', receipt_url, String(rest.id)) }
      : {}),
  }));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let rawId = searchParams.get('id') || '';

    if (!rawId) {
      return NextResponse.json({ error: 'Falta ID de la reserva' }, { status: 400 });
    }

    try {
      rawId = decodeURIComponent(rawId);
    } catch (e) {}

    // Limpiar residuos de query string (?action=maintenance, &lang=es), placeholders {{1}}, etc.
    rawId = rawId.replace(/(\{\{1\}\}|%7B%7B1%7D%7D)/gi, '').trim();
    const digitMatch = rawId.match(/\d+/);
    const bookingId = digitMatch ? Number(digitMatch[0]) : Number(rawId);

    if (isNaN(bookingId) || !Number.isInteger(bookingId)) {
      return NextResponse.json({ error: 'ID de reserva no válido' }, { status: 400 });
    }

    // Acceso al portal: si la reserva tiene un teléfono con el que verificar, no se enseña NADA hasta que el huésped
    // escriba los 4 últimos dígitos (cookie firmada de esa reserva) o sea personal con sesión.
    const guestId = String(bookingId);
    const access = await checkGuestAccess(req, guestId);
    if (!access.allowed) {
      const { data: lockedSettings } = await supabase
        .from('booking_portal_settings')
        .select('language')
        .eq('booking_id', guestId)
        .maybeSingle();
      return NextResponse.json({
        success: true,
        data: {
          id: bookingId,
          locked: true,
          needs_verification: true,
          verify_available: true,
          guest_first_name: firstNameOf(access.contact?.guestName),
          portal_settings: { language: lockedSettings?.language || detectLanguageFromPhone(access.contact?.phone || '') }
        }
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // ¿Este dispositivo está autorizado a ver los ARCHIVOS de esta reserva? Solo con la cookie del huésped (el personal usa el panel).
    const guestAuthorized = access.reason === 'cookie';

    // Obtener el listado de comprobantes de transferencia de la reserva
    const { data: transferReceipts } = await supabase
      .from('transfer_receipts')
      .select('id, amount, status, receipt_url, notes, created_at')
      .eq('booking_id', Number(bookingId))
      .order('created_at', { ascending: false });

    // 1. Buscar en local_reservas de Supabase (por ID local o por nota B24:ID de Beds24)
    let localRes = null;
    const { data: resById } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (resById) {
      localRes = resById;
    } else {
      const { data: resByB24 } = await supabase
        .from('local_reservas')
        .select('*')
        .like('notes', `%B24:${bookingId}%`)
        .maybeSingle();
      if (resByB24) {
        localRes = resByB24;
      }
    }

    if (localRes) {
      const physicalName = physicalRoomName(localRes.room_id, localRes.unit_id);
      const arrivalDate = localRes.check_in ? new Date(localRes.check_in) : null;
      const departureDate = localRes.check_out ? new Date(localRes.check_out) : null;
      const nights = (arrivalDate && departureDate)
        ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 1;

      // Obtener el estado del check-in
      const { data: checkinData } = await supabase
        .from('checkins')
        .select('status, document_url, receipt_url')
        .eq('reservation_id', String(bookingId).toLowerCase().trim())
        .maybeSingle();

      // Obtener si tiene algún comprobante de transferencia
      const { data: transferData } = await supabase
        .from('transfer_receipts')
        .select('receipt_url')
        .eq('booking_id', Number(bookingId))
        .limit(1);

      const finalReceiptUrl = checkinData?.receipt_url || (transferData && transferData.length > 0 ? transferData[0].receipt_url : null);

      // Obtener settings de pago
      const { data: portalSettings, error: portalSettingsError } = await supabase
        .from('booking_portal_settings')
        .select('show_card_payment, transfer_account, language')
        .eq('booking_id', String(bookingId))
        .maybeSingle();

      let siblingLocal: any[] = [];
      try {
        const cleanStr = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
        const mainName = cleanStr(localRes.guest_name || '');
        const mainPhone = (localRes.phone || '').trim();

        const { data: siblings } = await supabase
          .from('local_reservas')
          .select('id, guest_name, phone, price, deposit, unit_id, num_adult, num_child, status, channel')
          .eq('check_in', localRes.check_in)
          .neq('id', localRes.id);

        const localChannel = (localRes.channel || '').toLowerCase();
        const isLocalOta = ['booking.com', 'airbnb', 'expedia'].some(c => localChannel.includes(c));

        if (siblings && siblings.length > 0) {
          siblingLocal = siblings.filter(s => areBookingsInSameGroup(localRes, s));
        }
      } catch (err) {
        console.error("Error al agrupar localRes:", err);
      }

      // Preparar miembros con sus nombres físicos de habitación para validar capacidad
      const localResMapped = {
        ...localRes,
        room: physicalName
      };
      
      const siblingLocalMapped = siblingLocal.map(s => {
        const siblingPhysicalName = physicalRoomName(s.room_id, s.unit_id);
        return {
          ...s,
          room: siblingPhysicalName
        };
      });

      const allLocalMembers = [localResMapped, ...siblingLocalMapped];
      const adjLocal = detectAndAdjustGroupGuests(allLocalMembers);

      let localGroupAdult = adjLocal.groupTotalAdults;
      let localGroupChild = adjLocal.groupTotalChildren;

      const localGroupBookings = adjLocal.members;
      const localRoomNames = adjLocal.members.map(m => m.room ? `Habitación ${m.room}` : 'Habitación Sin asignar');
      const localGroupPrice = adjLocal.members.reduce((sum, m) => sum + Number(m.price || 0), 0);

      const localRoomsDetail = adjLocal.members.map(m => ({
        room_name: m.room ? `Habitación ${m.room}` : 'Sin asignar',
        room_id: m.id,
        num_adult: m.display_num_adult !== undefined ? m.display_num_adult : Number(m.num_adult || 1),
        num_child: m.display_num_child !== undefined ? m.display_num_child : Number(m.num_child || 0),
        price: Number(m.price || 0),
      }));

      // Calcular depósito del grupo local de forma segura
      let localGroupDeposit = 0;
      const nonZeroDeps = localGroupBookings.map(b => Number(b.deposit || 0)).filter((d: number) => d > 0);
      if (nonZeroDeps.length > 0) {
        const firstDep = nonZeroDeps[0];
        const allSame = nonZeroDeps.every((d: number) => d === firstDep);
        const totalSumOfDeps = nonZeroDeps.reduce((sum: number, d: number) => sum + d, 0);
        if (allSame && nonZeroDeps.length > 1 && totalSumOfDeps > localGroupPrice) {
          localGroupDeposit = firstDep;
        } else {
          localGroupDeposit = totalSumOfDeps;
        }
      }
      localGroupDeposit = Math.min(localGroupDeposit, localGroupPrice);

      const isCheckedIn = checkinData?.status === 'checked_in';
      const isCheckedOut = checkinData?.status === 'checked_out';
      const isSettled = isCheckedIn || isCheckedOut;
      const finalDeposit = isSettled ? localGroupPrice : localGroupDeposit;
      const finalBalance = isSettled ? 0 : Math.max(0, localGroupPrice - localGroupDeposit);

      // Obtener comprobantes de transferencia de todas las habitaciones del grupo local
      const localGroupIds = localGroupBookings.map(b => b.id);
      const { data: groupTransferReceipts } = await supabase
        .from('transfer_receipts')
        .select('id, booking_id, amount, status, receipt_url, notes, created_at')
        .in('booking_id', localGroupIds)
        .order('created_at', { ascending: false });

      return NextResponse.json({
        success: true,
        data: {
          id: localRes.id,
          guest_name: localRes.guest_name,
          room_name: localRoomNames.join(', '),
          rooms_detail: localRoomsDetail,
          check_in: localRes.check_in,
          check_out: localRes.check_out,
          price: localGroupPrice,
          deposit: finalDeposit,
          balance: finalBalance,
          nights,
          num_adult: localGroupAdult,
          num_child: localGroupChild,
          individual_num_adult: adjLocal.members[0]?.display_num_adult !== undefined ? adjLocal.members[0].display_num_adult : Number(localRes.num_adult || 1),
          individual_num_child: adjLocal.members[0]?.display_num_child !== undefined ? adjLocal.members[0].display_num_child : Number(localRes.num_child || 0),
          notes: (localRes.notes || '').trim(),
          room_count: localRoomNames.length,
          is_checked_in: checkinData?.status === 'checked_in',
          is_checked_out: checkinData?.status === 'checked_out',
          is_acknowledged: checkinData?.status === 'acknowledged' || checkinData?.status === 'checked_in' || checkinData?.status === 'checked_out',
          document_url: guestFileRef(guestId, 'dni', checkinData?.document_url, guestAuthorized),
          receipt_url: guestFileRef(guestId, 'receipt', finalReceiptUrl, guestAuthorized),
          status: localRes.status || 'confirmed',
          booking_time: localRes.created_at || null,
          channel: 'Directo',
          transfer_receipts: publicTransferReceipts(groupTransferReceipts, guestId, guestAuthorized),
          needs_verification: Boolean((checkinData?.document_url || finalReceiptUrl || (groupTransferReceipts || []).some((r: any) => r.receipt_url)) && !guestAuthorized),
          verify_available: hasUsablePhone(localRes.phone),
          portal_settings: {
            show_card_payment: portalSettings?.show_card_payment !== false,
            transfer_account: portalSettings?.transfer_account ?? (localRes.guest_name?.toUpperCase().includes('(US DOLLARS)') ? 'wise' : 'santander'),
            language: portalSettings?.language || detectLanguageFromPhone(localRes.phone),
            db_error: portalSettingsError?.message || null
          }
        }
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // 2. Buscar en Beds24 activo (usando caché para velocidad)
    const allBeds24 = await getBeds24Bookings(true, false, false);
    let booking = allBeds24.find(r => String(r.id) === String(bookingId));

    // 2.1. Fallback: Buscar directamente en Beds24 por ID si no está activo (ej: si está cancelada).
    // Es una ruta pública y cada consulta gasta créditos de Beds24: un número inventado NO puede provocarlas sin límite.
    // (1) si Beds24 ya dijo hace poco que no existe, no se vuelve a preguntar; (2) por IP, 15 consultas cada 15 min
    // (un huésped real casi nunca llega aquí: sus reservas están en nuestras tablas); (3) presupuesto global de 10 por minuto.
    let confirmedMissing = false;
    let cancelFailed = false; // la consulta de canceladas falló: no se puede afirmar que no existe
    let mayLookup = false;
    if (!booking && !isKnownMissingBooking(String(bookingId))) {
      const limited = await rateLimitResponse(req, 'portal-beds24-lookup', { max: 15, windowMs: 15 * 60_000, lockMs: 15 * 60_000 });
      if (limited) return limited;
      mayLookup = reserveBeds24Lookup();
    }
    if (!booking && mayLookup) {
      try {
        const beds24Token = await getBeds24Token();
        const b24Res = await fetch(`https://api.beds24.com/v2/bookings?id=${bookingId}&includeInvoice=true`, {
          headers: { 'token': beds24Token },
          cache: 'no-store'
        });
        if (b24Res.ok) {
          const rawBookingData = await b24Res.json();
          let dataList = rawBookingData.data || [];

          if (rawBookingData.success && dataList.length === 0) {
            const b24ResCancel = await fetch(`https://api.beds24.com/v2/bookings?id=${bookingId}&includeInvoice=true&status=cancelled`, {
              headers: { 'token': beds24Token },
              cache: 'no-store'
            });
            if (b24ResCancel.ok) {
              const b24JsonCancel = await b24ResCancel.json();
              if (b24JsonCancel.success && b24JsonCancel.data && b24JsonCancel.data.length > 0) {
                dataList = b24JsonCancel.data;
              }
            } else {
              cancelFailed = true;
            }
          }

          if (rawBookingData.success && dataList.length > 0) {
            const rawB = dataList[0];
            const arrivalDate = rawB.arrival ? new Date(rawB.arrival) : null;
            const departureDate = rawB.departure ? new Date(rawB.departure) : null;
            const nights = (arrivalDate && departureDate)
              ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
              : 1;

            const rawSource = String(`${rawB.referer || ''} ${rawB.source || ''} ${rawB.apiSource || ''} ${rawB.apiReference || ''}`).toLowerCase();
            const guestNameUpper = `${rawB.firstName || ''} ${rawB.lastName || ''}`.toUpperCase();

            let channel = 'Directo';
            if (rawSource.includes('airbnb') || guestNameUpper.includes('PAGADO A')) channel = 'Airbnb';
            else if (rawSource.includes('booking') || guestNameUpper.includes('PAGADO B')) channel = 'Booking.com';
            else if (rawSource.includes('expedia')) channel = 'Expedia';
            else if (rawSource.includes('whatsapp') || rawSource.includes('n8n')) channel = 'WhatsApp';
            else if (rawSource.includes('google') || rawSource.includes('gpa') || rawSource.includes('hpa')) channel = 'Google';
            else if (rawSource.includes('jaroje') || rawSource.includes('condominiosjaroje')) channel = 'Jaroje Oficial';
            else if (rawSource.includes('beds24')) channel = 'Google'; // Booking Page de Beds24

            let actualPaid = 0;
            let totalInvoiceCharges = 0;
            if (rawB.invoiceItems && Array.isArray(rawB.invoiceItems)) {
              rawB.invoiceItems.forEach((item: any) => {
                const itemBookingId = String(item.bookingId || item.bookId || '');
                if (itemBookingId && itemBookingId !== String(rawB.id)) {
                  return;
                }
                const lineTotal = item.lineTotal !== undefined ? Number(item.lineTotal) : (Number(item.qty || 0) * Number(item.price || 0));
                if (isInvoicePayment(item)) {
                  actualPaid += Math.abs(lineTotal);
                } else {
                  totalInvoiceCharges += lineTotal;
                }
              });
            }

            const totalRevenue = (rawB.price !== undefined && rawB.price !== null && rawB.price !== '') ? Number(rawB.price) : 0;
            const calculatedCharges = totalInvoiceCharges > 0 ? totalInvoiceCharges : totalRevenue;
            const calculatedBalance = Math.max(0, calculatedCharges - actualPaid);

            const depositVal = (rawB.deposit !== undefined && Number(rawB.deposit) > 0)
              ? Number(rawB.deposit)
              : (actualPaid > 0 ? actualPaid : 0);
            const balanceVal = Math.max(0, calculatedCharges - depositVal);

            const isCancelled = String(rawB.status) === '0' || rawB.status === 'cancelled';

            // Construir room_name con número de habitación usando el catálogo canónico
            const rawRoomId = String(rawB.roomId || '');
            const rawUnitId = String(rawB.unitId || '');
            const catalogEntry = JAROJE_CATALOG[rawRoomId];
            const unitName = getUnitName(rawRoomId, rawUnitId);
            let resolvedRoomName: string;
            if (catalogEntry) {
              resolvedRoomName = unitName
                ? (catalogEntry.nombre.includes(unitName) ? catalogEntry.nombre : `${catalogEntry.nombre} (${unitName})`)
                : catalogEntry.nombre;
            } else {
              resolvedRoomName = rawB.roomName || (unitName ? `Habitación (${unitName})` : 'Habitación');
            }

            booking = {
              id: rawB.id,
              actualPaid: actualPaid,
              rawDeposit: rawB.deposit !== undefined ? Number(rawB.deposit) : 0,
              guest_name: `${rawB.firstName || ''} ${rawB.lastName || ''}`.trim() || 'Huésped',
              room_name: resolvedRoomName,
              check_in: rawB.arrival,
              check_out: rawB.departure,
              price: calculatedCharges,
              price_estimate: calculatedCharges,
              deposit: depositVal,
              balance: balanceVal,
              nights,
              num_adult: Number(rawB.numAdult || 1),
              num_child: Number(rawB.numChild || 0),
              guest_phone: rawB.phone || rawB.mobile || rawB.guestPhone || rawB.guestMobile || null,
              status: isCancelled ? 'cancelled' : (String(rawB.status || '').toLowerCase() === 'request' ? 'request' : (rawB.status || 'confirmed')),
              booking_time: rawB.bookingTime || rawB.arrival || null,
              channel: channel
            };
          } else if (rawBookingData.success && !cancelFailed) {
            confirmedMissing = true; // Beds24 respondió bien (activas y canceladas) y no existe
          }
        }
      } catch (err) {
        console.error("Error al buscar reserva individual en Beds24:", err);
      }
    }
    if (!booking && confirmedMissing) rememberBookingNotFound(String(bookingId));

    if (booking) {
      const { data: checkinData } = await supabase
        .from('checkins')
        .select('status, document_url, receipt_url')
        .eq('reservation_id', String(bookingId).toLowerCase().trim())
        .maybeSingle();

      // Obtener si tiene algún comprobante de transferencia
      const { data: transferData } = await supabase
        .from('transfer_receipts')
        .select('receipt_url')
        .eq('booking_id', Number(bookingId))
        .limit(1);

      const finalReceiptUrl = checkinData?.receipt_url || (transferData && transferData.length > 0 ? transferData[0].receipt_url : null);

      const { data: portalSettings, error: portalSettingsError } = await supabase
        .from('booking_portal_settings')
        .select('show_card_payment, transfer_account, language')
        .eq('booking_id', String(bookingId))
        .maybeSingle();

      let siblingBeds24: any[] = [];
      try {
        const cleanStr = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
        const mainName = cleanStr(booking.guest_name || '');
        const mainPhone = booking.guest_phone || booking.phone || booking.mobile || '';
        const phoneNum = mainPhone ? normalizePhone(mainPhone) : '';

        const mainChannel = (booking.channel || '').toLowerCase();
        const isMainOta = ['booking.com', 'airbnb', 'expedia'].some(c => mainChannel.includes(c));

        siblingBeds24 = allBeds24.filter(r => areBookingsInSameGroup(booking, r));
      } catch (err) {
        console.error("Error al buscar hermanos Beds24 en ruta GET:", err);
      }

      // Ajustar el conteo de adultos y niños si vienen duplicados/consolidados de Beds24
      const allB24Members = [booking, ...siblingBeds24];
      const adjB24 = detectAndAdjustGroupGuests(allB24Members);
      
      let b24GroupAdult = adjB24.groupTotalAdults;
      let b24GroupChild = adjB24.groupTotalChildren;
      
      const beds24GroupBookings = adjB24.members;
      const b24RoomNames = adjB24.members.map((m: any) => m.room_name || `Habitación ${m.roomId || ''}`);
      const b24GroupPrice = adjB24.members.reduce((sum: number, m: any) => sum + Number(m.price_estimate || m.price || 0), 0);
      
      const b24RoomsDetail = adjB24.members.map((m: any) => ({
        room_name: m.room_name || `Habitación ${m.roomId || ''}`,
        room_id: m.id,
        num_adult: m.display_num_adult !== undefined ? m.display_num_adult : Number(m.num_adult || 1),
        num_child: m.display_num_child !== undefined ? m.display_num_child : Number(m.num_child || 0),
        price: Number(m.price_estimate || m.price || 0),
      }));

        // Calcular depósito del grupo Beds24 de forma segura
        const totalPaidFromInvoices = beds24GroupBookings.reduce((sum, b) => sum + (b.actualPaid || 0), 0);
        let b24GroupDeposit = 0;
        if (totalPaidFromInvoices > 0) {
          b24GroupDeposit = totalPaidFromInvoices;
        } else {
          const nonZeroDeps = beds24GroupBookings.map(b => Number(b.rawDeposit || b.deposit || 0)).filter(d => d > 0);
          if (nonZeroDeps.length > 0) {
            const firstDep = nonZeroDeps[0];
            const allSame = nonZeroDeps.every(d => d === firstDep);
            const totalSumOfDeps = nonZeroDeps.reduce((sum, d) => sum + d, 0);
            if (allSame && nonZeroDeps.length > 1 && totalSumOfDeps > b24GroupPrice) {
              b24GroupDeposit = firstDep;
            } else {
              b24GroupDeposit = totalSumOfDeps;
            }
          }
        }

        b24GroupDeposit = Math.min(b24GroupDeposit, b24GroupPrice);
        const b24GroupBalance = Math.max(0, b24GroupPrice - b24GroupDeposit);

        const isCheckedIn = checkinData?.status === 'checked_in';
        const isCheckedOut = checkinData?.status === 'checked_out';
        const isSettled = isCheckedIn || isCheckedOut;
        const finalDeposit = isSettled ? b24GroupPrice : b24GroupDeposit;
        const finalBalance = isSettled ? 0 : b24GroupBalance;

        // Obtener comprobantes de transferencia de todas las habitaciones del grupo Beds24
        const b24GroupIds = beds24GroupBookings.map(b => Number(b.id));
        const { data: groupTransferReceipts } = await supabase
          .from('transfer_receipts')
          .select('id, booking_id, amount, status, receipt_url, notes, created_at')
          .in('booking_id', b24GroupIds)
          .order('created_at', { ascending: false });

        return NextResponse.json({
          success: true,
          data: {
            id: booking.id,
            guest_name: booking.guest_name,
            room_name: b24RoomNames.join(', '),
            rooms_detail: b24RoomsDetail,
            check_in: booking.check_in,
            check_out: booking.check_out,
            price: b24GroupPrice,
            deposit: finalDeposit,
            balance: finalBalance,
            nights: booking.nights,
            num_adult: b24GroupAdult,
            num_child: b24GroupChild,
            individual_num_adult: adjB24.members[0]?.display_num_adult !== undefined ? adjB24.members[0].display_num_adult : Number(booking.num_adult || 1),
            individual_num_child: adjB24.members[0]?.display_num_child !== undefined ? adjB24.members[0].display_num_child : Number(booking.num_child || 0),
            notes: ((booking as any).notes || (booking as any).comments || '').trim(),
            room_count: b24RoomNames.length,
            is_checked_in: checkinData?.status === 'checked_in',
            is_checked_out: checkinData?.status === 'checked_out',
            is_acknowledged: checkinData?.status === 'acknowledged' || checkinData?.status === 'checked_in' || checkinData?.status === 'checked_out',
            document_url: guestFileRef(guestId, 'dni', checkinData?.document_url, guestAuthorized),
            receipt_url: guestFileRef(guestId, 'receipt', finalReceiptUrl, guestAuthorized),
            status: booking.status || 'confirmed',
            booking_time: booking.booking_time || null,
            channel: booking.channel || 'Directo',
            transfer_receipts: publicTransferReceipts(groupTransferReceipts, guestId, guestAuthorized),
          needs_verification: Boolean((checkinData?.document_url || finalReceiptUrl || (groupTransferReceipts || []).some((r: any) => r.receipt_url)) && !guestAuthorized),
          verify_available: hasUsablePhone(booking.guest_phone || booking.phone || booking.mobile),
            portal_settings: {
              show_card_payment: portalSettings?.show_card_payment !== false,
              transfer_account: portalSettings?.transfer_account ?? (booking.guest_name?.toUpperCase().includes('(US DOLLARS)') ? 'wise' : 'santander'),
              language: portalSettings?.language || detectLanguageFromPhone(booking.guest_phone || booking.phone || booking.mobile),
              db_error: portalSettingsError?.message || null
            }
          }
        }, { headers: { 'Cache-Control': 'no-store' } });
    } // fin if (booking)

    return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

  } catch (err: any) {
    console.error("Error en api/public/reserva:", err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const id = formData.get('id') as string;
    const file = formData.get('file') as File;

    if (!id || !file) {
      return NextResponse.json({ error: 'Falta ID de la reserva o archivo' }, { status: 400 });
    }

    const guestId = normalizeBookingId(id);
    if (!guestId) {
      return NextResponse.json({ error: 'ID de reserva no válido' }, { status: 400 });
    }
    const bookingId = Number(guestId); // mismo id que valida la guardia (no el texto crudo del cliente)

    // Solo quien ya verificó su teléfono (o personal) puede subir; ya no basta con conocer el número de reserva
    const denied = await requireGuestWriteAccess(req, guestId);
    if (denied) return denied;

    // Sustituir un comprobante ya subido solo lo puede hacer quien está autorizado en esta reserva; la primera subida es libre
    const { data: priorCheckin } = await supabase
      .from('checkins')
      .select('receipt_url')
      .eq('reservation_id', guestId)
      .maybeSingle();
    if (priorCheckin?.receipt_url && !(await isGuestAuthorized(req, guestId))) {
      return NextResponse.json({ error: 'Verifica tu identidad para cambiar tu comprobante.', code: 'verification_required' }, { status: 403 });
    }

    // 1. Buscar detalles de la reservación para evitar violar restricciones NOT NULL de la base de datos
    let checkInDate = null;
    let checkOutDate = null;
    let guestName = 'Huésped';

    const { data: localRes } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (localRes) {
      checkInDate = localRes.check_in;
      checkOutDate = localRes.check_out;
      guestName = localRes.guest_name;
    } else {
      const allBeds24 = await getBeds24Bookings(true);
      const booking = allBeds24.find(r => r.id === bookingId);
      if (booking) {
        checkInDate = booking.check_in;
        checkOutDate = booking.check_out;
        guestName = booking.guest_name;
      }
    }

    // 2. Obtener la extensión del archivo
    const rawExt = (file.name.split('.').pop() || '').toLowerCase();
    const fileExt = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'heic'].includes(rawExt) ? rawExt : 'jpg';
    const filePath = `${guestId}_${Date.now()}.${fileExt}`;

    // 3. Subir directamente como File/Blob a Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('payment_receipts')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) {
      console.error("Error al subir a storage:", uploadError);
      return NextResponse.json({ error: 'Fallo al subir comprobante a storage: ' + uploadError.message }, { status: 500 });
    }

    // 4. Enlace que se guarda en la base de datos: el del servidor (/api/files), nunca uno público o firmado de almacenamiento
    const publicUrl = filesProxyUrl('payment_receipts', filePath);

    // 5. Actualizar o insertar en la tabla 'checkins' de Supabase
    const cleanId = guestId;
    const { data: existingCheckin } = await supabase
      .from('checkins')
      .select('*')
      .eq('reservation_id', cleanId)
      .maybeSingle();

    const { error: dbError } = await supabase
      .from('checkins')
      .upsert({
        reservation_id: cleanId,
        guest_name: existingCheckin?.guest_name || guestName,
        check_in_date: existingCheckin?.check_in_date || checkInDate || new Date().toISOString().split('T')[0],
        check_out_date: existingCheckin?.check_out_date || checkOutDate || new Date().toISOString().split('T')[0],
        receipt_url: publicUrl,
        document_url: existingCheckin?.document_url || null,
        status: existingCheckin?.status || 'pending'
      }, { onConflict: 'reservation_id' });

    if (dbError) {
      console.error("Error al guardar en base de datos checkins:", dbError);
      return NextResponse.json({ error: 'Fallo al registrar en base de datos: ' + dbError.message }, { status: 500 });
    }

    const okRes = NextResponse.json({ success: true, receiptUrl: guestFileUrl(guestId, 'receipt', publicUrl) });
    await grantGuestAccess(okRes, guestId); // quien sube su comprobante queda autorizado en este dispositivo
    return okRes;

  } catch (err: any) {
    console.error("Error en POST de public/reserva:", err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
