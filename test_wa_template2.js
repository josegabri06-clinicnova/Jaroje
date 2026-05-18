const token = process.env.WHATSAPP_TOKEN;
const phoneId = process.env.WHATSAPP_PHONE_ID;

const payload = {
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: "34665268872",
  type: "template",
  template: {
    name: "nominas_jaroje",
    language: {
      code: "es_MX"
    },
    components: [
      {
        type: "body",
        parameters: [
          {
            type: "text",
            parameter_name: "nombre",
            text: "Jg"
          },
          {
            type: "text",
            parameter_name: "monto",
            text: "3,000"
          }
        ]
      }
    ]
  }
};

fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
})
.then(r => r.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(e => console.error(e));
