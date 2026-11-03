import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { 
  checkAndProcessOtaGuestReplies, 
  sendOtaWelcomeMessage, 
  hasOtaMessageBeenSent,
  isOtaChannel
} from '@/lib/beds24-messages';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const cronToken = searchParams.get('token');
    const authHeader = req.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET || process.env.SESSION_SECRET;

    // Autenticación de seguridad si hay token configurado
    if (expectedToken) {
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
      const provided = cronToken || bearerToken;
      if (provided !== expectedToken) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
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
        const hasPhone = Boolean(res.guest_phone && res.guest_phone !== 'null' && res.guest_phone !== 'undefined');
        if (hasPhone) continue;

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

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      repliesChecked: replyResults.processedCount,
      upgradedToWhatsApp: replyResults.upgradedCount,
      welcomeMessagesSent: sentCount,
      actions: reports
    });

  } catch (err: any) {
    console.error('[Cron OTA Messages] Error fatal:', err);
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
