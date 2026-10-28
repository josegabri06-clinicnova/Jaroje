import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { 
  fetchAllRawBeds24Bookings, 
  getParentMapping,
  getBeds24Token,
  fetchBeds24RatesMap,
  getAverageRatesForDates,
  getChildRoomId
} from '@/lib/beds24';
import { normalizePhone } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const CATEGORY_DEFINITIONS = [
  {
    key: 'doble',
    roomId: '679077',
    name: 'Habitación Doble',
    name_en: 'Standard Room (Habitación Doble)',
    capacity: 4,
    maxCapacity: 4,
    capacityText: 'Capacidad máx. 4 personas',
    capacityText_en: 'Max capacity 4 guests',
    description: '',
    description_en: '',
    features: [
      'Capacidad máxima 4 personas',
      '1 dormitorio con aire acondicionado y Smart TV',
      '2 camas matrimoniales',
      'WiFi de alta velocidad',
      '1 baño completo con agua caliente',
      'Frigobar - Microondas - Cafetera (Sin cocina)'
    ],
    features_en: [
      'Maximum capacity 4 people',
      '1 bedroom with air conditioning and Smart TV',
      '2 double beds',
      'High-speed WiFi',
      '1 full bathroom with hot water',
      'Minibar - Microwave - Coffee maker (No kitchen)'
    ],
    photos: [
      '/images/doble/1.jpg',
      '/images/doble/2.jpg',
      '/images/doble/3.jpg',
      '/images/doble/4.jpg',
      '/images/doble/5.jpg',
      '/images/doble/6.jpg',
      '/images/doble/7.jpg',
      '/images/doble/8.jpg',
      '/images/doble/9.jpg'
    ],
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
    key: '1rec',
    roomId: '679087',
    name: 'Condominio de 1 dormitorio',
    name_en: 'Condominium 1R (1 Bedroom)',
    capacity: 4,
    maxCapacity: 4,
    capacityText: 'Capacidad máx. 4 personas (1 dormitorio privado)',
    capacityText_en: 'Max capacity 4 guests (1 private bedroom)',
    description: '',
    description_en: '',
    features: [
      'Capacidad máxima 4 personas',
      '1 dormitorio con aire acondicionado y Smart TV',
      '2 camas matrimoniales',
      'WiFi de alta velocidad',
      '1 baño completo con agua caliente',
      'Comedor para 4 personas, cocina equipada y Terraza privada'
    ],
    features_en: [
      'Maximum capacity 4 people',
      '1 bedroom with air conditioning and Smart TV',
      '2 double beds',
      'High-speed WiFi',
      '1 full bathroom with hot water',
      'Dining room for 4 people, equipped kitchen and private terrace'
    ],
    photos: [
      '/images/1rec/1.jpg',
      '/images/1rec/2.jpg',
      '/images/1rec/3.jpg',
      '/images/1rec/4.jpg',
      '/images/1rec/5.jpg',
      '/images/1rec/6.jpg',
      '/images/1rec/7.jpg',
      '/images/1rec/8.jpg',
      '/images/1rec/9.jpg',
      '/images/1rec/10.jpg',
      '/images/1rec/11.jpg'
    ],
    units: [
      { unitId: '1', name: '402' }
    ]
  },
  {
    key: '2rec',
    roomId: '679091',
    name: 'Condominio de 2 dormitorios',
    name_en: 'Condominium 2R (2 Bedrooms)',
    capacity: 6,
    maxCapacity: 8,
    capacityText: 'Capacidad máx. 8 personas (Base 6 · hasta 2 adicionales con costo)',
    capacityText_en: 'Max capacity 8 guests (Base 6 · up to 2 extra with fee)',
    description: '',
    description_en: '',
    features: [
      'Capacidad máxima 6 personas (+2 con costo adicional)',
      '2 dormitorios con aire acondicionado y Smart TV',
      'Dormitorio principal con 2 camas matrimoniales',
      'Dormitorio secundario con 1 cama King Size',
      'WiFi de alta velocidad',
      '1 baño completo con agua caliente',
      'Sala con sofá tipo escuadra y ventilador de techo',
      'Comedor para 6 personas',
      'Cocina totalmente equipada con barra desayunadora',
      'Patio de lavado (no incluye lavadora ni secadora)'
    ],
    features_en: [
      'Maximum capacity 6 people (+2 with extra fee)',
      '2 bedrooms with air conditioning and Smart TV',
      'Master bedroom with 2 double beds',
      'Second bedroom with 1 King Size bed',
      'High-speed WiFi',
      '1 full bathroom with hot water',
      'Living room with L-shaped sofa and ceiling fan',
      'Dining room for 6 people',
      'Fully equipped kitchen with breakfast bar',
      'Laundry area (without washer/dryer)'
    ],
    photos: [
      '/images/2rec/1.jpg',
      '/images/2rec/2.jpg',
      '/images/2rec/3.jpg',
      '/images/2rec/4.jpg',
      '/images/2rec/5.jpg',
      '/images/2rec/6.jpg',
      '/images/2rec/7.jpg',
      '/images/2rec/8.jpg',
      '/images/2rec/9.jpg',
      '/images/2rec/10.jpg',
      '/images/2rec/11.jpg',
      '/images/2rec/12.jpg',
      '/images/2rec/13.jpg',
      '/images/2rec/14.jpg',
      '/images/2rec/15.jpg',
      '/images/2rec/16.jpg',
      '/images/2rec/17.jpg'
    ],
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
    key: '3rec',
    roomId: '679092',
    name: 'Condominio de 3 dormitorios',
    name_en: 'Condominium 3R (3 Bedrooms)',
    capacity: 10,
    maxCapacity: 12,
    capacityText: 'Capacidad máx. 12 personas (Base 10 · hasta 2 adicionales con costo)',
    capacityText_en: 'Max capacity 12 guests (Base 10 · up to 2 extra with fee)',
    description: '',
    description_en: '',
    features: [
      'Capacidad máxima 10 personas (+2 con costo adicional)',
      '3 dormitorios con aire acondicionado y Smart TV',
      'Dormitorio principal con 1 cama King Size',
      '2 dormitorios secundarios con 2 camas matrimoniales cada uno',
      'WiFi de alta velocidad',
      '2 baños completos con agua caliente',
      'Sala con sofá tipo escuadra y ventilador de techo',
      'Comedor para 10 personas',
      'Cocina totalmente equipada con barra desayunadora',
      'Patio de lavado (no incluye lavadora ni secadora)'
    ],
    features_en: [
      'Maximum capacity 10 people (+2 with extra fee)',
      '3 bedrooms with air conditioning and Smart TV',
      'Master bedroom with 1 King Size bed',
      '2 secondary bedrooms with 2 double beds each',
      'High-speed WiFi',
      '2 full bathrooms with hot water',
      'Living room with L-shaped sofa and ceiling fan',
      'Dining room for 10 people',
      'Fully equipped kitchen with breakfast bar',
      'Laundry area (without washer/dryer)'
    ],
    photos: [
      '/images/3rec/1.jpg',
      '/images/3rec/2.jpg',
      '/images/3rec/3.jpg',
      '/images/3rec/4.jpg',
      '/images/3rec/5.jpg',
      '/images/3rec/6.jpg',
      '/images/3rec/7.jpg',
      '/images/3rec/8.jpg',
      '/images/3rec/9.jpg',
      '/images/3rec/10.jpg',
      '/images/3rec/11.jpg',
      '/images/3rec/12.jpg',
      '/images/3rec/13.jpg',
      '/images/3rec/14.jpg',
      '/images/3rec/15.jpg',
      '/images/3rec/16.jpg',
      '/images/3rec/17.jpg',
      '/images/3rec/18.jpg',
      '/images/3rec/19.jpg',
      '/images/3rec/20.jpg',
      '/images/3rec/21.jpg'
    ],
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
    key: 'casa',
    roomId: '679093',
    name: 'Casa de Lujo',
    name_en: 'Luxury House (Casa de Lujo)',
    capacity: 12,
    maxCapacity: 16,
    capacityText: 'Capacidad máx. 16 personas (Base 12 · hasta 4 adicionales con costo)',
    capacityText_en: 'Max capacity 16 guests (Base 12 · up to 4 extra with fee)',
    description: '',
    description_en: '',
    features: [
      'Capacidad máxima 12 personas (+4 con costo adicional)',
      'PLANTA ALTA: 3 dormitorios con aire acondicionado, baño privado y Smart TV',
      'Dormitorio principal con 2 camas queen, 2 individuales y tina de hidromasaje',
      'Dormitorio 2 con 2 camas queen',
      'Dormitorio 3 con 1 cama king',
      'WiFi de alta velocidad y 3 baños completos en planta alta',
      'Sala de estar en planta alta',
      'PLANTA BAJA: Comedor para 12 personas',
      'Cocina totalmente equipada con antecomedor para 8 personas',
      'Sala completa y aire acondicionado en planta baja',
      '1/2 baño en planta baja',
      'Patio de lavado (no incluye lavadora ni secadora)'
    ],
    features_en: [
      'Maximum capacity 12 people (+4 with extra fee)',
      'UPPER FLOOR: 3 bedrooms with air conditioning, private bathroom and Smart TV',
      'Master bedroom with 2 queen beds, 2 single beds and jacuzzi tub',
      'Bedroom 2 with 2 queen beds',
      'Bedroom 3 with 1 king bed',
      'High-speed WiFi and 3 full bathrooms on upper floor',
      'Sitting area on upper floor',
      'GROUND FLOOR: Dining room for 12 people',
      'Fully equipped kitchen with breakfast nook for 8 people',
      'Complete living room with air conditioning on ground floor',
      '1/2 bathroom on ground floor',
      'Laundry area (without washer/dryer)'
    ],
    photos: [
      '/images/casa/1.jpg',
      '/images/casa/2.jpg',
      '/images/casa/3.jpg',
      '/images/casa/4.jpg',
      '/images/casa/5.jpg',
      '/images/casa/6.jpg',
      '/images/casa/7.jpg',
      '/images/casa/8.jpg',
      '/images/casa/9.jpg',
      '/images/casa/10.jpg',
      '/images/casa/11.jpg',
      '/images/casa/12.jpg',
      '/images/casa/13.jpg',
      '/images/casa/14.jpg',
      '/images/casa/15.jpg',
      '/images/casa/16.jpg',
      '/images/casa/17.jpg',
      '/images/casa/18.jpg',
      '/images/casa/19.jpg',
      '/images/casa/20.jpg',
      '/images/casa/21.jpg',
      '/images/casa/22.jpg',
      '/images/casa/23.jpg'
    ],
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
    const rawPhone = searchParams.get('phone') || '';

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Si se proporciona teléfono, verificar si el cliente ya tiene reservaciones activas o futuras
    let existingReservations: any[] = [];
    let pendingQuote: any = null;
    if (rawPhone) {
      const cleanPhone = normalizePhone(rawPhone);
      const last10 = cleanPhone.slice(-10);

      try {
        const { data: dbBookings } = await supabase
          .from('beds24_reservations')
          .select('id, guest_name, check_in, check_out, room_name, status, price, deposit, balance')
          .gte('check_out', todayStr)
          .neq('status', 'cancelled')
          .or(`phone.like.%${last10}%,guest_phone.like.%${last10}%`)
          .order('check_in', { ascending: true });

        if (dbBookings && dbBookings.length > 0) {
          existingReservations = dbBookings.map(b => ({
            id: String(b.id),
            guest_name: b.guest_name,
            check_in: (b.check_in || '').split('T')[0],
            check_out: (b.check_out || '').split('T')[0],
            room_name: b.room_name,
            price: Number(b.price || 0),
            deposit: Number(b.deposit || 0),
            balance: Number(b.balance || 0),
            status: b.status,
            portal_url: `/public/reserva/${b.id}`
          }));
        }
      } catch (errDb) {
        console.warn("[Cotizar API] Error buscando reservas previas:", errDb);
      }

      // 1.1. Buscar si hay una cotización pendiente reciente (últimas 24 horas) para este teléfono
      try {
        const { data: conv } = await supabase
          .from('conversations')
          .select('messages')
          .eq('guest_phone', cleanPhone)
          .maybeSingle();

        if (conv && Array.isArray(conv.messages)) {
          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
          for (let i = conv.messages.length - 1; i >= 0; i--) {
            const m = conv.messages[i];
            if (m.quote_data && m.quote_data.status === 'pending_name') {
              const quoteTime = new Date(m.quote_data.createdAt || m.timestamp || 0).getTime();
              if (quoteTime > oneDayAgo) {
                pendingQuote = m.quote_data;
                break;
              }
            }
          }
        }
      } catch (qErr) {
        console.warn("[Cotizar API] Error buscando pendingQuote:", qErr);
      }
    }

    // Si no se pasaron fechas, retornar información general de categorías y reservas existentes
    if (!checkIn || !checkOut) {
      return NextResponse.json({
        success: true,
        existingReservations,
        pendingQuote,
        categories: CATEGORY_DEFINITIONS.map(c => ({
          key: c.key,
          name: c.name,
          name_en: c.name_en,
          capacity: c.capacity,
          maxCapacity: c.maxCapacity,
          capacityText: c.capacityText,
          capacityText_en: c.capacityText_en,
          description: c.description,
          description_en: c.description_en,
          features: c.features,
          features_en: c.features_en,
          photos: c.photos,
          totalUnits: c.units.length
        }))
      });
    }

    const cleanCheckIn = String(checkIn || '').split('T')[0].split(' ')[0].trim();
    const cleanCheckOut = String(checkOut || '').split('T')[0].split(' ')[0].trim();

    const dIn = new Date(`${cleanCheckIn}T00:00:00Z`);
    const dOut = new Date(`${cleanCheckOut}T00:00:00Z`);
    const diffTime = dOut.getTime() - dIn.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0 || isNaN(diffDays) || cleanCheckIn >= cleanCheckOut) {
      return NextResponse.json({ error: 'La fecha de check-out debe ser posterior a la fecha de check-in (mínimo 1 noche)' }, { status: 400 });
    }

    const nights = diffDays;

    // 2. Consultar inventario real de Beds24
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + 400);

    const bookingsRaw = await fetchAllRawBeds24Bookings(
      fromDate.toISOString().split('T')[0],
      toDate.toISOString().split('T')[0]
    );

    // 3. Obtener tarifas de Beds24 para el canal 'Directo'
    let beds24RatesMap: Record<string, Record<string, number>> = {};
    try {
      const BEDS24_TOKEN = await getBeds24Token();
      beds24RatesMap = await fetchBeds24RatesMap(BEDS24_TOKEN, checkIn, checkOut);
    } catch (tokenErr) {
      console.warn("[Cotizar API] Failed to fetch Beds24 calendar rates:", tokenErr);
    }

    // Cargar pricing_unit_settings de Supabase si existen
    let dynamicSettings: any = null;
    try {
      const { data: settingsData } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'pricing_unit_settings')
        .maybeSingle();
      if (settingsData?.value) {
        dynamicSettings = typeof settingsData.value === 'string' ? JSON.parse(settingsData.value) : settingsData.value;
      }
    } catch (errSettings) {
      console.warn("[Cotizar API] Error loading pricing_unit_settings:", errSettings);
    }

    // 4. Calcular ocupación real por categoría
    const categoryStats: Record<string, {
      totalUnits: number;
      assignedUnits: Set<string>;
      unassignedCount: number;
      allPhysicalUnits: string[];
    }> = {};

    CATEGORY_DEFINITIONS.forEach(cat => {
      categoryStats[cat.roomId] = {
        totalUnits: cat.units.length,
        assignedUnits: new Set<string>(),
        unassignedCount: 0,
        allPhysicalUnits: cat.units.map(u => u.unitId)
      };
    });

    const bookings = Array.isArray(bookingsRaw) ? bookingsRaw : [];
    bookings.forEach((b: any) => {
      if (String(b.status) !== '0' && b.status !== 'cancelled') {
        const bIn = String(b.arrival || '').split('T')[0].split(' ')[0].trim();
        const bOut = String(b.departure || '').split('T')[0].split(' ')[0].trim();
        // Dos estancias se solapan si y solo si bIn < cleanCheckOut && bOut > cleanCheckIn
        if (bIn && bOut && bIn < cleanCheckOut && bOut > cleanCheckIn) {
          if (b.roomId) {
            const parent = getParentMapping(b.roomId, b.unitId);
            const stats = categoryStats[parent.roomId];
            if (stats) {
              const uId = String(b.unitId ?? '').trim();
              if (uId && uId !== '0') {
                stats.assignedUnits.add(parent.unitId);
              } else {
                stats.unassignedCount++;
              }
            }
          }
        }
      }
    });

    // Cargar también reservas locales de Supabase
    try {
      const { data: localBookings } = await supabase
        .from('local_reservas')
        .select('*')
        .neq('status', 'cancelled');

      (localBookings || []).forEach((b: any) => {
        const bIn = String(b.check_in || '').split('T')[0].split(' ')[0].trim();
        const bOut = String(b.check_out || '').split('T')[0].split(' ')[0].trim();
        if (bIn && bOut && bIn < cleanCheckOut && bOut > cleanCheckIn) {
          const parent = getParentMapping(b.room_id, b.unit_id);
          const stats = categoryStats[parent.roomId];
          if (stats) {
            const uId = String(b.unit_id ?? '').trim();
            if (uId && uId !== '0') {
              stats.assignedUnits.add(parent.unitId);
            } else {
              stats.unassignedCount++;
            }
          }
        }
      });
    } catch (localDbErr) {
      console.warn("[Cotizar API] Error reading local_reservas:", localDbErr);
    }

    // 5. Construir respuesta detallada con tarifas netas directas y disponibilidad
    const quotes = CATEGORY_DEFINITIONS.map(cat => {
      const stats = categoryStats[cat.roomId];
      const occupiedCount = (stats?.assignedUnits.size || 0) + (stats?.unassignedCount || 0);
      const availableUnitsCount = Math.max(0, cat.units.length - occupiedCount);

      // Calcular tarifa neta por noche (canal 'Directo') y aplicar multiplicador de impuestos (IVA 16% + ISH 3% = 1.19)
      const firstUnitId = cat.units[0]?.unitId || '1';
      const childId = getChildRoomId(cat.roomId, firstUnitId) || cat.roomId;
      const basePricePerNight = getAverageRatesForDates(
        childId,
        checkIn,
        checkOut,
        'Directo',
        beds24RatesMap,
        firstUnitId,
        dynamicSettings
      );

      const TAX_MULTIPLIER = 1.19;
      const pricePerNight = Math.round(basePricePerNight * TAX_MULTIPLIER);
      const totalPrice = Math.round(pricePerNight * nights);
      const depositRequired = Math.round(totalPrice * 0.5);

      return {
        key: cat.key,
        roomId: cat.roomId,
        name: cat.name,
        name_en: cat.name_en,
        capacity: cat.capacity,
        maxCapacity: cat.maxCapacity,
        capacityText: cat.capacityText,
        capacityText_en: cat.capacityText_en,
        description: cat.description,
        description_en: cat.description_en,
        features: cat.features,
        features_en: cat.features_en,
        photos: cat.photos,
        totalUnits: cat.units.length,
        availableUnitsCount,
        isAvailable: availableUnitsCount > 0,
        nights,
        basePricePerNight,
        taxMultiplier: TAX_MULTIPLIER,
        pricePerNight,
        totalPrice,
        depositRequired,
        currency: 'MXN'
      };
    });

    return NextResponse.json({
      success: true,
      checkIn,
      checkOut,
      nights,
      existingReservations,
      pendingQuote,
      quotes
    });

  } catch (error: any) {
    console.error("[Cotizar API] Error general:", error);
    return NextResponse.json({ error: error.message || 'Error calculando cotización' }, { status: 500 });
  }
}
