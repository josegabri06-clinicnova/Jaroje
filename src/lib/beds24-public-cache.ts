/**
 * Memoria compartida para las búsquedas PÚBLICAS de fechas (portal de venta y cotizaciones).
 *
 * Beds24 limita los créditos de API de TODA la cuenta. Antes cada búsqueda de un visitante lanzaba sus propias consultas, así que
 * unos cuantos cambios de fechas (o un script) agotaban el límite y dejaban sin Beds24 también al panel, a las OTAs y a las reservas.
 *
 * Protecciones:
 *  1. Caché con consultas en vuelo compartidas: mismas fechas = una sola consulta a Beds24, sea cual sea el número de visitantes.
 *     Las reservas se guardan 90 s; las TARIFAS 5 min (cambian muy poco y la compra real las vuelve a pedir en vivo).
 *     Las fechas se alinean a meses completos, así que visitantes con fechas distintas del mismo mes comparten la consulta.
 *  2. Presupuesto de consultas nuevas a Beds24 entre todas las búsquedas públicas, con tres límites a la vez:
 *       - ráfaga: como máximo 12 por minuto;
 *       - créditos: como máximo ~30 créditos (estimados) cada 5 minutos, la duración de la ventana de Beds24;
 *       - RESERVA PARA EL PERSONAL: si Beds24 dijo hace poco que quedan menos de 50 créditos, el portal de venta no consulta
 *         (los últimos créditos de la ventana son de recepción, mantenimiento y las tareas automáticas).
 *     Pasados los límites se sirve el último dato bueno y, si no lo hay, se responde "intenta en unos minutos" sin tocar Beds24.
 *  3. Si Beds24 falla o responde vacío, se sirve el último dato bueno y el fallo no se guarda en la caché.
 *
 * Solo para MOSTRAR disponibilidad y precios. La reserva real (api/public/reservar) sigue consultando Beds24 en vivo.
 * Vive en la memoria de cada instancia del servidor.
 */
import { fetchAllRawBeds24Bookings, fetchBeds24RatesMap } from '@/lib/beds24';
import { knownRemainingCredits } from '@/lib/beds24-credits';

export const PUBLIC_TTL_MS = 90_000;
export const PUBLIC_STALE_MAX_MS = 10 * 60_000;
export const PUBLIC_RATES_TTL_MS = 5 * 60_000;
export const PUBLIC_RATES_STALE_MAX_MS = 15 * 60_000;
export const PUBLIC_BUDGET_WINDOW_MS = 60_000;
export const PUBLIC_BUDGET_MAX_CALLS = 12;
export const PUBLIC_CREDIT_WINDOW_MS = 5 * 60_000;
export const PUBLIC_CREDITS_PER_WINDOW = 30;
export const PUBLIC_RESERVE_CREDITS = 50;
const EST_COST_BOOKINGS = 2; // créditos estimados de un listado (suele ser 1-2 peticiones de 1 crédito; el primero de un mes puede ser más)
const EST_COST_RATES = 1;
const MAX_ENTRIES = 40;

/** Se agotó el presupuesto de consultas públicas a Beds24 y no hay un dato anterior que servir */
export class PublicBeds24BusyError extends Error {
  constructor() {
    super('Las búsquedas están muy concurridas en este momento. Inténtalo de nuevo en un minuto.');
    this.name = 'PublicBeds24BusyError';
  }
}

interface Store<T> {
  fresh: Map<string, { at: number; promise: Promise<T> }>;
  lastGood: Map<string, { at: number; value: T }>;
}
const newStore = <T>(): Store<T> => ({ fresh: new Map(), lastGood: new Map() });

const missTimes: number[] = []; // instantes de las consultas reales a Beds24 (todas las búsquedas públicas juntas)
const missCosts: { at: number; cost: number }[] = []; // créditos estimados de esas consultas
function budgetAvailable(now: number, cost: number): boolean {
  while (missTimes.length && now - missTimes[0] > PUBLIC_BUDGET_WINDOW_MS) missTimes.shift();
  while (missCosts.length && now - missCosts[0].at > PUBLIC_CREDIT_WINDOW_MS) missCosts.shift();
  if (missTimes.length >= PUBLIC_BUDGET_MAX_CALLS) return false; // ráfaga
  const remaining = knownRemainingCredits();
  if (remaining !== null && remaining < PUBLIC_RESERVE_CREDITS) return false; // reserva para el personal
  const spent = missCosts.reduce((sum, c) => sum + c.cost, 0);
  return spent + cost <= PUBLIC_CREDITS_PER_WINDOW; // créditos por ventana de 5 minutos
}

function prune<T>(store: Store<T>, now: number, ttl: number, staleMax: number) {
  for (const [k, v] of store.fresh) if (now - v.at > ttl) store.fresh.delete(k);
  for (const [k, v] of store.lastGood) if (now - v.at > staleMax) store.lastGood.delete(k);
  while (store.lastGood.size > MAX_ENTRIES) store.lastGood.delete(store.lastGood.keys().next().value as string);
}

async function memo<T>(
  store: Store<T>, key: string, loader: () => Promise<T>, isGood: (v: T) => boolean,
  estCost: number, ttl: number = PUBLIC_TTL_MS, staleMax: number = PUBLIC_STALE_MAX_MS
): Promise<T> {
  const now = Date.now();
  const hit = store.fresh.get(key);
  if (hit && now - hit.at < ttl) return hit.promise;

  const staleOrNull = () => {
    const g = store.lastGood.get(key);
    return g && Date.now() - g.at < staleMax ? g : null;
  };

  if (!budgetAvailable(now, estCost)) {
    const g = staleOrNull();
    if (g) return g.value;
    throw new PublicBeds24BusyError();
  }
  missTimes.push(now);
  missCosts.push({ at: now, cost: estCost });
  if (store.fresh.size + store.lastGood.size > MAX_ENTRIES) prune(store, now, ttl, staleMax);

  const promise: Promise<T> = loader().then(
    (value) => {
      if (isGood(value)) {
        store.lastGood.set(key, { at: Date.now(), value });
        return value;
      }
      if (store.fresh.get(key)?.promise === promise) store.fresh.delete(key); // un resultado vacío no se guarda
      return staleOrNull()?.value ?? value;
    },
    (err) => {
      if (store.fresh.get(key)?.promise === promise) store.fresh.delete(key); // un fallo no se guarda
      const g = staleOrNull();
      if (g) return g.value;
      throw err;
    }
  );
  store.fresh.set(key, { at: now, promise });
  return promise;
}

// ── Fechas alineadas a meses completos (UTC) para que más visitantes compartan la misma consulta ──
const startOfMonth = (d: string) => `${d.slice(0, 7)}-01`;
function endOfMonth(d: string) {
  const [y, m] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
const shiftDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const bookingsStore = newStore<any[]>();
const ratesStore = newStore<Record<string, Record<string, number>>>();

/** Reservas de Beds24 que pueden solaparse con la estancia (llegadas desde 180 días antes del check-in hasta el check-out) */
export function publicBookings(checkIn: string, checkOut: string): Promise<any[]> {
  const from = startOfMonth(shiftDays(checkIn, -180));
  const to = endOfMonth(checkOut);
  return memo(bookingsStore, `${from}|${to}`, () => fetchAllRawBeds24Bookings(from, to, false, false, 'publico:disponibilidad', true), (v) => Array.isArray(v), EST_COST_BOOKINGS);
}

/** Tarifas del calendario de Beds24 para la estancia (un resultado sin ninguna habitación se considera fallo y no se guarda) */
export function publicRates(token: string, checkIn: string, checkOut: string): Promise<Record<string, Record<string, number>>> {
  const from = startOfMonth(checkIn);
  const to = endOfMonth(checkOut);
  return memo(ratesStore, `${from}|${to}`, () => fetchBeds24RatesMap(token, from, to, 'publico:tarifas'), (v) => Object.keys(v).length > 0, EST_COST_RATES, PUBLIC_RATES_TTL_MS, PUBLIC_RATES_STALE_MAX_MS);
}

// ── Portal del huésped: consulta a Beds24 por número de reserva cuando no está en nuestras tablas ──
// Un número inventado hacía que cada petición pública llamara a Beds24 (hasta 2 veces). Ahora: memoria de los números que Beds24
// confirmó que no existen (10 min) y un presupuesto propio y global de 10 consultas por minuto, aparte del de las búsquedas.
export const LOOKUP_NOT_FOUND_MS = 10 * 60_000;
export const LOOKUP_BUDGET_MAX_CALLS = 10;
const lookupTimes: number[] = [];
const notFoundUntil = new Map<string, number>();

/** true si ese número ya se comprobó en Beds24 hace poco y no existe */
export function isKnownMissingBooking(id: string): boolean {
  const until = notFoundUntil.get(id);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  notFoundUntil.delete(id);
  return false;
}

/** Reserva un hueco del presupuesto de consultas por número. false = presupuesto agotado: no se consulta Beds24 */
export function reserveBeds24Lookup(): boolean {
  const now = Date.now();
  while (lookupTimes.length && now - lookupTimes[0] > PUBLIC_BUDGET_WINDOW_MS) lookupTimes.shift();
  if (lookupTimes.length >= LOOKUP_BUDGET_MAX_CALLS) return false;
  lookupTimes.push(now);
  return true;
}

/** Beds24 respondió bien y dijo que no existe: no se vuelve a preguntar durante 10 minutos */
export function rememberBookingNotFound(id: string) {
  const now = Date.now();
  if (notFoundUntil.size >= 500) {
    for (const [k, v] of notFoundUntil) if (v <= now) notFoundUntil.delete(k);
    while (notFoundUntil.size >= 500) notFoundUntil.delete(notFoundUntil.keys().next().value as string);
  }
  notFoundUntil.set(id, now + LOOKUP_NOT_FOUND_MS);
}

/** Solo para pruebas */
export function resetPublicBeds24Cache() {
  bookingsStore.fresh.clear(); bookingsStore.lastGood.clear();
  ratesStore.fresh.clear(); ratesStore.lastGood.clear();
  missTimes.length = 0;
  missCosts.length = 0;
  lookupTimes.length = 0;
  notFoundUntil.clear();
}
