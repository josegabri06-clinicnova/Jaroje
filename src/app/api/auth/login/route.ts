import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS, SessionPayload } from '@/lib/session';

export const dynamic = 'force-dynamic';

const DEFAULT_PINS: Record<string, string> = {
  admin: '1234',
  staff_limpieza: '5678',
  staff_mantenimiento: '8765',
  recepcion: '0000',
};

const DB_KEY_MAP: Record<string, string> = {
  admin: 'pin_admin',
  staff_limpieza: 'pin_limpieza',
  staff_mantenimiento: 'pin_mantenimiento',
  recepcion: 'pin_recepcion',
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { pin, role } = body;

    if (!pin || !role || typeof pin !== 'string') {
      return NextResponse.json({ success: false, error: 'PIN y rol son requeridos.' }, { status: 400 });
    }

    const cleanPin = pin.trim();
    const cleanRole = String(role).trim() as SessionPayload['role'];

    if (!DB_KEY_MAP[cleanRole]) {
      return NextResponse.json({ success: false, error: 'Rol inválido especificado.' }, { status: 400 });
    }

    // 1. Obtener el PIN activo desde Supabase settings
    const dbKey = DB_KEY_MAP[cleanRole];
    const { data: row } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', dbKey)
      .maybeSingle();

    const expectedPin = (row?.value || DEFAULT_PINS[cleanRole] || '').trim();

    // 2. Comparación en tiempo constante para mitigar ataques de temporización
    const expectedHash = crypto.createHash('sha256').update(expectedPin).digest();
    const providedHash = crypto.createHash('sha256').update(cleanPin).digest();

    if (!crypto.timingSafeEqual(expectedHash, providedHash)) {
      return NextResponse.json({ success: false, error: 'PIN incorrecto.' }, { status: 401 });
    }

    // 3. Generar token de sesión firmado criptográficamente
    const sessionToken = await createSessionToken(cleanRole);

    // 4. Crear respuesta con Cookie HttpOnly segura
    const res = NextResponse.json({
      success: true,
      role: cleanRole,
      pin: cleanPin, // Para compatibilidad con sessionStorage en modales internos
    });

    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DURATION_SECONDS,
    });

    return res;
  } catch (err: any) {
    console.error('[API Auth Login] Error procesando inicio de sesión:', err);
    return NextResponse.json({ success: false, error: 'Error interno en el servidor.' }, { status: 500 });
  }
}
