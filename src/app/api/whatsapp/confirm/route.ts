import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { phone, guestName } = await req.json();

    if (!phone || !guestName) {
      return NextResponse.json({
        success: false,
        error: 'Faltan parámetros requeridos: phone, guestName'
      }, { status: 400 });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    if (!token || !phoneId) {
      return NextResponse.json({
        success: false,
        error: 'Credenciales de WhatsApp no configuradas en el servidor'
      }, { status: 500 });
    }

    // Limpiar y formatear el número de teléfono
    let cleanedPhone = phone.replace(/\D/g, '');
    if (cleanedPhone.length === 10) {
      cleanedPhone = '52' + cleanedPhone;
    } else if (cleanedPhone.startsWith('521') && cleanedPhone.length === 13) {
      cleanedPhone = '52' + cleanedPhone.slice(3);
    }

    if (!cleanedPhone) {
      return NextResponse.json({
        success: false,
        error: 'Formato de teléfono no válido'
      }, { status: 400 });
    }

    const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanedPhone,
      type: 'template',
      template: {
        name: 'presentacion_cliente_jaroje_2',
        language: { code: 'es_MX' },
        components: [
          {
            type: 'body',
            parameters: [
              {
                type: 'text',
                text: guestName
              }
            ]
          }
        ]
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const status = response.status;
    const resBody = await response.json();

    if (status !== 200) {
      console.error("Meta API error:", resBody);
      return NextResponse.json({
        success: false,
        error: resBody.error?.message || 'Error de la API de Meta'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'WhatsApp enviado con éxito',
      data: resBody
    });

  } catch (err: any) {
    console.error("Error enviando WhatsApp de confirmación:", err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Error interno del servidor'
    }, { status: 500 });
  }
}
