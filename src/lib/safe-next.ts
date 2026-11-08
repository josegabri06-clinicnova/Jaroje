/**
 * Destino al que volver tras iniciar sesión cuando se llegó desde un enlace a un archivo del servidor (por ejemplo, el DNI o el
 * comprobante del resumen de check-in que se envía por WhatsApp). Solo se acepta una ruta interna /api/files/...: nunca otra
 * dirección, ni de otro dominio, ni una ruta con "..", para que el parámetro `next` no sirva de redirección abierta.
 */
export function safeFilesNext(value: string | null | undefined): string | null {
  if (!value || value.length > 300) return null;
  if (!/^\/api\/files\/[A-Za-z0-9_\-.~%/]+$/.test(value)) return null; // sin esquema, sin dominio, sin barra invertida ni consulta
  if (value.includes('//')) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  if (decoded.includes(String.fromCharCode(92)) || decoded.includes('//') || decoded.split('/').some((s) => s === '..' || s === '.')) return null;
  return value;
}
