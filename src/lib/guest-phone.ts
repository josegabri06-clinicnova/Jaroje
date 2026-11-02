import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Teléfono registrado de una reserva (para verificar al huésped). Solo servidor.
 * Reservas directas: local_reservas.phone. Beds24 y OTA: copia en beds24_reservations.guest_phone, donde se guarda el
 * teléfono que se pide al hacer el check-in.
 */
export async function resolveBookingPhone(bookingId: string): Promise<string | null> {
  const id = Number(bookingId);

  const { data: local } = await supabaseAdmin.from('local_reservas').select('phone').eq('id', id).maybeSingle();
  if (local?.phone) return local.phone;

  const { data: byNote } = await supabaseAdmin.from('local_reservas').select('phone').like('notes', `%B24:${id}%`).limit(1);
  if (byNote?.[0]?.phone) return byNote[0].phone;

  const { data: b24 } = await supabaseAdmin.from('beds24_reservations').select('guest_phone').eq('id', String(id)).maybeSingle();
  return b24?.guest_phone || null;
}
