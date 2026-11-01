import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionFromRequest } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/beds24-auth/update-token
 *
 * Recibe un nuevo refreshToken desde la UI (admin verificado),
 * lo valida inmediatamente contra Beds24 para obtener un tempToken,
 * y lo guarda en la tabla beds24_auth de Supabase.
 *
 * Requiere autenticación de administrador (sesión activa o PIN en body/cabecera).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { refreshToken, admin_pin } = body;

    // 1. Verificación de permisos de administrador (Sesión activa de admin o PIN)
    const session = await getSessionFromRequest(req);
    const isAdminSession = session?.role === 'admin';

    const headerPin = req.headers.get('x-admin-pin') || '';
    const providedPin = (admin_pin || headerPin || '').trim();

    if (!isAdminSession && !providedPin) {
      return NextResponse.json(
        { success: false, error: 'Acceso no autorizado: Se requiere sesión activa de administrador o PIN de administrador.' },
        { status: 401 }
      );
    }

    if (!isAdminSession && providedPin) {
      // Consultar el PIN de admin esperado en settings
      const { data: adminPinRow, error: pinFetchError } = await supabaseAdmin
        .from('settings')
        .select('value')
        .eq('key', 'pin_admin')
        .maybeSingle();

      if (pinFetchError) {
        console.error('[beds24 update-token] Error al validar PIN de admin:', pinFetchError.message);
        return NextResponse.json(
          { success: false, error: 'Error interno verificando credenciales.' },
          { status: 500 }
        );
      }

      const expectedPin = (process.env.ADMIN_PIN || adminPinRow?.value || '').trim();
      if (!expectedPin) {
        return NextResponse.json(
          { success: false, error: 'PIN de administrador no configurado en el sistema.' },
          { status: 500 }
        );
      }

      const expectedHash = crypto.createHash('sha256').update(expectedPin).digest();
      const providedHash = crypto.createHash('sha256').update(providedPin).digest();

      if (!crypto.timingSafeEqual(expectedHash, providedHash)) {
        return NextResponse.json(
          { success: false, error: 'PIN de administrador incorrecto. Acción denegada.' },
          { status: 403 }
        );
      }
    }

    // 2. Validar payload del refresh token
    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'refreshToken inválido o demasiado corto.' },
        { status: 400 }
      );
    }

    const cleanRefreshToken = refreshToken.trim();

    // 3. Intentar obtener un nuevo temp token con el refresh token proporcionado
    const tokenRes = await fetch('https://api.beds24.com/v2/authentication/token', {
      method: 'GET',
      headers: { 'refreshToken': cleanRefreshToken },
      cache: 'no-store',
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => String(tokenRes.status));
      console.error(`[beds24 update-token] Beds24 rechazó el refresh token: ${tokenRes.status} ${errText}`);
      return NextResponse.json(
        { success: false, error: `Beds24 rechazó el refresh token (${tokenRes.status}). Verifica que sea correcto y no haya espacios extras.` },
        { status: 400 }
      );
    }

    const tokenData = await tokenRes.json();

    if (!tokenData.token) {
      console.error('[beds24 update-token] Beds24 no devolvió token:', JSON.stringify(tokenData));
      return NextResponse.json(
        { success: false, error: 'Beds24 no devolvió un token válido. El refresh token podría ser incorrecto.' },
        { status: 400 }
      );
    }

    const newTempToken = tokenData.token as string;
    const newRefreshToken = (tokenData.refreshToken || tokenData.refresh_token || cleanRefreshToken) as string;

    // 4. Guardar en Supabase usando cliente administrativo
    const { error: upsertError } = await supabaseAdmin
      .from('beds24_auth')
      .upsert({
        id: 1,
        temp_token: newTempToken,
        refresh_token: newRefreshToken,
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      console.error('[beds24 update-token] Error al guardar en Supabase:', upsertError.message);
      return NextResponse.json(
        { success: false, error: `Token válido en Beds24 pero error al guardar: ${upsertError.message}` },
        { status: 500 }
      );
    }

    console.log('[beds24 update-token] ✅ Token de Beds24 actualizado con éxito.');

    return NextResponse.json({
      success: true,
      message: 'Token renovado y guardado correctamente en Supabase.',
    });

  } catch (err: any) {
    console.error('[beds24 update-token] Error inesperado:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
