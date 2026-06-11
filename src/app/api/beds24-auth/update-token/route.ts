import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * POST /api/beds24-auth/update-token
 *
 * Recibe un nuevo refreshToken desde la UI (admin que lo pega desde Beds24 Marketplace > API),
 * lo usa inmediatamente para obtener un nuevo tempToken de Beds24,
 * y si tiene éxito guarda ambos en Supabase (tabla beds24_auth).
 *
 * Body: { refreshToken: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { refreshToken } = body;

    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'refreshToken inválido o demasiado corto.' },
        { status: 400 }
      );
    }

    const cleanRefreshToken = refreshToken.trim();

    // 1. Intentar obtener un nuevo temp token con el refresh token proporcionado
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
    // Beds24 puede devolver un nuevo refreshToken rotado — usar ese si viene, si no usar el que nos pasaron
    const newRefreshToken = (tokenData.refreshToken || tokenData.refresh_token || cleanRefreshToken) as string;

    // 2. Guardar en Supabase
    const { error: upsertError } = await supabase
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

    console.log('[beds24 update-token] ✅ Token actualizado y guardado en Supabase.');

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
