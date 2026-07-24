import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Obtener la fila de room_status para la 502
    const { data: roomStatus, error: err1 } = await supabase
      .from('room_status')
      .select('*')
      .eq('room_number', '502')
      .maybeSingle();

    // 2. Obtener las últimas 10 reservas de la 502
    const { data: reservas502, error: err2 } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('unit_id', '3')
      .order('created_at', { ascending: false })
      .limit(10);

    // 3. Obtener los últimos 10 checkins registrados
    const { data: checkins, error: err3 } = await supabase
      .from('checkins')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      success: true,
      errors: { err1, err2, err3 },
      roomStatus,
      reservas502,
      recentCheckins: checkins
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
