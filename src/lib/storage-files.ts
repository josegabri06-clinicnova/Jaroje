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
