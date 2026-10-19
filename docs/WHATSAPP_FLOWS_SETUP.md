# Manual de Integración y Criptografía: WhatsApp Flows

Este documento describe la arquitectura, procedimiento de registro criptográfico y resolución de incidencias para publicar **WhatsApp Flows** con intercambio de datos dinámico (*Data Exchange* / *Endpoint*) en la Meta Cloud API.

---

## 1. El Problema en la Interfaz de Meta (Flow Builder)

Al construir un Flow con intercambio dinámico (`data_exchange`), Meta muestra una lista de verificación con el paso:
> **"Registrar clave pública"**

Sin embargo, **Meta no proporciona ningún campo de texto ni botón de subida en su interfaz gráfica**. Únicamente enlaza a la documentación técnica para desarrolladores. El registro debe realizarse obligatoriamente mediante una petición HTTP autenticada a la **Meta Graph API**.

---

## 2. Arquitectura Criptográfica del Flow

WhatsApp Flows implementa cifrado asimétrico híbrido de extremo a extremo:
1. **Clave Pública RSA (2048 bits):** Registrada en los servidores de Meta para el número de teléfono del hotel (`WHATSAPP_PHONE_ID`).
2. **Clave Privada RSA (2048 bits):** Almacenada exclusivamente en vuestro backend / n8n (`whatsapp_flow_private_key.pem`).
3. **Payload Cifrado:**
   - Meta genera una clave efímera **AES-128-GCM** y un vector de inicialización (`initial_vector`).
   - Cifra la clave AES con vuestra Clave Pública RSA.
   - Cifra los datos del usuario (fechas, personas, selecciones) con la clave AES.
4. **Respuesta Cifrada:**
   - El endpoint descifra la clave AES usando la Clave Privada RSA.
   - Procesa la lógica y cifra la respuesta con AES-GCM usando el vector inicial invertido (bitwise NOT).

---

## 3. Registro de Clave Pública vía Graph API

### Requisitos Previos:
- `WHATSAPP_PHONE_ID`: Identificador del número de teléfono en Meta Cloud API (ej: `1422065800982941`).
- `WHATSAPP_TOKEN`: Token permanente de System User con permisos `whatsapp_business_management`.

### Paso 1: Generar el par de claves RSA 2048
```bash
# Generar clave privada
openssl genrsa -out whatsapp_flow_private_key.pem 2048

# Extraer clave pública en formato PEM
openssl rsa -in whatsapp_flow_private_key.pem -pubout -out whatsapp_flow_public_key.pem
```

### Paso 2: Registrar la Clave Pública en Meta
```bash
curl -X POST "https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/whatsapp_business_encryption" \
     -H "Authorization: Bearer {WHATSAPP_TOKEN}" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     --data-urlencode "business_public_key=$(cat whatsapp_flow_public_key.pem)"
```
Respuesta exitosa:
```json
{
  "success": true
}
```

### Paso 3: Verificar Estado de la Firma
```bash
curl -X GET "https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/whatsapp_business_encryption" \
     -H "Authorization: Bearer {WHATSAPP_TOKEN}"
```
Respuesta esperada:
```json
{
  "data": [
    {
      "business_public_key": "-----BEGIN PUBLIC KEY-----\n...",
      "business_public_key_signature_status": "VALID"
    }
  ]
}
```

---

## 4. Error: "Debes comprobar que tu cuenta de WhatsApp Business está suscrita a los Webhooks de Flows"

### Causa:
La cuenta de WhatsApp Business (WABA) no tiene vinculada la aplicación de Meta en su tabla de `subscribed_apps`.

### Solución:
Vincular la aplicación llamando al endpoint de la WABA:
```bash
curl -X POST "https://graph.facebook.com/v19.0/{WABA_ID}/subscribed_apps" \
     -H "Authorization: Bearer {WHATSAPP_TOKEN}"
```
Respuesta exitosa:
```json
{
  "success": true
}
```

---

## 5. Requisito de Publicación: Health Check (`ping`)

Al hacer clic en **"Publicar"** o enviar la orden `/publish`, Meta prueba la disponibilidad del endpoint configurado (`endpoint_uri`) enviando una petición POST con:
```json
{
  "action": "ping"
}
```
El servidor debe responder con código **HTTP 200** y el siguiente JSON:
```json
{
  "data": {
    "status": "active"
  }
}
```
*Si el endpoint devuelve 404 (ej. workflow inactivo en n8n) o 500, Meta bloqueará la publicación con el error `Endpoint Not Available (139002)`.*

---

## 6. Snippet para n8n (Nodo Code - Descifrado y Cifrado)

En n8n, añade un nodo **Code (JavaScript)** tras el Webhook para procesar el payload de WhatsApp Flows:

```javascript
const crypto = require('crypto');

// 1. Clave privada RSA del archivo whatsapp_flow_private_key.pem
const privateKeyPem = `-----BEGIN PRIVATE KEY-----
... (pegar contenido completo de whatsapp_flow_private_key.pem) ...
-----END PRIVATE KEY-----`;

const body = $input.first().json.body || $input.first().json;

// 2. Si es health check sin cifrar
if (body.action === 'ping') {
  return [{ json: { response: { data: { status: 'active' } } } }];
}

// 3. Descifrar clave AES
const encryptedAesKey = Buffer.from(body.encrypted_aes_key, 'base64');
const decryptedAesKey = crypto.privateDecrypt(
  {
    key: privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256'
  },
  encryptedAesKey
);

// 4. Descifrar Payload con AES-GCM 128
const iv = Buffer.from(body.initial_vector, 'base64');
const encryptedFlowData = Buffer.from(body.encrypted_flow_data, 'base64');
const tag = encryptedFlowData.subarray(encryptedFlowData.length - 16);
const ciphertext = encryptedFlowData.subarray(0, encryptedFlowData.length - 16);

const decipher = crypto.createDecipheriv('aes-128-gcm', decryptedAesKey, iv);
decipher.setAuthTag(tag);
const decryptedJsonStr = decipher.update(ciphertext, null, 'utf8') + decipher.final('utf8');
const decryptedData = JSON.parse(decryptedJsonStr);

// 5. Responder a health check o data_exchange
if (decryptedData.action === 'ping') {
  // Invertir vector inicial para la respuesta
  const flippedIv = Buffer.from(iv.map(b => ~b));
  const cipher = crypto.createCipheriv('aes-128-gcm', decryptedAesKey, flippedIv);
  const responseDataStr = JSON.stringify({ data: { status: 'active' } });
  const encryptedResp = Buffer.concat([cipher.update(responseDataStr, 'utf8'), cipher.final()]);
  const respTag = cipher.getAuthTag();
  const fullEncrypted = Buffer.concat([encryptedResp, respTag]).toString('base64');

  return [{ json: { response: fullEncrypted } }];
}

return [{ json: { decryptedData, decryptedAesKey: decryptedAesKey.toString('base64'), iv: iv.toString('base64') } }];
```

---

## 7. Script Automatizado del Repositorio

Puedes gestionar todo el ciclo de vida con el script incluido en este proyecto:
```bash
# Consultar estado actual
node --env-file=.env scripts/manage_flow_encryption.mjs status

# Vincular App a la WABA (resuelve error de Webhooks)
node --env-file=.env scripts/manage_flow_encryption.mjs subscribe-app

# Generar y registrar nuevas claves si se rotan en el futuro
node --env-file=.env scripts/manage_flow_encryption.mjs generate-and-register

# Publicar el Flow por API
node --env-file=.env scripts/manage_flow_encryption.mjs publish-flow 1471048271560677
```
