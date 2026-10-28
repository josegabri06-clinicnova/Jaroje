import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { sendWhatsAppTextMessage } from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || (session.role !== 'admin' && session.role !== 'recepcion')) {
      return NextResponse.json({ success: false, error: 'No autorizado. Se requiere rol administrativo.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const phone = String(body.phone || '').trim();

    if (!phone) {
      return NextResponse.json({ success: false, error: 'Número de teléfono requerido' }, { status: 400 });
    }

    const testMessage = `🔔 *Hotel Condominio Jaroje - Prueba de Notificaciones*\n\nEste es un mensaje de confirmación para verificar que el canal de alertas y notificaciones administrativas está activo y configurado correctamente.\n\n⏰ Fecha: ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`;

    const result = await sendWhatsAppTextMessage(phone, testMessage);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'No se pudo enviar el mensaje por WhatsApp' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Alerta enviada correctamente', data: result.data });
  } catch (error: any) {
    console.error('Error en /api/whatsapp/test-alert:', error);
    return NextResponse.json({ success: false, error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
