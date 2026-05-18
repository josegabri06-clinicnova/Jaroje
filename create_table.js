const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const sql = `
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow anon read settings"
  ON public.settings FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "Allow anon upsert settings"
  ON public.settings FOR INSERT WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow anon update settings"
  ON public.settings FOR UPDATE USING (true);

INSERT INTO public.settings (key, value) VALUES
  ('pin_admin', '1234'),
  ('pin_limpieza', '5678'),
  ('pin_mantenimiento', '8765'),
  ('pin_recepcion', '0000')
ON CONFLICT (key) DO NOTHING;
`;

fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': KEY,
    'Authorization': `Bearer ${KEY}`,
  },
  body: JSON.stringify({ query: sql }),
}).then(r => r.text()).then(t => console.log('RPC:', t)).catch(e => console.error(e));
