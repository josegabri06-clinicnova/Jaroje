const WHATSAPP_TOKEN = "EAAbzeVoWZBjABRrv209MbeNXiULGolmZA8RDe0AMBlWZCPmSfSQnFFLdf9iYNDlWA6xH5ZBAeDa6mYDue6NKP6gkSLj0Q7FKFZCn7gooXYjKQfZBCQJOhgqJaf957q5cfmzWQIWtm8uALdyf6EhycVa7ewwBBFWaPet7vZBzFLIsdH6ZAa3gPZBXSk5f3wAGZCVQZDZD";
const WHATSAPP_PHONE_ID = "1198968849956637";
const recipient = "34639367930";

async function run() {
  const url = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
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
              text: 'Jose Gabriel'
            }
          ]
        }
      ]
    }
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const status = res.status;
    const body = await res.json();
    console.log("=== META RESPONSE ===");
    console.log("Status:", status);
    console.log("Response Body:", JSON.stringify(body, null, 2));
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

run();
