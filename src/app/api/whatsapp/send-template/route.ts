import { NextResponse } from 'next/server';
import {
  sendTemplate1_SolicitudRecibida,
  sendTemplate2_UltimoAviso,
  sendTemplate3_ReservacionConfirmada,
  sendTemplate4_DisponibilidadLiberada,
  sendTemplate5_PreparacionLlegada,
  sendTemplate6_BienvenidaCheckin,
  sendTemplate7_SeguimientoSatisfaccion,
  sendTemplate8_SalidaCheckout,
  sendTemplate9_ComparteExperiencia,
  sendTemplate10_RecibimientoNuevamente,
  sendTemplate11_PagoAnticipoRecibido
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
      case 'disponibilidad_liberada':
        res = await sendTemplate4_DisponibilidadLiberada(booking);
        break;
      case 'preparacion_llegada':
        res = await sendTemplate5_PreparacionLlegada(booking);
        break;
      case 'bienvenida_checkin':
        res = await sendTemplate6_BienvenidaCheckin(booking);
        break;
      case 'seguimiento_satisfaccion':
        res = await sendTemplate7_SeguimientoSatisfaccion(booking);
        break;
      case 'checkout_manana':
      case 'salida_checkout':
        res = await sendTemplate8_SalidaCheckout(booking);
        break;
      case 'recordatorio_opinion':
      case 'comparte_experiencia':
        res = await sendTemplate9_ComparteExperiencia(booking);
        break;
      case 'recordatorio_estancia_anterior':
      case 'recibimiento_nuevamente':
        res = await sendTemplate10_RecibimientoNuevamente(booking);
        break;
      case 'pago_anticipo_recibido':
        res = await sendTemplate11_PagoAnticipoRecibido(booking);
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
