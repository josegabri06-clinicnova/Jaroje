const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Cargar variables de entorno del archivo .env
const envPath = path.join(__dirname, '.env');
console.log('Loading .env from:', envPath);
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    console.log('Fetching beds24_auth table row 1...');
    const { data: auth, error: authErr } = await supabase
      .from('beds24_auth')
      .select('*')
      .eq('id', 1)
      .single();

    if (authErr) {
      throw new Error('Supabase error: ' + authErr.message);
    }

    console.log('Beds24 temp_token retrieved successfully.');
    
    // Consultar la reserva en local_reservas
    const bookingId = '90131016';
    console.log(`Searching for booking ${bookingId} in local_reservas...`);
    const { data: localRes, error: resErr } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (resErr) {
      console.error('Error fetching local reservation:', resErr);
    } else {
      console.log('Local reservation data:', JSON.stringify(localRes, null, 2));
    }

  } catch (err) {
    console.error('Run failed:', err);
  }
}

run();
