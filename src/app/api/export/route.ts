import { NextResponse } from 'next/server';
import { getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

// ─── EXPORT API ────────────────────────────────────────────────────────────
// Este endpoint devuelve los datos de reservas en el formato óptimo para:
// - Power Query (GET /api/export?format=json)
// - CSV descargable (GET /api/export?format=csv)
// - Excel compatible (GET /api/export?format=csv con cabeceras limpias)

// ─── TARIFAS REALES JAROJE (MXN) ──────────────────────────────────────────────
const JAROJE_PRICES: Record<string, Record<string, number>> = {
  '679077': { baja: 1600, media: 1900, media_alta: 2000, alta: 2200 }, // Habitación Estándar
  '679087': { baja: 2400, media: 2850, media_alta: 3000, alta: 3300 }, // Condominio 1R
  '679091': { baja: 3200, media: 3800, media_alta: 4000, alta: 4400 }, // Condominio 2R
  '679092': { baja: 4800, media: 5700, media_alta: 6000, alta: 6600 }, // Condominio 3R
  '679093': { baja: 6400, media: 7600, media_alta: 8000, alta: 8800 }, // Casa de Lujo
};

const JAROJE_CATALOG: Record<string, any> = {
  '679077': { nombre: 'Habitación Estándar', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },
  '679087': { nombre: 'Condominio 1R', capacidad: 4, camas: '1 King o 2 Matrimoniales', amenities: 'Cocina equipada, Terraza, Alberca, Jardín, WiFi, AC', categoria: 'Condominio' },
  '679091': { nombre: 'Condominio 2R', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },
  '679092': { nombre: 'Condominio 3R', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '679093': { nombre: 'Casa de Lujo', capacidad: 12, camas: '2 King, 3 Matrimoniales', amenities: 'Casa completa, 12 personas, 5min playa', categoria: 'Casa' },
  // Fallbacks
  'default_1': { nombre: 'Habitación Estándar', capacidad: 2, camas: '2 Dobles', amenities: 'WiFi, AC', categoria: 'Estándar' },
  'default_2': { nombre: 'Condominio 1R', capacidad: 4, camas: '2 Matrimoniales', amenities: 'Cocina, WiFi, AC', categoria: 'Condominio' },
  'default_3': { nombre: 'Condominio 2R', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, 2 Baños', categoria: 'Condominio' },
  'default_4': { nombre: 'Condominio 3R', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, 3 Baños', categoria: 'Condominio' },
  'default_5': { nombre: 'Casa de Lujo', capacidad: 12, camas: '2 King, 3 Matrimoniales', amenities: 'Casa completa, Premium', categoria: 'Casa' },
};

function getSeason(dateStr: string | null | undefined): 'baja' | 'media' | 'media_alta' | 'alta' {
  if (!dateStr) return 'media';
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  if ((month === 12 && day >= 20) || (month === 1 && day <= 6)) return 'alta';
  if (month === 4 && day <= 14) return 'alta';
  if (month === 7 || month === 8) return 'media_alta';
  if (month === 11 && day >= 1 && day <= 5) return 'media_alta';
  if (month === 12 && day < 20) return 'media_alta';
  if (month === 2 || month === 3 || month === 10 || month === 11) return 'media';
  if (month === 1 && day > 6) return 'media';
  return 'baja';
}

function getChannelMultiplier(referer: string): number {
  const r = (referer || '').toLowerCase();
  if (r.includes('booking')) return 1.10;
  if (r.includes('airbnb')) return 1.25;
  return 1.0;
}

function getRealPrice(roomId: string | null | undefined, dateStr: string | null | undefined, referer: string): number {
  const id = String(roomId || '');
  const prices = JAROJE_PRICES[id];
  if (!prices) return 2000;
  const season = getSeason(dateStr);
  const base = prices[season];
  const multiplier = getChannelMultiplier(referer);
  return Math.round(base * multiplier);
}

function getRoomMetadata(roomId: string | null | undefined, roomName: string | null | undefined) {
  const id = String(roomId || '');
  if (JAROJE_CATALOG[id]) return JAROJE_CATALOG[id];
  const lowerName = (roomName || '').toLowerCase();
  if (lowerName.includes('estándar') || lowerName.includes('estandar') || lowerName.includes('standard')) return JAROJE_CATALOG['default_1'];
  if (lowerName.includes('3') && lowerName.includes('rec')) return JAROJE_CATALOG['default_4'];
  if (lowerName.includes('2') && lowerName.includes('rec')) return JAROJE_CATALOG['default_3'];
  if (lowerName.includes('casa') || lowerName.includes('lujo')) return JAROJE_CATALOG['default_5'];
  return JAROJE_CATALOG['default_2'];
}

async function fetchBeds24Bookings() {
  const BEDS24_TOKEN = await getBeds24Token();

  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 180);
  const arrivalFrom = fromDate.toISOString().split('T')[0];

  const toDate = new Date(today);
  toDate.setDate(today.getDate() + 1000);
  const arrivalTo = toDate.toISOString().split('T')[0];

  const res = await fetch(`https://api.beds24.com/v2/bookings?arrivalFrom=${arrivalFrom}&arrivalTo=${arrivalTo}&limit=1000`, {
    headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
    cache: 'no-store'
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('TOKEN_EXPIRED');
  }
  if (!res.ok) throw new Error(`Beds24 error ${res.status}`);

  const data = await res.json();
  return data.data && Array.isArray(data.data) ? data.data : [];
}

const ROOM_MAP = [
  { roomId: '679077', units: [{ unitId: '1', name: '301' }, { unitId: '2', name: '302' }, { unitId: '3', name: '303' }, { unitId: '4', name: '304' }, { unitId: '5', name: '305' }, { unitId: '6', name: '306' }] },
  { roomId: '679087', units: [{ unitId: '1', name: '402' }] },
  { roomId: '679091', units: [{ unitId: '1', name: '201' }, { unitId: '2', name: '202' }, { unitId: '3', name: '203' }, { unitId: '4', name: '204' }, { unitId: '5', name: '205' }, { unitId: '6', name: '206' }] },
  { roomId: '679092', units: [{ unitId: '1', name: '101' }, { unitId: '2', name: '102' }, { unitId: '3', name: '103' }, { unitId: '4', name: '104' }, { unitId: '5', name: '105' }, { unitId: '6', name: '106' }, { unitId: '7', name: '107' }] },
  { roomId: '679093', units: [{ unitId: '1', name: '401' }] }
];

const unitMap: Record<string, Record<string, string>> = {};
ROOM_MAP.forEach(r => {
  unitMap[r.roomId] = {};
  r.units.forEach(u => {
    unitMap[r.roomId][u.unitId] = u.name;
  });
});

function mapBooking(b: any) {
  const arrival   = b.arrival   ? new Date(b.arrival)   : null;
  const departure = b.departure ? new Date(b.departure) : null;
  const nights = (arrival && departure)
    ? Math.max(1, Math.round((departure.getTime() - arrival.getTime()) / 86400000))
    : 1;

  const rawSource = String(`${b.referer || ''} ${b.source || ''} ${b.apiSource || ''} ${b.apiReference || ''}`).toLowerCase();
  let channel = 'Directo';
  if (rawSource.includes('airbnb')) channel = 'Airbnb';
  else if (rawSource.includes('booking')) channel = 'Booking.com';
  else if (rawSource.includes('expedia')) channel = 'Expedia';
  else if (rawSource.includes('whatsapp') || rawSource.includes('n8n')) channel = 'WhatsApp Bot';
  else if (rawSource.includes('beds24')) channel = 'Beds24';

  const status = (b.status === '1' || b.status === 'confirmed') ? 'Confirmada' : 'Pendiente';

  // ── Calcular Metadata Condominios Jaroje ──
  const roomData = getRoomMetadata(b.roomId, b.roomName);
  const unitName = (unitMap[b.roomId] && b.unitId) ? unitMap[b.roomId][b.unitId] : null;
  const displayRoomName = unitName ? `${roomData.nombre} (${unitName})` : roomData.nombre;
  
  // Precio por noche dinámico: si API da precio, lo usamos. Si no, calculamos.
  const isOTA = ['Airbnb', 'Booking.com', 'Expedia'].includes(channel);
  let pricePerNight = b.price ? (Number(b.price) / nights) : null;
  if (!isOTA && (!pricePerNight || pricePerNight <= 0)) {
    pricePerNight = getRealPrice(String(b.roomId), b.arrival, rawSource);
  } else if (isOTA && !pricePerNight) {
    pricePerNight = 0;
  }
  pricePerNight = Math.round(pricePerNight ?? 0);
  const totalRevenue = Math.round(pricePerNight * nights);

  return {
    ID_Reserva:          b.id            ?? '',
    Nombre_Huesped:      `${b.firstName || ''}${b.lastName ? ' ' + b.lastName : ''}`.trim() || 'Huésped',
    Email:               b.email         ?? '',
    Telefono:            b.phone ?? b.mobile ?? '',
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

    const raw      = await fetchBeds24Bookings();
    const bookings = raw
      .filter((b: any) => String(b.status) !== '0' && b.status !== 'cancelled')
      .map(mapBooking);

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
