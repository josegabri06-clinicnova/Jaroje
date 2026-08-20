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

    // Query 1: Run the exact query as in /api/reservas
    let query = supabase.from('beds24_reservations').select('*');
    query = query.or(`and(status.neq.cancelled,check_out.gte.${fortyEightHoursAgoStr}),and(status.eq.cancelled,updated_at.gte.${fortyEightHoursAgo})`);
    query = query.neq('room_id', '685542');
    
    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }

    const ayalaInQueryResults = (data || []).filter(r => (r.guest_name || '').toLowerCase().includes('ayala'));

    return NextResponse.json({
      success: true,
      filters: {
        fortyEightHoursAgoStr,
        fortyEightHoursAgo
      },
      totalRowsReturned: data ? data.length : 0,
      ayalaCountInQueryResults: ayalaInQueryResults.length,
      ayalaRowsInQueryResults: ayalaInQueryResults
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
