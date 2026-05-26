import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// POST — Insertar un log de auditoría de empleado en Supabase (trazabilidad inmutable)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { employee_num, employee_name, department, module, action, room, details } = body;

    // Validar campos obligatorios en el backend
    if (!employee_num || !employee_name || !department || !module || !action) {
      return NextResponse.json({
        success: false,
        error: 'Faltan parámetros requeridos: employee_num, employee_name, department, module, action'
      }, { status: 400 });
    }

    // Insertar en la tabla employee_logs
    const { data, error } = await supabase
      .from('employee_logs')
      .insert([
        {
          employee_num,
          employee_name,
          department,
          module,
          action,
          room: room || null,
          details: details ? (typeof details === 'object' ? JSON.stringify(details) : details) : null,
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) {
      console.warn('API Employee Logs: Error insertando log en base de datos. Guardado local fallido:', error.message);
      // Fallback: responder éxito al cliente para no romper la UX, pero advertir
      return NextResponse.json({
        success: true,
        source: 'local_fallback',
        warning: 'Tabla employee_logs no disponible. Log ignorado en base de datos pero procesado.',
        error_details: error.message
      });
    }

    // Central de Alertas Críticas (Out-of-App Push Alerter vía WhatsApp Administrador)
    // Se ejecuta de manera asíncrona (fire-and-forget) para no penalizar la latencia del cliente
    const adminPhone = process.env.ADMIN_NOTIFICATION_PHONE;
    const isCriticalAction = ['report_maintenance', 'human_mode_activated', 'reset_contable'].includes(action);

    if (adminPhone && isCriticalAction) {
      const WHATSAPP_TOKEN    = process.env.WHATSAPP_TOKEN;
      const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

      if (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
        let text = '';
        if (action === 'report_maintenance') {
          text = `🔴 *staySync: Reporte de Daño Técnico*\n\n` +
                 `🛠 *Habitación:* ${room || 'General'}\n` +
                 `👤 *Reportado por:* ${employee_name} (${employee_num})\n` +
                 `📝 *Detalles:* ${details || 'Sin detalles'}`;
        } else if (action === 'human_mode_activated') {
          text = `⚠️ *staySync: Ayuda Requerida*\n\n` +
                 `Un huésped solicita hablar con el administrador. El bot inteligente ha sido pausado.\n` +
                 `👤 *Huésped:* ${employee_name}\n` +
                 `📝 *Detalles:* ${details || 'Sin detalles'}`;
        } else if (action === 'reset_contable') {
          text = `🔥 *staySync: Alerta de Sistema*\n\n` +
                 `Se ejecutó un restablecimiento contable total por ${employee_name}.\n` +
                 `📝 *Detalles:* ${details}`;
        }

        if (text) {
          fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: adminPhone.replace(/\D/g, '').trim(),
              type: 'text',
              text: { body: text },
            }),
          }).catch(fetchErr => {
            console.error("Error dispatching admin critical alert to WhatsApp:", fetchErr);
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      source: 'database',
      data: data?.[0]
    });
  } catch (err: any) {
    console.error('API Employee Logs: Error inesperado en inserción:', err.message);
    return NextResponse.json({
      success: true,
      source: 'local_fallback',
      warning: 'Error en servidor, log no insertado.'
    });
  }
}

// GET — Obtener logs de auditoría de empleado en Supabase
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const moduleParam = searchParams.get('module') || '';

    let query = supabase
      .from('employee_logs')
      .select('*');

    if (moduleParam) {
      query = query.eq('module', moduleParam);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('API Employee Logs GET Error:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('API Employee Logs GET Exception:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

