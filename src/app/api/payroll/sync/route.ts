import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.replace(/^"|"$/g, '').trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.replace(/^"|"$/g, '').trim());
  return result;
}

function parseCSV(text: string) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];
  
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const result: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] || '').trim();
    });
    result.push(row);
  }
  return result;
}

export async function POST(req: Request) {
  try {
    const role = req.headers.get("x-user-role") || "";
    const adminPin = req.headers.get("x-admin-pin") || "";

    if (role !== "admin") {
      return NextResponse.json({ error: "Acceso no autorizado. Se requieren permisos de administrador." }, { status: 403 });
    }

    // Validar el PIN de Administrador contra la base de datos
    try {
      const { data: pinSetting } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "pin_admin")
        .maybeSingle();
      
      const dbAdminPin = pinSetting?.value || "1234";
      if (!adminPin || adminPin !== dbAdminPin) {
        return NextResponse.json({ error: "PIN de administrador incorrecto o ausente." }, { status: 401 });
      }
    } catch (dbErr: any) {
      console.error("Error validando PIN de Admin en base de datos:", dbErr);
      return NextResponse.json({ error: "Error de seguridad del servidor al validar credenciales." }, { status: 500 });
    }

    const { sheetUrl } = await req.json();

    if (!sheetUrl || !sheetUrl.trim()) {
      return NextResponse.json({ error: 'El enlace de la hoja es obligatorio.' }, { status: 400 });
    }

    // 1. Extraer ID de la hoja de cálculo
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const sheetId = match ? match[1] : sheetUrl.trim();

    // 2. Descargar CSV directo (HACK PREMIUM: Cero Google Cloud Console)
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    const res = await fetch(csvUrl, { cache: 'no-store' });

    if (!res.ok) {
      throw new Error('No se pudo descargar la hoja. Verifica que esté compartida en modo Lector (Cualquier persona con el enlace).');
    }

    const csvText = await res.text();
    const rows = parseCSV(csvText);

    if (rows.length === 0) {
      throw new Error('La hoja de cálculo está vacía o no tiene el formato correcto.');
    }

    // 3. Procesar y mapear columnas
    const employees: any[] = [];
    
    for (const row of rows) {
      // Buscar columnas de forma flexible
      const employeeNum = row['no. empleado'] || row['num'] || row['codigo'] || row['no_empleado'] || '';
      const fullName = row['nombre'] || row['nombre completo'] || row['empleado'] || '';
      let rawDept = row['departamento'] || row['modulo'] || row['puesto'] || '';
      const whatsapp = row['whatsapp'] || row['telefono'] || row['teléfono'] || '';

      if (!employeeNum || !fullName) continue;

      // Normalizar departamento
      let department: 'recepcion' | 'limpieza' | 'mantenimiento' = 'limpieza';
      const deptLower = rawDept.toLowerCase().trim();
      if (deptLower.includes('recep') || deptLower.includes('admin')) {
        department = 'recepcion';
      } else if (deptLower.includes('mant') || deptLower.includes('tecn') || deptLower.includes('mtto')) {
        department = 'mantenimiento';
      } else {
        department = 'limpieza';
      }

      employees.push({
        employee_num: String(employeeNum).trim(),
        full_name: String(fullName).trim(),
        department,
        phone: String(whatsapp).replace(/\D/g, '') // Quitar caracteres no numéricos
      });
    }

    if (employees.length === 0) {
      throw new Error('No se encontraron empleados válidos en la hoja. Asegúrate de tener las columnas "No. Empleado" y "Nombre".');
    }

    // 4. Guardar empleados en Supabase settings table (Evita migraciones)
    const { error: saveError } = await supabase
      .from('settings')
      .upsert({ 
        key: 'official_employees', 
        value: JSON.stringify(employees) 
      }, { onConflict: 'key' });

    if (saveError) {
      throw new Error(`Error guardando en Supabase settings: ${saveError.message}`);
    }

    // 5. Guardar el enlace configurado para uso futuro
    await supabase
      .from('settings')
      .upsert({ 
        key: 'google_sheet_nominas_url', 
        value: sheetUrl.trim() 
      }, { onConflict: 'key' });

    return NextResponse.json({ 
      success: true, 
      count: employees.length, 
      employees 
    });

  } catch (error: any) {
    console.error('Error synchronizing Google Sheet payroll:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
