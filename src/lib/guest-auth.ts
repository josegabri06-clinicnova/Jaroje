/**
 * Acceso del huésped a SUS documentos (DNI y comprobantes).
 * El huésped no tiene sesión: se identifica solo con el número de reserva, que cualquiera puede probar. Para dejarle ver o
 * cambiar sus archivos se le entrega una cookie firmada, válida solo para esa reserva, en dos casos:
 *  - al verificar los últimos 4 dígitos del teléfono de la reserva, o
 *  - al subir él mismo un archivo (ese dispositivo queda autorizado).
 * Usa HMAC-SHA256 con el mismo secreto que la sesión del personal, pero con otro formato: un token de huésped nunca vale como sesión.
 */
import type { NextResponse } from 'next/server';
import { parseStoredFileUrl } from '@/lib/storage-files';

export const GUEST_COOKIE_SECONDS = 180 * 24 * 60 * 60; // 180 días
export const FILE_MARKER = 'uploaded'; // la ruta pública indica que hay archivo sin dar enlace

const encoder = new TextEncoder();

function secret(): string {
  const s = process.env.SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!s) throw new Error('[Security Exception] No hay secreto de firma configurado en el servidor.');
  return s;
}

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array {
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toB64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data))));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Número de reserva normalizado (solo dígitos, como hace la ruta pública) o null si no es válido */
export function normalizeBookingId(raw: unknown): string | null {
  const m = String(raw ?? '').match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isSafeInteger(n) && n > 0 ? String(n) : null;
}

export const guestCookieName = (bookingId: string) => `jg_${bookingId}`;

export async function createGuestToken(bookingId: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const payload = toB64Url(encoder.encode(JSON.stringify({ b: bookingId, exp: nowSeconds + GUEST_COOKIE_SECONDS })));
  return `${payload}.${await hmac(`guest:${payload}`)}`;
}

export async function verifyGuestToken(token: string | undefined | null, bookingId: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  try {
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    if (!constantTimeEqual(await hmac(`guest:${parts[0]}`), parts[1])) return false;
    const data = JSON.parse(new TextDecoder().decode(fromB64Url(parts[0])));
    return data?.b === bookingId && typeof data.exp === 'number' && data.exp > nowSeconds;
  } catch {
    return false;
  }
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

export async function isGuestAuthorized(req: Request, bookingId: string): Promise<boolean> {
  return verifyGuestToken(readCookie(req, guestCookieName(bookingId)), bookingId);
}

/**
 * Reservas que este dispositivo tiene autorizadas: las de sus cookies jg_<id> con firma válida y vigente.
 * El número sale del NOMBRE de la cookie, pero solo cuenta si el token firmado dice ese mismo número (no se puede renombrar una cookie).
 * Máximo 20 cookies leídas, para que una petición con cientos de cookies no cueste nada.
 */
export async function listAuthorizedBookingIds(req: Request, max = 20): Promise<string[]> {
  const candidates = new Map<string, string>();
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const m = /^jg_(\d{1,15})$/.exec(part.slice(0, eq).trim());
    if (m && !candidates.has(m[1])) candidates.set(m[1], part.slice(eq + 1).trim());
    if (candidates.size >= max) break;
  }
  const checked = await Promise.all([...candidates].map(async ([id, token]) => ((await verifyGuestToken(token, id)) ? id : null)));
  return checked.filter((id): id is string => id !== null);
}

/** Autoriza este dispositivo para los archivos de esa reserva (cookie HttpOnly firmada) */
export async function grantGuestAccess(res: NextResponse, bookingId: string): Promise<void> {
  res.cookies.set({
    name: guestCookieName(bookingId),
    value: await createGuestToken(bookingId),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: GUEST_COOKIE_SECONDS,
  });
}

// ── Teléfono de la reserva ──
export const phoneDigits = (phone: unknown) => String(phone ?? '').replace(/\D/g, '');

// Un teléfono utilizable tiene al menos 8 dígitos y no es un marcador (0000…), como los que dejan las OTA
export function hasUsablePhone(phone: unknown): boolean {
  const d = phoneDigits(phone);
  return d.length >= 8 && !d.startsWith('0000');
}

export function phoneLast4(phone: unknown): string | null {
  return hasUsablePhone(phone) ? phoneDigits(phone).slice(-4) : null;
}

// ── Enlaces que recibe el huésped ──
export type GuestFileKind = 'dni' | 'receipt' | 'transfer';

export function guestFileUrl(bookingId: string, kind: GuestFileKind, storedUrl: string, rid?: string): string {
  const name = parseStoredFileUrl(storedUrl)?.path.split('/').pop() || 'archivo';
  const q = new URLSearchParams({ id: bookingId, kind, name });
  if (rid) q.set('rid', rid);
  return `/api/public/reserva/file?${q.toString()}`;
}

/** Lo que la ruta pública devuelve por un archivo: nada, un aviso de que existe, o el enlace propio si el huésped está autorizado */
export function guestFileRef(bookingId: string, kind: GuestFileKind, storedUrl: string | null | undefined, authorized: boolean, rid?: string): string | null {
  if (!storedUrl) return null;
  return authorized ? guestFileUrl(bookingId, kind, storedUrl, rid) : FILE_MARKER;
}
