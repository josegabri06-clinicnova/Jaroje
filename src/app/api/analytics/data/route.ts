import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Helper para traer todos los registros de una tabla en Supabase sin límite de 1,000 filas
async function fetchAllRows(tableName: string, selectFields = '*', filterFn?: (q: any) => any) {
  const PAGE_SIZE = 1000;
  let allRows: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from(tableName).select(selectFields).range(from, from + PAGE_SIZE - 1);
    if (filterFn) {
      query = filterFn(query);
    }
    const { data, error } = await query;
    if (error) {
      console.error(`[Analytics Data] Error al consultar tabla ${tableName} (offset ${from}):`, error);
      break;
    }
    if (data && data.length > 0) {
      allRows = allRows.concat(data);
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        from += PAGE_SIZE;
      }
    } else {
      hasMore = false;
    }
  }
  return allRows;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const forceSync = searchParams.get('sync') === 'true';

    // 1. Obtener todas las reservas de Beds24 (excluyendo categoría virtual 500 para evitar duplicados)
    const dbB24Reservations = await fetchAllRows('beds24_reservations', '*', (q) => q.neq('room_id', '685542'));

    // 2. Obtener todas las reservas locales
    const localReservas = await fetchAllRows('local_reservas', '*');

    // 3. Obtener todos los registros de finanzas
    const finances = await fetchAllRows('finances', '*');

    // Mapear reservas de Beds24 a formato unificado
    const mappedBeds24 = dbB24Reservations.map((b: any) => {
      const arrivalDate = b.check_in ? new Date(b.check_in + 'T12:00:00') : null;
      const departureDate = b.check_out ? new Date(b.check_out + 'T12:00:00') : null;
      const nights = (arrivalDate && departureDate)
        ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 1;

      // Extraer comisión si existe en invoice_items o campo dedicado
      let commissionVal = Number(b.commission || 0);
      if (commissionVal <= 0 && Array.isArray(b.invoice_items)) {
        const commMeta = b.invoice_items.find((it: any) => it.metaType === 'beds24_commission_info');
        if (commMeta && commMeta.commission) {
          commissionVal = Number(commMeta.commission);
        }
      }

      // Si no viene comisión registrada y es OTA, estimar según porcentaje estándar
      const channel = b.channel || 'Directo';
      const price = Number(b.price || b.price_estimate || 0);
      if (commissionVal <= 0) {
        if (channel === 'Booking.com') {
          commissionVal = Math.round(price * 0.175 * 100) / 100;
        } else if (channel === 'Airbnb') {
          commissionVal = Math.round(price * 0.03 * 100) / 100;
        } else if (channel === 'Expedia') {
          commissionVal = Math.round(price * 0.18 * 100) / 100;
        }
      }

      return {
        id: String(b.id),
        masterId: b.master_id || null,
        actualPaid: Number(b.actual_paid || 0),
        rawDeposit: Number(b.deposit || 0),
        check_in: b.check_in,
        check_out: b.check_out,
        arrival: b.check_in,
        departure: b.check_out,
        guest_name: b.guest_name || 'Huésped',
        guest_phone: b.guest_phone || null,
        guest_email: b.guest_email || null,
        status: b.status, // 'confirmed', 'cancelled', 'black', 'pending'
        source: 'beds24',
        channel: channel,
        room_name: b.room_name || '',
        room: b.room || '',
        room_id: Number(b.room_id || 0),
        unit_id: String(b.unit_id || ''),
        nights: nights,
        price_estimate: price,
        price: price,
        deposit: Number(b.deposit || 0),
        balance: Number(b.balance || 0),
        notes: b.notes || null,
        num_adult: Number(b.num_adult || 1),
        num_child: Number(b.num_child || 0),
        commission: commissionVal,
        rate_description: b.rate_description || '',
        invoice_items: b.invoice_items || [],
        created_at: b.created_at || b.check_in || null,
        updated_at: b.updated_at || null
      };
    });

    // Mapear reservas locales a formato unificado
    const mappedLocales = localReservas.map((l: any) => {
      const arrivalDate = l.check_in ? new Date(l.check_in + 'T12:00:00') : null;
      const departureDate = l.check_out ? new Date(l.check_out + 'T12:00:00') : null;
      const nights = (arrivalDate && departureDate)
        ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 1;

      const price = Number(l.total_price || l.price || 0);

      return {
        id: String(l.id),
        masterId: null,
        actualPaid: Number(l.deposit || 0),
        rawDeposit: Number(l.deposit || 0),
        check_in: l.check_in,
        check_out: l.check_out,
        arrival: l.check_in,
        departure: l.check_out,
        guest_name: l.guest_name || 'Huésped Local',
        guest_phone: l.phone || l.guest_phone || null,
        guest_email: l.email || l.guest_email || null,
        status: l.status || 'confirmed',
        source: 'local',
        channel: l.origin || 'Directo',
        room_name: l.room_number ? `Habitación ${l.room_number}` : 'Habitación Local',
        room: l.room_number || '',
        room_id: 0,
        unit_id: l.room_number || '',
        nights: nights,
        price_estimate: price,
        price: price,
        deposit: Number(l.deposit || 0),
        balance: Math.max(0, price - Number(l.deposit || 0)),
        notes: l.notes || null,
        num_adult: Number(l.num_adult || 1),
        num_child: Number(l.num_child || 0),
        commission: 0,
        rate_description: 'Reserva Directa Local',
        invoice_items: [],
        created_at: l.created_at || l.check_in || null,
        updated_at: l.updated_at || null
      };
    });

    // Unir todas las reservas eliminando duplicados por ID
    const allReservasMap = new Map<string, any>();
    mappedBeds24.forEach(r => allReservasMap.set(r.id, r));
    mappedLocales.forEach(r => {
      if (!allReservasMap.has(r.id)) {
        allReservasMap.set(r.id, r);
      }
    });

    const combinedReservas = Array.from(allReservasMap.values());

    return NextResponse.json({
      success: true,
      data: {
        reservas: combinedReservas,
        finances: finances,
        summary: {
          totalReservas: combinedReservas.length,
          totalBeds24: mappedBeds24.length,
          totalLocales: mappedLocales.length,
          totalFinances: finances.length
        }
      }
    });
  } catch (err: any) {
    console.error("[Analytics Data GET] Error:", err);
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
