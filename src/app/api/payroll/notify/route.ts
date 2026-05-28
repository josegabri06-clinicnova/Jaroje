import { NextResponse } from 'next/server';

function getCompactNotes(text: string): string {
  if (!text) return "Sin desglose detallado.";
  
  // 1. Procesar el desglose de conceptos y bitácora de asistencia
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
    
    // Limpiar puntos suspensivos y comprimir espacios seguidos
    let cleanLine = trimmed
      .replace(/\.{2,}/g, ':') // Reemplazar puntos suspensivos ..... por :
      .replace(/…+/g, ':')
      .replace(/\s+/g, ' ') // Quitar múltiples espacios consecutivos
      .trim();
      
    if (cleanLine) {
      cleanParts.push(cleanLine);
    }
  }
  
  // 2. Unir con el delimitador premium homologado por Meta
  let compact = cleanParts.join(' 🔹 ');
  
  // 3. Quitar estrictamente cualquier salto de línea, retorno de carro y tabulador
  compact = compact
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ') // Compresión definitiva (nunca más de 1 espacio seguido)
    .trim();
    
  // 4. Agregar sufijo indicativo
  const suffix = " 🔹 (Consulta recibo completo y bitácora detallada en staySync)";
  const maxSafeLen = 1000 - suffix.length;
  
  if (compact.length > maxSafeLen) {
    compact = compact.substring(0, maxSafeLen - 3) + '...';
  }
  
  return compact + suffix;
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
