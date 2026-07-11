import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getBeds24Bookings, getBeds24Token } from '@/lib/beds24';
import { normalizePhone, detectLanguageFromPhone } from '@/lib/whatsapp';

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

    if (localRes) {
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

      // Obtener settings de pago
      const { data: portalSettings } = await supabase
        .from('booking_portal_settings')
        .select('show_card_payment, transfer_account, language')
        .eq('booking_id', String(bookingId))
        .maybeSingle();

      // Obtener todos los localRes de la misma fecha de checkin, mismo nombre o telefono para consolidar el total del grupo
      let localGroupPrice = Number(localRes.price || 0);
      let localGroupDeposit = Number(localRes.deposit || 0);
      let localGroupAdult = Number(localRes.num_adult || 1);
      let localGroupChild = Number(localRes.num_child || 0);
      let localRoomNames = [`Habitación ${physicalName}`];

      try {
        const cleanStr = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
        const mainName = cleanStr(localRes.guest_name || '');
        const mainPhone = (localRes.phone || '').trim();

        const { data: siblingLocal } = await supabase
          .from('local_reservas')
          .select('id, guest_name, phone, price, deposit, unit_id, num_adult, num_child')
          .eq('check_in', localRes.check_in)
          .neq('id', localRes.id);

        if (siblingLocal && siblingLocal.length > 0) {
          siblingLocal.forEach(s => {
            const samePhone = mainPhone && s.phone && s.phone.trim() === mainPhone;
            const sameName = mainName && s.guest_name && (cleanStr(s.guest_name).includes(mainName) || mainName.includes(cleanStr(s.guest_name)));
            if (samePhone || sameName) {
              localGroupPrice += Number(s.price || 0);
              localGroupDeposit += Number(s.deposit || 0);
              localGroupAdult += Number(s.num_adult || 0);
              localGroupChild += Number(s.num_child || 0);
              const siblingPhysicalName = s.unit_id ? (UNIT_TO_ROOM[s.unit_id] || s.unit_id) : '';
              localRoomNames.push(`Habitación ${siblingPhysicalName}`);
            }
          });
        }
      } catch (err) {
        console.error("Error al agrupar localRes:", err);
      }

      return NextResponse.json({
        success: true,
        data: {
          id: localRes.id,
          guest_name: localRes.guest_name,
          room_name: localRoomNames.join(', '),
          check_in: localRes.check_in,
          check_out: localRes.check_out,
          price: localGroupPrice,
          deposit: localGroupDeposit,
          balance: Math.max(0, localGroupPrice - localGroupDeposit),
          nights,
          num_adult: localGroupAdult,
          num_child: localGroupChild,
          room_count: localRoomNames.length,
          is_checked_in: checkinData?.status === 'checked_in',
          is_checked_out: checkinData?.status === 'checked_out',
          is_acknowledged: checkinData?.status === 'acknowledged' || checkinData?.status === 'checked_in' || checkinData?.status === 'checked_out',
          status: localRes.status || 'confirmed',
          booking_time: localRes.created_at || null,
          portal_settings: {
            show_card_payment: portalSettings?.show_card_payment ?? true,
            transfer_account: portalSettings?.transfer_account ?? (localRes.guest_name?.toUpperCase().includes('(US DOLLARS)') ? 'wise' : 'santander'),
            language: portalSettings?.language || detectLanguageFromPhone(localRes.phone)
          }
        }
      });
    }

    // 2. Buscar en Beds24 activo (caché)
    const allBeds24 = await getBeds24Bookings(true);
    let booking = allBeds24.find(r => r.id === bookingId);

    // 2.1. Fallback: Buscar directamente en Beds24 por ID si no está activo (ej: si está cancelada)
    if (!booking) {
      try {
        const beds24Token = await getBeds24Token();
        const b24Res = await fetch(`https://api.beds24.com/v2/bookings?id=${bookingId}&includeInvoice=true`, {
          headers: { 'token': beds24Token },
          cache: 'no-store'
        });
        if (b24Res.ok) {
          const rawBookingData = await b24Res.json();
          if (rawBookingData && rawBookingData.success && Array.isArray(rawBookingData.data) && rawBookingData.data.length > 0) {
            const rawB = rawBookingData.data[0];
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
            else if (rawSource.includes('whatsapp') || rawSource.includes('n8n')) channel = 'WhatsApp Bot';
            else if (rawSource.includes('beds24')) channel = 'Beds24';

            let actualPaid = 0;
            let totalInvoiceCharges = 0;
            if (rawB.invoiceItems && Array.isArray(rawB.invoiceItems)) {
              rawB.invoiceItems.forEach((item: any) => {
                const qty = Number(item.qty || 0);
                const price = Number(item.price || 0);
                const lineTotal = qty * price;
                if (lineTotal < 0) {
                  actualPaid += Math.abs(lineTotal);
                } else {
                  totalInvoiceCharges += lineTotal;
                }
              });
            }

            const totalRevenue = (rawB.price !== undefined && rawB.price !== null && rawB.price !== '') ? Number(rawB.price) : 0;
            const calculatedCharges = totalInvoiceCharges > 0 ? totalInvoiceCharges : totalRevenue;
            const calculatedBalance = Math.max(0, calculatedCharges - actualPaid);

            const depositVal = actualPaid > 0 ? actualPaid : (rawB.deposit !== undefined ? Number(rawB.deposit) : 0);
            const balanceVal = actualPaid > 0 ? calculatedBalance : (rawB.balance !== undefined ? Number(rawB.balance) : (calculatedCharges - depositVal));

            const isCancelled = String(rawB.status) === '0' || rawB.status === 'cancelled';

            booking = {
              id: rawB.id,
              guest_name: `${rawB.firstName || ''} ${rawB.lastName || ''}`.trim() || 'Huésped',
              room_name: rawB.roomName || 'Habitación',
              check_in: rawB.arrival,
              check_out: rawB.departure,
              price: calculatedCharges,
              deposit: depositVal,
              balance: balanceVal,
              nights,
              num_adult: Number(rawB.numAdult || 1),
              num_child: Number(rawB.numChild || 0),
              status: isCancelled ? 'cancelled' : 'confirmed',
              booking_time: rawB.bookingTime || rawB.arrival || null
            };
          }
        }
      } catch (err) {
        console.error("Error al buscar reserva individual en Beds24:", err);
      }
    }

    if (booking) {
      const { data: checkinData } = await supabase
        .from('checkins')
        .select('status')
        .eq('reservation_id', String(bookingId))
        .maybeSingle();

      const { data: portalSettings } = await supabase
        .from('booking_portal_settings')
        .select('show_card_payment, transfer_account, language')
        .eq('booking_id', String(bookingId))
        .maybeSingle();

      let b24GroupPrice = Number(booking.price_estimate || booking.price || 0);
      let b24GroupDeposit = Number(booking.deposit || 0);
      let b24GroupBalance = Number(booking.balance || 0);
      let b24RoomNames = [booking.room_name || `Habitación ${booking.roomId}`];

      try {
        const cleanStr = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
        const mainName = cleanStr(booking.guest_name || '');
        const mainPhone = booking.phone || booking.mobile || booking.guest_phone || '';
        const phoneNum = mainPhone ? normalizePhone(mainPhone) : '';

        const siblingBeds24 = allBeds24.filter(r => {
          if (r.check_in !== booking.check_in || r.id === booking.id || r.status === 'cancelled') return false;
          const samePhone = phoneNum && r.phone && normalizePhone(r.phone) === phoneNum;
          const sameName = mainName && r.guest_name && (cleanStr(r.guest_name).includes(mainName) || mainName.includes(cleanStr(r.guest_name)));
          return samePhone || sameName;
        });

        let b24GroupAdult = Number(booking.num_adult || 1);
        let b24GroupChild = Number(booking.num_child || 0);

        if (siblingBeds24.length > 0) {
          siblingBeds24.forEach(s => {
            b24GroupPrice += Number(s.price_estimate || s.price || 0);
            b24GroupDeposit += Number(s.deposit || 0);
            b24GroupBalance += Number(s.balance || 0);
            b24GroupAdult += Number(s.num_adult || 0);
            b24GroupChild += Number(s.num_child || 0);
            b24RoomNames.push(s.room_name || `Habitación ${s.roomId}`);
          });
        }

        return NextResponse.json({
          success: true,
          data: {
            id: booking.id,
            guest_name: booking.guest_name,
            room_name: b24RoomNames.join(', '),
            check_in: booking.check_in,
            check_out: booking.check_out,
            price: b24GroupPrice,
            deposit: b24GroupDeposit,
            balance: b24GroupBalance,
            nights: booking.nights,
            num_adult: b24GroupAdult,
            num_child: b24GroupChild,
            room_count: b24RoomNames.length,
            is_checked_in: checkinData?.status === 'checked_in',
            is_checked_out: checkinData?.status === 'checked_out',
            is_acknowledged: checkinData?.status === 'acknowledged' || checkinData?.status === 'checked_in' || checkinData?.status === 'checked_out',
            status: booking.status || 'confirmed',
            booking_time: booking.booking_time || null,
            portal_settings: {
              show_card_payment: portalSettings?.show_card_payment ?? true,
              transfer_account: portalSettings?.transfer_account ?? (booking.guest_name?.toUpperCase().includes('(US DOLLARS)') ? 'wise' : 'santander'),
              language: portalSettings?.language || detectLanguageFromPhone(booking.phone || booking.mobile || booking.guest_phone)
            }
          }
        });
      } catch (err) {
        console.error("Error al agrupar Beds24 bookings:", err);
      }
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

    const bookingId = Number(id);

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
    const fileExt = file.name.split('.').pop() || 'jpg';
    const filePath = `${id}_${Date.now()}.${fileExt}`;

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

    // 4. Obtener URL pública del archivo
    const { data: urlData } = supabase.storage
      .from('payment_receipts')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    // 5. Actualizar o insertar en la tabla 'checkins' de Supabase
    const { data: existingCheckin } = await supabase
      .from('checkins')
      .select('*')
      .eq('reservation_id', id)
      .maybeSingle();

    const { error: dbError } = await supabase
      .from('checkins')
      .upsert({
        reservation_id: id,
        guest_name: existingCheckin?.guest_name || guestName,
        check_in_date: existingCheckin?.check_in_date || checkInDate || new Date().toISOString().split('T')[0],
        check_out_date: existingCheckin?.check_out_date || checkOutDate || new Date().toISOString().split('T')[0],
        receipt_url: publicUrl,
        status: existingCheckin?.status || 'pending'
      }, { onConflict: 'reservation_id' });

    if (dbError) {
      console.error("Error al guardar en base de datos checkins:", dbError);
      return NextResponse.json({ error: 'Fallo al registrar en base de datos: ' + dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, receiptUrl: publicUrl });

  } catch (err: any) {
    console.error("Error en POST de public/reserva:", err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
