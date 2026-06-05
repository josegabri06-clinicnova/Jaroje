import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { OFFICIAL_EMPLOYEES } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET — Obtener lista de empleados desde Supabase settings (con fallback estático robusto)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'official_employees')
      .maybeSingle();

    if (error) {
      console.warn('API Employees: Error de consulta en "settings". Usando fallback estático.', error.message);
      return NextResponse.json({ success: true, source: 'fallback', data: OFFICIAL_EMPLOYEES });
    }

    if (!data || !data.value) {
      console.log('API Employees: settings.official_employees no configurado. Sirviendo fallback oficial.');
      return NextResponse.json({ success: true, source: 'fallback', data: OFFICIAL_EMPLOYEES });
    }

    try {
      const employees = JSON.parse(data.value);
      if (Array.isArray(employees) && employees.length > 0) {
        return NextResponse.json({ success: true, source: 'database', data: employees });
      }
    } catch (e) {
      console.error('Error parseando official_employees:', e);
    }

    return NextResponse.json({ success: true, source: 'fallback', data: OFFICIAL_EMPLOYEES });
  } catch (err: any) {
    console.error('API Employees: Error inesperado en backend:', err.message);
    return NextResponse.json({ success: true, source: 'fallback', data: OFFICIAL_EMPLOYEES });
  }
}

// POST — Guardar o actualizar el catálogo de empleados en Supabase settings
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { employees } = body;

    if (!Array.isArray(employees)) {
      return NextResponse.json(
        { success: false, error: 'Estructura de datos inválida. Debe ser un array de empleados.' },
        { status: 400 }
      );
    }

    // Upsert atómico en la tabla de configuraciones
    const { error } = await supabase
      .from('settings')
      .upsert(
        { key: 'official_employees', value: JSON.stringify(employees) },
        { onConflict: 'key' }
      );

    if (error) {
      console.error('API Employees: Error persistiendo catálogo en settings:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: employees.length });
  } catch (err: any) {
    console.error('API Employees POST: Error inesperado:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
