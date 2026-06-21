import { supabase } from './supabase';

// ─── SERVICIO CENTRALIZADO DE BEDS24 JAROJE ─────────────────────────────────────
// Fuente de verdad para reservas del Hotel Condominios Jaroje.
// Centraliza las tarifas, cálculo de temporadas, refresh de tokens y mapeo de unidades.

// Precios BASE por noche (sin impuestos) · Impuesto: 16% IVA + 3% estatal = 19%
export const JAROJE_PRICES: Record<string, Record<string, number>> = {
  // --- Habitación DOBLE (Antigua y nuevas 301-306) ---
  '679077': { baja: 1345, media: 1597, media_alta: 1681, alta: 1849 },
  '685531': { baja: 1345, media: 1597, media_alta: 1681, alta: 1849 },
  '685532': { baja: 1345, media: 1597, media_alta: 1681, alta: 1849 },
  '685533': { baja: 1345, media: 1597, media_alta: 1681, alta: 1849 },
  '685534': { baja: 1345, media: 1597, media_alta: 1681, alta: 1849 },
  '685535': { baja: 1345, media: 1597, media_alta: 1681, alta: 1849 },
  '685536': { baja: 1345, media: 1597, media_alta: 1681, alta: 1849 },

  // --- Apartamento Premier de 1 dormitorio (402) ---
  '679087': { baja: 2017, media: 2395, media_alta: 2521, alta: 2773 },

  // --- Apartamento Premier de 2 dormitorios (Antigua y nuevas 201-206) ---
  '679091': { baja: 2689, media: 3193, media_alta: 3361, alta: 3697 },
  '685312': { baja: 2689, media: 3193, media_alta: 3361, alta: 3697 },
  '685318': { baja: 2689, media: 3193, media_alta: 3361, alta: 3697 },
  '685314': { baja: 2689, media: 3193, media_alta: 3361, alta: 3697 },
  '685315': { baja: 2689, media: 3193, media_alta: 3361, alta: 3697 },
  '685316': { baja: 2689, media: 3193, media_alta: 3361, alta: 3697 },
  '685317': { baja: 2689, media: 3193, media_alta: 3361, alta: 3697 },

  // --- Apartamento Premier de 3 dormitorios (Antigua y nuevas 101-107) ---
  '679092': { baja: 4034, media: 4790, media_alta: 5042, alta: 5546 },
  '685321': { baja: 4034, media: 4790, media_alta: 5042, alta: 5546 },
  '685322': { baja: 4034, media: 4790, media_alta: 5042, alta: 5546 },
  '685323': { baja: 4034, media: 4790, media_alta: 5042, alta: 5546 },
  '685324': { baja: 4034, media: 4790, media_alta: 5042, alta: 5546 },
  '685325': { baja: 4034, media: 4790, media_alta: 5042, alta: 5546 },
  '685326': { baja: 4034, media: 4790, media_alta: 5042, alta: 5546 },
  '685327': { baja: 4034, media: 4790, media_alta: 5042, alta: 5546 },

  // --- Casa Vacacional (Antigua 679093 y nueva 679008) ---
  '679093': { baja: 5378, media: 6387, media_alta: 6723, alta: 7395 },
  '679008': { baja: 5378, media: 6387, media_alta: 6723, alta: 7395 },

  // --- Habitación 500 (tarifa fija: $672.50 base, +19% impuestos se aplica después) ---
  '685542': { baja: 672.50, media: 672.50, media_alta: 672.50, alta: 672.50 },
};

// Nombres canónicos por roomId para el catálogo de display
export const JAROJE_CATALOG: Record<string, any> = {
  // --- Habitación DOBLE (Antigua y nuevas 301-306) ---
  '679077': { nombre: 'Habitación Doble', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },
  '685531': { nombre: 'Habitación DOBLE 301', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },
  '685532': { nombre: 'Habitación DOBLE 302', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },
  '685533': { nombre: 'Habitación DOBLE 303', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },
  '685534': { nombre: 'Habitación DOBLE 304', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },
  '685535': { nombre: 'Habitación DOBLE 305', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },
  '685536': { nombre: 'Habitación DOBLE 306', capacidad: 2, camas: '2 camas dobles', amenities: 'WiFi, AC, Alberca, 5min playa', categoria: 'Estándar' },

  // --- Apartamento Premier de 1 dormitorio (402) ---
  '679087': { nombre: 'Apartamento de 1 dormitorio', capacidad: 4, camas: '1 King o 2 Matrimoniales', amenities: 'Cocina equipada, Terraza, Alberca, Jardín, WiFi, AC', categoria: 'Condominio' },

  // --- Apartamento Premier de 2 dormitorios (Antigua y nuevas 201-206) ---
  '679091': { nombre: 'Apartamento de 2 dormitorios', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },
  '685312': { nombre: 'Apartamento 201', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },
  '685318': { nombre: 'Apartamento 202', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },
  '685314': { nombre: 'Apartamento 203', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },
  '685315': { nombre: 'Apartamento 204', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },
  '685316': { nombre: 'Apartamento 205', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },
  '685317': { nombre: 'Apartamento 206', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, Alberca, 5min playa, 2min plaza', categoria: 'Condominio' },

  // --- Apartamento Premier de 3 dormitorios (Antigua y nuevas 101-107) ---
  '679092': { nombre: 'Apartamento de 3 dormitorios', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '685321': { nombre: 'Apartamento 101', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '685322': { nombre: 'Apartamento 102', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '685323': { nombre: 'Apartamento 103', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '685324': { nombre: 'Apartamento 104', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '685325': { nombre: 'Apartamento 105', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '685326': { nombre: 'Apartamento 106', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },
  '685327': { nombre: 'Apartamento 107', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, Alberca, Ubicación inigualable, 3 Baños', categoria: 'Condominio' },

  // --- Casa Vacacional y Habitación 500 ---
  '679093': { nombre: 'Casa Vacacional de 3 dormitorios', capacidad: 12, camas: '2 King, 3 Matrimoniales', amenities: 'Casa completa, 12 personas, 5min playa', categoria: 'Casa' },
  '679008': { nombre: 'Casa Vacacional de 3 dormitorios', capacidad: 12, camas: '2 King, 3 Matrimoniales', amenities: 'Casa completa, 12 personas, 5min playa', categoria: 'Casa' },
  '685542': { nombre: 'Habitación 500', capacidad: 2, camas: '1 Cama King', amenities: 'WiFi, AC, Vista Premium', categoria: 'Estándar' },

  // Fallbacks genéricos
  'default_1': { nombre: 'Habitación Doble', capacidad: 2, camas: '2 Dobles', amenities: 'WiFi, AC', categoria: 'Estándar' },
  'default_2': { nombre: 'Apartamento de 1 dormitorio', capacidad: 4, camas: '2 Matrimoniales', amenities: 'Cocina, WiFi, AC', categoria: 'Condominio' },
  'default_3': { nombre: 'Apartamento de 2 dormitorios', capacidad: 6, camas: '1 King, 2 Matrimoniales', amenities: 'Cocina completa, 2 Baños', categoria: 'Condominio' },
  'default_4': { nombre: 'Apartamento de 3 dormitorios', capacidad: 8, camas: '1 King, 4 Matrimoniales', amenities: 'Cocina completa, 3 Baños', categoria: 'Condominio' },
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
  };

  if (specificRooms[id]) return specificRooms[id];

  // Fallback a los mapeos antiguos por unidades virtuales
  const oldUnitMap: Record<string, Record<string, string>> = {
    '679077': { '1': '301', '2': '302', '3': '303', '4': '304', '5': '305', '6': '306' },
    '679087': { '1': '402' },
    '679091': { '1': '201', '2': '202', '3': '203', '4': '204', '5': '205', '6': '206' },
    '679092': { '1': '101', '2': '102', '3': '103', '4': '104', '5': '105', '6': '106', '7': '107' },
    '679093': { '1': '401' },
    '685542': { '1': '500', '2': '501', '3': '502', '4': '503', '5': '504', '6': '505', '7': '506', '8': '507' }
  };

  return oldUnitMap[id]?.[uId] || null;
}

export function getBeds24RoomIdAndUnit(physicalRoomName: string | null | undefined): { roomId: string, unitId: string } | null {
  let name = String(physicalRoomName || '').trim();
  name = name.replace(/^(habitación|habitacion|hab\.|hab)\s+/i, '').trim();
  const map: Record<string, { roomId: string, unitId: string }> = {
    '101': { roomId: '679092', unitId: '1' },
    '102': { roomId: '679092', unitId: '2' },
    '103': { roomId: '679092', unitId: '3' },
    '104': { roomId: '679092', unitId: '4' },
    '105': { roomId: '679092', unitId: '5' },
    '106': { roomId: '679092', unitId: '6' },
    '107': { roomId: '679092', unitId: '7' },
    '201': { roomId: '679091', unitId: '1' },
    '202': { roomId: '679091', unitId: '2' },
    '203': { roomId: '679091', unitId: '3' },
    '204': { roomId: '679091', unitId: '4' },
    '205': { roomId: '679091', unitId: '5' },
    '206': { roomId: '679091', unitId: '6' },
    '301': { roomId: '679077', unitId: '1' },
    '302': { roomId: '679077', unitId: '2' },
    '303': { roomId: '679077', unitId: '3' },
    '304': { roomId: '679077', unitId: '4' },
    '305': { roomId: '679077', unitId: '5' },
    '306': { roomId: '679077', unitId: '6' },
    '401': { roomId: '679093', unitId: '1' },
    '402': { roomId: '679087', unitId: '1' },
    '500': { roomId: '685542', unitId: '1' },
    '501': { roomId: '685542', unitId: '2' },
    '502': { roomId: '685542', unitId: '3' },
    '503': { roomId: '685542', unitId: '4' },
    '504': { roomId: '685542', unitId: '5' },
    '505': { roomId: '685542', unitId: '6' },
    '506': { roomId: '685542', unitId: '7' },
    '507': { roomId: '685542', unitId: '8' },
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

// Resolver el ID de habitación hijo específico de Beds24 a partir del ID padre y el unitId
export function getChildRoomId(parentId: string | null | undefined, unitId: string | null | undefined): string | null {
  const pId = String(parentId || '');
  const uId = String(unitId || '1');

  const parentToChild: Record<string, Record<string, string>> = {
    // --- 101 a 107 -> Padre: 679092 ---
    '679092': {
      '1': '685321', '2': '685322', '3': '685323', '4': '685324', '5': '685325', '6': '685326', '7': '685327'
    },
    // --- 201 a 206 -> Padre: 679091 ---
    '679091': {
      '1': '685312', '2': '685318', '3': '685314', '4': '685315', '5': '685316', '6': '685317'
    },
    // --- 301 a 306 -> Padre: 679077 ---
    '679077': {
      '1': '685531', '2': '685532', '3': '685533', '4': '685534', '5': '685535', '6': '685536'
    },
    // --- 401 -> Padre: 679093 ---
    '679093': {
      '1': '679008'
    },
    // --- 402 -> Padre: 679087 ---
    '679087': {
      '1': '679087'
    },
    // --- 500 -> Padre: 685542 ---
    '685542': {
      '1': '685542', '2': '685542', '3': '685542', '4': '685542', '5': '685542', '6': '685542', '7': '685542', '8': '685542'
    }
  };

  return parentToChild[pId]?.[uId] || null;
}

export function getAllChildRoomIds(parentId: string | null | undefined): string[] {
  const pId = String(parentId || '');
  if (!pId) return [];
  const parentToChild: Record<string, Record<string, string>> = {
    '679092': {
      '1': '685321', '2': '685322', '3': '685323', '4': '685324', '5': '685325', '6': '685326', '7': '685327'
    },
    '679091': {
      '1': '685312', '2': '685318', '3': '685314', '4': '685315', '5': '685316', '6': '685317'
    },
    '679077': {
      '1': '685531', '2': '685532', '3': '685533', '4': '685534', '5': '685535', '6': '685536'
    },
    '679093': {
      '1': '679008'
    },
    '679087': {
      '1': '679087'
    },
    '685542': {
      '1': '685542', '2': '685542', '3': '685542', '4': '685542', '5': '685542', '6': '685542', '7': '685542', '8': '685542'
    }
  };
  const mapping = parentToChild[pId];
  if (!mapping) return [pId];
  return Array.from(new Set(Object.values(mapping)));
}

// Detección de temporada (Huatulco/México)
export function getSeason(dateStr: string | null | undefined): 'baja' | 'media' | 'media_alta' | 'alta' {
  if (!dateStr) return 'media';

  // 1. Rangos específicos definidos por el usuario para 2025-2027
  // TEMPORADA ALTA
  if (
    (dateStr >= '2025-12-20' && dateStr <= '2026-01-10') ||
    (dateStr >= '2026-03-27' && dateStr <= '2026-04-11') ||
    (dateStr >= '2026-12-20' && dateStr <= '2027-01-10') ||
    (dateStr >= '2027-03-19' && dateStr <= '2027-04-03') ||
    (dateStr >= '2027-12-20' && dateStr <= '2028-01-10')
  ) {
    return 'alta';
  }

  // TEMPORADA MEDIA-ALTA
  if (
    (dateStr >= '2025-12-15' && dateStr <= '2025-12-19') ||
    (dateStr >= '2026-07-15' && dateStr <= '2026-08-16') ||
    (dateStr >= '2026-12-15' && dateStr <= '2026-12-19') ||
    (dateStr >= '2027-07-15' && dateStr <= '2027-08-16') ||
    (dateStr >= '2027-12-15' && dateStr <= '2027-12-19')
  ) {
    return 'media_alta';
  }

  // TEMPORADA MEDIA
  if (
    (dateStr >= '2026-01-11' && dateStr <= '2026-03-26') ||
    (dateStr >= '2026-08-17' && dateStr <= '2026-08-31') ||
    (dateStr >= '2026-09-12' && dateStr <= '2026-09-15') ||
    (dateStr >= '2026-11-01' && dateStr <= '2026-12-14') ||
    (dateStr >= '2027-01-11' && dateStr <= '2027-03-18') ||
    (dateStr >= '2027-08-17' && dateStr <= '2027-08-31') ||
    (dateStr >= '2027-09-12' && dateStr <= '2027-09-15') ||
    (dateStr >= '2027-11-01' && dateStr <= '2027-12-14')
  ) {
    return 'media';
  }

  // Si es del periodo 2025-2027 y no cayó en ninguna de las anteriores, es BAJA ("Resto del año")
  if (dateStr >= '2025-01-01' && dateStr <= '2027-12-31') {
    return 'baja';
  }

  // 2. Fallback genérico mensual para otros años futuros (2028+)
  const d = new Date(dateStr + 'T12:00:00');
  const month = d.getMonth() + 1; // 1-12
  const day = d.getDate();

  // Temporada Alta: Navidad/Año Nuevo (20 dic - 10 ene) + Semana Santa (aprox fin marzo-inicio abril)
  if ((month === 12 && day >= 20) || (month === 1 && day <= 10)) return 'alta';
  if ((month === 3 && day >= 22) || (month === 4 && day <= 7)) return 'alta'; // Semana Santa / Pascua

  // Temporada Media-Alta: Julio 15 - Agosto 16, Diciembre 15 - 19
  if ((month === 7 && day >= 15) || (month === 8 && day <= 16)) return 'media_alta';
  if (month === 12 && day >= 15 && day <= 19) return 'media_alta'; // Pre-navidad

  // Temporada Media: Jan 11 to Easter-start, Aug 17-31, Sep 12-15, Nov 1 - Dec 14
  if (month === 1 && day >= 11) return 'media';
  if (month === 2) return 'media';
  if (month === 3 && day < 22) return 'media';
  if (month === 8 && day >= 17 && day <= 31) return 'media';
  if (month === 9 && day >= 12 && day <= 15) return 'media';
  if (month === 11 || (month === 12 && day <= 14)) return 'media';

  // Temporada Baja: Resto del año (e.g. Mayo, Junio, Julio 1-14, Septiembre resto, Octubre)
  return 'baja';
}

// Descuento por longitud de estancia (Length of Stay) en Beds24
export function getLengthOfStayMultiplier(nights: number, customDiscounts?: { nights7?: number; nights15?: number; nights30?: number }): number {
  const d7 = customDiscounts?.nights7 !== undefined ? (1 - customDiscounts.nights7 / 100) : 0.85;
  const d15 = customDiscounts?.nights15 !== undefined ? (1 - customDiscounts.nights15 / 100) : 0.75;
  const d30 = customDiscounts?.nights30 !== undefined ? (1 - customDiscounts.nights30 / 100) : 0.60;

  if (nights >= 30) return d30;
  if (nights >= 15) return d15;
  if (nights >= 7) return d7;
  return 1.00;                   // Sin descuento (1-6 noches)
}

// Modificador por canal
export function getChannelMultiplier(referer: string, customMultipliers?: { airbnb?: number; booking?: number; directo?: number }): number {
  const r = (referer || '').toLowerCase();
  const multAirbnb = customMultipliers?.airbnb !== undefined ? customMultipliers.airbnb : 1.20;
  const multBooking = customMultipliers?.booking !== undefined ? customMultipliers.booking : 1.35;
  const multDirecto = customMultipliers?.directo !== undefined ? customMultipliers.directo : 1.00;

  if (r.includes('airbnb')) return multAirbnb;
  if (r.includes('booking')) return multBooking;
  return multDirecto; // Directo / WhatsApp / API
}

// Calcular precio real estimado
export function getRealPrice(
  roomId: string | null | undefined, 
  dateStr: string | null | undefined, 
  referer: string,
  beds24RatesMap?: Record<string, Record<string, number>>,
  unitId?: string | null | undefined,
  dynamicSettings?: any
): number {
  let id = String(roomId || '');

  // Tarifa especial FIJA para habitación 500 (roomId 685542, unitId 1):
  // $672.50 base por noche (el +19% impuestos se aplica en getDirectTotalForStay)
  if (id === '685542' && String(unitId || '') === '1') {
    return 672.50;
  }

  // Mapear 685542 (Apartamentos Nuevos 501-507) a 679077 (Habitación Doble)
  if (id === '685542') {
    id = '679077';
  }

  // Si nos pasan un ID padre y un unitId, intentar resolver al ID hijo específico
  if (unitId) {
    const childId = getChildRoomId(id, unitId);
    if (childId) {
      id = childId;
    }
  }
  
  // 1. Intentar obtener tarifa dinámica de Beds24
  if (beds24RatesMap && dateStr && beds24RatesMap[id] && beds24RatesMap[id][dateStr]) {
    const dynamicPrice = beds24RatesMap[id][dateStr];
    const customMultipliers = dynamicSettings?.[id]?.multipliers;
    const multiplier = getChannelMultiplier(referer, customMultipliers);
    return Math.ceil(dynamicPrice * multiplier * 100) / 100;
  }

  // Si no se encuentra tarifa en el ID de la unidad hijo, intentar buscar en el ID del padre
  if (beds24RatesMap && dateStr) {
    const parentMapping = getParentMapping(id, unitId);
    const parentId = parentMapping.roomId;
    if (parentId !== id && beds24RatesMap[parentId] && beds24RatesMap[parentId][dateStr]) {
      const dynamicPrice = beds24RatesMap[parentId][dateStr];
      const customMultipliers = dynamicSettings?.[parentId]?.multipliers;
      const multiplier = getChannelMultiplier(referer, customMultipliers);
      return Math.ceil(dynamicPrice * multiplier * 100) / 100;
    }
  }

  // 2. Fallback al catálogo estático si no hay tarifa dinámica o falla la conexión
  const prices = JAROJE_PRICES[id];
  if (!prices) {
    // Si es un ID de unidad hijo y no tiene precio estático propio, usar el del padre
    const parentMapping = getParentMapping(id, unitId);
    const parentPrices = JAROJE_PRICES[parentMapping.roomId];
    if (parentPrices) {
      const season = getSeason(dateStr);
      const base = parentPrices[season];
      const customMultipliers = dynamicSettings?.[parentMapping.roomId]?.multipliers;
      const multiplier = getChannelMultiplier(referer, customMultipliers);
      return Math.ceil(base * multiplier * 100) / 100;
    }
    return 2000;
  }
  const season = getSeason(dateStr);
  const base = prices[season];
  const customMultipliers = dynamicSettings?.[id]?.multipliers;
  const multiplier = getChannelMultiplier(referer, customMultipliers);
  return Math.ceil(base * multiplier * 100) / 100;
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

// ─── TOKEN CACHE (en memoria, previene race conditions en serverless) ────────
// En Vercel cada función serverless tiene su propia instancia,
// pero dentro de la MISMA instancia esto evita llamadas simultáneas.
let _cachedToken: string | null = null;
let _cachedTokenExpiry: number = 0; // timestamp en ms
let _refreshPromise: Promise<string> | null = null; // mutex de refresh

// Auto-refresh del token de autenticación Beds24 con persistencia en Supabase
export async function getBeds24Token(): Promise<string> {
  // Si ya tenemos un refresh en curso, esperar a que termine (previene race conditions)
  if (_refreshPromise) {
    return _refreshPromise;
  }

  // Si el token en caché sigue válido (con 5 min de margen), devolverlo directamente
  const now = Date.now();
  if (_cachedToken && _cachedTokenExpiry > now + 5 * 60 * 1000) {
    return _cachedToken;
  }

  // Iniciar refresh (con mutex para evitar llamadas paralelas)
  _refreshPromise = _doRefresh().finally(() => {
    _refreshPromise = null;
  });
  return _refreshPromise;
}

async function _doRefresh(): Promise<string> {
  let tempToken: string | null = null;
  let refreshToken: string | null = null;

  // 1. Leer tokens desde Supabase
  try {
    const { data, error } = await supabase
      .from('beds24_auth')
      .select('temp_token, refresh_token, updated_at')
      .eq('id', 1)
      .single();

    if (!error && data) {
      tempToken = data.temp_token;
      refreshToken = data.refresh_token;

      // Si el token en DB fue actualizado en los últimos 20 minutos, probablemente sigue válido
      // (los tokens de Beds24 duran típicamente 24h, pero el timestamp nos da un hint)
      if (tempToken && data.updated_at) {
        const updatedAt = new Date(data.updated_at).getTime();
        const minutesSinceUpdate = (Date.now() - updatedAt) / (1000 * 60);
        // Los tokens de Beds24 duran 24h. Si tiene menos de 20h de antigüedad, usarlo directamente
        // sin llamar al endpoint de refresh (el refresh token también puede caducar).
        if (minutesSinceUpdate < 20 * 60) {
          _cachedToken = tempToken;
          // Calcular cuánto tiempo queda (máx 23h desde la actualización)
          const remainingMs = Math.max(0, (23 * 60 - minutesSinceUpdate) * 60 * 1000);
          _cachedTokenExpiry = Date.now() + remainingMs;
          console.log(`[Beds24 Auth] Token de Supabase válido (actualizado hace ${Math.round(minutesSinceUpdate)} min)`);
          return tempToken;
        }
        console.log(`[Beds24 Auth] Token de Supabase tiene ${Math.round(minutesSinceUpdate / 60)}h — intentando refrescar.`);
      }
    }
  } catch (err) {
    console.error('[Beds24 Auth] Error al leer tokens de Supabase:', err);
  }

  if (!refreshToken) {
    throw new Error('TOKEN_EXPIRED');
  }

  // 3. Refrescar el token usando el refreshToken
  console.log('[Beds24 Auth] Solicitando nuevo token a Beds24...');
  let refreshRes = await fetch('https://api.beds24.com/v2/authentication/token', {
    method: 'GET',
    headers: { 'refreshToken': refreshToken },
    cache: 'no-store'
  });

  if (!refreshRes.ok) {
    const errText = await refreshRes.text().catch(() => String(refreshRes.status));
    console.error(`[Beds24 Auth] Refresh falló ${refreshRes.status}: ${errText}`);
    
    if (refreshRes.status === 401 || refreshRes.status === 403) {
      // Concurrencia en serverless: un contenedor paralelo podría haber refrescado ya el token.
      // Esperamos un momento y re-verificamos Supabase antes de lanzar error definitivo.
      console.log('[Beds24 Auth] 401/403 detectado, verificando si otro proceso ya renovó el token...');
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
      
      try {
        const { data: dbCheck, error: dbError } = await supabase
          .from('beds24_auth')
          .select('temp_token, refresh_token, updated_at')
          .eq('id', 1)
          .single();
          
        if (!dbError && dbCheck && dbCheck.updated_at) {
          const updatedAt = new Date(dbCheck.updated_at).getTime();
          const minutesSinceUpdate = (Date.now() - updatedAt) / (1000 * 60);
          
          if (minutesSinceUpdate < 5) {
            console.log(`[Beds24 Auth] ✅ Concurrencia resuelta: otro proceso renovó el token hace ${Math.round(minutesSinceUpdate * 60)}s.`);
            _cachedToken = dbCheck.temp_token;
            _cachedTokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
            if (dbCheck.temp_token) {
              return dbCheck.temp_token;
            }
          }
        }
      } catch (checkErr) {
        console.error('[Beds24 Auth] Error al re-verificar tokens de Supabase:', checkErr);
      }
      
      throw new Error('REFRESH_TOKEN_EXPIRED');
    }
    throw new Error('TOKEN_EXPIRED');
  }

  const refreshData = await refreshRes.json();

  if (!refreshData.token) {
    console.error('[Beds24 Auth] Refresh no devolvió token:', JSON.stringify(refreshData));
    if (refreshData.error || refreshData.message?.toLowerCase().includes('expired')) {
      throw new Error('REFRESH_TOKEN_EXPIRED');
    }
    throw new Error('TOKEN_EXPIRED');
  }

  const newTempToken = refreshData.token as string;
  const newRefreshToken = (refreshData.refreshToken || refreshData.refresh_token || refreshToken) as string;

  console.log('[Beds24 Auth] ✅ Token refrescado exitosamente.');

  // 4. Guardar en Supabase inmediatamente
  try {
    const { error: upsertError } = await supabase
      .from('beds24_auth')
      .upsert({
        id: 1,
        temp_token: newTempToken,
        refresh_token: newRefreshToken,
        updated_at: new Date().toISOString()
      });

    if (upsertError) {
      console.error('[Beds24 Auth] Error al guardar en Supabase:', upsertError.message);
    } else {
      console.log('[Beds24 Auth] Tokens guardados en Supabase.');
    }
  } catch (err) {
    console.error('[Beds24 Auth] Excepción al guardar en Supabase:', err);
  }

  // 5. Actualizar caché en memoria (válido 23 horas para tokens de Beds24 que duran 24h)
  _cachedToken = newTempToken;
  _cachedTokenExpiry = Date.now() + 23 * 60 * 60 * 1000;

  // Guardado local en caché de memoria del proceso

  return newTempToken;
}


// Obtener todas las reservas de Beds24 consumiendo su paginación de forma iterativa y segura (SaaS B2B)
export async function fetchAllRawBeds24Bookings(arrivalFrom: string, arrivalTo: string): Promise<any[]> {
  const BEDS24_TOKEN = await getBeds24Token();
  let url = `https://api.beds24.com/v2/bookings?arrivalFrom=${arrivalFrom}&arrivalTo=${arrivalTo}&limit=99&includeInvoiceItems=true`;
  let bookingsArray: any[] = [];
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
      cache: 'no-store'
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error('TOKEN_EXPIRED');
    }

    if (!res.ok) {
      throw new Error(`Error BEDS24 ${res.status}: ${await res.text()}`);
    }

    const dataB24 = await res.json();
    if (dataB24.data && Array.isArray(dataB24.data)) {
      bookingsArray = bookingsArray.concat(dataB24.data);
    }

    // Seguir el enlace de la siguiente página si existe
    if (dataB24.pages && dataB24.pages.nextPageExists && dataB24.pages.nextPageLink) {
      url = dataB24.pages.nextPageLink;
      if (url.startsWith('/')) {
        url = `https://api.beds24.com${url}`;
      }
    } else {
      hasNextPage = false;
    }
  }

  return bookingsArray;
}

// Obtener mapa de tarifas diarias desde Beds24 API v2 (para el rango de fechas solicitado)
export async function fetchBeds24RatesMap(
  token: string, 
  fromDateStr: string, 
  toDateStr: string
): Promise<Record<string, Record<string, number>>> {
  const ratesMap: Record<string, Record<string, number>> = {};
  try {
    const res = await fetch(`https://api.beds24.com/v2/inventory/rooms/calendar?startDate=${fromDateStr}&endDate=${toDateStr}&includePrices=true`, {
      method: 'GET',
      headers: { 'token': token },
      cache: 'no-store'
    });
    if (!res.ok) {
      console.warn(`[Beds24 Rates] API responded with status ${res.status}`);
      return ratesMap;
    }
    const json = await res.json();
    const calData: any[] = Array.isArray(json) ? json : (json.data || []);

    calData.forEach((roomItem: any) => {
      const roomId = String(roomItem.roomId);
      ratesMap[roomId] = {};
      if (Array.isArray(roomItem.calendar)) {
        roomItem.calendar.forEach((range: any) => {
          const dailyPrice = range.price1 || range.price || 0;
          if (dailyPrice > 0 && range.from && range.to) {
            const start = new Date(range.from + 'T00:00:00');
            const end = new Date(range.to + 'T00:00:00');
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
              const current = new Date(start);
              while (current <= end) {
                const dateStr = current.toISOString().split('T')[0];
                ratesMap[roomId][dateStr] = Number(dailyPrice);
                current.setDate(current.getDate() + 1);
              }
            }
          }
        });
      }
    });
  } catch (err: any) {
    console.warn(`[Beds24 Rates] Fallback to static catalog due to network or API error: ${err.message}`);
  }
  return ratesMap;
}

// Calcular la tarifa diaria promedio dinámicamente sumando las tarifas de cada noche de estancia
export function getAverageRatesForDates(
  roomId: string | null | undefined,
  arrival: string | null | undefined,
  departure: string | null | undefined,
  referer: string,
  beds24RatesMap: Record<string, Record<string, number>>,
  unitId?: string | null | undefined,
  dynamicSettings?: any
): number {
  if (!arrival || !departure) {
    return getRealPrice(roomId, arrival, referer, beds24RatesMap, unitId, dynamicSettings);
  }

  const id = String(roomId || '');
  const start = new Date(arrival);
  const end = new Date(departure);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start.getTime() >= end.getTime()) {
    return getRealPrice(roomId, arrival, referer, beds24RatesMap, unitId, dynamicSettings);
  }

  let totalSum = 0;
  let daysCount = 0;

  const current = new Date(start);
  while (current < end) {
    const currentDateStr = current.toISOString().split('T')[0];
    const dailyPrice = getRealPrice(id, currentDateStr, referer, beds24RatesMap, unitId, dynamicSettings);
    totalSum += dailyPrice;
    daysCount++;
    current.setDate(current.getDate() + 1);
  }

  const averageBase = daysCount > 0 ? Math.ceil((totalSum / daysCount) * 100) / 100 : getRealPrice(roomId, arrival, referer, beds24RatesMap, unitId, dynamicSettings);
  const customDiscounts = dynamicSettings?.[id]?.discounts;
  const discountMultiplier = getLengthOfStayMultiplier(daysCount, customDiscounts);
  return Math.ceil(averageBase * discountMultiplier * 100) / 100;
}

export interface TaxInfo {
  iva: number;
  ish: number;
  otros: number;
  total: number;
}

export function extractTaxesFromInvoice(invoiceItems: any[]): TaxInfo {
  let iva = 0;
  let ish = 0;
  let otros = 0;

  if (!invoiceItems || !Array.isArray(invoiceItems)) {
    return { iva, ish, otros, total: 0 };
  }

  invoiceItems.forEach(item => {
    const qty = Number(item.qty || 0);
    const price = Number(item.price || 0);
    const lineTotal = qty * price;
    const desc = (item.description || '').toLowerCase();
    
    // Solo procesar cargos (qty > 0)
    if (qty > 0) {
      // 1. Detección por descripción de línea (impuestos separados)
      if (desc.includes('iva') || desc.includes('vat')) {
        iva += lineTotal;
      } else if (desc.includes('ish') || desc.includes('hospedaje') || desc.includes('lodging')) {
        ish += lineTotal;
      } else if (desc.includes('tax') || desc.includes('impuesto')) {
        if (desc.includes('16')) {
          iva += lineTotal;
        } else if (desc.includes('3')) {
          ish += lineTotal;
        } else {
          otros += lineTotal;
        }
      } else {
        // 2. Detección por tasa de impuesto (VAT/Tax Rate en la misma línea del cargo)
        const vatRate = Number(item.vatRate || item.taxRate || 0);
        if (vatRate === 16) {
          iva += lineTotal - (lineTotal / 1.16);
        } else if (vatRate === 3) {
          ish += lineTotal - (lineTotal / 1.03);
        } else if (vatRate > 0) {
          otros += lineTotal - (lineTotal / (1 + vatRate / 100));
        }
      }
    }
  });

  return {
    iva: Math.round(iva),
    ish: Math.round(ish),
    otros: Math.round(otros),
    total: Math.round(iva + ish + otros)
  };
}

export interface OtaDetails {
  expectedPayout: number;
  hostFee: number;
}

export function extractOtaDetails(invoiceItems: any[]): OtaDetails {
  let expectedPayout = 0;
  let hostFee = 0;

  if (invoiceItems && Array.isArray(invoiceItems)) {
    invoiceItems.forEach((item: any) => {
      const desc = String(item.description || item.desc || '').toLowerCase();
      const qty = item.qty !== undefined ? Number(item.qty) : 1;
      const price = item.price !== undefined ? Number(item.price) : 0;
      const amount = item.amount !== undefined ? Number(item.amount) : (qty * price);

      if (desc.includes('expected payout') || desc.includes('expected_payout')) {
        expectedPayout += amount;
      } else if (desc.includes('host fee') || desc.includes('host_fee') || desc.includes('comisión') || desc.includes('comision')) {
        hostFee += Math.abs(amount);
      }
    });
  }

  return {
    expectedPayout: Math.round(expectedPayout * 100) / 100,
    hostFee: Math.round(hostFee * 100) / 100
  };
}

// Obtener y mapear reservas activas (Backend Server-Side)
export async function getBeds24Bookings(fast: boolean = false): Promise<any[]> {
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 180);
  const arrivalFrom = fromDate.toISOString().split('T')[0];

  const toDate = new Date(today);
  toDate.setDate(today.getDate() + 1000);
  const arrivalTo = toDate.toISOString().split('T')[0];

  // 1. Obtener token y reservas raw
  const token = await getBeds24Token();
  const bookingsArray = await fetchAllRawBeds24Bookings(arrivalFrom, arrivalTo);

  // Cargar dynamicSettings de precios
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
    console.error("Error al obtener dynamicSettings en getBeds24Bookings:", err);
  }

  // 2. Obtener tarifas de calendario dinámicas de Beds24 (de hoy a 540 días en adelante)
  const ratesToDate = new Date(today);
  ratesToDate.setDate(today.getDate() + 540);
  const ratesTo = ratesToDate.toISOString().split('T')[0];
  const beds24RatesMap = fast ? {} : await fetchBeds24RatesMap(token, arrivalFrom, ratesTo);

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

  // Excluir roomId 685542 (habitaciones 500-507: son locales, no de Beds24)
  // Excluir "Unallocated": reservas sin unitId asignado (unitId = 0, nulo o vacío)
  const LOCAL_ROOM_ID = '685542';

  // --- Capturar reservas OTA de la habitación 500 para auto-sync a locales ---
  // unitId=1 es la 500 en Beds24. Cuando una OTA (Airbnb/Booking) reserva ahí,
  // la clonamos a una habitación local 501-507 disponible.
  const otaRoom500Bookings = bookingsArray.filter((b: any) => {
    if (String(b.status) === '0' || b.status === 'cancelled') return false;
    const rId = String(b.roomId || '').trim();
    if (rId !== LOCAL_ROOM_ID) return false;
    const uId = String(b.unitId ?? '').trim();
    if (!uId || uId === '0') return false; // Excluir unallocated
    // Detectar si es OTA
    const rawSource = String(`${b.referer || ''} ${b.source || ''} ${b.apiSource || ''} ${b.apiReference || ''}`).toLowerCase();
    const guestNameUpper = `${b.firstName || ''} ${b.lastName || ''}`.toUpperCase();
    const isOTA = rawSource.includes('airbnb') || rawSource.includes('booking') || rawSource.includes('expedia')
      || guestNameUpper.includes('PAGADO A') || guestNameUpper.includes('PAGADO B');
    return isOTA;
  }).map((b: any) => {
    const rawSource = String(`${b.referer || ''} ${b.source || ''} ${b.apiSource || ''} ${b.apiReference || ''}`).toLowerCase();
    const guestNameUpper = `${b.firstName || ''} ${b.lastName || ''}`.toUpperCase();
    let channel = 'Directo';
    if (rawSource.includes('airbnb') || guestNameUpper.includes('PAGADO A')) channel = 'Airbnb';
    else if (rawSource.includes('booking') || guestNameUpper.includes('PAGADO B')) channel = 'Booking.com';
    else if (rawSource.includes('expedia')) channel = 'Expedia';

    const arrivalDate = b.arrival ? new Date(b.arrival) : null;
    const departureDate = b.departure ? new Date(b.departure) : null;
    const nights = (arrivalDate && departureDate)
      ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 1;

    return {
      beds24_id: String(b.id),
      guest_name: `${b.firstName || ''}${b.lastName ? ' ' + b.lastName : ''}`.trim() || 'Huésped OTA',
      check_in: b.arrival,
      check_out: b.departure,
      price: b.price !== undefined ? Number(b.price) : 0,
      deposit: b.deposit !== undefined ? Number(b.deposit) : 0,
      phone: b.phone || b.mobile || '',
      num_adult: b.numAdult ? Number(b.numAdult) : 1,
      num_child: b.numChild ? Number(b.numChild) : 0,
      notes: b.info || b.notes || '',
      channel,
      nights,
      unit_id: String(b.unitId || '1'),
    };
  });

  // Almacenar en variable de módulo para que route.ts pueda accederla
  _lastOtaRoom500Bookings = otaRoom500Bookings;

  return bookingsArray
    .filter((b: any) => {
      if (String(b.status) === '0' || b.status === 'cancelled') return false;
      const rId = String(b.roomId || '').trim();
      // Excluir habitaciones locales 500-507 que Beds24 no gestiona
      if (rId === LOCAL_ROOM_ID) return false;
      // Excluir "Unallocated": sin unitId o unitId = 0
      const uId = String(b.unitId ?? '').trim();
      if (!uId || uId === '0') return false;
      return true;
    })
    .map((b: any) => {
      const arrivalDate = b.arrival ? new Date(b.arrival) : null;
      const departureDate = b.departure ? new Date(b.departure) : null;
      const nights = (arrivalDate && departureDate)
        ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 1;

      const rawSource = String(`${b.referer || ''} ${b.source || ''} ${b.apiSource || ''} ${b.apiReference || ''}`).toLowerCase();
      const guestNameUpper = `${b.firstName || ''} ${b.lastName || ''}`.toUpperCase();

      let channel = 'Directo';
      if (rawSource.includes('airbnb') || guestNameUpper.includes('PAGADO A')) channel = 'Airbnb';
      else if (rawSource.includes('booking') || guestNameUpper.includes('PAGADO B')) channel = 'Booking.com';
      else if (rawSource.includes('expedia')) channel = 'Expedia';
      else if (rawSource.includes('whatsapp') || rawSource.includes('n8n')) channel = 'WhatsApp Bot';
      else if (rawSource.includes('beds24')) channel = 'Beds24';

      const isOTA = ['Airbnb', 'Booking.com', 'Expedia'].includes(channel);

      const roomData = getRoomMetadata(b.roomId, b.roomName);
      let pricePerNight = (b.price !== undefined && b.price !== null && b.price !== '') ? (Number(b.price) / nights) : null;
      const hasInvoiceItems = Array.isArray(b.invoiceItems) && b.invoiceItems.length > 0;
      if (!isOTA && (pricePerNight === null || (pricePerNight < 10 && !hasInvoiceItems))) {
        pricePerNight = getAverageRatesForDates(String(b.roomId), b.arrival, b.departure, rawSource, beds24RatesMap, String(b.unitId || ''), dynamicSettings);
      } else if (isOTA && pricePerNight === null) {
        pricePerNight = 0;
      }
      pricePerNight = Math.round(pricePerNight ?? 0);
      const totalRevenue = pricePerNight * nights;

      const unitName = getUnitName(b.roomId, b.unitId);
      const displayRoomName = unitName 
        ? (roomData.nombre.includes(unitName) ? roomData.nombre : `${roomData.nombre} (${unitName})`)
        : roomData.nombre;

      const taxInfo = extractTaxesFromInvoice(b.invoiceItems);
      const otaDetails = extractOtaDetails(b.invoiceItems);

      return {
        id: b.id || Math.random().toString(),
        check_in: b.arrival,
        check_out: b.departure,
        guest_name: `${b.firstName || ''}${b.lastName ? ' ' + b.lastName : ''}`.trim() || 'Huésped',
        guest_phone: b.phone || b.mobile || null,
        guest_email: b.email || null,
        status: b.status === 'black' ? 'black' : (b.status === '1' || b.status === 'confirmed') ? 'confirmed' : 'pending',
        source: 'beds24',
        channel: channel,
        room_name: displayRoomName,
        room_id: b.roomId,
        nights: nights,
        price_estimate: totalRevenue,
        price_per_night: pricePerNight,
        deposit: b.deposit !== undefined ? Number(b.deposit) : 0,
        balance: b.balance !== undefined ? Number(b.balance) : (totalRevenue - (b.deposit !== undefined ? Number(b.deposit) : 0)),
        notes: b.info || b.notes || null,
        num_adult: b.numAdult ? Number(b.numAdult) : 1,
        num_child: b.numChild ? Number(b.numChild) : 0,
        rooms: { name: roomData.nombre },
        taxes: taxInfo,
        expected_payout: otaDetails.expectedPayout,
        host_fee: otaDetails.hostFee,
        booking_time: b.bookingTime || b.arrival || null
      };
    });
}

// Variable de módulo para almacenar las reservas OTA de habitación 500
let _lastOtaRoom500Bookings: any[] = [];

/** Devuelve las reservas OTA de Beds24 que llegaron a la habitación 500 */
export function getOtaRoom500Bookings(): any[] {
  return _lastOtaRoom500Bookings;
}

// Enviar tarifas actualizadas directamente al calendario de Beds24
export async function pushRatesToBeds24(ratesPayload: any[]): Promise<any> {
  const token = await getBeds24Token();
  
  const res = await fetch('https://api.beds24.com/v2/inventory/calendar', {
    method: 'POST',
    headers: {
      'token': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(ratesPayload),
    cache: 'no-store'
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Beds24 rechazó la actualización de tarifas: ${errText}`);
  }

  const json = await res.json();
  return json;
}

/**
 * Retorna las reglas de capacidad de una habitación específica por su nombre o ID.
 */
export function getCapacityRules(
  roomNameOrId: string,
  customSettings?: Record<string, { base: number; max: number }>
): { base: number; max: number } {
  const r = (roomNameOrId || '').toLowerCase();

  if (customSettings) {
    if (customSettings[roomNameOrId]) {
      return customSettings[roomNameOrId];
    }
    for (const key of Object.keys(customSettings)) {
      if (r.includes(key.toLowerCase()) || key.toLowerCase().includes(r)) {
        return customSettings[key];
      }
    }
  }
  // 500 es de 2 huéspedes únicamente
  if (r.includes('500')) {
    return { base: 2, max: 2 };
  }
  // 501-507 o el tipo 685542 es de 4 huéspedes (sin opción a adicionales)
  if (r === '685542' || r.includes('501') || r.includes('502') || r.includes('503') || r.includes('504') || r.includes('505') || r.includes('506') || r.includes('507')) {
    return { base: 4, max: 4 };
  }
  if (r === '679077' || r.includes('doble') || r.includes('301') || r.includes('302') || r.includes('303') || r.includes('304') || r.includes('305') || r.includes('306')) {
    return { base: 4, max: 4 };
  }
  if (r === '679087' || r.includes('1 dormitorio') || r.includes('402')) {
    return { base: 4, max: 4 };
  }
  if (r === '679091' || r.includes('2 dormitorios') || r.includes('201') || r.includes('202') || r.includes('203') || r.includes('204') || r.includes('205') || r.includes('206')) {
    return { base: 6, max: 8 };
  }
  if (r === '679092' || r.includes('3 dormitorios') || r.includes('101') || r.includes('102') || r.includes('103') || r.includes('104') || r.includes('105') || r.includes('106') || r.includes('107')) {
    return { base: 10, max: 12 };
  }
  if (r === '679093' || r.includes('casa') || r.includes('401')) {
    return { base: 12, max: 16 };
  }
  return { base: 6, max: 8 }; // default fallback
}

/**
 * Calcula el monto total sugerido de una renta directa basándose en fechas, habitación
 * y reglas/temporadas (incluyendo impuesto 19% e huéspedes adicionales).
 */
export function getDirectTotalForStay(
  roomName: string, // ej. '102'
  checkIn: string,
  checkOut: string,
  rulesList?: any[],
  numAdults: number = 1,
  numChildren: number = 0,
  capacitySettings?: Record<string, any>
): number {
  const roomB24 = getBeds24RoomIdAndUnit(roomName);
  if (!roomB24) return 0;

  const checkInDate = new Date(checkIn + 'T12:00:00');
  const checkOutDate = new Date(checkOut + 'T12:00:00');
  const nights = Math.max(1, Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)));

  let discountMult = 1.0;
  if (nights >= 30) discountMult = 0.60;
  else if (nights >= 15) discountMult = 0.75;
  else if (nights >= 7) discountMult = 0.85;

  const capRules = getCapacityRules(roomName, capacitySettings);
  const totalGuests = numAdults + numChildren;
  const extraGuests = Math.max(0, totalGuests - capRules.base);
  const extraGuestPrice = capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500;
  const surchargePerNight = extraGuests * extraGuestPrice;

  let totalDirect = 0;
  for (let i = 0; i < nights; i++) {
    const curr = new Date(checkInDate);
    curr.setDate(curr.getDate() + i);
    const dateStr = curr.toISOString().split('T')[0];

    let priceUsed = 0;

    // 1. Buscar en reglas de Supabase si se proveen
    if (rulesList && rulesList.length > 0) {
      const specialRule = rulesList.find(rule => 
        rule.room_type_id === roomB24.roomId && 
        rule.rule_type === 'special' && 
        rule.start_date <= dateStr && 
        rule.end_date >= dateStr
      );
      const seasonalRule = rulesList.find(rule => 
        rule.room_type_id === roomB24.roomId && 
        rule.rule_type === 'seasonal' && 
        rule.start_date <= dateStr && 
        rule.end_date >= dateStr
      );
      const baseRule = rulesList.find(rule => 
        rule.room_type_id === roomB24.roomId && 
        rule.rule_type === 'base'
      );

      if (specialRule) {
        priceUsed = Number(specialRule.price);
      } else if (seasonalRule) {
        priceUsed = Number(seasonalRule.price);
      } else if (baseRule) {
        priceUsed = Number(baseRule.price);
      }
    }

    // 2. Fallback a tarifas fijas estacionales de JAROJE_PRICES
    if (priceUsed <= 0) {
      const parentRoom = getParentMapping(roomB24.roomId, roomB24.unitId);
      const season = getSeason(dateStr);
      priceUsed = JAROJE_PRICES[parentRoom.roomId]?.[season] || 2000;
    }

    const nightBase = Math.round(priceUsed * discountMult) + surchargePerNight;
    const nightTax = Math.round(nightBase * 0.19);
    totalDirect += nightBase + nightTax;
  }

  return totalDirect;
}

/**
 * Retorna el desglose neto + comisión OTA para una reserva Airbnb/Booking.
 */
export function computeOtaSplit(
  totalAmount: number,
  channel: string,
  roomName: string,
  checkIn: string,
  checkOut: string,
  rulesList?: any[],
  numAdults: number = 1,
  numChildren: number = 0
): {
  isOTA: boolean;
  netRevenue: number;
  commission: number;
  channelLabel: string;
} {
  const ch = (channel || '').toLowerCase();
  const isAirbnb = ch.includes('airbnb');
  const isBooking = ch.includes('booking');
  const isExpedia = ch.includes('expedia');

  if (isAirbnb || isBooking || isExpedia) {
    const channelLabel = isAirbnb ? 'Airbnb' : isBooking ? 'Booking.com' : 'Expedia';
    
    let netRevenue = totalAmount;
    let commission = 0;

    if (isAirbnb) {
      // Fórmula matemática exacta para Airbnb México (15.5% + IVA de host fee, 8% IVA + 4% ISR withholding, 16% Lodging Tax)
      // tarifa_cuarto = totalAmount / 1.16
      // host_fee = tarifa_cuarto * 15.5% * 1.16 = tarifa_cuarto * 17.98%
      // expected_payout = tarifa_cuarto * (1 + 16% Lodging Tax - 17.98% host fee - 12% retenciones) = tarifa_cuarto * 86.02%
      const roomRate = Math.round(totalAmount / 1.16);
      commission = Math.round(roomRate * 0.1798);
      netRevenue = Math.round(roomRate * 0.8602);
    } else {
      // Booking.com o Expedia: 15% de comisión estándar
      commission = Math.round(totalAmount * 0.15);
      netRevenue = totalAmount - commission;
    }

    return {
      isOTA: true,
      netRevenue,
      commission,
      channelLabel
    };
  }

  return { isOTA: false, netRevenue: totalAmount, commission: 0, channelLabel: '' };
}
