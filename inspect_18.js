const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const urlMatch = envText.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)/);
const keyMatch = envText.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*(.+)/);

if (!urlMatch || !keyMatch) {
  console.error("Missing supabase credentials in .env");
  process.exit(1);
}

const url = urlMatch[1].trim().replace(/['"]/g, '');
const anonKey = keyMatch[1].trim().replace(/['"]/g, '');

const supabase = createClient(url, anonKey);

async function run() {
  const { data, error } = await supabase.from('checkins').select('*').eq('reservation_id', '18');
  console.log('CHECKIN FOR 18:', data, error);
}

run();
