/**
 * Límite de intentos fallidos al introducir un PIN (login y comprobación del PIN de administrador).
 * Dos barreras, guardadas en la tabla `guest_verify_attempts` (vale entre instancias del servidor; si la tabla no
 * responde, se usa memoria como respaldo):
 *  - por IP: 5 fallos en 15 min -> bloqueo de 15 min.
 *  - por rol (secreto compartido, aunque el atacante cambie de IP): 20 fallos en 1 h -> bloqueo de 15 min.
 */
import { createThrottle, dbStore, memoryStore, resilientStore } from '@/lib/guest-throttle';

const store = resilientStore(dbStore(), memoryStore());
const byIp = createThrottle(store, { maxFails: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 });
const byRole = createThrottle(store, { maxFails: 20, windowMs: 60 * 60_000, lockMs: 15 * 60_000 });

const ipKey = (ip: string) => `pin:ip:${ip}`;
const roleKey = (role: string) => `pin:role:${role}`;

export async function isPinLocked(role: string, ip: string): Promise<boolean> {
  return (await byIp.isLocked(ipKey(ip))) || (await byRole.isLocked(roleKey(role)));
}
export async function registerPinFailure(role: string, ip: string): Promise<void> {
  await byIp.fail(ipKey(ip));
  await byRole.fail(roleKey(role));
}
/** Un acierto limpia solo el contador de esa IP; el del rol sigue para frenar a quien alterna IPs */
export async function clearPinFailures(ip: string): Promise<void> {
  await byIp.clear(ipKey(ip));
}
