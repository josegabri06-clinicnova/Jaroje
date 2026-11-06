import { supabaseAdmin } from '@/lib/supabase-admin';

export interface BookingContact {
  phone: string | null;
  guestName: string | null;
  /** true si alguna consulta falló: no se puede asegurar que la reserva no tenga teléfono */
  failed: boolean;
  /** true si la reserva existe en alguna de las tablas locales */
  found: boolean;
}

/**
 * Teléfono y nombre registrados de una reserva (para verificar al huésped). Solo servidor.
 * Reservas directas: local_reservas. Beds24 y OTA: copia en beds24_reservations.guest_phone, donde se guarda el
 * teléfono que se pide al hacer el check-in.
 */
export async function resolveBookingContact(bookingId: string): Promise<BookingContact> {
  const id = Number(bookingId);
  if (!Number.isSafeInteger(id) || id <= 0) return { phone: null, guestName: null, failed: false, found: false };
  let failed = false;
  let found = false;
  let guestName: string | null = null;

  const local = await supabaseAdmin.from('local_reservas').select('phone, guest_name').eq('id', id).maybeSingle();
  if (local.error) failed = true;
  if (local.data) found = true;
  if (local.data?.guest_name) guestName = local.data.guest_name;
  if (local.data?.phone) return { phone: local.data.phone, guestName, failed: false, found: true };

  const byNote = await supabaseAdmin.from('local_reservas').select('phone, guest_name').like('notes', `%B24:${id}%`).limit(1);
  if (byNote.error) failed = true;
  if (byNote.data?.[0]) found = true;
  if (!guestName && byNote.data?.[0]?.guest_name) guestName = byNote.data[0].guest_name;
  if (byNote.data?.[0]?.phone) return { phone: byNote.data[0].phone, guestName, failed: false, found: true };

  const b24 = await supabaseAdmin.from('beds24_reservations').select('guest_phone, guest_name').eq('id', String(id)).maybeSingle();
  if (b24.error) failed = true;
  if (b24.data) found = true;
  if (!guestName && b24.data?.guest_name) guestName = b24.data.guest_name;

  return { phone: b24.data?.guest_phone || null, guestName, failed, found };
}

export async function resolveBookingPhone(bookingId: string): Promise<string | null> {
  return (await resolveBookingContact(bookingId)).phone;
}

/**
 * Número de Beds24 de una reserva local (va en sus notas como "B24:<id>"). El portal puede abrirse con cualquiera de los dos
 * números de la misma reserva: la cookie del huésped se emite para el de la dirección, y los comprobantes se guardan con el local.
 */
export async function resolveB24Alias(localId: string): Promise<string | null> {
  const id = Number(localId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const { data } = await supabaseAdmin.from('local_reservas').select('notes').eq('id', id).maybeSingle();
  const m = /B24:(\d{1,15})/.exec(String(data?.notes ?? ''));
  return m ? m[1] : null;
}
