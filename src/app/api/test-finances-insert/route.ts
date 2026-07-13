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

    // Obtener cuentas
    const { data: accounts, error: accError } = await serviceClient
      .from('accounts')
      .select('*');

    // Probar insertar con anonClient (el cliente que usa Recepción/Calendario/Reservas en la web)
    const testDesc = 'TEST DIAGNOSTICS - INSERT ANON ' + Date.now();
    const { data: anonInsert, error: anonInsertError } = await anonClient
      .from('finances')
      .insert({
        type: 'ingreso',
        amount: 100,
        category: 'Reserva Directa',
        description: testDesc,
        payment_method: 'transferencia',
        account_id: null,
        date: new Date().toISOString().split('T')[0]
      })
      .select();

    // Eliminar si fue exitoso
    if (!anonInsertError && anonInsert && anonInsert[0]) {
      await serviceClient.from('finances').delete().eq('id', anonInsert[0].id);
    }

    return NextResponse.json({
      success: true,
      accounts: accounts?.map(a => ({ id: a.id, name: a.name, group_type: a.group_type })),
      anonInsertError,
      anonInsertSuccess: !anonInsertError,
      anonInsertData: anonInsert
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
