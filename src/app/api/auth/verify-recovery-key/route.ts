import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Control de fuerza bruta en memoria por IP (máx 5 intentos erróneos por ventana de 15 minutos)
const rateLimitMap = new Map<string, { attempts: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record) return false;
  if (now > record.resetAt) {
    rateLimitMap.delete(ip);
    return false;
  }
  return record.attempts >= 5;
}

function recordFailedAttempt(ip: string) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutos
  const record = rateLimitMap.get(ip) || { attempts: 0, resetAt: now + windowMs };
  record.attempts += 1;
  rateLimitMap.set(ip, record);
}

function clearRateLimit(ip: string) {
  rateLimitMap.delete(ip);
}

export async function POST(request: Request) {
  try {
    const forwarded = request.headers.get('x-forwarded-for');
    const clientIp = (forwarded ? forwarded.split(',')[0] : '127.0.0.1').trim();

    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        { success: false, error: 'Demasiados intentos fallidos. Por seguridad, intente nuevamente en 15 minutos.' },
        { status: 429 }
      );
    }

    const { recoveryKey } = await request.json();

    if (!recoveryKey || typeof recoveryKey !== 'string' || !recoveryKey.trim()) {
      return NextResponse.json({ success: false, error: 'Por favor, ingresa la Llave de Recuperación Maestra.' }, { status: 400 });
    }

    // 1. Obtener la llave maestra registrada: primero variable de entorno de servidor, luego settings
    const envKey = process.env.ADMIN_RECOVERY_KEY?.trim();
    let expectedKey = envKey;

    if (!expectedKey) {
      const { data: dbKeyRow, error: dbKeyError } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'admin_recovery_key')
        .maybeSingle();

      if (dbKeyError) {
        return NextResponse.json({ success: false, error: `Error en base de datos: ${dbKeyError.message}` }, { status: 500 });
      }

      expectedKey = dbKeyRow?.value?.trim();
    }

    // Si no hay llave configurada ni en env ni en base de datos, fallar de forma cerrada (Fail-Closed)
    if (!expectedKey) {
      console.error('[verify-recovery-key] Llave de recuperación maestra no configurada en env ni en DB.');
      return NextResponse.json(
        { success: false, error: 'La llave de recuperación no ha sido configurada en el servidor. Contacte al administrador del sistema.' },
        { status: 500 }
      );
    }

    // 2. Comparación en tiempo constante para mitigar ataques de temporización (timing attacks)
    const inputHash = crypto.createHash('sha256').update(recoveryKey.trim()).digest();
    const expectedHash = crypto.createHash('sha256').update(expectedKey).digest();

    if (!crypto.timingSafeEqual(inputHash, expectedHash)) {
      recordFailedAttempt(clientIp);
      return NextResponse.json({ success: false, error: 'La Llave de Recuperación Maestra es incorrecta.' }, { status: 401 });
    }

    // Clave correcta -> limpiar intentos fallidos
    clearRateLimit(clientIp);

    // 3. Obtener el PIN administrador activo para sincronizar el estado
    const { data: adminPinRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'pin_admin')
      .maybeSingle();

    const adminPin = adminPinRow?.value || '1234';

    return NextResponse.json({
      success: true,
      role: 'admin',
      pin: adminPin
    });
  } catch (error: any) {
    console.error('Error verifying master recovery key:', error);
    return NextResponse.json({ success: false, error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
