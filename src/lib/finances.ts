import { supabase } from '@/lib/supabase';

/**
 * Normaliza y escapa un string para su uso seguro en expresiones regulares.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Comprueba de manera estricta si una descripción de movimiento financiero
 * corresponde al ID de una reserva específica para evitar falsos positivos.
 */
export function matchesBookingFinance(description: string, bookingId: string | number): boolean {
  if (!description || !bookingId) return false;
  const strId = String(bookingId).trim();
  if (!strId) return false;

  const escaped = escapeRegex(strId);
  // Coincide con:
  // (ID: 123), ID: 123, ID:123, B24: 123, B24:123, [Reserva B24: 123], #123, Reserva 123,
  // o como palabra completa delimitada por límites de palabra o paréntesis/guiones
  const regex = new RegExp(`(?:\\b|ID:\\s*|B24:\\s*|#|Reserva\\s*|\\[Reserva B24:\\s*)${escaped}(?:\\b|\\)|\\s|\\]|$)`, 'i');
  return regex.test(description);
}

export interface RevertedFinanceResult {
  success: boolean;
  bookingId: string;
  deletedCount: number;
  totalIngresosRevertidos: number;
  totalGastosRevertidos: number;
  revertedRecords: any[];
  error?: string;
}

/**
 * REGLA DE NEGOCIO ESTRICTA:
 * Cuando una reserva se cancela, se deben eliminar sus respectivas transacciones 
 * de la sección finanzas y revertir el saldo de las cuentas bancarias/efectivo asociadas
 * para que no haya descuadre contable. ÚNICAMENTE DE RESERVAS CANCELADAS.
 *
 * @param bookingId ID de la reserva cancelada (Beds24 o Local)
 * @param reason Motivo o contexto de la cancelación para la bitácora de auditoría
 */
export async function deleteCancelledReservationFinances(
  bookingId: string | number,
  reason: string = 'Cancelación de reserva'
): Promise<RevertedFinanceResult> {
  const strId = String(bookingId || '').trim();
  if (!strId) {
    return {
      success: false,
      bookingId: '',
      deletedCount: 0,
      totalIngresosRevertidos: 0,
      totalGastosRevertidos: 0,
      revertedRecords: [],
      error: 'ID de reserva vacío o inválido'
    };
  }

  try {
    // 1. Buscar transacciones en 'finances' que contengan el ID de la reserva en su descripción
    const { data: candidates, error: searchErr } = await supabase
      .from('finances')
      .select('*')
      .ilike('description', `%${strId}%`);

    if (searchErr) {
      console.error(`[deleteCancelledReservationFinances] Error buscando finanzas para ID ${strId}:`, searchErr);
      return {
        success: false,
        bookingId: strId,
        deletedCount: 0,
        totalIngresosRevertidos: 0,
        totalGastosRevertidos: 0,
        revertedRecords: [],
        error: searchErr.message
      };
    }

    if (!candidates || candidates.length === 0) {
      console.log(`[deleteCancelledReservationFinances] No existen movimientos financieros para la reserva ${strId}.`);
      return {
        success: true,
        bookingId: strId,
        deletedCount: 0,
        totalIngresosRevertidos: 0,
        totalGastosRevertidos: 0,
        revertedRecords: []
      };
    }

    // 2. Filtrado estricto con regex para asegurar correspondencia exacta del ID
    const matchingRecords = candidates.filter(rec => matchesBookingFinance(rec.description || '', strId));

    if (matchingRecords.length === 0) {
      console.log(`[deleteCancelledReservationFinances] Se encontraron candidatos para ${strId} pero ninguno coincidió con la regla exacta de ID.`);
      return {
        success: true,
        bookingId: strId,
        deletedCount: 0,
        totalIngresosRevertidos: 0,
        totalGastosRevertidos: 0,
        revertedRecords: []
      };
    }

    console.log(`[deleteCancelledReservationFinances] 🗑️ Eliminando ${matchingRecords.length} transacción(es) de finanzas para la reserva cancelada ${strId}...`);

    let totalIngresos = 0;
    let totalGastos = 0;
    const revertedRecords: any[] = [];

    // 3. Revertir saldo de cuentas y eliminar cada registro
    for (const record of matchingRecords) {
      const amount = Number(record.amount || 0);

      if (record.account_id && amount > 0) {
        // Consultar saldo actual de la cuenta
        const { data: acc, error: accErr } = await supabase
          .from('accounts')
          .select('id, name, balance')
          .eq('id', record.account_id)
          .maybeSingle();

        if (acc && !accErr) {
          // Si era ingreso, eliminarlo resta al balance de la cuenta
          // Si era gasto/comisión/impuesto, eliminarlo suma de vuelta al balance
          const revertChange = record.type === 'ingreso' ? -amount : amount;
          const currentBalance = Number(acc.balance || 0);
          const newBalance = currentBalance + revertChange;

          const { error: updateAccErr } = await supabase
            .from('accounts')
            .update({ balance: newBalance })
            .eq('id', acc.id);

          if (updateAccErr) {
            console.error(`[deleteCancelledReservationFinances] Error al revertir saldo de cuenta ${acc.id}:`, updateAccErr);
          } else {
            console.log(`[deleteCancelledReservationFinances] Saldo de cuenta ${acc.name} (${acc.id}) revertido: $${currentBalance} -> $${newBalance} (${revertChange >= 0 ? '+' : ''}${revertChange})`);
          }
        }
      }

      if (record.type === 'ingreso') {
        totalIngresos += amount;
      } else if (record.type === 'gasto') {
        totalGastos += amount;
      }

      // 4. Eliminar el registro de 'finances'
      const { error: delErr } = await supabase
        .from('finances')
        .delete()
        .eq('id', record.id);

      if (delErr) {
        console.error(`[deleteCancelledReservationFinances] Error eliminando registro financiero ${record.id}:`, delErr);
      } else {
        revertedRecords.push(record);
      }
    }

    // 5. Registrar log de auditoría
    if (revertedRecords.length > 0) {
      try {
        await supabase.from('employee_logs').insert([{
          employee_num: '000',
          employee_name: 'Sistema / Finanzas',
          department: 'finanzas',
          module: 'finanzas',
          action: 'finanzas_revertidas_cancelacion',
          room: `Reserva ${strId}`,
          details: JSON.stringify({
            text: `Cancelación Reserva (ID: ${strId}) - Se eliminaron ${revertedRecords.length} movimiento(s) de Finanzas y se ajustaron los saldos de cuentas (Ingresos eliminados: $${totalIngresos}, Gastos revertidos: $${totalGastos}). Motivo: ${reason}`,
            bookingId: strId,
            deletedCount: revertedRecords.length,
            totalIngresosEliminados: totalIngresos,
            totalGastosRevertidos: totalGastos,
            records: revertedRecords.map(r => ({
              id: r.id,
              type: r.type,
              amount: r.amount,
              category: r.category,
              description: r.description,
              account_id: r.account_id,
              date: r.date
            }))
          }),
          created_at: new Date().toISOString()
        }]);
      } catch (logErr) {
        console.error("[deleteCancelledReservationFinances] Error guardando log en employee_logs:", logErr);
      }
    }

    return {
      success: true,
      bookingId: strId,
      deletedCount: revertedRecords.length,
      totalIngresosRevertidos: totalIngresos,
      totalGastosRevertidos: totalGastos,
      revertedRecords
    };
  } catch (err: any) {
    console.error(`[deleteCancelledReservationFinances] Error inesperado para reserva ${strId}:`, err);
    return {
      success: false,
      bookingId: strId,
      deletedCount: 0,
      totalIngresosRevertidos: 0,
      totalGastosRevertidos: 0,
      revertedRecords: [],
      error: err.message || 'Error desconocido'
    };
  }
}

/**
 * Escanea y limpia transacciones de finanzas huérfanas que pertenezcan a
 * reservas actualmente canceladas en la base de datos (beds24_reservations y local_reservas).
 */
export async function cleanupAllCancelledReservationsFinances(): Promise<{
  processedCount: number;
  totalDeleted: number;
  totalIngresosRevertidos: number;
  totalGastosRevertidos: number;
  details: RevertedFinanceResult[];
}> {
  console.log("[cleanupAllCancelledReservationsFinances] Iniciando escaneo global de finanzas en reservas canceladas...");

  // 1. Obtener todas las reservas canceladas de Beds24
  const { data: b24Cancelled } = await supabase
    .from('beds24_reservations')
    .select('id')
    .or('status.eq.cancelled,status.eq.0');

  // 2. Obtener todas las reservas canceladas locales
  const { data: localCancelled } = await supabase
    .from('local_reservas')
    .select('id')
    .eq('status', 'cancelled');

  const cancelledIds = new Set<string>();
  (b24Cancelled || []).forEach((b: any) => cancelledIds.add(String(b.id)));
  (localCancelled || []).forEach((l: any) => cancelledIds.add(String(l.id)));

  let totalDeleted = 0;
  let totalIngresos = 0;
  let totalGastos = 0;
  const results: RevertedFinanceResult[] = [];

  for (const cId of Array.from(cancelledIds)) {
    const res = await deleteCancelledReservationFinances(cId, 'Limpieza preventiva de finanzas en reservas canceladas');
    if (res.deletedCount > 0) {
      totalDeleted += res.deletedCount;
      totalIngresos += res.totalIngresosRevertidos;
      totalGastos += res.totalGastosRevertidos;
      results.push(res);
    }
  }

  console.log(`[cleanupAllCancelledReservationsFinances] Finalizado. Procesadas ${cancelledIds.size} reservas canceladas. Eliminadas ${totalDeleted} transacciones de finanzas.`);

  return {
    processedCount: cancelledIds.size,
    totalDeleted,
    totalIngresosRevertidos: totalIngresos,
    totalGastosRevertidos: totalGastos,
    details: results
  };
}
