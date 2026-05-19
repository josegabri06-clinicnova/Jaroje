import { NextResponse } from 'next/server';

async function getBeds24Token(): Promise<string> {
  const tempToken = process.env.BEDS24_TEMP_TOKEN;
  const refreshToken = process.env.BEDS24_REFRESH_TOKEN;

  if (!refreshToken) throw new Error('Falta BEDS24_REFRESH_TOKEN en .env');

  if (tempToken) {
    const probe = await fetch('https://api.beds24.com/v2/bookings?limit=1', {
      headers: { 'token': tempToken },
      cache: 'no-store'
    });
    if (probe.ok || probe.status === 404) return tempToken;
  }

  const refreshRes = await fetch('https://api.beds24.com/v2/authentication/token', {
    method: 'GET',
    headers: { 'refreshToken': refreshToken },
    cache: 'no-store'
  });
  const refreshData = await refreshRes.json();

  if (!refreshData.token) {
    throw new Error('TOKEN_EXPIRED');
  }

  process.env.BEDS24_TEMP_TOKEN = refreshData.token;
  if (refreshData.refreshToken) {
    process.env.BEDS24_REFRESH_TOKEN = refreshData.refreshToken;
  }

  return refreshData.token;
}

const ROOM_MAP = [
  { 
    roomId: '679077', 
    name: 'Habitación Estándar',
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
    name: 'Condominio 1R',
    units: [
      { unitId: '1', name: '401' }
    ]
  },
  { 
    roomId: '679091', 
    name: 'Condominio 2R',
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
    name: 'Condominio 3R',
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
    name: 'Casa de Lujo',
    units: [
      { unitId: '1', name: '402' }
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

    const bookingsRes = await fetch('https://api.beds24.com/v2/bookings', {
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
      if (b.status !== 'cancelled' && b.status !== '0') {
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
