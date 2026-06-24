import { NextResponse } from 'next/server';
import { fetchAllRawBeds24Bookings, getUnitName, getRealPrice, getRoomMetadata } from '@/lib/beds24';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function fetchBeds24Bookings() {
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 180);
  const arrivalFrom = fromDate.toISOString().split('T')[0];

  const toDate = new Date(today);
  toDate.setDate(today.getDate() + 1000);
  const arrivalTo = toDate.toISOString().split('T')[0];

  return fetchAllRawBeds24Bookings(arrivalFrom, arrivalTo);
}

function mapBooking(b: any, dynamicSettings?: any) {
  const arrival   = b.arrival   ? new Date(b.arrival)   : null;
  const departure = b.departure ? new Date(b.departure) : null;
  const nights = (arrival && departure)
    ? Math.max(1, Math.round((departure.getTime() - arrival.getTime()) / 86400000))
    : 1;

  const rawSource = String(`${b.referer || ''} ${b.source || ''} ${b.apiSource || ''} ${b.apiReference || ''}`).toLowerCase();
  const guestNameUpper = `${b.firstName || ''} ${b.lastName || ''}`.toUpperCase();
  let channel = 'Directo';
  if (rawSource.includes('airbnb') || guestNameUpper.includes('PAGADO A')) channel = 'Airbnb';
  else if (rawSource.includes('booking') || guestNameUpper.includes('PAGADO B')) channel = 'Booking.com';
  else if (rawSource.includes('expedia')) channel = 'Expedia';
  else if (rawSource.includes('whatsapp') || rawSource.includes('n8n')) channel = 'WhatsApp Bot';
  else if (rawSource.includes('beds24')) channel = 'Beds24';

  const status = (b.status === '1' || b.status === 'confirmed') ? 'Confirmada' : 'Pendiente';

  // ── Calcular Metadata Condominios Jaroje ──
  const roomData = getRoomMetadata(b.roomId, b.roomName);
  const unitName = getUnitName(b.roomId, b.unitId);
  const displayRoomName = unitName 
    ? (roomData.nombre.includes(unitName) ? roomData.nombre : `${roomData.nombre} (${unitName})`)
    : roomData.nombre;
  
  // Precio por noche dinámico: si API da precio, lo usamos. Si no, calculamos.
  const isOTA = ['Airbnb', 'Booking.com', 'Expedia'].includes(channel);
  let pricePerNight = b.price ? (Number(b.price) / nights) : null;
  if (!isOTA && (!pricePerNight || pricePerNight <= 0)) {
    pricePerNight = getRealPrice(String(b.roomId), b.arrival, rawSource, undefined, undefined, dynamicSettings);
  } else if (isOTA && !pricePerNight) {
    pricePerNight = 0;
  }
  pricePerNight = Math.round(pricePerNight ?? 0);
  const totalRevenue = Math.round(pricePerNight * nights);

  return {
    ID_Reserva:          b.id            ?? '',
    Nombre_Huesped:      `${b.firstName || ''}${b.lastName ? ' ' + b.lastName : ''}`.trim() || 'Huésped',
    Email:               b.email         ?? '',
    Telefono:            b.phone || b.mobile || b.guestPhone || b.guestMobile || '',
    Fecha_CheckIn:       b.arrival       ?? '',
    Fecha_CheckOut:      b.departure     ?? '',
    Noches:              nights,
    Canal_Reserva:       channel,
    Estado:              status,
    // ── Metadata Exclusiva Jaroje ──
    Propiedad_Nombre:    roomData.nombre,
    Habitacion_Asignada: unitName ?? 'Sin asignar',
    Nombre_Completo_Hab: displayRoomName,
    Categoria_Propiedad: roomData.categoria,
    Capacidad_Max:       roomData.capacidad,
    Info_Camas:          roomData.camas,
    Amenities:           roomData.amenities,
    ID_Habitacion_Api:   b.roomId        ?? '',
    // ── Precios Dinámicos ──
    Precio_Noche_MXN:      pricePerNight,
    Revenue_Estimado_MXN:  totalRevenue,
    Notas_Reserva:       b.info ?? b.notes ?? '',
    Fecha_Exportacion:   new Date().toISOString().split('T')[0],
  };
}

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') ?? 'json'; // 'json' | 'csv'

    // Cargar dynamicSettings
    let dynamicSettings: any = null;
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'pricing_unit_settings')
        .maybeSingle();
      if (!error && data && data.value) {
        dynamicSettings = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      }
    } catch (err) {
      console.error("Error al obtener dynamicSettings en API export:", err);
    }

    const raw      = await fetchBeds24Bookings();
    const bookings = raw
      .filter((b: any) => String(b.status) !== '0' && b.status !== 'cancelled')
      .map((b: any) => mapBooking(b, dynamicSettings));

    // ── JSON (para Power Query "From Web" o SQL directo) ──────────────────
    if (format === 'json') {
      return NextResponse.json(
        {
          success:        true,
          export_date:    new Date().toISOString(),
          source:         'Beds24 API v2',
          total_records:  bookings.length,
          currency:       'MXN',
          data:           bookings,
        },
        {
          headers: {
            'Access-Control-Allow-Origin': '*', // Permite que Power Query lo consuma sin CORS
            'Cache-Control': 'no-store',
          }
        }
      );
    }

    // ── CSV (para Power Query "From CSV" o importar en Excel/SQL) ─────────
    if (format === 'csv') {
      if (bookings.length === 0) {
        return new Response('No hay reservas para exportar.', { status: 204 });
      }

      const headers = Object.keys(bookings[0]);
      const rows    = bookings.map((b: Record<string, any>) =>
        headers.map(h => {
          const val = (b as any)[h];
          const str = String(val ?? '').replace(/"/g, '""');
          return str.includes(',') || str.includes('\n') ? `"${str}"` : str;
        }).join(',')
      );

      const csv = [headers.join(','), ...rows].join('\n');
      const filename = `jaroje_reservas_${new Date().toISOString().split('T')[0]}.csv`;

      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        }
      });
    }

    // ── SQL (Para Power Query o bases de datos SQL directas) ─────────────────
    if (format === 'sql') {
      if (bookings.length === 0) {
        return new Response('-- No hay reservas para exportar.\n', { status: 200, headers: { 'Content-Type': 'text/plain' }});
      }

      const headers = Object.keys(bookings[0]);
      
      let sqlString = `-- Generado por Jaroje OS\n`;
      sqlString += `-- Fecha: ${new Date().toISOString()}\n\n`;

      // Crear tabla
      sqlString += `CREATE TABLE IF NOT EXISTS jaroje_reservas (\n`;
      sqlString += headers.map(h => {
        if (h === 'Noches') return `  ${h} INT`;
        if (h === 'Revenue_Estimado_MXN' || h === 'Precio_Noche_MXN') return `  ${h} DECIMAL(10,2)`;
        if (h === 'Fecha_CheckIn' || h === 'Fecha_CheckOut' || h === 'Fecha_Exportacion') return `  ${h} DATE`;
        return `  ${h} VARCHAR(255)`;
      }).join(',\n');
      sqlString += `\n);\n\n`;

      // Borrar datos anteriores para no duplicar si se importa a diario
      sqlString += `TRUNCATE TABLE jaroje_reservas;\n\n`;

      // Insert statements
      const rows = bookings.map((b: Record<string, any>) => {
        const values = headers.map(h => {
          const val = b[h];
          if (val === null || val === undefined || val === '') return 'NULL';
          if (typeof val === 'number') return val;
          // Escapar comillas simples
          return `'${String(val).replace(/'/g, "''")}'`;
        });
        return `(${values.join(', ')})`;
      });

      sqlString += `INSERT INTO jaroje_reservas (${headers.join(', ')}) VALUES \n`;
      sqlString += rows.join(',\n') + ';\n';

      const filename = `jaroje_reservas_${new Date().toISOString().split('T')[0]}.sql`;

      return new Response(sqlString, {
        status: 200,
        headers: {
          'Content-Type': 'application/sql; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        }
      });
    }

    return NextResponse.json({ error: 'format inválido. Usa ?format=json, ?format=csv o ?format=sql' }, { status: 400 });


  } catch (err: any) {
    const status = err.message === 'TOKEN_EXPIRED' ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
