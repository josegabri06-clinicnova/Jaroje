import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data: localRes } = await supabase
      .from('local_reservas')
      .select('*')
      .ilike('guest_name', '%María Antonia%');

    const { data: checkins } = await supabase
      .from('checkins')
      .select('*')
      .ilike('guest_name', '%María Antonia%');

    let beds24Matched: any[] = [];
    try {
      const token = await getBeds24Token();
      const res = await fetch('https://api.beds24.com/v2/bookings?arrivalStartDate=2026-07-20&arrivalEndDate=2026-07-30', {
        headers: { 'token': token },
        cache: 'no-store'
      });
      if (res.ok) {
        const { data: bookings } = await res.json();
        beds24Matched = bookings.filter((b: any) => {
          const name = `${b.firstName || ''} ${b.lastName || ''}`.toLowerCase();
          return name.includes('maria antonia') || name.includes('tomas torres');
        });
      }
    } catch (e: any) {
      console.error(e);
    }

    return NextResponse.json({
      localRes,
      checkins,
      beds24Matched
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
