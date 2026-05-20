import { NextResponse } from 'next/server';

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
                {
                  type: "text",
                  parameter_name: "excel",
                  text: notes ? notes.trim() : "N/A"
                }
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
