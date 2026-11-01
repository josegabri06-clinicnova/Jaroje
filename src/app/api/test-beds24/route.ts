import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function getBeds24Token() {
  const { data } = await supabase.from('configurations').select('value').eq('key', 'beds24_token').single();
  return data?.value;
}

export async function GET(req: Request) {
  const token = await getBeds24Token();
  const res = await fetch('https://api.beds24.com/v2/inventory/calendar?from=2026-05-18&to=2026-05-20', {
    headers: { 'token': token }
  });
  const data = await res.json();
  return NextResponse.json(data);
}
