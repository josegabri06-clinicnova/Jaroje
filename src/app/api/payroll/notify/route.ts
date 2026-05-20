import { NextResponse } from 'next/server';

function getCompactNotes(text: string): string {
  if (!text) return "N/A";
  
  // Cortar en el primer día de la semana detectado para excluir la bitácora de asistencia en WhatsApp
  const lines = text.split('\n');
  const dayNames = ['lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo'];
  const cleanLines: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const lower = trimmed.toLowerCase();
    const startsWithDay = dayNames.some(day => lower.startsWith(day));
    if (startsWithDay) {
      break;
    }
    
    // Limpiar cada línea quitando asteriscos, puntos suspensivos y normalizando espacios
    const cleanLine = trimmed
      .replace(/\*/g, '')
      .replace(/\.{2,}/g, ':')
      .replace(/…+/g, ':')
      .replace(/\s+/g, ' ')
      .trim();
      
    if (cleanLine) {
      cleanLines.push(cleanLine);
    }
  }
  
  // Unir todas las líneas limpias con el separador premium " 🔸 "
  let compact = cleanLines.join(' 🔸 ');
  
  // Reemplazar saltos de línea, tabuladores y múltiples espacios por un solo espacio (exigencia de Meta Graph API)
  compact = compact
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
    
  if (compact.length > 1000) {
    return compact.substring(0, 990) + '... (Ver desglose completo en la App)';
  }
  
  return compact || "Sin desglose detallado.";
}


export async function POST(req: Request) {
  try {
    const { phone, employeeName, amount, period, type, document_url, notes } = await req.json();

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
          name: document_url ? "nominas_jaroje_2" : "nominas_jaroje",
          language: {
            code: "es_MX"
          },
          components: [
            // Solo añadir el header si hay un documento y la plantilla en Meta tiene un Header tipo "Documento"
            ...(document_url ? [{
              type: "header",
              parameters: [
                {
                  type: "document",
                  document: {
                    link: document_url,
                    filename: `Comprobante_${employeeName.replace(/\s+/g, '_')}.pdf`
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
                // Solo añadir el quinto parámetro 'excel' si NO hay documento adjunto (plantilla nominas_jaroje)
                ...(!document_url ? [{
                  type: "text",
                  parameter_name: "excel",
                  text: getCompactNotes(notes)
                }] : [])
              ]
            }
          ]
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
