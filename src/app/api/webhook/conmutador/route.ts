import { NextResponse } from 'next/server';
import { sendTemplate_BienvenidoConmutador, normalizePhone, isSpanishOrLatamPhone } from '@/lib/whatsapp';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Webhook del Conmutador / PBX Telefónico.
 * Cuando un cliente llama a las líneas del hotel, este endpoint recibe la llamada entrante y
 * dispara automáticamente la plantilla de WhatsApp:
 * - 'bienvenido_cliente_final_v2' en Español ('es') para números de Latinoamérica o España.
 * - 'bienvenido_cliente_final_v2' en Inglés ('en') para números del resto del mundo.
 */
async function processConmutadorCall(req: Request) {
  try {
    let rawPhone = '';
    let callerName = '';

    const url = new URL(req.url);
    const qPhone = url.searchParams.get('phone') || 
                   url.searchParams.get('from') || 
                   url.searchParams.get('caller') || 
                   url.searchParams.get('Caller') || 
                   url.searchParams.get('From') || 
                   url.searchParams.get('numero') || 
                   url.searchParams.get('telefono');
    const qName = url.searchParams.get('name') || 
                  url.searchParams.get('caller_name') || 
                  url.searchParams.get('CallerName');

    if (qPhone) {
      rawPhone = qPhone;
      callerName = qName || '';
    }

    if (!rawPhone && req.method === 'POST') {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json') || contentType.includes('text/plain')) {
        try {
          const body = await req.json();
          
          // Grandstream UCM envía un array de objetos CDR: [ { "src": "...", "dst": "...", "clid": "..." } ]
          // o un objeto con propiedad cdr: { "cdr": [ { ... } ] }
          let item = body;
          if (Array.isArray(body) && body.length > 0) {
            item = body[0];
          } else if (body && Array.isArray(body.cdr) && body.cdr.length > 0) {
            item = body.cdr[0];
          } else if (body && typeof body.cdr === 'object' && body.cdr !== null) {
            item = body.cdr;
          }

          if (item && typeof item === 'object') {
            // Teléfono: Grandstream usa 'src' o 'caller_id_number' o 'clid'
            rawPhone = item.src || item.caller_id_number || item.cid_num || 
                       item.phone || item.from || item.caller || item.caller_id || 
                       item.Caller || item.From || item.numero || item.telefono || 
                       item.contact || item.data?.phone || item.data?.caller || '';

            // Nombre: Grandstream usa 'caller_name', 'caller_id_name', o viene dentro de 'clid'
            callerName = item.caller_name || item.caller_id_name || item.name || 
                         item.CallerName || item.nombre || '';

            // Si viene el campo 'clid' (Caller ID) con formato: "Nombre Huésped" <9581168698>
            if (item.clid && typeof item.clid === 'string') {
              const clidMatch = item.clid.match(/"?([^"<]*)"?\s*<([^>]+)>/);
              if (clidMatch) {
                if (!callerName && clidMatch[1]?.trim()) {
                  callerName = clidMatch[1].trim();
                }
                if (!rawPhone && clidMatch[2]?.trim()) {
                  rawPhone = clidMatch[2].trim();
                }
              } else if (!rawPhone) {
                const digits = item.clid.replace(/[^\d+]/g, '');
                if (digits.length >= 7) rawPhone = digits;
              }
            }

            // Metadatos de Grandstream
            if (item.disposition) (url as any)._disposition = item.disposition;
            if (item.duration) (url as any)._duration = item.duration;
            if (item.dst) (url as any)._dst = item.dst;
          }
        } catch (jsonErr) {
          console.warn("[Webhook Conmutador] No se pudo parsear JSON:", jsonErr);
        }
      } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        try {
          const formData = await req.formData();
          rawPhone = (formData.get('src') || formData.get('caller_id_number') ||
                      formData.get('phone') || formData.get('from') || formData.get('caller') || 
                      formData.get('Caller') || formData.get('From') || formData.get('numero') || 
                      formData.get('telefono')) as string || '';
          callerName = (formData.get('caller_name') || formData.get('caller_id_name') ||
                        formData.get('name') || formData.get('CallerName') || formData.get('nombre')) as string || '';
        } catch (formErr) {
          console.warn("[Webhook Conmutador] No se pudo parsear FormData:", formErr);
        }
      }
    }

    // Filtrar llamadas internas entre extensiones del conmutador (ej. Ext 101 llamando a 102)
    const rawDigits = (rawPhone || '').replace(/\D/g, '');
    if (rawDigits.length > 0 && rawDigits.length < 7) {
      console.log(`[Webhook Conmutador] Llamada interna entre extensiones (${rawPhone}). Ignorada para plantillas de clientes.`);
      return NextResponse.json({
        success: true,
        message: 'Llamada interna entre extensiones del conmutador ignorada.',
        internal: true,
        src: rawPhone
      }, { status: 200 });
    }

    const cleanPhone = normalizePhone(rawPhone);
    if (!cleanPhone) {
      return NextResponse.json({
        success: false,
        error: 'No se detectó un número telefónico externo válido en la petición del conmutador.',
        received: { rawPhone }
      }, { status: 400 });
    }

    // Resolver nombre del llamante si ya es huésped en el sistema
    let resolvedCallerName = callerName ? callerName.trim() : '';
    if (!resolvedCallerName) {
      try {
        const { data: localGuest } = await supabase
          .from('local_reservas')
          .select('guest_name')
          .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${cleanPhone.slice(-10)}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (localGuest?.guest_name) {
          resolvedCallerName = localGuest.guest_name;
        } else {
          const { data: convGuest } = await supabase
            .from('conversations')
            .select('guest_name')
            .eq('guest_phone', cleanPhone)
            .maybeSingle();
          if (convGuest?.guest_name && convGuest.guest_name !== cleanPhone) {
            resolvedCallerName = convGuest.guest_name;
          }
        }
      } catch (lookupErr) {
        console.warn("[Webhook Conmutador] Error buscando nombre de huésped:", lookupErr);
      }
    }

    // Detectar idioma según prefijo telefónico
    const isLatamOrSpain = isSpanishOrLatamPhone(cleanPhone);
    const lang = isLatamOrSpain ? 'es' : 'en';

    console.log(`[Webhook Conmutador] 📞 Llamada entrante de ${cleanPhone} (${resolvedCallerName || 'Desconocido'}, Lang: ${lang}). Registrando en conmutador_calls...`);

    // 1. Guardar llamada en la tabla conmutador_calls para el nuevo módulo /llamadas
    let callRecord: any = null;
    try {
      const { data: inserted, error: insertErr } = await supabase
        .from('conmutador_calls')
        .insert([{
          phone: cleanPhone,
          caller_name: resolvedCallerName || null,
          status: 'nueva',
          raw_data: {
            rawPhone,
            originalCallerName: callerName,
            resolvedName: resolvedCallerName,
            disposition: (url as any)._disposition || 'COMPLETED',
            duration: (url as any)._duration || 0,
            extension: (url as any)._dst || null,
            method: req.method,
            query: Object.fromEntries(url.searchParams),
            timestamp: new Date().toISOString()
          },
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (insertErr) {
        console.error("[Webhook Conmutador] Error insertando en conmutador_calls:", insertErr);
      } else {
        callRecord = inserted;
      }
    } catch (cErr) {
      console.error("[Webhook Conmutador] Excepción insertando en conmutador_calls:", cErr);
    }

    // 2. Registrar en employee_logs para notificaciones en vivo
    try {
      await supabase.from('employee_logs').insert([{
        employee_num: 'conmutador',
        employee_name: resolvedCallerName || cleanPhone,
        department: 'recepcion',
        module: 'llamadas',
        action: 'conmutador_call_received',
        room: 'Conmutador',
        details: JSON.stringify({
          text: `📞 Nueva llamada recibida de ${resolvedCallerName ? `${resolvedCallerName} (${cleanPhone})` : cleanPhone}. Registrada en módulo de Llamadas.`,
          callId: callRecord?.id,
          phone: cleanPhone,
          callerName: resolvedCallerName
        }),
        created_at: new Date().toISOString()
      }]);
    } catch (logErr) {
      console.error("[Webhook Conmutador] Error guardando log en employee_logs:", logErr);
    }

    // 3. Intento de envío automático de plantilla por API (tolerante a bloqueo de Meta)
    let sendResult: any = { success: false, note: 'Pendiente de envío manual desde /llamadas' };
    try {
      sendResult = await sendTemplate_BienvenidoConmutador(cleanPhone, resolvedCallerName, lang);
      if (sendResult?.success && callRecord?.id) {
        await supabase
          .from('conmutador_calls')
          .update({
            status: 'plantilla_enviada',
            template_sent: 'bienvenido_cliente_final_v2',
            template_sent_at: new Date().toISOString()
          })
          .eq('id', callRecord.id);
      }
    } catch (waErr: any) {
      console.warn("[Webhook Conmutador] Envío automático no disponible o cuenta Meta pausada:", waErr?.message);
    }

    // 4. Asegurar registro inicial en conversations
    try {
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id, messages')
        .eq('guest_phone', cleanPhone)
        .maybeSingle();

      const welcomeMsg = {
        role_guest: null,
        role_bot: `[Llamada recibida en conmutador telefónico]`,
        role_manager: null,
        timestamp: new Date().toISOString()
      };

      if (existingConv) {
        await supabase
          .from('conversations')
          .update({
            timestamp: new Date().toISOString(),
            messages: [...(existingConv.messages || []), welcomeMsg]
          })
          .eq('id', existingConv.id);
      } else {
        await supabase
          .from('conversations')
          .insert({
            id: `call_${Date.now()}`,
            guest_name: resolvedCallerName || cleanPhone,
            guest_phone: cleanPhone,
            timestamp: new Date().toISOString(),
            human_mode: false,
            messages: [welcomeMsg]
          });
      }
    } catch (convErr) {
      console.error("[Webhook Conmutador] Error actualizando conversations:", convErr);
    }

    return NextResponse.json({
      success: true,
      callId: callRecord?.id,
      phone: cleanPhone,
      callerName: resolvedCallerName,
      language: lang,
      template: 'bienvenido_cliente_final_v2',
      sendResult
    });
  } catch (err: any) {
    console.error("[Webhook Conmutador] Excepción no controlada:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return processConmutadorCall(req);
}

export async function GET(req: Request) {
  return processConmutadorCall(req);
}
