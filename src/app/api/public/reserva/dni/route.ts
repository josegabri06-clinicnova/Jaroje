import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getBeds24Bookings, getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const id = formData.get('id') as string;
    const file = formData.get('file') as File;

    if (!id || !file) {
      return NextResponse.json({ error: 'Falta ID de la reserva o archivo' }, { status: 400 });
    }

    const bookingId = Number(id);

    // 1. Obtener detalles de la reservación (Check-in/Check-out/Guest Name) y verificar pago
    let checkInDate = null;
    let checkOutDate = null;
    let guestName = 'Huésped';
    let isPaidOrOta = false;

    const { data: localRes } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (localRes) {
      checkInDate = localRes.check_in;
      checkOutDate = localRes.check_out;
      guestName = localRes.guest_name;
      // Para reservas locales: require deposit > 0 o is_acknowledged
      isPaidOrOta = (Number(localRes.deposit || 0) > 0) || !!localRes.is_acknowledged;
    } else {
      const allBeds24 = await getBeds24Bookings(true);
      const booking = allBeds24.find(r => r.id === bookingId);
      if (booking) {
        checkInDate = booking.check_in;
        checkOutDate = booking.check_out;
        guestName = booking.guest_name;
        
        // Determinar si es OTA
        const rawChannel = String(booking.channel || '').toLowerCase();
        const rawName = String(booking.guest_name || '').toUpperCase();
        const rawNotes = String(booking.notes || '').toLowerCase();
        const isOta = ['airbnb', 'booking', 'expedia'].some(c => rawChannel.includes(c) || rawName.includes(c) || rawNotes.includes(c));
        
        if (isOta) {
          isPaidOrOta = true;
        } else {
          isPaidOrOta = (Number(booking.deposit || 0) > 0) || !!booking.is_acknowledged;
        }
      }
    }

    // Verificar si ya se subió un comprobante de pago en la tabla checkins
    let hasUploadedReceipt = false;
    const cleanId = String(id).toLowerCase().trim();
    const { data: existingCheckin } = await supabase
      .from('checkins')
      .select('*')
      .eq('reservation_id', cleanId)
      .maybeSingle();

    if (existingCheckin && existingCheckin.receipt_url) {
      hasUploadedReceipt = true;
    }

    if (!isPaidOrOta && !hasUploadedReceipt) {
      return NextResponse.json({ error: 'Debes completar el pago de tu anticipo antes de subir tu identificación.' }, { status: 400 });
    }

    // 2. Extensión del archivo y ruta en Storage
    const fileExt = file.name.split('.').pop() || 'jpg';
    const filePath = `guest_dni_${id}_${Date.now()}.${fileExt}`;

    // 3. Subir a Supabase Storage (bucket: 'dni_images')
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('dni_images')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) {
      console.error("Error al subir DNI a storage:", uploadError);
      return NextResponse.json({ error: 'Fallo al subir identificación a storage: ' + uploadError.message }, { status: 500 });
    }

    // 4. Obtener URL pública
    const { data: urlData } = supabase.storage
      .from('dni_images')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    // 5. Upsert en la tabla 'checkins' de Supabase
    const { error: dbError } = await supabase
      .from('checkins')
      .upsert({
        reservation_id: cleanId,
        guest_name: existingCheckin?.guest_name || guestName,
        check_in_date: existingCheckin?.check_in_date || checkInDate || new Date().toISOString().split('T')[0],
        check_out_date: existingCheckin?.check_out_date || checkOutDate || new Date().toISOString().split('T')[0],
        document_url: publicUrl,
        receipt_url: existingCheckin?.receipt_url || null,
        status: existingCheckin?.status || 'pending'
      }, { onConflict: 'reservation_id' });

    if (dbError) {
      console.error("Error al guardar DNI en base de datos checkins:", dbError);
      return NextResponse.json({ error: 'Fallo al registrar identificación en base de datos: ' + dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: publicUrl });

  } catch (err: any) {
    console.error("Error en POST de api/public/reserva/dni:", err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
