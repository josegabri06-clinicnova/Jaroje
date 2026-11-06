import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { listAuthorizedBookingIds } from '@/lib/guest-auth';
import { physicalRoomName } from '@/lib/room-names';
import { rateLimitResponse } from '@/lib/public-rate-limit';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const INT4_MAX = 2_147_483_647;

// Día de hoy en la hora del hotel: una estancia que sale hoy sigue "en curso" hasta que acaba el día, no hasta medianoche UTC
const todayInHotel = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
const dayOf = (v: unknown) => String(v ?? '').split('T')[0].split(' ')[0].trim();

interface Stay {
  id: string;
  room_name: string;
  check_in: string;
  check_out: string;
  phase: 'in_house' | 'upcoming';
}

/**
 * GET /api/public/mi-estancia
 * Estancias confirmadas (en curso y futuras) que ESTE dispositivo tiene autorizadas.
 *
 * No recibe ningún dato del navegador: ni teléfono ni número de reserva. El servidor lee las cookies firmadas jg_<id> que el
 * huésped recibió al reservar o al verificar los 4 últimos dígitos, y solo devuelve esas reservas, con los mismos datos que ya
 * ve en su portal (habitación, fechas y estado). Sin cookies válidas no consulta la base de datos.
 */
export async function GET(req: Request) {
  try {
    const authorizedIds = await listAuthorizedBookingIds(req);
    if (authorizedIds.length === 0) return NextResponse.json({ success: true, stays: [] }, { headers: NO_STORE });

    // Solo las peticiones que consultan la base cuentan para el límite (60 / 15 min por IP)
    const limited = await rateLimitResponse(req, 'mi-estancia', { max: 60, windowMs: 15 * 60_000, lockMs: 5 * 60_000 });
    if (limited) return limited;

    const today = todayInHotel();
    const authorized = new Set(authorizedIds);
    const localIds = authorizedIds.filter((id) => Number(id) <= INT4_MAX); // un id largo de Beds24 desbordaría la columna y fallaría la consulta
    const orFilter = [
      localIds.length ? `id.in.(${localIds.join(',')})` : null,
      ...authorizedIds.map((id) => `notes.like.%B24:${id}%`), // reserva local ligada a un número de Beds24 (solo dígitos: sin riesgo de inyección)
    ].filter(Boolean).join(',');

    const [local, b24] = await Promise.all([
      supabase.from('local_reservas').select('id, check_in, check_out, status, room_id, unit_id, notes').gte('check_out', today).or(orFilter),
      supabase.from('beds24_reservations').select('id, room_name, check_in, check_out, status').in('id', authorizedIds).gte('check_out', today),
    ]);
    if (local.error || b24.error) {
      console.error('[Mi estancia] Error consultando reservas:', local.error?.message || b24.error?.message);
      return NextResponse.json({ success: true, stays: [] }, { headers: NO_STORE });
    }

    const stays: Stay[] = [];
    const coveredByLocal = new Set<string>(); // números de Beds24 que ya muestra una reserva local, para no repetirlos

    for (const r of local.data ?? []) {
      // Con qué cookie del dispositivo se abre: la del propio id local o la del número de Beds24 de sus notas.
      // El filtro LIKE de la consulta es amplio (B24:12 también encaja con B24:123): aquí se exige coincidencia exacta.
      const b24Ids = [...String(r.notes ?? '').matchAll(/B24:\s*(\d{1,15})/g)].map((m) => m[1]);
      const portalId = authorized.has(String(r.id)) ? String(r.id) : b24Ids.find((id) => authorized.has(id));
      if (!portalId) continue;
      b24Ids.forEach((id) => coveredByLocal.add(id));
      if ((r.status ?? 'confirmed') !== 'confirmed') continue;
      const checkIn = dayOf(r.check_in);
      stays.push({
        id: portalId,
        room_name: `Habitación${physicalRoomName(r.room_id, r.unit_id) ? ' ' + physicalRoomName(r.room_id, r.unit_id) : ''}`,
        check_in: checkIn,
        check_out: dayOf(r.check_out),
        phase: checkIn <= today ? 'in_house' : 'upcoming',
      });
    }

    for (const r of b24.data ?? []) {
      const id = String(r.id);
      if (coveredByLocal.has(id) || r.status !== 'confirmed') continue;
      const checkIn = dayOf(r.check_in);
      stays.push({
        id,
        room_name: r.room_name || 'Habitación',
        check_in: checkIn,
        check_out: dayOf(r.check_out),
        phase: checkIn <= today ? 'in_house' : 'upcoming',
      });
    }

    stays.sort((a, b) => a.check_in.localeCompare(b.check_in));
    return NextResponse.json({ success: true, stays: stays.slice(0, 10) }, { headers: NO_STORE });
  } catch (err) {
    console.error('[Mi estancia] Error:', err instanceof Error ? err.message : 'desconocido');
    return NextResponse.json({ success: true, stays: [] }, { headers: NO_STORE });
  }
}
