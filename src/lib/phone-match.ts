/**
 * ¿Dos teléfonos son el mismo número, sin importar cómo estén escritos (+52 1 951…, 0034 608…, espacios, guiones)?
 * Compara los últimos dígitos (hasta 10). Un teléfono de menos de 8 dígitos, o de relleno (0000…, como los que dejan las OTA),
 * nunca coincide con nada.
 *
 * Se usa solo para FILTRAR una lista que ya está autorizada (p. ej. "Mi Estancia"): nunca para buscar datos de nadie.
 */
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export function isUsablePhone(v: unknown): boolean {
  const d = digits(v);
  return d.length >= 8 && !d.startsWith('0000');
}

export function phoneMatches(a: unknown, b: unknown): boolean {
  if (!isUsablePhone(a) || !isUsablePhone(b)) return false;
  const da = digits(a), db = digits(b);
  const n = Math.min(10, da.length, db.length);
  return da.slice(-n) === db.slice(-n);
}
