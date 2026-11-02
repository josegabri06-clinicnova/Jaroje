import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { serveStoredFile } from '@/lib/storage-serve';

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
  return serveStoredFile(bucket, rest.join('/'));
}
