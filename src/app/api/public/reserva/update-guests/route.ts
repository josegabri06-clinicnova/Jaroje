import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getBeds24Bookings, getBeds24Token } from '@/lib/beds24';
import { getCapacityRules } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { bookingId, numAdult, numChild } = body;

    if (!bookingId || numAdult === undefined || numChild === undefined) {
      return NextResponse.json({ success: false, error: 'Faltan parámetros obligatorios' }, { status: 400 });
    }

    const id = Number(bookingId);
    const newAdults = Number(numAdult);
    const newChildren = Number(numChild);
    const totalNewGuests = newAdults + newChildren;

    // 1. Cargar capacity_settings de la base de datos
    let capacitySettings: any = null;
    const { data: capRes } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'capacity_settings')
      .maybeSingle();
    
    if (capRes?.value) {
      try {
        capacitySettings = typeof capRes.value === 'string' ? JSON.parse(capRes.value) : capRes.value;
      } catch (e) {
        console.error("Error parsing capacity settings in update-guests API:", e);
      }
    }

    // 2. Intentar buscar en local_reservas de Supabase
    const { data: localRes } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (localRes) {
      // 2.1. Validar capacidad máxima
      const rules = getCapacityRules(localRes.unit_id || '', capacitySettings || undefined);
      if (totalNewGuests > rules.max) {
        return NextResponse.json({ 
          success: false, 
          error: `La capacidad máxima de la habitación es de ${rules.max} personas. Has seleccionado ${totalNewGuests}.` 
        }, { status: 400 });
      }

      // 2.2. Calcular ajuste de precio
      const originalPax = Number(localRes.num_adult || 1) + Number(localRes.num_child || 0);
      const originalExtraGuests = Math.max(0, originalPax - rules.base);
      const newExtraGuests = Math.max(0, totalNewGuests - rules.base);
      const diffExtra = newExtraGuests - originalExtraGuests;

      const extraGuestPrice = capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500;
      
      const arrivalDate = localRes.check_in ? new Date(localRes.check_in) : null;
      const departureDate = localRes.check_out ? new Date(localRes.check_out) : null;
      const nights = (arrivalDate && departureDate)
        ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 1;

      const priceAdjustment = Math.round(diffExtra * extraGuestPrice * nights);
      const newPrice = Math.round(Number(localRes.price || 0) + priceAdjustment);
      const newBalance = Math.max(0, newPrice - Number(localRes.deposit || 0));

      // 2.3. Guardar en base de datos local
      const { error: dbErr } = await supabase
        .from('local_reservas')
        .update({
          num_adult: newAdults,
          num_child: newChildren,
          price: newPrice
        })
        .eq('id', id);

      if (dbErr) throw dbErr;

      // Log de auditoría
      await supabase.from('employee_logs').insert([{
        employee_num: '000',
        employee_name: `Huésped: ${localRes.guest_name}`,
        department: 'recepcion',
        module: 'portal_publico',
        action: 'huespedes_modificados',
        room: localRes.unit_id || 'Local',
        details: `Huésped modificó su número de personas en el portal a ${newAdults}A/${newChildren}N. Precio ajustado de $${localRes.price} a $${newPrice} MXN.`
      }]);

      return NextResponse.json({
        success: true,
        price: newPrice,
        balance: newBalance,
        num_adult: newAdults,
        num_child: newChildren
      });
    }

    // 3. Si no es local, es de Beds24
    const BEDS24_TOKEN = await getBeds24Token();
    let currentBooking: any = null;
    
    // Obtener detalles actuales de la reserva desde Beds24
    const getRes = await fetch(`https://api.beds24.com/v2/bookings?id[]=${id}&includeInvoiceItems=true`, {
      headers: { 'token': BEDS24_TOKEN }
    });
    const getJson = await getRes.json().catch(() => null);
    
    if (getJson && getJson.data && getJson.data.length > 0) {
      currentBooking = getJson.data[0];
    } else {
      return NextResponse.json({ success: false, error: 'No se encontró la reserva en Beds24' }, { status: 404 });
    }

    // 3.1. Validar capacidad máxima
    const roomName = currentBooking.roomName || '';
    const rules = getCapacityRules(roomName, capacitySettings || undefined);
    if (totalNewGuests > rules.max) {
      return NextResponse.json({ 
        success: false, 
        error: `La capacidad máxima de la habitación es de ${rules.max} personas. Has seleccionado ${totalNewGuests}.` 
      }, { status: 400 });
    }

    // 3.2. Calcular ajuste de precio
    const originalPax = Number(currentBooking.numAdult || 1) + Number(currentBooking.numChild || 0);
    const originalExtraGuests = Math.max(0, originalPax - rules.base);
    const newExtraGuests = Math.max(0, totalNewGuests - rules.base);
    const diffExtra = newExtraGuests - originalExtraGuests;

    const extraGuestPrice = capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500;
    
    const arrivalDate = currentBooking.arrival ? new Date(currentBooking.arrival) : null;
    const departureDate = currentBooking.departure ? new Date(currentBooking.departure) : null;
    const nights = (arrivalDate && departureDate)
      ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 1;

    const priceAdjustment = Math.round(diffExtra * extraGuestPrice * nights);
    const currentPrice = Number(currentBooking.price || 0);
    const newPrice = Math.round(currentPrice + priceAdjustment);

    // Calcular depósitos reales hechos en la reserva para estimar saldo restante
    let actualPaid = 0;
    if (currentBooking.invoiceItems && Array.isArray(currentBooking.invoiceItems)) {
      currentBooking.invoiceItems.forEach((item: any) => {
        const qty = Number(item.qty || 0);
        const price = Number(item.price || 0);
        const lineTotal = qty * price;
        if (lineTotal < 0) {
          actualPaid += Math.abs(lineTotal);
        }
      });
    }
    const newBalance = Math.max(0, newPrice - actualPaid);

    // 3.3. Actualizar en Beds24
    const updatePayload: any = {
      id: id,
      bookId: id,
      numAdult: newAdults,
      numChild: newChildren,
      price: newPrice
    };

    // Actualizar los ítems de factura
    const currentItems = Array.isArray(currentBooking.invoiceItems) ? currentBooking.invoiceItems : [];
    const charges = currentItems.filter((item: any) => Number(item.qty || 0) > 0);
    const invoiceItemsUpdate: any[] = [];

    if (charges.length > 0) {
      const firstCharge = charges[0];
      invoiceItemsUpdate.push({
        id: firstCharge.id,
        description: firstCharge.description || "Room Charge",
        qty: 1,
        amount: newPrice
      });
      for (let i = 1; i < charges.length; i++) {
        invoiceItemsUpdate.push({
          id: charges[i].id,
          description: "",
          qty: "",
          amount: "",
          status: ""
        });
      }
    } else {
      invoiceItemsUpdate.push({
        description: "Room Charge",
        qty: 1,
        amount: newPrice
      });
    }
    updatePayload.invoiceItems = invoiceItemsUpdate;

    const beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify([updatePayload])
    });

    if (!beds24Response.ok) {
      const errText = await beds24Response.text();
      throw new Error(`Beds24 rechazó la modificación: ${errText}`);
    }

    // Log de auditoría
    const guestFullName = `${currentBooking.firstName || ''} ${currentBooking.lastName || ''}`.trim() || 'Huésped';
    await supabase.from('employee_logs').insert([{
      employee_num: '000',
      employee_name: `Huésped: ${guestFullName}`,
      department: 'recepcion',
      module: 'portal_publico',
      action: 'huespedes_modificados',
      room: currentBooking.roomName || 'Beds24',
      details: `Huésped modificó su número de personas en el portal a ${newAdults}A/${newChildren}N. Precio ajustado en Beds24 de $${currentPrice} a $${newPrice} MXN.`
    }]);

    return NextResponse.json({
      success: true,
      price: newPrice,
      balance: newBalance,
      num_adult: newAdults,
      num_child: newChildren
    });

  } catch (err: any) {
    console.error("Error en update-guests API:", err);
    return NextResponse.json({ success: false, error: err.message || 'Error interno' }, { status: 500 });
  }
}
