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
      for (const c of checkinsToClean) {
        let updated = false;

        // Borrar DNI de storage si existe
        if (c.document_url) {
          const filePath = getStoragePath(c.document_url);
          if (filePath) {
            const { error: delErr } = await supabase.storage.from('dni_images').remove([filePath]);
            if (delErr) {
              console.error(`[Cron Cleanup] Error removing DNI file ${filePath}:`, delErr);
            } else {
              cleanedDniCount++;
            }
          }
          updated = true;
        }

        // Borrar recibo de checkin de storage si existe
        if (c.receipt_url) {
          const filePath = getStoragePath(c.receipt_url);
          if (filePath) {
            const { error: delErr } = await supabase.storage.from('transfer-receipts').remove([filePath]);
            if (delErr) {
              console.error(`[Cron Cleanup] Error removing receipt file ${filePath}:`, delErr);
            } else {
              cleanedReceiptsCount++;
            }
          }
          updated = true;
        }

        // Actualizar base de datos a null
        if (updated) {
          const { error: updErr } = await supabase
            .from('checkins')
            .update({ document_url: null, receipt_url: null })
            .eq('id', c.id);

          if (updErr) {
            console.error(`[Cron Cleanup] Error updating checkin row ID ${c.id}:`, updErr);
            errors.push(`Checkin update error ID ${c.id}: ${updErr.message}`);
          }
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
      for (const tr of receiptsToClean) {
        let shouldDelete = false;

        // Intentar buscar la reserva asociada en beds24_reservations
        if (tr.booking_id) {
          const { data: booking } = await supabase
            .from('beds24_reservations')
            .select('check_out, status')
            .eq('id', Number(tr.booking_id))
            .maybeSingle();

          if (booking) {
            // Si la reserva está cancelada o su checkout ocurrió hace más de 48 horas
            if (booking.status === 'cancelled' || booking.check_out <= limitDateStr) {
              shouldDelete = true;
            }
          } else {
            // Si no se encuentra la reservación y el recibo ya tiene más de 48h creado,
            // lo borramos por seguridad/limpieza.
            shouldDelete = true;
          }
        } else {
          // Si no tiene booking_id asociado, lo borramos
          shouldDelete = true;
        }

        if (shouldDelete && tr.receipt_url) {
          const filePath = getStoragePath(tr.receipt_url);
          if (filePath) {
            const { error: delErr } = await supabase.storage.from('transfer-receipts').remove([filePath]);
            if (delErr) {
              console.error(`[Cron Cleanup] Error removing receipt file ${filePath}:`, delErr);
            } else {
              cleanedReceiptsCount++;
            }
          }

          // Actualizar base de datos
          const { error: updErr } = await supabase
            .from('transfer_receipts')
            .update({ receipt_url: null })
            .eq('id', tr.id);

          if (updErr) {
            console.error(`[Cron Cleanup] Error updating receipt row ID ${tr.id}:`, updErr);
            errors.push(`Receipt update error ID ${tr.id}: ${updErr.message}`);
          }
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
