import { NextResponse } from 'next/server';
import { syncBeds24ReservationsRange } from '@/lib/beds24';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // 1. Calcular rango rápido (60 días atrás hasta 120 días adelante)
    const today = new Date();
    
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 60);
    const fromDateStr = fromDate.toISOString().split('T')[0];

    const toDate = new Date(today);
    toDate.setDate(today.getDate() + 120);
    const toDateStr = toDate.toISOString().split('T')[0];

    console.log(`[Manual Analytics Sync] Sincronizando rango rápido: ${fromDateStr} - ${toDateStr}`);

    // 2. Ejecutar sincronización
    const result = await syncBeds24ReservationsRange(fromDateStr, toDateStr);

    // 3. Registrar log de auditoría
    try {
      await supabase.from('employee_logs').insert([{
        employee_num: '001', // General Admin/Manual
        employee_name: 'Administrador (Manual)',
        department: 'administracion',
        module: 'analytics',
        action: 'manual_analytics_sync_success',
        room: 'Beds24 Sync',
        details: JSON.stringify({
          text: `Sincronización manual rápida completada. Total importado: ${result.count} reservas.`,
          rango: `${fromDateStr} a ${toDateStr}`,
          success: true
        }),
        created_at: new Date().toISOString()
      }]);
    } catch (logErr) {
      console.error("[Manual Analytics Sync] Error al registrar log de auditoría:", logErr);
    }

    return NextResponse.json({ success: true, count: result.count, from: fromDateStr, to: toDateStr });
  } catch (err: any) {
    console.error("[Manual Analytics Sync] Error:", err);
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
