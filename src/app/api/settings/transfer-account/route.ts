import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const VALID_ACCOUNTS = ['santander', 'banamex', 'hsbc', 'wise', 'paypal'];

/**
 * GET /api/settings/transfer-account
 * Consulta la cuenta de transferencia bancaria por defecto para el Portal de Ventas y Huéspedes.
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'default_transfer_account')
      .maybeSingle();

    if (error) {
      console.error("[Settings Transfer Account] Error consultando cuenta default:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const account = (data?.value && VALID_ACCOUNTS.includes(String(data.value).toLowerCase()))
      ? String(data.value).toLowerCase()
      : 'santander';

    return NextResponse.json({ success: true, account });
  } catch (err: any) {
    console.error("[Settings Transfer Account] Error en GET:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/settings/transfer-account
 * Actualiza la cuenta de transferencia por defecto (ej: 'santander', 'hsbc', 'banamex', 'wise', 'paypal')
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const account = String(body.account || '').toLowerCase().trim();

    if (!VALID_ACCOUNTS.includes(account)) {
      return NextResponse.json({ 
        error: `Cuenta inválida. Opciones permitidas: ${VALID_ACCOUNTS.join(', ')}` 
      }, { status: 400 });
    }

    const { error: upsertErr } = await supabase
      .from('settings')
      .upsert(
        { key: 'default_transfer_account', value: account },
        { onConflict: 'key' }
      );

    if (upsertErr) {
      console.error("[Settings Transfer Account] Error guardando cuenta default:", upsertErr);
      return NextResponse.json({ success: false, error: upsertErr.message }, { status: 500 });
    }

    // Registro de auditoría
    try {
      await supabase.from('employee_logs').insert([{
        employee_num: 'admin',
        employee_name: 'Administrador',
        department: 'gerencia',
        module: 'ajustes',
        action: 'default_transfer_account_updated',
        room: 'General',
        details: JSON.stringify({
          text: `Cuenta bancaria por defecto para Portal de Ventas actualizada a: ${account.toUpperCase()}`,
          account,
          timestamp: new Date().toISOString()
        })
      }]);
    } catch (logErr) {
      console.warn("[Settings Transfer Account] Error en auditoría:", logErr);
    }

    return NextResponse.json({
      success: true,
      account,
      message: `Cuenta de transferencia por defecto actualizada a ${account.toUpperCase()}.`
    });
  } catch (err: any) {
    console.error("[Settings Transfer Account] Error en POST:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
