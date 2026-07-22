import { NextResponse } from 'next/server';
import { getBeds24Token, clearBeds24Cache } from '@/lib/beds24';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function performRebalance(bookingId: string) {
  const bookingIdNum = Number(bookingId);

  // 1. Revisar si es reserva local en Supabase
  const { data: localTarget } = await supabase
    .from('local_reservas')
    .select('*')
    .eq('id', bookingIdNum)
    .maybeSingle();

  if (localTarget) {
    const cleanStr = (s: string) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const mainName = cleanStr(localTarget.guest_name || '');
    const mainPhone = (localTarget.phone || '').trim();

    const { data: siblings } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('check_in', localTarget.check_in);

    const group = (siblings || []).filter(s => {
      if (s.check_out !== localTarget.check_out) return false;
      const sName = cleanStr(s.guest_name || '');
      const sPhone = (s.phone || '').trim();
      const samePhone = mainPhone && sPhone && sPhone === mainPhone;
      const sameName = mainName && sName && (sName.includes(mainName) || mainName.includes(sName));
      return samePhone || sameName;
    });

    if (group.length > 1) {
      let totalDepositInGroup = 0;
      let totalPriceInGroup = 0;
      group.forEach(s => {
        totalDepositInGroup += Number(s.deposit || 0);
        totalPriceInGroup += Number(s.price || 0);
      });

      for (const s of group) {
        const sPrice = Number(s.price || 0);
        const prop = totalPriceInGroup > 0 ? (sPrice / totalPriceInGroup) : (1 / group.length);
        const targetDeposit = Math.round(totalDepositInGroup * prop * 100) / 100;

        await supabase
          .from('local_reservas')
          .update({ deposit: targetDeposit })
          .eq('id', s.id);
      }

      return NextResponse.json({
        success: true,
        message: `Reserva local: Depósito de $${totalDepositInGroup} redistribuido en ${group.length} habitaciones.`
      });
    }
  }

  // 2. Si es de Beds24
  const token = await getBeds24Token();

  const resTarget = await fetch(`https://api.beds24.com/v2/bookings?id=${bookingId}&includeInvoice=true`, {
    headers: { 'token': token },
    cache: 'no-store'
  });
  if (!resTarget.ok) {
    return NextResponse.json({ error: 'Error consultando la reserva en Beds24' }, { status: 500 });
  }
  const jsonTarget = await resTarget.json();
  if (!jsonTarget.success || !jsonTarget.data || jsonTarget.data.length === 0) {
    return NextResponse.json({ error: 'Reserva no encontrada en Beds24' }, { status: 404 });
  }

  const targetB = jsonTarget.data[0];
  const targetName = `${targetB.firstName || ''} ${targetB.lastName || ''}`.trim().toLowerCase();
  const targetPhone = (targetB.phone || targetB.mobile || targetB.guestPhone || '').trim();

  const resSiblings = await fetch(`https://api.beds24.com/v2/bookings?arrivalFrom=${targetB.arrival}&arrivalTo=${targetB.arrival}&includeInvoice=true`, {
    headers: { 'token': token },
    cache: 'no-store'
  });
  const jsonSiblings = await resSiblings.json();
  const allArrival = jsonSiblings.data || [];

  const group = allArrival.filter((b: any) => {
    if (b.departure !== targetB.departure) return false;
    if (String(b.status) === '0' || b.status === 'cancelled') return false;
    const bName = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
    const bPhone = (b.phone || b.mobile || b.guestPhone || '').trim();
    const sameName = bName && targetName && (bName.includes(targetName) || targetName.includes(bName));
    const samePhone = bPhone && targetPhone && (bPhone.includes(targetPhone) || targetPhone.includes(bPhone));
    return sameName || samePhone;
  });

  if (group.length <= 1) {
    return NextResponse.json({ message: 'La reserva no pertenece a un grupo de múltiples condominios' }, { status: 200 });
  }

  let totalDepositInGroup = 0;
  let totalPriceInGroup = 0;
  group.forEach((b: any) => {
    totalDepositInGroup += Number(b.deposit || 0);
    totalPriceInGroup += Number(b.price || 0);
  });

  const results = [];
  for (const b of group) {
    const bPrice = Number(b.price || 0);
    const prop = totalPriceInGroup > 0 ? (bPrice / totalPriceInGroup) : (1 / group.length);
    const targetDeposit = Math.round(totalDepositInGroup * prop * 100) / 100;

    const updatePayload = [
      {
        id: Number(b.id),
        bookId: Number(b.id),
        status: 'confirmed',
        deposit: targetDeposit,
        invoiceItems: [
          {
            description: `Redistribución de anticipo grupal (Rebalanceo Jaroje)`,
            qty: -1,
            amount: targetDeposit
          }
        ]
      }
    ];

    const postRes = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: { 'token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
      cache: 'no-store'
    });
    const postJson = await postRes.json();
    results.push({
      id: b.id,
      room: b.roomName || b.roomId,
      targetDeposit,
      success: postRes.ok && postJson?.success !== false
    });
  }

  clearBeds24Cache();
  return NextResponse.json({
    success: true,
    message: `Depósito de $${totalDepositInGroup} redistribuido con éxito entre ${group.length} condominios en Beds24.`,
    details: results
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bookingId = searchParams.get('bookingId');
    if (!bookingId) {
      return NextResponse.json({ error: 'Falta bookingId' }, { status: 400 });
    }
    return await performRebalance(bookingId);
  } catch (err: any) {
    console.error("Error en GET rebalance-group API:", err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { bookingId } = await req.json();
    if (!bookingId) {
      return NextResponse.json({ error: 'Falta bookingId' }, { status: 400 });
    }
    return await performRebalance(bookingId);
  } catch (err: any) {
    console.error("Error en POST rebalance-group API:", err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
