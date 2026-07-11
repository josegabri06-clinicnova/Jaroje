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
export function getChannelBadge(channel: string | null | undefined): {
  label: string;
  className: string;
  emoji: string;
} {
  const ch = (channel || 'Directo').trim();

  switch (ch) {
    case 'Airbnb':
      return {
        label: 'Airbnb',
        emoji: '🏠',
        className: 'bg-orange-50 border border-orange-200 text-orange-700',
      };
    case 'Booking.com':
      return {
        label: 'Booking.com',
        emoji: '🔵',
        className: 'bg-blue-900/10 border border-blue-900/20 text-blue-900',
      };
    case 'Expedia':
      return {
        label: 'Expedia',
        emoji: '✈️',
        className: 'bg-yellow-50 border border-yellow-200 text-yellow-800',
      };
    case 'Google':
      return {
        label: 'Google',
        emoji: '🔍',
        className: 'bg-green-50 border border-green-200 text-green-800',
      };
    case 'WhatsApp':
    case 'WhatsApp Bot':
      return {
        label: 'WhatsApp',
        emoji: '💬',
        className: 'bg-emerald-50 border border-emerald-200 text-emerald-800',
      };
    case 'Directo':
    default:
      return {
        label: ch === 'Directo' ? 'Directo' : ch,
        emoji: '📞',
        className: 'bg-blue-50 border border-blue-100 text-blue-700',
      };
  }
}
