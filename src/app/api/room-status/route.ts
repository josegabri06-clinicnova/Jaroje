import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET — obtener estado de todas las habitaciones
export async function GET() {
  const { data, error } = await supabase
    .from('room_status')
    .select('*')
    .order('room_number');

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data ?? [] });
}

// POST — actualizar estado de una habitación
// body: { room_number, status, updated_by, checkout_reservation_id?, guest_name? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { room_number, status, updated_by, checkout_reservation_id, guest_name } = body;

    if (!room_number || !status) {
      return NextResponse.json({ error: 'Faltan room_number y status' }, { status: 400 });
    }

    const validStatuses = ['disponible', 'en_limpieza', 'limpia', 'sucio_checkout', 'limpieza_programada', 'ocupada'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Estado inválido. Usa: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    const { error } = await supabase
      .from('room_status')
      .upsert({
        room_number,
        status,
        updated_at: new Date().toISOString(),
        updated_by: updated_by || 'sistema',
        ...(checkout_reservation_id ? { checkout_reservation_id } : {}),
        ...(guest_name ? { guest_name } : {}),
      }, { onConflict: 'room_number' });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Si se marca como limpia, verificar si hay un huésped llegando hoy para esta habitación y notificarle
    if (status === 'limpia') {
      try {
        const todayStr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        
        // 1. Obtener todas las reservas de Beds24 activas directamente de Supabase (Supabase-First)
        const { data: dbB24Data } = await supabase
          .from('beds24_reservations')
          .select('*')
          .neq('status', 'cancelled')
          .neq('status', 'cancelado')
          .neq('room_id', '685542');

        const b24Bookings = (dbB24Data || []).map((b: any) => ({
          ...b,
          roomId: b.room_id,
          unitId: b.unit_id,
          check_in: b.check_in,
          check_out: b.check_out,
          guest_name: b.guest_name,
          phone: b.guest_phone || '',
          deposit: b.deposit || 0,
          channel: b.channel || 'Directo'
        }));

        // 2. Obtener reservas locales
        const { data: localData } = await supabase
          .from('local_reservas')
          .select('*')
          .neq('status', 'cancelled')
          .neq('status', 'cancelado');

        const reservas: any[] = [
          ...b24Bookings,
          ...(localData || []).map((b: any) => ({
            ...b,
            roomId: b.room_id,
            unitId: b.unit_id,
            check_in: b.check_in,
            check_out: b.check_out,
            guest_name: b.guest_name,
            phone: b.phone || '',
            isLocal: true,
            checked_in: Boolean(b.checked_in),
            checked_out: Boolean(b.checked_out)
          }))
        ];

        // 3. Obtener estados de check-in
        const { data: dbCheckins } = await supabase
          .from('checkins')
          .select('reservation_id, status');
        
        const checkinMap = new Map(dbCheckins?.map(c => [String(c.reservation_id), c.status]) || []);

        // 4. Mapeo de habitaciones para Beds24 y local
        const BEDS24_ROOM_MAP: Record<string, string> = {
          '685321': '101', '685322': '102', '685323': '103', '685324': '104', '685325': '105', '685326': '106', '685327': '107',
          '685312': '201', '685318': '202', '685314': '203', '685315': '204', '685316': '205', '685317': '206',
          '685531': '301', '685532': '302', '685533': '303', '685534': '304', '685535': '305', '685536': '306',
          '679093': '401', '679008': '401', '679087': '402',
        };

        const BEDS24_UNIT_MAP: Record<string, Record<string, string>> = {
          '679077': { '1': '301', '2': '302', '3': '303', '4': '304', '5': '305', '6': '306' },
          '679087': { '1': '402' },
          '679091': { '1': '201', '2': '202', '3': '203', '4': '204', '5': '205', '6': '206' },
          '679092': { '1': '101', '2': '102', '3': '103', '4': '104', '5': '105', '6': '106', '7': '107' },
          '679093': { '1': '401' },
        };

        const LOCAL_UNIT_MAP: Record<string, string> = {
          '1': '500', '2': '501', '3': '502', '4': '503',
          '5': '504', '6': '505', '7': '506', '8': '507',
        };

        const matchesRoom = (r: any, roomNum: string): boolean => {
          if (!r || !roomNum) return false;
          const roomIdStr = String(r.roomId || r.room_id || '');
          const unitIdStr = String(r.unitId || r.unit_id || '');

          if (roomIdStr && BEDS24_ROOM_MAP[roomIdStr]) {
            return BEDS24_ROOM_MAP[roomIdStr] === roomNum;
          }
          if (roomIdStr && unitIdStr && BEDS24_UNIT_MAP[roomIdStr]?.[unitIdStr]) {
            return BEDS24_UNIT_MAP[roomIdStr][unitIdStr] === roomNum;
          }
          if (unitIdStr && LOCAL_UNIT_MAP[unitIdStr]) {
            if (LOCAL_UNIT_MAP[unitIdStr] === roomNum) return true;
          }
          if (unitIdStr && unitIdStr === roomNum) return true;

          const roomStr = String(r.room || '').replace(/\(\d{3}-\d{3}\)/g, '');
          const roomNameStr = String(r.room_name || '').replace(/\(\d{3}-\d{3}\)/g, '');
          const regex = new RegExp(`\\b${roomNum}\\b`);
          if (regex.test(roomStr)) return true;
          if (regex.test(roomNameStr)) return true;
          return false;
        };

        const matchedRes = reservas.find(r => {
          const cIn = (r.check_in || '').split('T')[0].split(' ')[0];
          if (cIn !== todayStr) return false;

          const isCheckedIn = r.isLocal ? r.checked_in : (checkinMap.get(String(r.id)) === 'checked_in');
          const isCheckedOut = r.isLocal ? r.checked_out : (checkinMap.get(String(r.id)) === 'checked_out');

          if (isCheckedIn || isCheckedOut) return false;

          return matchesRoom(r, room_number);
        });

        if (matchedRes) {
          const channelLower = (matchedRes.channel || '').toLowerCase();
          const isOta = ['airbnb', 'booking', 'expedia'].some(ota => channelLower.includes(ota)) && !channelLower.includes('engine');
          const hasDeposit = Number(matchedRes.deposit || 0) > 0;
          
          // Verificar si ya fue revisada/confirmada (is_acknowledged o estado en checkinMap)
          const isAcknowledged = matchedRes.is_acknowledged === true || (checkinMap.get(String(matchedRes.id)) === 'acknowledged');

          const isConfirmed = isOta || hasDeposit || isAcknowledged;

          if (isConfirmed && matchedRes.status !== 'request' && matchedRes.status !== '0') {
            const phone = matchedRes.phone || matchedRes.mobile || matchedRes.guest_phone || '';
            if (phone) {
              console.log(`[Room Status -> Limpia] Sending 'alojamiento_listo' WhatsApp to ${phone} for room ${room_number}`);
              const { sendTemplate_AlojamientoListo } = await import('@/lib/whatsapp');
              const waRes = await sendTemplate_AlojamientoListo({
                id: String(matchedRes.id),
                guest_name: matchedRes.guest_name,
                phone: phone
              }, true);
              if (waRes.success) {
                console.log(`[Room Status -> Limpia] WhatsApp notification sent successfully to ${phone}`);
              } else {
                console.warn(`[Room Status -> Limpia] WhatsApp notification failed:`, waRes.error);
              }
            }
          } else {
            console.log(`[Room Status -> Limpia] Omitiendo notificación de alojamiento_listo para B24:${matchedRes.id} (Reserva directa/Google sin depósito ni confirmación del hotel, o estado request)`);
          }
        }
      } catch (errRes) {
        console.error("[Room Status -> Limpia] Error matching booking for cleaned room notification:", errRes);
      }
    }

    return NextResponse.json({ success: true, message: `Habitación ${room_number} → ${status}` });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
