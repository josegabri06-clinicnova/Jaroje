import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { OFFICIAL_EMPLOYEES } from '@/lib/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET — Obtener lista de empleados desde Supabase (con fallback estático robusto)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('employee_num');

    if (error) {
      console.warn('API Employees: Tabla "employees" no disponible o error de consulta. Usando fallback estático.', error.message);
      return NextResponse.json({ success: true, source: 'fallback', data: OFFICIAL_EMPLOYEES });
    }

    // Si la tabla está vacía, insertar los empleados iniciales o usar fallback
    if (!data || data.length === 0) {
      console.log('API Employees: Tabla vacía, sirviendo fallback oficial.');
      return NextResponse.json({ success: true, source: 'fallback', data: OFFICIAL_EMPLOYEES });
    }

    return NextResponse.json({ success: true, source: 'database', data });
  } catch (err: any) {
    console.error('API Employees: Error inesperado en backend:', err.message);
    return NextResponse.json({ success: true, source: 'fallback', data: OFFICIAL_EMPLOYEES });
  }
}
