import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeBookingId, isGuestAuthorized } from '@/lib/guest-auth';
import { parseStoredFileUrl } from '@/lib/storage-files';
import { serveStoredFile } from '@/lib/storage-serve';

export const dynamic = 'force-dynamic';

/**
 * El huésped abre SU documento (DNI o comprobante). Solo con la cookie firmada de esa reserva, que se obtiene verificando
 * los últimos 4 dígitos del teléfono o subiendo el archivo desde ese dispositivo. El archivo se busca siempre en la base de
 * datos por la reserva: el huésped no puede pedir una ruta de almacenamiento cualquiera.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const bookingId = normalizeBookingId(searchParams.get('id'));
  const kind = searchParams.get('kind');
  if (!bookingId || !['dni', 'receipt', 'transfer'].includes(kind || '')) {
    return NextResponse.json({ success: false, error: 'Solicitud no válida.' }, { status: 400 });
  }

  if (!(await isGuestAuthorized(req, bookingId))) {
    return NextResponse.json({ success: false, code: 'verification_required', error: 'Verifica tu identidad para ver este archivo.' }, { status: 403 });
  }

  let storedUrl: string | null = null;
  if (kind === 'dni' || kind === 'receipt') {
    const { data: checkin } = await supabaseAdmin
      .from('checkins')
      .select('document_url, receipt_url')
      .eq('reservation_id', String(bookingId).toLowerCase().trim())
      .maybeSingle();
    if (kind === 'dni') {
      storedUrl = checkin?.document_url || null;
    } else {
      storedUrl = checkin?.receipt_url || null;
      if (!storedUrl) {
        // Igual que la ruta pública: si no hay comprobante en el check-in, el de la transferencia más reciente
        const { data: transfers } = await supabaseAdmin
          .from('transfer_receipts').select('receipt_url').eq('booking_id', Number(bookingId)).order('created_at', { ascending: false }).limit(1);
        storedUrl = transfers?.[0]?.receipt_url || null;
      }
    }
  } else {
    const rid = searchParams.get('rid') || '';
    if (!/^[0-9a-fA-F-]{8,40}$/.test(rid)) {
      return NextResponse.json({ success: false, error: 'Solicitud no válida.' }, { status: 400 });
    }
    const { data: transfer } = await supabaseAdmin
      .from('transfer_receipts').select('receipt_url').eq('id', rid).eq('booking_id', Number(bookingId)).maybeSingle();
    storedUrl = transfer?.receipt_url || null;
  }

  const parsed = parseStoredFileUrl(storedUrl);
  if (!parsed) {
    return NextResponse.json({ success: false, error: 'Archivo no encontrado.' }, { status: 404 });
  }
  return serveStoredFile(parsed.bucket, parsed.path);
}
