import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("API Reset Contable: Variables de entorno de Supabase no configuradas en el servidor.");
      return NextResponse.json({
        success: false,
        error: 'Variables de entorno no configuradas. Por favor, asegúrate de que NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY estén definidas en Vercel.'
      }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { confirm_text, employee_num, employee_name } = body;

    // Validación de seguridad crítica
    if (confirm_text !== 'RESET') {
      return NextResponse.json({ 
        success: false, 
        error: 'Código de confirmación incorrecto. Escribe RESET para ejecutar.' 
      }, { status: 400 });
    }

    // 1. Eliminar permanentemente todos los registros contables en Supabase
    // Al no haber WHERE directo en Supabase JS, usamos un filtrado que siempre es verdadero para vaciar la tabla
    const { error: deleteErr } = await supabase
      .from('finances')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteErr) {
      console.error("API Reset Contable: Fallo al eliminar transacciones contables:", deleteErr.message);
      return NextResponse.json({ 
        success: false, 
        error: 'Error al limpiar transacciones históricas: ' + deleteErr.message 
      }, { status: 500 });
    }

    // 2. Restablecer balance de todas las cuentas y sobres físicos a cero (MX$0)
    const { error: updateErr } = await supabase
      .from('accounts')
      .update({ balance: 0 })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (updateErr) {
      console.error("API Reset Contable: Fallo al restablecer saldos de sobres a cero:", updateErr.message);
      return NextResponse.json({ 
        success: false, 
        error: 'Transacciones borradas pero falló el reseteo de balances a cero: ' + updateErr.message 
      }, { status: 500 });
    }

    // 3. Registrar de forma inmutable la acción administrativa en la tabla de logs
    const { error: logErr } = await supabase
      .from('employee_logs')
      .insert([
        {
          employee_num: employee_num || '999',
          employee_name: employee_name || 'Administrador Principal',
          department: 'Administración',
          module: 'finanzas',
          action: 'reset_contable',
          details: 'Ejecutó un RESTABLECIMIENTO CONTABLE TOTAL: se vació el libro contable de transacciones y se reseteó a MX$0 el saldo de todos los sobres físicos y cuentas corporativas.',
          created_at: new Date().toISOString()
        }
      ]);

    if (logErr) {
      console.warn("API Reset Contable: Advertencia al registrar log de auditoría:", logErr.message);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Libro contable y saldos de sobres restablecidos a cero con éxito.' 
    });
  } catch (err: any) {
    console.error("API Reset Contable: Excepción interna del servidor:", err.message);
    return NextResponse.json({ 
      success: false, 
      error: 'Error interno en el servidor: ' + err.message 
    }, { status: 500 });
  }
}
