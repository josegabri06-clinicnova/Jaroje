import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizePhone, sendWhatsAppTextMessage, sendTemplate_ConfirmarReserva } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * POST /api/public/cotizacion
 * Guarda la cotización de fechas y habitaciones seleccionadas por el huésped en el portal,
 * envía por WhatsApp el desglose detallado con costo por noche y personas extras,
 * e inmediatamente despacha la plantilla oficial 'confirmar_reserva' con el botón interactivo
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

    // Reglas de capacidad base y máxima por categoría
    const ROOM_BASE_CAPACITIES: Record<string, number> = {
      'doble': 4,
      '1rec': 4,
      '2rec': 6,
      '3rec': 10,
      'casa': 12
    };
    const ROOM_MAX_CAPACITIES: Record<string, number> = {
      'doble': 4,
      '1rec': 4,
      '2rec': 8,
      '3rec': 12,
      'casa': 16
    };

    const totalGuests = Number(adults || 0) + Number(children || 0);
    let totalBaseCapacity = 0;
    let totalMaxCapacity = 0;

    rooms.forEach((r: any) => {
      const qty = Number(r.quantity || 1);
      totalBaseCapacity += (ROOM_BASE_CAPACITIES[r.key] || 2) * qty;
      totalMaxCapacity += (ROOM_MAX_CAPACITIES[r.key] || 4) * qty;
    });

    if (totalGuests > totalMaxCapacity) {
      return NextResponse.json({
        success: false,
        error: `Ha seleccionado ${totalGuests} huéspedes pero la ocupación máxima de las habitaciones seleccionadas es ${totalMaxCapacity}.`
      }, { status: 400 });
    }

    const cleanCheckIn = String(checkIn || '').split('T')[0].split(' ')[0].trim();
    const cleanCheckOut = String(checkOut || '').split('T')[0].split(' ')[0].trim();
    const dIn = new Date(`${cleanCheckIn}T00:00:00Z`);
    const dOut = new Date(`${cleanCheckOut}T00:00:00Z`);
    const diffTime = dOut.getTime() - dIn.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0 || isNaN(diffDays) || cleanCheckIn >= cleanCheckOut) {
      return NextResponse.json({ success: false, error: 'La fecha de check-out debe ser posterior a la fecha de check-in (mínimo 1 noche).' }, { status: 400 });
    }

    const nights = diffDays;

    // Cálculo exacto de personas adicionales ($500 MXN / noche)
    const extraGuests = totalGuests > totalBaseCapacity
      ? Math.min(totalGuests - totalBaseCapacity, Math.max(0, totalMaxCapacity - totalBaseCapacity))
      : 0;
    const extraGuestsFee = extraGuests * 500 * nights;

    let baseLodgingTotal = 0;
    rooms.forEach((r: any) => {
      const pNight = Number(r.pricePerNight || 0);
      const qty = Number(r.quantity || 1);
      const itemSubtotal = r.totalPrice ? Number(r.totalPrice) * qty : (pNight * nights * qty);
      baseLodgingTotal += itemSubtotal;
    });

    const calculatedGrandTotal = baseLodgingTotal + extraGuestsFee;
    const finalTotal = totalAmount && Number(totalAmount) > 0 ? Number(totalAmount) : calculatedGrandTotal;
    const finalDeposit = depositRequired && Number(depositRequired) > 0 ? Number(depositRequired) : Math.round(finalTotal * 0.5);
    const balanceRemaining = finalTotal - finalDeposit;

    const quoteId = `Q_${Date.now()}`;
    const nowIso = new Date().toISOString();

    const quoteData = {
      quoteId,
      phone: cleanPhone,
      checkIn,
      checkOut,
      nights,
      adults: Number(adults),
      children: Number(children),
      totalGuests,
      rooms,
      baseLodgingTotal,
      extraGuests,
      extraGuestsFee,
      totalAmount: finalTotal,
      depositRequired: finalDeposit,
      balanceRemaining,
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
        role_bot: `🎉 ¡Cotización generada! Folio: #${quoteId}. Total: $${finalTotal.toLocaleString()} MXN (50% anticipo: $${finalDeposit.toLocaleString()} MXN). Pendiente de nombre completo.`,
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

    // 2. Enviar por WhatsApp el resumen completo con desglose detallado
    const roomsText = rooms.map((r: any) => {
      const pNight = Number(r.pricePerNight || 0);
      const qty = Number(r.quantity || 1);
      const itemSub = (pNight * nights * qty);
      return `• *${qty}x ${r.name}*\n  $${pNight.toLocaleString()} MXN / noche × ${nights} ${nights === 1 ? 'noche' : 'noches'} = $${itemSub.toLocaleString()} MXN`;
    }).join('\n');

    const whatsappSummaryText =
`🏨 *COTIZACIÓN OFICIAL — CONDOMINIOS JAROJE*
Santa Cruz Huatulco, Oaxaca
Folio: *#${quoteId}*

✅ *Tarifa de Miembro Jaroje aplicada*

📅 *Fechas:* ${checkIn} al ${checkOut} (${nights} ${nights === 1 ? 'noche' : 'noches'})
👥 *Huéspedes:* ${totalGuests} personas (${adults} adultos${children > 0 ? `, ${children} niños` : ''})

🛏️ *Alojamientos seleccionados:*
${roomsText}

👤 *Personas adicionales:* ${extraGuests > 0 ? `${extraGuests} adicionales ($500 MXN / noche × ${extraGuests} pers. × ${nights} noches = $${extraGuestsFee.toLocaleString()} MXN)` : '0 adicionales (incluidas en capacidad base sin costo)'}
${extraGuests > 0 ? `⚠️ *Nota importante:* No contamos con camas adicionales, el sillón de la sala NO cuenta con aire acondicionado.\n` : ''}
💰 *DESGLOSE TOTAL:*
• Subtotal hospedaje (IVA e ISH incluidos): $${baseLodgingTotal.toLocaleString()} MXN
${extraGuestsFee > 0 ? `• Suplemento adicionales: $${extraGuestsFee.toLocaleString()} MXN\n` : ''}• *Total de la estancia (impuestos incluidos):* $${finalTotal.toLocaleString()} MXN
• *Anticipo requerido para apartar (50%):* $${finalDeposit.toLocaleString()} MXN
• Saldo restante al check-in (50%): $${balanceRemaining.toLocaleString()} MXN

🔒 *Garantía de bloqueo por 24 horas:*
Tus habitaciones quedarán formalmente apartadas por 24 horas en nuestro sistema en cuanto pulses el botón de abajo e ingreses tu nombre completo 👇`;

    try {
      console.log(`[Cotizacion API] Enviando resumen detallado de cotización por WhatsApp a ${cleanPhone}...`);
      await sendWhatsAppTextMessage(cleanPhone, whatsappSummaryText);
    } catch (msgErr) {
      console.warn("[Cotizacion API] Aviso enviando texto de resumen (posible ventana de 24h cerrada):", msgErr);
    }

    // 3. Disparar al instante la plantilla oficial 'confirmar_reserva' de WhatsApp
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
      message: 'Cotización guardada exitosamente y enviada a WhatsApp'
    });

  } catch (err: any) {
    console.error("[Cotizacion API] Excepción no controlada:", err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error procesando la cotización' },
      { status: 500 }
    );
  }
}
