import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionFromRequest } from '@/lib/session';

export const dynamic = 'force-dynamic';

const KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateRecoveryKey(): string {
  const segment = (len: number) => {
    let out = '';
    for (let i = 0; i < len; i++) out += KEY_CHARS[crypto.randomInt(KEY_CHARS.length)];
    return out;
  };
  return `JRJ-SEC-${segment(4)}-${segment(4)}-${segment(4)}`;
}

async function requireAdmin(req: Request) {
  const session = await getSessionFromRequest(req);
  return session?.role === 'admin';
}

// Llave de recuperación maestra del administrador: solo se lee y se regenera desde el servidor, con sesión de administrador.
export async function GET(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ success: false, error: 'Se requieren privilegios de administrador.' }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'admin_recovery_key')
    .maybeSingle();
  if (error) {
    return NextResponse.json({ success: false, error: 'No se pudo leer la llave.' }, { status: 500 });
  }
  // Si ADMIN_RECOVERY_KEY está definida en Vercel, esa variable manda sobre la guardada en la base de datos
  return NextResponse.json({
    success: true,
    key: data?.value ?? null,
    envOverride: Boolean(process.env.ADMIN_RECOVERY_KEY?.trim()),
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ success: false, error: 'Se requieren privilegios de administrador.' }, { status: 403 });
  }
  const key = generateRecoveryKey();
  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({ key: 'admin_recovery_key', value: key }, { onConflict: 'key' });
  if (error) {
    console.error('[settings/recovery-key] Error guardando llave:', error.message);
    return NextResponse.json({ success: false, error: 'No se pudo guardar la llave.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, key });
}
