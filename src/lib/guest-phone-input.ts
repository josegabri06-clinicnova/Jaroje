/**
 * Teléfono que el huésped de una OTA escribe en el portal: prefijo de país + número. Devuelve solo dígitos con el prefijo
 * (formato canónico de la app, p. ej. 529511234567) o null si no es un número plausible. Se usa en el servidor.
 */
import { ALL_COUNTRY_CODES } from '@/lib/country-dial-codes';
import { isDummyOrInvalidPhone } from '@/lib/beds24';

const KNOWN_DIALS = new Set(ALL_COUNTRY_CODES.map(c => c.dialCode.replace(/\D/g, '')));

export function buildGuestPhoneDigits(dialCode: unknown, national: unknown): string | null {
  const dial = String(dialCode ?? '').slice(0, 8).replace(/\D/g, '');
  if (!dial || !KNOWN_DIALS.has(dial)) return null;

  let nat = String(national ?? '').slice(0, 30).replace(/\D/g, '');
  if (!nat) return null;

  if (dial === '52') {
    if (nat.length === 11 && nat.startsWith('1')) nat = nat.slice(1); // formato antiguo móvil 521…
    if (nat.length !== 10) return null;
  } else if (dial === '1') {
    if (nat.length === 11 && nat.startsWith('1')) nat = nat.slice(1);
    if (nat.length !== 10) return null;
  } else {
    nat = nat.replace(/^0+/, ''); // prefijo local de marcado (0…) que no va con el código de país
    if (nat.length < 5) return null;
  }

  if (/^(\d)\1+$/.test(nat) || nat.startsWith('0000')) return null; // 0000000, 1111111…: relleno
  const digits = dial + nat;
  if (digits.length < 8 || digits.length > 15) return null;
  if (isDummyOrInvalidPhone(digits)) return null;
  return digits;
}
