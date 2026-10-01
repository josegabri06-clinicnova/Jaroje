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
      if (contentType.includes('application/json')) {
        try {
          const body = await req.json();
          rawPhone = body.phone || body.from || body.caller || body.caller_id || 
                     body.Caller || body.From || body.numero || body.telefono || 
                     body.contact || body.data?.phone || body.data?.caller || '';
          callerName = body.name || body.caller_name || body.CallerName || body.nombre || '';
        } catch (jsonErr) {
          console.warn("[Webhook Conmutador] No se pudo parsear JSON:", jsonErr);
        }
      } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        try {
          const formData = await req.formData();
          rawPhone = (formData.get('phone') || formData.get('from') || formData.get('caller') || 
                      formData.get('Caller') || formData.get('From') || formData.get('numero') || 
                      formData.get('telefono')) as string || '';
          callerName = (formData.get('name') || formData.get('caller_name') || formData.get('CallerName') || formData.get('nombre')) as string || '';
        } catch (formErr) {
          console.warn("[Webhook Conmutador] No se pudo parsear FormData:", formErr);
        }
      }
    }

    const cleanPhone = normalizePhone(rawPhone);
    if (!cleanPhone) {
      return NextResponse.json({
        success: false,
        error: 'No se detectó un número telefónico válido en la petición del conmutador.',
        received: { rawPhone }
      }, { status: 400 });
    }

    // Detectar idioma según prefijo telefónico
    const isLatamOrSpain = isSpanishOrLatamPhone(cleanPhone);
    const lang = isLatamOrSpain ? 'es' : 'en';

    console.log(`[Webhook Conmutador] 📞 Llamada entrante de ${cleanPhone} (Origen: ${isLatamOrSpain ? 'Latinoamérica/España' : 'Internacional'}, Lang: ${lang}). Enviando plantilla 'bienvenido_cliente_final_v2'...`);

    // Enviar plantilla vía YCloud
    const sendResult = await sendTemplate_BienvenidoConmutador(cleanPhone, callerName, lang);

    // Registrar en employee_logs para visibilidad en el panel del hotel
    try {
      await supabase.from('employee_logs').insert([{
        employee_num: 'conmutador',
        employee_name: callerName || cleanPhone,
        department: 'recepcion',
        module: 'recepcion',
        action: 'conmutador_call_welcome_sent',
        details: `Llamada recibida en conmutador. Enviada plantilla bienvenido_cliente_final_v2 (${lang.toUpperCase()}) al WhatsApp +${cleanPhone}.`,
        created_at: new Date().toISOString()
      }]);
    } catch (logErr) {
      console.error("[Webhook Conmutador] Error guardando log en employee_logs:", logErr);
    }

    // Asegurar registro inicial en conversations
    try {
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id, messages')
        .eq('guest_phone', cleanPhone)
        .maybeSingle();

      const welcomeMsg = {
        role_guest: null,
        role_bot: `[Plantilla enviada por llamada al conmutador: bienvenido_cliente_final_v2 (${lang})]`,
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
            guest_name: callerName || cleanPhone,
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
      phone: cleanPhone,
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
