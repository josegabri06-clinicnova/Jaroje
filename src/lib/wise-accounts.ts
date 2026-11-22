/**
 * Cuentas de Wise en Finanzas: hay dos ("WISE USD" y "WISE MXN") y ambas contienen "WISE" en el nombre.
 * Quien busque "la cuenta Wise" con includes('WISE') se queda con la primera que devuelva la base de datos, que puede ser cualquiera.
 * Aquí se elige la correcta: la de pesos si el comprobante o el portal apuntan a Wise MXN, y la de dólares en cualquier otro caso.
 */
export function findWiseAccount<T extends { name?: string | null }>(accounts: T[], wantMxn: boolean): T | undefined {
  const wise = accounts.filter(a => String(a.name || '').toUpperCase().includes('WISE'));
  const isMxn = (a: T) => String(a.name || '').toUpperCase().includes('MXN');
  if (wantMxn) return wise.find(isMxn) ?? wise[0];
  return wise.find(a => String(a.name || '').toUpperCase().includes('USD')) ?? wise.find(a => !isMxn(a)) ?? wise[0];
}

/** ¿El comprobante (sus notas) es de la cuenta Wise en pesos? Las notas llevan "[Banco Destino: WISE MXN]". */
export function isWiseMxnNote(notes: string): boolean {
  return String(notes || '').toUpperCase().includes('WISE MXN');
}
