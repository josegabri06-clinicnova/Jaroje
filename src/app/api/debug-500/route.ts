import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Obtener todas las reservas de la habitación 500 (unit_id = '1')
    const { data: localReservas } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('unit_id', '1');

    // 2. Extraer todos sus IDs
    const resIds = (localReservas || []).map(r => String(r.id));

    // 3. Buscar en checkins si hay algún registro para estos IDs
    const { data: matchedCheckins } = await supabase
      .from('checkins')
      .select('*')
      .in('reservation_id', resIds);

    // 4. Buscar en checkins por la cadena "500" en el campo room
    const { data: roomCheckins } = await supabase
      .from('checkins')
      .select('*')
      .ilike('room', '%500%');

    return NextResponse.json({
      success: true,
      resIds,
      matchedCheckins: matchedCheckins || [],
      roomCheckins: roomCheckins || []
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
