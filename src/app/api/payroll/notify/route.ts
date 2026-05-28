import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function getCompactNotesFlat(text: string): string {
  if (!text) return "Sin desglose detallado.";
  
  const lines = text.split('\n');
  const cleanParts: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Omitir cabecera redundante de empleado y teléfono en el cuerpo
    const lower = trimmed.toLowerCase();
    if (trimmed.includes('*') && (lower.includes('101') || lower.includes('108') || lower.includes('102') || lower.includes('110') || lower.includes('107') || lower.includes('103'))) {
      continue;
    }
    if (lower.includes('quincena del') || lower.includes('quincena de')) {
      continue;
    }
    
    // Limpiar puntos suspensivos, tabulaciones y comprimir espacios seguidos
    let cleanLine = trimmed
      .replace(/\.{2,}/g, ':') // Reemplazar puntos suspensivos ..... por :
      .replace(/…+/g, ':')
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ') // Quitar múltiples espacios consecutivos
      .trim();
      
    if (cleanLine) {
      cleanParts.push(cleanLine);
    }
  }
  
  // Unir con bullet en una sola línea plana (SIN NINGÚN salto de línea \n)
  let compact = cleanParts.join(' 🔹 ');
  
  // Compresión absoluta para evitar violar restricciones de Meta en texto plano
  compact = compact
    .replace(/[\r\n\t]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
    
  const suffix = " 🔹 (Consulta recibo completo y bitácora detallada en staySync)";
  const maxSafeLen = 950 - suffix.length;
  
  if (compact.length > maxSafeLen) {
    compact = compact.substring(0, maxSafeLen - 3) + '...';
  }
  
  return compact + suffix;
}

function getCompactNotesVertical(text: string): string {
  if (!text) return "Sin desglose detallado.";
  
  const lines = text.split('\n');
  const cleanParts: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const lower = trimmed.toLowerCase();
    if (trimmed.includes('*') && (lower.includes('101') || lower.includes('108') || lower.includes('102') || lower.includes('110') || lower.includes('107') || lower.includes('103'))) {
      continue;
    }
    if (lower.includes('quincena del') || lower.includes('quincena de')) {
      continue;
    }
    
    // Limpiar puntos suspensivos, tabulaciones y comprimir espacios seguidos
    let cleanLine = trimmed
      .replace(/\.{2,}/g, ':') // Reemplazar puntos suspensivos ..... por :
      .replace(/…+/g, ':')
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
      
    if (cleanLine) {
      cleanParts.push(cleanLine);
    }
  }
  
  let compact = cleanParts.join(' 🔹 ');
  compact = compact
    .replace(/[\r\n\t]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
    
  if (compact.length > 1000) {
    compact = compact.substring(0, 997) + '...';
  }
  
  return compact;
}


export async function POST(req: Request) {
  try {
    const { phone, employeeName, amount, period, type, document_url, notes, templateName } = await req.json();

    if (!phone || !employeeName || !amount) {
      return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 });
    }

    const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
    const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

    if (!WHATSAPP_TOKEN || !PHONE_ID) {
      throw new Error('Credenciales de WhatsApp no configuradas en el servidor.');
    }

    // Formatear teléfono (asegurar que no tenga +, espacios o caracteres raros)
    const cleanPhone = phone.replace(/\D/g, '');

    const tipoTexto = type === 'anticipo' ? 'Anticipo' : type === 'bono' ? 'Bono' : 'Nómina';

    const isVertical = templateName === 'recibo_nomina_vertical';

    // --- AUTOGENERACIÓN DE DOCUMENTO DE TEXTO PLANO ---
    // Si no hay comprobante manual subido, pero hay desglose de conceptos (notes),
    // generamos un recibo en TXT y lo subimos a Supabase Storage. Esto nos permite
    // enviar todo el desglose vertical quincenal y la asistencia día por día
    // eludiendo la restricción estricta de Meta sobre saltos de línea (\n) en variables.
    let finalDocumentUrl = document_url;

    if (!isVertical && !finalDocumentUrl && notes && notes.trim() !== '') {
      try {
        const verticalNotes = getCompactNotesVertical(notes);
        const txtContent = `================================================
HOTEL CONDOMINIO JAROJE - RECIBO DE PAGO
================================================
Colaborador : ${employeeName.toUpperCase()}
Concepto    : ${tipoTexto.toUpperCase()}
Periodo     : ${period}
Monto Total : MX$${Number(amount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
================================================

DESGLOSE DETALLADO DE CONCEPTOS (EXCEL):
------------------------------------------------
${verticalNotes}

------------------------------------------------
Este documento sirve como desglose quincenal de nómina generado de forma automática por el sistema staySync.
================================================`;

        const fileName = `Recibo_${employeeName.replace(/\s+/g, '_')}_${Date.now()}.txt`;
        
        const { error: uploadError } = await supabase.storage
          .from('payroll_documents')
          .upload(fileName, Buffer.from(txtContent, 'utf-8'), {
            contentType: 'text/plain; charset=utf-8',
            cacheControl: '3600',
            upsert: false
          });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('payroll_documents')
            .getPublicUrl(fileName);
          finalDocumentUrl = publicUrlData.publicUrl;
        } else {
          console.error("Error subiendo recibo txt autogenerado a Supabase Storage:", uploadError);
        }
      } catch (errUpload) {
        console.error("Excepción en flujo de autogeneración de recibo txt:", errUpload);
      }
    }

    const finalTemplateName = isVertical ? 'recibo_nomina_vertical' : (finalDocumentUrl ? 'nominas_jaroje_2' : 'nominas_jaroje');

    const components = [
      // Solo añadir el header si hay un documento y la plantilla en Meta tiene un Header tipo "Documento"
      ...(!isVertical && finalDocumentUrl ? [{
        type: "header",
        parameters: [
          {
            type: "document",
            document: {
              link: finalDocumentUrl,
              filename: finalDocumentUrl.toLowerCase().includes('.txt')
                ? `Recibo_${employeeName.replace(/\s+/g, '_')}.txt`
                : `Comprobante_${employeeName.replace(/\s+/g, '_')}.pdf`
            }
          }
        ]
      }] : []),
      {
        type: "body",
        parameters: [
          {
            type: "text",
            parameter_name: "nombre",
            text: employeeName
          },
          {
            type: "text",
            parameter_name: "tipo",
            text: tipoTexto
          },
          {
            type: "text",
            parameter_name: "periodo",
            text: period
          },
          {
            type: "text",
            parameter_name: "monto",
            text: Number(amount).toLocaleString('es-MX')
          },
          // Solo añadir el quinto parámetro 'excel' si es vertical O si NO hay documento adjunto
          ...(isVertical || !finalDocumentUrl ? [{
            type: "text",
            parameter_name: "excel",
            text: isVertical ? getCompactNotesVertical(notes) : getCompactNotesFlat(notes)
          }] : [])
        ]
      }
    ];

    // Enviar WhatsApp usando la API oficial de Meta (Cloud API) con PLANTILLA
    const waResponse = await fetch(`https://graph.facebook.com/v17.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "template",
        template: {
          name: finalTemplateName,
          language: {
            code: "es_MX"
          },
          components
        }
      })
    });

    const waData = await waResponse.json();

    if (!waResponse.ok) {
      throw new Error(`Error Meta API: ${JSON.stringify(waData)}`);
    }

    return NextResponse.json({ success: true, message: 'WhatsApp enviado al empleado' });

  } catch (error: any) {
    console.error("Error al enviar WhatsApp de nómina:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
