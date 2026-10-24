import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/settings/whatsapp-pause
 * Consulta el estado actual del freno de emergencia de WhatsApp
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'disable_automatic_whatsapp')
      .maybeSingle();

    if (error) {
      console.error("[Settings WA Pause] Error consultando estado:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const rawVal = data?.value;
    const isPaused = Boolean(
      rawVal === true || 
      rawVal === 'true' || 
      rawVal === 1 || 
      rawVal === '1'
    );

    return NextResponse.json({ success: true, paused: isPaused });
  } catch (err: any) {
    console.error("[Settings WA Pause] Error inesperado en GET:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/settings/whatsapp-pause
 * Modifica de forma garantizada con credenciales de servicio el estado del freno de emergencia
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const isPaused = Boolean(body.paused);

    const { error: upsertErr } = await supabase
      .from('settings')
      .upsert(
        { key: 'disable_automatic_whatsapp', value: String(isPaused) },
        { onConflict: 'key' }
      );

    if (upsertErr) {
      console.error("[Settings WA Pause] Error guardando setting:", upsertErr);
      return NextResponse.json({ success: false, error: upsertErr.message }, { status: 500 });
    }

    // Auditoría en employee_logs
    try {
      await supabase.from('employee_logs').insert([{
        employee_num: 'admin',
        employee_name: 'Administrador',
        department: 'gerencia',
        module: 'ajustes',
        action: isPaused ? 'whatsapp_emergency_pause_activated' : 'whatsapp_emergency_pause_deactivated',
        room: 'General',
        details: JSON.stringify({
          text: isPaused
            ? '🛑 FRENO DE EMERGENCIA ACTIVADO: Envíos automáticos de plantillas de WhatsApp suspendidos.'
            : '▶️ Envíos automáticos de plantillas de WhatsApp reactivados.',
          paused: isPaused,
          timestamp: new Date().toISOString()
        })
      }]);
    } catch (logErr) {
      console.warn("[Settings WA Pause] Error registrando auditoría:", logErr);
    }

    console.log(`[Settings WA Pause] ✅ Estado de freno de emergencia actualizado a: ${isPaused ? 'PAUSADO (true)' : 'ACTIVO (false)'}`);

    return NextResponse.json({
      success: true,
      paused: isPaused,
      message: isPaused
        ? 'Envíos automáticos de WhatsApp pausados exitosamente.'
        : 'Envíos automáticos de WhatsApp reactivados exitosamente.'
    });
  } catch (err: any) {
    console.error("[Settings WA Pause] Error en POST:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
