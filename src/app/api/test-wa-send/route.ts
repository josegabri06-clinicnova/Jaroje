import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json({ error: 'Falta parámetro phone' }, { status: 400 });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    if (!token || !phoneId) {
      return NextResponse.json({ error: 'Faltan variables de entorno WHATSAPP_TOKEN o WHATSAPP_PHONE_ID' }, { status: 500 });
    }

    const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
    const results: any[] = [];

    // Helper to send and log
    const testSend = async (label: string, payload: any) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        const status = res.status;
        const body = await res.json();
        results.push({ label, status, body });
      } catch (err: any) {
        results.push({ label, error: err.message });
      }
    };

    // 1. Intentar con 1 body param y 1 button param (Original)
    await testSend("1. Con 1 Body Param y 1 Button Param", {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: 'portal_huesped_link',
        language: { code: 'es_MX' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: 'TestHuésped' }]
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: '123?lang=es' }]
          }
        ]
      }
    });

    // 2. Intentar sin body param, con 1 button param
    await testSend("2. Sin Body Param, Con 1 Button Param", {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: 'portal_huesped_link',
        language: { code: 'es_MX' },
        components: [
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: '123?lang=es' }]
          }
        ]
      }
    });

    // 3. Intentar con 1 body param, sin button param
    await testSend("3. Con 1 Body Param, Sin Button Param", {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: 'portal_huesped_link',
        language: { code: 'es_MX' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: 'TestHuésped' }]
          }
        ]
      }
    });

    // 4. Intentar sin parámetros (Vacío)
    await testSend("4. Sin parámetros", {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: 'portal_huesped_link',
        language: { code: 'es_MX' }
      }
    });

    // 5. Intentar texto libre
    await testSend("5. Texto Libre de Prueba", {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: "Hola, esta es una prueba de texto libre." }
    });

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
