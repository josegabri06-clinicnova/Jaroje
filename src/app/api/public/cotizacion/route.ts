import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizePhone, sendWhatsAppCTAButtonMessage } from '@/lib/whatsapp';
import { checkBookingWindow } from '@/lib/booking-window';
import { getBeds24Token, fetchBeds24RatesMap, getAverageRatesForDates, getChildRoomId } from '@/lib/beds24';
import { RatesUnavailableError, assertRatesLoaded, getMissingRateNights } from '@/lib/rates-guard';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function formatSpanishDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const monthName = months[parseInt(m, 10) - 1] || m;
    return `${parseInt(d, 10)} ${monthName} ${y}`;
  } catch {
    return dateStr;
  }
}

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

    // Mapeo oficial de habitaciones
    const ROOM_CAT_MAP: Record<string, { roomId: string; name: string }> = {
      'doble': { roomId: '679077', name: 'Habitación Doble' },
      '1rec': { roomId: '679087', name: 'Condominio de 1 dormitorio' },
      '2rec': { roomId: '679091', name: 'Condominio de 2 dormitorios' },
      '3rec': { roomId: '679092', name: 'Condominio de 3 dormitorios' },
      'casa': { roomId: '679093', name: 'Casa de Lujo' }
    };

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

    // Sanitización estricta de huéspedes
    const cleanAdults = Math.max(1, Math.min(30, parseInt(String(adults || 2), 10) || 2));
    const cleanChildren = Math.max(0, Math.min(20, parseInt(String(children || 0), 10) || 0));
    const totalGuests = cleanAdults + cleanChildren;

    // Filtrar habitaciones con cantidad entera válida
    const validRooms = (Array.isArray(rooms) ? rooms : [])
      .map((r: any) => ({
        key: String(r.key || '').trim(),
        quantity: Math.max(0, Math.min(10, parseInt(String(r.quantity || 0), 10) || 0))
      }))
      .filter((r: any) => r.quantity > 0 && Boolean(ROOM_CAT_MAP[r.key]));

    if (validRooms.length === 0) {
      return NextResponse.json({ success: false, error: 'Debes seleccionar al menos una habitación válida' }, { status: 400 });
    }

    let totalBaseCapacity = 0;
    let totalMaxCapacity = 0;

    validRooms.forEach((r: any) => {
      totalBaseCapacity += (ROOM_BASE_CAPACITIES[r.key] || 2) * r.quantity;
      totalMaxCapacity += (ROOM_MAX_CAPACITIES[r.key] || 4) * r.quantity;
    });

    if (totalGuests > totalMaxCapacity) {
      return NextResponse.json({
        success: false,
        error: `Ha seleccionado ${totalGuests} huéspedes pero la ocupación máxima de las habitaciones seleccionadas es ${totalMaxCapacity}.`
      }, { status: 400 });
    }

    const cleanCheckIn = String(checkIn || '').split('T')[0].split(' ')[0].trim();
    const cleanCheckOut = String(checkOut || '').split('T')[0].split(' ')[0].trim();

    const todayStr = new Date().toISOString().split('T')[0];
    if (cleanCheckIn < todayStr) {
      return NextResponse.json({ success: false, error: 'La fecha de check-in no puede ser anterior a hoy' }, { status: 400 });
    }

    const dIn = new Date(`${cleanCheckIn}T00:00:00Z`);
    const dOut = new Date(`${cleanCheckOut}T00:00:00Z`);
    const diffTime = dOut.getTime() - dIn.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0 || isNaN(diffDays) || cleanCheckIn >= cleanCheckOut) {
      return NextResponse.json({ success: false, error: 'La fecha de check-out debe ser posterior a la fecha de check-in (mínimo 1 noche).' }, { status: 400 });
    }

    if (diffDays > 45) {
      return NextResponse.json({ success: false, error: 'Para estancias mayores a 45 noches, por favor contacta a administración directamente.' }, { status: 400 });
    }

    const nights = diffDays;

    const windowCheck = checkBookingWindow(cleanCheckIn, cleanCheckOut);
    if (!windowCheck.ok) {
      return NextResponse.json({ success: false, error: windowCheck.error, code: 'OUT_OF_BOOKING_WINDOW' }, { status: 400 });
    }

    // Cálculo exacto de personas adicionales ($500 MXN / noche) en servidor
    const extraGuests = totalGuests > totalBaseCapacity
      ? Math.min(totalGuests - totalBaseCapacity, Math.max(0, totalMaxCapacity - totalBaseCapacity))
      : 0;
    const extraGuestsFee = extraGuests * 500 * nights;

    // Obtener token y mapa oficial de tarifas de Beds24
    let beds24RatesMap: Record<string, Record<string, number>> = {};
    try {
      const token = await getBeds24Token();
      beds24RatesMap = await fetchBeds24RatesMap(token, cleanCheckIn, cleanCheckOut);
    } catch (tokenErr) {
      console.warn("[Cotizacion API] Failed to fetch Beds24 calendar rates:", tokenErr);
    }
    assertRatesLoaded(beds24RatesMap);

    let dynamicSettings: any = null;
    try {
      const { data: settingsData } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'pricing_unit_settings')
        .maybeSingle();
      if (settingsData?.value) {
        dynamicSettings = typeof settingsData.value === 'string' ? JSON.parse(settingsData.value) : settingsData.value;
      }
    } catch (errSettings) {
      console.warn("[Cotizacion API] Error loading pricing_unit_settings:", errSettings);
    }

    const MINIMUM_FLOOR_PRICES: Record<string, number> = {
      'doble': 900,
      '1rec': 900,
      '2rec': 1800,
      '3rec': 2500,
      'casa': 3500
    };

    let baseLodgingTotal = 0;
    const sanitizedRooms = validRooms.map(r => {
      const cat = ROOM_CAT_MAP[r.key];
      const missingNights = getMissingRateNights(beds24RatesMap, cat.roomId, '1', cleanCheckIn, cleanCheckOut);
      if (missingNights.length > 0) {
        console.error(`[Cotizacion API] Sin tarifa en Beds24 para ${cat.name} en: ${missingNights.join(', ')}. Cotización rechazada para evitar precio incorrecto.`);
        throw new RatesUnavailableError();
      }
      const childId = getChildRoomId(cat.roomId, '1') || cat.roomId;
      const basePricePerNight = getAverageRatesForDates(
        childId,
        cleanCheckIn,
        cleanCheckOut,
        'Directo',
        beds24RatesMap,
        '1',
        dynamicSettings
      );
      const TAX_MULTIPLIER = 1.19; // IVA 16% + ISH 3%
      const officialPricePerNight = Math.round(basePricePerNight * TAX_MULTIPLIER);
      const minFloor = MINIMUM_FLOOR_PRICES[r.key] || 900;
      const verifiedPricePerNight = Math.max(officialPricePerNight, minFloor);
      const itemSubtotal = verifiedPricePerNight * nights * r.quantity;
      baseLodgingTotal += itemSubtotal;

      return {
        key: r.key,
        name: cat.name,
        quantity: r.quantity,
        pricePerNight: verifiedPricePerNight,
        totalPrice: verifiedPricePerNight * nights
      };
    });

    const calculatedGrandTotal = baseLodgingTotal + extraGuestsFee;
    const finalTotal = calculatedGrandTotal;
    const finalDeposit = Math.round(finalTotal * 0.5);
    const balanceRemaining = finalTotal - finalDeposit;

    const quoteId = `Q_${Date.now()}`;
    const nowIso = new Date().toISOString();

    const quoteData = {
      quoteId,
      phone: cleanPhone,
      checkIn: cleanCheckIn,
      checkOut: cleanCheckOut,
      nights,
      adults: cleanAdults,
      children: cleanChildren,
      totalGuests,
      rooms: sanitizedRooms,
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

    // 2. Enviar por WhatsApp el resumen completo con desglose detallado y botón interactivo CTA
    const roomsText = sanitizedRooms.map((r: any) => {
      const itemSub = (r.pricePerNight * nights * r.quantity);
      return `• *${r.quantity}x ${r.name}*\n  $${r.pricePerNight.toLocaleString()} MXN / noche × ${nights} ${nights === 1 ? 'noche' : 'noches'} = $${itemSub.toLocaleString()} MXN`;
    }).join('\n');

    const checkInFormatted = formatSpanishDate(cleanCheckIn);
    const checkOutFormatted = formatSpanishDate(cleanCheckOut);
    const roomsParam = sanitizedRooms.map((r: any) => `${r.key}:${r.quantity}`).join(',');
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jaroje-app.vercel.app';
    const reserveUrl = `${siteUrl}/public/reservar?phone=${cleanPhone}&checkIn=${cleanCheckIn}&checkOut=${cleanCheckOut}&adults=${cleanAdults}&children=${cleanChildren}&rooms=${encodeURIComponent(roomsParam)}&extras=${extraGuests}&quoteId=${quoteId}&action=reserve&step=confirm`;

    const whatsappSummaryText =
`*(Sujeta a disponibilidad a la hora de Reservar)*
Folio: *#${quoteId}*

✅ *Tarifa de Miembro Jaroje aplicada*

📅 *Check in:* ${checkInFormatted}
	*Check out:* ${checkOutFormatted} (${nights} ${nights === 1 ? 'noche' : 'noches'})

👥 *Huéspedes:* ${totalGuests} personas (${adults} adultos${children > 0 ? `, ${children} niños` : ''})

🛏️ *Alojamientos seleccionados:*
${roomsText}

👤 *Personas adicionales:* ${extraGuests > 0 ? `${extraGuests} adicionales ($500 MXN / noche × ${extraGuests} pers. × ${nights} noches = $${extraGuestsFee.toLocaleString()} MXN)` : '0 adicionales (incluidas en capacidad base sin costo)'}
${extraGuests > 0 ? `⚠️ *Nota importante:* No contamos con camas adicionales, el sillón de la sala NO cuenta con aire acondicionado.\n` : ''}
💰 *DESGLOSE TOTAL:*
• Subtotal hospedaje: $${baseLodgingTotal.toLocaleString()} MXN
${extraGuestsFee > 0 ? `• Suplemento adicionales: $${extraGuestsFee.toLocaleString()} MXN\n` : ''}• *Total de la estancia (impuestos incluidos):* $${finalTotal.toLocaleString()} MXN
• *Anticipo requerido para apartar (50%):* $${finalDeposit.toLocaleString()} MXN
• Saldo restante al check-in (50%): $${balanceRemaining.toLocaleString()} MXN`;

    let waResult: any = { success: false };
    try {
      console.log(`[Cotizacion API] Enviando cotización oficial interactiva a ${cleanPhone}...`);
      waResult = await sendWhatsAppCTAButtonMessage(
        cleanPhone,
        whatsappSummaryText,
        '¡¡¡ RESERVA YA !!!',
        reserveUrl,
        '🏨 COTIZACIÓN Condominios Jaroje',
        'Sujeta a disponibilidad al momento de reservar'
      );
      console.log(`[Cotizacion API] Resultado envío WhatsApp:`, waResult);
    } catch (waErr: any) {
      console.error("[Cotizacion API] Error enviando cotización por WhatsApp:", waErr);
    }

    return NextResponse.json({
      success: true,
      quoteId,
      quoteData,
      waSent: waResult?.success ?? false,
      message: 'Cotización guardada exitosamente y enviada a WhatsApp'
    });

  } catch (err: any) {
    if (err instanceof RatesUnavailableError) {
      return NextResponse.json({ success: false, error: err.message, code: 'RATES_UNAVAILABLE' }, { status: 503 });
    }
    console.error("[Cotizacion API] Excepción no controlada:", err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error procesando la cotización' },
      { status: 500 }
    );
  }
}
