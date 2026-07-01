const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let supabaseUrl = "";
let supabaseKey = "";

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)/);
  if (urlMatch) {
    supabaseUrl = urlMatch[1].replace(/["']/g, '').trim();
  }
  const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)/);
  if (keyMatch) {
    supabaseKey = keyMatch[1].replace(/["']/g, '').trim();
  }
}

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Error: Faltan credenciales de Supabase en .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    console.log("🔑 Obteniendo token de Beds24 desde la base de datos de Supabase...");
    const { data: authData, error: authError } = await supabase
      .from('beds24_auth')
      .select('temp_token')
      .maybeSingle();

    if (authError || !authData || !authData.temp_token) {
      throw new Error(`No se pudo obtener el token de la DB: ${authError?.message || 'Token no encontrado en beds24_auth'}`);
    }

    const token = authData.temp_token;
    console.log("✅ Token temporal obtenido de Supabase.");

    // Creamos una reserva de prueba en la Habitación Doble (roomId: 679091)
    const testPayload = [{
      roomId: 679091,
      arrival: "2027-12-01",
      departure: "2027-12-02",
      firstName: "Test",
      lastName: "Response Structure",
      status: "temp",
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
    console.log("\n=== RESPUESTA RAW DE BEDS24 ===");
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
