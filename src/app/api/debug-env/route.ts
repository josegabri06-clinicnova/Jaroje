import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const formatter = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const fortyEightHoursAgoStr = formatter.format(new Date(Date.now() - 48 * 60 * 60 * 1000));
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Query 1: Total count of active bookings
    let query = supabase.from('beds24_reservations').select('id', { count: 'exact', head: true });
    query = query.or(`and(status.neq.cancelled,check_out.gte.${fortyEightHoursAgoStr}),and(status.eq.cancelled,updated_at.gte.${fortyEightHoursAgo})`);
    query = query.neq('room_id', '685542');
    const { count, error: countError } = await query;

    // Query 2: Search Manuel Ayala specifically in beds24_reservations
    const { data: ayalaBookings, error: ayalaError } = await supabase
      .from('beds24_reservations')
      .select('id, guest_name, check_in, check_out, status, room, room_id, updated_at')
      .ilike('guest_name', '%ayala%');

    // Query 3: Search Manuel Ayala in local_reservas
    const { data: localAyala, error: localError } = await supabase
      .from('local_reservas')
      .select('id, guest_name, check_in, check_out, status')
      .ilike('guest_name', '%ayala%');

    return NextResponse.json({
      success: true,
      env: {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT_SET',
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
      filters: {
        fortyEightHoursAgoStr,
        fortyEightHoursAgo
      },
      activeBeds24Count: count,
      countError: countError ? countError.message : null,
      ayalaBookingsInDB: ayalaBookings || [],
      ayalaError: ayalaError ? ayalaError.message : null,
      localAyalaInDB: localAyala || [],
      localError: localError ? localError.message : null
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
