// ─── Sistema de Autenticación por Roles ──────────────────────────────────────
// Los PIN viven solo en el servidor (tabla settings, accesible únicamente con la clave de servicio).
// El navegador nunca lee ni guarda un PIN: valida y cambia PIN a través de las rutas /api.

export type Role = 'admin' | 'staff_limpieza' | 'staff_mantenimiento' | 'recepcion' | null;

const ROLE_KEY = 'jaroje_role';

// Copias de PIN que versiones anteriores guardaban en este navegador; se borran para no dejar PIN en claro
export function clearLegacyPinCopies() {
  if (typeof window === 'undefined') return;
  try {
    ['jaroje_admin_pin', 'jaroje_staff_limpieza_pin', 'jaroje_staff_mantenimiento_pin', 'jaroje_recepcion_pin']
      .forEach(k => localStorage.removeItem(k));
  } catch { /* almacenamiento no disponible */ }
}

// Comprueba el PIN de administrador en el servidor sin cambiar la sesión (desbloqueos de precio, borrados…)
export async function verifyAdminPin(pin: string): Promise<boolean> {
  if (!pin) return false;
  try {
    const res = await fetch('/api/auth/verify-admin-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.success);
  } catch {
    return false;
  }
}

// Cambia el PIN de un rol (solo administrador con sesión). Devuelve el error del servidor para mostrarlo en pantalla
export async function changePin(
  role: Exclude<Role, null>,
  newPin: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/settings/pins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, newPin }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) return { success: true };
    return { success: false, error: data.error || 'No se pudo cambiar el PIN.' };
  } catch {
    return { success: false, error: 'Error de red al cambiar el PIN.' };
  }
}

// ── Rol activo ────────────────────────────────────────────────────────────────
export function getRole(): Role {
  if (typeof window === 'undefined') return null;
  return (localStorage.getItem(ROLE_KEY) as Role) || null;
}
export function setRole(role: Role) {
  if (!role) localStorage.removeItem(ROLE_KEY);
  else localStorage.setItem(ROLE_KEY, role);
  // Al iniciar sesión se vacía la caché de la consulta de sesión para no usar un "no hay sesión" anterior al login
  clearServerSessionCache();
}
// Consulta al servidor si hay sesión válida (cookie HttpOnly). Es la fuente de verdad; localStorage es solo una copia.
// 'error' = no se pudo consultar (sin red): en ese caso no se borra nada.
export type ServerSession = { status: 'ok'; role: Role } | { status: 'none' } | { status: 'error' };
let _serverSessionCache: { value: ServerSession; ts: number } | null = null;

export function clearServerSessionCache() {
  _serverSessionCache = null;
}

export async function fetchServerSession(): Promise<ServerSession> {
  if (_serverSessionCache && Date.now() - _serverSessionCache.ts < 10_000) return _serverSessionCache.value;
  let value: ServerSession;
  try {
    const res = await fetch('/api/auth/session', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      value = data?.role ? { status: 'ok', role: data.role as Role } : { status: 'none' };
    } else if (res.status === 401) {
      value = { status: 'none' };
    } else {
      return { status: 'error' };
    }
  } catch {
    return { status: 'error' };
  }
  // Solo se cachea el "sí hay sesión"; un "no hay sesión" puede cambiar al instante con el login
  if (value.status === 'ok') _serverSessionCache = { value, ts: Date.now() };
  return value;
}

export async function logout() {
  localStorage.removeItem(ROLE_KEY);
  clearLegacyPinCopies();
  clearServerSessionCache();
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('jaroje_session_pin');
    // Se espera a que el servidor borre la cookie antes de navegar, para no rebotar de /login a /calendario
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* sin red: la cookie caduca sola */ }
  }
}

// ── Validación de PIN (servidor seguro con emisión de cookie HttpOnly) ────────
export async function validatePinAsync(pin: string, expectedRole: Role): Promise<boolean> {
  if (!expectedRole || !pin) return false;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, role: expectedRole })
    });
    if (res.ok) {
      const data = await res.json();
      return Boolean(data.success);
    }
    return false;
  } catch (e) {
    console.error('Error validando PIN contra el servidor:', e);
    return false;
  }
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

/**
 * getOperatorForLog — helper centralizado para registrar quién ejecutó una acción en la auditoría.
 *
 * Lógica:
 *  - Si el rol activo es 'admin', devuelve datos de Administrador (no busca la sesión de recepción).
 *  - Si hay un empleado de recepción activo, lo devuelve.
 *  - Si no hay nadie activo, devuelve un fallback genérico con el rol actual.
 *
 * Uso:  const op = getOperatorForLog();
 *       // op.employee_num, op.full_name, op.department, op.module
 */
export function getOperatorForLog(): {
  employee_num: string;
  full_name: string;
  department: string;
  module: string;
} {
  if (typeof window === 'undefined') {
    return { employee_num: 'SRV', full_name: 'Servidor', department: 'sistema', module: 'sistema' };
  }

  const role = getRole();

  // Admin → siempre registrar como Administrador, NO leer sesión de recepción
  if (role === 'admin') {
    return {
      employee_num: 'ADM',
      full_name: 'Administrador',
      department: 'admin',
      module: 'admin',
    };
  }

  // Recepción → leer el empleado que haya fichado en recepción
  const empRec = getActiveEmployee('recepcion');
  if (empRec) {
    return {
      employee_num: empRec.employee_num,
      full_name: empRec.full_name,
      department: empRec.department,
      module: 'recepcion',
    };
  }

  // Limpieza
  const empLimp = getActiveEmployee('limpieza');
  if (empLimp) {
    return {
      employee_num: empLimp.employee_num,
      full_name: empLimp.full_name,
      department: empLimp.department,
      module: 'limpieza',
    };
  }

  // Mantenimiento
  const empMant = getActiveEmployee('mantenimiento');
  if (empMant) {
    return {
      employee_num: empMant.employee_num,
      full_name: empMant.full_name,
      department: empMant.department,
      module: 'mantenimiento',
    };
  }

  // Fallback genérico
  return {
    employee_num: '999',
    full_name: role === 'recepcion' ? 'Recepción' : 'Sistema',
    department: role || 'sistema',
    module: role || 'sistema',
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

// Obtener lista completa de empleados (prioriza localStorage sincronizado, con fallback oficial)
export function getOfficialEmployees(): Employee[] {
  if (typeof window === 'undefined') return OFFICIAL_EMPLOYEES;
  try {
    const stored = localStorage.getItem('jaroje_official_employees');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error parseando jaroje_official_employees de localStorage:', e);
  }
  return OFFICIAL_EMPLOYEES;
}

// Sincronizar empleados del servidor a localStorage en segundo plano
export async function syncEmployeesFromServer(): Promise<Employee[]> {
  try {
    const res = await fetch('/api/employees', { cache: 'no-store' });
    if (res.ok) {
      const body = await res.json();
      if (body.success && Array.isArray(body.data)) {
        localStorage.setItem('jaroje_official_employees', JSON.stringify(body.data));
        return body.data;
      }
    }
  } catch (e) {
    console.warn('No se pudo sincronizar empleados desde el servidor:', e);
  }
  return getOfficialEmployees();
}

// Validar localmente si un número de empleado existe en cualquier departamento
export function validateEmployeeNum(num: string, department: 'recepcion' | 'mantenimiento' | 'limpieza'): Employee | null {
  const list = getOfficialEmployees();
  
  // Buscar primero en el departamento solicitado para evitar colisiones
  const matchInDept = list.find(
    emp => emp.employee_num === num && emp.department === department
  );
  if (matchInDept) return matchInDept;

  // Si no se encuentra en el departamento solicitado, buscar en cualquier otro departamento
  const matchAnywhere = list.find(emp => emp.employee_num === num);
  if (matchAnywhere) {
    // Retornamos el empleado adaptando su departamento al módulo donde está ingresando
    return {
      ...matchAnywhere,
      department: department
    };
  }

  return null;
}


