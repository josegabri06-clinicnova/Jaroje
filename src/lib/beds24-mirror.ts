/**
 * Lectura de las reservas de Beds24 desde su COPIA en Supabase (tabla beds24_reservations), sin gastar créditos de Beds24.
 *
 * La copia la mantienen el webhook de Beds24 (al instante, reserva a reserva) y el listado completo de getBeds24Bookings (que la
 * reescribe entera y limpia las canceladas). Aquí solo se lee. Devuelve las reservas con la MISMA forma que getBeds24Bookings, para
 * que quien las consume (el cron de WhatsApp) no note la diferencia. Por eso NO lleva campos que el listado de Beds24 no trae
 * (price, is_acknowledged, phone, mobile...): el cron decide cosas con ellos y tenerlos cambiaría su comportamiento.
 */
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/fetch-all-rows';

// Solo lo que el cron necesita (sin invoice_items, que es lo más pesado)
const COLUMNS = 'id, master_id, actual_paid, check_in, check_out, guest_name, guest_phone, guest_email, status, channel, room_name, room, room_id, price, deposit, balance, notes, num_adult, num_child, created_at';

// Igual que el listado de Beds24: llegadas desde hace 180 días hasta dentro de 1.000, sin canceladas
const DAYS_BACK = 180;
const DAYS_AHEAD = 1000;
// Categorías virtuales de las habitaciones locales (500-507 y 601-607): no son de Beds24
const LOCAL_ROOM_IDS = ['685542', '685543'];

interface MirrorRow {
  id: string; master_id: string | null; actual_paid: number | null; check_in: string; check_out: string; guest_name: string | null;
  guest_phone: string | null; guest_email: string | null; status: string; channel: string | null; room_name: string; room: string | null;
  room_id: string | null; price: number | null; deposit: number | null; balance: number | null; notes: string | null;
  num_adult: number | null; num_child: number | null; created_at: string | null;
}

export function mirrorRowToBooking(b: MirrorRow) {
  const arrival = b.check_in ? new Date(b.check_in) : null;
  const departure = b.check_out ? new Date(b.check_out) : null;
  const nights = (arrival && departure)
    ? Math.max(1, Math.round((departure.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24)))
    : 1;
  return {
    id: b.id,
    masterId: b.master_id || null,
    actualPaid: Number(b.actual_paid || 0),
    rawDeposit: Number(b.deposit || 0),
    check_in: b.check_in,
    check_out: b.check_out,
    guest_name: b.guest_name || 'Huésped',
    guest_phone: b.guest_phone || null,
    guest_email: b.guest_email || null,
    status: b.status,
    source: 'beds24',
    channel: b.channel || 'Directo',
    room_name: b.room_name,
    room: b.room || '',
    room_id: Number(b.room_id || 0),
    nights,
    price_estimate: Number(b.price || 0),
    deposit: Number(b.deposit || 0),
    balance: Number(b.balance || 0),
    notes: b.notes || null,
    comments: b.notes || null,
    num_adult: Number(b.num_adult || 1),
    num_child: Number(b.num_child || 0),
    rooms: { name: b.room_name },
    booking_time: b.created_at || b.check_in || null,
  };
}

/** Reservas activas de la copia de Supabase, o null si no se pudo leer o viene vacía (el que llama debe usar Beds24) */
export async function readBeds24BookingsFromMirror(): Promise<ReturnType<typeof mirrorRowToBooking>[] | null> {
  const day = 24 * 60 * 60 * 1000;
  const from = new Date(Date.now() - DAYS_BACK * day).toISOString().split('T')[0];
  const to = new Date(Date.now() + DAYS_AHEAD * day).toISOString().split('T')[0];

  const { data, error } = await fetchAllRows<MirrorRow>((a, b) => supabase
    .from('beds24_reservations')
    .select(COLUMNS)
    .neq('status', 'cancelled')
    .not('room_id', 'in', `(${LOCAL_ROOM_IDS.join(',')})`)
    .gte('check_in', from)
    .lte('check_in', to)
    .order('id', { ascending: true })
    .range(a, b));

  if (error || !data || data.length === 0) {
    if (error) console.warn('[Beds24 Mirror] No se pudo leer la copia de reservas en Supabase:', (error as Error)?.message || error);
    return null;
  }
  return data.map(mirrorRowToBooking);
}
