/**
 * Normalización de números de teléfono (formato canónico de la app: solo dígitos con prefijo de país; México = '52' + 10 dígitos).
 * Vive aparte de whatsapp.ts a propósito: whatsapp.ts es código de servidor (Meta, base de datos) y las pantallas que solo necesitan
 * normalizar un teléfono arrastraban ese archivo entero en su paquete de JavaScript. whatsapp.ts lo vuelve a exportar, así que
 * las importaciones existentes siguen funcionando.
 */

const COUNTRY_TO_PREFIX: Record<string, string> = {
  MX: '52',
  US: '1',
  CA: '1',
  CO: '57',
  ES: '34',
  AR: '54',
  CL: '56',
  PE: '51',
  EC: '593',
  VE: '58',
  BR: '55',
  CR: '506',
  PA: '507',
  GT: '502',
  HN: '504',
  SV: '503',
  NI: '505',
  UY: '598',
  PY: '595',
  BO: '591',
  DO: '1',
  PR: '1',
  DE: '49',
  FR: '33',
  GB: '44',
  IT: '39',
  NL: '31',
  CH: '41',
  AT: '43',
  BE: '32',
  PT: '351',
  CZ: '420',
  PL: '48',
  SE: '46',
  NO: '47',
  DK: '45',
  IL: '972',
  AU: '61',
  NZ: '64',
  IN: '91',
  CN: '86',
  JP: '81',
  KR: '82',
};

function countryNameToCode(name: string): string {
  const normalized = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  
  // 1. Mapeo exacto (incluyendo nombres comunes y códigos de 3 letras)
  const map: Record<string, string> = {
    // Códigos de 3 letras
    'mex': 'MX', 'usa': 'US', 'col': 'CO', 'can': 'CA', 'esp': 'ES',
    'arg': 'AR', 'chl': 'CL', 'per': 'PE', 'ecu': 'EC', 'ven': 'VE',
    'bra': 'BR', 'cri': 'CR', 'pan': 'PA', 'gtm': 'GT', 'hnd': 'HN',
    'slv': 'SV', 'nic': 'NI', 'ury': 'UY', 'pry': 'PY', 'bol': 'BO',
    'dom': 'DO', 'pri': 'PR', 'deu': 'DE', 'fra': 'FR', 'gbr': 'GB',
    'ita': 'IT', 'nld': 'NL', 'che': 'CH', 'aut': 'AT', 'bel': 'BE',
    'prt': 'PT',

    // Variantes exactas
    'mexico': 'MX',
    'estados unidos': 'US',
    'estados unidos de america': 'US',
    'united states': 'US',
    'united states of america': 'US',
    'canada': 'CA',
    'colombia': 'CO',
    'espana': 'ES',
    'spain': 'ES',
    'argentina': 'AR',
    'chile': 'CL',
    'peru': 'PE',
    'ecuador': 'EC',
    'venezuela': 'VE',
    'brasil': 'BR',
    'brazil': 'BR',
    'costa rica': 'CR',
    'panama': 'PA',
    'guatemala': 'GT',
    'honduras': 'HN',
    'el salvador': 'SV',
    'nicaragua': 'NI',
    'uruguay': 'UY',
    'paraguay': 'PY',
    'bolivia': 'BO',
    'republica dominicana': 'DO',
    'dominican republic': 'DO',
    'puerto rico': 'PR',
    'alemania': 'DE',
    'germany': 'DE',
    'francia': 'FR',
    'france': 'FR',
    'reino unido': 'GB',
    'united kingdom': 'GB',
    'uk': 'GB',
    'italia': 'IT',
    'italy': 'IT',
    'paises bajos': 'NL',
    'netherlands': 'NL',
    'suiza': 'CH',
    'switzerland': 'CH',
    'austria': 'AT',
    'belgica': 'BE',
    'belgium': 'BE',
    'portugal': 'PT'
  };

  if (map[normalized]) {
    return map[normalized];
  }

  // 2. Búsqueda por coincidencia parcial de palabras clave si no hay coincidencia exacta
  if (normalized.includes('mexic')) return 'MX';
  if (normalized.includes('colomb')) return 'CO';
  if (normalized.includes('united states') || normalized.includes('ee.uu') || normalized.includes('eeuu') || normalized.includes('america')) return 'US';
  if (normalized.includes('canada')) return 'CA';
  if (normalized.includes('espan') || normalized.includes('spain')) return 'ES';
  if (normalized.includes('argentin')) return 'AR';
  if (normalized.includes('chile')) return 'CL';
  if (normalized.includes('peru')) return 'PE';
  if (normalized.includes('ecuador')) return 'EC';
  if (normalized.includes('venezuel')) return 'VE';
  if (normalized.includes('brasil') || normalized.includes('brazil')) return 'BR';
  if (normalized.includes('costa rica')) return 'CR';
  if (normalized.includes('panama')) return 'PA';
  if (normalized.includes('guatemal')) return 'GT';
  if (normalized.includes('hondur')) return 'HN';
  if (normalized.includes('salvador')) return 'SV';
  if (normalized.includes('nicaragu')) return 'NI';
  if (normalized.includes('uruguay')) return 'UY';
  if (normalized.includes('paraguay')) return 'PY';
  if (normalized.includes('bolivi')) return 'BO';
  if (normalized.includes('dominic')) return 'DO';
  if (normalized.includes('puerto rico')) return 'PR';
  if (normalized.includes('aleman') || normalized.includes('german')) return 'DE';
  if (normalized.includes('franc') || normalized.includes('french')) return 'FR';
  if (normalized.includes('reino unido') || normalized.includes('united kingdom')) return 'GB';
  if (normalized.includes('itali')) return 'IT';
  if (normalized.includes('paises bajos') || normalized.includes('netherland')) return 'NL';
  if (normalized.includes('suiz') || normalized.includes('switzer')) return 'CH';
  if (normalized.includes('austri')) return 'AT';
  if (normalized.includes('belgic') || normalized.includes('belgi')) return 'BE';
  if (normalized.includes('portug')) return 'PT';

  return '';
}

// Normaliza un número mexicano al formato canónico único de esta app: '52' + 10 dígitos (12 en total).
// WhatsApp (Meta) dejó de requerir el '1' extra tras el '52' desde 2021; mantenerlo generaba
// un doble formato interno (guardar con '521' y despojarlo recién al llamar a la API). Si el número ya
// trae ese '1' heredado (datos antiguos, u otro sistema que todavía lo añade), se elimina aquí mismo.
function toCanonicalMx(tenDigits: string): string {
  return '52' + tenDigits;
}

// Normaliza y limpia el número de teléfono para base de datos y búsqueda, eliminando cualquier símbolo, espacio o caracter unicode invisible
export function normalizePhone(phone: string, countryCodeOrName?: string | null): string {
  if (!phone) return '';
  const sanitized = String(phone)
    .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, '') // Caracteres invisibles y de dirección LTR/RTL
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ') // Espacios duros / non-breaking spaces
    .replace(/[\u2010-\u2015\u2212]/g, '-') // Guiones unicode no estándar
    .trim();

  let cleaned = sanitized.replace(/\D/g, '');
  if (!cleaned) return '';

  // Limpiar prefijo internacional heredado de conmutadores/telcos '00' (ej. 0034... -> 34..., 0052... -> 52...)
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.replace(/^00+/, '');
    if (!cleaned) return '';
  }

  let cc = (countryCodeOrName || '').trim().toUpperCase();

  // Traducir nombre de país largo a código de 2 letras si es necesario
  if (cc.length > 2) {
    cc = countryNameToCode(cc);
  }

  // PRIORIDAD PREFIJO EXISTENTE:
  // Si el usuario explícitamente incluyó "+1" o "1" con 11 dígitos -> US / Canadá (NANP)
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    return cleaned;
  }

  // Si el número ingresado ya contiene un código de país conocido y su longitud es la estándar,
  // respetamos ese prefijo de forma prioritaria, ignorando el código del país de facturación (cc).
  if (cleaned.startsWith('521') && cleaned.length === 13) {
    return toCanonicalMx(cleaned.substring(3)); // México Móvil (formato heredado con '1') -> canónico '52'
  }
  if (cleaned.startsWith('52') && cleaned.length === 12) {
    return cleaned; // Ya viene en formato canónico '52' + 10 dígitos
  }
  if (cleaned.startsWith('34') && cleaned.length === 11) {
    return cleaned; // España (34 + 9 dígitos)
  }

  // Si el país explícito es EE.UU. o Canadá (NANP)
  if (cc === 'US' || cc === 'CA') {
    if (cleaned.length === 10) {
      return '1' + cleaned;
    }
    if (cleaned.startsWith('1') && cleaned.length === 11) {
      return cleaned;
    }
  }

  // Si el número ya empieza con algún prefijo internacional conocido de COUNTRY_TO_PREFIX y tiene longitud
  // válida. Solo a partir de 11 dígitos: un número de 10 dígitos es un local mexicano (55 CDMX, 33 GDL,
  // 81 MTY...) y no debe confundirse con los prefijos de Brasil, Francia, Japón, etc.
  if (cleaned.length >= 11) {
    for (const p of Object.values(COUNTRY_TO_PREFIX)) {
      if (p !== '52' && p !== '1' && p !== '34' && cleaned.startsWith(p)) {
        const restLen = cleaned.length - p.length;
        if (restLen >= 7 && restLen <= 11) {
          return cleaned;
        }
      }
    }
  }

  // Si no tenemos código de país, aplicamos la lógica clásica basada en la longitud e indicios de texto
  if (!cc) {
    // Si el texto original comenzaba explícitamente con prefijo +1 (ej: +1 (418) 806-4416)
    if (sanitized.startsWith('+1') || sanitized.startsWith('1 ') || sanitized.startsWith('1-')) {
      if (cleaned.length === 11 && cleaned.startsWith('1')) return cleaned;
      if (cleaned.length === 10) return '1' + cleaned;
    }
    // Si comenzaba con +34
    if (sanitized.startsWith('+34')) {
      if (cleaned.length === 11 && cleaned.startsWith('34')) return cleaned;
      if (cleaned.length === 9) return '34' + cleaned;
    }
    if (cleaned.length === 10) {
      return toCanonicalMx(cleaned);
    }
    if (cleaned.startsWith('521') && cleaned.length === 13) {
      return toCanonicalMx(cleaned.substring(3));
    }
    if (cleaned.length === 9) {
      cleaned = '34' + cleaned;
    }
    return cleaned;
  }

  // Si el país es México
  if (cc === 'MX') {
    if (cleaned.length === 10) {
      return toCanonicalMx(cleaned);
    }
    if (cleaned.startsWith('521') && cleaned.length === 13) {
      return toCanonicalMx(cleaned.substring(3));
    }
    if (cleaned.startsWith('52') && cleaned.length === 12) {
      return cleaned;
    }
    if (!cleaned.startsWith('52') && cleaned.length === 10) {
      return toCanonicalMx(cleaned);
    }
    return cleaned;
  }

  // Para otros países conocidos
  const prefix = COUNTRY_TO_PREFIX[cc];
  if (prefix) {
    // Si ya empieza con el prefijo correcto del país
    if (cleaned.startsWith(prefix)) {
      if (prefix === '1' && cleaned.length === 10) {
        return '1' + cleaned;
      }
      return cleaned;
    }
    // Si no empieza con el prefijo del país, se lo añadimos
    return prefix + cleaned;
  }

  // Caída por defecto si el país es desconocido pero se pasó algo que no mapeamos
  if (cleaned.length === 10) {
    return toCanonicalMx(cleaned);
  } else if (cleaned.length === 9) {
    cleaned = '34' + cleaned;
  }
  return cleaned;
}
