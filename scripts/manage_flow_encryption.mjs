/**
 * Script de Utilidad y Mantenimiento: Gestión Criptográfica de WhatsApp Flows
 *
 * Funcionalidades:
 * 1. Consultar estado de la clave pública registrada en Meta (GET /whatsapp_business_encryption)
 * 2. Generar y registrar nuevo par de claves RSA 2048 (POST /whatsapp_business_encryption)
 * 3. Consultar y vincular la aplicación a la WABA (POST /subscribed_apps)
 * 4. Intentar publicación del Flow en Meta (POST /{flow_id}/publish)
 *
 * Uso:
 *   node --env-file=.env scripts/manage_flow_encryption.mjs status
 *   node --env-file=.env scripts/manage_flow_encryption.mjs generate-and-register
 *   node --env-file=.env scripts/manage_flow_encryption.mjs subscribe-app
 *   node --env-file=.env scripts/manage_flow_encryption.mjs publish-flow <FLOW_ID>
 */

import crypto from 'crypto';
import fs from 'fs';

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WABA_ID = '3456203501226234';
const GRAPH_API = 'https://graph.facebook.com/v19.0';

if (!TOKEN || !PHONE_ID) {
  console.error("❌ Error: Faltan variables de entorno WHATSAPP_TOKEN o WHATSAPP_PHONE_ID en .env");
  process.exit(1);
}

const action = process.argv[2] || 'status';

async function checkStatus() {
  console.log(`\n🔍 Consultando estado de clave pública en Meta para Phone ID ${PHONE_ID}...`);
  const res = await fetch(`${GRAPH_API}/${PHONE_ID}/whatsapp_business_encryption`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const data = await res.json();
  console.log("Resultado:", JSON.stringify(data, null, 2));

  console.log(`\n🔍 Consultando aplicaciones suscritas en WABA ${WABA_ID}...`);
  const subRes = await fetch(`${GRAPH_API}/${WABA_ID}/subscribed_apps`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const subData = await subRes.json();
  console.log("Aplicaciones suscritas:", JSON.stringify(subData, null, 2));
}

async function generateAndRegister() {
  console.log("\n🔑 1. Generando nuevo par de claves RSA 2048 bits...");
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  console.log("✅ Claves generadas en memoria.");

  console.log(`\n📡 2. Registrando clave pública en Meta Graph API (${PHONE_ID}/whatsapp_business_encryption)...`);
  const formData = new URLSearchParams();
  formData.append('business_public_key', publicKey);

  const res = await fetch(`${GRAPH_API}/${PHONE_ID}/whatsapp_business_encryption`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData.toString()
  });

  const resJson = await res.json();
  console.log("Respuesta de Meta:", JSON.stringify(resJson, null, 2));

  if (resJson.success) {
    fs.writeFileSync('./whatsapp_flow_private_key.pem', privateKey);
    fs.writeFileSync('./whatsapp_flow_public_key.pem', publicKey);
    console.log("💾 Claves guardadas localmente en ./whatsapp_flow_private_key.pem y ./whatsapp_flow_public_key.pem");
    console.log("⚠️ Asegúrate de no exponer 'whatsapp_flow_private_key.pem' públicamente.");
  }
}

async function subscribeApp() {
  console.log(`\n🔗 Vinculando Meta App con WABA ${WABA_ID} (subscribed_apps)...`);
  const res = await fetch(`${GRAPH_API}/${WABA_ID}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const data = await res.json();
  console.log("Resultado de suscripción:", JSON.stringify(data, null, 2));
}

async function publishFlow(flowId) {
  if (!flowId) {
    console.error("❌ Especifica el ID del Flow a publicar: node scripts/manage_flow_encryption.mjs publish-flow <FLOW_ID>");
    return;
  }
  console.log(`\n🚀 Intentando publicar Flow ${flowId}...`);
  const res = await fetch(`${GRAPH_API}/${flowId}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const data = await res.json();
  console.log("Resultado de publicación:", JSON.stringify(data, null, 2));
}

switch (action) {
  case 'status':
    checkStatus();
    break;
  case 'generate-and-register':
    generateAndRegister();
    break;
  case 'subscribe-app':
    subscribeApp();
    break;
  case 'publish-flow':
    publishFlow(process.argv[3] || '1471048271560677');
    break;
  default:
    console.log(`Comando no reconocido: ${action}. Usa status, generate-and-register, subscribe-app o publish-flow.`);
}
