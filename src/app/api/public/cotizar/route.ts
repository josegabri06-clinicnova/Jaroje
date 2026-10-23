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
import { normalizePhone } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CATEGORY_DEFINITIONS = [
  {
    key: 'doble',
    roomId: '679077',
    name: 'Habitación Doble',
    name_en: 'Standard Double Room',
    capacity: 2,
    maxCapacity: 4,
    capacityText: 'Base 2 huéspedes (+ hasta 2 adicionales · máx. 4)',
    capacityText_en: 'Base 2 guests (+ up to 2 extra · max 4)',
    description: 'Habitación amplia con 2 camas matrimoniales, aire acondicionado, baño privado y TV.',
    description_en: 'Spacious room with 2 double beds, A/C, private bathroom and Smart TV.',
    features: [
      '2 camas matrimoniales',
      'Aire acondicionado y ventilador de techo',
      'Baño privado con agua caliente',
      'Smart TV con cable y streaming',
      'WiFi de alta velocidad',
      'Acceso directo a alberca y terraza'
    ],
    features_en: [
      '2 double beds',
      'Air conditioning and ceiling fan',
      'Private bathroom with hot water',
      'Smart TV with streaming apps',
      'High-speed WiFi',
      'Direct access to pool and terrace'
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
    name: 'Condominio de 1 Recámara',
    name_en: '1-Bedroom Apartment',
    capacity: 4,
    maxCapacity: 4,
    capacityText: 'Hasta 4 huéspedes (1 recámara privada)',
    capacityText_en: 'Up to 4 guests (1 private bedroom)',
    description: 'Condominio completo con 1 recámara privada, cocina equipada, sala, comedor y terraza.',
    description_en: 'Full condo with 1 private bedroom, equipped kitchen, living area, dining and terrace.',
    features: [
      '1 recámara privada con 2 camas matrimoniales',
      'Cocina equipada con estufa, refrigerador y utensilios',
      'Comedor para 4 personas',
      'Terraza privada con vista al jardín',
      'Aire acondicionado en recámara',
      'WiFi de alta velocidad y Smart TV'
    ],
    features_en: [
      '1 private bedroom with 2 double beds',
      'Equipped kitchen with stove, fridge and cookware',
      'Dining table for 4 guests',
      'Private terrace with garden view',
      'Air conditioning in bedroom',
      'High-speed WiFi and Smart TV'
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
    name: 'Condominio de 2 Recámaras',
    name_en: '2-Bedroom Apartment',
    capacity: 6,
    maxCapacity: 8,
    capacityText: 'Base 6 huéspedes (+ hasta 2 adicionales · máx. 8)',
    capacityText_en: 'Base 6 guests (+ up to 2 extra · max 8)',
    description: 'Ideal para familias. 2 recámaras independientes, cocina completa, amplia sala y comedor.',
    description_en: 'Ideal for families. 2 separate bedrooms, full kitchen, spacious living and dining area.',
    features: [
      'Recámara principal con 2 camas matrimoniales',
      'Segunda recámara con 1 cama King Size',
      'Cocina equipada completa con barra',
      'Comedor para 6 personas y sala con sofá escuadra',
      'Aire acondicionado en ambas recámaras',
      '1 baño completo con agua caliente y amenidades'
    ],
    features_en: [
      'Master bedroom with 2 double beds',
      'Second bedroom with 1 King Size bed',
      'Full kitchen with breakfast bar',
      'Dining table for 6 and living room sofa',
      'A/C in both bedrooms',
      '1 full bathroom with hot water'
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
    name: 'Condominio de 3 Recámaras',
    name_en: '3-Bedroom Apartment',
    capacity: 6,
    maxCapacity: 8,
    capacityText: 'Base 6 huéspedes (+ hasta 2 adicionales · máx. 8)',
    capacityText_en: 'Base 6 guests (+ up to 2 extra · max 8)',
    description: 'Máximo confort para grupos y familias grandes. 3 recámaras, amplia cocina y sala.',
    description_en: 'Maximum comfort for groups and large families. 3 bedrooms, large kitchen and living room.',
    features: [
      '3 recámaras amplias y privadas',
      'Hasta 6 huéspedes + 2 adicionales con costo',
      'Cocina integral completa con utensilios',
      'Comedor para 8 personas',
      'Aire acondicionado en todas las recámaras',
      '2 baños completos con agua caliente'
    ],
    features_en: [
      '3 spacious private bedrooms',
      'Up to 6 guests + 2 extra with fee',
      'Full kitchen with cookware and appliances',
      'Dining room for 8 guests',
      'A/C in all bedrooms',
      '2 full bathrooms with hot water'
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
    name: 'Casa Vacacional de 3 Recámaras',
    name_en: '3-Bedroom Vacation House',
    capacity: 10,
    maxCapacity: 12,
    capacityText: 'Base 10 huéspedes (+ hasta 2 adicionales · máx. 12)',
    capacityText_en: 'Base 10 guests (+ up to 2 extra · max 12)',
    description: 'Casa privada independiente de 2 plantas. Sala, cocina, comedor, terraza y máxima privacidad.',
    description_en: 'Independent private 2-story house. Living room, full kitchen, terrace and total privacy.',
    features: [
      'Casa completa independiente de 2 niveles (Unidad 401)',
      '3 dormitorios independientes',
      'Capacidad hasta 12 huéspedes',
      'Cocina de chef totalmente equipada y barra desayunadora',
      'Terraza privada con área lounge',
      'A/C en todas las áreas y Smart TVs'
    ],
    features_en: [
      'Full standalone 2-level house (Unit 401)',
      '3 private independent bedrooms',
      'Sleeps up to 12 guests',
      'Full chef-style kitchen with breakfast bar',
      'Private terrace with outdoor lounge',
      'A/C throughout and Smart TVs'
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

    const reqIn = new Date(checkIn);
    const reqOut = new Date(checkOut);
    const diffTime = reqOut.getTime() - reqIn.getTime();
    const nights = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));

    if (nights <= 0 || isNaN(diffTime)) {
      return NextResponse.json({ error: 'Rango de fechas no válido' }, { status: 400 });
    }

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
        const bIn = new Date(b.arrival);
        const bOut = new Date(b.departure);
        if (bIn < reqOut && bOut > reqIn) {
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
        const bIn = new Date(b.check_in);
        const bOut = new Date(b.check_out);
        if (bIn < reqOut && bOut > reqIn) {
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

      // Calcular tarifa neta por noche (canal 'Directo')
      const firstUnitId = cat.units[0]?.unitId || '1';
      const childId = getChildRoomId(cat.roomId, firstUnitId) || cat.roomId;
      const pricePerNight = getAverageRatesForDates(
        childId,
        checkIn,
        checkOut,
        'Directo',
        beds24RatesMap,
        firstUnitId,
        dynamicSettings
      );

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
