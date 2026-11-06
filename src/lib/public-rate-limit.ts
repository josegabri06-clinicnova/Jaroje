/**
 * Límite de peticiones para rutas públicas que envían mensajes o consultan datos (por IP).
 * Cuenta cada petición dentro de una ventana; al pasar el máximo bloquea esa IP unos minutos.
 * Vive en memoria de cada instancia del servidor: frena abusos simples, no sustituye a un límite de plataforma.
 */
import { NextResponse } from 'next/server';
import { createThrottle, memoryStore } from '@/lib/guest-throttle';
import { clientIp } from '@/lib/server-pins';

type Limiter = ReturnType<typeof createThrottle>;
const limiters = new Map<string, Limiter>();

/** Devuelve una respuesta 429 si esta IP superó el límite de ese grupo; null si puede continuar */
export async function rateLimitResponse(req: Request, group: string, opts: { max: number; windowMs: number; lockMs: number }) {
  let limiter = limiters.get(group);
  if (!limiter) {
    limiter = createThrottle(memoryStore(), { maxFails: opts.max, windowMs: opts.windowMs, lockMs: opts.lockMs });
    limiters.set(group, limiter);
  }
  const key = `${group}:${clientIp(req)}`;
  if (await limiter.isLocked(key)) {
    return NextResponse.json(
      { success: false, error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.', code: 'rate_limited' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(Math.ceil(opts.lockMs / 1000)) } }
    );
  }
  await limiter.fail(key); // cada petición cuenta como un intento
  return null;
}
