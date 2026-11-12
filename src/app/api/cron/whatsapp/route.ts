import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getBeds24Bookings, getBeds24Token, clearBeds24Cache, areBookingsInSameGroup, extractPhoneFromBookingData, updateBeds24BookingPhone } from '@/lib/beds24';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { deleteCancelledReservationFinances } from '@/lib/finances';
import {
  normalizePhone,
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
  sendTemplate_AlojamientoListo,
  sendTemplate_Recordatorio7Dias,
  detectLanguageFromPhone
} from '@/lib/whatsapp';
import { isOtaChannel, sendOfficialOtaTemplate, isDummyOrInvalidPhone } from '@/lib/beds24-messages';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Hasta 5 minutos de ejecución continua en Vercel Pro

// Limpia y normaliza el número de habitación (por ejemplo, extrae "401" de "Casa Vacacional de 3 dormitorios (401)")
function getCleanRoom(roomName: string, roomField: string): string {
  const parenMatch = String(roomName || '').match(/\((\d{3})\)/);
  if (parenMatch) return parenMatch[1];
  const digitMatch = String(roomName || '').match(/\b(\d{3})\b/);
  if (digitMatch) return digitMatch[1];
  const rawDigits = String(roomField || roomName || '').replace(/[^0-9]/g, '');
  if (rawDigits.length > 3) {
    return rawDigits.substring(rawDigits.length - 3);
  }
  return rawDigits;
}

// Obtener la hora actual en formato GMT-6 (Huatulco, México) de manera robusta
function getMexicoHour(): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    hour: 'numeric',
    hour12: false
  });
  return Number(formatter.format(new Date()));
}

// Obtener la fecha en formato YYYY-MM-DD para México con un desplazamiento de días
function getMexicoDateStr(offsetDays = 0): string {
  const date = new Date();
  if (offsetDays !== 0) {
    date.setDate(date.getDate() + offsetDays);
  }
  const formatter = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

export async function GET(req: Request) {
  try {
    // 0. Autenticación estricta de cron (Fail-Closed con comparación timing-safe)
    const expectedToken = process.env.CRON_SECRET?.trim();
    if (!expectedToken) {
      console.error("[Cron WhatsApp] ⚠️ CRON_SECRET no está configurado en el servidor. Rechazando por seguridad.");
      return NextResponse.json({ success: false, error: 'Server configuration error: CRON_SECRET is required' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const cronToken = (
      req.headers.get('x-cron-secret') || 
      authHeader.replace(/^bearer\s+/i, '').trim() ||
      ''
    ).trim();

    const expectedHash = crypto.createHash('sha256').update(expectedToken).digest();
    const providedHash = crypto.createHash('sha256').update(cronToken).digest();

    if (!cronToken || !crypto.timingSafeEqual(expectedHash, providedHash)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 0.1. FRENO DE EMERGENCIA GLOBAL: Verificar si los envíos automáticos están pausados por el administrador
    const { isWhatsAppAutomationsPaused } = await import('@/lib/whatsapp');
    if (await isWhatsAppAutomationsPaused()) {
      console.log("[Cron WhatsApp] ⏸️ FRENO DE EMERGENCIA ACTIVO: Envíos automáticos pausados en Ajustes (disable_automatic_whatsapp: true). Abortando cron.");
      return NextResponse.json({
        success: true,
        paused: true,
        message: '⏸️ FRENO DE EMERGENCIA: Los envíos automáticos de WhatsApp se encuentran pausados desde Ajustes por el administrador.',
        reports: ['Envíos automáticos pausados por configuración global.']
      });
    }

    // 1. (La tabla whatsapp_logs ya existe y se gestiona solo desde Supabase: el cron no ejecuta SQL.)

    // 2. Obtener reservaciones de Beds24
    const beds24Reservas = await getBeds24Bookings(true, false, false, 'cron:whatsapp');

    // 3. Obtener reservaciones locales de Supabase
    const { data: localRes } = await supabase
      .from('local_reservas')
      .select('*')
      .neq('status', 'cancelled');

    const UNIT_TO_ROOM: Record<string, string> = {
      '1': '500', '2': '501', '3': '502', '4': '503',
      '5': '504', '6': '505', '7': '506', '8': '507'
    };
    const UNIT_TO_ROOM_600: Record<string, string> = {
      '1': '601', '2': '602', '3': '603', '4': '604',
      '5': '605', '6': '606', '7': '607'
    };

    const mappedLocal = (localRes || []).map((b: any) => {
      const is600 = String(b.room_id) === '685543';
      const physicalName = b.unit_id 
        ? (is600 ? (UNIT_TO_ROOM_600[String(b.unit_id)] || String(b.unit_id)) : (UNIT_TO_ROOM[String(b.unit_id)] || String(b.unit_id)))
        : '';
      const roomLabel = is600 ? 'Condominio' : 'Habitación';
      const arrivalDate = b.check_in ? new Date(b.check_in) : null;
      const departureDate = b.check_out ? new Date(b.check_out) : null;
      const nights = (arrivalDate && departureDate)
        ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 1;

      return {
        id: b.id,
        guest_name: b.guest_name,
        phone: b.phone || '',
        room_name: `${roomLabel} ${physicalName}`,
        check_in: b.check_in,
        check_out: b.check_out,
        price: Number(b.price || 0),
        deposit: Number(b.deposit || 0),
        num_adult: Number(b.num_adult || 1),
        num_child: Number(b.num_child || 0),
        channel: b.channel || 'Recepción',
        booking_time: b.created_at || null,
        nights,
        status: b.status || 'confirmed',
        masterId: null
      };
    });

    const allBookings = [...beds24Reservas, ...mappedLocal];

    // Enriquecer allBookings con teléfonos y estado real de la tabla 'checkins' y 'beds24_reservations' de Supabase
    try {
      const [checkinRes, b24DbRes] = await Promise.all([
        supabase.from('checkins').select('reservation_id, status'),
        supabase.from('beds24_reservations').select('id, guest_phone, status')
      ]);

      const checkinMap = new Map<string, string>();
      (checkinRes.data || []).forEach((c: any) => {
        if (c.reservation_id) {
          const rawId = String(c.reservation_id).toLowerCase().trim();
          checkinMap.set(rawId, c.status);
          const digits = rawId.replace(/\D/g, '');
          if (digits) checkinMap.set(digits, c.status);
        }
      });

      const b24PhoneMap = new Map<string, string>();
      (b24DbRes.data || []).forEach((r: any) => {
        if (r.id && r.guest_phone) {
          b24PhoneMap.set(String(r.id).toLowerCase().trim(), r.guest_phone);
        }
      });

      for (const b of allBookings) {
        const bIdRaw = String(b.id).toLowerCase().trim();
        const bIdDigits = bIdRaw.replace(/\D/g, '');
        const cStatus = checkinMap.get(bIdRaw) || (bIdDigits ? checkinMap.get(bIdDigits) : undefined);
        if (cStatus === 'checked_in') {
          b.checked_in = true;
          b.status = 'checked_in';
        } else if (cStatus === 'checked_out') {
          b.checked_out = true;
          b.status = 'checked_out';
        }

        // Si la reserva de Beds24 no trajo teléfono en la API (común en OTAs), intentar leer de Supabase o extraer de notas/mensajes
        if (!b.guest_phone && !b.phone && !b.mobile) {
          const dbPhone = b24PhoneMap.get(bIdRaw) || (bIdDigits ? b24PhoneMap.get(bIdDigits) : undefined);
          if (dbPhone) {
            b.guest_phone = dbPhone;
            b.phone = dbPhone;
          } else {
            const extractedPhone = extractPhoneFromBookingData(b);
            if (extractedPhone) {
              b.guest_phone = extractedPhone;
              b.phone = extractedPhone;
              supabase.from('beds24_reservations').update({ guest_phone: extractedPhone }).eq('id', b.id).then(() => {});
              updateBeds24BookingPhone(b.id, extractedPhone).catch(() => {});
            }
          }
        }
      }
    } catch (checkinErr) {
      console.error("[Cron WhatsApp] Error cargando datos de Supabase:", checkinErr);
    }



    // Helper para verificar si la reserva o alguna reserva del grupo tiene un pago/comprobante pendiente o aprobado
    const isGroupPaidOrPending = (booking: any): boolean => {
      const bIdStr = String(booking.id);
      if (paidOrPendingSet.has(bIdStr)) return true;
      const siblings = allBookings.filter(b => areBookingsInSameGroup(booking, b));
      return siblings.some(b => paidOrPendingSet.has(String(b.id)));
    };

    // Helper para obtener la fecha de último aviso de la reserva o de cualquier miembro del grupo
    const getGroupNoticeSentAt = (booking: any): string | undefined => {
      const bIdStr = String(booking.id);
      if (ultimoAvisoMap.has(bIdStr)) {
        return ultimoAvisoMap.get(bIdStr);
      }
      const siblings = allBookings.filter(b => areBookingsInSameGroup(booking, b));
      for (const member of siblings) {
        const memberIdStr = String(member.id);
        if (ultimoAvisoMap.has(memberIdStr)) {
          return ultimoAvisoMap.get(memberIdStr);
        }
      }
      return undefined;
    };

    // 4. Obtener mensajes ya enviados o intentados para evitar duplicados y tormentas de reintentos
    // IMPORTANTE: Ordenar por sent_at DESCENDENTE para que siempre incluya los registros recientes (últimos minutos y días).
    // PostgREST tiene un límite de 1,000 filas por consulta; sin orden descendente, devuelve los registros más viejos de agosto
    // ignorando completamente los mensajes enviados hoy, lo que causaba spam en bucle cada 10 minutos.
    const [p1, p2] = await Promise.all([
      supabase.from('whatsapp_logs').select('reservation_id, template_name, phone, sent_at, status').order('sent_at', { ascending: false }).range(0, 999),
      supabase.from('whatsapp_logs').select('reservation_id, template_name, phone, sent_at, status').order('sent_at', { ascending: false }).range(1000, 1999)
    ]);
    const sentLogs = [...(p1.data || []), ...(p2.data || [])];
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const validLogs = (sentLogs || []).filter((l: any) => l.status !== 'failed');

    // Cooldown de 30 minutos para reintentos de fallas recientes:
    // Si un mensaje falló hace menos de 30 minutos, se pausa temporalmente para no saturar la API
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const recentFailedSet = new Set<string>();
    (sentLogs || []).forEach((l: any) => {
      if (l.status === 'failed' && l.sent_at && l.sent_at >= thirtyMinutesAgo) {
        const rId = String(l.reservation_id || '').trim();
        const tmpl = String(l.template_name || '').trim();
        if (rId && tmpl) {
          recentFailedSet.add(`${rId}_${tmpl}`);
        }
      }
    });

    const sentBookingSet = new Set<string>();
    const sentPhoneSet = new Set<string>();

    validLogs.forEach((l: any) => {
      const rId = String(l.reservation_id || '').trim();
      const tmpl = String(l.template_name || '').trim();
      const phoneDigits = String(l.phone || '').replace(/\D/g, '').slice(-10);

      // Deduplicación por Reserva (60 días): Evita reenvíos a la misma reservación
      if (rId && tmpl) {
        sentBookingSet.add(`${rId}_${tmpl}`);
      }
      // Deduplicación por Teléfono (24 horas): Solo para evitar duplicados en habitaciones hermanas
      // del MISMO grupo en el mismo día. NUNCA debe silenciar a clientes recurrentes en estancias posteriores.
      if (phoneDigits && phoneDigits.length >= 7 && tmpl) {
        if (l.sent_at && l.sent_at >= oneDayAgo) {
          sentPhoneSet.add(`${phoneDigits}_${tmpl}`);
        }
      }
    });

    const isTemplateAlreadySent = (bId: string, phone: string | undefined, tmpl: string): boolean => {
      const bIdStr = String(bId || '').trim();
      const phoneDigits = String(phone || '').replace(/\D/g, '').slice(-10);

      const variants = [tmpl, `${tmpl}_v2`, tmpl.replace(/_v2$/, '')];
      for (const t of variants) {
        if (bIdStr && sentBookingSet.has(`${bIdStr}_${t}`)) return true;
        if (phoneDigits && phoneDigits.length >= 7 && sentPhoneSet.has(`${phoneDigits}_${t}`)) return true;
        // Pausa temporal de 30 minutos si falló recientemente
        if (bIdStr && recentFailedSet.has(`${bIdStr}_${t}`)) return true;
      }
      return false;
    };

    const markTemplateAsSent = (bId: string, phone: string | undefined, tmpl: string) => {
      const bIdStr = String(bId || '').trim();
      const phoneDigits = String(phone || '').replace(/\D/g, '').slice(-10);
      if (bIdStr) sentBookingSet.add(`${bIdStr}_${tmpl}`);
      if (phoneDigits && phoneDigits.length >= 7) sentPhoneSet.add(`${phoneDigits}_${tmpl}`);
    };

    const sentSet = sentBookingSet;

    // Plantillas ya enviadas por la bandeja de las OTAs (una sola consulta por ejecución). El envío por la bandeja es
    // independiente del de WhatsApp: cada uno lleva su propio registro y un fallo en uno no bloquea ni repite el otro.
    const otaSentSet = new Set<string>();
    // Envíos a la bandeja que fallaron hace menos de 30 minutos: se espera antes de reintentar (igual que con WhatsApp),
    // para no gastar una llamada a Beds24 en cada ejecución del cron con un chat que no acepta mensajes.
    const otaRecentFailedSet = new Set<string>();
    try {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyMinAgoIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: otaLogs } = await supabase
        .from('ota_messages_log')
        .select('booking_id, template_type, status, created_at')
        .in('status', ['sent', 'failed'])
        .gte('created_at', sixtyDaysAgo)
        .order('created_at', { ascending: false })
        .range(0, 1999);
      (otaLogs || []).forEach((l: any) => {
        const key = `${String(l.booking_id).trim()}_${String(l.template_type).trim()}`;
        if (l.status === 'sent') otaSentSet.add(key);
        else if (l.created_at && String(l.created_at) >= thirtyMinAgoIso) otaRecentFailedSet.add(key);
      });
    } catch (otaLogErr) {
      console.warn('[Cron WhatsApp] No se pudo precargar ota_messages_log:', otaLogErr);
    }
    // La fidelización (5 y 10 meses) va solo por WhatsApp: pasado tanto tiempo las OTAs ya no permiten escribir en el chat
    const WHATSAPP_ONLY_TEMPLATES = new Set(['recibimiento_nuevamente_5m', 'recibimiento_nuevamente_10m']);

    // --- PRECARGA PARA CANCELACIÓN DE 3 HORAS ---
    // Obtener logs de 'ultimo_aviso' enviados en los últimos 7 días ordenados por fecha descendente
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: ultimoAvisoLogs } = await supabase
      .from('whatsapp_logs')
      .select('reservation_id, sent_at')
      .eq('template_name', 'ultimo_aviso')
      .gte('sent_at', sevenDaysAgo)
      .order('sent_at', { ascending: false });

    const ultimoAvisoMap = new Map<string, string>();
    if (ultimoAvisoLogs) {
      for (const log of ultimoAvisoLogs) {
        const rId = String(log.reservation_id);
        if (!ultimoAvisoMap.has(rId)) {
          ultimoAvisoMap.set(rId, log.sent_at);
        }
      }
    }

    // Obtener comprobantes de los últimos 7 días en estado 'pending' o 'approved'
    const { data: receipts } = await supabase
      .from('transfer_receipts')
      .select('booking_id, status')
      .in('status', ['pending', 'approved'])
      .gte('created_at', sevenDaysAgo);

    const paidOrPendingSet = new Set<string>();
    if (receipts) {
      for (const receipt of receipts) {
        if (receipt.booking_id) {
          paidOrPendingSet.add(String(receipt.booking_id));
        }
      }
    }

    // 5. Calcular variables de tiempo en México de forma inmune a la zona horaria del servidor
    const currentHour = getMexicoHour();
    const todayStr = getMexicoDateStr(0);
    const tomorrowStr = getMexicoDateStr(1);
    const yesterdayStr = getMexicoDateStr(-1);
    
    // Rango de fechas para fidelización Mensaje 10 (5 meses = 150 días, 10 meses = 300 días)
    const fiveMonthsAgoCheckinStr = getMexicoDateStr(-150);
    const tenMonthsAgoCheckinStr = getMexicoDateStr(-300);

    const reports: string[] = [];

    // Helper para verificar si existió una incidencia grave (urgencia alta en mantenimiento) durante la estancia
    const hasHighUrgencyIncident = async (roomName: string, checkIn: string, checkOut: string): Promise<boolean> => {
      try {
        if (!roomName) return false;
        const cleanRoom = getCleanRoom(roomName, '');
        if (!cleanRoom) return false;

        const { data: incidents } = await supabase
          .from('mantenimiento')
          .select('id, room, urgency, created_at')
          .or('urgency.eq.alta,urgency.eq.Alta,urgency.eq.high')
          .gte('created_at', `${checkIn}T00:00:00Z`);

        if (!incidents || incidents.length === 0) return false;

        return incidents.some(inc => {
          const incRoomClean = getCleanRoom('', inc.room);
          return incRoomClean === cleanRoom;
        });
      } catch (e) {
        console.error("Error al consultar incidencias de mantenimiento:", e);
        return false;
      }
    };

    // 6. Recorrer reservaciones y aplicar reglas de Floren
    for (const booking of allBookings) {
      try {
        const bookingIdStr = String(booking.id);
        const rawPhone = booking.phone || booking.mobile || booking.guest_phone;
        const normalizedPhone = rawPhone ? normalizePhone(rawPhone, booking.country2 || booking.country) : '';
        const rawChannel = String(booking.channel || '').trim();
        const isOta = isOtaChannel(rawChannel);
        const hasValidPhone = Boolean(normalizedPhone && !isDummyOrInvalidPhone(normalizedPhone));

        // Si no tiene teléfono válido y no es una OTA con chat, omitir
        if (!hasValidPhone && !isOta) continue;

        const guestPhone = hasValidPhone ? normalizedPhone : undefined;
        if (guestPhone) {
          booking.phone = guestPhone;
          booking.guest_phone = guestPhone;
          booking.mobile = guestPhone;
        }

        // ¿Falta enviar esta plantilla? Por WhatsApp (si hay teléfono válido) o por la bandeja de la OTA (si es OTA).
        // Cada canal lleva su propio registro: que uno ya haya salido no impide enviar el otro.
        // Fechas de la estancia para no mandar por la bandeja mensajes atrasados (p. ej. a una estancia que terminó hace días)
        const stayInStr = String(booking.check_in || '').split('T')[0].split(' ')[0];
        const stayOutStr = String(booking.check_out || '').split('T')[0].split(' ')[0];
        const otaCanSend = (logKey: string): boolean => {
          if (!isOta || WHATSAPP_ONLY_TEMPLATES.has(logKey)) return false;
          const key = `${bookingIdStr}_${logKey}`;
          if (otaSentSet.has(key) || otaRecentFailedSet.has(key)) return false;
          if (stayOutStr && stayOutStr < yesterdayStr) return false; // la estancia terminó hace más de un día
          if (logKey === 'bienvenida_checkin' && stayInStr && stayInStr < yesterdayStr) return false; // la bienvenida solo al llegar
          return true;
        };
        const shouldDispatch = (logKey: string): boolean => {
          if (!isTemplateAlreadySent(bookingIdStr, guestPhone, logKey)) return true;
          return otaCanSend(logKey);
        };

        // Despachador unificado. En reservas de OTA se envía POR LOS DOS canales a la vez: WhatsApp (si hay teléfono válido)
        // y la bandeja oficial de la OTA (cubre al huésped cuyo número no tiene WhatsApp). Sin teléfono, solo la bandeja.
        const dispatchTemplate = async (
          templateName: string,
          waSender: () => Promise<any>,
          friendlyLabel: string,
          logTemplateKey?: string
        ) => {
          const logKey = logTemplateKey || templateName;
          if (guestPhone && !isTemplateAlreadySent(bookingIdStr, guestPhone, logKey)) {
            const res = await waSender();
            if (res.success) {
              // sendWhatsAppTemplate ya registra/actualiza whatsapp_logs con templateName.
              // Solo agregamos registro extra cuando logKey difiere de templateName (ej. recibimiento_nuevamente_5m / _10m).
              if (logKey !== templateName && !res.data?.deduplicated) {
                await supabase.from('whatsapp_logs').insert([{
                  reservation_id: bookingIdStr,
                  template_name: logKey,
                  phone: guestPhone,
                  sent_at: new Date().toISOString(),
                  status: 'sent'
                }]);
              }
              markTemplateAsSent(bookingIdStr, guestPhone, logKey);
              reports.push(`Enviado ${friendlyLabel} (WhatsApp) a ${booking.guest_name} (ID: ${bookingIdStr})`);
            } else {
              console.warn(`[Cron WhatsApp] Error enviando ${templateName} a ${booking.guest_name}:`, res.error);
            }
          }
          if (otaCanSend(logKey)) {
            const res = await sendOfficialOtaTemplate(bookingIdStr, templateName, {
              guestName: booking.guest_name,
              channel: rawChannel,
              lang: guestPhone ? detectLanguageFromPhone(guestPhone) : 'es'
            });
            if (res.success) {
              if (!res.alreadySent) reports.push(`Enviado ${friendlyLabel} (OTA ${rawChannel}) a ${booking.guest_name} (ID: ${bookingIdStr})`);
              otaSentSet.add(`${bookingIdStr}_${logKey}`);
            } else if (res.error !== 'paused') {
              otaRecentFailedSet.add(`${bookingIdStr}_${logKey}`);
              console.warn(`[Cron WhatsApp] Error enviando ${templateName} a OTA ${rawChannel} (reserva ${bookingIdStr}):`, res.error);
            }
          }
        };

        // --- REGLA: Cancelación Automática 3h tras Último Aviso enviado desde la app (Solo Reservas Directas/Locales con anticipo pendiente, NUNCA OTAs prepagadas Airbnb/Booking/Vrbo/Expedia) ---
        const isCancelled = booking.status === 'cancelled' || String(booking.status) === '0';
        const hasDeposit = Number(booking.deposit || 0) > 0 || Number(booking.actualPaid || 0) > 0;
        const sentAtStr = getGroupNoticeSentAt(booking);
        const channelLower = String(booking.channel || '').toLowerCase();
        const isPrepaidOtaBooking = ['airbnb', 'booking', 'vrbo', 'expedia'].some(ota => channelLower.includes(ota));

        if (!isCancelled && !hasDeposit && sentAtStr && !isPrepaidOtaBooking) {
          const sentAt = new Date(sentAtStr);
          // Margen de 3 horas desde que recepción envió el último aviso desde la app
          const limitTime = new Date(sentAt.getTime() + 3 * 60 * 60 * 1000); 
          const now = new Date();

          // Registrar evaluación de cancelación en logs del sistema para diagnóstico y visibilidad
          try {
            await supabase.from('employee_logs').insert([{
              employee_num: '000',
              employee_name: 'System Cron',
              action: 'cron-cancel-eval',
              department: 'whatsapp',
              module: 'whatsapp',
              room: booking.room_name || `Habitación ${booking.room || ''}`,
              details: `Evaluando reserva ${bookingIdStr} (${booking.guest_name}). Último aviso: ${sentAtStr}. Límite (3h): ${limitTime.toISOString()}. Ahora: ${now.toISOString()}.`
            }]);
          } catch (e) {
            console.error("Error al registrar cron-cancel-eval:", e);
          }

          if (now >= limitTime) {
            // Salvaguarda: nunca cancelar automáticamente una estancia que ya empezó o que ya tiene check-in/check-out hecho
            // (en el grupo completo). Esas reservas las gestiona recepción a mano; cancelarlas borraría el check-in y las finanzas.
            const guardMembers = [booking, ...allBookings.filter(b => areBookingsInSameGroup(booking, b))];
            const stayAlreadyStarted = guardMembers.some(m => {
              const ci = String(m.check_in || '').split('T')[0].split(' ')[0];
              return Boolean(ci) && ci < todayStr;
            });
            const hasCheckinDone = guardMembers.some(m => Boolean(m.checked_in || m.status === 'checked_in' || m.status === 'checked_out'));

            if (stayAlreadyStarted || hasCheckinDone) {
              console.log(`[Cron WhatsApp] Se omitió cancelación automática de la reserva ${bookingIdStr} (${booking.guest_name}): la estancia ya empezó o tiene check-in hecho.`);
            } else if (!isGroupPaidOrPending(booking)) {
              // Obtener TODOS los miembros del grupo (incluyendo la reserva actual)
              const siblings = allBookings.filter(b => areBookingsInSameGroup(booking, b));
              const groupMembers = [booking, ...siblings];
              const groupMemberIds = Array.from(new Set(groupMembers.map(m => String(m.id))));
              const groupRoomsList = groupMembers.map(m => m.room_name || `Hab ${m.room || m.id}`).join(', ');

              console.log(`[Cron Expiración 3h] Grupo de reservaciones [${groupMemberIds.join(', ')}] (${booking.guest_name} - ${groupRoomsList}) no cargó comprobante tras 3 horas de último aviso. Cancelando grupo completo...`);

              // Separar locales y Beds24
              const localMembers = groupMembers.filter(m => Boolean(m.isLocal) || String(m.id).startsWith('loc_') || String(m.id).startsWith('walkin_') || String(m.id).length < 7);
              const beds24Members = groupMembers.filter(m => !localMembers.includes(m));

              // 1. Cancelar en BD Local
              if (localMembers.length > 0) {
                const localIds = localMembers.map(m => Number(m.id));
                await supabase
                  .from('local_reservas')
                  .update({ status: 'cancelled', deposit: 0 })
                  .in('id', localIds);
              }

              // 2. Cancelar en Beds24 en lote (batch)
              if (beds24Members.length > 0) {
                const token = await getBeds24Token();
                const cancelPayloads = beds24Members.map(m => ({ id: Number(m.id), status: 'cancelled', deposit: 0 }));
                const cancelRes = await fetch('https://api.beds24.com/v2/bookings', {
                  method: 'POST',
                  headers: { 'token': token, 'Content-Type': 'application/json' },
                  body: JSON.stringify(cancelPayloads)
                });
                
                let isBeds24Success = false;
                let beds24ErrorDetails = '';
                
                if (cancelRes.ok) {
                  const resJson = await cancelRes.json();
                  if (resJson.success || (Array.isArray(resJson) && resJson.every((r: any) => r.success || r.id)) || (Array.isArray(resJson.data) && resJson.data.length > 0)) {
                    isBeds24Success = true;
                    clearBeds24Cache();
                  } else {
                    beds24ErrorDetails = JSON.stringify(resJson);
                  }
                } else {
                  beds24ErrorDetails = await cancelRes.text();
                }

                if (!isBeds24Success) {
                  console.error(`[Cron Expiración 3h] Error al cancelar grupo en Beds24: ${beds24ErrorDetails}`);
                }
              }

              // 3. Liberar checkin local para todos los miembros del grupo
              await supabase.from('checkins').delete().in('reservation_id', groupMemberIds);

              // 4. Limpiar y revertir transacciones en Finanzas para todos los miembros cancelados
              for (const memberId of groupMemberIds) {
                try {
                  await deleteCancelledReservationFinances(memberId, 'Cancelación automática por inactividad de pago (3h)');
                } catch (finErr) {
                  console.error(`[Cron Expiración 3h] Error limpiando finanzas para reserva ${memberId}:`, finErr);
                }
              }

              // 5. Actualizar estado en Supabase beds24_reservations para todos los miembros
              try {
                await supabase
                  .from('beds24_reservations')
                  .update({ status: 'cancelled', deposit: 0, updated_at: new Date().toISOString() })
                  .in('id', groupMemberIds);
              } catch (b24DbErr) {
                console.error("Error updating beds24_reservations on cancel:", b24DbErr);
              }

              // 5. Registrar éxito de la cancelación grupal en los logs de auditoría
              // 6. Enviar WhatsApp / OTA de disponibilidad liberada una sola vez para todo el grupo (respetando freno de emergencia)
              let disponWaSent = false;
              if (guestPhone) {
                const waRes = await sendTemplate4_DisponibilidadLiberada(booking, false);
                if (waRes.success) {
                  disponWaSent = true;
                  reports.push(`[Expirado 3h tras Último Aviso] Grupo [${groupMemberIds.join(', ')}] cancelado y notificado con Mensaje 4 por WhatsApp.`);
                } else {
                  reports.push(`[Expirado 3h tras Último Aviso] Grupo [${groupMemberIds.join(', ')}] cancelado en sistema, pero falló WhatsApp: ${waRes.error}`);
                }
              }
              if (isOta) {
                try {
                  await sendOfficialOtaTemplate(booking.id, 'disponibilidad_liberada', {
                    guestName: booking.guest_name,
                    channel: rawChannel
                  });
                  reports.push(`[Expirado 3h tras Último Aviso] Grupo [${groupMemberIds.join(', ')}] cancelado y notificado con Mensaje 4 por chat OTA.`);
                } catch (otaErr) {
                  console.error('Error enviando disponibilidad_liberada a OTA:', otaErr);
                }
              }
              
              // 7. Registrar logs de whatsapp_logs para los miembros adicionales del grupo (o si fue solo OTA)
              for (const memberId of groupMemberIds) {
                if (disponWaSent && memberId === bookingIdStr) continue;
                await supabase.from('whatsapp_logs').insert([{
                  reservation_id: memberId,
                  template_name: 'disponibilidad_liberada',
                  phone: guestPhone || `OTA_${rawChannel.toUpperCase()}`
                }]);
              }

              continue; // Saltar el resto de verificaciones para esta reserva
            } else {
              // Omitido por tener transferencia pendiente o aprobada en el grupo
              console.log(`[Cron WhatsApp] Se omitió cancelación de reserva ${bookingIdStr} (${booking.guest_name}) por transferencia en revisión.`);
            }
          }
        }

        // --- RESERVACIONES CANCELADAS: Omitir envíos posteriores ---
        if (booking.status === 'cancelled' || String(booking.status) === '0') {
          continue;
        }

        const cleanCheckIn = (booking.check_in || '').split('T')[0].split(' ')[0];
        const cleanCheckOut = (booking.check_out || '').split('T')[0].split(' ')[0];
        const bookingNights = Number(booking.nights || 1);

        // Calcular días restantes para la fecha de entrada
        let daysUntilCheckIn = -999;
        if (cleanCheckIn && todayStr) {
          const arrDate = new Date(`${cleanCheckIn}T00:00:00Z`);
          const curDate = new Date(`${todayStr}T00:00:00Z`);
          daysUntilCheckIn = Math.round((arrDate.getTime() - curDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        const isAlreadyCheckedIn = Boolean(booking.checked_in || booking.status === 'checked_in' || booking.status === 'checked_out');

        // --- ENVÍO DE PLANTILLAS INICIALES (CONTROL ANTI-SPAM MASIVO) ---
        // Regla de seguridad estricta:
        // El Cron SOLO debe evaluar el envío inicial si:
        // 1. La reserva fue creada RECIENTEMENTE (en las últimas 48 horas), O BIEN
        // 2. La reserva entra en la ventana de 7 días previos al Check-In (0 <= daysUntilCheckIn <= 7).
        // Esto PREVIENE que reservas antiguas creadas meses atrás reciban mensajes masivos por error.
        const isCreatedRecently = (() => {
          const cTime = booking.bookingTime || booking.booking_time || booking.created_at;
          if (!cTime) return false;
          const createdMs = new Date(cTime).getTime();
          if (isNaN(createdMs)) return false;
          return (Date.now() - createdMs) <= 48 * 60 * 60 * 1000;
        })();

        const isInPreArrivalWindow = daysUntilCheckIn >= 0 && daysUntilCheckIn <= 7;

        const actualPaid = Number(booking.actualPaid || 0);
        const depositVal = Number(booking.deposit || 0);
        const bPrice = Number(booking.price || 0);
        const effectiveDeposit = Math.max(actualPaid, depositVal);
        const hasMin50 = bPrice > 0 ? (effectiveDeposit >= (bPrice * 0.5 - 0.01)) : (effectiveDeposit > 0);
        const isRequestStatus = String(booking.status || '').toLowerCase() === 'request';
        const isConfirmed = !isRequestStatus && (isPrepaidOtaBooking || (hasMin50 && String(booking.status || '').toLowerCase() === 'confirmed'));
        const isExpediaUnpaid = !isConfirmed && channelLower.includes('expedia');

        // Reservas confirmadas (OTAs prepagadas Airbnb/Booking o directas con anticipo): Solo se evalúan si fueron creadas en las últimas 48h.
        // Reservas no confirmadas (solicitud 24h directas): Solo se evalúan si fueron creadas en las últimas 48h para evitar spam masivo.
        // Reservas Expedia no pagadas: Se evalúan en la ventana T-7 previa al check-in.
        const shouldEvaluateInitial = !isCancelled && !isAlreadyCheckedIn && daysUntilCheckIn >= 0 && (
          (isConfirmed && isCreatedRecently) || 
          (!isConfirmed && !isExpediaUnpaid && isCreatedRecently) || 
          (isExpediaUnpaid && isInPreArrivalWindow)
        );

        if (shouldEvaluateInitial && guestPhone) {
            const hasInitialMessage = isTemplateAlreadySent(bookingIdStr, guestPhone, 'solicitud_recibida') || 
                                      isTemplateAlreadySent(bookingIdStr, guestPhone, 'reservacion_confirmada') ||
                                      isTemplateAlreadySent(bookingIdStr, guestPhone, 'bienvenida_checkin') ||
                                      isTemplateAlreadySent(bookingIdStr, guestPhone, 'omitido_multi_habitacion');

            if (!hasInitialMessage) {
              // Bloquear inmediatamente en memoria antes del await para prevenir tormentas de reintentos concurrentes
              markTemplateAsSent(bookingIdStr, guestPhone, isConfirmed ? 'reservacion_confirmada' : 'solicitud_recibida');

              if (isConfirmed) {
                const waRes = await sendTemplate3_ReservacionConfirmada(booking, false);
                if (waRes.success) {
                  reports.push(`Enviado Mensaje 3 (Confirmada - Reciente/T-7) a ${booking.guest_name} (ID: ${bookingIdStr})`);
                } else {
                  console.error(`[Cron WhatsApp] Error enviando Mensaje 3 a ${booking.guest_name}:`, waRes.error);
                }
              } else {
                const waRes = await sendTemplate1_SolicitudRecibida(booking, false);
                if (waRes.success) {
                  reports.push(`Enviado Mensaje 1 (Solicitud Recibida) a ${booking.guest_name} (ID: ${bookingIdStr})`);
                } else {
                  console.error(`[Cron WhatsApp] Error enviando Mensaje 1 a ${booking.guest_name}:`, waRes.error);
                }
              }
            }
        }

        // Copia del mensaje inicial en la bandeja de la OTA, en paralelo al WhatsApp (cubre al huésped cuyo número no tiene WhatsApp).
        // Sin teléfono no se envía aquí: eso lo gestiona el flujo de "pedir WhatsApp" y su fallback de 20 minutos.
        if (shouldEvaluateInitial && isOta && guestPhone) {
          const initialOtaTemplate = isConfirmed ? 'reservacion_confirmada' : 'solicitud_recibida';
          if (otaCanSend(initialOtaTemplate)) {
            const otaRes = await sendOfficialOtaTemplate(bookingIdStr, initialOtaTemplate, {
              guestName: booking.guest_name,
              channel: rawChannel,
              lang: detectLanguageFromPhone(guestPhone)
            });
            if (otaRes.success) {
              otaSentSet.add(`${bookingIdStr}_${initialOtaTemplate}`);
              if (!otaRes.alreadySent) reports.push(`Enviado mensaje inicial (OTA ${rawChannel}) a ${booking.guest_name} (ID: ${bookingIdStr})`);
            } else if (otaRes.error !== 'paused') {
              otaRecentFailedSet.add(`${bookingIdStr}_${initialOtaTemplate}`);
              console.warn(`[Cron WhatsApp] Error enviando ${initialOtaTemplate} a OTA ${rawChannel} (reserva ${bookingIdStr}):`, otaRes.error);
            }
          }
        }

        // --- RECORDATORIO A 7 DÍAS DEL CHECK-IN (solo Expedia) ---
        // Avisa que falta una semana y pide que comuniquen si no van a llegar. Sale por WhatsApp y por la bandeja de Expedia.
        if (channelLower.includes('expedia') && !isCancelled && !isAlreadyCheckedIn && !isRequestStatus
          && daysUntilCheckIn === 7 && currentHour >= 10 && currentHour < 20) {
          if (shouldDispatch('recordatorio_7_dias')) {
            await dispatchTemplate('recordatorio_7_dias', () => sendTemplate_Recordatorio7Dias(booking), 'Recordatorio 7 días (Expedia)');
          }
        }

        // --- MENSAJE 5: Todo listo para su llegada (6:00 PM del día anterior) ---
        // NUNCA enviar si la reserva ya está en el hotel (checked_in) o cancelada
        if (!isCancelled && !isAlreadyCheckedIn && cleanCheckIn === tomorrowStr && (currentHour >= 18 && currentHour < 21)) {
          if (shouldDispatch('preparacion_llegada')) {
            await dispatchTemplate('preparacion_llegada', () => sendTemplate5_PreparacionLlegada(booking), 'Mensaje 5 (Prep llegada 6PM)');
          }
        }

        // --- MENSAJE EXTRA: Alojamiento Listo para habitaciones vacías el día anterior (12:00 PM de hoy) ---
        // NUNCA enviar si la reserva ya está cancelada o ya realizó Check-In (ej. Walk-In / En Casa)
        if (!isCancelled && !isAlreadyCheckedIn && cleanCheckIn === todayStr && (currentHour === 12 || (currentHour >= 12 && currentHour < 15))) {
          if (shouldDispatch('alojamiento_listo')) {
            const rRoom = getCleanRoom(booking.room_name, booking.room);
            if (rRoom) {
              // Verificar si alguna reserva ocupaba la habitación ayer por la noche
              const occupiedYesterday = allBookings.some(other => {
                if (other.status === 'cancelled' || String(other.status) === '0' || String(other.id) === bookingIdStr) return false;
                const otherRoom = getCleanRoom(other.room_name, other.room);
                const otherIn = (other.check_in || '').split('T')[0].split(' ')[0];
                const otherOut = (other.check_out || '').split('T')[0].split(' ')[0];
                return otherRoom === rRoom && otherIn <= yesterdayStr && otherOut >= todayStr;
              });

              const hasDeposit = Number(booking.deposit || 0) > 0;
              const isAcknowledged = booking.is_acknowledged === true || sentSet.has(`${bookingIdStr}_acknowledged`);
              const isConfirmed = isOta || hasDeposit || isAcknowledged;

              if (isConfirmed && booking.status !== 'request' && booking.status !== '0' && !occupiedYesterday) {
                await dispatchTemplate('alojamiento_listo', () => sendTemplate_AlojamientoListo(booking), `Mensaje Alojamiento Listo (Hab ${rRoom})`);
              }
            }
          }
        }

        // --- MENSAJE 6: Bienvenidos a Condominios Jaroje (Automático en Check-In) ---
        if (booking.checked_in || booking.status === 'checked_in') {
          if (shouldDispatch('bienvenida_checkin')) {
            await dispatchTemplate('bienvenida_checkin', () => sendTemplate6_BienvenidaCheckin(booking), 'Mensaje 6 (Bienvenida Check-In)');
          }
        }

        // --- MENSAJE 7: ¿Cómo va tu estancia? (9:00 AM del 2º día de estancia, noches >= 2) ---
        // Soporta tanto OTAs como reservas directas en su 2º día o durante la estancia activa
        const isDayTwo = cleanCheckIn === yesterdayStr;
        const isStayActiveForTemplate7 = (isDayTwo || (cleanCheckIn < todayStr && cleanCheckOut > todayStr)) && bookingNights >= 2;

        if (isStayActiveForTemplate7 && currentHour >= 9 && currentHour < 14) {
          if (shouldDispatch('seguimiento_satisfaccion')) {
            await dispatchTemplate('seguimiento_satisfaccion', () => sendTemplate7_SeguimientoSatisfaccion(booking), 'Mensaje 7 (Satisfacción 9AM)');
          }
        }

        // --- MENSAJE 8: Check-out 12:00 p.m. (7:00 AM del día del Check-Out) ---
        // Soporta extensiones de estancia: Se enviará a las 7 AM de la nueva fecha de salida si la estancia fue extendida
        if (cleanCheckOut === todayStr && currentHour >= 7 && currentHour < 12) {
          if (shouldDispatch('salida_checkout')) {
            await dispatchTemplate('salida_checkout', () => sendTemplate8_SalidaCheckout(booking), 'Mensaje 8 (Salida Checkout 7AM)');
          }
        }

        // --- MENSAJE 9: ¿Cómo estuvo tu experiencia? (10:00 AM del día siguiente al Check-Out) ---
        // Condición de exclusión: OMITIR si existió un reporte en mantenimiento con urgencia alta durante la estancia
        // Soporta extensiones de estancia: Se envía el día después de la fecha real de salida
        if (cleanCheckOut === yesterdayStr && currentHour >= 10 && currentHour < 14) {
          if (shouldDispatch('comparte_experiencia')) {
            const roomStr = booking.room_name || booking.room || '';
            const hasIncident = await hasHighUrgencyIncident(roomStr, cleanCheckIn, cleanCheckOut);
            if (hasIncident) {
              reports.push(`Omisado Mensaje 9 para ${booking.guest_name} por reporte de incidencia con urgencia alta en ${roomStr}`);
            } else {
              await dispatchTemplate('comparte_experiencia', () => sendTemplate9_ComparteExperiencia(booking), 'Mensaje 9 (Encuesta Experiencia 10AM)');
            }
          }
        }

        // --- MENSAJE 10: ¡Nos encantará recibirte nuevamente! (5 y 10 meses posteriores al Check-In) ---
        if (currentHour >= 10 && currentHour < 14) {
          if (cleanCheckIn === fiveMonthsAgoCheckinStr) {
            if (!isTemplateAlreadySent(bookingIdStr, guestPhone, 'recibimiento_nuevamente_5m')) {
              await dispatchTemplate('recibimiento_nuevamente', () => sendTemplate10_RecibimientoNuevamente(booking), 'Mensaje 10 (Fidelización 5 meses)', 'recibimiento_nuevamente_5m');
            }
          } else if (cleanCheckIn === tenMonthsAgoCheckinStr) {
            if (!isTemplateAlreadySent(bookingIdStr, guestPhone, 'recibimiento_nuevamente_10m')) {
              await dispatchTemplate('recibimiento_nuevamente', () => sendTemplate10_RecibimientoNuevamente(booking), 'Mensaje 10 (Fidelización 10 meses)', 'recibimiento_nuevamente_10m');
            }
          }
        }
      } catch (bookingErr: any) {
        console.error(`[Cron WhatsApp] Error procesando reserva ${booking.id}:`, bookingErr);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Revisar respuestas de huéspedes en OTAs (Airbnb / Booking / Expedia)
    // ─────────────────────────────────────────────────────────────────────────────
    try {
      const { checkAndProcessOtaGuestReplies } = await import('@/lib/beds24-messages');
      const otaRes = await checkAndProcessOtaGuestReplies();
      if (otaRes.upgradedCount > 0) {
        otaRes.details.forEach(d => {
          reports.push(`🎉 Huésped OTA ${d.guestName} respondió su teléfono (${d.phone}) en ${d.channel}! WhatsApp activado.`);
        });
      }
    } catch (otaWorkerErr) {
      console.warn('[Cron WhatsApp] Fallo no crítico en worker OTA:', otaWorkerErr);
    }

    return NextResponse.json({
      success: true,
      mexicoTime: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
      hourChecked: currentHour,
      bookingsProcessed: allBookings.length,
      actionsTaken: reports
    });

  } catch (err: any) {
    console.error("Error en cron route:", err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
