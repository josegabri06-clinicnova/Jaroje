const fs = require('fs');

function loadDotenv() {
  try {
    const envFile = fs.readFileSync('.env', 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value;
      }
    });
  } catch (e) {
    console.error("Could not read .env file", e);
  }
}

loadDotenv();

async function getBeds24Token() {
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbKey) throw new Error("Faltan credenciales de Supabase");

  const sbRes = await fetch(`${sbUrl}/rest/v1/beds24_auth?id=eq.1`, {
    headers: {
      'apikey': sbKey,
      'Authorization': `Bearer ${sbKey}`
    }
  });
  const sbData = await sbRes.json();
  const { refresh_token } = sbData[0];

  const refreshRes = await fetch('https://api.beds24.com/v2/authentication/token', {
    method: 'GET',
    headers: { 'refreshToken': refresh_token }
  });
  const data = await refreshRes.json();
  return data.token;
}

async function run() {
  const token = await getBeds24Token();
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log("Fetching bookings for Room 101 (roomId: 679092, unitId: 1) and Room 306 (roomId: 679077, unitId: 6)...");
  
  // Fetch active bookings from Beds24
  const res = await fetch(`https://api.beds24.com/v2/bookings?arrivalFrom=2026-07-15&arrivalTo=2026-07-25&limit=100`, {
    headers: { 'token': token }
  });
  const json = await res.json();
  
  if (json.data && Array.isArray(json.data)) {
    const targetBookings = json.data.filter(b => {
      // 101 matches unitId = 1, roomId = 679092
      // 306 matches unitId = 6, roomId = 679077
      const is101 = String(b.roomId) === '679092' && String(b.unitId) === '1';
      const is306 = String(b.roomId) === '679077' && String(b.unitId) === '6';
      return is101 || is306;
    });

    console.log("\nBeds24 Bookings Found:", JSON.stringify(targetBookings, null, 2));

    // For each booking, also check Supabase checkins
    for (const b of targetBookings) {
      const sbRes = await fetch(`${sbUrl}/rest/v1/checkins?reservation_id=eq.${b.id}`, {
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`
        }
      });
      const sbData = await sbRes.json();
      console.log(`\nSupabase Checkin status for reservation ${b.id} (${b.firstName} ${b.lastName}):`, sbData);
    }
  } else {
    console.log("No bookings found in Beds24.");
  }
}

run().catch(console.error);
