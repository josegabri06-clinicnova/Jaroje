import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { 
  checkAndProcessOtaGuestReplies, 
  sendOtaWelcomeMessage, 
  hasOtaMessageBeenSent,
  isOtaChannel,
  isDummyOrInvalidPhone,
  processOta20MinuteFallback
} from '@/lib/beds24-messages';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // Autenticación estricta de cron (Fail-Closed, comparación timing-safe). Solo CRON_SECRET:
    // SESSION_SECRET firma las sesiones y nunca debe usarse como token de cron.
    const expectedToken = process.env.CRON_SECRET?.trim();
    if (!expectedToken) {
      console.error('[Cron OTA Messages] CRON_SECRET no está configurado en el servidor. Rechazando por seguridad.');
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

    // FRENO DE EMERGENCIA GLOBAL (el mismo interruptor de Ajustes que usa el cron de WhatsApp)
    const { isWhatsAppAutomationsPaused } = await import('@/lib/whatsapp');
    if (await isWhatsAppAutomationsPaused()) {
      console.log('[Cron OTA Messages] FRENO DE EMERGENCIA ACTIVO: envíos automáticos pausados en Ajustes. Abortando cron.');
      return NextResponse.json({
        success: true,
        paused: true,
        message: 'Los envíos automáticos están pausados desde Ajustes por el administrador.',
        actions: ['Envíos automáticos pausados por configuración global.']
      });
    }

    const reports: string[] = [];

    // ─────────────────────────────────────────────────────────────────────────────
    // FASE 1: Procesar respuestas entrantes de huéspedes en OTAs
    // Revisa si algún huésped respondió en Airbnb, Booking o Expedia con su teléfono
    // ─────────────────────────────────────────────────────────────────────────────
    const replyResults = await checkAndProcessOtaGuestReplies();
    if (replyResults.upgradedCount > 0) {
      replyResults.details.forEach(d => {
        reports.push(`🎉 ¡Huésped ${d.guestName} (${d.channel}, ID: ${d.bookingId}) respondió su WhatsApp (${d.phone})! Se disparó plantilla de confirmación.`);
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // FASE 2: Enviar mensaje inicial a reservas OTA pendientes sin teléfono
    // ─────────────────────────────────────────────────────────────────────────────
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: pendingOtas, error: otaErr } = await supabase
      .from('beds24_reservations')
      .select('id, guest_name, channel, check_in, guest_phone, status')
      .in('channel', ['Booking.com', 'Airbnb', 'Expedia', 'Vrbo', 'Agoda'])
      .neq('status', 'cancelled')
      .neq('status', '0')
      .gte('check_in', fourteenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(20);

    let sentCount = 0;
    if (!otaErr && pendingOtas) {
      for (const res of pendingOtas) {
        const hasValidPhone = !isDummyOrInvalidPhone(res.guest_phone);
        if (hasValidPhone) continue;

        const alreadySent = await hasOtaMessageBeenSent(res.id, 'ota_welcome_request_phone');
        if (alreadySent) continue;

        const sendRes = await sendOtaWelcomeMessage({
          bookingId: res.id,
          guestName: res.guest_name,
          channel: res.channel
        });

        if (sendRes.success) {
          sentCount++;
          reports.push(`📩 Mensaje OTA solicitando WhatsApp enviado a ${res.guest_name} (${res.channel}, ID: ${res.id})`);
        } else {
          reports.push(`⚠️ Falló envío de mensaje OTA a ID ${res.id}: ${sendRes.error}`);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // FASE 3: Fallback de 20 minutos para Airbnb y Expedia
    // Si pasaron >20 min sin recibir el WhatsApp, envía automáticamente la plantilla
    // oficial de Meta con el enlace directo al Portal del Huésped
    // ─────────────────────────────────────────────────────────────────────────────
    const fallbackResults = await processOta20MinuteFallback();
    if (fallbackResults.fallbackSentCount > 0) {
      fallbackResults.details.forEach(d => {
        reports.push(`⏱️ Fallback de 20 min ejecutado para ${d.guestName} (${d.channel}, ID: ${d.bookingId}): enviada plantilla oficial '${d.template}'.`);
      });
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      repliesChecked: replyResults.processedCount,
      upgradedToWhatsApp: replyResults.upgradedCount,
      welcomeMessagesSent: sentCount,
      fallbacksChecked: fallbackResults.checkedCount,
      fallbacksSent: fallbackResults.fallbackSentCount,
      actions: reports
    });

  } catch (err: any) {
    console.error('[Cron OTA Messages] Error fatal:', err);
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}

