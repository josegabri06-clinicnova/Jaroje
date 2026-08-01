import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendWhatsAppTextMessage } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const bookingId = formData.get('bookingId') as string;
    const amount = formData.get('amount') as string;
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const notes = formData.get('notes') as string;
    const file = formData.get('file') as File;

    if (!bookingId || !amount || !file) {
      return NextResponse.json({ error: 'Faltan datos obligatorios (bookingId, amount, file)' }, { status: 400 });
    }

    // 1. Subir el archivo a Supabase Storage en el bucket "transfer-receipts"
    const fileExt = file.name.split('.').pop() || 'jpg';
    const filePath = `${bookingId}_${Date.now()}.${fileExt}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('transfer-receipts')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) {
      console.error("[Submit Transfer] Storage upload error:", uploadError);
      return NextResponse.json({ error: 'Error al guardar el comprobante en almacenamiento.' }, { status: 500 });
    }

    // 2. Obtener la URL pública del archivo
    const { data: urlData } = supabase.storage
      .from('transfer-receipts')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    // 3. Registrar en la tabla "transfer_receipts" de Supabase
    const { data: dbData, error: dbError } = await supabase
      .from('transfer_receipts')
      .insert({
        booking_id: bookingId,
        amount: Number(amount),
        guest_name: name || 'Invitado',
        guest_email: email || null,
        receipt_url: publicUrl,
        status: 'pending',
        notes: notes || null
      })
      .select()
      .single();

    if (dbError) {
      console.error("[Submit Transfer] DB insert error:", dbError);
      return NextResponse.json({ error: 'Error al registrar la transferencia en base de datos.' }, { status: 500 });
    }

    // 4. Enviar notificación por WhatsApp a Recepción (958 116 8698)
    const receptionistPhone = '529581168698';
    const cleanGuestName = name || 'Invitado';
    const notificationBody = `🔔 *Nuevo Comprobante de Transferencia* 🔔\n\n*Huésped:* ${cleanGuestName}\n*Reserva:* #${bookingId}\n*Monto:* $${Number(amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN\n\nValida y aprueba esta transferencia aquí:\nhttps://jaroje-app.vercel.app/reservas?id=${bookingId}\n\nVer comprobante:\n${publicUrl}`;

    console.log(`[Submit Transfer] Sending WA notification to reception: ${receptionistPhone}`);
    const waRes = await sendWhatsAppTextMessage(receptionistPhone, notificationBody);
    if (!waRes.success) {
      console.warn("[Submit Transfer] WhatsApp notification warning:", waRes.error);
    }

    // 5. Obtener teléfono del huésped para enviarle una notificación automática por WhatsApp
    let guestPhone = '';
    let dbGuestName = name || 'Invitado';
    try {
      const { data: localRes } = await supabase
        .from('local_reservas')
        .select('phone, guest_name')
        .eq('id', Number(bookingId))
        .maybeSingle();

      if (localRes) {
        guestPhone = localRes.phone || '';
        dbGuestName = localRes.guest_name || dbGuestName;
      } else {
        const { getBeds24Token } = await import('@/lib/beds24');
        const BEDS24_TOKEN = await getBeds24Token();
        const b24Res = await fetch(`https://api.beds24.com/v2/bookings?id=${bookingId}`, {
          headers: { 'token': BEDS24_TOKEN }
        });
        if (b24Res.ok) {
          const b24Json = await b24Res.json();
          const b = Array.isArray(b24Json?.data) ? b24Json.data[0] : (Array.isArray(b24Json) ? b24Json[0] : null);
          if (b) {
            const { normalizePhone } = await import('@/lib/whatsapp');
            guestPhone = normalizePhone(b.phone || b.mobile || b.guestPhone || '', b.country2 || b.country || b.guestCountry2 || b.guestCountry);
            dbGuestName = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : (b.guestName || dbGuestName);
          }
        }
      }
    } catch (waLookupErr) {
      console.error("[Submit Transfer] Error buscando teléfono para WhatsApp automático:", waLookupErr);
    }

    // Enviar mensaje de confirmación al huésped si tenemos su número
    if (guestPhone) {
      const guestNotificationBody = `¡Hola, ${dbGuestName}! Hemos recibido tu comprobante de transferencia por $${Number(amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN para la reserva #${bookingId}.\n\nNuestro equipo lo está validando (este proceso puede tardar hasta 24 horas). Te notificaremos por este medio tan pronto como esté aprobado. ¡Muchas gracias!`;
      console.log(`[Submit Transfer] Sending automated receipt notification to guest: ${guestPhone}`);
      await sendWhatsAppTextMessage(guestPhone, guestNotificationBody);
    }

    return NextResponse.json({ success: true, receiptUrl: publicUrl, record: dbData });

  } catch (err: any) {
    console.error("[Submit Transfer] Exception handler:", err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
