import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function getStoragePath(publicUrl: string) {
  if (!publicUrl) return null;
  const parts = publicUrl.split('/public/');
  if (parts.length < 2) return null;
  const bucketAndPath = parts[1];
  const slashIdx = bucketAndPath.indexOf('/');
  if (slashIdx === -1) return null;
  return bucketAndPath.substring(slashIdx + 1);
}

export async function GET(req: Request) {
  try {
    // 1. Autenticación básica de cron mediante token o cabecera x-cron-secret
    const { searchParams } = new URL(req.url);
    const authHeader = req.headers.get('authorization') || '';
    const cronToken = searchParams.get('token') || 
                      req.headers.get('x-cron-secret') || 
                      authHeader.replace(/^bearer\s+/i, '').trim();
    const expectedToken = process.env.CRON_SECRET;

    if (expectedToken && cronToken !== expectedToken) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    // Límite de 48 horas para check-out y creación
    const limitDateObj = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const limitDateStr = limitDateObj.toISOString().split('T')[0]; // YYYY-MM-DD
    const limitTimestamp = limitDateObj.toISOString();

    console.log(`[Cron Cleanup] Starting file cleanup. Limit checkout date: ${limitDateStr}, limit timestamp: ${limitTimestamp}`);

    let cleanedDniCount = 0;
    let cleanedReceiptsCount = 0;
    const errors: string[] = [];

    // --- 2. Limpieza de tabla 'checkins' (DNI y recibos vinculados a check-in) ---
    const { data: checkinsToClean, error: checkinsErr } = await supabase
      .from('checkins')
      .select('*')
      .lte('check_out_date', limitDateStr);

    if (checkinsErr) {
      console.error("[Cron Cleanup] Error querying checkins:", checkinsErr);
      errors.push(`Checkins query error: ${checkinsErr.message}`);
    } else if (checkinsToClean && checkinsToClean.length > 0) {
      const dniPathsToDelete: string[] = [];
      const receiptPathsToDelete: string[] = [];
      const checkinIdsToUpdate: string[] = [];

      for (const c of checkinsToClean) {
        let updated = false;

        // DNI de storage
        if (c.document_url) {
          const filePath = getStoragePath(c.document_url);
          if (filePath) {
            dniPathsToDelete.push(filePath);
          }
          updated = true;
        }

        // Recibo de checkin de storage
        if (c.receipt_url) {
          const filePath = getStoragePath(c.receipt_url);
          if (filePath) {
            receiptPathsToDelete.push(filePath);
          }
          updated = true;
        }

        if (updated) {
          checkinIdsToUpdate.push(c.id);
        }
      }

      // Borrar DNIs de storage en lote
      if (dniPathsToDelete.length > 0) {
        const { error: delErr } = await supabase.storage.from('dni_images').remove(dniPathsToDelete);
        if (delErr) {
          console.error("[Cron Cleanup] Error removing DNIs batch:", delErr);
          errors.push(`DNI storage deletion batch error: ${delErr.message}`);
        } else {
          cleanedDniCount += dniPathsToDelete.length;
        }
      }

      // Borrar recibos de checkin de storage en lote
      if (receiptPathsToDelete.length > 0) {
        const { error: delErr } = await supabase.storage.from('transfer-receipts').remove(receiptPathsToDelete);
        if (delErr) {
          console.error("[Cron Cleanup] Error removing checkin receipts batch:", delErr);
          errors.push(`Checkin receipts storage deletion batch error: ${delErr.message}`);
        } else {
          cleanedReceiptsCount += receiptPathsToDelete.length;
        }
      }

      // Actualizar base de datos en lote
      if (checkinIdsToUpdate.length > 0) {
        const { error: updErr } = await supabase
          .from('checkins')
          .update({ document_url: null, receipt_url: null })
          .in('id', checkinIdsToUpdate);

        if (updErr) {
          console.error("[Cron Cleanup] Error updating checkins batch in DB:", updErr);
          errors.push(`Checkins DB update batch error: ${updErr.message}`);
        }
      }
    }

    // --- 3. Limpieza de tabla 'transfer_receipts' (Comprobantes de pago) ---
    // Buscar recibos creados hace más de 48 horas que todavía tengan URL de archivo
    const { data: receiptsToClean, error: receiptsErr } = await supabase
      .from('transfer_receipts')
      .select('*')
      .not('receipt_url', 'is', null)
      .lte('created_at', limitTimestamp);

    if (receiptsErr) {
      console.error("[Cron Cleanup] Error querying transfer_receipts:", receiptsErr);
      errors.push(`Receipts query error: ${receiptsErr.message}`);
    } else if (receiptsToClean && receiptsToClean.length > 0) {
      const bookingIds = receiptsToClean.map(tr => Number(tr.booking_id)).filter(Boolean);
      
      // Obtener todas las reservaciones asociadas en una sola consulta
      const { data: bookings } = await supabase
        .from('beds24_reservations')
        .select('id, check_out, status')
        .in('id', bookingIds);

      const bookingMap = new Map(bookings?.map(b => [b.id, b]) || []);

      const filePathsToDelete: string[] = [];
      const trIdsToUpdate: string[] = [];

      for (const tr of receiptsToClean) {
        let shouldDelete = false;

        if (tr.booking_id) {
          const booking = bookingMap.get(Number(tr.booking_id));
          if (booking) {
            // Si la reserva está cancelada o su checkout ocurrió hace más de 48 horas
            if (booking.status === 'cancelled' || booking.check_out <= limitDateStr) {
              shouldDelete = true;
            }
          } else {
            // Si no se encuentra la reservación y el recibo ya tiene más de 48h, lo borramos
            shouldDelete = true;
          }
        } else {
          shouldDelete = true;
        }

        if (shouldDelete && tr.receipt_url) {
          const filePath = getStoragePath(tr.receipt_url);
          if (filePath) {
            filePathsToDelete.push(filePath);
          }
          trIdsToUpdate.push(tr.id);
        }
      }

      // Borrar archivos del storage en lote
      if (filePathsToDelete.length > 0) {
        const { error: delErr } = await supabase.storage
          .from('transfer-receipts')
          .remove(filePathsToDelete);
        
        if (delErr) {
          console.error("[Cron Cleanup] Error removing receipts batch from storage:", delErr);
          errors.push(`Storage deletion batch error: ${delErr.message}`);
        } else {
          cleanedReceiptsCount += filePathsToDelete.length;
        }
      }

      // Actualizar base de datos en lote
      if (trIdsToUpdate.length > 0) {
        const { error: updErr } = await supabase
          .from('transfer_receipts')
          .update({ receipt_url: null })
          .in('id', trIdsToUpdate);

        if (updErr) {
          console.error("[Cron Cleanup] Error updating receipts batch in DB:", updErr);
          errors.push(`Receipts DB update batch error: ${updErr.message}`);
        }
      }
    }

    console.log(`[Cron Cleanup] Cleanup finished. Cleaned DNI files: ${cleanedDniCount}, Cleaned receipts: ${cleanedReceiptsCount}. Errors: ${errors.length}`);

    return NextResponse.json({
      success: true,
      cleanedDniFiles: cleanedDniCount,
      cleanedReceipts: cleanedReceiptsCount,
      errors: errors.length > 0 ? errors : null
    });

  } catch (err: any) {
    console.error("[Cron Cleanup] Fatal error:", err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
