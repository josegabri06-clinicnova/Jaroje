import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { normalizePhone, sendTemplate_Cotizacion, sendWhatsAppCTAButtonMessage, isSpanishOrLatamPhone } from '@/lib/whatsapp';
import { rateLimitResponse } from '@/lib/public-rate-limit';
import { checkBookingWindow } from '@/lib/booking-window';
import { getBeds24Token, getAverageRatesForDates, getChildRoomId } from '@/lib/beds24';
import { publicRates } from '@/lib/beds24-public-cache';
import { RatesUnavailableError, assertRatesLoaded, getMissingRateNights } from '@/lib/rates-guard';

export const dynamic = 'force-dynamic';

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

function formatEnglishDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[parseInt(m, 10) - 1] || m;
    return `${monthName} ${parseInt(d, 10)}, ${y}`;
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
    // Envía un WhatsApp al número indicado: se limita por IP (20 cotizaciones / 15 min)
    const limited = await rateLimitResponse(req, 'cotizacion', { max: 20, windowMs: 15 * 60_000, lockMs: 15 * 60_000 });
    if (limited) return limited;

    const body = await req.json();
    const {
      phone,
      lang: clientLang,
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

    const reqLang: 'es' | 'en' = (clientLang === 'en' || (!isSpanishOrLatamPhone(cleanPhone) && clientLang !== 'es')) ? 'en' : 'es';
    const isEn = reqLang === 'en';

    // Mapeo oficial de habitaciones
    const ROOM_CAT_MAP: Record<string, { roomId: string; name: string; name_en: string }> = {
      'doble': { roomId: '679077', name: 'Habitación Doble', name_en: 'Double Room' },
      '1rec': { roomId: '679087', name: 'Condominio de 1 dormitorio', name_en: '1-Bedroom Condominium' },
      '2rec': { roomId: '679091', name: 'Condominio de 2 dormitorios', name_en: '2-Bedroom Condominium' },
      '3rec': { roomId: '679092', name: 'Condominio de 3 dormitorios', name_en: '3-Bedroom Condominium' },
      'casa': { roomId: '679093', name: 'Casa de Lujo', name_en: 'Luxury House' }
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
    // Mismos límites que la página (200 adultos / 100 niños): un tope menor recortaba huéspedes y con ello los extras cobrados.
    // Lo que supere la capacidad máxima de las habitaciones elegidas se rechaza más abajo.
    const cleanAdults = Math.max(1, Math.min(200, parseInt(String(adults || 2), 10) || 2));
    const cleanChildren = Math.max(0, Math.min(100, parseInt(String(children || 0), 10) || 0));
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
    // Los extras NO suman personas: son los huéspedes declarados que exceden la capacidad estándar de las habitaciones
    // elegidas (huéspedes - capacidad base), con tope en el máximo permitido. El valor enviado por el navegador se ignora.
    const maxExtrasAllowed = Math.max(0, totalMaxCapacity - totalBaseCapacity);
    const extraGuests = Math.min(Math.max(0, totalGuests - totalBaseCapacity), maxExtrasAllowed);
    const effectiveAdults = cleanAdults;
    const effectiveGuests = totalGuests;
    const extraGuestsFee = extraGuests * 500 * nights;

    // Obtener token y mapa oficial de tarifas de Beds24 junto con pricing_unit_settings en paralelo
    const token = await getBeds24Token();

    const [beds24RatesMap, dynamicSettings] = await Promise.all([
      (async () => {
        try {
          return await publicRates(token, cleanCheckIn, cleanCheckOut);
        } catch (tokenErr) {
          console.warn("[Cotizacion API] Failed to fetch Beds24 calendar rates:", tokenErr);
          return {} as Record<string, Record<string, number>>;
        }
      })(),
      (async () => {
        try {
          const { data: settingsData } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'pricing_unit_settings')
            .maybeSingle();
          if (settingsData?.value) {
            return typeof settingsData.value === 'string' ? JSON.parse(settingsData.value) : settingsData.value;
          }
        } catch (errSettings) {
          console.warn("[Cotizacion API] Error loading pricing_unit_settings:", errSettings);
        }
        return null as any;
      })()
    ]);

    assertRatesLoaded(beds24RatesMap);

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
      // Se cotiza siempre el precio vigente (Beds24/Supabase, con descuentos); solo se rechaza un precio inválido
      if (!(officialPricePerNight > 0)) throw new RatesUnavailableError();
      const verifiedPricePerNight = officialPricePerNight;
      const itemSubtotal = verifiedPricePerNight * nights * r.quantity;
      baseLodgingTotal += itemSubtotal;

      return {
        key: r.key,
        name: cat.name,
        name_en: cat.name_en,
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
      adults: effectiveAdults,
      children: cleanChildren,
      totalGuests: effectiveGuests,
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
        role_bot: `🎉 ¡Cotización generada! Total: $${finalTotal.toLocaleString()} MXN (50% anticipo: $${finalDeposit.toLocaleString()} MXN). Pendiente de formalizar.`,
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

    // 2. Enviar por WhatsApp la plantilla oficial Meta 'cotizacion_reserva' (bypasea ventana de 24h)
    const roomsText = sanitizedRooms.map((r: any) => {
      const itemSub = (r.pricePerNight * nights * r.quantity);
      const roomDisplayName = isEn ? (r.name_en || r.name) : r.name;
      if (isEn) {
        return `• ${r.quantity} × ${roomDisplayName}\n  $${r.pricePerNight.toLocaleString()} MXN × ${nights} ${nights === 1 ? 'night' : 'nights'} = $${itemSub.toLocaleString()} MXN`;
      }
      return `• *${r.quantity}x ${roomDisplayName}*\n  $${r.pricePerNight.toLocaleString()} MXN / noche × ${nights} ${nights === 1 ? 'noche' : 'noches'} = $${itemSub.toLocaleString()} MXN`;
    }).join('\n\n');

    const checkInFormatted = isEn ? formatEnglishDate(cleanCheckIn) : formatSpanishDate(cleanCheckIn);
    const checkOutFormatted = isEn ? formatEnglishDate(cleanCheckOut) : formatSpanishDate(cleanCheckOut);
    const nightsText = isEn 
      ? `${nights} ${nights === 1 ? 'night' : 'nights'}` 
      : `${nights} ${nights === 1 ? 'noche' : 'noches'}`;
    const guestsText = isEn
      ? `${effectiveGuests} (${effectiveAdults} ${effectiveAdults === 1 ? 'adult' : 'adults'}${cleanChildren > 0 ? `, ${cleanChildren} ${cleanChildren === 1 ? 'child' : 'children'}` : ''})`
      : `${effectiveGuests} personas (${effectiveAdults} adultos${cleanChildren > 0 ? `, ${cleanChildren} niños` : ''})`;
    const extrasText = isEn
      ? (extraGuests > 0 
          ? `${extraGuests} extra ${extraGuests === 1 ? 'guest' : 'guests'} × $500 MXN × ${nights} ${nights === 1 ? 'night' : 'nights'} = $${extraGuestsFee.toLocaleString()} MXN\n⚠️ Important: Extra beds are not available, and the living room sofa is in a non-air-conditioned area.`
          : '0 extra guests (included in base capacity at no charge)')
      : (extraGuests > 0 
          ? `${extraGuests} adicionales ($500 MXN / noche × ${extraGuests} pers. × ${nights} noches = $${extraGuestsFee.toLocaleString()} MXN)\n⚠️ *Nota importante:* No contamos con camas adicionales, el sillón de la sala NO cuenta con aire acondicionado.`
          : '0 adicionales (incluidas en capacidad base sin costo)');
    const desgloseSubtotalText = isEn
      ? (extraGuestsFee > 0
          ? `• Accommodation subtotal: $${baseLodgingTotal.toLocaleString()} MXN\n• Additional guest fees: $${extraGuestsFee.toLocaleString()} MXN`
          : `• Accommodation subtotal: $${baseLodgingTotal.toLocaleString()} MXN`)
      : (extraGuestsFee > 0
          ? `• Subtotal hospedaje: $${baseLodgingTotal.toLocaleString()} MXN\n• Suplemento adicionales: $${extraGuestsFee.toLocaleString()} MXN`
          : `• Subtotal hospedaje: $${baseLodgingTotal.toLocaleString()} MXN`);
    const totalAmountText = `$${finalTotal.toLocaleString()} MXN`;
    const depositText = `$${finalDeposit.toLocaleString()} MXN`;
    const balanceText = `$${balanceRemaining.toLocaleString()} MXN`;

    const roomsParam = sanitizedRooms.map((r: any) => `${r.key}:${r.quantity}`).join(',');
    const reserveQuerySuffix = `?phone=${cleanPhone}&checkIn=${cleanCheckIn}&checkOut=${cleanCheckOut}&adults=${effectiveAdults}&children=${cleanChildren}&rooms=${encodeURIComponent(roomsParam)}&extras=${extraGuests}&action=reserve&step=confirm${isEn ? '&lang=en' : ''}`;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jaroje-app.vercel.app';
    const fallbackReserveUrl = `${siteUrl}/public/reservar${reserveQuerySuffix}`;

    const fallbackFullText = isEn
      ? `(Subject to availability)

✅ *Jaroje Member Rate Applied*

📅 *Stay Dates*
Check-in: ${checkInFormatted}
Check-out: ${checkOutFormatted}
Total: ${nightsText}

👥 *Guests:* ${guestsText}

🛏️ *Selected Accommodations:*
${roomsText}

👤 *Additional Guests:*
${extrasText}

💰 *PRICE SUMMARY:*
${desgloseSubtotalText}
• *Total (taxes included):* ${totalAmountText}

💳 *Payment Details:*
• *Deposit to confirm (50%):* ${depositText}
• *Balance due at check-in:* ${balanceText}

📌 *Rates and availability are subject to change until your reservation is confirmed.*`
      : `*(Sujeta a disponibilidad a la hora de Reservar)*

✅ *Tarifa de Miembro Jaroje aplicada*

📅 *Check in:* ${checkInFormatted}
	*Check out:* ${checkOutFormatted} (${nightsText})

👥 *Huéspedes:* ${guestsText}

🛏️ *Alojamientos seleccionados:*
${roomsText}

👤 *Personas adicionales:* ${extrasText}

💰 *DESGLOSE TOTAL:*
${desgloseSubtotalText}
• *Total de la estancia (impuestos incluidos):* ${totalAmountText}
• *Anticipo requerido para apartar (50%):* ${depositText}
• *Saldo restante al check-in (50%):* ${balanceText}`;

    let waResult: any = { success: false };
    try {
      console.log(`[Cotizacion API] Enviando cotización oficial por WhatsApp [${isEn ? 'en' : 'es'}] a ${cleanPhone}...`);
      waResult = await sendTemplate_Cotizacion(cleanPhone, {
        checkInFormatted,
        checkOutFormatted,
        nightsText,
        guestsText,
        roomsText,
        extrasText,
        desgloseSubtotalText,
        totalAmountText,
        depositText,
        balanceText,
        reserveQuerySuffix,
        fallbackFullText,
        fallbackReserveUrl,
        lang: isEn ? 'en' : 'es'
      });
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
