/**
 * Regla única de "reserva con anticipo": una reserva pasa a confirmada en cuanto tiene un anticipo, de cualquier monto.
 *
 * El gerente puede autorizar anticipos menores al 50% (p. ej. 25% o 30%), así que ya no se exige un porcentaje mínimo.
 * El 50% que se le pide al cliente al reservar es la política comercial que se le muestra; no condiciona el estado.
 * Todas las pantallas, rutas, el webhook y el cron usan esta función para que nunca diverjan.
 *
 * Importes menores a 1 se tratan como ruido de redondeo, no como un pago: al repartir un pago entre las habitaciones de un
 * grupo cada parte se redondea a centavos y la suma puede diferir del total en unos centavos (p. ej. 100.01 por 100.00).
 */
const MIN_DEPOSIT = 1;

export function hasDepositPaid(deposit: unknown): boolean {
  const amount = Number(deposit);
  return Number.isFinite(amount) && amount >= MIN_DEPOSIT;
}
