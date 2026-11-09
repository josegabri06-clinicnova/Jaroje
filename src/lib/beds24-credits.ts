/**
 * Medición de los créditos de la API de Beds24. SOLO REGISTRA: no cambia ningún comportamiento ni ninguna respuesta.
 *
 * Beds24 limita los créditos de toda la cuenta y devuelve en cada respuesta cabeceras con el coste de esa petición y los
 * créditos que quedan. Aquí se leen y se guarda UNA fila por operación (un listado completo con todas sus páginas, una consulta
 * de tarifas...) en la tabla `beds24_call_log`, con una etiqueta de origen ("publico:disponibilidad", "cron:whatsapp"...).
 * Así se puede ver quién gasta los créditos y en qué momentos baja el saldo.
 *
 * Es inofensivo: si la tabla no existe o falla, se ignora; se desactiva con la variable BEDS24_CREDIT_LOG=off.
 * No guarda tokens, cuerpos de respuesta ni datos de huéspedes: solo cabeceras de créditos, tiempos y fechas de la consulta.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';

const CREDIT_HEADER = /credit|cost|limit|remaining|reset|retry/i;

// Medir nunca debe frenar ni romper una consulta:
//  - el guardado espera como máximo 1,5 s (si Supabase tarda más, la consulta sigue y el guardado termina por su cuenta);
//  - si el guardado falla (por ejemplo, la tabla aún no existe), no se insiste durante 5 minutos.
const FLUSH_TIMEOUT_MS = 1500;
const PAUSE_AFTER_ERROR_MS = 5 * 60_000;
let pausedUntil = 0;

// Último saldo de créditos visto en cualquier respuesta de Beds24 de ESTA instancia. El saldo es de toda la cuenta, así que sirve
// aunque lo hayan gastado otras instancias. Vale solo hasta que termina la ventana de 5 minutos (después se reinicia).
let lastRemaining: { value: number; expiresAt: number } | null = null;

/** Créditos que quedaban en Beds24 en la última respuesta vista, o null si no hay dato reciente (desconocido) */
export function knownRemainingCredits(): number | null {
  if (!lastRemaining || Date.now() >= lastRemaining.expiresAt) return null;
  return lastRemaining.value;
}

/** Cabeceras de una respuesta relacionadas con créditos o límites (los nombres exactos los decide Beds24: se guardan tal cual) */
export function pickCreditHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => { if (CREDIT_HEADER.test(key)) out[key.toLowerCase()] = value; });
  return out;
}

const toNum = (v: string | undefined) => {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Interpreta los nombres más probables (coste de la petición, límite, créditos restantes, segundos hasta el reinicio) */
export function interpretCreditHeaders(h: Record<string, string>) {
  let cost: number | null = null, limit: number | null = null, remaining: number | null = null, resetsIn: number | null = null;
  for (const [k, v] of Object.entries(h)) {
    if (/remaining/.test(k)) remaining = toNum(v);
    else if (/reset/.test(k)) resetsIn = toNum(v);
    else if (/cost/.test(k)) cost = toNum(v);
    else if (/limit/.test(k)) limit = toNum(v);
  }
  return { cost, limit, remaining, resetsIn };
}

export function trackBeds24(origin: string, kind: string, detail: Record<string, unknown> = {}) {
  const t0 = Date.now();
  let requests = 0, status = 0, limited = 0, costSum = 0, costSeen = false;
  let limit: number | null = null, remainingMin: number | null = null, resetsIn: number | null = null;
  let raw: Record<string, string> | null = null;

  return {
    /** Anota una respuesta de Beds24 (no la consume ni la modifica) */
    add(res: Response) {
      try {
        requests++;
        status = res.status;
        if (res.status === 429) limited++;
        const h = pickCreditHeaders(res.headers);
        if (Object.keys(h).length) raw = h;
        const i = interpretCreditHeaders(h);
        if (i.cost !== null) { costSum += i.cost; costSeen = true; }
        if (i.limit !== null) limit = i.limit;
        if (i.remaining !== null) remainingMin = remainingMin === null ? i.remaining : Math.min(remainingMin, i.remaining);
        if (i.resetsIn !== null) resetsIn = i.resetsIn;
        if (i.remaining !== null) lastRemaining = { value: i.remaining, expiresAt: Date.now() + (i.resetsIn !== null ? i.resetsIn : 60) * 1000 };
      } catch { /* medir nunca debe romper una consulta */ }
    },
    /** Guarda la fila. Nunca lanza error y nunca espera más de FLUSH_TIMEOUT_MS */
    async flush() {
      try {
        if (process.env.BEDS24_CREDIT_LOG === 'off' || requests === 0) return;
        if (Date.now() < pausedUntil) return;
        const saved = supabaseAdmin.from('beds24_call_log').insert({
          origin, kind, requests, status, rate_limited: limited,
          cost: costSeen ? costSum : null, credit_limit: limit, remaining_min: remainingMin, resets_in: resetsIn,
          ms: Date.now() - t0, detail, headers: raw,
        }).then(({ error }) => { if (error) pausedUntil = Date.now() + PAUSE_AFTER_ERROR_MS; }, () => { pausedUntil = Date.now() + PAUSE_AFTER_ERROR_MS; });
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([saved, new Promise<void>((resolve) => { timer = setTimeout(resolve, FLUSH_TIMEOUT_MS); })]);
        if (timer) clearTimeout(timer);
      } catch { pausedUntil = Date.now() + PAUSE_AFTER_ERROR_MS; }
    },
  };
}

/**
 * fetch a Beds24 que además anota el coste y los créditos restantes (una fila por llamada). Devuelve la respuesta intacta.
 * Para consultas sueltas y poco frecuentes (webhook, consulta por número de reserva); los listados usan trackBeds24 directamente.
 */
export async function beds24FetchTracked(origin: string, kind: string, url: string, init?: RequestInit, detail: Record<string, unknown> = {}): Promise<Response> {
  const tracker = trackBeds24(origin, kind, detail);
  try {
    const res = await fetch(url, init);
    tracker.add(res);
    return res;
  } finally {
    await tracker.flush();
  }
}
