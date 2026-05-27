import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { OFFICIAL_EMPLOYEES } from '@/lib/auth';

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

