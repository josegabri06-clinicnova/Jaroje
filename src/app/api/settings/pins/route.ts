import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionFromRequest } from '@/lib/session';
import { PIN_DB_KEY, isPinRole } from '@/lib/server-pins';

export const dynamic = 'force-dynamic';

/**
 * Cambia el PIN de un rol. Solo con sesión de administrador (cookie firmada): quien entra con passkey o llave de
 * recuperación no tiene PIN a mano, y con esa sesión ya puede hacer cualquier acción de administración.
 * El PIN nuevo debe tener exactamente 4 dígitos (el teclado del login se envía al llegar a 4, así que uno más
 * largo bloquearía el acceso).
 */
export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Se requieren privilegios de administrador.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { role, newPin } = body ?? {};

  if (!isPinRole(role)) {
    return NextResponse.json({ success: false, error: 'Rol inválido.' }, { status: 400 });
  }
  if (typeof newPin !== 'string' || !/^\d{4}$/.test(newPin)) {
    return NextResponse.json({ success: false, error: 'El PIN nuevo debe tener exactamente 4 dígitos.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({ key: PIN_DB_KEY[role], value: newPin }, { onConflict: 'key' });
  if (error) {
    console.error('[settings/pins] Error guardando PIN:', error.message);
    return NextResponse.json({ success: false, error: 'No se pudo guardar el PIN.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
