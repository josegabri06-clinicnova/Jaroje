import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `facturas/${reservationId}_${timestamp}_${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('dni_images')
      .upload(fileName, buffer, { contentType: 'application/pdf', upsert: false });

    if (uploadError) {
      console.error('[Factura POST] Upload error:', uploadError);
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from('dni_images').getPublicUrl(fileName);
    const url = publicUrlData?.publicUrl;

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

    const { error: insertError } = await supabase.from('billing_requests').insert([{
      reservation_id: String(reservationId),
      guest_name: guestName || '',
      room_name: roomName || '',
      amount: Number(amount) || 0,
      email,
      cfdi_use: cfdiUse,
      pdf_url: pdfUrl,
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
