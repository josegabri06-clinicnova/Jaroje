const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Insert default PINs using upsert
const defaults = [
  { key: 'pin_admin',         value: '1234' },
  { key: 'pin_limpieza',      value: '5678' },
  { key: 'pin_mantenimiento', value: '8765' },
  { key: 'pin_recepcion',     value: '0000' },
];

async function run() {
  // Try to create table via RPC or just upsert records
  for (const row of defaults) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': KEY,
        'Authorization': `Bearer ${KEY}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(row),
    });
    const text = await res.text();
    console.log(`${row.key}: ${res.status} ${text.substring(0,100)}`);
  }
}
run().catch(console.error);
