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

  console.log("📤 Consultando detalles del booking 90131016 de Beds24...");
  const res = await fetch("https://api.beds24.com/v2/bookings?id=90131016", {
    headers: { 'token': token }
  });
  const json = await res.json();
  console.log("Booking Data:", JSON.stringify(json, null, 2));
}

run().catch(console.error);
