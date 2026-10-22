import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizePhone, sendTemplate_ConfirmarReserva } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * POST /api/public/cotizacion
 * Guarda la cotización de fechas y habitaciones seleccionadas por el huésped en el portal,
 * e inmediatamente despacha la plantilla de WhatsApp 'confirmar_reserva' con el botón interactivo
 * 'Confirmar Reserva' para que el huésped regrese a ingresar su nombre completo y formalizar.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      phone,
      checkIn,
      checkOut,
      adults = 2,
      children = 0,
      rooms = [],
      totalAmount = 0,
      depositRequired = 0
    } = body;

    if (!phone) {
      return NextResponse.json({ success: false, error: 'Se requiere el número de teléfono/WhatsApp' }, { status: 400 });
    }

    if (!checkIn || !checkOut || !Array.isArray(rooms) || rooms.length === 0) {
      return NextResponse.json({ success: false, error: 'Datos incompletos de fechas o habitaciones' }, { status: 400 });
    }

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone === 'desconocido') {
      return NextResponse.json({ success: false, error: 'Formato de teléfono no válido' }, { status: 400 });
    }

    const quoteId = `Q_${Date.now()}`;
    const nowIso = new Date().toISOString();

    const quoteData = {
      quoteId,
      phone: cleanPhone,
      checkIn,
      checkOut,
      adults: Number(adults),
      children: Number(children),
      rooms,
      totalAmount: Number(totalAmount),
      depositRequired: Number(depositRequired),
      status: 'pending_name',
      createdAt: nowIso
    };

    // 1. Guardar la cotización en la conversación de este teléfono
    try {
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('*')
        .eq('guest_phone', cleanPhone)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      const quoteMessage = {
        role_guest: null,
        role_bot: `🎉 ¡Cotización generada! Folio: ${quoteId}. Total: $${Number(totalAmount).toLocaleString()} MXN (50% anticipo: $${Number(depositRequired).toLocaleString()} MXN). Pendiente de nombre completo.`,
        role_manager: null,
        quote_data: quoteData,
        timestamp: nowIso
      };

      if (existingConv) {
        const updatedMessages = [...(existingConv.messages || []), quoteMessage];
        await supabase
          .from('conversations')
          .update({
            messages: updatedMessages,
            timestamp: nowIso
          })
          .eq('id', existingConv.id);
      } else {
        await supabase
          .from('conversations')
          .insert({
            id: `wa_${Date.now()}`,
            guest_name: 'Cliente Cotización',
            guest_phone: cleanPhone,
            timestamp: nowIso,
            booking_created: false,
            resolved: false,
            human_mode: false,
            messages: [quoteMessage]
          });
      }
    } catch (dbErr) {
      console.error("[Cotizacion API] Error guardando cotización en BD:", dbErr);
    }

    // 2. Disparar al instante la plantilla oficial 'confirmar_reserva' de WhatsApp
    let waResult: any = { success: false };
    try {
      console.log(`[Cotizacion API] Disparando plantilla 'confirmar_reserva' para ${cleanPhone}...`);
      waResult = await sendTemplate_ConfirmarReserva(cleanPhone);
      console.log(`[Cotizacion API] Resultado envío confirmar_reserva:`, waResult);
    } catch (waErr: any) {
      console.error("[Cotizacion API] Error enviando confirmar_reserva por WhatsApp:", waErr);
    }

    return NextResponse.json({
      success: true,
      quoteId,
      quoteData,
      waSent: waResult?.success ?? false,
      message: 'Cotización guardada exitosamente y confirmación enviada a WhatsApp'
    });

  } catch (err: any) {
    console.error("[Cotizacion API] Excepción no controlada:", err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error procesando la cotización' },
      { status: 500 }
    );
  }
}
