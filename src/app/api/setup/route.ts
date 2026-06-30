import { NextResponse } from 'next/server';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !key) {
    return NextResponse.json({ error: 'Faltan variables de entorno de Supabase' }, { status: 500 });
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
  };

  const reports: string[] = [];

  try {
    // 1. Crear el bucket payment_receipts
    const bRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'payment_receipts', name: 'payment_receipts', public: true })
    });
    reports.push(`Bucket: ${await bRes.text()}`);

    // 2. Crear la columna receipt_url en checkins
    const sql = `ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS receipt_url TEXT;`;
    const sRes = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: sql })
    });
    reports.push(`SQL Column: ${await sRes.text()}`);

    return NextResponse.json({ success: true, reports });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
