import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data: checkins } = await supabase.from('checkins').select('*').eq('reservation_id', '18');
    const { data: checkins9 } = await supabase.from('checkins').select('*').eq('reservation_id', '9');
    const { data: checkins19 } = await supabase.from('checkins').select('*').eq('reservation_id', '19');
    return NextResponse.json({ checkins, checkins9, checkins19 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
