import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { syncBeds24ReservationsRange } from '@/lib/beds24';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // 1. Autenticación estricta de cron (Fail-Closed con comparación timing-safe)
    const expectedToken = process.env.CRON_SECRET?.trim();
    if (!expectedToken) {
      console.error("[Cron Analytics Sync] ⚠️ CRON_SECRET no está configurado en el servidor. Rechazando por seguridad.");
      return NextResponse.json({ success: false, error: 'Server configuration error: CRON_SECRET is required' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const authHeader = req.headers.get('authorization') || '';
    const cronToken = (
      req.headers.get('x-cron-secret') || 
      authHeader.replace(/^bearer\s+/i, '').trim() ||
      searchParams.get('token') ||
      ''
    ).trim();

    const expectedHash = crypto.createHash('sha256').update(expectedToken).digest();
    const providedHash = crypto.createHash('sha256').update(cronToken).digest();

    if (!cronToken || !crypto.timingSafeEqual(expectedHash, providedHash)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Calcular rango de fechas dinámico YoY
    const currentYear = new Date().getFullYear();
    const fromDateStr = `${currentYear - 2}-01-01`; // Hace 2 años (ej. si hoy es 2026, desde 2024-01-01)
    const toDateStr = `${currentYear + 1}-12-31`;   // 1 año adelante (ej. hasta 2027-12-31)

    console.log(`[Cron Analytics Sync] Iniciando ejecución programada para rango: ${fromDateStr} - ${toDateStr}`);

    // 3. Ejecutar sincronización masiva
    const result = await syncBeds24ReservationsRange(fromDateStr, toDateStr);

    return NextResponse.json({ success: true, count: result.count, from: fromDateStr, to: toDateStr });
  } catch (err: any) {
    console.error("[Cron Analytics Sync] Error general en ejecución de cron:", err);
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
