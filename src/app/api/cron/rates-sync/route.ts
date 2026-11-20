import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { syncRatesFromBeds24 } from '@/lib/rates-mirror';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cron: copia a Supabase las tarifas del calendario de Beds24 (hoy -> ~1 año). Unas 5 consultas de 1 crédito cada 6 horas.
 * Con esa copia el portal de venta y las cotizaciones muestran precios sin consultar a Beds24.
 */
export async function GET(req: Request) {
  try {
    // Autenticación estricta de cron (Fail-Closed con comparación timing-safe)
    const expectedToken = process.env.CRON_SECRET?.trim();
    if (!expectedToken) {
      console.error('[Cron Rates Sync] ⚠️ CRON_SECRET no está configurado en el servidor. Rechazando por seguridad.');
      return NextResponse.json({ success: false, error: 'Server configuration error: CRON_SECRET is required' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const cronToken = (
      req.headers.get('x-cron-secret') ||
      authHeader.replace(/^bearer\s+/i, '').trim() ||
      ''
    ).trim();

    const expectedHash = crypto.createHash('sha256').update(expectedToken).digest();
    const providedHash = crypto.createHash('sha256').update(cronToken).digest();

    if (!cronToken || !crypto.timingSafeEqual(expectedHash, providedHash)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await syncRatesFromBeds24();
    if (!result.ok) console.warn(`[Cron Rates Sync] ${result.failedChunks} tramo(s) sin actualizar de ${result.calls}.`);
    return NextResponse.json({ success: result.ok, ...result });
  } catch (err) {
    console.error('[Cron Rates Sync] Error:', (err as Error)?.message);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
