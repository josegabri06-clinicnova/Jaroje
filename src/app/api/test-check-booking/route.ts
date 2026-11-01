import { NextResponse } from 'next/server';
import { getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing id param' }, { status: 400 });
    }

    const token = await getBeds24Token();
    const res = await fetch(`https://api.beds24.com/v2/bookings?id[]=${id}&includeInvoiceItems=true`, {
      headers: {
        'token': token,
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    const json = await res.json();
    return NextResponse.json({ status: res.status, data: json });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
