const fs = require('fs');

const envPath = '/Users/josegabriel/Desktop/hotel condominio/.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  }
}

const { createClient } = require('/Users/josegabriel/Desktop/hotel condominio/node_modules/@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function inspect() {
  console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "FOUND" : "NOT FOUND");
  console.log("ADMIN_PHONE / ALERT_PHONE:", {
    ADMIN_PHONE: process.env.ADMIN_PHONE,
    ALERT_PHONE: process.env.ALERT_PHONE,
    MANAGER_PHONE: process.env.MANAGER_PHONE,
    HOTEL_PHONE: process.env.HOTEL_PHONE,
    NOTIFY_PHONE: process.env.NOTIFY_PHONE
  });

  const { data: settings, error: errSettings } = await supabase.from('settings').select('*');
  console.log("\n--- SETTINGS TABLE ---");
  if (errSettings) console.error("Error settings:", errSettings.message);
  else console.log(JSON.stringify(settings, null, 2));

  const { data: convs, error: errConvs } = await supabase.from('whatsapp_conversations').select('*').limit(5);
  console.log("\n--- WHATSAPP CONVERSATIONS SAMPLE ---");
  if (errConvs) console.error("Error convs:", errConvs.message);
  else console.log(JSON.stringify(convs, null, 2));

  const { data: adminSettings, error: errAdmin } = await supabase.from('admin_settings').select('*');
  console.log("\n--- ADMIN_SETTINGS (if exists) ---");
  if (errAdmin) console.error("Error admin_settings:", errAdmin.message);
  else console.log(JSON.stringify(adminSettings, null, 2));
}

inspect();
