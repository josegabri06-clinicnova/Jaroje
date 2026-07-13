import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone') || '';

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

    return NextResponse.json({
      success: true,
      logs,
      logError: logErr?.message,
      conversations: convs,
      convError: convErr?.message,
      webhookDebugLogs: debugLogs,
      webhookDebugError: debugErr?.message
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
