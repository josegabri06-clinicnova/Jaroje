import { NextResponse } from 'next/server';

function getCompactNotes(text: string): string {
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
      // Evitar duplicar el bullet si ya viene
      if (!cleanLine.startsWith('🔹') && !cleanLine.startsWith('*')) {
        cleanLine = `🔹 ${cleanLine}`;
      } else if (cleanLine.startsWith('*') && !cleanLine.includes('🔹')) {
        cleanLine = `🔹 ${cleanLine}`;
      }
      cleanParts.push(cleanLine);
    }
  }
  
  // Unir con un único salto de línea \n (nunca usar \n\n para evitar el filtro estricto de Meta)
  let vertical = cleanParts.join('\n');
  
  // Compresión definitiva de espacios seguidos
  vertical = vertical
    .replace(/ {2,}/g, ' ')
    .trim();
    
  const suffix = "\n🔹 (Consulta recibo completo y bitácora detallada en staySync)";
  const maxSafeLen = 950 - suffix.length;
  
  if (vertical.length > maxSafeLen) {
    vertical = vertical.substring(0, maxSafeLen - 3) + '...';
  }
  
  return vertical + suffix;
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

    // --- ENVIAR SEGUNDO MENSAJE SECUNDARIO LIBRE (Session Message) ---
    // Contiene la bitácora de asistencia y el desglose vertical idéntico al Excel.
    // Como la plantilla anterior se entregó con éxito, la ventana de 24h está abierta.
    if (notes && notes.trim() !== '') {
      try {
        const headerText = `📝 *BITÁCORA DE ASISTENCIA Y RECIBO DETALLADO (EXCEL):*\n\n`;
        const cleanNotes = notes.split('\n').map((line: string) => line.trimEnd()).join('\n');
        
        const secondMsgRes = await fetch(`https://graph.facebook.com/v17.0/${PHONE_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanPhone,
            type: "text",
            text: {
              preview_url: false,
              body: `${headerText}${cleanNotes}`
            }
          })
        });

        if (!secondMsgRes.ok) {
          const secondMsgData = await secondMsgRes.json();
          console.warn("Fallo al enviar bitácora secundaria libre de asistencia:", secondMsgData);
        }
      } catch (err2) {
        console.error("Excepción al disparar el segundo mensaje libre:", err2);
      }
    }

    return NextResponse.json({ success: true, message: 'WhatsApp enviado al empleado' });

  } catch (error: any) {
    console.error("Error al enviar WhatsApp de nómina:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
