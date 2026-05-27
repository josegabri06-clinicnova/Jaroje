// ─── Sistema de Autenticación por Roles ──────────────────────────────────────
// PINs almacenados en Supabase (tabla settings) + fallback a defaults
// Así funcionan en TODOS los dispositivos, no solo en el que se cambiaron

export const DEFAULT_ADMIN_PIN                 = '1234';
export const DEFAULT_STAFF_LIMPIEZA_PIN        = '5678';
export const DEFAULT_STAFF_MANTENIMIENTO_PIN   = '8765';
export const DEFAULT_RECEPCION_PIN             = '0000';

export type Role = 'admin' | 'staff_limpieza' | 'staff_mantenimiento' | 'recepcion' | null;

const ROLE_KEY = 'jaroje_role';

// ── Cache local de PINs (se sincroniza con Supabase) ──────────────────────────
let _cache: Record<string, string> | null = null;

function supabaseHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`,
  };
}

const SUPABASE_URL = typeof window !== 'undefined'
  ? (window as any).__ENV__?.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  : process.env.NEXT_PUBLIC_SUPABASE_URL;

// ── Cargar PINs desde Supabase (o localStorage como fallback) ─────────────────
export async function loadPinsFromSupabase(): Promise<Record<string, string>> {
  if (_cache) return _cache;

  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/settings?key=in.(pin_admin,pin_limpieza,pin_mantenimiento,pin_recepcion)&select=key,value`;
    const res = await fetch(url, { headers: supabaseHeaders(), cache: 'no-store' });
    if (res.ok) {
      const rows: { key: string; value: string }[] = await res.json();
      const map: Record<string, string> = {};
      rows.forEach(r => { map[r.key] = r.value; });
      _cache = map;
      return map;
    }
  } catch (e) {
    console.warn('No se pudo cargar PINs desde Supabase, usando defaults');
  }

  // Fallback: localStorage
  _cache = {
    pin_admin:          localStorage.getItem('jaroje_admin_pin')          || DEFAULT_ADMIN_PIN,
    pin_limpieza:       localStorage.getItem('jaroje_staff_limpieza_pin') || DEFAULT_STAFF_LIMPIEZA_PIN,
    pin_mantenimiento:  localStorage.getItem('jaroje_staff_mantenimiento_pin') || DEFAULT_STAFF_MANTENIMIENTO_PIN,
    pin_recepcion:      localStorage.getItem('jaroje_recepcion_pin')      || DEFAULT_RECEPCION_PIN,
  };
  return _cache;
}

// ── Guardar PIN en Supabase ───────────────────────────────────────────────────
export async function savePinToSupabase(key: string, value: string): Promise<boolean> {
  _cache = null; // invalidar cache
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/settings`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...supabaseHeaders(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ key, value }),
    });
    if (res.ok || res.status === 201 || res.status === 204) return true;
  } catch (e) {
    console.warn('Error guardando PIN en Supabase, usando localStorage');
  }
  // Fallback: localStorage
  const lsMap: Record<string, string> = {
    pin_admin: 'jaroje_admin_pin',
    pin_limpieza: 'jaroje_staff_limpieza_pin',
    pin_mantenimiento: 'jaroje_staff_mantenimiento_pin',
    pin_recepcion: 'jaroje_recepcion_pin',
  };
  if (lsMap[key]) localStorage.setItem(lsMap[key], value);
  return false;
}

// ── Reset de emergencia: restaura todos los PINs a defaults ──────────────────
export async function resetAllPinsToDefault(): Promise<void> {
  _cache = null;
  const defaults = [
    { key: 'pin_admin',         value: DEFAULT_ADMIN_PIN },
    { key: 'pin_limpieza',      value: DEFAULT_STAFF_LIMPIEZA_PIN },
    { key: 'pin_mantenimiento', value: DEFAULT_STAFF_MANTENIMIENTO_PIN },
    { key: 'pin_recepcion',     value: DEFAULT_RECEPCION_PIN },
  ];
  for (const { key, value } of defaults) {
    await savePinToSupabase(key, value);
  }
  // También limpiar localStorage
  ['jaroje_admin_pin','jaroje_staff_limpieza_pin','jaroje_staff_mantenimiento_pin','jaroje_recepcion_pin']
    .forEach(k => localStorage.removeItem(k));
}

// ── Getters síncronos (para compatibilidad) ──────────────────────────────────
export function getAdminPin(): string {
  if (typeof window === 'undefined') return DEFAULT_ADMIN_PIN;
  return _cache?.pin_admin || localStorage.getItem('jaroje_admin_pin') || DEFAULT_ADMIN_PIN;
}
export function getStaffLimpiezaPin(): string {
  if (typeof window === 'undefined') return DEFAULT_STAFF_LIMPIEZA_PIN;
  return _cache?.pin_limpieza || localStorage.getItem('jaroje_staff_limpieza_pin') || DEFAULT_STAFF_LIMPIEZA_PIN;
}
export function getStaffMantenimientoPin(): string {
  if (typeof window === 'undefined') return DEFAULT_STAFF_MANTENIMIENTO_PIN;
  return _cache?.pin_mantenimiento || localStorage.getItem('jaroje_staff_mantenimiento_pin') || DEFAULT_STAFF_MANTENIMIENTO_PIN;
}
export function getRecepcionPin(): string {
  if (typeof window === 'undefined') return DEFAULT_RECEPCION_PIN;
  return _cache?.pin_recepcion || localStorage.getItem('jaroje_recepcion_pin') || DEFAULT_RECEPCION_PIN;
}

// Setters (guardan en Supabase + localStorage)
export function saveAdminPin(pin: string)               { savePinToSupabase('pin_admin', pin); localStorage.setItem('jaroje_admin_pin', pin); _cache = null; }
export function saveStaffLimpiezaPin(pin: string)       { savePinToSupabase('pin_limpieza', pin); localStorage.setItem('jaroje_staff_limpieza_pin', pin); _cache = null; }
export function saveStaffMantenimientoPin(pin: string)  { savePinToSupabase('pin_mantenimiento', pin); localStorage.setItem('jaroje_staff_mantenimiento_pin', pin); _cache = null; }
export function saveRecepcionPin(pin: string)           { savePinToSupabase('pin_recepcion', pin); localStorage.setItem('jaroje_recepcion_pin', pin); _cache = null; }

// ── Rol activo ────────────────────────────────────────────────────────────────
export function getRole(): Role {
  if (typeof window === 'undefined') return null;
  return (localStorage.getItem(ROLE_KEY) as Role) || null;
}
export function setRole(role: Role) {
  if (!role) localStorage.removeItem(ROLE_KEY);
  else localStorage.setItem(ROLE_KEY, role);
}
export function logout() {
  localStorage.removeItem(ROLE_KEY);
}

// ── Validación de PIN (async — carga desde Supabase) ──────────────────────────
export async function validatePinAsync(pin: string, expectedRole: Role): Promise<boolean> {
  const pins = await loadPinsFromSupabase();
  const roleMap: Record<string, string> = {
    admin:               pins.pin_admin         || DEFAULT_ADMIN_PIN,
    staff_limpieza:      pins.pin_limpieza      || DEFAULT_STAFF_LIMPIEZA_PIN,
    staff_mantenimiento: pins.pin_mantenimiento || DEFAULT_STAFF_MANTENIMIENTO_PIN,
    recepcion:           pins.pin_recepcion     || DEFAULT_RECEPCION_PIN,
  };
  return expectedRole ? pin === roleMap[expectedRole] : false;
}

// ── Validación síncrona (legacy, usa cache) ───────────────────────────────────
export function validatePin(pin: string): Role {
  if (pin === (getAdminPin()))               return 'admin';
  if (pin === (getStaffLimpiezaPin()))       return 'staff_limpieza';
  if (pin === (getStaffMantenimientoPin()))  return 'staff_mantenimiento';
  if (pin === (getRecepcionPin()))           return 'recepcion';
  return null;
}

// ─── Sistema de Seguimiento de Empleados (Auditoría de 3 Dígitos) ─────────────

export interface Employee {
  employee_num: string;
  full_name: string;
  department: 'recepcion' | 'mantenimiento' | 'limpieza';
}

// Nómina oficial aprobada como fallback estático ultra-rápido (Zero Latency)
export const OFFICIAL_EMPLOYEES: Employee[] = [
  // Recepción (7 Empleados)
  { employee_num: '101', full_name: 'Sofía Alarcón', department: 'recepcion' },
  { employee_num: '103', full_name: 'Carlos Méndez', department: 'recepcion' },
  { employee_num: '106', full_name: 'Valeria Espinoza', department: 'recepcion' },
  { employee_num: '108', full_name: 'Alejandro Ruiz', department: 'recepcion' },
  { employee_num: '110', full_name: 'Mariana Ortiz', department: 'recepcion' },
  { employee_num: '112', full_name: 'Diana Benítez', department: 'recepcion' },
  { employee_num: '202', full_name: 'Roberto Salazar', department: 'recepcion' },
  { employee_num: '999', full_name: 'Recepcionista Demo', department: 'recepcion' },

  // Mantenimiento (3 Empleados)
  { employee_num: '101', full_name: 'Juan Carlos Peña', department: 'mantenimiento' },
  { employee_num: '111', full_name: 'Eduardo Gómez', department: 'mantenimiento' },
  { employee_num: '202', full_name: 'Roberto Salazar', department: 'mantenimiento' },
  { employee_num: '999', full_name: 'Mantenimiento Demo', department: 'mantenimiento' },

  // Limpieza (6 Empleadas)
  { employee_num: '104', full_name: 'María Elena Flores', department: 'limpieza' },
  { employee_num: '105', full_name: 'Juana Martínez', department: 'limpieza' },
  { employee_num: '106', full_name: 'Guadalupe Gómez', department: 'limpieza' },
  { employee_num: '107', full_name: 'Teresa Ramos', department: 'limpieza' },
  { employee_num: '108', full_name: 'Silvia Paredes', department: 'limpieza' },
  { employee_num: '109', full_name: 'Francisca Ruiz', department: 'limpieza' },
  { employee_num: '999', full_name: 'Limpieza Demo', department: 'limpieza' }
];

// Obtener el empleado activo para un módulo específico (con vencimiento absoluto de 1 hora)
export function getActiveEmployee(module: 'recepcion' | 'limpieza' | 'mantenimiento'): Employee | null {
  if (typeof window === 'undefined') return null;
  const num = localStorage.getItem(`jaroje_active_emp_num_${module}`);
  const name = localStorage.getItem(`jaroje_active_emp_name_${module}`);
  const timeStr = localStorage.getItem(`jaroje_active_emp_time_${module}`);
  
  if (!num || !name) return null;
  
  const now = Date.now();
  if (timeStr) {
    const lastActive = parseInt(timeStr, 10);
    if (now - lastActive > 3600000) { // 1 hora = 3,600,000 ms
      // Expirado, limpiar localmente
      localStorage.removeItem(`jaroje_active_emp_num_${module}`);
      localStorage.removeItem(`jaroje_active_emp_name_${module}`);
      localStorage.removeItem(`jaroje_active_emp_time_${module}`);
      return null;
    }
  }
  
  // Renovar la ventana de actividad (sliding window)
  localStorage.setItem(`jaroje_active_emp_time_${module}`, now.toString());
  
  return {
    employee_num: num,
    full_name: name,
    department: module
  };
}

// Establecer el empleado activo para un módulo específico
export function setActiveEmployee(employee: Employee | null, module: 'recepcion' | 'limpieza' | 'mantenimiento'): void {
  if (typeof window === 'undefined') return;
  if (!employee) {
    localStorage.removeItem(`jaroje_active_emp_num_${module}`);
    localStorage.removeItem(`jaroje_active_emp_name_${module}`);
    localStorage.removeItem(`jaroje_active_emp_time_${module}`);
  } else {
    localStorage.setItem(`jaroje_active_emp_num_${module}`, employee.employee_num);
    localStorage.setItem(`jaroje_active_emp_name_${module}`, employee.full_name);
    localStorage.setItem(`jaroje_active_emp_time_${module}`, Date.now().toString());
  }
}

// Limpiar el empleado activo para un módulo específico
export function clearActiveEmployee(module: 'recepcion' | 'limpieza' | 'mantenimiento'): void {
  setActiveEmployee(null, module);
}

// Validar localmente si un número de empleado existe y pertenece al departamento
export function validateEmployeeNum(num: string, department: 'recepcion' | 'mantenimiento' | 'limpieza'): Employee | null {
  const match = OFFICIAL_EMPLOYEES.find(
    emp => emp.employee_num === num && emp.department === department
  );
  return match || null;
}

