import { NextResponse } from 'next/server';
import { getBeds24Bookings } from '@/lib/beds24';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug-rooms
 * Diagnóstico completo de los colores de habitaciones para HOY.
 * Muestra qué reservas matchean cada habitación y por qué se asigna cada color.
 */

const ROOMS = [
  '101','102','103','104','105','106','107',
  '201','202','203','204','205','206',
  '301','302','303','304','305','306',
  '401','402',
  '500','501','502','503','504','505','506','507',
];

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

function matchesRoomNumber(r: any, roomNum: string): boolean {
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
}

export async function GET() {
  try {
    const now = new Date();
    // Fecha local (Mexico UTC-6)
    const offset = -6;
    const local = new Date(now.getTime() + (offset - (-now.getTimezoneOffset() / 60)) * 60 * 60 * 1000);
    const todayStr = local.toISOString().split('T')[0];

    // 1. Cargar reservas Beds24 + locales
    const allBookings = await getBeds24Bookings(false, false, true);

    // 2. Cargar checkins de Supabase
    const { data: checkins } = await supabase.from('checkins').select('*');
    const checkinMap: Record<string, any> = {};
    (checkins || []).forEach((c: any) => {
      checkinMap[String(c.reservation_id)] = c;
    });

    // 3. Cargar room_status de Supabase
    const { data: roomStatuses } = await supabase.from('room_status').select('*');
    const roomStatusMap: Record<string, any> = {};
    (roomStatuses || []).forEach((rs: any) => {
      roomStatusMap[String(rs.room_number)] = rs;
    });

    // 4. Enriquecer reservas con checked_in / checked_out
    const reservas = allBookings.map((res: any) => ({
      ...res,
      room: res.room || res.room_name || '',
      checked_in: checkinMap[String(res.id)]?.status === 'checked_in',
      checked_out: checkinMap[String(res.id)]?.status === 'checked_out',
    }));

    // 5. Diagnóstico por habitación
    const diagnosis: any[] = [];

    for (const roomNum of ROOMS) {
      // Encontrar reservas que matchean esta habitación
      const matchingReservations = reservas.filter((r: any) => matchesRoomNumber(r, roomNum));

      const dbStatusObj = roomStatusMap[roomNum];
      const dbStatus = dbStatusObj?.status || 'disponible';
      const lastUpdatedAt = dbStatusObj?.updated_at;

      // ── Misma lógica que getRoomOperationalStatus ──
      let isCleanedToday = false;
      let isSucioCheckoutToday = false;
      let isEnLimpiezaToday = false;
      if (lastUpdatedAt) {
        const updateDateStr = (lastUpdatedAt || '').split('T')[0].split(' ')[0];
        if (updateDateStr === todayStr) {
          if (dbStatus === 'limpia') isCleanedToday = true;
          if (dbStatus === 'sucio_checkout') isSucioCheckoutToday = true;
          if (dbStatus === 'en_limpieza') isEnLimpiezaToday = true;
        }
      }

      const salidaRes = matchingReservations.find((r: any) => {
        const cOut = (r.check_out || '').split('T')[0].split(' ')[0];
        const isTodayCheckout = cOut === todayStr;
        const isOverdueCheckout = cOut < todayStr && !r.checked_out;
        return (isTodayCheckout || isOverdueCheckout) && r.status !== 'cancelled';
      });

      const currentRes = matchingReservations.find((r: any) => {
        const cIn = (r.check_in || '').split('T')[0].split(' ')[0];
        const cOut = (r.check_out || '').split('T')[0].split(' ')[0];
        return cIn <= todayStr && cOut > todayStr && !r.checked_out && r.status !== 'cancelled';
      });

      let color = 'disponible (verde)';
      let reason = 'Sin reserva activa';

      if (salidaRes && !isCleanedToday) {
        if (isEnLimpiezaToday) {
          color = 'en_limpieza (amarillo)';
          reason = `salidaRes encontrada, en limpieza hoy`;
        } else if (salidaRes.checked_out || isSucioCheckoutToday || dbStatus === 'sucio_checkout') {
          color = 'sucio_checkout (rojo fuerte)';
          reason = `salidaRes.checked_out=${salidaRes.checked_out} || isSucioCheckoutToday=${isSucioCheckoutToday}`;
        } else {
          color = 'salida_hoy (rojo claro)';
          reason = `salidaRes checkout=${(salidaRes.check_out || '').split('T')[0]}, checked_out=${salidaRes.checked_out}`;
        }
      } else if (isSucioCheckoutToday && !isCleanedToday) {
        color = 'sucio_checkout (rojo fuerte)';
        reason = 'isSucioCheckoutToday=true y !isCleanedToday';
      } else if (currentRes) {
        if (!currentRes.checked_in) {
          color = 'limpia (azul)';
          reason = `currentRes check_in=${currentRes.check_in}, checked_in=false → Esperando llegada`;
        } else {
          const cIn = (currentRes.check_in || '').split('T')[0].split(' ')[0];
          const cInDate = new Date(cIn + 'T12:00:00');
          const tDate = new Date(todayStr + 'T12:00:00');
          const diffDays = Math.round((tDate.getTime() - cInDate.getTime()) / (1000 * 60 * 60 * 24));
          const isThreeDayRoom = ['101','102','103','104','105','106','107','201','202','203','204','205','206','401','402'].includes(roomNum);
          const isDailyRoom = ['301','302','303','304','305','306','500','501','502','503','504','505','506','507'].includes(roomNum);
          let requiresService = false;
          if (isThreeDayRoom && diffDays >= 2 && diffDays % 2 === 0) requiresService = true;
          else if (isDailyRoom && diffDays >= 1) requiresService = true;

          if (requiresService && !isCleanedToday) {
            color = 'limpieza_programada (amarillo)';
            reason = `Día ${dayOfStay} de estancia, servicio programado`;
          } else {
            color = 'ocupada (gris)';
            reason = `Día ${dayOfStay} de estancia, checked_in=true`;
          }
        }
      }

      diagnosis.push({
        room: roomNum,
        color,
        reason,
        dbStatus,
        isCleanedToday,
        isSucioCheckoutToday,
        salidaRes: salidaRes ? {
          id: salidaRes.id,
          guest: salidaRes.guest_name,
          check_out: salidaRes.check_out,
          checked_out: salidaRes.checked_out,
          status: salidaRes.status,
          room: salidaRes.room,
          room_id: salidaRes.room_id,
          room_name: salidaRes.room_name,
        } : null,
        currentRes: currentRes ? {
          id: currentRes.id,
          guest: currentRes.guest_name,
          check_in: currentRes.check_in,
          check_out: currentRes.check_out,
          checked_in: currentRes.checked_in,
          checked_out: currentRes.checked_out,
          status: currentRes.status,
          room: currentRes.room,
        } : null,
        totalMatchingReservations: matchingReservations.length,
        matchingReservations: matchingReservations.map((r: any) => ({
          id: r.id,
          guest: r.guest_name,
          check_in: r.check_in,
          check_out: r.check_out,
          checked_in: r.checked_in,
          checked_out: r.checked_out,
          status: r.status,
          room: r.room,
          room_name: r.room_name,
          room_id: r.room_id,
        })),
      });
    }

    return NextResponse.json({
      todayStr,
      serverTime: now.toISOString(),
      totalReservas: reservas.length,
      diagnosis,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
