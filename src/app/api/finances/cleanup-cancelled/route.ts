import { NextResponse } from 'next/server';
import { cleanupAllCancelledReservationsFinances, deleteCancelledReservationFinances } from '@/lib/finances';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { bookingId } = body;

    if (bookingId) {
      const singleResult = await deleteCancelledReservationFinances(bookingId, 'Llamada manual API cleanup');
      return NextResponse.json({ success: true, result: singleResult });
    }

    const fullResult = await cleanupAllCancelledReservationsFinances();
    return NextResponse.json({ success: true, ...fullResult });
  } catch (err: any) {
    console.error("[API cleanup-cancelled] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const fullResult = await cleanupAllCancelledReservationsFinances();
    return NextResponse.json({ success: true, ...fullResult });
  } catch (err: any) {
    console.error("[API cleanup-cancelled GET] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
