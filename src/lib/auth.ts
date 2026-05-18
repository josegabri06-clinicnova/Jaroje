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
