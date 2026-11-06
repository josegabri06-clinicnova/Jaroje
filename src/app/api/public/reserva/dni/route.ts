import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getBeds24Bookings, getBeds24Token } from '@/lib/beds24';
import { isGuestAuthorized, grantGuestAccess, normalizeBookingId, guestFileUrl } from '@/lib/guest-auth';
import { filesProxyUrl } from '@/lib/storage-files';
import { requireGuestWriteAccess } from '@/lib/guest-access';

export const dynamic = 'force-dynamic';

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
      // Para reservas locales: require deposit > 0
      isPaidOrOta = Number(localRes.deposit || 0) > 0;
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
        const isOta = (
          rawChannel.includes('airbnb') ||
          rawChannel.includes('expedia') ||
          rawChannel.includes('vrbo') ||
          (rawChannel.includes('booking') && !rawChannel.includes('overbooking') && !rawChannel.includes('direct')) ||
          rawName.includes('BOOKING.COM') ||
          rawNotes.includes('booking.com')
        ) && !rawName.includes('OVERBOOKING') && !rawChannel.includes('google');
        
        if (isOta) {
          isPaidOrOta = true;
        } else {
          isPaidOrOta = Number(booking.deposit || 0) > 0;
        }
      }
    }

    // Verificar si ya se subió un comprobante de pago en la tabla checkins
    let hasUploadedReceipt = false;
    const cleanId = guestId;
    const { data: existingCheckin } = await supabase
      .from('checkins')
      .select('*')
      .eq('reservation_id', cleanId)
      .maybeSingle();

    if (existingCheckin && existingCheckin.receipt_url) {
      hasUploadedReceipt = true;
    }

    // Sustituir una identificación ya subida solo lo puede hacer quien está autorizado en esta reserva; la primera subida es libre
    if (existingCheckin?.document_url && !(await isGuestAuthorized(req, guestId))) {
      return NextResponse.json({ error: 'Verifica tu identidad para cambiar tu identificación.', code: 'verification_required' }, { status: 403 });
    }

    if (!isPaidOrOta && !hasUploadedReceipt) {
      return NextResponse.json({ error: 'Debes completar el pago de tu anticipo antes de subir tu identificación.' }, { status: 400 });
    }

    // 2. Validaciones de seguridad en archivo (tamaño máx 10MB y MIME permitido)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'El archivo excede el tamaño máximo permitido (10 MB).' }, { status: 400 });
    }

    const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
    if (file.type && !ALLOWED_MIMES.includes(file.type.toLowerCase())) {
      return NextResponse.json({ error: 'Formato no permitido. Solo se aceptan imágenes (JPG, PNG, WEBP) o PDF.' }, { status: 400 });
    }

    // Extensión segura y nombre aleatorio único para evitar sobrescrituras de documentos de otros huéspedes
    const rawExt = file.name ? file.name.split('.').pop()?.toLowerCase() : 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'heic'].includes(rawExt || '') ? rawExt : 'jpg';
    const randomSuffix = crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : Date.now();
    const filePath = `guest_dni_${guestId}_${Date.now()}_${randomSuffix}.${safeExt}`;

    // 3. Subir a Supabase Storage (bucket: 'dni_images')
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('dni_images')
      .upload(filePath, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false
      });

    if (uploadError) {
      console.error("Error al subir DNI a storage:", uploadError);
      return NextResponse.json({ error: 'Fallo al subir identificación a storage: ' + uploadError.message }, { status: 500 });
    }

    // 4. Enlace que se guarda en la base de datos: el del servidor (/api/files). Nunca un enlace público o firmado de
    // almacenamiento: las tablas son legibles con la clave pública y ese enlace abriría el archivo a cualquiera.
    const storedUrl = filesProxyUrl('dni_images', filePath);

    // 5. Upsert en la tabla 'checkins' de Supabase
    const { error: dbError } = await supabase
      .from('checkins')
      .upsert({
        reservation_id: cleanId,
        guest_name: existingCheckin?.guest_name || guestName,
        check_in_date: existingCheckin?.check_in_date || checkInDate || new Date().toISOString().split('T')[0],
        check_out_date: existingCheckin?.check_out_date || checkOutDate || new Date().toISOString().split('T')[0],
        document_url: storedUrl,
        receipt_url: existingCheckin?.receipt_url || null,
        status: existingCheckin?.status || 'pending'
      }, { onConflict: 'reservation_id' });

    if (dbError) {
      console.error("Error al guardar DNI en base de datos checkins:", dbError);
      return NextResponse.json({ error: 'Fallo al registrar identificación en base de datos: ' + dbError.message }, { status: 500 });
    }

    // Al huésped solo se le devuelve el enlace propio de su reserva (la cookie se entrega en esta misma respuesta)
    const okRes = NextResponse.json({ success: true, url: guestFileUrl(guestId, 'dni', storedUrl) });
    await grantGuestAccess(okRes, guestId); // quien sube su identificación queda autorizado en este dispositivo
    return okRes;

  } catch (err: any) {
    console.error("Error en POST de api/public/reserva/dni:", err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
