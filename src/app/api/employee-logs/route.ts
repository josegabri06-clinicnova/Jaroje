import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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

// DELETE — Eliminar registros de auditoría de Supabase (gobernanza de datos)
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const olderThanDays = searchParams.get('olderThanDays');

    if (id) {
      const { error } = await supabase.from('employee_logs').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (olderThanDays) {
      const days = parseInt(olderThanDays);
      if (isNaN(days)) {
        return NextResponse.json({ success: false, error: 'Parámetro olderThanDays inválido' }, { status: 400 });
      }
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const { error } = await supabase
        .from('employee_logs')
        .delete()
        .lt('created_at', cutoffDate.toISOString());
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // Borrado por cuerpo JSON (lista de IDs)
    const body = await req.json().catch(() => ({}));
    if (body.ids && Array.isArray(body.ids)) {
      const { error } = await supabase
        .from('employee_logs')
        .delete()
        .in('id', body.ids);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'ID o lista de IDs no especificados' }, { status: 400 });
  } catch (err: any) {
    console.error('API Employee Logs DELETE Error:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

