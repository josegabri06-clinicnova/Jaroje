/** ¿La reserva está cancelada? Beds24 usa 'cancelled' (o 0) y la copia local 'cancelled'. */
export function isCancelledStatus(status: unknown): boolean {
  const s = String(status ?? '').toLowerCase().trim();
  return s === 'cancelled' || s === '0';
}
