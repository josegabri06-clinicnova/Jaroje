import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS, SessionPayload } from '@/lib/session';

export const dynamic = 'force-dynamic';

const DB_KEY_MAP: Record<string, string> = {
  admin: 'pin_admin',
  staff_limpieza: 'pin_limpieza',
  staff_mantenimiento: 'pin_mantenimiento',
  recepcion: 'pin_recepcion',
};

// Control de fuerza bruta en memoria por IP (máx 5 intentos fallidos cada 15 minutos)
const loginRateLimitMap = new Map<string, { attempts: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = loginRateLimitMap.get(ip);
  if (!record) return false;
  if (now > record.resetAt) {
    loginRateLimitMap.delete(ip);
    return false;
  }
  return record.attempts >= 5;
}

function recordFailedAttempt(ip: string) {
  const now = Date.now();
  const record = loginRateLimitMap.get(ip) || { attempts: 0, resetAt: now + 15 * 60 * 1000 };
  record.attempts += 1;
  loginRateLimitMap.set(ip, record);
}

function clearRateLimit(ip: string) {
  loginRateLimitMap.delete(ip);
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

    if (isRateLimited(ip)) {
      return NextResponse.json({
        success: false,
        error: 'Demasiados intentos fallidos. Acceso bloqueado temporalmente por 15 minutos.'
      }, { status: 429 });
    }

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

    // 1. Obtener el PIN activo desde Supabase settings (con auto-seed si no existe en BD)
    const dbKey = DB_KEY_MAP[cleanRole];
    let expectedPin = '';

    const { data: row } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', dbKey)
      .maybeSingle();

    if (row?.value && String(row.value).trim()) {
      expectedPin = String(row.value).trim();
    } else {
      // Si la fila no existe aún en settings, usar variable de entorno o seed inicial seguro
      const envPin = cleanRole === 'admin' ? process.env.ADMIN_PIN : undefined;
      const seedDefaults: Record<string, string> = {
        admin: '1234',
        recepcion: '0000',
        staff_limpieza: '5678',
        staff_mantenimiento: '8765'
      };
      expectedPin = envPin?.trim() || seedDefaults[cleanRole] || '1234';

      // Auto-inicializar en Supabase settings para persistencia futura
      try {
        await supabaseAdmin
          .from('settings')
          .upsert({ key: dbKey, value: expectedPin });
        console.log(`[API Auth Login] Inicializado PIN en settings: ${dbKey}`);
      } catch (err: any) {
        console.warn(`[API Auth Login] Error inicializando PIN en settings:`, err);
      }
    }

    // 2. Comparación en tiempo constante para mitigar ataques de temporización
    const expectedHash = crypto.createHash('sha256').update(expectedPin).digest();
    const providedHash = crypto.createHash('sha256').update(cleanPin).digest();

    if (!crypto.timingSafeEqual(expectedHash, providedHash)) {
      recordFailedAttempt(ip);
      return NextResponse.json({ success: false, error: 'PIN incorrecto.' }, { status: 401 });
    }

    // Limpiar intentos fallidos tras login exitoso
    clearRateLimit(ip);

    // 3. Generar token de sesión firmado criptográficamente
    const sessionToken = await createSessionToken(cleanRole);

    // 4. Crear respuesta con Cookie HttpOnly segura (NUNCA devolviendo el PIN en el JSON)
    const res = NextResponse.json({
      success: true,
      role: cleanRole,
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
