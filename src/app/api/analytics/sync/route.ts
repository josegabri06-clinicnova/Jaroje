import { NextResponse } from 'next/server';
import { syncBeds24ReservationsRange } from '@/lib/beds24';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for full sync

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const { mode = 'full', from, to } = body;

    const today = new Date();
    const currentYear = today.getFullYear();

    let fromDateStr: string;
    let toDateStr: string;

    if (mode === 'custom' && from && to) {
      fromDateStr = from;
      toDateStr = to;
    } else if (mode === 'recent') {
      // Rango reciente (60 días atrás a 120 días adelante)
      const fromDate = new Date(today);
      fromDate.setDate(today.getDate() - 60);
      fromDateStr = fromDate.toISOString().split('T')[0];

      const toDate = new Date(today);
      toDate.setDate(today.getDate() + 120);
      toDateStr = toDate.toISOString().split('T')[0];
    } else {
      // Modo 'full' (Histórico Completo para BI & YoY: 2024-01-01 a 2027-12-31)
      fromDateStr = '2024-01-01';
      toDateStr = `${currentYear + 1}-12-31`;
    }

    console.log(`[Analytics Sync] Iniciando sincronización (${mode}): ${fromDateStr} - ${toDateStr}`);

    // Ejecutar sincronización en Beds24 y Supabase
    const result = await syncBeds24ReservationsRange(fromDateStr, toDateStr);

    // Registrar log de auditoría
    try {
      await supabase.from('employee_logs').insert([{
        employee_num: '001',
        employee_name: 'Administrador (Analytics)',
        department: 'administracion',
        module: 'analytics',
        action: mode === 'full' ? 'full_historical_analytics_sync_success' : 'manual_analytics_sync_success',
        room: 'Beds24 Sync',
        details: JSON.stringify({
          text: `Sincronización de Analytics (${mode}) completada. Total importado: ${result.count} reservas.`,
          rango: `${fromDateStr} a ${toDateStr}`,
          success: true
        }),
        created_at: new Date().toISOString()
      }]);
    } catch (logErr) {
      console.error("[Analytics Sync] Error al registrar log de auditoría:", logErr);
    }

    return NextResponse.json({ 
      success: true, 
      count: result.count, 
      from: fromDateStr, 
      to: toDateStr,
      mode 
    });
  } catch (err: any) {
    console.error("[Analytics Sync] Error:", err);
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
