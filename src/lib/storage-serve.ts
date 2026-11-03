import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { contentTypeForPath, isFileBucket, isSafeFilePath } from '@/lib/storage-files';

/**
 * Lee un archivo de huésped del almacén con la clave de servicio y lo devuelve con cabeceras seguras.
 * Quien llama debe haber comprobado ANTES que la persona tiene permiso (personal con rol o huésped autorizado).
 */
export async function serveStoredFile(bucket: string, filePath: string): Promise<Response> {
  if (!isFileBucket(bucket) || !isSafeFilePath(filePath)) {
    return NextResponse.json({ success: false, error: 'Archivo no encontrado.' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin.storage.from(bucket).download(filePath);
  if (error || !data) {
    return NextResponse.json({ success: false, error: 'Archivo no encontrado.' }, { status: 404 });
  }

  const { type, inline } = contentTypeForPath(filePath);
  const fileName = filePath.split('/').pop() || 'archivo';
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${fileName.replace(/"/g, '')}"`,
    // Documentos personales: nunca en cachés compartidas y sin que el navegador adivine el tipo
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  // Sin ejecutar nada aunque el archivo no fuera una imagen (el PDF se excluye: "sandbox" bloquea el visor de PDF del navegador)
  if (type !== 'application/pdf') headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
  return new Response(await data.arrayBuffer(), { status: 200, headers });
}
