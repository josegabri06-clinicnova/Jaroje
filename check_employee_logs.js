const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const k = parts[0].trim();
    const v = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    if (k) env[k] = v;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: logs, error } = await supabase
    .from('employee_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) console.error("Error fetching logs:", error);
  else {
    logs.forEach(l => {
      console.log(`[${l.created_at}] [${l.action}] Room: ${l.room} Details: ${l.details}`);
    });
  }
}

run();
