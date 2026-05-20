// ─── SERVICIO CENTRALIZADO DE BEDS24 JAROJE ─────────────────────────────────────
// Fuente de verdad para reservas del Hotel Condominios Jaroje.
// Centraliza las tarifas, cálculo de temporadas, refresh de tokens y mapeo de unidades.

// Precios BASE por noche (sin impuestos) · Impuesto: 16% IVA + 3% estatal = 19%
export const JAROJE_PRICES: Record<string, Record<string, number>> = {
  // roomId de Beds24 -> { season -> base_price_mxn }
  '679077': { baja: 1600, media: 1900, media_alta: 2000, alta: 2200 }, // Habitación Estándar
  '679087': { baja: 2400, media: 2850, media_alta: 3000, alta: 3300 }, // Condominio 1R
  '679091': { baja: 3200, media: 3800, media_alta: 4000, alta: 4400 }, // Condominio 2R
  '679092': { baja: 4800, media: 5700, media_alta: 6000, alta: 6600 }, // Condominio 3R
  '679093': { baja: 6400, media: 7600, media_alta: 8000, alta: 8800 }, // Casa de Lujo
};

// Nombres canónicos por roomId para el catálogo de display
export const JAROJE_CATALOG: Record<string, any> = {
  '679077': { nombre: 'Habitación Estándar', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },
  '679087': { nombre: 'Condominio 1R', capacidad: 4, camas: '1 King o 2 Matrimoniales', amenities: 'Cocina equipada, Terraza, Alberca, Jardín, WiFi, AC', categoria: 'Condominio' },
  '679091': { nombre: 'Condominio 2R', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },
  '679092': { nombre: 'Condominio 3R', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '679093': { nombre: 'Casa de Lujo', capacidad: 12, camas: '2 King, 3 Matrimoniales', amenities: 'Casa completa, 12 personas, 5min playa', categoria: 'Casa' },
  // Fallbacks genéricos
  'default_1': { nombre: 'Habitación Estándar', capacidad: 2, camas: '2 Dobles', amenities: 'WiFi, AC', categoria: 'Estándar' },
  'default_2': { nombre: 'Condominio 1R', capacidad: 4, camas: '2 Matrimoniales', amenities: 'Cocina, WiFi, AC', categoria: 'Condominio' },
  'default_3': { nombre: 'Condominio 2R', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, 2 Baños', categoria: 'Condominio' },
  'default_4': { nombre: 'Condominio 3R', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, 3 Baños', categoria: 'Condominio' },
  'default_5': { nombre: 'Casa de Lujo', capacidad: 12, camas: '2 King, 3 Matrimoniales', amenities: 'Casa completa, Premium', categoria: 'Casa' },
};

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

  const [beds24Response, propsResponse] = await Promise.all([
    fetch('https://api.beds24.com/v2/bookings', {
      method: 'GET',
      headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
      cache: 'no-store'
    }),
    fetch('https://api.beds24.com/v2/properties', {
      method: 'GET',
      headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
      cache: 'no-store'
    })
  ]);

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
    { roomId: '679087', units: [{ unitId: '1', name: '401' }] },
    { roomId: '679091', units: [{ unitId: '1', name: '201' }, { unitId: '2', name: '202' }, { unitId: '3', name: '203' }, { unitId: '4', name: '204' }, { unitId: '5', name: '205' }, { unitId: '6', name: '206' }] },
    { roomId: '679092', units: [{ unitId: '1', name: '101' }, { unitId: '2', name: '102' }, { unitId: '3', name: '103' }, { unitId: '4', name: '104' }, { unitId: '5', name: '105' }, { unitId: '6', name: '106' }, { unitId: '7', name: '107' }] },
    { roomId: '679093', units: [{ unitId: '1', name: '402' }] }
  ];

  const unitMap: Record<string, Record<string, string>> = {};
  ROOM_MAP.forEach(r => {
    unitMap[r.roomId] = {};
    r.units.forEach(u => {
      unitMap[r.roomId][u.unitId] = u.name;
    });
  });

  return bookingsArray
    .filter((b: any) => b.status !== 'cancelled' && b.status !== '0')
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

      const roomData = getRoomMetadata(b.roomId, b.roomName);
      let pricePerNight = b.price ? (Number(b.price) / nights) : null;
      if (!pricePerNight || pricePerNight <= 0) {
        pricePerNight = getRealPrice(String(b.roomId), b.arrival, rawSource);
      }
      pricePerNight = Math.round(pricePerNight);
      const totalRevenue = pricePerNight * nights;

      const unitName = (unitMap[b.roomId] && b.unitId) ? unitMap[b.roomId][b.unitId] : null;
      const displayRoomName = unitName ? `${roomData.nombre} (${unitName})` : roomData.nombre;

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
