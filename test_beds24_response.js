const fs = require('fs');
const path = require('path');

// Intentar leer las credenciales desde .env
let refreshErr = false;
let refreshToken = "";

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const tokenMatch = envContent.match(/BEDS24_REFRESH_TOKEN\s*=\s*(.+)/);
  if (tokenMatch) {
    refreshToken = tokenMatch[1].replace(/["']/g, '').trim();
  }
}

if (!refreshToken) {
  console.error("❌ Error: No se encontró BEDS24_REFRESH_TOKEN en el archivo .env");
  process.exit(1);
}

async function run() {
  try {
    console.log("🔑 Obteniendo token de acceso temporal de Beds24...");
    const refreshRes = await fetch('https://api.beds24.com/v2/authentication/token', {
      method: 'GET',
      headers: { 'refreshToken': refreshToken }
    });
    
    if (!refreshRes.ok) {
      throw new Error(`Fallo de autenticación: ${await refreshRes.text()}`);
    }
    
    const { token } = await refreshRes.json();
    console.log("✅ Token obtenido con éxito.");

    // Creamos una reserva de prueba en la Habitación Doble (roomId: 679091)
    const testPayload = [{
      roomId: 679091,
      arrival: "2027-12-01",
      departure: "2027-12-02",
      firstName: "Test",
      lastName: "Response Structure",
      status: "temp", // Estado temporal
      notes: "Prueba de estructura del API Jaroje OS"
    }];

    console.log("\n📤 Creando reserva de prueba en Beds24...");
    const beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: { 'token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });

    const status = beds24Response.status;
    const bodyText = await beds24Response.text();
    console.log("=== RESPUESTA RAW DE BEDS24 ===");
    console.log("Status Code:", status);
    console.log("Body:", bodyText);

    let parsed;
    try {
      parsed = JSON.parse(bodyText);
    } catch(e) {}

    if (parsed) {
      const resultsArray = Array.isArray(parsed) ? parsed : (parsed.data || []);
      const firstResult = resultsArray[0];
      const bookingId = firstResult ? (firstResult.id || firstResult.bookId) : null;
      console.log("\n🔍 Análisis de campos:");
      console.log("- ¿Es array directo?:", Array.isArray(parsed));
      console.log("- ¿Tiene campo .data?:", !!parsed.data);
      console.log("- firstResult obtenido:", JSON.stringify(firstResult, null, 2));
      console.log("- ID detectado (bookingId):", bookingId);

      if (bookingId) {
        console.log(`\n🧹 Borrando reserva de prueba (ID: ${bookingId})...`);
        const deleteRes = await fetch('https://api.beds24.com/v2/bookings', {
          method: 'POST',
          headers: { 'token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify([{
            id: Number(bookingId),
            status: "cancelled"
          }])
        });
        console.log("Resultado de borrado:", await deleteRes.text());
      }
    }
  } catch (err) {
    console.error("❌ Error durante la prueba:", err);
  }
}

run();
