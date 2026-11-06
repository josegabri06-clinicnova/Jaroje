import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { normalizeBookingId } from '@/lib/guest-auth';
import { filesProxyUrl, parseStoredFileUrl } from '@/lib/storage-files';
import { checkGuestAccess, verificationRequiredResponse } from '@/lib/guest-access';

// POST: Upload the constancia PDF to Supabase Storage
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const reservationId = formData.get('reservationId') as string | null;

    if (!file || !reservationId) {
      return NextResponse.json({ success: false, error: 'Falta el archivo o el ID de reserva.' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ success: false, error: 'Solo se aceptan archivos PDF.' }, { status: 400 });
    }

    const guestId = normalizeBookingId(reservationId);
    if (!guestId) {
      return NextResponse.json({ success: false, error: 'ID de reserva no válido.' }, { status: 400 });
    }
    if (!(await checkGuestAccess(req, guestId)).allowed) return verificationRequiredResponse();

    const timestamp = Date.now();
    const safeName = (file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^[^a-zA-Z0-9]+/, '') || 'constancia.pdf').slice(0, 80);
    const fileName = `facturas/${guestId}_${timestamp}_${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('dni_images')
      .upload(fileName, buffer, { contentType: 'application/pdf', upsert: false });

    if (uploadError) {
      console.error('[Factura POST] Upload error:', uploadError);
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    // Enlace del servidor (/api/files): el PDF no tiene dirección pública. Solo lo abre el personal con sesión.
    const url = filesProxyUrl('dni_images', fileName);
    return NextResponse.json({ success: true, url });
  } catch (err: any) {
    console.error('[Factura POST] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT: Save billing_request record in Supabase DB
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { reservationId, guestName, roomName, amount, email, cfdiUse, pdfUrl, notes } = body;

    if (!reservationId || !email || !cfdiUse || !pdfUrl) {
      return NextResponse.json({ success: false, error: 'Datos incompletos.' }, { status: 400 });
    }

    const putGuestId = normalizeBookingId(reservationId);
    if (!putGuestId) {
      return NextResponse.json({ success: false, error: 'ID de reserva no válido.' }, { status: 400 });
    }
    if (!(await checkGuestAccess(req, putGuestId)).allowed) return verificationRequiredResponse();

    // El enlace debe ser de una constancia subida por nuestro propio sistema (almacén dni_images, carpeta facturas).
    // Se guarda el enlace normalizado del servidor, nunca el texto que envíe el navegador.
    const parsed = parseStoredFileUrl(typeof pdfUrl === 'string' ? pdfUrl : '');
    if (!parsed || parsed.bucket !== 'dni_images' || !parsed.path.startsWith(`facturas/${putGuestId}_`)) {
      return NextResponse.json({ success: false, error: 'URL de constancia fiscal no autorizada o inválida.' }, { status: 400 });
    }
    const storedPdfUrl = filesProxyUrl(parsed.bucket, parsed.path);

    const { error: insertError } = await supabase.from('billing_requests').insert([{
      reservation_id: putGuestId,
      guest_name: guestName || '',
      room_name: roomName || '',
      amount: Number(amount) || 0,
      email,
      cfdi_use: cfdiUse,
      pdf_url: storedPdfUrl,
      notes: notes || '',
      status: 'pending'
    }]);

    if (insertError) {
      console.error('[Factura PUT] DB insert error:', insertError);
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Factura PUT] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
