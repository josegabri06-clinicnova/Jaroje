import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import {
  findConversationsByPhone,
  WHATSAPP_STATUS_RANK,
} from '@/lib/whatsapp';
import { normalizePhone } from '@/lib/phone';

export const dynamic = 'force-dynamic';

interface WhatsAppLogRow {
  id: string;
  reservation_id: string | null;
  template_name: string | null;
  phone: string | null;
  sent_at: string;
  status: string | null;
}

interface ConversationMessageTelemetry {
  timestamp?: string;
  template_name?: string;
  delivery_status?: string;
  reservation_id?: string | number;
  wamid?: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  failed_at?: string;
  error_code?: string | number;
  error_message?: string;
}

const TEMPLATE_LABELS: Record<string, string> = {
  solicitud_recibida: 'Solicitud de reserva (24h)',
  ultimo_aviso: 'Último aviso (por vencer)',
  ultimo_aviso_v2: 'Último aviso (por vencer)',
  reservacion_confirmada: 'Reservación confirmada',
  confirmacion_reserva_util: 'Reservación confirmada',
  disponibilidad_liberada: 'Disponibilidad liberada (expirada)',
  disponibilidad_liberada_v2: 'Disponibilidad liberada (expirada)',
  preparacion_llegada: 'Preparación de llegada',
  preparacion_llegada_v2: 'Preparación de llegada',
  bienvenida_checkin: 'Bienvenida Check-In',
  bienvenida_checkin_v2: 'Bienvenida Check-In',
  seguimiento_satisfaccion: 'Seguimiento de estancia',
  seguimiento_satisfaccion_v2: 'Seguimiento de estancia',
  salida_checkout: 'Recordatorio de Check-Out (12:00 p.m.)',
  comparte_experiencia: 'Solicitud de reseña',
  recibimiento_nuevamente: 'Seguimiento post-estancia',
  recibimiento_nuevamente_v2: 'Seguimiento post-estancia',
  recibimiento_nuevamente_5m: 'Seguimiento post-estancia',
  recibimiento_nuevamente_10m: 'Seguimiento post-estancia',
  pago_anticipo_recibido: 'Confirmación de anticipo / pago',
  portal_huesped_link: 'Enlace al Portal del Huésped',
  portal_huesped_link_en: 'Enlace al Portal del Huésped',
  alojamiento_listo: 'Alojamiento listo / limpio',
  wifi_informacion: 'WiFi y claves de acceso',
  rechazo_solicitud: 'Comprobante de pago no aprobado',
  comprobante_rechazado: 'Comprobante de pago no aprobado',
  bienvenido_cliente_whatsaap_v4: 'Bienvenida WhatsApp',
  bienvenido_cliente_llamada_v4: 'Bienvenida llamada',
  presentacion_cliente_jaroje_2: 'Presentación inicial',
};

const SKIPPED_INTERNAL_MARKERS = new Set([
  'omitido_multi_habitacion',
  'omitido_multi_habitacion_sibling',
]);

function normalizeTemplateGroup(tpl: string): string {
  return String(tpl || '')
    .trim()
    .replace(/_(v\d+|5m|10m|en)$/i, '');
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const rawResId = (searchParams.get('reservationId') || '').trim();
    const rawMemberIds = (searchParams.get('memberIds') || '').trim();
    const rawPhone = (searchParams.get('phone') || '').trim();

    const bookingIds = Array.from(
      new Set(
        [rawResId, ...rawMemberIds.split(',')]
          .map(s => s.trim())
          .filter(Boolean)
      )
    );

    const cleanedPhone = rawPhone ? normalizePhone(rawPhone) : '';

    if (bookingIds.length === 0 && !cleanedPhone) {
      return NextResponse.json({ success: true, logs: [] });
    }

    let rawLogs: WhatsAppLogRow[] = [];
    if (bookingIds.length > 0) {
      const { data, error } = await supabase
        .from('whatsapp_logs')
        .select('id, reservation_id, template_name, phone, sent_at, status')
        .in('reservation_id', bookingIds)
        .order('sent_at', { ascending: false })
        .limit(80);

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }
      rawLogs = ((data || []) as WhatsAppLogRow[]).filter(
        r => !SKIPPED_INTERNAL_MARKERS.has(String(r.template_name || ''))
      );
    }

    // Colapsar dobles registros históricos del mismo envío (< 20s entre sí)
    const dedupedLogs: WhatsAppLogRow[] = [];
    for (const row of rawLogs) {
      const rowTime = Date.parse(row.sent_at || '') || 0;
      const existingIdx = dedupedLogs.findIndex(prev => {
        if (String(prev.reservation_id || '') !== String(row.reservation_id || '')) return false;
        if (String(prev.template_name || '') !== String(row.template_name || '')) return false;
        const prevTime = Date.parse(prev.sent_at || '') || 0;
        return Math.abs(prevTime - rowTime) <= 20_000;
      });

      if (existingIdx === -1) {
        dedupedLogs.push(row);
      } else {
        const curRank = WHATSAPP_STATUS_RANK[String(dedupedLogs[existingIdx].status || '').toLowerCase()] ?? 0;
        const nextRank = WHATSAPP_STATUS_RANK[String(row.status || '').toLowerCase()] ?? 0;
        if (nextRank > curRank) {
          dedupedLogs[existingIdx] = row;
        }
      }
    }

    // Enriquecer con telemetría de Meta (wamid, delivered_at, read_at, failed_at, error_message) en conversations.messages
    const lookupPhone = cleanedPhone || normalizePhone(dedupedLogs[0]?.phone || '');
    let convMessages: ConversationMessageTelemetry[] = [];
    if (lookupPhone && lookupPhone !== 'desconocido') {
      try {
        const { primary, duplicates } = await findConversationsByPhone(lookupPhone);
        convMessages = [primary, ...duplicates]
          .filter(Boolean)
          .flatMap(c => (Array.isArray(c.messages) ? (c.messages as ConversationMessageTelemetry[]) : []))
          .filter(m => m && (m.wamid || m.template_name || m.delivery_status));
      } catch (convErr) {
        console.warn('[WhatsApp Logs API] Error consultando conversations:', convErr);
      }
    }

    const usedConvIndices = new Set<number>();
    const enrichedLogs = dedupedLogs.map(log => {
      const logTime = Date.parse(log.sent_at || '') || 0;
      const tplKey = String(log.template_name || '');
      const logGroup = normalizeTemplateGroup(tplKey);
      const logResId = String(log.reservation_id || '');

      let bestIdx = -1;
      let bestDiff = Infinity;

      convMessages.forEach((m, idx) => {
        if (usedConvIndices.has(idx)) return;
        const mResId = m.reservation_id ? String(m.reservation_id) : '';
        if (mResId && logResId && mResId !== logResId) return;

        const mTpl = String(m.template_name || '');
        const tplMatches = mTpl === tplKey || (mTpl && normalizeTemplateGroup(mTpl) === logGroup);
        if (!tplMatches) return;

        const mTime = Date.parse(m.timestamp || '') || 0;
        const diff = Math.abs(mTime - logTime);
        if (diff <= 180_000 && diff < bestDiff) {
          bestDiff = diff;
          bestIdx = idx;
        }
      });

      const matchedMsg = bestIdx >= 0 ? convMessages[bestIdx] : null;
      if (bestIdx >= 0) usedConvIndices.add(bestIdx);

      const dbStatus = String(log.status || 'sent').toLowerCase();
      const convStatus = matchedMsg?.delivery_status
        ? String(matchedMsg.delivery_status).toLowerCase()
        : '';

      const dbRank = WHATSAPP_STATUS_RANK[dbStatus] ?? 1;
      const convRank = convStatus ? (WHATSAPP_STATUS_RANK[convStatus] ?? 0) : -1;
      const effectiveStatus =
        dbStatus === 'failed' || convStatus === 'failed'
          ? 'failed'
          : convRank > dbRank
          ? convStatus
          : dbStatus;

      return {
        id: String(log.id),
        reservation_id: logResId,
        template_name: tplKey,
        label: TEMPLATE_LABELS[tplKey] || tplKey,
        phone: String(log.phone || lookupPhone || ''),
        status: effectiveStatus,
        sent_at: matchedMsg?.sent_at || log.sent_at,
        delivered_at: matchedMsg?.delivered_at || null,
        read_at: matchedMsg?.read_at || null,
        failed_at: matchedMsg?.failed_at || null,
        error_code: matchedMsg?.error_code || null,
        error_message: matchedMsg?.error_message || null,
        wamid: matchedMsg?.wamid || null,
      };
    });

    return NextResponse.json({
      success: true,
      logs: enrichedLogs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno consultando logs';
    console.error('[WhatsApp Logs API] Error:', err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
