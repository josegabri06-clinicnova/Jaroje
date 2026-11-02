/**
 * Control de intentos fallidos al verificar los últimos 4 dígitos del teléfono (solo hay 10.000 combinaciones).
 * Dos limitadores: por IP y por reserva. El de reserva se guarda en la tabla `guest_verify_attempts` (sin políticas: solo la
 * clave de servicio la toca), así vale entre instancias del servidor; si la tabla no existe, se usa memoria como respaldo.
 */

export interface ThrottleEntry { fails: number; windowStart: number; lockedUntil: number }

export interface ThrottleStore {
  get(key: string): Promise<ThrottleEntry | null>;
  set(key: string, entry: ThrottleEntry): Promise<void>;
  del(key: string): Promise<void>;
}

export function memoryStore(): ThrottleStore {
  const map = new Map<string, ThrottleEntry>();
  return {
    async get(key) { return map.get(key) || null; },
    async set(key, entry) { map.set(key, entry); },
    async del(key) { map.delete(key); },
  };
}

// Base de datos con respaldo en memoria: si la tabla no existe o falla, el control sigue funcionando en esa instancia
export function resilientStore(primary: ThrottleStore, fallback: ThrottleStore): ThrottleStore {
  return {
    async get(key) { try { return await primary.get(key); } catch { return fallback.get(key); } },
    async set(key, entry) { try { await primary.set(key, entry); } catch { await fallback.set(key, entry); } },
    async del(key) { try { await primary.del(key); } catch { /* sin tabla */ } await fallback.del(key); },
  };
}

// Carga diferida: así este módulo se puede probar sin la conexión a la base de datos
const admin = async () => (await import('@/lib/supabase-admin')).supabaseAdmin;

export function dbStore(): ThrottleStore {
  return {
    async get(key) {
      const { data, error } = await (await admin()).from('guest_verify_attempts').select('fails, window_start, locked_until').eq('key', key).maybeSingle();
      if (error) throw error;
      return data ? { fails: Number(data.fails), windowStart: Number(data.window_start), lockedUntil: Number(data.locked_until) } : null;
    },
    async set(key, e) {
      const { error } = await (await admin()).from('guest_verify_attempts').upsert(
        { key, fails: e.fails, window_start: e.windowStart, locked_until: e.lockedUntil }, { onConflict: 'key' });
      if (error) throw error;
    },
    async del(key) {
      const { error } = await (await admin()).from('guest_verify_attempts').delete().eq('key', key);
      if (error) throw error;
    },
  };
}

export function createThrottle(store: ThrottleStore, opts: { maxFails: number; windowMs: number; lockMs: number }, now: () => number = Date.now) {
  return {
    async isLocked(key: string): Promise<boolean> {
      const e = await store.get(key);
      return !!e && e.lockedUntil > now();
    },
    async fail(key: string): Promise<void> {
      const t = now();
      const e = await store.get(key);
      const inWindow = e && t - e.windowStart < opts.windowMs;
      const fails = (inWindow ? e!.fails : 0) + 1;
      await store.set(key, { fails, windowStart: inWindow ? e!.windowStart : t, lockedUntil: fails >= opts.maxFails ? t + opts.lockMs : 0 });
    },
    async clear(key: string): Promise<void> {
      await store.del(key);
    },
  };
}

// Instancias de uso real: por IP (memoria, 5 fallos / 15 min) y por reserva (base de datos, 8 fallos / hora, bloqueo de 1 hora)
const byIp = createThrottle(memoryStore(), { maxFails: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 });
const byBooking = createThrottle(resilientStore(dbStore(), memoryStore()), { maxFails: 8, windowMs: 60 * 60_000, lockMs: 60 * 60_000 });

export async function isVerifyLocked(bookingId: string, ip: string): Promise<boolean> {
  return (await byIp.isLocked(ip)) || (await byBooking.isLocked(bookingId));
}
export async function registerVerifyFailure(bookingId: string, ip: string): Promise<void> {
  await byIp.fail(ip);
  await byBooking.fail(bookingId);
}
export async function clearVerifyFailures(bookingId: string, ip: string): Promise<void> {
  await byIp.clear(ip);
  await byBooking.clear(bookingId);
}
