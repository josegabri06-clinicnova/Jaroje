// Archivos de huéspedes (DNI, vouchers, comprobantes): se sirven siempre por /api/files, con control de roles en el servidor.
// Este módulo no importa nada para poder usarse tanto en el servidor como en el navegador.

export const FILE_BUCKETS = ['dni_images', 'transfer-receipts', 'payment_receipts'] as const;
export type FileBucket = (typeof FILE_BUCKETS)[number];

export function isFileBucket(value: unknown): value is FileBucket {
  return typeof value === 'string' && (FILE_BUCKETS as readonly string[]).includes(value);
}

// Rutas de archivo válidas: sin saltos de directorio ni caracteres raros (los nombres los genera el propio sistema)
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,180}$/;

export function isSafeFilePath(path: string): boolean {
  if (!path || path.length > 300) return false;
  const segments = path.split('/');
  return segments.every(seg => SAFE_SEGMENT.test(seg) && !seg.includes('..'));
}

// Enlace del archivo a través del servidor (lo que se guarda en la base de datos y se muestra en pantalla)
export function filesProxyUrl(bucket: FileBucket, path: string): string {
  return `/api/files/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Extrae bucket y ruta de un enlace guardado. Reconoce los tres formatos que existen:
 *  - público de Supabase:  .../storage/v1/object/public/<bucket>/<ruta>
 *  - firmado de Supabase:  .../storage/v1/object/sign/<bucket>/<ruta>?token=...
 *  - del servidor:         /api/files/<bucket>/<ruta>   (relativo o absoluto)
 */
export function parseStoredFileUrl(url: string | null | undefined): { bucket: FileBucket; path: string } | null {
  if (!url || typeof url !== 'string') return null;
  const clean = url.split('?')[0].split('#')[0];

  const match =
    clean.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/) ||
    clean.match(/\/api\/files\/([^/]+)\/(.+)$/);
  if (!match) return null;

  const bucket = match[1];
  let path = match[2];
  try { path = path.split('/').map(decodeURIComponent).join('/'); } catch { return null; }

  if (!isFileBucket(bucket) || !isSafeFilePath(path)) return null;
  return { bucket, path };
}

// Tipo REAL de un archivo subido, por sus primeros bytes (no por el nombre ni por el tipo que declare el navegador)
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...Array.from(b.slice(from, to)));
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];

export function sniffFileType(b: Uint8Array): { ext: string; mime: string } | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return { ext: 'png', mime: 'image/png' };
  if (b.length >= 5 && ascii(b, 0, 5) === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp' && HEIC_BRANDS.includes(ascii(b, 8, 12))) return { ext: 'heic', mime: 'image/heic' };
  return null;
}

// Prefijo del nombre de archivo que sugiere quien sube (p. ej. "dni_95584793"): solo letras, números, _ y -
export function sanitizeFilePrefix(raw: unknown): string {
  const clean = String(raw ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 40);
  return clean.replace(/^[^a-z0-9]+/, '') || 'doc';
}

// Tipo de contenido por extensión: solo imágenes y PDF se muestran en el navegador; el resto se descarga
const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf',
};

export function contentTypeForPath(path: string): { type: string; inline: boolean } {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const type = CONTENT_TYPES[ext];
  return type ? { type, inline: true } : { type: 'application/octet-stream', inline: false };
}
