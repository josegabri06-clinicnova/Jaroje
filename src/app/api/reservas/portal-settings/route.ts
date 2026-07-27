import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase'; // Service Role Key — bypasses RLS

export const dynamic = 'force-dynamic';

// PATCH /api/reservas/portal-settings
// Body: { bookingId: string, showCardPayment?: boolean, transferAccount?: string, language?: string, muteNotifications?: boolean }
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { bookingId, showCardPayment, transferAccount, language, muteNotifications } = body;

    if (!bookingId) {
      return NextResponse.json({ error: 'Falta bookingId' }, { status: 400 });
    }

    const upsertData: Record<string, unknown> = {
      booking_id: String(bookingId)
    };

    if (showCardPayment !== undefined) upsertData.show_card_payment = showCardPayment;
    if (transferAccount !== undefined) upsertData.transfer_account = transferAccount;
    if (language !== undefined) upsertData.language = language;
    if (muteNotifications !== undefined) upsertData.mute_notifications = muteNotifications;

    const { error } = await supabase
      .from('booking_portal_settings')
      .upsert(upsertData, { onConflict: 'booking_id' });

    if (error) {
      console.error('[portal-settings PATCH] Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Verificar lo que quedó guardado
    const { data: saved } = await supabase
      .from('booking_portal_settings')
      .select('booking_id, show_card_payment, transfer_account, language, mute_notifications')
      .eq('booking_id', String(bookingId))
      .maybeSingle();

    return NextResponse.json({ success: true, saved });
  } catch (e: any) {
    console.error('[portal-settings PATCH] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
