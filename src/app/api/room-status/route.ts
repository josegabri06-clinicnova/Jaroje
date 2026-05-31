import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET — obtener estado de todas las habitaciones
export async function GET() {
  const { data, error } = await supabase
    .from('room_status')
    .select('*')
    .order('room_number');

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data ?? [] });
}

// POST — actualizar estado de una habitación
// body: { room_number, status, updated_by, checkout_reservation_id?, guest_name? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { room_number, status, updated_by, checkout_reservation_id, guest_name } = body;

    if (!room_number || !status) {
      return NextResponse.json({ error: 'Faltan room_number y status' }, { status: 400 });
    }

    const validStatuses = ['disponible', 'en_limpieza', 'limpia', 'sucio_checkout'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Estado inválido. Usa: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    const { error } = await supabase
      .from('room_status')
      .upsert({
        room_number,
        status,
        updated_at: new Date().toISOString(),
        updated_by: updated_by || 'sistema',
        ...(checkout_reservation_id ? { checkout_reservation_id } : {}),
        ...(guest_name ? { guest_name } : {}),
      }, { onConflict: 'room_number' });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Habitación ${room_number} → ${status}` });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
