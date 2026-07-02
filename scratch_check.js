const fs = require('fs');
const path = require('path');

// Manually parse .env file
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getBeds24Token() {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': KEY,
    'Authorization': `Bearer ${KEY}`,
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/beds24_auth?select=temp_token`, {
    headers
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Beds24 token from Supabase: ${await res.text()}`);
  }
  const data = await res.json();
  if (!data || data.length === 0) {
    throw new Error("No token found in Supabase beds24_auth table.");
  }
  return data[0].temp_token;
}

async function run() {
  const bookId = 89187774;
  console.log("🔑 Fetching Beds24 token...");
  const token = await getBeds24Token();
  console.log("✅ Token retrieved.");

  console.log(`🔍 Fetching details for booking ${bookId}...`);
  const res = await fetch(`https://api.beds24.com/v2/bookings?id[]=${bookId}&includeInvoiceItems=true`, {
    headers: {
      'token': token,
      'Content-Type': 'application/json'
    }
  });

  console.log("Status Code:", res.status);
  const json = await res.json();
  console.log("Booking Details:\n", JSON.stringify(json, null, 2));
}

run().catch(console.error);
