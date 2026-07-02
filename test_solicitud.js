const fs = require('fs');
const path = require('path');

// Intentar leer las credenciales desde .env.local
let token = "EAAbzeVoWZBjABRrv209MbeNXiULGolmZA8RDe0AMBlWZCPmSfSQnFFLdf9iYNDlWA6xH5ZBAeDa6mYDue6NKP6gkSLj0Q7FKFZCn7gooXYjKQfZBCQJOhgqJaf957q5cfmzWQIWtm8uALdyf6EhycVa7ewwBBFWaPet7vZBzFLIsdH6ZAa3gPZBXSk5f3wAGZCVQZDZD";
let phoneId = "1198968849956637";

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const tokenMatch = envContent.match(/WHATSAPP_TOKEN\s*=\s*(.+)/);
  if (tokenMatch) {
    token = tokenMatch[1].replace(/["']/g, '').trim();
  }
  const phoneIdMatch = envContent.match(/WHATSAPP_PHONE_ID\s*=\s*(.+)/);
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
  'recibimiento_nuevamente'
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

// Construir parámetros dinámicamente según la plantilla
const parameters = [
  { type: 'text', text: 'Huésped de Prueba' } // {{1}} Nombre
];

if ([
  'solicitud_recibida', 
  'ultimo_aviso', 
  'disponibilidad_liberada', 
  'bienvenida_checkin', 
  'seguimiento_satisfaccion'
].includes(templateName)) {
  parameters.push({
    type: 'text',
    text: 'https://jaroje-app.vercel.app/public/reserva/TEST_123' // {{2}} LinkPortal
  });
} else if ([
  'reservacion_confirmada', 
  'preparacion_llegada'
].includes(templateName)) {
  parameters.push({
    type: 'text',
    text: 'https://jaroje-app.vercel.app/public/reserva/TEST_123' // {{2}} LinkPortal
  });
  parameters.push({
    type: 'text',
    text: '4' // {{3}} Huéspedes
  });
}

async function run() {
  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanedPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'es_MX' },
      components: [
        {
          type: 'body',
          parameters: parameters
        }
      ]
    }
  };

  console.log(`\n📤 Enviando plantilla '${templateName}' a: ${cleanedPhone}...`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const status = res.status;
    const body = await res.json();
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
