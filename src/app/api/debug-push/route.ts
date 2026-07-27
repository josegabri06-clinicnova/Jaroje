import { NextResponse } from 'next/server';
import { getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const token = await getBeds24Token();
    
    // Probar a enviar un payload de actualización a Beds24 para Habitación Doble (679077)
    // Vamos a enviar un precio de 1681 para el 1 de septiembre de 2027
    const payload = [
      {
        roomId: 679077,
        calendar: [
          {
            from: '2027-09-01',
            to: '2027-09-01',
            price1: 1681
          }
        ]
      }
    ];

    const res = await fetch('https://api.beds24.com/v2/inventory/rooms/calendar', {
      method: 'POST',
      headers: {
        'token': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });

    const status = res.status;
    const ok = res.ok;
    const bodyText = await res.text();

    return NextResponse.json({
      success: true,
      status,
      ok,
      bodyText: typeof bodyText === 'string' ? JSON.parse(bodyText) : bodyText
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, stack: err.stack });
  }
}
