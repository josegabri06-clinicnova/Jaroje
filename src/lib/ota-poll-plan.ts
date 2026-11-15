/**
 * Plan de consultas de mensajes a Beds24 para capturar el teléfono de las reservas de OTA (Booking, Airbnb, Expedia…).
 *
 * Antes, el cron (cada 5 min) consultaba los mensajes de TODAS las reservas OTA sin teléfono de los últimos 45 días, una llamada por
 * reserva y en cada ejecución: ~4.000 llamadas al día, el 70 % de los créditos de Beds24, incluso para estancias ya terminadas.
 *
 * Regla de oro: lo que afecta al día a dia del hotel NO cambia. El cron sigue ejecutándose cada 5 minutos y estas reservas se
 * consultan en CADA ejecución, igual que antes:
 *  - las que llegan hoy o mañana, o ya están alojadas (el huésped está a punto de llegar o está aquí);
 *  - las que se acaban de pedir el WhatsApp (hace menos de 1 h: ventana en la que el huésped suele contestar).
 * Lo único que se espacia (una vez cada 30 min, repartidas entre ejecuciones) son las reservas de llegada lejana sin petición reciente,
 * donde esperar unos minutos no cambia nada. Y se ignoran las estancias que ya terminaron.
 *
 * Nunca se consulta MÁS que antes: lo prioritario va siempre completo y solo lo espaciado tiene tope por ejecución.
 */

export const OTA_POLL_SLOT_MS = 5 * 60_000;          // cadencia del cron
export const OTA_POLL_OLD_EVERY_SLOTS = 6;           // llegada lejana sin petición reciente: 1 de cada 6 ejecuciones (30 min)
export const OTA_POLL_FRESH_WINDOW_MS = 60 * 60_000; // tras pedir el WhatsApp: se mira en cada ejecución durante 1 h
export const OTA_POLL_MAX_PER_RUN = 8;               // tope SOLO para las de llegada lejana
export const OTA_POLL_LOW_CREDITS = 5;               // por debajo de estos créditos solo se consultan las prioritarias

export interface OtaPollCandidate {
  id: string | number;
  check_in?: string | null;  // AAAA-MM-DD
  check_out?: string | null; // AAAA-MM-DD
}

/** Fecha (AAAA-MM-DD) en la zona horaria del hotel */
export function hotelToday(nowMs: number = Date.now()): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs));
}

const day10 = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

/**
 * Separa lo que hay que consultar SIEMPRE en esta ejecución (priority) de lo que toca por turno (dueStale).
 * @param requestedAtMs  id -> instante (ms) en que se pidió el WhatsApp al huésped por el chat de la OTA (solo hace falta el reciente)
 */
export function splitOtaPolls(
  candidates: OtaPollCandidate[],
  requestedAtMs: Map<string, number>,
  nowMs: number = Date.now(),
  today: string = hotelToday(nowMs)
): { priority: string[]; dueStale: string[] } {
  const tomorrow = hotelToday(nowMs + 24 * 60 * 60_000);
  // Estancia ya terminada: no sirve capturar el teléfono de quien ya se fue
  const live = candidates.filter(c => !(day10(c.check_out) && day10(c.check_out) < today));

  const priority: string[] = [];
  const stale: string[] = [];
  for (const c of live) {
    const id = String(c.id);
    const at = requestedAtMs.get(id);
    const justRequested = at !== undefined && nowMs - at <= OTA_POLL_FRESH_WINDOW_MS;
    // Llega hoy o mañana, o ya está alojada (llegó antes y todavía no sale). Sin fecha de llegada se trata como urgente (no se pierde).
    const checkIn = day10(c.check_in);
    const urgent = !checkIn || checkIn <= tomorrow;
    if (justRequested || urgent) priority.push(id);
    else stale.push(id);
  }

  // Llegada lejana: por turnos. El orden por id es estable entre ejecuciones, así que el turno de cada reserva no salta de sitio.
  stale.sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b));
  const slot = Math.floor(nowMs / OTA_POLL_SLOT_MS);
  const dueStale = stale.filter((_, i) => (slot + i) % OTA_POLL_OLD_EVERY_SLOTS === 0).slice(0, OTA_POLL_MAX_PER_RUN);
  return { priority, dueStale };
}

/** Ids a consultar en esta ejecución: todas las prioritarias + las de llegada lejana que tocan ahora */
export function planOtaPolls(
  candidates: OtaPollCandidate[],
  requestedAtMs: Map<string, number>,
  nowMs: number = Date.now(),
  today: string = hotelToday(nowMs)
): string[] {
  const { priority, dueStale } = splitOtaPolls(candidates, requestedAtMs, nowMs, today);
  return [...priority, ...dueStale];
}
