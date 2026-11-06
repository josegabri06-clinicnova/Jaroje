/**
 * Números de prueba (socios / equipo) que SÍ reciben las plantillas y respuestas automáticas aunque estén en la lista
 * 'excluded_person'. Sirve para probar los flujos reales (conmutador, reservas, WhatsApp) con teléfonos del equipo.
 *
 * Se configura con la variable de entorno WHATSAPP_TEST_PHONES: teléfonos con código de país separados por comas
 * (por ejemplo "34600000000,34611111111"). Sin la variable, o vacía, nadie está exento y la regla de exclusión funciona
 * exactamente igual que siempre. Los números no están en el código ni en el repositorio.
 */
const SUFFIX_DIGITS = 9; // se compara por los últimos 9 dígitos, como se hacía antes: tolera "+34", "0034", el "1" de México, etc.

export function isTesterPhone(phone: unknown, env: string | undefined = process.env.WHATSAPP_TEST_PHONES): boolean {
  const configured = String(env ?? '').trim();
  if (!configured) return false;

  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < SUFFIX_DIGITS) return false;

  return configured
    .split(',')
    .map((n) => n.replace(/\D/g, ''))
    .filter((n) => n.length >= SUFFIX_DIGITS) // un valor demasiado corto no se acepta: coincidiría con demasiados números
    .some((n) => digits.endsWith(n.slice(-SUFFIX_DIGITS)));
}
