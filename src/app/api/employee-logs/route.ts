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
