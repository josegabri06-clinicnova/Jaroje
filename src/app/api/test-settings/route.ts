import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data } = await supabase
    .from('settings')
    .select('*')
    .eq('key', 'capacity_settings')
    .maybeSingle();

  return NextResponse.json({ data });
}
