/**
 * Estado con el que la aplicación guarda una reserva de Beds24 (`cancelled`, `black`, `confirmed` o `pending`).
 *
 * Beds24 tiene más estados que los cuatro que usa la aplicación: `confirmed`, `new` ("New (Confirmed)"), `request`, `inquiry`,
 * `cancelled` y `black`. Hasta ahora solo `confirmed` se guardaba como confirmada y TODO lo demás como `pending`, así que las reservas de
 * Airbnb y Booking, que llegan como `new` y ya vienen pagadas, aparecían como "Pendiente".
 *
 * Regla añadida: una reserva de Airbnb, Booking.com o Expedia cuyo estado en Beds24 no sea `confirmed`, `request`, cancelada ni bloqueo pasa
 * a `confirmed` cuando tiene un PAGO registrado en el apartado Payments de Beds24 (`actualPaid` > 0).
 *  - Airbnb y Booking cobran al huésped por adelantado y anotan el pago (Airbnb "Channel Collect", Booking "BankTransfer"): quedan confirmadas.
 *  - Expedia permite reservar sin pagar (el huésped paga después, en el portal o en el check-in): sin pago registrado se queda `pending`
 *    y pasa a `confirmed` cuando se registre el pago.
 *  - Una solicitud real (`request`) nunca se confirma sola.
 * El resto de estados se calcula exactamente igual que antes.
 */

export type StoredReservationStatus = 'cancelled' | 'black' | 'confirmed' | 'pending';

/** ¿Canal que anota el pago de la reserva en Payments? Se acepta el nombre normalizado de la app ("Booking.com") o el del canal en bruto */
export function isPaymentTrackedOta(channel?: string | null): boolean {
  const c = String(channel || '').toLowerCase();
  return ['airbnb', 'booking', 'expedia'].some(ota => c.includes(ota));
}

export function mapBeds24Status(
  rawStatus: unknown,
  opts: { channel?: string | null; actualPaid?: number | null } = {}
): StoredReservationStatus {
  const raw = rawStatus as any;
  // Igual que antes (comparaciones exactas)
  if (String(raw) === '0' || raw === 'cancelled') return 'cancelled';
  if (raw === 'black') return 'black';
  if (String(raw) === '1' || raw === 'confirmed') return 'confirmed';

  // OTA con pago registrado en Payments -> confirmada. Una solicitud (`request`, o `3` en la API antigua) no se confirma sola.
  const isRequest = raw === 'request' || String(raw) === '3';
  if (!isRequest && isPaymentTrackedOta(opts.channel) && Number(opts.actualPaid || 0) > 0) return 'confirmed';

  return 'pending';
}
