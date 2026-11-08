import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionFromRequest } from '@/lib/session';
import { sniffFileType } from '@/lib/storage-files';

export const dynamic = 'force-dynamic';

// Vercel rechaza peticiones de más de ~4,5 MB: el navegador comprime las fotos grandes antes de enviarlas
const MAX_BYTES = 4.4 * 1024 * 1024;
const KINDS = new Set(['incidencia', 'resolucion']);

/**
 * Sube una foto (o PDF) de una incidencia de mantenimiento o de su resolución.
 * Solo el administrador, recepción y el personal (limpieza y mantenimiento). Antes las páginas subían directamente a Supabase con la
 * clave pública, lo que permitía a cualquiera, sin sesión, llenar el almacén con archivos de cualquier tipo y tamaño.
 *
 * El servidor decide el nombre (único, con parte aleatoria: no hace falta `upsert`) y comprueba el tipo real del archivo por
 * su contenido, no por su nombre. Devuelve el enlace público del almacén, que es el que se guarda en la tarea.
 */
export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session || !['admin', 'recepcion', 'staff_limpieza', 'staff_mantenimiento'].includes(session.role)) {
    return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ success: false, error: 'Falta el archivo.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ success: false, error: 'El archivo es demasiado grande (máximo 4 MB).' }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = sniffFileType(bytes);
  if (!detected) {
    return NextResponse.json({ success: false, error: 'Formato no permitido. Solo imágenes (JPG, PNG, WEBP, HEIC) o PDF.' }, { status: 400 });
  }

  const kindRaw = String(form.get('kind') ?? '');
  const kind = KINDS.has(kindRaw) ? kindRaw : 'incidencia';
  const path = `${kind}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${detected.ext}`;

  const bucket = supabaseAdmin.storage.from('maintenance_photos');
  const { error } = await bucket.upload(path, bytes, { contentType: detected.mime, upsert: false });
  if (error) {
    console.error('[tasks/photo] Error subiendo archivo:', error.message);
    return NextResponse.json({ success: false, error: 'No se pudo guardar el archivo.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, url: bucket.getPublicUrl(path).data.publicUrl });
}
