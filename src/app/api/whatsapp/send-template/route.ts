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
  sendTemplate11_PagoAnticipoRecibido,
  sendTemplate_BienvenidoConmutador,
  sendTemplate_BienvenidoWhatsApp
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

    let activeBooking = { ...booking };
    if (!activeBooking.phone && !activeBooking.mobile && !activeBooking.guest_phone && !activeBooking.guestPhone && activeBooking.id) {
      try {
        const { supabase } = require('@/lib/supabase');
        const { normalizePhone } = await import('@/lib/whatsapp');
        const bIdStr = String(activeBooking.id).trim();
        
        const { data: dbRes } = await supabase
          .from('beds24_reservations')
          .select('guest_phone, phone, guest_name')
          .eq('id', bIdStr)
          .maybeSingle();

        if (dbRes?.guest_phone || dbRes?.phone) {
          activeBooking.phone = normalizePhone(dbRes.guest_phone || dbRes.phone, '');
          if (!activeBooking.guest_name && dbRes.guest_name) {
            activeBooking.guest_name = dbRes.guest_name;
          }
        } else {
          const { data: locRes } = await supabase
            .from('local_reservas')
            .select('phone, guest_name')
            .eq('id', bIdStr)
            .maybeSingle();
          if (locRes?.phone) {
            activeBooking.phone = normalizePhone(locRes.phone, '');
            if (!activeBooking.guest_name && locRes.guest_name) {
              activeBooking.guest_name = locRes.guest_name;
            }
          }
        }
      } catch (ePhone) {
        console.warn("[send-template] Error fetching fallback phone from DB:", ePhone);
      }
    }

    const provider = process.env.WHATSAPP_PROVIDER || 'ycloud';

    if (provider === 'ycloud') {
      const ycloudApiKey = process.env.YCLOUD_API_KEY;
      if (!ycloudApiKey) {
        return NextResponse.json({
          success: false,
          error: 'Credenciales de YCloud (YCLOUD_API_KEY) no configuradas en el servidor'
        }, { status: 500 });
      }
    } else {
      const token = process.env.WHATSAPP_TOKEN;
      const phoneId = process.env.WHATSAPP_PHONE_ID;

      if (!token || !phoneId) {
        return NextResponse.json({
          success: false,
          error: 'Credenciales de WhatsApp Meta no configuradas en el servidor'
        }, { status: 500 });
      }
    }

    let res: { success: boolean; error?: string; data?: any };

    switch (template) {
      case 'solicitud_recibida':
        res = await sendTemplate1_SolicitudRecibida(activeBooking, true);
        break;
      case 'ultimo_aviso':
        res = await sendTemplate2_UltimoAviso(activeBooking, true);
        break;
      case 'reservacion_confirmada':
        res = await sendTemplate3_ReservacionConfirmada(activeBooking, true);
        break;
      case 'disponibilidad_liberada':
        res = await sendTemplate4_DisponibilidadLiberada(activeBooking, true);
        break;
      case 'preparacion_llegada':
        res = await sendTemplate5_PreparacionLlegada(activeBooking, true);
        break;
      case 'bienvenida_checkin':
        res = await sendTemplate6_BienvenidaCheckin(activeBooking, true);
        break;
      case 'seguimiento_satisfaccion':
        res = await sendTemplate7_SeguimientoSatisfaccion(activeBooking, true);
        break;
      case 'checkout_manana':
      case 'salida_checkout':
        res = await sendTemplate8_SalidaCheckout(activeBooking, true);
        break;
      case 'recordatorio_opinion':
      case 'comparte_experiencia':
        res = await sendTemplate9_ComparteExperiencia(activeBooking, true);
        break;
      case 'recordatorio_estancia_anterior':
      case 'recibimiento_nuevamente':
        res = await sendTemplate10_RecibimientoNuevamente(activeBooking, true);
        break;
      case 'pago_anticipo_recibido':
        res = await sendTemplate11_PagoAnticipoRecibido(activeBooking, true);
        break;
      case 'bienvenido_cliente_final_v2': {
        const ph = activeBooking.phone || activeBooking.mobile || activeBooking.guest_phone || '';
        res = await sendTemplate_BienvenidoConmutador(ph, activeBooking.guest_name);
        break;
      }
      case 'bienvenido_cliente_whatsaap': {
        const ph = activeBooking.phone || activeBooking.mobile || activeBooking.guest_phone || '';
        res = await sendTemplate_BienvenidoWhatsApp(ph, activeBooking.guest_name);
        break;
      }
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

    // Persistir banderas de estado en Supabase al enviar plantillas clave
    try {
      const { supabase } = require('@/lib/supabase');
      const bookingIdStr = String(booking.id || '');
      
      // Heurística inicial de si es local
      let isLocal = Boolean(booking.isLocal) || 
                    bookingIdStr.startsWith('loc_') || 
                    bookingIdStr.startsWith('walkin_') || 
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingIdStr) || 
                    bookingIdStr.length < 7;

      // Verificación directa en BD para mayor robustez (cubre reservas auto-sincronizadas en local_reservas con IDs numéricos)
      try {
        const { data: dbLocalRow } = await supabase
          .from('local_reservas')
          .select('id')
          .eq('id', bookingIdStr)
          .maybeSingle();
        if (dbLocalRow) {
          isLocal = true;
        }
      } catch (dbCheckErr) {
        console.error("[send-template] Error verificando existencia local en Supabase:", dbCheckErr);
      }

      const memberIds: string[] = (Array.isArray(booking.group_members) && booking.group_members.length > 0)
        ? booking.group_members.map((m: any) => String(m.id))
        : [bookingIdStr];

      for (const mId of memberIds) {
        let mIsLocal = Boolean(booking.isLocal) || 
                       mId.startsWith('loc_') || 
                       mId.startsWith('walkin_') || 
                       /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mId) || 
                       mId.length < 7;

        if (template === 'solicitud_recibida' || template === 'reservacion_confirmada') {
          if (mIsLocal) {
            await supabase.from('local_reservas').update({ is_acknowledged: true }).eq('id', mId);
          } else {
            await supabase.from('beds24_reservations').upsert({ id: mId, is_acknowledged: true });
          }
        } else if (template === 'ultimo_aviso') {
          if (mIsLocal) {
            await supabase.from('local_reservas').update({ last_notice_sent: true, is_acknowledged: true }).eq('id', mId);
          } else {
            await supabase.from('beds24_reservations').upsert({ id: mId, last_notice_sent: true, is_acknowledged: true });
          }
          // Insertar en whatsapp_logs para cada miembro del grupo
          await supabase.from('whatsapp_logs').insert([{
            reservation_id: mId,
            template_name: 'ultimo_aviso',
            phone: booking.phone || booking.mobile || booking.guest_phone || '',
            sent_at: new Date().toISOString(),
            status: 'sent'
          }]);
        }
      }
    } catch (dbUpdateErr: any) {
      console.error("[send-template] Error actualizando banderas en Supabase:", dbUpdateErr);
      return NextResponse.json({
        success: false,
        error: `Estado enviado pero falló persistencia en base de datos: ${dbUpdateErr.message || dbUpdateErr}`
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
