/**
 * Ocupación para las búsquedas de disponibilidad (portal de venta y widget del personal) leída de la COPIA de reservas en Supabase
 * (beds24_reservations), sin gastar créditos de Beds24.
 *
 * Solo sirve para MOSTRAR disponibilidad. La compra (api/public/reservar) sigue consultando Beds24 en vivo antes de crear la
 * reserva, así que una copia con unos minutos de retraso nunca produce una reserva doble.
 *
 * Devuelve las reservas con la misma forma que el listado en bruto de Beds24 ({ status, arrival, departure, roomId, unitId }),
 * que es lo que ya consumen los cálculos de ocupación; quien llama no cambia su lógica.
 */
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getUnitName } from '@/lib/beds24';

// Categorías virtuales de las habitaciones locales (500-507 y 601-607): no son de Beds24 (el listado en vivo también las excluye)
const LOCAL_ROOM_IDS = ['685542', '685543'];
// La copia se reescribe entera con cada listado en vivo (cada 15 min). Si lleva más de esto sin actualizarse, algo falla
// (cron parado, Beds24 caído mucho rato): no se fía de ella y se vuelve a Beds24.
export const MIRROR_MAX_AGE_MS = 3 * 60 * 60 * 1000;
// Supabase corta en 1.000 filas sin avisar; con ~30 unidades nunca debería haber tantas reservas solapadas. Si las hay, no se fía.
const MAX_ROWS = 1000;

export interface OccupancyBooking {
  status: string;
  arrival: string;
  departure: string;
  roomId: string;
  unitId: string;
}

/**
 * La copia guarda la unidad con el nombre de la habitación ("101"); el cálculo espera el número de unidad de Beds24 ("1").
 * Sin unidad ("" o "0") se devuelve "" (reserva sin asignar: ocupa una unidad cualquiera de la categoría).
 * Un nombre que no se reconoce también se trata como sin asignar: marca una unidad ocupada, que es lo prudente.
 */
export function toBeds24UnitId(roomId: string, unitId: string | null | undefined): string {
  const u = String(unitId ?? '').trim();
  if (!u || u === '0') return '';
  if (/^[1-8]$/.test(u)) return u; // ya viene como número de unidad
  for (let i = 1; i <= 8; i++) {
    if (getUnitName(roomId, String(i)) === u) return String(i);
  }
  return '';
}

interface MirrorOccupancyRow {
  status: string;
  check_in: string;
  check_out: string;
  room_id: string | null;
  unit_id: string | null;
}

/**
 * Reservas activas de la copia que se solapan con la estancia, o null si no se puede fiar de la copia (error de lectura o copia
 * demasiado antigua): entonces el que llama debe usar Beds24, como antes.
 * Un resultado vacío con la copia al día es una respuesta válida: no hay nada ocupado en esas fechas.
 */
export async function readOccupancyFromMirror(checkInRaw: string, checkOutRaw: string): Promise<OccupancyBooking[] | null> {
  const checkIn = String(checkInRaw ?? '').split('T')[0].split(' ')[0].trim();
  const checkOut = String(checkOutRaw ?? '').split('T')[0].split(' ')[0].trim();
  const isoDay = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDay.test(checkIn) || !isoDay.test(checkOut)) return null;
  try {
    const [rows, newest] = await Promise.all([
      supabase
        .from('beds24_reservations')
        .select('status, check_in, check_out, room_id, unit_id')
        .neq('status', 'cancelled')
        .not('room_id', 'in', `(${LOCAL_ROOM_IDS.join(',')})`)
        .lt('check_in', checkOut)
        .gt('check_out', checkIn)
        .limit(MAX_ROWS),
      supabase
        .from('beds24_reservations')
        .select('updated_at')
        .neq('status', 'cancelled')
        .order('updated_at', { ascending: false })
        .limit(1),
    ]);

    if (rows.error || newest.error) {
      console.warn('[Availability Mirror] No se pudo leer la copia de reservas:', (rows.error || newest.error)?.message);
      return null;
    }
    if ((rows.data?.length ?? 0) >= MAX_ROWS) return null;
    const newestAt = Date.parse(String(newest.data?.[0]?.updated_at ?? ''));
    if (!Number.isFinite(newestAt) || Date.now() - newestAt > MIRROR_MAX_AGE_MS) {
      console.warn('[Availability Mirror] La copia de reservas está desactualizada; se consulta Beds24.');
      return null;
    }

    return ((rows.data || []) as MirrorOccupancyRow[]).map((r) => {
      const roomId = String(r.room_id ?? '');
      return {
        status: r.status,
        arrival: r.check_in,
        departure: r.check_out,
        roomId,
        unitId: toBeds24UnitId(roomId, r.unit_id),
      };
    });
  } catch (err) {
    console.warn('[Availability Mirror] Error leyendo la copia de reservas:', (err as Error)?.message);
    return null;
  }
}
