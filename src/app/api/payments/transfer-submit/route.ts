import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { grantGuestAccess, normalizeBookingId, guestFileUrl, isGuestAuthorized } from '@/lib/guest-auth';
import { resolveB24Alias } from '@/lib/guest-phone';
import { filesProxyUrl } from '@/lib/storage-files';
import { sendWhatsAppTextMessage } from '@/lib/whatsapp';
import { checkGuestAccess, verificationRequiredResponse } from '@/lib/guest-access';
import { rateLimitResponse } from '@/lib/public-rate-limit';
import { maskPhone } from '@/lib/log-mask';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // Ruta pública que escribe en la base, guarda archivos y envía WhatsApp: se limita por IP (20 envíos / 15 min)
    const limited = await rateLimitResponse(req, 'transfer-submit', { max: 20, windowMs: 15 * 60_000, lockMs: 15 * 60_000 });
    if (limited) return limited;

    const formData = await req.formData();
    const bookingId = formData.get('bookingId') as string;
    const amount = formData.get('amount') as string;
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const notes = formData.get('notes') as string;
    const file = formData.get('file') as File;

    if (!bookingId || !amount || !file) {
      return NextResponse.json({ error: 'Faltan datos obligatorios (bookingId, amount, file)' }, { status: 400 });
    }

    // Validación de monto
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0 || numericAmount > 500000) {
      return NextResponse.json({ error: 'El monto ingresado es inválido.' }, { status: 400 });
    }

    // Validación de ID de reserva: el mismo número normalizado que usa el portal, para comprobar y actuar sobre la misma reserva
    const guestId = normalizeBookingId(bookingId);
    if (!guestId) {
      return NextResponse.json({ error: 'Identificador de reserva con formato inválido.' }, { status: 400 });
    }

    // Solo quien verificó los 4 últimos dígitos (o el personal) puede subir un comprobante a una reserva con teléfono.
    // Un número que no existe tampoco tiene teléfono, así que además se exige que la reserva exista.
    const access = await checkGuestAccess(req, guestId);
    if (!access.allowed) {
      // El portal pudo abrirse con el número de Beds24 de esta misma reserva local: vale esa cookie
      const alias = await resolveB24Alias(guestId);
      if (!(alias && (await isGuestAuthorized(req, alias)))) return verificationRequiredResponse();
    }
    if (access.reason === 'no_phone' && !access.bookingFound) {
      return NextResponse.json({ error: 'Reserva no encontrada.' }, { status: 404 });
    }

    // Validación de tamaño de archivo (máx 10 MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'El comprobante excede el tamaño máximo permitido (10 MB).' }, { status: 400 });
    }

    // Validación de tipo de archivo permitido
    const ALLOWED_MIME_TYPES = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/pdf'
    ];
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
      return NextResponse.json({ 
        error: 'Formato no permitido. Solo se aceptan imágenes (JPG, PNG, WEBP) o documentos PDF.' 
      }, { status: 400 });
    }

    // 1. Subir el archivo a Supabase Storage en el bucket "transfer-receipts"
    const rawExt = file.name ? file.name.split('.').pop()?.toLowerCase() : 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'heic'].includes(rawExt || '') ? rawExt : 'jpg';
    const filePath = `${guestId}_${Date.now()}.${safeExt}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('transfer-receipts')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) {
      console.error("[Submit Transfer] Storage upload error:", uploadError);
      return NextResponse.json({ error: 'Error al guardar el comprobante en almacenamiento.' }, { status: 500 });
    }

    // 2. Enlace que se guarda en la base de datos: el del servidor (/api/files), nunca uno público o firmado de almacenamiento
    const publicUrl = filesProxyUrl('transfer-receipts', filePath);

    // 3. Registrar en la tabla "transfer_receipts" de Supabase
    const { data: dbData, error: dbError } = await supabase
      .from('transfer_receipts')
      .insert({
        booking_id: guestId,
        amount: Number(amount),
        guest_name: name || 'Invitado',
        guest_email: email || null,
        receipt_url: publicUrl,
        status: 'pending',
        notes: notes || null
      })
      .select()
      .single();

    if (dbError) {
      console.error("[Submit Transfer] DB insert error:", dbError);
      return NextResponse.json({ error: 'Error al registrar la transferencia en base de datos.' }, { status: 500 });
    }

    // 4. Datos del pago, para el aviso interno y el mensaje al huésped.
    // A Gerencia ya NO se le envía WhatsApp (se enviaba al mismo número que envía las plantillas y Meta lo rechazaba):
    // el registro de abajo activa la campana y el sonido en el panel, y el huésped y el equipo reciben las plantillas de cada paso.
    const cleanGuestName = name || 'Invitado';

    const formPaymentType = (formData.get('paymentType') as string || '').toLowerCase().trim();
    const formTotal = Number(formData.get('total') || 0);
    const formLang = (formData.get('lang') as string || 'es').toLowerCase().trim();
    const notesStr = String(notes || '').toUpperCase();

    const isExplicitAnticipo = formPaymentType === 'anticipo' || notesStr.includes('ANTICIPO');
    const isExplicitTotal = formPaymentType === 'total' || notesStr.includes('TOTAL (100%)');

    // Registrar log en employee_logs para activar campana y toast sonoro en el Dashboard en tiempo real
    try {
      await supabase
        .from('employee_logs')
        .insert([{
          employee_num: 'guest-portal',
          employee_name: String(cleanGuestName).slice(0, 50),
          department: 'recepcion',
          module: 'reservas',
          action: 'transfer_receipt_submitted',
          details: `Comprobante de ${isExplicitTotal ? 'pago total (100%)' : (isExplicitAnticipo ? 'anticipo (50%)' : 'abono')} subido por $${Number(amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN para Reserva #${guestId}. Pendiente en pestaña Por Aprobar.`,
          created_at: new Date().toISOString()
        }]);
    } catch (logErr) {
      console.error("[Submit Transfer] Error registrando employee_log:", logErr);
    }

    // 5. Obtener teléfono y detalles de la reserva para enviar notificación por WhatsApp.
    // El teléfono sale SOLO de la reserva guardada: el que llegue en el formulario se ignora (permitiría enviar mensajes a cualquier número).
    const { normalizePhone } = await import('@/lib/whatsapp');
    let guestPhone = '';
    let dbGuestName = name || 'Huésped';
    let reservationTotal = formTotal > 0 ? formTotal : 0;
    let reservationDeposit = 0;
    let checkInDate = '';
    let checkOutDate = '';
    let groupCount = 1;

    // A. Buscar en beds24_reservations de Supabase
    try {
      const { data: b24Db } = await supabase
        .from('beds24_reservations')
        .select('guest_phone, guest_name, price, deposit, check_in, check_out')
        .eq('id', guestId)
        .maybeSingle();

      if (b24Db) {
        if (!guestPhone) guestPhone = normalizePhone(b24Db.guest_phone || '');
        if (b24Db.guest_name && (dbGuestName === 'Invitado' || dbGuestName === 'Huésped' || !dbGuestName)) {
          dbGuestName = b24Db.guest_name;
        }
        if (!reservationTotal) reservationTotal = Number(b24Db.price || 0);
        reservationDeposit = Number(b24Db.deposit || 0);
        checkInDate = b24Db.check_in || '';
        checkOutDate = b24Db.check_out || '';
      }
    } catch (err) {
      console.warn("[Submit Transfer] Error leyendo beds24_reservations:", err);
    }

    // B. Buscar en local_reservas de Supabase si no se encontró
    if (!guestPhone || !reservationTotal) {
      try {
        const { data: localRes } = await supabase
          .from('local_reservas')
          .select('phone, guest_name, price, deposit, check_in, check_out')
          .eq('id', Number(guestId))
          .maybeSingle();

        if (localRes) {
          if (!guestPhone) guestPhone = normalizePhone(localRes.phone || '');
          if (localRes.guest_name && (dbGuestName === 'Invitado' || dbGuestName === 'Huésped' || !dbGuestName)) {
            dbGuestName = localRes.guest_name;
          }
          if (!reservationTotal) reservationTotal = Number(localRes.price || 0);
          if (!reservationDeposit) reservationDeposit = Number(localRes.deposit || 0);
          if (!checkInDate) checkInDate = localRes.check_in || '';
          if (!checkOutDate) checkOutDate = localRes.check_out || '';
        }
      } catch (err) {}
    }

    // C. Fallback a Beds24 API si todavía no tenemos teléfono
    if (!guestPhone) {
      try {
        const { getBeds24Token } = await import('@/lib/beds24');
        const BEDS24_TOKEN = await getBeds24Token();
        const b24Res = await fetch(`https://api.beds24.com/v2/bookings?id=${guestId}`, {
          headers: { 'token': BEDS24_TOKEN }
        });
        if (b24Res.ok) {
          const b24Json = await b24Res.json();
          const b = Array.isArray(b24Json?.data) ? b24Json.data[0] : (Array.isArray(b24Json) ? b24Json[0] : null);
          if (b) {
            guestPhone = normalizePhone(b.phone || b.mobile || b.guestPhone || '', b.country2 || b.country || b.guestCountry2 || b.guestCountry);
            if (dbGuestName === 'Invitado' || dbGuestName === 'Huésped' || !dbGuestName) {
              dbGuestName = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : (b.guestName || dbGuestName);
            }
            if (!reservationTotal) reservationTotal = Number(b.price || 0);
            if (!reservationDeposit) reservationDeposit = Number(b.deposit || 0);
            if (!checkInDate) checkInDate = b.arrival || '';
            if (!checkOutDate) checkOutDate = b.departure || '';
          }
        }
      } catch (waLookupErr) {
        console.error("[Submit Transfer] Error buscando teléfono en Beds24:", waLookupErr);
      }
    }

    // D. Consolidar totales si pertenece a un grupo de condominios
    if (checkInDate && checkOutDate) {
      try {
        const { data: siblings } = await supabase
          .from('beds24_reservations')
          .select('id, price, deposit, status, guest_name, guest_phone')
          .eq('check_in', checkInDate)
          .eq('check_out', checkOutDate);

        if (siblings && siblings.length > 1) {
          const targetName = String(dbGuestName || '').trim().toLowerCase();
          const targetPhone = String(guestPhone || '').trim();
          const grp = siblings.filter(s => {
            const sName = String(s.guest_name || '').trim().toLowerCase();
            const sPhone = String(s.guest_phone || '').trim();
            const matchesGuest = (sName && targetName && (sName.includes(targetName) || targetName.includes(sName))) ||
                                 (sPhone && targetPhone && (sPhone.includes(targetPhone) || targetPhone.includes(sPhone)));
            if (!matchesGuest) return false;
            // Incluir si es la misma reserva o no está cancelada
            return String(s.id) === guestId || (String(s.status) !== '0' && s.status !== 'cancelled');
          });

          if (grp.length > 1) {
            groupCount = grp.length;
            const groupSumPrice = grp.reduce((sum, item) => sum + Number(item.price || 0), 0);
            if (groupSumPrice > reservationTotal) {
              reservationTotal = groupSumPrice;
            }
            reservationDeposit = grp.reduce((sum, item) => sum + Number(item.deposit || 0), 0);
            console.log(`[Submit Transfer] Grupo detectado (${groupCount} condominios). Total: $${reservationTotal}, Depósito: $${reservationDeposit}`);
          }
        }
      } catch (grpLookupErr) {
        console.warn("[Submit Transfer] Error detecting group in submit:", grpLookupErr);
      }
    }

    if (formTotal > 0 && formTotal > reservationTotal) {
      reservationTotal = formTotal;
    }

    // Enviar mensaje de confirmación de captura recibida al huésped si tenemos su número
    if (guestPhone) {
      const isCard = notesStr.includes('TARJETA') || notesStr.includes('MERCADO PAGO') || notesStr.includes('MERPAGO');
      const isWise = notesStr.includes('WISE');
      const isPayPal = notesStr.includes('PAYPAL');
      const isEnglish = formLang === 'en';

      const methodLabel = isCard 
        ? 'pago con tarjeta / Mercado Pago' 
        : (isWise ? 'pago vía Wise' : (isPayPal ? 'pago vía PayPal' : 'transferencia'));

      const methodLabelEn = isCard
        ? 'card / Mercado Pago payment'
        : (isWise ? 'Wise payment' : (isPayPal ? 'PayPal payment' : 'bank transfer'));

      const currLabel = (isWise || isPayPal || String(dbGuestName).toUpperCase().includes('(US DOLLARS)')) ? 'USD' : 'MXN';
      const numAmount = Number(amount || 0);
      const remainingBalance = Math.max(0, reservationTotal - reservationDeposit);

      // Determinar con certeza si es pago total (100%) o anticipo (50% u otro parcial)
      let isFullPayment = false;
      if (isExplicitAnticipo) {
        isFullPayment = false;
      } else if (isExplicitTotal) {
        isFullPayment = true;
      } else if (reservationTotal > 0) {
        // Solo si no fue explícito: requiere cubrir el saldo restante o al menos el 95% del total
        isFullPayment = (remainingBalance > 0 && numAmount >= remainingBalance) || numAmount >= reservationTotal * 0.95;
      }

      const refText = groupCount > 1 
        ? `tu grupo de reservaciones (${groupCount} condominios, ref: #${guestId})` 
        : `tu reserva #${guestId}`;

      const refTextEn = groupCount > 1
        ? `your group booking (${groupCount} condos, ref: #${guestId})`
        : `your reservation #${guestId}`;

      let guestNotificationBody = '';
      if (isEnglish) {
        guestNotificationBody = isFullPayment
          ? `Hello, ${dbGuestName}! We have received your ${methodLabelEn} receipt for $${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${currLabel} for the full payment (100%) of ${refTextEn}.\n\nOur team is reviewing it (this process may take up to 24 hours). We will notify you here once it is approved to confirm that your stay is fully paid. Thank you!`
          : `Hello, ${dbGuestName}! We have received your ${methodLabelEn} receipt for $${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${currLabel} as a deposit for ${refTextEn}.\n\nOur team is reviewing it (this process may take up to 24 hours). We will notify you here once it is approved to confirm your reservation. Thank you!`;
      } else {
        guestNotificationBody = isFullPayment
          ? `¡Hola, ${dbGuestName}! Hemos recibido tu comprobante de ${methodLabel} por $${numAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${currLabel} para el pago total (100%) de ${refText}.\n\nNuestro equipo lo está validando (este proceso puede tardar hasta 24 horas). Te notificaremos por este medio tan pronto como esté aprobado para confirmarte que tu estancia ha quedado totalmente liquidada. ¡Muchas gracias!`
          : `¡Hola, ${dbGuestName}! Hemos recibido tu comprobante de ${methodLabel} por $${numAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${currLabel} como anticipo para ${refText}.\n\nNuestro equipo lo está validando (este proceso puede tardar hasta 24 horas). Te notificaremos por este medio tan pronto como esté aprobado para confirmar tu reservación. ¡Muchas gracias!`;
      }

      console.log(`[Submit Transfer] Sending automated receipt notification to guest: ${maskPhone(guestPhone)} (isFullPayment: ${isFullPayment}, group: ${groupCount}, paymentType: ${formPaymentType || 'inferred'})`);
      await sendWhatsAppTextMessage(guestPhone, guestNotificationBody);
    }

    // Al huésped solo se le devuelve el enlace propio de su reserva; el registro se devuelve sin el enlace de almacenamiento
    const { receipt_url: _storedUrl, ...safeRecord } = (dbData || {}) as any;
    const okRes = NextResponse.json({
      success: true,
      receiptUrl: guestFileUrl(guestId, 'transfer', publicUrl, String(dbData?.id ?? '')),
      record: safeRecord
    });
    await grantGuestAccess(okRes, guestId); // quien sube su comprobante queda autorizado en este dispositivo
    return okRes;

  } catch (err: any) {
    console.error("[Submit Transfer] Exception handler:", err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
