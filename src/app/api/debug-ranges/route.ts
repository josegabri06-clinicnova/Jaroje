import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'season_ranges')
      .maybeSingle();
      
    return NextResponse.json({
      success: true,
      value: data?.value ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) : null
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
