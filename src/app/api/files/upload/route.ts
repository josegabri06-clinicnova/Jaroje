import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionFromRequest } from '@/lib/session';
import { filesProxyUrl, sniffFileType, sanitizeFilePrefix } from '@/lib/storage-files';

export const dynamic = 'force-dynamic';

// Vercel rechaza peticiones de más de ~4,5 MB; el navegador comprime las fotos antes de enviarlas
const MAX_BYTES = 4.5 * 1024 * 1024;

/**
 * Sube un DNI, voucher o comprobante desde Recepción o el administrador (check-in, reservas).
 * Solo esos dos roles. El servidor decide el nombre (único, con parte aleatoria: no hace falta `upsert`) y el tipo real
 * del archivo se comprueba por su contenido. Devuelve el enlace de /api/files, que es el que se guarda en la base de datos.
 */
export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session || (session.role !== 'admin' && session.role !== 'recepcion')) {
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

  const prefix = sanitizeFilePrefix(form.get('prefix'));
  const path = `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${detected.ext}`;

  const { error } = await supabaseAdmin.storage
    .from('dni_images')
    .upload(path, bytes, { contentType: detected.mime, upsert: false });
  if (error) {
    console.error('[files/upload] Error subiendo archivo:', error.message);
    return NextResponse.json({ success: false, error: 'No se pudo guardar el archivo.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, url: filesProxyUrl('dni_images', path), path });
}
