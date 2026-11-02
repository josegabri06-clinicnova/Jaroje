import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionFromRequest } from '@/lib/session';
import { isFileBucket, isSafeFilePath, contentTypeForPath } from '@/lib/storage-files';

export const dynamic = 'force-dynamic';

/**
 * Sirve un archivo de huésped (DNI, voucher, comprobante) a través del servidor.
 * Solo administrador y Recepción: Limpieza y Mantenimiento no pueden leerlos. El almacén se lee con la clave
 * de servicio, así que el archivo no necesita ser público ni tener un enlace firmado.
 */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || (session.role !== 'admin' && session.role !== 'recepcion')) {
    return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 403 });
  }

  const { path: segments } = await params;
  const [bucket, ...rest] = segments || [];
  const filePath = rest.join('/');
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
