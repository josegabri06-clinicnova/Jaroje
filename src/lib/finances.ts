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

/**
 * Extrae todos los IDs de reserva presentes en la descripción de una transacción (ej: [Reservas B24: 12345, 12346] o (IDs: 12345, 12346))
 */
export function extractBookingIdsFromDescription(description: string): string[] {
  if (!description) return [];
  const found = new Set<string>();

  // 1. [Reservas B24: 12345, 12346] o [Reserva B24: 12345]
  const b24Bracket = description.match(/\[(?:Reservas B24|Reserva B24|Beds24):\s*([^\]]+)\]/i);
  if (b24Bracket && b24Bracket[1]) {
    const parts = b24Bracket[1].split(/[\s,]+/);
    for (const p of parts) {
      const clean = p.trim().replace(/^#/, '');
      if (clean && /^\d+$/.test(clean)) found.add(clean);
    }
  }

  // 2. (IDs: 12345, 12346) o (ID: 12345, 12346)
  const idParens = description.match(/\(IDs?:\s*([^\)]+)\)/i);
  if (idParens && idParens[1]) {
    const parts = idParens[1].split(/[\s,]+/);
    for (const p of parts) {
      const clean = p.trim().replace(/^#/, '');
      if (clean && /^\d+$/.test(clean)) found.add(clean);
    }
  }

  return Array.from(found);
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
 * Si una transacción financiera contiene múltiples reservas (grupo consolidado) y solo se
 * cancela 1 habitación del grupo, se revierte únicamente la parte proporcional correspondiente
 * a esa habitación y se ajusta el saldo restante de la transacción, conservando intactas las
 * habitaciones que continúan activas.
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

    console.log(`[deleteCancelledReservationFinances] 🗑️ Procesando ${matchingRecords.length} transacción(es) de finanzas para la reserva cancelada ${strId}...`);

    let totalIngresos = 0;
    let totalGastos = 0;
    const revertedRecords: any[] = [];

    // 3. Revertir saldo de cuentas y eliminar o ajustar cada registro
    for (const record of matchingRecords) {
      const amount = Number(record.amount || 0);
      const allIdsInRecord = extractBookingIdsFromDescription(record.description || '');

      let isPartialGroupReversal = false;
      let cancelShare = amount;

      if (allIdsInRecord.length > 1) {
        const otherIds = allIdsInRecord.filter(id => id !== strId);

        const { data: b24Active } = await supabase
          .from('beds24_reservations')
          .select('id, status')
          .in('id', otherIds);

        const { data: localActive } = await supabase
          .from('local_reservas')
          .select('id, status')
          .in('id', otherIds);

        const activeOtherIds = new Set<string>();
        (b24Active || []).forEach((b: any) => {
          if (String(b.status) !== '0' && b.status !== 'cancelled') activeOtherIds.add(String(b.id));
        });
        (localActive || []).forEach((l: any) => {
          if (l.status !== 'cancelled') activeOtherIds.add(String(l.id));
        });

        if (activeOtherIds.size > 0) {
          isPartialGroupReversal = true;
          cancelShare = Math.round(amount / allIdsInRecord.length);
          console.log(`[deleteCancelledReservationFinances] ℹ️ Transacción grupal detectada (${allIdsInRecord.join(', ')}). Cancelando únicamente la cuota de la Hab ${strId} ($${cancelShare} de $${amount}). Habitaciones activas restantes: ${Array.from(activeOtherIds).join(', ')}.`);
        }
      }

      const amountToRevert = isPartialGroupReversal ? cancelShare : amount;

      if (record.account_id && amountToRevert > 0) {
        // Consultar saldo actual de la cuenta
        const { data: acc, error: accErr } = await supabase
          .from('accounts')
          .select('id, name, balance')
          .eq('id', record.account_id)
          .maybeSingle();

        if (acc && !accErr) {
          // Si era ingreso, eliminarlo resta al balance de la cuenta
          // Si era gasto/comisión/impuesto, eliminarlo suma de vuelta al balance
          const revertChange = record.type === 'ingreso' ? -amountToRevert : amountToRevert;
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
        totalIngresos += amountToRevert;
      } else if (record.type === 'gasto') {
        totalGastos += amountToRevert;
      }

      if (isPartialGroupReversal) {
        // 4A. Actualizar registro grupal conservando las demás habitaciones
        const remainingAmount = Math.max(0, amount - cancelShare);
        const cleanDesc = (record.description || '')
          .replace(new RegExp(`\\b${escapeRegex(strId)}\\b[,\\s]*`, 'g'), '')
          .replace(/,\s*\]/, ']')
          .trim();
        const updatedDesc = `${cleanDesc} [Ajuste Cancelación Hab ID ${strId}: -$${cancelShare}]`;

        const { error: updErr } = await supabase
          .from('finances')
          .update({
            amount: remainingAmount,
            description: updatedDesc
          })
          .eq('id', record.id);

        if (updErr) {
          console.error(`[deleteCancelledReservationFinances] Error ajustando registro financiero grupal ${record.id}:`, updErr);
        } else {
          revertedRecords.push({
            ...record,
            amount_reverted: cancelShare,
            remaining_amount: remainingAmount
          });
        }
      } else {
        // 4B. Eliminar el registro individual de 'finances'
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
