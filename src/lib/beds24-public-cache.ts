/**
 * Memoria compartida para las búsquedas PÚBLICAS de fechas (portal de venta y cotizaciones).
 *
 * Beds24 limita los créditos de API de TODA la cuenta. Antes cada búsqueda de un visitante lanzaba sus propias consultas, así que
 * unos cuantos cambios de fechas (o un script) agotaban el límite y dejaban sin Beds24 también al panel, a las OTAs y a las reservas.
 *
 * Tres protecciones:
 *  1. Caché de 90 s con consultas en vuelo compartidas: mismas fechas = una sola consulta a Beds24, sea cual sea el número de visitantes.
 *     Las fechas se alinean a meses completos, así que visitantes con fechas distintas del mismo mes comparten la consulta.
 *  2. Presupuesto global: como máximo 8 consultas nuevas a Beds24 por minuto entre todas las búsquedas públicas. Pasado ese límite se
 *     sirve el último dato bueno (hasta 10 min) y, si no lo hay, se responde "intenta en unos minutos" sin tocar Beds24.
 *  3. Si Beds24 falla o responde vacío, se sirve el último dato bueno y el fallo no se guarda en la caché.
 *
 * Solo para MOSTRAR disponibilidad y precios. La reserva real (api/public/reservar) sigue consultando Beds24 en vivo.
 * Vive en la memoria de cada instancia del servidor.
 */
import { fetchAllRawBeds24Bookings, fetchBeds24RatesMap } from '@/lib/beds24';

export const PUBLIC_TTL_MS = 90_000;
export const PUBLIC_STALE_MAX_MS = 10 * 60_000;
export const PUBLIC_BUDGET_WINDOW_MS = 60_000;
export const PUBLIC_BUDGET_MAX_CALLS = 8;
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
function budgetAvailable(now: number): boolean {
  while (missTimes.length && now - missTimes[0] > PUBLIC_BUDGET_WINDOW_MS) missTimes.shift();
  return missTimes.length < PUBLIC_BUDGET_MAX_CALLS;
}

function prune<T>(store: Store<T>, now: number) {
  for (const [k, v] of store.fresh) if (now - v.at > PUBLIC_TTL_MS) store.fresh.delete(k);
  for (const [k, v] of store.lastGood) if (now - v.at > PUBLIC_STALE_MAX_MS) store.lastGood.delete(k);
  while (store.lastGood.size > MAX_ENTRIES) store.lastGood.delete(store.lastGood.keys().next().value as string);
}

async function memo<T>(store: Store<T>, key: string, loader: () => Promise<T>, isGood: (v: T) => boolean): Promise<T> {
  const now = Date.now();
  const hit = store.fresh.get(key);
  if (hit && now - hit.at < PUBLIC_TTL_MS) return hit.promise;

  const staleOrNull = () => {
    const g = store.lastGood.get(key);
    return g && Date.now() - g.at < PUBLIC_STALE_MAX_MS ? g : null;
  };

  if (!budgetAvailable(now)) {
    const g = staleOrNull();
    if (g) return g.value;
    throw new PublicBeds24BusyError();
  }
  missTimes.push(now);
  if (store.fresh.size + store.lastGood.size > MAX_ENTRIES) prune(store, now);

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
  return memo(bookingsStore, `${from}|${to}`, () => fetchAllRawBeds24Bookings(from, to, false, false), (v) => Array.isArray(v));
}

/** Tarifas del calendario de Beds24 para la estancia (un resultado sin ninguna habitación se considera fallo y no se guarda) */
export function publicRates(token: string, checkIn: string, checkOut: string): Promise<Record<string, Record<string, number>>> {
  const from = startOfMonth(checkIn);
  const to = endOfMonth(checkOut);
  return memo(ratesStore, `${from}|${to}`, () => fetchBeds24RatesMap(token, from, to), (v) => Object.keys(v).length > 0);
}

/** Solo para pruebas */
export function resetPublicBeds24Cache() {
  bookingsStore.fresh.clear(); bookingsStore.lastGood.clear();
  ratesStore.fresh.clear(); ratesStore.lastGood.clear();
  missTimes.length = 0;
}
