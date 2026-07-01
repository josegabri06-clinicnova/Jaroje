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

if (!targetPhone) {
  console.log("\n❌ Error: Debes ingresar el número de teléfono (con código de país) para recibir la prueba.");
  console.log("Ejemplo: node test_solicitud.js 521234567890\n");
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

async function run() {
  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanedPhone,
    type: 'template',
    template: {
      name: 'solicitud_recibida',
      language: { code: 'es_MX' },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: 'Invitado Prueba' // {{1}}
            },
            {
              type: 'text',
              text: 'https://jaroje-app.vercel.app/public/reserva/TEST_123' // {{2}}
            }
          ]
        }
      ]
    }
  };

  console.log(`\n📤 Enviando plantilla 'solicitud_recibida' a: ${cleanedPhone}...`);

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
