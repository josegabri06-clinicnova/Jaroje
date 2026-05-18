const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function run() {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': KEY,
    'Authorization': `Bearer ${KEY}`,
  };

  // 1. Create storage bucket
  console.log("Creating bucket...");
  const bRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: 'payroll_documents', name: 'payroll_documents', public: true })
  });
  console.log("Bucket:", await bRes.text());

  // 2. Add document_url column to payroll table via RPC (if exists) or we just assume the user will do it if RPC fails
  console.log("Adding column...");
  const sql = `ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS document_url TEXT;`;
  const sRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: sql })
  });
  console.log("SQL:", await sRes.text());
}
run().catch(console.error);
