const fs = require('fs');
const path = require('path');

// Intentar leer las credenciales desde .env o .env.local
let token = "EAAbzeVoWZBjABRrv209MbeNXiULGolmZA8RDe0AMBlWZCPmSfSQnFFLdf9iYNDlWA6xH5ZBAeDa6mYDue6NKP6gkSLj0Q7FKFZCn7gooXYjKQfZBCQJOhgqJaf957q5cfmzWQIWtm8uALdyf6EhycVa7ewwBBFWaPet7vZBzFLIsdH6ZAa3gPZBXSk5f3wAGZCVQZDZD";
let phoneId = "1182889501581631";

const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');
const chosenPath = fs.existsSync(envLocalPath) ? envLocalPath : (fs.existsSync(envPath) ? envPath : null);

if (chosenPath) {
  const envContent = fs.readFileSync(chosenPath, 'utf8');
  const tokenMatch = envContent.match(/^WHATSAPP_TOKEN\s*=\s*(.+)/m);
  if (tokenMatch) {
    token = tokenMatch[1].replace(/["']/g, '').trim();
  }
  const phoneIdMatch = envContent.match(/^WHATSAPP_PHONE_ID\s*=\s*(.+)/m);
  if (phoneIdMatch) {
    phoneId = phoneIdMatch[1].replace(/["']/g, '').trim();
  }
}

const targetPhone = process.argv[2];
const templateName = process.argv[3] || 'solicitud_recibida';

if (!targetPhone) {
  console.log("\n❌ Error: Debes ingresar el número de teléfono (con código de país) para recibir la prueba.");
  console.log("Ejemplo: node test_solicitud.js 521234567890 [nombre_plantilla]\n");
  process.exit(1);
}

const allowedTemplates = [
  'solicitud_recibida',
  'ultimo_aviso',
  'reservacion_confirmada',
  'disponibilidad_liberada',
  'preparacion_llegada',
  'bienvenida_checkin',
  'seguimiento_satisfaccion',
  'salida_checkout',
  'comparte_experiencia',
  'recibimiento_nuevamente',
  'pago_anticipo_recibido'
];
if (!allowedTemplates.includes(templateName)) {
  console.log(`\n❌ Error: La plantilla '${templateName}' no está en la lista de prueba.`);
  console.log(`Plantillas permitidas: ${allowedTemplates.join(', ')}\n`);
  process.exit(1);
}

// Limpiar número (dejar solo dígitos) y normalizar
let cleanedPhone = targetPhone.replace(/\D/g, '');
if (cleanedPhone.length === 10) {
  cleanedPhone = '52' + cleanedPhone;
} else if (cleanedPhone.startsWith('521') && cleanedPhone.length === 13) {
  cleanedPhone = '52' + cleanedPhone.slice(3);
} else if (cleanedPhone.length === 9) {
  cleanedPhone = '34' + cleanedPhone;
}

// Construir parámetros de cuerpo dinámicamente según la plantilla
const parameters = [
  { type: 'text', text: 'Huésped de Prueba' } // {{1}} Nombre
];

if (templateName === 'pago_anticipo_recibido') {
  parameters.push({ type: 'text', text: '1,500' });  // {{2}} MontoAbonado
  parameters.push({ type: 'text', text: '3,000' });  // {{3}} SaldoPendiente
}

async function run() {
  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;

  const components = [
    {
      type: 'body',
      parameters: parameters
    }
  ];

  const urlTemplates = [
    'solicitud_recibida',
    'ultimo_aviso',
    'reservacion_confirmada',
    'disponibilidad_liberada',
    'preparacion_llegada',
    'bienvenida_checkin',
    'seguimiento_satisfaccion',
    'recibimiento_nuevamente',
    'pago_anticipo_recibido'
  ];

  if (urlTemplates.includes(templateName)) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [
        {
          type: 'text',
          text: `TEST_123?lang=es`
        }
      ]
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanedPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'es' },
      components: components
    }
  };

  console.log(`\n📤 Enviando plantilla '${templateName}' a: ${cleanedPhone}...`);

  try {
    let res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    let status = res.status;
    let body = await res.json();

    if (status !== 200 && payload.template.language.code === 'es') {
      console.log("⚠️ Falló con 'es', reintentando con 'es_MX'...");
      payload.template.language.code = 'es_MX';
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      status = res.status;
      body = await res.json();
    }

    console.log("\n=== RESPUESTA DE LA API DE META ===");
    console.log("Status Code:", status);
    console.log("Response Body:", JSON.stringify(body, null, 2));
    
    if (status === 200) {
      console.log("\n✅ ¡Mensaje de prueba enviado con éxito! Revisa tu WhatsApp.\n");
    } else {
      console.log("\n❌ Error al enviar. Verifica el mensaje de error anterior.\n");
    }
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

run();
