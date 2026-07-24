import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Obtener todas las reservas locales de la habitación 500 (unit_id = '1')
    const { data: localReservas, error: err1 } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('unit_id', '1');

    // 2. Obtener la fila de room_status de la 500
    const { data: roomStatus, error: err2 } = await supabase
      .from('room_status')
      .select('*')
      .eq('room_number', '500')
      .maybeSingle();

    // 3. Obtener todos los checkins de Supabase
    const { data: checkins, error: err3 } = await supabase
      .from('checkins')
      .select('*');

    return NextResponse.json({
      success: true,
      errors: { err1, err2, err3 },
      roomStatus,
      localReservas: localReservas || [],
      checkins: checkins || []
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
