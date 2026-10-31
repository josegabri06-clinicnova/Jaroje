// Beds24 solo permite reservar noches hasta 365 días a partir de hoy.
export const BOOKING_WINDOW_DAYS = 365;

function addDaysToDateStr(dateStr: string, days: number): string {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function mexicoToday(): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function formatLong(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

export function getBookingWindow(): { lastNight: string; maxCheckOut: string } {
  const lastNight = addDaysToDateStr(mexicoToday(), BOOKING_WINDOW_DAYS);
  return { lastNight, maxCheckOut: addDaysToDateStr(lastNight, 1) };
}

export function checkBookingWindow(checkIn: string, checkOut: string): { ok: true } | { ok: false; error: string } {
  const { lastNight, maxCheckOut } = getBookingWindow();
  if (checkIn > lastNight || checkOut > maxCheckOut) {
    return {
      ok: false,
      error: `Por el momento solo se pueden reservar noches hasta el ${formatLong(lastNight)} (salida a más tardar el ${formatLong(maxCheckOut)}). Por favor elige otras fechas.`
    };
  }
  return { ok: true };
}
