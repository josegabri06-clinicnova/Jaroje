// ─── SERVICIO CENTRALIZADO DE BEDS24 JAROJE ─────────────────────────────────────
// Fuente de verdad para reservas del Hotel Condominios Jaroje.
// Centraliza las tarifas, cálculo de temporadas, refresh de tokens y mapeo de unidades.

// Precios BASE por noche (sin impuestos) · Impuesto: 16% IVA + 3% estatal = 19%
export const JAROJE_PRICES: Record<string, Record<string, number>> = {
  // --- Habitación DOBLE (Antigua y nuevas 301-306) ---
  '679077': { baja: 1600, media: 1900, media_alta: 2000, alta: 2200 },
  '685531': { baja: 1600, media: 1900, media_alta: 2000, alta: 2200 },
  '685532': { baja: 1600, media: 1900, media_alta: 2000, alta: 2200 },
  '685533': { baja: 1600, media: 1900, media_alta: 2000, alta: 2200 },
  '685534': { baja: 1600, media: 1900, media_alta: 2000, alta: 2200 },
  '685535': { baja: 1600, media: 1900, media_alta: 2000, alta: 2200 },
  '685536': { baja: 1600, media: 1900, media_alta: 2000, alta: 2200 },

  // --- Apartamento Premier de 1 dormitorio (402) ---
  '679087': { baja: 2400, media: 2850, media_alta: 3000, alta: 3300 },

  // --- Apartamento Premier de 2 dormitorios (Antigua y nuevas 201-206) ---
  '679091': { baja: 3200, media: 3800, media_alta: 4000, alta: 4400 },
  '685312': { baja: 3200, media: 3800, media_alta: 4000, alta: 4400 },
  '685318': { baja: 3200, media: 3800, media_alta: 4000, alta: 4400 },
  '685314': { baja: 3200, media: 3800, media_alta: 4000, alta: 4400 },
  '685315': { baja: 3200, media: 3800, media_alta: 4000, alta: 4400 },
  '685316': { baja: 3200, media: 3800, media_alta: 4000, alta: 4400 },
  '685317': { baja: 3200, media: 3800, media_alta: 4000, alta: 4400 },

  // --- Apartamento Premier de 3 dormitorios (Antigua y nuevas 101-107) ---
  '679092': { baja: 4800, media: 5700, media_alta: 6000, alta: 6600 },
  '685321': { baja: 4800, media: 5700, media_alta: 6000, alta: 6600 },
  '685322': { baja: 4800, media: 5700, media_alta: 6000, alta: 6600 },
  '685323': { baja: 4800, media: 5700, media_alta: 6000, alta: 6600 },
  '685324': { baja: 4800, media: 5700, media_alta: 6000, alta: 6600 },
  '685325': { baja: 4800, media: 5700, media_alta: 6000, alta: 6600 },
  '685326': { baja: 4800, media: 5700, media_alta: 6000, alta: 6600 },
  '685327': { baja: 4800, media: 5700, media_alta: 6000, alta: 6600 },

  // --- Casa Vacacional (Antigua 679093 y nueva 679008) ---
  '679093': { baja: 6400, media: 7600, media_alta: 8000, alta: 8800 },
  '679008': { baja: 6400, media: 7600, media_alta: 8000, alta: 8800 },

  // --- Habitación 500 ---
  '685542': { baja: 1600, media: 1900, media_alta: 2000, alta: 2200 },
};

// Nombres canónicos por roomId para el catálogo de display
export const JAROJE_CATALOG: Record<string, any> = {
  // --- Habitación DOBLE (Antigua y nuevas 301-306) ---
  '679077': { nombre: 'Habitación DOBLE - 2 camas dobles', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },
  '685531': { nombre: 'Habitación DOBLE 301', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },
  '685532': { nombre: 'Habitación DOBLE 302', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },
  '685533': { nombre: 'Habitación DOBLE 303', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },
  '685534': { nombre: 'Habitación DOBLE 304', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },
  '685535': { nombre: 'Habitación DOBLE 305', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },
  '685536': { nombre: 'Habitación DOBLE 306', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },

  // --- Apartamento Premier de 1 dormitorio (402) ---
  '679087': { nombre: 'Apartamento Premier de 1 dormitorio', capacidad: 4, camas: '1 King o 2 Matrimoniales', amenities: 'Cocina equipada, Terraza, Alberca, Jardín, WiFi, AC', categoria: 'Condominio' },

  // --- Apartamento Premier de 2 dormitorios (Antigua y nuevas 201-206) ---
  '679091': { nombre: 'Apartamento Premier de 2 dormitorios', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },
  '685312': { nombre: 'Apartamento Premier 201', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },
  '685318': { nombre: 'Apartamento Premier 202', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },
  '685314': { nombre: 'Apartamento Premier 203', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },
  '685315': { nombre: 'Apartamento Premier 204', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },
  '685316': { nombre: 'Apartamento Premier 205', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },
  '685317': { nombre: 'Apartamento Premier 206', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },

  // --- Apartamento Premier de 3 dormitorios (Antigua y nuevas 101-107) ---
  '679092': { nombre: 'Apartamento Premier de 3 dormitorios', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '685321': { nombre: 'Apartamento Premier 101', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '685322': { nombre: 'Apartamento Premier 102', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '685323': { nombre: 'Apartamento Premier 103', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '685324': { nombre: 'Apartamento Premier 104', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '685325': { nombre: 'Apartamento Premier 105', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '685326': { nombre: 'Apartamento Premier 106', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '685327': { nombre: 'Apartamento Premier 107', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },

  // --- Casa Vacacional y Habitación 500 ---
  '679093': { nombre: 'Casa Vacacional de 3 dormitorios', capacidad: 12, camas: '2 King, 3 Matrimoniales', amenities: 'Casa completa, 12 personas, 5min playa', categoria: 'Casa' },
  '679008': { nombre: 'Casa Vacacional de 3 dormitorios', capacidad: 12, camas: '2 King, 3 Matrimoniales', amenities: 'Casa completa, 12 personas, 5min playa', categoria: 'Casa' },
  '685542': { nombre: 'Habitación 500', capacidad: 2, camas: '1 Cama King', amenities: 'WiFi, AC, Vista Premium', categoria: 'Estándar' },

  // Fallbacks genéricos
  'default_1': { nombre: 'Habitación DOBLE - 2 camas dobles', capacidad: 2, camas: '2 Dobles', amenities: 'WiFi, AC', categoria: 'Estándar' },
  'default_2': { nombre: 'Apartamento Premier de 1 dormitorio', capacidad: 4, camas: '2 Matrimoniales', amenities: 'Cocina, WiFi, AC', categoria: 'Condominio' },
  'default_3': { nombre: 'Apartamento Premier de 2 dormitorios', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, 2 Baños', categoria: 'Condominio' },
  'default_4': { nombre: 'Apartamento Premier de 3 dormitorios', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, 3 Baños', categoria: 'Condominio' },
  'default_5': { nombre: 'Casa Vacacional de 3 dormitorios', capacidad: 12, camas: '2 King, 3 Matrimoniales', amenities: 'Casa completa, Premium', categoria: 'Casa' },
};

// Resolver el número físico de habitación/unidad (ej. "101", "302") según el roomId de Beds24
export function getUnitName(roomId: string | null | undefined, unitId: string | null | undefined): string | null {
  const id = String(roomId || '');
  const uId = String(unitId || '');

  const specificRooms: Record<string, string> = {
    // 101 - 107
    '685321': '101', '685322': '102', '685323': '103', '685324': '104', '685325': '105', '685326': '106', '685327': '107',
    // 201 - 206
    '685312': '201', '685318': '202', '685314': '203', '685315': '204', '685316': '205', '685317': '206',
    // 301 - 306
    '685531': '301', '685532': '302', '685533': '303', '685534': '304', '685535': '305', '685536': '306',
    // 401 & 402 & 500
    '679093': '401', '679008': '401', // Casa Vacacional
    '679087': '402',                  // Apartamento Premier de 1 dormitorio
    '685542': '500',                  // Habitación 500
  };

  if (specificRooms[id]) return specificRooms[id];

  // Fallback a los mapeos antiguos por unidades virtuales
  const oldUnitMap: Record<string, Record<string, string>> = {
    '679077': { '1': '301', '2': '302', '3': '303', '4': '304', '5': '305', '6': '306' },
    '679087': { '1': '402' },
    '679091': { '1': '201', '2': '202', '3': '203', '4': '204', '5': '205', '6': '206' },
    '679092': { '1': '101', '2': '102', '3': '103', '4': '104', '5': '105', '6': '106', '7': '107' },
    '679093': { '1': '401' }
  };

  return oldUnitMap[id]?.[uId] || null;
}

// Obtener el ID de Beds24 a partir de un número de habitación física (ej. "101" -> roomId: 685321)
export function getBeds24RoomIdAndUnit(physicalRoomName: string | null | undefined): { roomId: string, unitId: string } | null {
  const name = String(physicalRoomName || '').trim();
  const map: Record<string, { roomId: string, unitId: string }> = {
    '101': { roomId: '685321', unitId: '1' },
    '102': { roomId: '685322', unitId: '1' },
    '103': { roomId: '685323', unitId: '1' },
    '104': { roomId: '685324', unitId: '1' },
    '105': { roomId: '685325', unitId: '1' },
    '106': { roomId: '685326', unitId: '1' },
    '107': { roomId: '685327', unitId: '1' },
    '201': { roomId: '685312', unitId: '1' },
    '202': { roomId: '685318', unitId: '1' },
    '203': { roomId: '685314', unitId: '1' },
    '204': { roomId: '685315', unitId: '1' },
    '205': { roomId: '685316', unitId: '1' },
    '206': { roomId: '685317', unitId: '1' },
    '301': { roomId: '685531', unitId: '1' },
    '302': { roomId: '685532', unitId: '1' },
    '303': { roomId: '685533', unitId: '1' },
    '304': { roomId: '685534', unitId: '1' },
    '305': { roomId: '685535', unitId: '1' },
    '306': { roomId: '685536', unitId: '1' },
    '401': { roomId: '679008', unitId: '1' },
    '402': { roomId: '679087', unitId: '1' },
    '500': { roomId: '685542', unitId: '1' },
  };
  return map[name] || null;
}

// Mapear los nuevos Room IDs específicos de Beds24 a sus equivalentes antiguos (padre + unidad virtual)
// Esto evita romper la lógica de ocupación y disponibilidad que utiliza el panel de recepción
export function getParentMapping(roomId: string | null | undefined, unitId: string | null | undefined): { roomId: string, unitId: string } {
  const id = String(roomId || '');
  const uId = String(unitId || '1');

  const childToParent: Record<string, { roomId: string, unitId: string }> = {
    // --- 101 a 107 -> Padre: 679092 ---
    '685321': { roomId: '679092', unitId: '1' },
    '685322': { roomId: '679092', unitId: '2' },
    '685323': { roomId: '679092', unitId: '3' },
    '685324': { roomId: '679092', unitId: '4' },
    '685325': { roomId: '679092', unitId: '5' },
    '685326': { roomId: '679092', unitId: '6' },
    '685327': { roomId: '679092', unitId: '7' },

    // --- 201 a 206 -> Padre: 679091 ---
    '685312': { roomId: '679091', unitId: '1' },
    '685318': { roomId: '679091', unitId: '2' },
    '685314': { roomId: '679091', unitId: '3' },
    '685315': { roomId: '679091', unitId: '4' },
    '685316': { roomId: '679091', unitId: '5' },
    '685317': { roomId: '679091', unitId: '6' },

    // --- 301 a 306 -> Padre: 679077 ---
    '685531': { roomId: '679077', unitId: '1' },
    '685532': { roomId: '679077', unitId: '2' },
    '685533': { roomId: '679077', unitId: '3' },
    '685534': { roomId: '679077', unitId: '4' },
    '685535': { roomId: '679077', unitId: '5' },
    '685536': { roomId: '679077', unitId: '6' },

    // --- 401 -> Padre: 679093 ---
    '679008': { roomId: '679093', unitId: '1' },

    // --- 402 -> Padre: 679087 ---
    '679087': { roomId: '679087', unitId: '1' },
  };

  return childToParent[id] || { roomId: id, unitId: uId };
}

// Detección de temporada (Huatulco/México)
export function getSeason(dateStr: string | null | undefined): 'baja' | 'media' | 'media_alta' | 'alta' {
  if (!dateStr) return 'media';
  const d = new Date(dateStr);
  const month = d.getMonth() + 1; // 1-12
  const day = d.getDate();

  // Temporada Alta: Navidad/Año Nuevo (20 dic - 6 ene) + Semana Santa (aprox 1ra semana de abril)
  if ((month === 12 && day >= 20) || (month === 1 && day <= 6)) return 'alta';
  if (month === 4 && day <= 14) return 'alta'; // Semana Santa / Pascua

  // Temporada Media-Alta: Julio-Agosto (vacaciones verano), Puentes largos noviembre
  if (month === 7 || month === 8) return 'media_alta';
  if (month === 11 && day >= 1 && day <= 5) return 'media_alta'; // Día de Muertos
  if (month === 12 && day < 20) return 'media_alta'; // Pre-navidad

  // Temporada Media: Feb-Marzo, Oct, Noviembre resto
  if (month === 2 || month === 3 || month === 10 || month === 11) return 'media';
  if (month === 1 && day > 6) return 'media'; // Post-Año Nuevo

  // Temporada Baja: May, Jun, Sep
  return 'baja';
}

// Modificador por canal
export function getChannelMultiplier(referer: string): number {
  const r = (referer || '').toLowerCase();
  if (r.includes('booking')) return 1.10;
  if (r.includes('airbnb')) return 1.25;
  return 1.0; // Directo / WhatsApp / API
}

// Calcular precio real estimado
export function getRealPrice(roomId: string | null | undefined, dateStr: string | null | undefined, referer: string): number {
  const id = String(roomId || '');
  const prices = JAROJE_PRICES[id];
  if (!prices) {
    return 2000;
  }
  const season = getSeason(dateStr);
  const base = prices[season];
  const multiplier = getChannelMultiplier(referer);
  return Math.round(base * multiplier);
}

// Obtener metadata de la habitación
export function getRoomMetadata(roomId: string | null | undefined, roomName: string | null | undefined) {
  const id = String(roomId || '');
  if (JAROJE_CATALOG[id]) return JAROJE_CATALOG[id];
  const lowerName = (roomName || '').toLowerCase();
  if (lowerName.includes('estándar') || lowerName.includes('estandar') || lowerName.includes('standard')) return JAROJE_CATALOG['default_1'];
  if (lowerName.includes('3') && lowerName.includes('rec')) return JAROJE_CATALOG['default_4'];
  if (lowerName.includes('2') && lowerName.includes('rec')) return JAROJE_CATALOG['default_3'];
  if (lowerName.includes('casa') || lowerName.includes('lujo')) return JAROJE_CATALOG['default_5'];
  return JAROJE_CATALOG['default_2'];
}

// Auto-refresh del token de autenticación Beds24
export async function getBeds24Token(): Promise<string> {
  const tempToken = process.env.BEDS24_TEMP_TOKEN;
  const refreshToken = process.env.BEDS24_REFRESH_TOKEN;

  if (!refreshToken) throw new Error('Falta BEDS24_REFRESH_TOKEN en las variables de entorno.');

  if (tempToken) {
    try {
      const probe = await fetch('https://api.beds24.com/v2/bookings?limit=1', {
        headers: { 'token': tempToken },
        cache: 'no-store'
      });
      if (probe.ok || probe.status === 404) return tempToken;
    } catch (e) {
      console.warn("Probe de token de Beds24 falló, reintentando refrescar...");
    }
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

// Obtener y mapear reservas activas (Backend Server-Side)
export async function getBeds24Bookings(): Promise<any[]> {
  const BEDS24_TOKEN = await getBeds24Token();

  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 180);
  const arrivalFrom = fromDate.toISOString().split('T')[0];

  const toDate = new Date(today);
  toDate.setDate(today.getDate() + 1000);
  const arrivalTo = toDate.toISOString().split('T')[0];

  const beds24Response = await fetch(`https://api.beds24.com/v2/bookings?arrivalFrom=${arrivalFrom}&arrivalTo=${arrivalTo}&limit=1000`, {
    method: 'GET',
    headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
    cache: 'no-store'
  });

  if (beds24Response.status === 401 || beds24Response.status === 403) {
    throw new Error('TOKEN_EXPIRED');
  }

  if (!beds24Response.ok) {
    throw new Error(`Error BEDS24 ${beds24Response.status}: ${await beds24Response.text()}`);
  }

  const dataB24 = await beds24Response.json();
  const bookingsArray = dataB24.data && Array.isArray(dataB24.data) ? dataB24.data : [];

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

  return bookingsArray
    .filter((b: any) => String(b.status) !== '0' && b.status !== 'cancelled')
    .map((b: any) => {
      const arrivalDate = b.arrival ? new Date(b.arrival) : null;
      const departureDate = b.departure ? new Date(b.departure) : null;
      const nights = (arrivalDate && departureDate)
        ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 1;

      const rawSource = String(`${b.referer || ''} ${b.source || ''} ${b.apiSource || ''} ${b.apiReference || ''}`).toLowerCase();

      let channel = 'Directo';
      if (rawSource.includes('airbnb')) channel = 'Airbnb';
      else if (rawSource.includes('booking')) channel = 'Booking.com';
      else if (rawSource.includes('expedia')) channel = 'Expedia';
      else if (rawSource.includes('whatsapp') || rawSource.includes('n8n')) channel = 'WhatsApp Bot';
      else if (rawSource.includes('beds24')) channel = 'Beds24';

      const isOTA = ['Airbnb', 'Booking.com', 'Expedia'].includes(channel);

      const roomData = getRoomMetadata(b.roomId, b.roomName);
      let pricePerNight = b.price ? (Number(b.price) / nights) : null;
      if (!isOTA && (!pricePerNight || pricePerNight <= 0)) {
        pricePerNight = getRealPrice(String(b.roomId), b.arrival, rawSource);
      } else if (isOTA && !pricePerNight) {
        pricePerNight = 0;
      }
      pricePerNight = Math.round(pricePerNight ?? 0);
      const totalRevenue = pricePerNight * nights;

      const unitName = getUnitName(b.roomId, b.unitId);
      const displayRoomName = unitName 
        ? (roomData.nombre.includes(unitName) ? roomData.nombre : `${roomData.nombre} (${unitName})`)
        : roomData.nombre;

      return {
        id: b.id || Math.random().toString(),
        check_in: b.arrival,
        check_out: b.departure,
        guest_name: `${b.firstName || ''}${b.lastName ? ' ' + b.lastName : ''}`.trim() || 'Huésped',
        guest_phone: b.phone || b.mobile || null,
        guest_email: b.email || null,
        status: (b.status === '1' || b.status === 'confirmed') ? 'confirmed' : 'pending',
        source: 'beds24',
        channel: channel,
        room_name: displayRoomName,
        room_id: b.roomId,
        nights: nights,
        price_estimate: totalRevenue,
        notes: b.info || b.notes || null,
        num_adult: b.numAdult ? Number(b.numAdult) : 1,
        num_child: b.numChild ? Number(b.numChild) : 0,
        rooms: { name: roomData.nombre }
      };
    });
}
