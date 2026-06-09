import { NextResponse } from 'next/server';
import { getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug-beds24
 * Ruta temporal para ver exactamente qué devuelve el endpoint de calendario de Beds24.
 * ELIMINAR después de resolver el problema.
 */
export async function GET() {
  try {
    const token = await getBeds24Token();

    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const toDate = new Date(today);
    toDate.setDate(today.getDate() + 3);
    const to = toDate.toISOString().split('T')[0];

    // Probar con UN solo roomId primero
    const roomId = '679077';

    // Intento 1: /inventory/rooms/calendar
    const r1 = await fetch(
      `https://api.beds24.com/v2/inventory/rooms/calendar?from=${from}&to=${to}&roomId=${roomId}`,
      { headers: { token }, cache: 'no-store' }
    );
    const j1 = await r1.json().catch(() => ({ parseError: true, status: r1.status }));

    // Intento 2: /inventory/calendar (diferente endpoint)
    const r2 = await fetch(
      `https://api.beds24.com/v2/inventory/calendar?from=${from}&to=${to}&roomId=${roomId}`,
      { headers: { token }, cache: 'no-store' }
    );
    const j2 = await r2.json().catch(() => ({ parseError: true, status: r2.status }));

    // Intento 3: /inventory/rooms (listar rooms disponibles)
    const r3 = await fetch(
      `https://api.beds24.com/v2/inventory/rooms`,
      { headers: { token }, cache: 'no-store' }
    );
    const j3 = await r3.json().catch(() => ({ parseError: true, status: r3.status }));

    return NextResponse.json({
      from,
      to,
      roomId,
      endpoint1_rooms_calendar: { status: r1.status, data: j1 },
      endpoint2_calendar: { status: r2.status, data: j2 },
      endpoint3_rooms_list: { status: r3.status, data: j3 },
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
