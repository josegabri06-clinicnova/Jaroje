/**
 * Copia de las tarifas del calendario de Beds24 en Supabase (tabla beds24_rates: una fila por habitación hija y noche).
 *
 * Sirve para MOSTRAR precios (portal de venta, cotizaciones y widget del personal) sin gastar créditos de Beds24 ni toparse con el
 * límite de consultas del portal. La compra (api/public/reservar) sigue leyendo las tarifas en vivo de Beds24 antes de crear la
 * reserva, así que el precio que se cobra siempre es el vigente aunque la copia vaya unas horas atrasada.
 *
 * La rellena syncRatesFromBeds24 (cron cada 6 horas y, además, al cambiar precios desde la app). Solo el servidor accede a la tabla.
 */
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { fetchBeds24RatesMap, getBeds24Token } from '@/lib/beds24';
import { fetchAllRows } from '@/lib/fetch-all-rows';
import type { RatesMap } from '@/lib/rates-guard';

// Si la copia lleva más de esto sin actualizarse (cron parado, Beds24 caído mucho rato) no se fía de ella y se vuelve a Beds24.
export const RATES_MIRROR_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Beds24 solo permite reservar hasta 365 días vista (booking-window.ts): se copia un poco más para cubrir la última noche reservable.
const SYNC_DAYS_BACK = 1;
const SYNC_DAYS_AHEAD = 372;
// Tramos de 89 días: el máximo que ya se consulta hoy, a 1 crédito por consulta.
const CHUNK_DAYS = 89;
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/**
 * Tarifas de la copia para la estancia (mismo formato que fetchBeds24RatesMap: { habitación: { 'AAAA-MM-DD': precio } }),
 * o null si no se puede fiar de la copia: error de lectura, más de 24 h sin actualizar, o alguna noche de la estancia sin ninguna
 * tarifa (p. ej. fuera de lo copiado). Entonces el que llama debe consultar Beds24, como antes.
 */
export async function readRatesFromMirror(checkInRaw: string, checkOutRaw: string): Promise<RatesMap | null> {
  const checkIn = String(checkInRaw ?? '').split('T')[0].split(' ')[0].trim();
  const checkOut = String(checkOutRaw ?? '').split('T')[0].split(' ')[0].trim();
  if (!isoDay.test(checkIn) || !isoDay.test(checkOut) || checkIn >= checkOut) return null;

  try {
    const [rows, newest] = await Promise.all([
      fetchAllRows<{ room_id: string; date: string; price: number }>((a, b) => supabase
        .from('beds24_rates')
        .select('room_id, date, price')
        .gte('date', checkIn)
        .lte('date', checkOut)
        .order('room_id', { ascending: true })
        .order('date', { ascending: true })
        .range(a, b)),
      supabase.from('beds24_rates').select('updated_at').order('updated_at', { ascending: false }).limit(1),
    ]);

    if (rows.error || newest.error || !rows.data) {
      console.warn('[Rates Mirror] No se pudo leer la copia de tarifas.');
      return null;
    }
    const newestAt = Date.parse(String(newest.data?.[0]?.updated_at ?? ''));
    if (!Number.isFinite(newestAt) || Date.now() - newestAt > RATES_MIRROR_MAX_AGE_MS) {
      console.warn('[Rates Mirror] La copia de tarifas está vacía o desactualizada; se consulta Beds24.');
      return null;
    }

    const map: RatesMap = {};
    const datesWithRate = new Set<string>();
    for (const r of rows.data) {
      const price = Number(r.price);
      if (!(price > 0)) continue;
      (map[r.room_id] ||= {})[r.date] = price;
      datesWithRate.add(r.date);
    }
    // Cada noche de la estancia debe tener tarifa de alguna habitación: si no, la copia no cubre esas fechas
    for (let d = checkIn; d < checkOut; d = addDays(d, 1)) {
      if (!datesWithRate.has(d)) return null;
    }
    return map;
  } catch (err) {
    console.warn('[Rates Mirror] Error leyendo la copia de tarifas:', (err as Error)?.message);
    return null;
  }
}

export interface RatesSyncResult {
  ok: boolean;
  rows: number;
  calls: number;
  failedChunks: number;
}

/**
 * Vuelve a copiar de Beds24 las tarifas de hoy a ~1 año vista. Por cada tramo: guarda lo que Beds24 devuelve y borra lo que
 * ya no devuelve (precio quitado). Un tramo que falla o viene vacío NO se toca (no se borra nada por un error de Beds24).
 */
export async function syncRatesFromBeds24(): Promise<RatesSyncResult> {
  const result: RatesSyncResult = { ok: false, rows: 0, calls: 0, failedChunks: 0 };
  const token = await getBeds24Token();
  const startedAt = new Date().toISOString();
  const today = startedAt.slice(0, 10);
  const first = addDays(today, -SYNC_DAYS_BACK);
  const last = addDays(today, SYNC_DAYS_AHEAD);

  for (let from = first; from <= last; from = addDays(from, CHUNK_DAYS)) {
    const to = addDays(from, CHUNK_DAYS - 1) < last ? addDays(from, CHUNK_DAYS - 1) : last;
    result.calls++;
    const map = await fetchBeds24RatesMap(token, from, to, 'sync:tarifas');
    const rows: { room_id: string; date: string; price: number; updated_at: string }[] = [];
    for (const [roomId, days] of Object.entries(map)) {
      for (const [date, price] of Object.entries(days)) {
        if (price > 0) rows.push({ room_id: roomId, date, price, updated_at: startedAt });
      }
    }
    if (rows.length === 0) { result.failedChunks++; continue; } // Beds24 no respondió o vino vacío

    let chunkFailed = false;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('beds24_rates').upsert(rows.slice(i, i + 500), { onConflict: 'room_id,date' });
      if (error) { chunkFailed = true; console.error('[Rates Sync] Error guardando tarifas:', error.message); break; }
    }
    if (chunkFailed) { result.failedChunks++; continue; }
    result.rows += rows.length;

    // Lo que Beds24 ya no devuelve en este tramo (precio quitado) deja de mostrarse
    const { error: delErr } = await supabase.from('beds24_rates').delete().gte('date', from).lte('date', to).lt('updated_at', startedAt);
    if (delErr) console.error('[Rates Sync] Error limpiando tarifas antiguas:', delErr.message);
  }

  // Noches pasadas: ya no se necesitan
  await supabase.from('beds24_rates').delete().lt('date', addDays(today, -7));

  result.ok = result.failedChunks === 0;
  return result;
}
