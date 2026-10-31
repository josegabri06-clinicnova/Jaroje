import { getChildRoomId, getParentMapping } from '@/lib/beds24';

export type RatesMap = Record<string, Record<string, number>>;

export class RatesUnavailableError extends Error {
  constructor() {
    super('No pudimos obtener las tarifas actualizadas. Por favor intenta de nuevo en unos minutos.');
    this.name = 'RatesUnavailableError';
  }
}

// fetchBeds24RatesMap devuelve {} cuando Beds24 no responde; un mapa vacío nunca es un estado válido.
export function assertRatesLoaded(ratesMap: RatesMap | null | undefined): void {
  if (!ratesMap || Object.keys(ratesMap).length === 0) {
    throw new RatesUnavailableError();
  }
}

// Noches de la estancia sin tarifa real en Beds24 (en ese caso el precio caería al catálogo estático).
export function getMissingRateNights(
  ratesMap: RatesMap,
  parentRoomId: string,
  unitId: string,
  checkIn: string,
  checkOut: string
): string[] {
  const childId = getChildRoomId(parentRoomId, unitId) || parentRoomId;
  const parentId = getParentMapping(childId, unitId).roomId;
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (isNaN(start) || isNaN(end) || start >= end) return [checkIn];

  const missing: string[] = [];
  for (let t = start; t < end; t += 24 * 60 * 60 * 1000) {
    const day = new Date(t).toISOString().slice(0, 10);
    const hasRate = (ratesMap[childId]?.[day] ?? 0) > 0 || (ratesMap[parentId]?.[day] ?? 0) > 0;
    if (!hasRate) missing.push(day);
  }
  return missing;
}
