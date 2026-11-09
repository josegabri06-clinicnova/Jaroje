/**
 * Tipo de habitación (nombre de la carpeta de fotos en Storage: doble, 1rec, 2rec, 3rec o casa) a partir del nombre de la reserva,
 * por ejemplo "Habitación Doble (304)" o "Apartamento de 3 dormitorios (102)".
 *
 * Es la misma regla que usa el portal del huésped para elegir las fotos de una reserva, y ahora vive en un solo sitio: así la foto
 * que se ve en "Mi Estancia" coincide siempre con la del portal de esa reserva.
 */
export function getRoomTypeKey(roomName: string): string {
  // Para múltiples habitaciones separadas por coma, usar el tipo de la primera
  const firstRoom = (roomName || '').split(',')[0].trim();
  const lower = firstRoom.toLowerCase();
  if (lower.includes('casa') || lower.includes('vacacional')) return 'casa';
  // Condominios 601-607 (categoria local 685543): son de 2 dormitorios, no "habitacion doble"
  if (/\b60[1-7]\b/.test(lower) || lower.includes('685543')) return '2rec';
  if (lower.includes('3 rec') || lower.includes('3 dormitorios') || lower.includes('101') || lower.includes('102') || lower.includes('103') || lower.includes('104') || lower.includes('105') || lower.includes('106') || lower.includes('107')) return '3rec';
  if (lower.includes('2 rec') || lower.includes('2 dormitorios') || lower.includes('201') || lower.includes('202') || lower.includes('203') || lower.includes('204') || lower.includes('205') || lower.includes('206')) return '2rec';
  if (lower.includes('1 rec') || lower.includes('1 dormitorio') || lower.includes('402')) return '1rec';
  return 'doble';
}
