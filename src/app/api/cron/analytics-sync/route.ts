import { NextResponse } from 'next/server';
import { syncBeds24ReservationsRange } from '@/lib/beds24';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // 1. Autenticación básica de cron mediante token secreto
    const { searchParams } = new URL(req.url);
    const cronToken = searchParams.get('token');
    const expectedToken = process.env.CRON_SECRET;

    if (expectedToken && cronToken !== expectedToken) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Calcular rango de fechas dinámico YoY
    const currentYear = new Date().getFullYear();
    const fromDateStr = `${currentYear - 2}-01-01`; // Hace 2 años (ej. si hoy es 2026, desde 2024-01-01)
    const toDateStr = `${currentYear + 1}-12-31`;   // 1 año adelante (ej. hasta 2027-12-31)

    console.log(`[Cron Analytics Sync] Iniciando ejecución programada para rango: ${fromDateStr} - ${toDateStr}`);

    // 3. Ejecutar sincronización masiva
    const result = await syncBeds24ReservationsRange(fromDateStr, toDateStr);

    // 4. Registrar log de auditoría
    try {
      await supabase.from('employee_logs').insert([{
        employee_num: '000',
        employee_name: 'System Cron',
        department: 'administracion',
        module: 'analytics',
        action: 'cron_analytics_sync_success',
        room: 'Beds24 Sync',
        details: JSON.stringify({
          text: `Sincronización masiva de reservas para Business Intelligence completada. Total importado: ${result.count} reservas.`,
          rango: `${fromDateStr} a ${toDateStr}`,
          success: true
        }),
        created_at: new Date().toISOString()
      }]);
    } catch (logErr) {
      console.error("[Cron Analytics Sync] Error al registrar log de auditoría:", logErr);
    }

    return NextResponse.json({ success: true, count: result.count, from: fromDateStr, to: toDateStr });
  } catch (err: any) {
    console.error("[Cron Analytics Sync] Error general en ejecución de cron:", err);
    
    // Registrar log de falla
    try {
      await supabase.from('employee_logs').insert([{
        employee_num: '000',
        employee_name: 'System Cron',
        department: 'administracion',
        module: 'analytics',
        action: 'cron_analytics_sync_failed',
        room: 'Beds24 Sync',
        details: JSON.stringify({
          error: err.message || String(err),
          success: false
        }),
        created_at: new Date().toISOString()
      }]);
    } catch (logErr) {
      console.error("[Cron Analytics Sync] Error al registrar log de falla:", logErr);
    }

    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
