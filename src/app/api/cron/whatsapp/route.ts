import { NextResponse } from 'next/server';
import { getBeds24Bookings } from '@/lib/beds24';
import { supabase } from '@/lib/supabase';
import {
  sendTemplate1_SolicitudRecibida,
  sendTemplate2_UltimoAviso,
  sendTemplate3_ReservacionConfirmada,
  sendTemplate5_PreparacionLlegada,
  sendTemplate7_SeguimientoSatisfaccion,
  sendTemplate8_SalidaCheckout,
  sendTemplate9_ComparteExperiencia,
  sendTemplate10_RecibimientoNuevamente
} from '@/lib/whatsapp';

// Asegurar de forma automatizada que existe la tabla whatsapp_logs en Supabase
async function ensureLogsTable() {
  const sql = `
  CREATE TABLE IF NOT EXISTS public.whatsapp_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reservation_id TEXT NOT NULL,
      template_name TEXT NOT NULL,
      phone TEXT,
      sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
      status TEXT DEFAULT 'sent'
  );
  ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Permitir todo en whatsapp_logs" ON public.whatsapp_logs;
  CREATE POLICY "Permitir todo en whatsapp_logs" ON public.whatsapp_logs FOR ALL USING (true) WITH CHECK (true);
  `;
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !key) return;
    
    await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ query: sql })
    });
  } catch (e) {
    console.error("Error creating whatsapp_logs table via RPC:", e);
  }
}

// Obtener fecha y hora en formato GMT-6 (Huatulco, México)
function getMexicoTime(): Date {
  const utc = new Date();
  return new Date(utc.getTime() - (6 * 60 * 60 * 1000));
}

export async function GET(req: Request) {
  try {
    // 0. Autenticación básica de cron (opcional, por ejemplo un token secreto en la URL)
    const { searchParams } = new URL(req.url);
    const cronToken = searchParams.get('token');
    const expectedToken = process.env.CRON_SECRET;

    if (expectedToken && cronToken !== expectedToken) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Autocreación de la tabla de logs si no existe
    await ensureLogsTable();

    // 2. Obtener reservaciones de Beds24
    const beds24Reservas = await getBeds24Bookings(true);

    // 3. Obtener reservaciones locales de Supabase
    const { data: localRes } = await supabase
      .from('local_reservas')
      .select('*')
      .neq('status', 'cancelled');

    const UNIT_TO_ROOM: Record<string, string> = {
      '1': '500', '2': '501', '3': '502', '4': '503',
      '5': '504', '6': '505', '7': '506', '8': '507'
    };

    const mappedLocal = (localRes || []).map((b: any) => {
      const physicalName = b.unit_id ? (UNIT_TO_ROOM[b.unit_id] || b.unit_id) : '';
      const arrivalDate = b.check_in ? new Date(b.check_in) : null;
      const departureDate = b.check_out ? new Date(b.check_out) : null;
      const nights = (arrivalDate && departureDate)
        ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 1;

      return {
        id: b.id,
        guest_name: b.guest_name,
        phone: b.phone || '',
        room_name: `Habitación ${physicalName}`,
        check_in: b.check_in,
        check_out: b.check_out,
        price: Number(b.price || 0),
        deposit: Number(b.deposit || 0),
        num_adult: Number(b.num_adult || 1),
        num_child: Number(b.num_child || 0),
        channel: b.channel || 'Recepción',
        booking_time: b.created_at || null,
        nights
      };
    });

    const allBookings = [...beds24Reservas, ...mappedLocal];

    // 4. Obtener mensajes ya enviados para evitar duplicados
    const { data: sentLogs } = await supabase
      .from('whatsapp_logs')
      .select('reservation_id, template_name');

    const sentSet = new Set((sentLogs || []).map(l => `${l.reservation_id}_${l.template_name}`));

    // 5. Calcular variables de tiempo en México (CST/CDT - GMT-6)
    const mexicoTime = getMexicoTime();
    const currentHour = mexicoTime.getHours();

    const todayStr = mexicoTime.toISOString().split('T')[0];
    const tomorrowStr = new Date(mexicoTime.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const yesterdayStr = new Date(mexicoTime.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Rango de fechas para fidelización Mensaje 10 (5 meses = 150 días, 10 meses = 300 días)
    const fiveMonthsAgoCheckinStr = new Date(mexicoTime.getTime() - 150 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const tenMonthsAgoCheckinStr = new Date(mexicoTime.getTime() - 300 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const reports: string[] = [];

    // Helper para verificar si existió una incidencia grave (urgencia alta en mantenimiento) durante la estancia
    const hasHighUrgencyIncident = async (roomName: string, checkIn: string, checkOut: string): Promise<boolean> => {
      try {
        if (!roomName) return false;
        const cleanRoom = roomName.replace(/[^0-9]/g, '');
        if (!cleanRoom) return false;

        const { data: incidents } = await supabase
          .from('mantenimiento')
          .select('id, room, urgency, created_at')
          .or('urgency.eq.alta,urgency.eq.Alta,urgency.eq.high')
          .gte('created_at', `${checkIn}T00:00:00Z`);

        if (!incidents || incidents.length === 0) return false;

        return incidents.some(inc => {
          const incRoomClean = (inc.room || '').replace(/[^0-9]/g, '');
          return incRoomClean === cleanRoom;
        });
      } catch (e) {
        console.error("Error al consultar incidencias de mantenimiento:", e);
        return false;
      }
    };

    // 6. Recorrer reservaciones y aplicar reglas de Floren
    for (const booking of allBookings) {
      const bookingIdStr = String(booking.id);
      const guestPhone = booking.phone || booking.mobile || booking.guest_phone;
      if (!guestPhone) continue;

      // --- MENSAJE 4: Disponibilidad Liberada (Automático en Cancelaciones) ---
      if (booking.status === 'cancelled') {
        const logKey = `${bookingIdStr}_disponibilidad_liberada`;
        if (!sentSet.has(logKey)) {
          const res = await sendTemplate4_DisponibilidadLiberada(booking);
          if (res.success) {
            await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'disponibilidad_liberada', phone: guestPhone }]);
            reports.push(`Enviado Mensaje 4 (Disponibilidad Liberada) a ${booking.guest_name} (ID: ${bookingIdStr})`);
          }
        }
        continue;
      }

      // --- MENSAJE 5: Todo listo para su llegada (6:00 PM del día anterior) ---
      if (booking.check_in === tomorrowStr && currentHour === 18) {
        const logKey = `${bookingIdStr}_preparacion_llegada`;
        if (!sentSet.has(logKey)) {
          const res = await sendTemplate5_PreparacionLlegada(booking);
          if (res.success) {
            await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'preparacion_llegada', phone: guestPhone }]);
            reports.push(`Enviado Mensaje 5 (Prep llegada 6PM) a ${booking.guest_name} (ID: ${bookingIdStr})`);
          }
        }
      }

      // --- MENSAJE 6: Bienvenidos a Condominios Jaroje (Automático en Check-In) ---
      if (booking.checked_in || booking.status === 'checked_in') {
        const logKey = `${bookingIdStr}_bienvenida_checkin`;
        if (!sentSet.has(logKey)) {
          const res = await sendTemplate6_BienvenidaCheckin(booking);
          if (res.success) {
            await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'bienvenida_checkin', phone: guestPhone }]);
            reports.push(`Enviado Mensaje 6 (Bienvenida Check-In) a ${booking.guest_name} (ID: ${bookingIdStr})`);
          }
        }
      }

      // --- MENSAJE 7: ¿Cómo va tu estancia? (10:00 AM del 2º día de estancia, noches >= 2) ---
      if (booking.check_in === yesterdayStr && Number(booking.nights || 1) >= 2 && currentHour === 10) {
        const logKey = `${bookingIdStr}_seguimiento_satisfaccion`;
        if (!sentSet.has(logKey)) {
          const res = await sendTemplate7_SeguimientoSatisfaccion(booking);
          if (res.success) {
            await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'seguimiento_satisfaccion', phone: guestPhone }]);
            reports.push(`Enviado Mensaje 7 (Satisfacción 10AM) a ${booking.guest_name} (ID: ${bookingIdStr})`);
          }
        }
      }

      // --- MENSAJE 8: Check-out 12:00 p.m. (7:00 AM del día del Check-Out) ---
      if (booking.check_out === todayStr && currentHour === 7) {
        const logKey = `${bookingIdStr}_salida_checkout`;
        if (!sentSet.has(logKey)) {
          const res = await sendTemplate8_SalidaCheckout(booking);
          if (res.success) {
            await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'salida_checkout', phone: guestPhone }]);
            reports.push(`Enviado Mensaje 8 (Salida Checkout 7AM) a ${booking.guest_name} (ID: ${bookingIdStr})`);
          }
        }
      }

      // --- MENSAJE 9: ¿Cómo estuvo tu experiencia? (10:00 AM del día siguiente al Check-Out) ---
      // Condición de exclusión: OMITIR si existió un reporte en mantenimiento con urgencia alta durante la estancia
      if (booking.check_out === yesterdayStr && currentHour === 10) {
        const logKey = `${bookingIdStr}_comparte_experiencia`;
        if (!sentSet.has(logKey)) {
          const roomStr = booking.room_name || booking.room || '';
          const hasIncident = await hasHighUrgencyIncident(roomStr, booking.check_in, booking.check_out);
          if (hasIncident) {
            reports.push(`Omisado Mensaje 9 para ${booking.guest_name} por reporte de incidencia con urgencia alta en ${roomStr}`);
          } else {
            const res = await sendTemplate9_ComparteExperiencia(booking);
            if (res.success) {
              await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'comparte_experiencia', phone: guestPhone }]);
              reports.push(`Enviado Mensaje 9 (Encuesta Experiencia 10AM) a ${booking.guest_name} (ID: ${bookingIdStr})`);
            }
          }
        }
      }

      // --- MENSAJE 10: ¡Nos encantará recibirte nuevamente! (5 y 10 meses posteriores al Check-In) ---
      if (currentHour === 10) {
        if (booking.check_in === fiveMonthsAgoCheckinStr) {
          const logKey = `${bookingIdStr}_recibimiento_nuevamente_5m`;
          if (!sentSet.has(logKey)) {
            const res = await sendTemplate10_RecibimientoNuevamente(booking);
            if (res.success) {
              await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'recibimiento_nuevamente_5m', phone: guestPhone }]);
              reports.push(`Enviado Mensaje 10 (Fidelización 5 meses) a ${booking.guest_name} (ID: ${bookingIdStr})`);
            }
          }
        } else if (booking.check_in === tenMonthsAgoCheckinStr) {
          const logKey = `${bookingIdStr}_recibimiento_nuevamente_10m`;
          if (!sentSet.has(logKey)) {
            const res = await sendTemplate10_RecibimientoNuevamente(booking);
            if (res.success) {
              await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'recibimiento_nuevamente_10m', phone: guestPhone }]);
              reports.push(`Enviado Mensaje 10 (Fidelización 10 meses) a ${booking.guest_name} (ID: ${bookingIdStr})`);
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      mexicoTime: mexicoTime.toISOString(),
      hourChecked: currentHour,
      bookingsProcessed: allBookings.length,
      actionsTaken: reports
    });

  } catch (err: any) {
    console.error("Error en cron route:", err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
