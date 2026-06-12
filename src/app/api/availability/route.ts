import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { 
  fetchAllRawBeds24Bookings, 
  getParentMapping,
  getBeds24Token,
  fetchBeds24RatesMap,
  getAverageRatesForDates,
  getChildRoomId
} from '@/lib/beds24';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ROOM_MAP = [
  { 
    roomId: '679092', 
    name: 'Apartamento de 3 dormitorios',
    units: [
      { unitId: '1', name: '101' },
      { unitId: '2', name: '102' },
      { unitId: '3', name: '103' },
      { unitId: '4', name: '104' },
      { unitId: '5', name: '105' },
      { unitId: '6', name: '106' },
      { unitId: '7', name: '107' }
    ]
  },
  { 
    roomId: '679091', 
    name: 'Apartamento de 2 dormitorios',
    units: [
      { unitId: '1', name: '201' },
      { unitId: '2', name: '202' },
      { unitId: '3', name: '203' },
      { unitId: '4', name: '204' },
      { unitId: '5', name: '205' },
      { unitId: '6', name: '206' }
    ]
  },
  { 
    roomId: '679093', 
    name: 'Casa Vacacional de 3 dormitorios',
    units: [
      { unitId: '1', name: '401' }
    ]
  },
  { 
    roomId: '679087', 
    name: 'Apartamento de 1 dormitorio',
    units: [
      { unitId: '1', name: '402' }
    ]
  },
  { 
    roomId: '679077', 
    name: 'Habitación Doble',
    units: [
      { unitId: '1', name: '301' },
      { unitId: '2', name: '302' },
      { unitId: '3', name: '303' },
      { unitId: '4', name: '304' },
      { unitId: '5', name: '305' },
      { unitId: '6', name: '306' }
    ]
  },
  {
    roomId: '685542',
    name: 'Apartamentos Nuevos (500-507)',
    units: [
      { unitId: '1', name: '500' },
      { unitId: '2', name: '501' },
      { unitId: '3', name: '502' },
      { unitId: '4', name: '503' },
      { unitId: '5', name: '504' },
      { unitId: '6', name: '505' },
      { unitId: '7', name: '506' },
      { unitId: '8', name: '507' }
    ]
  }
];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const checkIn = searchParams.get('checkIn');
    const checkOut = searchParams.get('checkOut');

    if (!checkIn || !checkOut) {
      return NextResponse.json({ error: 'Faltan fechas de checkIn y checkOut' }, { status: 400 });
    }

    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 180);
    const arrivalFrom = fromDate.toISOString().split('T')[0];

    const toDate = new Date(today);
    toDate.setDate(today.getDate() + 1000);
    const arrivalTo = toDate.toISOString().split('T')[0];

    const bookingsRaw = await fetchAllRawBeds24Bookings(arrivalFrom, arrivalTo);
    const bookingsData = { data: bookingsRaw };

    // Obtener las tarifas del calendario de Beds24 para el rango solicitado
    let beds24RatesMap: Record<string, Record<string, number>> = {};
    try {
      const BEDS24_TOKEN = await getBeds24Token();
      beds24RatesMap = await fetchBeds24RatesMap(BEDS24_TOKEN, checkIn, checkOut);
    } catch (tokenErr) {
      console.warn("[Availability API] Failed to fetch Beds24 token or calendar rates:", tokenErr);
    }

    // Calcular ocupación cruzada
    const occupiedUnits = new Set<string>();
    const reqIn = new Date(checkIn);
    const reqOut = new Date(checkOut);

    const bookings = bookingsData.data && Array.isArray(bookingsData.data) ? bookingsData.data : [];

    bookings.forEach((b: any) => {
      if (String(b.status) !== '0' && b.status !== 'cancelled') {
        const bIn = new Date(b.arrival);
        const bOut = new Date(b.departure);
        
        // Hay solapamiento si la entrada de la reserva es ANTES de que el nuevo cliente salga,
        // Y la salida de la reserva es DESPUÉS de que el nuevo cliente entre.
        if (bIn < reqOut && bOut > reqIn) {
          if (b.roomId) {
            const parent = getParentMapping(b.roomId, b.unitId);
            occupiedUnits.add(`${parent.roomId}_${parent.unitId}`);
          }
        }
      }
    });

    // Cargar también las reservas locales activas de Supabase
    try {
      const { data: localBookings } = await supabase
        .from('local_reservas')
        .select('*')
        .neq('status', 'cancelled');

      (localBookings || []).forEach((b: any) => {
        const bIn = new Date(b.check_in);
        const bOut = new Date(b.check_out);
        if (bIn < reqOut && bOut > reqIn) {
          occupiedUnits.add(`${b.room_id}_${b.unit_id}`);
        }
      });
    } catch (localDbErr) {
      console.error("[Availability API] Error reading local_reservas:", localDbErr);
    }

    // Construir el inventario final con disponibilidad y tarifas dinámicas
    const inventory = ROOM_MAP.map(r => {
      return {
        roomId: r.roomId,
        name: r.name,
        units: r.units.map(u => {
          const childId = getChildRoomId(r.roomId, u.unitId) || r.roomId;
          const averageRate = getAverageRatesForDates(
            childId, 
            checkIn, 
            checkOut, 
            'Directo', 
            beds24RatesMap, 
            u.unitId
          );
          return {
            unitId: u.unitId,
            name: u.name,
            isAvailable: !occupiedUnits.has(`${r.roomId}_${u.unitId}`),
            price: averageRate // Tarifa dinámica real por noche
          };
        })
      };
    });

    return NextResponse.json({ success: true, inventory });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
