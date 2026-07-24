import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Obtener todas las reservas locales de la habitación 502 (unit_id = '3' o room_name que contenga 502)
    const { data: localReservas, error: err1 } = await supabase
      .from('local_reservas')
      .select('*')
      .or('unit_id.eq.3,room_id.eq.685542');

    // 2. Obtener todos los checkins de Supabase
    const { data: checkins, error: err2 } = await supabase
      .from('checkins')
      .select('*');

    return NextResponse.json({
      success: true,
      errors: { err1, err2 },
      localReservas: localReservas || [],
      checkins: checkins || []
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
