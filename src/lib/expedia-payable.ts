import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

/**
 * Expedia cobra en el hotel: el huésped puede reservar sin pagar y liquidar después (portal, WhatsApp o check-in).
 * A esas reservas, mientras les quede saldo, se les invita (sin obligar) a pagar desde el Portal del Huésped:
 *  - WhatsApp: plantilla de Meta `reservacion_confirmada_expedia`.
 *  - Mensaje de la OTA (a los 20 min sin teléfono): mismo texto con el párrafo de pago.
 * Si ya no deben nada, se envía la plantilla normal de "reservación confirmada".
 */
export const EXPEDIA_CONFIRMED_META_TEMPLATE = 'reservacion_confirmada_expedia';

/** Parte pura: ¿es Expedia y queda saldo por pagar? */
export function expediaHasBalanceDue(channel: unknown, price: unknown, paid: unknown): boolean {
  if (!String(channel || '').toLowerCase().includes('expedia')) return false;
  const total = Number(price);
  if (!Number.isFinite(total) || total <= 0) return false;
  const paidNum = Number(paid);
  const paidSafe = Number.isFinite(paidNum) && paidNum > 0 ? paidNum : 0;
  return total - paidSafe > 0.01;
}

/**
 * Decide si a esta reserva le corresponde la plantilla de Expedia con invitación a pagar.
 * Usa los datos que ya trae `booking`; si faltan (canal o precio), los completa desde Supabase.
 * Ante cualquier duda o error devuelve false (se envía la plantilla normal de siempre).
 */
export async function isExpediaWithBalance(booking: any): Promise<boolean> {
  try {
    const id = String(booking?.id ?? '').trim();
    if (!/^\d{7,}$/.test(id)) return false; // las locales (500 y 600) no son de Expedia

    let channel = String(booking?.channel || '');
    if (channel && !channel.toLowerCase().includes('expedia')) return false; // Airbnb, Booking, etc.: sin consultas

    let price: unknown = booking?.price;
    let paid: unknown = booking?.actualPaid ?? booking?.actual_paid ?? booking?.deposit;

    if (!channel || !(Number(price) > 0)) {
      const { data: row } = await supabase
        .from('beds24_reservations')
        .select('channel, price, deposit, actual_paid')
        .eq('id', id)
        .maybeSingle();
      if (!row) return false;
      channel = String(row.channel || channel);
      price = row.price;
      paid = row.actual_paid ?? row.deposit;
    }

    return expediaHasBalanceDue(channel, price, paid);
  } catch (e) {
    console.warn('[Expedia plantilla] No se pudo comprobar el saldo; se usa la plantilla normal:', e);
    return false;
  }
}

/** Errores de Meta que indican que la plantilla no existe / no está aprobada todavía (o no coincide con sus parámetros). */
export function isMetaTemplateUnavailableError(error: unknown): boolean {
  return /template|\(#?1320\d\d\)/i.test(String(error || ''));
}
