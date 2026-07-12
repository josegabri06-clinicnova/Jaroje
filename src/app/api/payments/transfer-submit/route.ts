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

    // 4. Enviar notificación por WhatsApp a Recepción (958 587 8554)
    const receptionistPhone = '529585878554';
    const cleanGuestName = name || 'Invitado';
    const notificationBody = `🔔 *Nuevo Comprobante de Transferencia* 🔔\n\n*Huésped:* ${cleanGuestName}\n*Reserva:* #${bookingId}\n*Monto:* $${Number(amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN\n\nValida y aprueba esta transferencia aquí:\nhttps://jaroje-app.vercel.app/reservas?id=${bookingId}\n\nVer comprobante:\n${publicUrl}`;

    console.log(`[Submit Transfer] Sending WA notification to reception: ${receptionistPhone}`);
    const waRes = await sendWhatsAppTextMessage(receptionistPhone, notificationBody);
    if (!waRes.success) {
      console.warn("[Submit Transfer] WhatsApp notification warning:", waRes.error);
    }

    return NextResponse.json({ success: true, receiptUrl: publicUrl, record: dbData });

  } catch (err: any) {
    console.error("[Submit Transfer] Exception handler:", err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
