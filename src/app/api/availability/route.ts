import { NextResponse } from 'next/server';
import { getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

const ROOM_MAP = [
  { 
    roomId: '679077', 
    name: 'Habitación DOBLE - 2 camas dobles',
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
    roomId: '679087', 
    name: 'Apartamento Premier de 1 dormitorio',
    units: [
      { unitId: '1', name: '402' }
    ]
  },
  { 
    roomId: '679091', 
    name: 'Apartamento Premier de 2 dormitorios',
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
    roomId: '679092', 
    name: 'Apartamento Premier de 3 dormitorios',
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
    roomId: '679093', 
    name: 'Casa Vacacional de 3 dormitorios',
    units: [
      { unitId: '1', name: '401' }
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

    const BEDS24_TOKEN = await getBeds24Token();

    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 180);
    const arrivalFrom = fromDate.toISOString().split('T')[0];

    const toDate = new Date(today);
    toDate.setDate(today.getDate() + 1000);
    const arrivalTo = toDate.toISOString().split('T')[0];

    const bookingsRes = await fetch(`https://api.beds24.com/v2/bookings?arrivalFrom=${arrivalFrom}&arrivalTo=${arrivalTo}&limit=1000`, {
      method: 'GET',
      headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
      cache: 'no-store'
    });
    
    const bookingsData = await bookingsRes.ok ? await bookingsRes.json() : { data: [] };

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
          if (b.roomId && b.unitId) {
            occupiedUnits.add(`${b.roomId}_${b.unitId}`);
          }
        }
      }
    });

    // Construir el inventario final con disponibilidad
    const inventory = ROOM_MAP.map(r => {
      return {
        roomId: r.roomId,
        name: r.name,
        units: r.units.map(u => {
          return {
            unitId: u.unitId,
            name: u.name,
            isAvailable: !occupiedUnits.has(`${r.roomId}_${u.unitId}`)
          };
        })
      };
    });

    return NextResponse.json({ success: true, inventory });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
