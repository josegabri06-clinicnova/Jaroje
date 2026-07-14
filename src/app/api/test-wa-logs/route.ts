import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone') || '';

    // Auto-corrección temporal de números de teléfono en base de datos para emparejar con Meta webhook id (521...)
    try {
      const { data: convsToFix } = await supabase
        .from('conversations')
        .select('id, guest_phone')
        .like('guest_phone', '52%');

      if (convsToFix) {
        for (const conv of convsToFix) {
          const raw = conv.guest_phone.replace(/\D/g, '');
          if (raw.length === 12 && !raw.startsWith('521')) {
            const fixedPhone = '521' + raw.substring(2);
            await supabase
              .from('conversations')
              .update({ guest_phone: fixedPhone })
              .eq('id', conv.id);
          }
        }
      }

      const { data: logsToFix } = await supabase
        .from('whatsapp_logs')
        .select('id, phone');

      if (logsToFix) {
        for (const log of logsToFix) {
          const raw = (log.phone || '').replace(/\D/g, '');
          if (raw.length === 12 && raw.startsWith('52') && !raw.startsWith('521')) {
            const fixedPhone = '521' + raw.substring(2);
            await supabase
              .from('whatsapp_logs')
              .update({ phone: fixedPhone })
              .eq('id', log.id);
          } else if (raw.length === 10) {
            const fixedPhone = '521' + raw;
            await supabase
              .from('whatsapp_logs')
              .update({ phone: fixedPhone })
              .eq('id', log.id);
          }
        }
      }
    } catch (dbFixErr) {
      console.error("Error auto-fixing DB phones:", dbFixErr);
    }

    // Query whatsapp_logs
    let logQuery = supabase.from('whatsapp_logs').select('*').order('sent_at', { ascending: false }).limit(20);
    if (phone) {
      logQuery = logQuery.eq('phone', phone);
    }
    const { data: logs, error: logErr } = await logQuery;

    // Query conversations
    let convQuery = supabase.from('conversations').select('*').order('timestamp', { ascending: false }).limit(10);
    if (phone) {
      convQuery = convQuery.eq('guest_phone', phone);
    }
    const { data: convs, error: convErr } = await convQuery;

    // Query webhook-debug from employee_logs
    const { data: debugLogs, error: debugErr } = await supabase
      .from('employee_logs')
      .select('*')
      .eq('employee_num', 'webhook-debug')
      .order('created_at', { ascending: false })
      .limit(20);

    // Query local_reservas for test names to see if they are in the database
    const { data: testLocalRes, error: localErr } = await supabase
      .from('local_reservas')
      .select('*')
      .or('guest_name.ilike.%rolando%,guest_name.ilike.%jose%');

    // Query Beds24 raw booking for diagnostics if test_booking_id is provided
    const testBookingId = searchParams.get('test_booking_id') || '';
    let b24BookingRaw = null;
    let b24BookingError = null;
    if (testBookingId) {
      try {
        const { getBeds24Token } = await import('@/lib/beds24');
        const token = await getBeds24Token();
        const b24Res = await fetch(`https://api.beds24.com/v2/bookings?id=${testBookingId}&includeInvoice=true`, {
          headers: { 'token': token },
          cache: 'no-store'
        });
        if (b24Res.ok) {
          b24BookingRaw = await b24Res.json();
        } else {
          b24BookingError = `Beds24 API returned status ${b24Res.status}`;
        }
      } catch (err: any) {
        b24BookingError = err.message;
      }
    }

    return NextResponse.json({
      success: true,
      logs,
      logError: logErr?.message,
      conversations: convs,
      convError: convErr?.message,
      webhookDebugLogs: debugLogs,
      webhookDebugError: debugErr?.message,
      localReservasTest: testLocalRes,
      localReservasError: localErr?.message,
      beds24BookingRaw: b24BookingRaw,
      beds24BookingError: b24BookingError
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
