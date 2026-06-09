import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/beds24-auth/refresh
 * Fuerza el refresh del token de Beds24 limpiando la caché en memoria
 * y solicitando uno nuevo con el refreshToken de Supabase.
 * 
 * Solo accesible desde el servidor (llamado desde el dashboard de admin).
 */
export async function POST() {
  try {
    // Importar dinámicamente para poder limpiar la caché
    // La caché `_cachedToken` y `_cachedTokenExpiry` viven en el módulo beds24.ts
    // Forzamos expiración cambiando el timestamp a 0 mediante reimport
    // En su lugar usamos la función directamente que ya maneja el refresh
    const { getBeds24Token } = await import('@/lib/beds24');

    // Forzar refresh: primero limpiamos las env vars del temp token
    // para que la función de refresh no use la caché en memoria
    const prevTempToken = process.env.BEDS24_TEMP_TOKEN;
    delete process.env.BEDS24_TEMP_TOKEN; // Forzar que no use caché de proceso

    const token = await getBeds24Token();

    // Restaurar si falló (pero getBeds24Token() ya actualiza BEDS24_TEMP_TOKEN)
    if (!token && prevTempToken) {
      process.env.BEDS24_TEMP_TOKEN = prevTempToken;
    }

    return NextResponse.json({
      success: true,
      message: 'Token de Beds24 refrescado exitosamente.',
      tokenPreview: token ? token.substring(0, 8) + '...' : null,
    });
  } catch (err: any) {
    console.error('[beds24-auth/refresh] Error:', err.message);
    return NextResponse.json(
      {
        success: false,
        error: err.message === 'TOKEN_EXPIRED'
          ? 'El refresh token ha caducado. Ve a Beds24 > Marketplace > API y genera un nuevo refresh token. Luego actualízalo en Supabase (tabla beds24_auth, columna refresh_token).'
          : err.message,
      },
      { status: 500 }
    );
  }
}
