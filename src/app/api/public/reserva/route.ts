import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getBeds24Bookings, getBeds24Token } from '@/lib/beds24';

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
        .select('show_card_payment, transfer_account')
        .eq('booking_id', String(bookingId))
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
          is_checked_out: checkinData?.status === 'checked_out',
          is_acknowledged: checkinData?.status === 'acknowledged' || checkinData?.status === 'checked_in' || checkinData?.status === 'checked_out',
          status: localRes.status || 'confirmed',
          booking_time: localRes.created_at || null,
          portal_settings: {
            show_card_payment: portalSettings?.show_card_payment ?? true,
            transfer_account: portalSettings?.transfer_account ?? 'santander'
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
        .select('show_card_payment, transfer_account')
        .eq('booking_id', String(bookingId))
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
          is_checked_out: checkinData?.status === 'checked_out',
          is_acknowledged: checkinData?.status === 'acknowledged' || checkinData?.status === 'checked_in' || checkinData?.status === 'checked_out',
          status: booking.status || 'confirmed',
          booking_time: booking.booking_time || null,
          portal_settings: {
            show_card_payment: portalSettings?.show_card_payment ?? true,
            transfer_account: portalSettings?.transfer_account ?? 'santander'
          }
        }
      });
    }

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
