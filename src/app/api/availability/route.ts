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
  // ── Piso 1: Apartamentos de 3 habitaciones (101-107) ──────────────────────
  // Cada habitación tiene su propio room type individual en Beds24 desde 2025
  { roomId: '685321', name: 'Hab. 101 - Apartamento 3 dorm.', units: [{ unitId: '1', name: '101' }] },
  { roomId: '685322', name: 'Hab. 102 - Apartamento 3 dorm.', units: [{ unitId: '1', name: '102' }] },
  { roomId: '685323', name: 'Hab. 103 - Apartamento 3 dorm.', units: [{ unitId: '1', name: '103' }] },
  { roomId: '685324', name: 'Hab. 104 - Apartamento 3 dorm.', units: [{ unitId: '1', name: '104' }] },
  { roomId: '685325', name: 'Hab. 105 - Apartamento 3 dorm.', units: [{ unitId: '1', name: '105' }] },
  { roomId: '685326', name: 'Hab. 106 - Apartamento 3 dorm.', units: [{ unitId: '1', name: '106' }] },
  { roomId: '685327', name: 'Hab. 107 - Apartamento 3 dorm.', units: [{ unitId: '1', name: '107' }] },
  // ── Piso 2: Apartamentos de 2 habitaciones (201-206) ──────────────────────
  { roomId: '685312', name: 'Hab. 201 - Apartamento 2 dorm.', units: [{ unitId: '1', name: '201' }] },
  { roomId: '685318', name: 'Hab. 202 - Apartamento 2 dorm.', units: [{ unitId: '1', name: '202' }] },
  { roomId: '685314', name: 'Hab. 203 - Apartamento 2 dorm.', units: [{ unitId: '1', name: '203' }] },
  { roomId: '685315', name: 'Hab. 204 - Apartamento 2 dorm.', units: [{ unitId: '1', name: '204' }] },
  { roomId: '685316', name: 'Hab. 205 - Apartamento 2 dorm.', units: [{ unitId: '1', name: '205' }] },
  { roomId: '685317', name: 'Hab. 206 - Apartamento 2 dorm.', units: [{ unitId: '1', name: '206' }] },
  // ── Piso 3: Habitaciones dobles (301-306) ─────────────────────────────────
  { roomId: '685531', name: 'Hab. 301 - Habitación Doble', units: [{ unitId: '1', name: '301' }] },
  { roomId: '685532', name: 'Hab. 302 - Habitación Doble', units: [{ unitId: '1', name: '302' }] },
  { roomId: '685533', name: 'Hab. 303 - Habitación Doble', units: [{ unitId: '1', name: '303' }] },
  { roomId: '685534', name: 'Hab. 304 - Habitación Doble', units: [{ unitId: '1', name: '304' }] },
  { roomId: '685535', name: 'Hab. 305 - Habitación Doble', units: [{ unitId: '1', name: '305' }] },
  { roomId: '685536', name: 'Hab. 306 - Habitación Doble', units: [{ unitId: '1', name: '306' }] },
  // ── Especiales ────────────────────────────────────────────────────────────
  { 
    roomId: '679093', 
    name: 'Casa Vacacional de 3 dormitorios',
    units: [{ unitId: '1', name: '401' }]
  },
  { 
    roomId: '679087', 
    name: 'Apartamento de 1 dormitorio',
    units: [{ unitId: '1', name: '402' }]
  },
  // ── Piso 5: Apartamentos Nuevos (500-507) – LOCALES, no conectados a Beds24
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

    // Calcular ocupación cruzada contemplando reservas de categoría general (sin unidad física asignada)
    const reqIn = new Date(checkIn);
    const reqOut = new Date(checkOut);
    const bookings = bookingsData.data && Array.isArray(bookingsData.data) ? bookingsData.data : [];

    // Inicializar estadísticas de ocupación por categoría
    const categoryStats: Record<string, {
      totalUnits: number;
      assignedUnits: Set<string>;
      unassignedCount: number;
      allPhysicalUnits: string[];
    }> = {};

    ROOM_MAP.forEach(cat => {
      categoryStats[cat.roomId] = {
        totalUnits: cat.units.length,
        assignedUnits: new Set<string>(),
        unassignedCount: 0,
        allPhysicalUnits: cat.units.map(u => u.unitId)
      };
    });

    // Procesar reservas de Beds24
    bookings.forEach((b: any) => {
      if (String(b.status) !== '0' && b.status !== 'cancelled') {
        const bIn = new Date(b.arrival);
        const bOut = new Date(b.departure);
        
        if (bIn < reqOut && bOut > reqIn) {
          if (b.roomId) {
            const bRoomId = String(b.roomId);
            // Caso 1: El roomId del booking ya es un ID individual nuevo → lookup directo
            if (categoryStats[bRoomId]) {
              categoryStats[bRoomId].assignedUnits.add('1');
            } else {
              // Caso 2: El roomId es un ID de categoría padre antiguo → convertir al hijo
              const childId = getChildRoomId(bRoomId, String(b.unitId ?? '1'));
              if (childId && categoryStats[childId]) {
                categoryStats[childId].assignedUnits.add('1');
              }
            }
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
          const localRoomId = String(b.room_id ?? '');
          // Caso 1: room_id ya es un ID individual nuevo → lookup directo
          if (categoryStats[localRoomId]) {
            categoryStats[localRoomId].assignedUnits.add('1');
          } else {
            // Caso 2: room_id es el padre antiguo → convertir al hijo
            const childId = getChildRoomId(localRoomId, String(b.unit_id ?? '1'));
            if (childId && categoryStats[childId]) {
              categoryStats[childId].assignedUnits.add('1');
            }
          }
        }
      });
    } catch (localDbErr) {
      console.error("[Availability API] Error reading local_reservas:", localDbErr);
    }


    // Calcular qué unidades específicas marcar como ocupadas
    const occupiedUnits = new Set<string>();

    Object.keys(categoryStats).forEach(roomId => {
      const stats = categoryStats[roomId];
      
      // 1. Las asignadas físicamente son ocupadas de forma directa
      stats.assignedUnits.forEach(unitId => {
        occupiedUnits.add(`${roomId}_${unitId}`);
      });

      // 2. Las reservas sin asignar consumen de las habitaciones físicas restantes
      let remainingUnassigned = stats.unassignedCount;
      if (remainingUnassigned > 0) {
        const freePhysicalUnits = stats.allPhysicalUnits.filter(uId => !stats.assignedUnits.has(uId));
        for (let i = 0; i < Math.min(remainingUnassigned, freePhysicalUnits.length); i++) {
          occupiedUnits.add(`${roomId}_${freePhysicalUnits[i]}`);
        }
      }
    });

    // Cargar dynamicSettings (pricing_unit_settings) de precios
    let dynamicSettings: any = null;
    try {
      const { data: settingsData } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'pricing_unit_settings')
        .maybeSingle();
      if (settingsData && settingsData.value) {
        dynamicSettings = typeof settingsData.value === 'string' ? JSON.parse(settingsData.value) : settingsData.value;
      }
    } catch (err) {
      console.error("[Availability API] Error loading pricing_unit_settings:", err);
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
            u.unitId,
            dynamicSettings
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
