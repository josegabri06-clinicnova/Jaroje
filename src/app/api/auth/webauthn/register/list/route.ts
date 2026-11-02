import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionFromRequest } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Dispositivos (passkeys) autorizados del administrador, para la lista de Ajustes.
// Solo devuelve datos de presentación: nunca la clave pública ni el identificador de la credencial.
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (session?.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Se requieren privilegios de administrador.' }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin
    .from('user_passkeys')
    .select('id, device_name, created_at')
    .eq('role', 'admin')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[webauthn/register/list] Error leyendo passkeys:', error.message);
    return NextResponse.json({ success: false, error: 'No se pudieron leer los dispositivos.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, passkeys: data || [] });
}
