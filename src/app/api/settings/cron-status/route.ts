import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const t0 = Date.now();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      waLogsRes,
      waCountRes,
      otaLogsRes,
      otaCountRes,
      settingsRes
    ] = await Promise.all([
      supabase
        .from('whatsapp_logs')
        .select('id, reservation_id, template_name, phone, sent_at, status')
        .order('sent_at', { ascending: false })
        .limit(6),
      supabase
        .from('whatsapp_logs')
        .select('id', { count: 'exact', head: true })
        .gte('sent_at', twentyFourHoursAgo),
      supabase
        .from('ota_messages_log')
        .select('id, booking_id, channel, guest_name, message, template_type, status, created_at')
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('ota_messages_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', twentyFourHoursAgo),
      supabase
        .from('settings')
        .select('value')
        .eq('key', 'disable_automatic_whatsapp')
        .maybeSingle()
    ]);

    const isPaused = Boolean(
      settingsRes.data?.value === true ||
      settingsRes.data?.value === 'true' ||
      settingsRes.data?.value === 1 ||
      settingsRes.data?.value === '1'
    );

    const latencyMs = Date.now() - t0;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      latencyMs,
      whatsapp: {
        status: isPaused ? 'paused' : 'active',
        cadence: 'Cada 5 minutos',
        sent24h: waCountRes.count || 0,
        recentLogs: waLogsRes.data || [],
        isPaused
      },
      ota: {
        status: isPaused ? 'paused' : 'active',
        cadence: 'Cada 5 minutos',
        actions24h: otaCountRes.count || 0,
        recentLogs: otaLogsRes.data || []
      },
      cleanup: {
        status: 'scheduled',
        cadence: 'Diario 11:00 PM Huatulco (05:00 UTC)',
        schedule: '0 5 * * *',
        description: 'Purga automática de identificaciones y recibos > 1 año'
      },
      analytics: {
        status: 'scheduled',
        cadence: 'Diario 10:00 PM Huatulco (04:00 UTC)',
        schedule: '0 4 * * *',
        description: 'Sincronización histórica y balance de analítica Beds24'
      }
    });
  } catch (err: any) {
    console.error('[API Cron Status] Error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Error consultando estado de crons' }, { status: 500 });
  }
}
