import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendWhatsAppTextMessage, normalizePhone, cleanPhoneForMeta } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let targetPhone = body.phone ? String(body.phone).trim() : '';

    // Si no se pasó teléfono en el body, consultar el configurado en settings
    if (!targetPhone) {
      const { data: settingRow } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'admin_notification_phone')
        .maybeSingle();

      if (settingRow && settingRow.value) {
        targetPhone = String(settingRow.value).trim();
      }
    }

    if (!targetPhone) {
      targetPhone = process.env.OWNER_PERSONAL_PHONE || '529581168698';
    }

    const phones = targetPhone.split(',').map(p => p.trim()).filter(Boolean);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jaroje-app.vercel.app';
    const timestamp = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    const message = `🌴 *Jaroje - Notificación de Prueba* 🌴\n\n✅ *¡Tu teléfono está conectado al sistema de alertas!*\n\nRecibirás alertas instantáneas aquí cuando:\n1️⃣ Un cliente responda en el *WhatsApp Inbox*.\n2️⃣ Un cliente suba su comprobante de anticipo en *Por Aprobar*.\n\n📱 *Panel del Sistema:* ${siteUrl}\n⏰ *Hora de prueba:* ${timestamp}`;

    const results = [];
    for (const phone of phones) {
      const res = await sendWhatsAppTextMessage(phone, message);
      results.push({ phone, ...res });
    }

    const allSuccessful = results.every(r => r.success);
    const firstError = results.find(r => !r.success)?.error;

    if (!allSuccessful) {
      return NextResponse.json({
        success: false,
        error: firstError || 'Error al enviar alerta a uno o más teléfonos',
        results
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      message: `Alerta de prueba enviada con éxito a: ${phones.join(', ')}`,
      results
    });
  } catch (err: any) {
    console.error("[Test Alert] Error:", err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Error interno del servidor'
    }, { status: 500 });
  }
}
