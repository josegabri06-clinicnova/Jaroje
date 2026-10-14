// src/lib/country-dial-codes.ts

export interface CountryDialCode {
  name: string;
  code: string;       // ISO 2-letter (e.g. MX, US)
  dialCode: string;   // e.g. +52, +1
  flag: string;       // Emoji flag
  priority?: boolean; // Appears at top of selector
}

export const POPULAR_COUNTRY_CODES: CountryDialCode[] = [
  { name: 'México', code: 'MX', dialCode: '+52', flag: '🇲🇽', priority: true },
  { name: 'Estados Unidos', code: 'US', dialCode: '+1', flag: '🇺🇸', priority: true },
  { name: 'Canadá', code: 'CA', dialCode: '+1', flag: '🇨🇦', priority: true },
  { name: 'España', code: 'ES', dialCode: '+34', flag: '🇪🇸', priority: true },
  { name: 'Colombia', code: 'CO', dialCode: '+57', flag: '🇨🇴', priority: true },
  { name: 'Argentina', code: 'AR', dialCode: '+54', flag: '🇦🇷', priority: true },
  { name: 'Francia', code: 'FR', dialCode: '+33', flag: '🇫🇷', priority: true },
  { name: 'Alemania', code: 'DE', dialCode: '+49', flag: '🇩🇪', priority: true },
  { name: 'Reino Unido', code: 'GB', dialCode: '+44', flag: '🇬🇧', priority: true },
  { name: 'Italia', code: 'IT', dialCode: '+39', flag: '🇮🇹', priority: true },
  { name: 'Chile', code: 'CL', dialCode: '+56', flag: '🇨🇱', priority: true },
  { name: 'Perú', code: 'PE', dialCode: '+51', flag: '🇵🇪', priority: true },
  { name: 'Brasil', code: 'BR', dialCode: '+55', flag: '🇧🇷', priority: true },
  { name: 'Costa Rica', code: 'CR', dialCode: '+506', flag: '🇨🇷', priority: true },
  { name: 'Guatemala', code: 'GT', dialCode: '+502', flag: '🇬🇹', priority: true },
  { name: 'Panamá', code: 'PA', dialCode: '+507', flag: '🇵🇦', priority: true },
  { name: 'Ecuador', code: 'EC', dialCode: '+593', flag: '🇪🇨', priority: true },
  { name: 'Uruguay', code: 'UY', dialCode: '+598', flag: '🇺🇾', priority: true },
  { name: 'El Salvador', code: 'SV', dialCode: '+503', flag: '🇸🇻', priority: true },
  { name: 'Honduras', code: 'HN', dialCode: '+504', flag: '🇭🇳', priority: true },
  { name: 'Rep. Dominicana', code: 'DO', dialCode: '+1', flag: '🇩🇴', priority: true },
];

export const ALL_COUNTRY_CODES: CountryDialCode[] = [
  ...POPULAR_COUNTRY_CODES,
  { name: 'Afganistán', code: 'AF', dialCode: '+93', flag: '🇦🇫' },
  { name: 'Albania', code: 'AL', dialCode: '+355', flag: '🇦🇱' },
  { name: 'Andorra', code: 'AD', dialCode: '+376', flag: '🇦🇩' },
  { name: 'Angola', code: 'AO', dialCode: '+244', flag: '🇦🇴' },
  { name: 'Arabia Saudita', code: 'SA', dialCode: '+966', flag: '🇸🇦' },
  { name: 'Argelia', code: 'DZ', dialCode: '+213', flag: '🇩🇿' },
  { name: 'Armenia', code: 'AM', dialCode: '+374', flag: '🇦🇲' },
  { name: 'Australia', code: 'AU', dialCode: '+61', flag: '🇦🇺' },
  { name: 'Austria', code: 'AT', dialCode: '+43', flag: '🇦🇹' },
  { name: 'Azerbaiyán', code: 'AZ', dialCode: '+994', flag: '🇦🇿' },
  { name: 'Bahamas', code: 'BS', dialCode: '+1', flag: '🇧🇸' },
  { name: 'Bangladés', code: 'BD', dialCode: '+880', flag: '🇧🇩' },
  { name: 'Barbados', code: 'BB', dialCode: '+1', flag: '🇧🇧' },
  { name: 'Baréin', code: 'BH', dialCode: '+973', flag: '🇧🇭' },
  { name: 'Bélgica', code: 'BE', dialCode: '+32', flag: '🇧🇪' },
  { name: 'Belice', code: 'BZ', dialCode: '+501', flag: '🇧🇿' },
  { name: 'Benín', code: 'BJ', dialCode: '+229', flag: '🇧🇯' },
  { name: 'Bielorrusia', code: 'BY', dialCode: '+375', flag: '🇧🇾' },
  { name: 'Bolivia', code: 'BO', dialCode: '+591', flag: '🇧🇴' },
  { name: 'Bosnia y Herzegovina', code: 'BA', dialCode: '+387', flag: '🇧🇦' },
  { name: 'Botsuana', code: 'BW', dialCode: '+267', flag: '🇧🇼' },
  { name: 'Bulgaria', code: 'BG', dialCode: '+359', flag: '🇧🇬' },
  { name: 'Cabo Verde', code: 'CV', dialCode: '+238', flag: '🇨🇻' },
  { name: 'Camboya', code: 'KH', dialCode: '+855', flag: '🇰🇭' },
  { name: 'Camerún', code: 'CM', dialCode: '+237', flag: '🇨🇲' },
  { name: 'Catar', code: 'QA', dialCode: '+974', flag: '🇶🇦' },
  { name: 'China', code: 'CN', dialCode: '+86', flag: '🇨🇳' },
  { name: 'Chipre', code: 'CY', dialCode: '+357', flag: '🇨🇾' },
  { name: 'Corea del Sur', code: 'KR', dialCode: '+82', flag: '🇰🇷' },
  { name: 'Croacia', code: 'HR', dialCode: '+385', flag: '🇭🇷' },
  { name: 'Cuba', code: 'CU', dialCode: '+53', flag: '🇨🇺' },
  { name: 'Dinamarca', code: 'DK', dialCode: '+45', flag: '🇩🇰' },
  { name: 'Egipto', code: 'EG', dialCode: '+20', flag: '🇪🇬' },
  { name: 'Emiratos Árabes Unidos', code: 'AE', dialCode: '+971', flag: '🇦🇪' },
  { name: 'Eslovaquia', code: 'SK', dialCode: '+421', flag: '🇸🇰' },
  { name: 'Eslovenia', code: 'SI', dialCode: '+386', flag: '🇸🇮' },
  { name: 'Estonia', code: 'EE', dialCode: '+372', flag: '🇪🇪' },
  { name: 'Filipinas', code: 'PH', dialCode: '+63', flag: '🇵🇭' },
  { name: 'Finlandia', code: 'FI', dialCode: '+358', flag: '🇫🇮' },
  { name: 'Georgia', code: 'GE', dialCode: '+995', flag: '🇬🇪' },
  { name: 'Ghana', code: 'GH', dialCode: '+233', flag: '🇬🇭' },
  { name: 'Grecia', code: 'GR', dialCode: '+30', flag: '🇬🇷' },
  { name: 'Haití', code: 'HT', dialCode: '+509', flag: '🇭🇹' },
  { name: 'Hungría', code: 'HU', dialCode: '+36', flag: '🇭🇺' },
  { name: 'India', code: 'IN', dialCode: '+91', flag: '🇮🇳' },
  { name: 'Indonesia', code: 'ID', dialCode: '+62', flag: '🇮🇩' },
  { name: 'Irak', code: 'IQ', dialCode: '+964', flag: '🇮🇶' },
  { name: 'Irán', code: 'IR', dialCode: '+98', flag: '🇮🇷' },
  { name: 'Irlanda', code: 'IE', dialCode: '+353', flag: '🇮🇪' },
  { name: 'Islandia', code: 'IS', dialCode: '+354', flag: '🇮🇸' },
  { name: 'Israel', code: 'IL', dialCode: '+972', flag: '🇮🇱' },
  { name: 'Jamaica', code: 'JM', dialCode: '+1', flag: '🇯🇲' },
  { name: 'Japón', code: 'JP', dialCode: '+81', flag: '🇯🇵' },
  { name: 'Jordania', code: 'JO', dialCode: '+962', flag: '🇯🇴' },
  { name: 'Kazajistán', code: 'KZ', dialCode: '+7', flag: '🇰🇿' },
  { name: 'Kenia', code: 'KE', dialCode: '+254', flag: '🇰🇪' },
  { name: 'Kuwait', code: 'KW', dialCode: '+965', flag: '🇰🇼' },
  { name: 'Letonia', code: 'LV', dialCode: '+371', flag: '🇱🇻' },
  { name: 'Líbano', code: 'LB', dialCode: '+961', flag: '🇱🇧' },
  { name: 'Lituania', code: 'LT', dialCode: '+370', flag: '🇱🇹' },
  { name: 'Luxemburgo', code: 'LU', dialCode: '+352', flag: '🇱🇺' },
  { name: 'Macedonia del Norte', code: 'MK', dialCode: '+389', flag: '🇲🇰' },
  { name: 'Malasia', code: 'MY', dialCode: '+60', flag: '🇲🇾' },
  { name: 'Malta', code: 'MT', dialCode: '+356', flag: '🇲🇹' },
  { name: 'Marruecos', code: 'MA', dialCode: '+212', flag: '🇲🇦' },
  { name: 'Mónaco', code: 'MC', dialCode: '+377', flag: '🇲🇨' },
  { name: 'Nicaragua', code: 'NI', dialCode: '+505', flag: '🇳🇮' },
  { name: 'Nigeria', code: 'NG', dialCode: '+234', flag: '🇳🇬' },
  { name: 'Noruega', code: 'NO', dialCode: '+47', flag: '🇳🇴' },
  { name: 'Nueva Zelanda', code: 'NZ', dialCode: '+64', flag: '🇳🇿' },
  { name: 'Países Bajos', code: 'NL', dialCode: '+31', flag: '🇳🇱' },
  { name: 'Pakistán', code: 'PK', dialCode: '+92', flag: '🇵🇰' },
  { name: 'Paraguay', code: 'PY', dialCode: '+595', flag: '🇵🇾' },
  { name: 'Polonia', code: 'PL', dialCode: '+48', flag: '🇵🇱' },
  { name: 'Portugal', code: 'PT', dialCode: '+351', flag: '🇵🇹' },
  { name: 'Puerto Rico', code: 'PR', dialCode: '+1', flag: '🇵🇷' },
  { name: 'República Checa', code: 'CZ', dialCode: '+420', flag: '🇨🇿' },
  { name: 'Rumanía', code: 'RO', dialCode: '+40', flag: '🇷🇴' },
  { name: 'Rusia', code: 'RU', dialCode: '+7', flag: '🇷🇺' },
  { name: 'Senegal', code: 'SN', dialCode: '+221', flag: '🇸🇳' },
  { name: 'Serbia', code: 'RS', dialCode: '+381', flag: '🇷🇸' },
  { name: 'Singapur', code: 'SG', dialCode: '+65', flag: '🇸🇬' },
  { name: 'Sudáfrica', code: 'ZA', dialCode: '+27', flag: '🇿🇦' },
  { name: 'Suecia', code: 'SE', dialCode: '+46', flag: '🇸🇪' },
  { name: 'Suiza', code: 'CH', dialCode: '+41', flag: '🇨🇭' },
  { name: 'Tailandia', code: 'TH', dialCode: '+66', flag: '🇹🇭' },
  { name: 'Taiwán', code: 'TW', dialCode: '+886', flag: '🇹🇼' },
  { name: 'Túnez', code: 'TN', dialCode: '+216', flag: '🇹🇳' },
  { name: 'Turquía', code: 'TR', dialCode: '+90', flag: '🇹🇷' },
  { name: 'Ucrania', code: 'UA', dialCode: '+380', flag: '🇺🇦' },
  { name: 'Venezuela', code: 'VE', dialCode: '+58', flag: '🇻🇪' },
  { name: 'Vietnam', code: 'VN', dialCode: '+84', flag: '🇻🇳' },
];

/**
 * Descompone un número de teléfono crudo en:
 * - dialCode (ej: '+52', '+1', '+34')
 * - nationalNumber (ej: '9981234567')
 */
export function parsePhoneAndDialCode(
  rawPhone: string,
  guestCountry?: string | null
): { dialCode: string; nationalNumber: string } {
  if (!rawPhone || typeof rawPhone !== 'string') {
    const defaultDial = getDialCodeForCountry(guestCountry) || '+52';
    return { dialCode: defaultDial, nationalNumber: '' };
  }

  const clean = rawPhone.trim();
  const digitsOnly = clean.replace(/\D/g, '');

  // 1. Si comienza explícitamente con '+'
  if (clean.startsWith('+')) {
    // Buscar si coincide con algún prefijo conocido (probando desde el prefijo más largo al más corto)
    const sorted = [...ALL_COUNTRY_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length);
    for (const item of sorted) {
      if (clean.startsWith(item.dialCode)) {
        const remainder = clean.substring(item.dialCode.length).replace(/\D/g, '');
        return { dialCode: item.dialCode, nationalNumber: remainder };
      }
    }
  }

  // 2. Si empieza por prefijos comunes sin '+', ej: 521XXXXXXXXXX o 52XXXXXXXXXX
  if (digitsOnly.startsWith('521') && digitsOnly.length === 13) {
    return { dialCode: '+52', nationalNumber: digitsOnly.substring(3) };
  }
  if (digitsOnly.startsWith('52') && digitsOnly.length === 12) {
    return { dialCode: '+52', nationalNumber: digitsOnly.substring(2) };
  }
  if (digitsOnly.startsWith('34') && digitsOnly.length === 11) {
    return { dialCode: '+34', nationalNumber: digitsOnly.substring(2) };
  }
  if (digitsOnly.startsWith('57') && digitsOnly.length === 12) {
    return { dialCode: '+57', nationalNumber: digitsOnly.substring(2) };
  }
  if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
    return { dialCode: '+1', nationalNumber: digitsOnly.substring(1) };
  }

  // 3. Si tiene 10 dígitos o menos y no tiene prefijo claro:
  const fallbackDial = getDialCodeForCountry(guestCountry) || '+52';
  return { dialCode: fallbackDial, nationalNumber: digitsOnly };
}

export function getDialCodeForCountry(country?: string | null): string | null {
  if (!country) return null;
  const c = country.trim().toUpperCase();
  const found = ALL_COUNTRY_CODES.find(item => item.code === c || item.name.toUpperCase() === c);
  return found ? found.dialCode : null;
}

/**
 * Combina el prefijo internacional y el número nacional en formato E.164 estándar
 */
export function buildE164Phone(dialCode: string, nationalNumber: string): string {
  const cleanNational = nationalNumber.replace(/\D/g, '');
  if (!cleanNational) return '';
  const cleanDial = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
  return `${cleanDial} ${cleanNational}`;
}

/**
 * Genera el enlace directo a WhatsApp (https://wa.me/...)
 */
export function buildWhatsAppLink(dialCode: string, nationalNumber: string): string {
  const cleanDialDigits = dialCode.replace(/\D/g, '');
  let cleanNational = nationalNumber.replace(/\D/g, '');

  if (!cleanNational || cleanNational.length < 7) return '';

  // Tratamiento especial México para WhatsApp (+52):
  // Si tiene 10 dígitos y el prefijo es 52, el formato wa.me es 52 + 10 dígitos (o 521 en números muy viejos, pero 52 es el estándar moderno)
  if (cleanDialDigits === '52') {
    if (cleanNational.startsWith('1') && cleanNational.length === 11) {
      cleanNational = cleanNational.substring(1);
    }
    return `https://wa.me/52${cleanNational}`;
  }

  return `https://wa.me/${cleanDialDigits}${cleanNational}`;
}

/**
 * Determina si la reserva proviene de un canal OTA (Booking.com, Expedia, Airbnb, etc.)
 */
export function isOtaReservation(channel?: string | null): boolean {
  if (!channel) return false;
  const c = channel.toLowerCase();
  return c.includes('booking') || c.includes('expedia') || c.includes('airbnb') || c.includes('agoda');
}

/**
 * Determina si el teléfono de una reserva OTA está ausente o es un placeholder inválido
 */
export function isOtaPhoneMissingOrInvalid(phone?: string | null): boolean {
  if (!phone || typeof phone !== 'string') return true;
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 8) return true;
  if (phone.includes('@')) return true; // Proxy email
  if (clean.startsWith('0000') || clean === '1234567890') return true;
  return false;
}
