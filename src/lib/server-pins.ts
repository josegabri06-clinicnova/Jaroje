import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Los PIN viven en `settings` y solo el servidor (service role) los lee o escribe; el navegador nunca los recibe.
export const PIN_DB_KEY = {
  admin: 'pin_admin',
  recepcion: 'pin_recepcion',
  staff_limpieza: 'pin_limpieza',
  staff_mantenimiento: 'pin_mantenimiento',
} as const;

export type PinRole = keyof typeof PIN_DB_KEY;

export function isPinRole(value: unknown): value is PinRole {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PIN_DB_KEY, value);
}

const ENV_PIN: Record<PinRole, string | undefined> = {
  get admin() { return process.env.ADMIN_PIN; },
  get recepcion() { return process.env.RECEPCION_PIN; },
  get staff_limpieza() { return process.env.STAFF_LIMPIEZA_PIN; },
  get staff_mantenimiento() { return process.env.STAFF_MANTENIMIENTO_PIN; },
};

// PIN vigente del rol: primero `settings`; si la fila no existe, la variable de entorno. '' = no configurado.
export async function getExpectedPin(role: PinRole): Promise<string> {
  const { data: row } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', PIN_DB_KEY[role])
    .maybeSingle();
  if (row?.value && String(row.value).trim()) return String(row.value).trim();
  return ENV_PIN[role]?.trim() || '';
}

// Comparación en tiempo constante
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}
