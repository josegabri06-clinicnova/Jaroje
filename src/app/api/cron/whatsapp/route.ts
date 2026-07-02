import { NextResponse } from 'next/server';
import { getBeds24Bookings } from '@/lib/beds24';
import { supabase } from '@/lib/supabase';
import {
  sendTemplate2_UltimoAviso,
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

    // 5. Calcular variables de tiempo en México (CST/CDT)
    const mexicoTime = getMexicoTime();
    const currentHour = mexicoTime.getHours();

    const todayStr = mexicoTime.toISOString().split('T')[0];
    const tomorrowStr = new Date(mexicoTime.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const yesterdayStr = new Date(mexicoTime.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Rango de fechas aproximadas para fidelización (Mensaje 9)
    const sixMonthsAgoStr = new Date(mexicoTime.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const twelveMonthsAgoStr = new Date(mexicoTime.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const reports: string[] = [];

    // 6. Recorrer reservaciones y validar reglas
    for (const booking of allBookings) {
      const bookingIdStr = String(booking.id);
      const guestPhone = booking.phone || booking.mobile || booking.guest_phone;
      if (!guestPhone) continue;

      const isDirect = ['Directo', 'WhatsApp Bot', 'Beds24', 'Recepción'].includes(booking.channel || '');

      // --- REGLA 2: Mensaje 2 - Último aviso para reservar ---
      // Se envía 23 horas después de crear la reserva si no tiene anticipo ($0)
      if (isDirect && Number(booking.deposit || 0) === 0 && booking.booking_time) {
        const createdDate = new Date(booking.booking_time);
        const hoursAgo = (new Date().getTime() - createdDate.getTime()) / (1000 * 60 * 60);
        
        // Rango de tolerancia de 22 a 24 horas
        if (hoursAgo >= 22.5 && hoursAgo <= 24.5) {
          const logKey = `${bookingIdStr}_ultimo_aviso`;
          if (!sentSet.has(logKey)) {
            const res = await sendTemplate2_UltimoAviso(booking);
            if (res.success) {
              await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'ultimo_aviso', phone: guestPhone }]);
              reports.push(`Enviado Mensaje 2 (Último aviso) a ${booking.guest_name} (ID: ${bookingIdStr})`);
            }
          }
        }
      }

      // --- REGLA 5: Mensaje 5 - Preparación para tu llegada (24h antes del check-in) ---
      // Se envía típicamente a las 9 A.M. del día previo al check-in
      if (booking.check_in === tomorrowStr && currentHour === 9) {
        const logKey = `${bookingIdStr}_preparacion_llegada`;
        if (!sentSet.has(logKey)) {
          const res = await sendTemplate5_PreparacionLlegada(booking);
          if (res.success) {
            await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'preparacion_llegada', phone: guestPhone }]);
            reports.push(`Enviado Mensaje 5 (Prep llegada) a ${booking.guest_name} (ID: ${bookingIdStr})`);
          }
        }
      }

      // --- REGLA 7: Mensaje 7 - Seguimiento de satisfacción ---
      // Se envía a las 10:00 A.M. del segundo día de estancia (noches >= 2)
      if (booking.check_in === yesterdayStr && Number(booking.nights || 1) >= 2 && currentHour === 10) {
        const logKey = `${bookingIdStr}_seguimiento_satisfaccion`;
        if (!sentSet.has(logKey)) {
          const res = await sendTemplate7_SeguimientoSatisfaccion(booking);
          if (res.success) {
            await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'seguimiento_satisfaccion', phone: guestPhone }]);
            reports.push(`Enviado Mensaje 7 (Satisfacción) a ${booking.guest_name} (ID: ${bookingIdStr})`);
          }
        }
      }

      // --- REGLA 8: Mensaje 8 - Día de salida (salida_checkout) ---
      // Se envía a las 7:00 A.M. del día de la salida (check_out === hoy)
      if (booking.check_out === todayStr && currentHour === 7) {
        const logKey = `${bookingIdStr}_salida_checkout`;
        if (!sentSet.has(logKey)) {
          const res = await sendTemplate8_SalidaCheckout(booking);
          if (res.success) {
            await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'salida_checkout', phone: guestPhone }]);
            reports.push(`Enviado Mensaje 8 (Salida Checkout) a ${booking.guest_name} (ID: ${bookingIdStr})`);
          }
        }
      }

      // --- REGLA 9: Mensaje 9 - Comparte tu experiencia ---
      // Se envía a las 7:00 P.M. del día de la salida (check_out === hoy)
      if (booking.check_out === todayStr && currentHour === 19) {
        const logKey = `${bookingIdStr}_comparte_experiencia`;
        if (!sentSet.has(logKey)) {
          const res = await sendTemplate9_ComparteExperiencia(booking);
          if (res.success) {
            await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'comparte_experiencia', phone: guestPhone }]);
            reports.push(`Enviado Mensaje 9 (Compartir opinión) a ${booking.guest_name} (ID: ${bookingIdStr})`);
          }
        }
      }

      // --- REGLA 10: Mensaje 10 - ¡Nos encantaría recibirte nuevamente! (Fidelización) ---
      // Se envía a las 9:00 A.M., a los 6 meses (180 días) o 12 meses (365 días) del checkout
      if (currentHour === 9) {
        if (booking.check_out === sixMonthsAgoStr) {
          const logKey = `${bookingIdStr}_recibimiento_nuevamente_6m`;
          if (!sentSet.has(logKey)) {
            const res = await sendTemplate10_RecibimientoNuevamente(booking);
            if (res.success) {
              await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'recibimiento_nuevamente_6m', phone: guestPhone }]);
              reports.push(`Enviado Mensaje 10 (Fidelización 6m) a ${booking.guest_name} (ID: ${bookingIdStr})`);
            }
          }
        } else if (booking.check_out === twelveMonthsAgoStr) {
          const logKey = `${bookingIdStr}_recibimiento_nuevamente_12m`;
          if (!sentSet.has(logKey)) {
            const res = await sendTemplate10_RecibimientoNuevamente(booking);
            if (res.success) {
              await supabase.from('whatsapp_logs').insert([{ reservation_id: bookingIdStr, template_name: 'recibimiento_nuevamente_12m', phone: guestPhone }]);
              reports.push(`Enviado Mensaje 10 (Fidelización 12m) a ${booking.guest_name} (ID: ${bookingIdStr})`);
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
