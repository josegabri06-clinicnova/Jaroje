// Subida de DNI, vouchers y comprobantes desde el navegador del personal (Recepción y administrador).
// Los archivos ya no se suben directamente a Supabase con la clave pública: pasan por /api/files/upload.

// Vercel rechaza peticiones de más de ~4,5 MB: las fotos grandes se reducen antes de enviarlas
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const SHRINK_FROM_BYTES = 1.5 * 1024 * 1024;
const MAX_SIDE_PX = 2000;

async function shrinkImage(file: File | Blob): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size <= SHRINK_FROM_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // formato que el navegador no sabe decodificar: se envía tal cual si cabe
  }
}

/** Sube un archivo y devuelve su enlace de /api/files (el que se guarda en la base de datos). Lanza un error legible si falla. */
export async function uploadGuestFile(file: File | Blob, prefix: string): Promise<string> {
  const blob = await shrinkImage(file);
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error('El archivo es demasiado grande (máximo 4 MB). Vuelve a tomar la foto con menor resolución.');
  }
  const form = new FormData();
  form.append('file', blob, (file as File).name || 'archivo');
  form.append('prefix', prefix);
  const res = await fetch('/api/files/upload', { method: 'POST', body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success || !json.url) throw new Error(json.error || 'No se pudo subir el archivo.');
  return json.url as string;
}
