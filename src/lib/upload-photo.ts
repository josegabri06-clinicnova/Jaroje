/**
 * Subida de fotos de mantenimiento desde el navegador, a través del servidor (/api/tasks/photo).
 *
 * Vercel rechaza peticiones de más de ~4,5 MB y las fotos de un móvil suelen pesar más, así que:
 *  - las imágenes de más de 600 KB se reducen a un JPG de 1600 px (pesa ~300 KB y no satura la memoria del móvil al verla);
 *  - si no se puede reducir, se envía tal cual solo si cabe (hasta 3,5 MB);
 *  - si no se puede reducir (por ejemplo un HEIC que el navegador no sabe abrir), se envía tal cual solo si cabe;
 *  - un PDF se envía tal cual si cabe.
 * Devuelve el enlace público de la foto, o null si no se pudo subir (igual que antes: la tarea se guarda sin foto).
 */
const MAX_DIRECT_BYTES = 3.5 * 1024 * 1024;
const REDUCE_ABOVE_BYTES = 600 * 1024; // por encima de esto se reduce siempre: una foto de móvil descomprimida ocupa decenas de MB de memoria al verla
const MAX_SIDE = 1600;

async function toJpegBlob(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8));
  } catch {
    return null;
  }
}

export async function uploadMaintenancePhoto(file: File, kind: 'incidencia' | 'resolucion'): Promise<string | null> {
  try {
    let body: Blob = file;
    let name = file.name || 'foto';
    const fitsAsIs = file.size <= MAX_DIRECT_BYTES;
    const isPlainImage = /^image\/(jpeg|png|webp)$/.test(file.type);

    if (!fitsAsIs || file.size > REDUCE_ABOVE_BYTES || (!isPlainImage && file.type.startsWith('image/'))) {
      const compressed = await toJpegBlob(file);
      if (compressed && compressed.size > 0) {
        body = compressed;
        name = 'foto.jpg';
      } else if (!fitsAsIs) {
        return null; // demasiado grande y no se puede reducir
      }
    }

    const form = new FormData();
    form.append('file', body, name);
    form.append('kind', kind);
    const res = await fetch('/api/tasks/photo', { method: 'POST', body: form, credentials: 'same-origin' });
    const json = await res.json().catch(() => null);
    return res.ok && json?.success && typeof json.url === 'string' ? json.url : null;
  } catch {
    return null;
  }
}

/**
 * Las pantallas muestran la vista previa de la foto como texto (data URL). Antes ese texto se guardaba tal cual en la tarea:
 * cada foto pesaba ~70 KB dentro de la fila y se descargaba entera en cada lectura de la tabla. Ahora, al enviar, se sube la foto
 * al almacén y en la tarea solo se guarda el enlace. Si una foto no se puede subir se conserva el texto (no se pierde la evidencia).
 */
export async function uploadDataUrlPhotos(photos: string[], kind: 'incidencia' | 'resolucion'): Promise<string[]> {
  return Promise.all(photos.map(async (photo) => {
    if (!photo.startsWith('data:image/')) return photo; // ya es un enlace
    try {
      const blob = await (await fetch(photo)).blob();
      const url = await uploadMaintenancePhoto(new File([blob], 'foto.jpg', { type: blob.type || 'image/jpeg' }), kind);
      return url || photo;
    } catch {
      return photo;
    }
  }));
}
