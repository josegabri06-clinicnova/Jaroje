/**
 * Nombre físico de las habitaciones de las reservas locales (local_reservas), según su categoría (room_id) y unidad (unit_id).
 * La categoría 685543 son las habitaciones 601-607; el resto, 500-507.
 */
export const UNIT_TO_ROOM: Record<string, string> = {
  '1': '500', '2': '501', '3': '502', '4': '503',
  '5': '504', '6': '505', '7': '506', '8': '507',
};

export const UNIT_TO_ROOM_600: Record<string, string> = {
  '1': '601', '2': '602', '3': '603', '4': '604',
  '5': '605', '6': '606', '7': '607',
};

export const ROOM_600_CATEGORY_ID = '685543';

/** Número físico de la habitación ('' si la reserva no tiene unidad asignada) */
export function physicalRoomName(roomId: unknown, unitId: unknown): string {
  if (!unitId) return '';
  const unit = String(unitId);
  const map = String(roomId) === ROOM_600_CATEGORY_ID ? UNIT_TO_ROOM_600 : UNIT_TO_ROOM;
  return map[unit] || unit;
}
