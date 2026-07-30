import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || '90670004';
    const cleanId = id.toLowerCase().trim();

    const { data: checkinData, error } = await supabase
      .from('checkins')
      .select('*')
      .eq('reservation_id', cleanId)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      queryId: cleanId,
      checkinData,
      error
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
