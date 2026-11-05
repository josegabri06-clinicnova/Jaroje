// Utilidades para no escribir datos personales completos en los registros del servidor (Vercel Logs).
// Los registros los puede ver cualquiera con acceso al proyecto y se conservan un tiempo.

/** Enmascara un teléfono dejando solo los 4 últimos dígitos: "527773507797" -> "***7797". */
export function maskPhone(phone?: string | null): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '(sin teléfono)';
  return digits.length <= 4 ? '****' : `***${digits.slice(-4)}`;
}

/** Describe un texto sin revelar su contenido: "[texto de 42 caracteres]". */
export function describeText(text?: string | null): string {
  const len = String(text ?? '').length;
  return `[texto de ${len} caracteres]`;
}
