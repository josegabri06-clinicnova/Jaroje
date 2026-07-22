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
      // 2.1. Consolidar capacidad si es una reservación de grupo local
      let groupBase = 0;
      let groupMax = 0;
      let groupOriginalPax = Number(localRes.num_adult || 1) + Number(localRes.num_child || 0);
      let groupOriginalPrice = Number(localRes.price || 0);
      let groupDeposit = Number(localRes.deposit || 0);

      const mainRules = getCapacityRules(localRes.unit_id || '', capacitySettings || undefined);
      groupBase += mainRules.base;
      groupMax += mainRules.max;

      try {
        const cleanStr = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
        const mainName = cleanStr(localRes.guest_name || '');
        const mainPhone = (localRes.phone || '').trim();

        const { data: siblingLocal } = await supabase
          .from('local_reservas')
          .select('id, unit_id, guest_name, phone, num_adult, num_child, price, deposit')
          .eq('check_in', localRes.check_in)
          .neq('id', localRes.id);

        if (siblingLocal && siblingLocal.length > 0) {
          siblingLocal.forEach(s => {
            const samePhone = mainPhone && s.phone && s.phone.trim() === mainPhone;
            const sameName = mainName && s.guest_name && (cleanStr(s.guest_name).includes(mainName) || mainName.includes(cleanStr(s.guest_name)));
            if (samePhone || sameName) {
              const sRules = getCapacityRules(s.unit_id || '', capacitySettings || undefined);
              groupBase += sRules.base;
              groupMax += sRules.max;
              groupOriginalPax += (Number(s.num_adult || 0) + Number(s.num_child || 0));
              groupOriginalPrice += Number(s.price || 0);
              groupDeposit += Number(s.deposit || 0);
            }
          });
        }
      } catch (err) {
        console.error("Error al consolidar grupo localRes en update-guests:", err);
      }

      if (totalNewGuests > groupMax) {
        return NextResponse.json({ 
          success: false, 
          error: `La capacidad máxima de la reservación es de ${groupMax} personas. Has seleccionado ${totalNewGuests}.` 
        }, { status: 400 });
      }

      // 2.2. Calcular ajuste de precio basado en la capacidad base del grupo
      const originalExtraGuests = Math.max(0, groupOriginalPax - groupBase);
      const newExtraGuests = Math.max(0, totalNewGuests - groupBase);
      const diffExtra = newExtraGuests - originalExtraGuests;

      const extraGuestPrice = capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500;
      
      const arrivalDate = localRes.check_in ? new Date(localRes.check_in) : null;
      const departureDate = localRes.check_out ? new Date(localRes.check_out) : null;
      const nights = (arrivalDate && departureDate)
        ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 1;

      const priceAdjustment = Math.round(diffExtra * extraGuestPrice * nights);
      const newPrice = Math.round(groupOriginalPrice + priceAdjustment);
      const newBalance = Math.max(0, newPrice - groupDeposit);

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

    // 3.1. Consolidar grupo en Beds24 si existen reservas hermanas
    let groupBase = 0;
    let groupMax = 0;
    let groupOriginalPax = 0;
    let groupOriginalPrice = 0;

    try {
      const allB24 = await getBeds24Bookings(true);
      const normalizePhoneStr = (p?: string) => (p || '').replace(/\D/g, '');

      const mainPhone = currentBooking.phone || currentBooking.mobile || currentBooking.guestPhone || currentBooking.guestMobile || '';
      const phoneNum = mainPhone ? normalizePhoneStr(mainPhone) : '';
      const mainName = `${currentBooking.firstName || ''} ${currentBooking.lastName || ''}`.toLowerCase().trim().replace(/\s+/g, ' ');

      const siblingBeds24 = allB24.filter(r => {
        if (r.check_in !== currentBooking.arrival) return false;
        if (r.check_out !== currentBooking.departure) return false;
        const rPhone = r.guest_phone || r.phone || r.mobile || '';
        const samePhone = phoneNum && rPhone && normalizePhoneStr(rPhone) === phoneNum;
        const sameName = mainName && r.guest_name && (r.guest_name.toLowerCase().includes(mainName) || mainName.includes(r.guest_name.toLowerCase()));
        return samePhone || sameName;
      });

      const groupList = siblingBeds24.length > 0 ? siblingBeds24 : [{
        roomId: String(currentBooking.roomId || ''),
        roomName: currentBooking.roomName || '',
        num_adult: Number(currentBooking.numAdult || 1),
        num_child: Number(currentBooking.numChild || 0),
        price: Number(currentBooking.price || 0)
      }];

      groupList.forEach((b: any) => {
        const roomIdentifier = String(b.roomId || b.unitId || b.room_name || b.roomName || '');
        const rRules = getCapacityRules(roomIdentifier, capacitySettings || undefined);
        groupBase += rRules.base;
        groupMax += rRules.max;
        groupOriginalPax += (Number(b.num_adult || b.numAdult || 1) + Number(b.num_child || b.numChild || 0));
        groupOriginalPrice += Number(b.price || b.price_estimate || 0);
      });

    } catch (err) {
      console.error("Error al consolidar grupo Beds24:", err);
      const roomId = String(currentBooking.roomId || '');
      const roomName = currentBooking.roomName || '';
      const rules = getCapacityRules(roomId || roomName, capacitySettings || undefined);
      groupBase = rules.base;
      groupMax = rules.max;
      groupOriginalPax = Number(currentBooking.numAdult || 1) + Number(currentBooking.numChild || 0);
      groupOriginalPrice = Number(currentBooking.price || 0);
    }

    if (groupOriginalPrice === 0) {
      groupOriginalPrice = Number(currentBooking.price || 0);
    }

    if (totalNewGuests > groupMax) {
      return NextResponse.json({ 
        success: false, 
        error: `La capacidad máxima de la reservación es de ${groupMax} personas. Has seleccionado ${totalNewGuests}.` 
      }, { status: 400 });
    }

    // 3.2. Calcular ajuste de precio
    const originalExtraGuests = Math.max(0, groupOriginalPax - groupBase);
    const newExtraGuests = Math.max(0, totalNewGuests - groupBase);
    const diffExtra = newExtraGuests - originalExtraGuests;

    const extraGuestPrice = capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500;
    
    const arrivalDate = currentBooking.arrival ? new Date(currentBooking.arrival) : null;
    const departureDate = currentBooking.departure ? new Date(currentBooking.departure) : null;
    const nights = (arrivalDate && departureDate)
      ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 1;

    const priceAdjustment = Math.round(diffExtra * extraGuestPrice * nights);
    const newPrice = Math.round(groupOriginalPrice + priceAdjustment);

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
