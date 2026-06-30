import { NextResponse } from 'next/server';
import {
  sendTemplate1_SolicitudRecibida,
  sendTemplate2_UltimoAviso,
  sendTemplate3_ReservacionConfirmada,
  sendTemplate4_PreparacionLlegada,
  sendTemplate5_BienvenidaCheckin,
  sendTemplate6_SeguimientoSatisfaccion,
  sendTemplate7_CheckoutManana,
  sendTemplate8_RecordatorioOpinion,
  sendTemplate9_RecordatorioEstanciaAnterior
} from '@/lib/whatsapp';

export async function POST(req: Request) {
  try {
    const { template, booking } = await req.json();

    if (!template || !booking) {
      return NextResponse.json({
        success: false,
        error: 'Faltan parámetros requeridos: template, booking'
      }, { status: 400 });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    if (!token || !phoneId) {
      return NextResponse.json({
        success: false,
        error: 'Credenciales de WhatsApp no configuradas en el servidor'
      }, { status: 500 });
    }

    let res: { success: boolean; error?: string; data?: any };

    switch (template) {
      case 'solicitud_recibida':
        res = await sendTemplate1_SolicitudRecibida(booking);
        break;
      case 'ultimo_aviso':
        res = await sendTemplate2_UltimoAviso(booking);
        break;
      case 'reservacion_confirmada':
        res = await sendTemplate3_ReservacionConfirmada(booking);
        break;
      case 'preparacion_llegada':
        res = await sendTemplate4_PreparacionLlegada(booking);
        break;
      case 'bienvenida_checkin':
        res = await sendTemplate5_BienvenidaCheckin(booking);
        break;
      case 'seguimiento_satisfaccion':
        res = await sendTemplate6_SeguimientoSatisfaccion(booking);
        break;
      case 'checkout_manana':
        res = await sendTemplate7_CheckoutManana(booking);
        break;
      case 'recordatorio_opinion':
        res = await sendTemplate8_RecordatorioOpinion(booking);
        break;
      case 'recordatorio_estancia_anterior':
        res = await sendTemplate9_RecordatorioEstanciaAnterior(booking);
        break;
      default:
        return NextResponse.json({
          success: false,
          error: `Plantilla desconocida: ${template}`
        }, { status: 400 });
    }

    if (!res.success) {
      console.error(`Error sending template ${template}:`, res.error);
      return NextResponse.json({
        success: false,
        error: res.error || 'Fallo de la API de Meta'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Plantilla ${template} enviada con éxito`,
      data: res.data
    });

  } catch (err: any) {
    console.error("Error en send-template:", err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Error interno del servidor'
    }, { status: 500 });
  }
}
