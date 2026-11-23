/**
 * Helper centralizado para el badge de canal de reserva.
 * Retorna { label, className } para renderizar el badge en cualquier página.
 *
 * Canales disponibles:
 *  - 'Airbnb'        → naranja
 *  - 'Booking.com'   → azul marino
 *  - 'Expedia'       → amarillo
 *  - 'Google'        → verde Google (Booking Page de Beds24)
 *  - 'WhatsApp'      → verde WhatsApp
 *  - 'Directo'       → azul
 *  - cualquier otro  → gris
 */
/**
 * OTAs que COBRAN al huésped por adelantado el total de la reserva (el pago llega anotado en Payments de Beds24 desde el principio):
 * para recepción esas reservas están pagadas y no hay nada que cobrar.
 * Expedia NO está aquí: por contrato el huésped puede reservar sin pagar y pagar después (en el portal o en el check-in), así que una
 * reserva de Expedia se trata como cualquier otra: debe lo que no figure pagado en Payments.
 */
export const CHANNEL_COLLECT_OTAS = ['airbnb', 'booking'] as const;

export function isChannelCollectOta(channel?: string | null): boolean {
  const c = String(channel || '').toLowerCase();
  return CHANNEL_COLLECT_OTAS.some(ota => c.includes(ota));
}

export function getChannelBadge(channel: string | null | undefined): {
  label: string;
  className: string;
  emoji: string;
} {
  const ch = (channel || 'Directo').trim();
  const chLower = ch.toLowerCase();

  if (chLower.includes('airbnb')) {
    return {
      label: 'Airbnb',
      emoji: '🏠',
      className: 'bg-orange-50 border border-orange-200 text-orange-700',
    };
  }
  if (chLower.includes('booking')) {
    return {
      label: 'Booking.com',
      emoji: '🔵',
      className: 'bg-blue-900/10 border border-blue-900/20 text-blue-900',
    };
  }
  if (chLower.includes('expedia')) {
    return {
      label: 'Expedia',
      emoji: '✈️',
      className: 'bg-yellow-50 border border-yellow-200 text-yellow-800',
    };
  }
  if (chLower.includes('google')) {
    return {
      label: 'Google Ads',
      emoji: '🎯',
      className: 'bg-green-50 border border-green-200 text-green-800',
    };
  }
  if (chLower.includes('whatsapp') || chLower.includes('whatssap')) {
    return {
      label: 'WhatsApp',
      emoji: '💬',
      className: 'bg-emerald-50 border border-emerald-200 text-emerald-800',
    };
  }
  if (chLower.includes('jaroje')) {
    return {
      label: 'Jaroje Oficial',
      emoji: '🏨',
      className: 'bg-indigo-50 border border-indigo-200 text-indigo-700 font-extrabold',
    };
  }
  return {
    label: ch === 'Directo' ? 'Directo' : ch,
    emoji: '📞',
    className: 'bg-blue-50 border border-blue-100 text-blue-700',
  };
}
