import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionFromRequest } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { confirm_text, employee_num, employee_name, admin_pin } = body;
    // Opcional: restablecer SOLO una cuenta. Sin account_id se restablecen todas (comportamiento de siempre).
    const rawAccountId = body?.account_id;
    const singleAccountId = rawAccountId === undefined || rawAccountId === null || rawAccountId === '' ? null : String(rawAccountId).trim();
    if (singleAccountId !== null && !/^[0-9a-fA-F-]{36}$/.test(singleAccountId)) {
      return NextResponse.json({ success: false, error: 'Cuenta no válida.' }, { status: 400 });
    }

    // 1. Verificación del texto de confirmación
    if (confirm_text !== 'RESET') {
      return NextResponse.json({ 
        success: false, 
        error: 'Código de confirmación incorrecto. Escribe RESET para ejecutar.' 
      }, { status: 400 });
    }

    // 2. Autenticación en servidor: Sesión activa de admin o PIN de administrador
    const session = await getSessionFromRequest(req);
    const isAdminSession = session?.role === 'admin';

    const headerPin = req.headers.get('x-admin-pin') || '';
    const providedPin = (admin_pin || headerPin || '').trim();

    if (!isAdminSession && !providedPin) {
      return NextResponse.json({
        success: false,
        error: 'Acción no autorizada: Se requiere sesión activa de administrador o PIN de administrador.'
      }, { status: 401 });
    }

    if (!isAdminSession && providedPin) {
      // Consultar el PIN de admin esperado en settings
      const { data: adminPinRow, error: pinFetchError } = await supabaseAdmin
        .from('settings')
        .select('value')
        .eq('key', 'pin_admin')
        .maybeSingle();

      if (pinFetchError) {
        console.error("API Reset Contable: Error consultando PIN de admin:", pinFetchError.message);
        return NextResponse.json({
          success: false,
          error: 'Error de servidor verificando credenciales administrativas.'
        }, { status: 500 });
      }

      const expectedPin = (process.env.ADMIN_PIN || adminPinRow?.value || '').trim();
      if (!expectedPin) {
        return NextResponse.json({
          success: false,
          error: 'Error de configuración: PIN de administrador no definido en el sistema.'
        }, { status: 500 });
      }

      // Comparación segura en tiempo constante para evitar filtración por temporización
      const expectedHash = crypto.createHash('sha256').update(expectedPin).digest();
      const providedHash = crypto.createHash('sha256').update(providedPin).digest();

      if (!crypto.timingSafeEqual(expectedHash, providedHash)) {
        return NextResponse.json({
          success: false,
          error: 'PIN de administrador incorrecto. Acción denegada.'
        }, { status: 401 });
      }
    }

    // Si es una sola cuenta, debe existir (se comprueba antes de borrar nada)
    let singleAccountName = '';
    if (singleAccountId) {
      const { data: acc, error: accErr } = await supabaseAdmin.from('accounts').select('id, name').eq('id', singleAccountId).maybeSingle();
      if (accErr) {
        return NextResponse.json({ success: false, error: 'Error consultando la cuenta: ' + accErr.message }, { status: 500 });
      }
      if (!acc) {
        return NextResponse.json({ success: false, error: 'La cuenta indicada no existe.' }, { status: 404 });
      }
      singleAccountName = String(acc.name || '');
    }

    // 3. Eliminar permanentemente los registros contables en Supabase (todos, o solo los de la cuenta elegida)
    const deleteQuery = supabaseAdmin.from('finances').delete();
    const { error: deleteErr } = singleAccountId
      ? await deleteQuery.eq('account_id', singleAccountId)
      : await deleteQuery.neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteErr) {
      console.error("API Reset Contable: Fallo al eliminar transacciones contables:", deleteErr.message);
      return NextResponse.json({ 
        success: false, 
        error: 'Error al limpiar transacciones históricas: ' + deleteErr.message 
      }, { status: 500 });
    }

    // 4. Restablecer a cero el balance (de todas las cuentas y sobres físicos, o solo de la elegida)
    const updateQuery = supabaseAdmin.from('accounts').update({ balance: 0 });
    const { error: updateErr } = singleAccountId
      ? await updateQuery.eq('id', singleAccountId)
      : await updateQuery.neq('id', '00000000-0000-0000-0000-000000000000');

    if (updateErr) {
      console.error("API Reset Contable: Fallo al restablecer saldos de sobres a cero:", updateErr.message);
      return NextResponse.json({ 
        success: false, 
        error: 'Transacciones borradas pero falló el reseteo de balances a cero: ' + updateErr.message 
      }, { status: 500 });
    }

    // 5. Registrar de forma inmutable la acción administrativa en la tabla de logs
    const { error: logErr } = await supabaseAdmin
      .from('employee_logs')
      .insert([
        {
          employee_num: employee_num || '999',
          employee_name: employee_name || 'Administrador Principal',
          department: 'Administración',
          module: 'finanzas',
          action: 'reset_contable',
          details: singleAccountId
            ? `Ejecutó un RESTABLECIMIENTO CONTABLE de la cuenta "${singleAccountName}" verificado por credencial de administrador: sus movimientos borrados y su saldo a 0.`
            : 'Ejecutó un RESTABLECIMIENTO CONTABLE TOTAL verificado por credencial de administrador: libro vaciado y saldos a MX$0.',
          created_at: new Date().toISOString()
        }
      ]);

    if (logErr) {
      console.warn("API Reset Contable: Advertencia al registrar log de auditoría:", logErr.message);
    }

    return NextResponse.json({ 
      success: true, 
      message: singleAccountId
        ? `La cuenta ${singleAccountName} se restableció a cero con éxito y credencial verificada.`
        : 'Libro contable y saldos de sobres restablecidos a cero con éxito y credencial verificada.'  
    });
  } catch (err: any) {
    console.error("API Reset Contable: Excepción interna del servidor:", err.message);
    return NextResponse.json({ 
      success: false, 
      error: 'Error interno en el servidor: ' + err.message 
    }, { status: 500 });
  }
}
