import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Obtener las últimas 10 reservas creadas de la 502
    const { data: reservas502, error: err1 } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('unit_id', '3')
      .order('created_at', { ascending: false })
      .limit(10);

    // 2. Obtener los últimos 10 checkins registrados en el hotel
    const { data: checkins, error: err2 } = await supabase
      .from('checkins')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      success: true,
      errors: { err1, err2 },
      reservas502,
      recentCheckins: checkins
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
