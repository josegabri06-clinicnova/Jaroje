import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const anonClient = createClient(supabaseUrl, anonKey);
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // 1. Diagnostics with Anon Client (simulating client-side)
    const { data: anonSelect, error: anonSelectError } = await anonClient
      .from('checkins')
      .select('*')
      .limit(5);

    const testIdAnon = 'test-anon-' + Date.now();
    const { data: anonInsert, error: anonInsertError } = await anonClient
      .from('checkins')
      .insert({
        reservation_id: testIdAnon,
        guest_name: 'Test Anon Guest',
        room: 'Test Anon Room',
        check_in_date: '2026-06-04',
        check_out_date: '2026-06-05',
        status: 'checked_in',
        checked_in_by: 'Test Anon'
      })
      .select();

    if (!anonInsertError) {
      await anonClient.from('checkins').delete().eq('reservation_id', testIdAnon);
    }

    // 2. Diagnostics with Service Role Client (bypassing RLS)
    const { data: serviceSelect, error: serviceSelectError } = await serviceClient
      .from('checkins')
      .select('*')
      .limit(5);

    const testIdService = 'test-service-' + Date.now();
    const { data: serviceInsert, error: serviceInsertError } = await serviceClient
      .from('checkins')
      .insert({
        reservation_id: testIdService,
        guest_name: 'Test Service Guest',
        room: 'Test Service Room',
        check_in_date: '2026-06-04',
        check_out_date: '2026-06-05',
        status: 'checked_in',
        checked_in_by: 'Test Service'
      })
      .select();

    if (!serviceInsertError) {
      await serviceClient.from('checkins').delete().eq('reservation_id', testIdService);
    }

    return NextResponse.json({
      success: true,
      diagnostics: {
        anonKey: {
          selectError: anonSelectError,
          selectCount: anonSelect?.length || 0,
          selectData: anonSelect,
          insertError: anonInsertError,
          insertSuccess: !anonInsertError
        },
        serviceRoleKey: {
          selectError: serviceSelectError,
          selectCount: serviceSelect?.length || 0,
          selectData: serviceSelect,
          insertError: serviceInsertError,
          insertSuccess: !serviceInsertError
        }
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
