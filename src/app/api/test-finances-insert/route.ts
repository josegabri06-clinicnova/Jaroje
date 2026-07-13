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

    const results: any = {};

    // Test 1: Date as empty string ''
    const { error: err1 } = await anonClient
      .from('finances')
      .insert({
        type: 'ingreso',
        amount: 100,
        category: 'Reserva Directa',
        description: 'TEST DIAGNOSTICS - EMPTY DATE',
        payment_method: 'transferencia',
        account_id: null,
        date: ''
      });
    results.emptyDateError = err1;

    // Test 2: Amount as NaN
    const { error: err2 } = await anonClient
      .from('finances')
      .insert({
        type: 'ingreso',
        amount: NaN,
        category: 'Reserva Directa',
        description: 'TEST DIAGNOSTICS - NaN AMOUNT',
        payment_method: 'transferencia',
        account_id: null,
        date: '2026-07-13'
      });
    results.nanAmountError = err2;

    // Test 3: Amount as string '100.50'
    const { data: row3, error: err3 } = await anonClient
      .from('finances')
      .insert({
        type: 'ingreso',
        amount: '100.50' as any,
        category: 'Reserva Directa',
        description: 'TEST DIAGNOSTICS - STRING AMOUNT',
        payment_method: 'transferencia',
        account_id: null,
        date: '2026-07-13'
      })
      .select();
    results.stringAmountError = err3;
    if (!err3 && row3 && row3[0]) {
      await serviceClient.from('finances').delete().eq('id', row3[0].id);
    }

    // Test 4: Category non-standard
    const { data: row4, error: err4 } = await anonClient
      .from('finances')
      .insert({
        type: 'ingreso',
        amount: 100,
        category: 'Non-existent Category Test',
        description: 'TEST DIAGNOSTICS - NON-EXISTENT CATEGORY',
        payment_method: 'transferencia',
        account_id: null,
        date: '2026-07-13'
      })
      .select();
    results.nonExistentCategoryError = err4;
    if (!err4 && row4 && row4[0]) {
      await serviceClient.from('finances').delete().eq('id', row4[0].id);
    }

    return NextResponse.json({
      success: true,
      results
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
