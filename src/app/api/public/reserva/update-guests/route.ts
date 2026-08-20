import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getBeds24Bookings, getBeds24Token, getCapacityRules, detectAndAdjustGroupGuests } from '@/lib/beds24';

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
      let siblingLocal: any[] = [];
      try {
        const cleanStr = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
        const mainName = cleanStr(localRes.guest_name || '');
        const mainPhone = (localRes.phone || '').trim();

        const { data: siblings } = await supabase
          .from('local_reservas')
          .select('id, unit_id, guest_name, phone, num_adult, num_child, price, deposit, channel')
          .eq('check_in', localRes.check_in)
          .neq('id', localRes.id);

        const localChannel = (localRes.channel || '').toLowerCase();
        const isLocalOta = ['booking.com', 'airbnb', 'expedia'].some(c => localChannel.includes(c));

        if (siblings && siblings.length > 0) {
          siblingLocal = siblings.filter(s => {
            const sChannel = (s.channel || '').toLowerCase();
            const sIsOta = ['booking.com', 'airbnb', 'expedia'].some(c => sChannel.includes(c));

            // No agrupar reservas de OTA con reservas directas ni entre sí de distinto nombre
            if (isLocalOta !== sIsOta) return false;

            const samePhone = mainPhone && s.phone && s.phone.trim() === mainPhone && mainPhone.length >= 6;
            const sameName = mainName && s.guest_name && (cleanStr(s.guest_name).includes(mainName) || mainName.includes(cleanStr(s.guest_name)));
            
            return (isLocalOta || sIsOta) ? !!sameName : !!(samePhone || sameName);
          });
        }
      } catch (err) {
        console.error("Error al consolidar grupo localRes en update-guests:", err);
      }

      const UNIT_TO_ROOM: Record<string, string> = {
        '1': '500', '2': '501', '3': '502', '4': '503',
        '5': '504', '6': '505', '7': '506', '8': '507'
      };
      
      const localResMapped = {
        ...localRes,
        room: localRes.unit_id ? (UNIT_TO_ROOM[localRes.unit_id] || localRes.unit_id) : ''
      };
      
      const siblingLocalMapped = siblingLocal.map(s => ({
        ...s,
        room: s.unit_id ? (UNIT_TO_ROOM[s.unit_id] || s.unit_id) : ''
      }));

      const allLocalMembers = [localResMapped, ...siblingLocalMapped];
      const adjLocal = detectAndAdjustGroupGuests(allLocalMembers, capacitySettings || undefined);

      let groupBase = 0;
      let groupMax = 0;
      let groupOriginalPrice = 0;
      let groupDeposit = 0;

      adjLocal.members.forEach((b: any) => {
        const rRules = getCapacityRules(b.room || '', capacitySettings || undefined);
        groupBase += rRules.base;
        groupMax += rRules.max;
        groupOriginalPrice += Number(b.price || 0);
        groupDeposit += Number(b.deposit || 0);
      });

      // 2.1. Calcular el total de huéspedes del grupo considerando el nuevo valor de esta habitación
      const currentLocalAdj = adjLocal.members[0] || localRes;
      const oldAdjAdults = currentLocalAdj.display_num_adult !== undefined ? currentLocalAdj.display_num_adult : Number(localRes.num_adult || 1);
      const oldAdjChildren = currentLocalAdj.display_num_child !== undefined ? currentLocalAdj.display_num_child : Number(localRes.num_child || 0);

      const diffAdults = newAdults - oldAdjAdults;
      const diffChildren = newChildren - oldAdjChildren;

      const groupOriginalPax = adjLocal.groupTotalAdults + adjLocal.groupTotalChildren;
      const totalNewGroupGuests = (adjLocal.groupTotalAdults + diffAdults) + (adjLocal.groupTotalChildren + diffChildren);

      // Validar capacidad individual de la habitación
      const currentRoomRules = getCapacityRules(currentLocalAdj.room || '', capacitySettings || undefined);
      if (totalNewGuests > currentRoomRules.max) {
        return NextResponse.json({
          success: false,
          error: `La capacidad máxima de la habitación es de ${currentRoomRules.max} personas. Has seleccionado ${totalNewGuests}.`
        }, { status: 400 });
      }

      if (totalNewGroupGuests > groupMax) {
        return NextResponse.json({ 
          success: false, 
          error: `La capacidad máxima del grupo es de ${groupMax} personas. Has seleccionado un total de ${totalNewGroupGuests} en el grupo.` 
        }, { status: 400 });
      }

      // 2.2. Calcular ajuste de precio basado en la capacidad base del grupo
      const originalExtraGuests = Math.max(0, groupOriginalPax - groupBase);
      const newExtraGuests = Math.max(0, totalNewGroupGuests - groupBase);
      const diffExtra = newExtraGuests - originalExtraGuests;

      const extraGuestPrice = capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500;
      
      const arrivalDate = localRes.check_in ? new Date(localRes.check_in) : null;
      const departureDate = localRes.check_out ? new Date(localRes.check_out) : null;
      const nights = (arrivalDate && departureDate)
        ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 1;

      const priceAdjustment = Math.round(diffExtra * extraGuestPrice * nights);
      const groupNewPrice = Math.round(groupOriginalPrice + priceAdjustment);
      const newPrice = Math.round(Number(localRes.price || 0) + priceAdjustment);
      const newBalance = Math.max(0, groupNewPrice - groupDeposit);

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
        price: groupNewPrice,
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
    let groupTotalPaid = 0;
    let adjB24: any = null;

    try {
      const allB24 = await getBeds24Bookings(true);
      const normalizePhoneStr = (p?: string) => (p || '').replace(/\D/g, '');

      const mainPhone = currentBooking.phone || currentBooking.mobile || currentBooking.guestPhone || currentBooking.guestMobile || '';
      const phoneNum = mainPhone ? normalizePhoneStr(mainPhone) : '';
      const mainName = `${currentBooking.firstName || ''} ${currentBooking.lastName || ''}`.toLowerCase().trim().replace(/\s+/g, ' ');

      const rawSource = String(`${currentBooking.referer || ''} ${currentBooking.source || ''} ${currentBooking.apiSource || ''} ${currentBooking.apiReference || ''}`).toLowerCase();
      const isMainOta = ['booking.com', 'airbnb', 'expedia'].some(c => rawSource.includes(c));

      const siblingBeds24 = allB24.filter(r => {
        if (r.check_in !== currentBooking.arrival) return false;
        if (r.check_out !== currentBooking.departure) return false;

        const rChannel = (r.channel || '').toLowerCase();
        const rIsOta = ['booking.com', 'airbnb', 'expedia'].some(c => rChannel.includes(c));

        // No agrupar reservas de OTA con reservas directas ni entre sí de distinto nombre
        if (isMainOta !== rIsOta) return false;

        const rPhone = r.guest_phone || r.phone || r.mobile || '';
        const samePhone = phoneNum && rPhone && normalizePhoneStr(rPhone) === phoneNum && phoneNum.length >= 6;
        const sameName = mainName && r.guest_name && (r.guest_name.toLowerCase().includes(mainName) || mainName.includes(r.guest_name.toLowerCase()));

        return (isMainOta || rIsOta) ? !!sameName : !!(samePhone || sameName);
      });

      const groupList = siblingBeds24.length > 0 ? siblingBeds24 : [{
        roomId: String(currentBooking.roomId || ''),
        roomName: currentBooking.roomName || '',
        num_adult: Number(currentBooking.numAdult || 1),
        num_child: Number(currentBooking.numChild || 0),
        price: Number(currentBooking.price || 0)
      }];

      adjB24 = detectAndAdjustGroupGuests(groupList, capacitySettings || undefined);

      adjB24.members.forEach((b: any) => {
        const roomIdentifier = String(b.roomId || b.unitId || b.room_name || b.roomName || b.room || '');
        const rRules = getCapacityRules(roomIdentifier, capacitySettings || undefined);
        groupBase += rRules.base;
        groupMax += rRules.max;
        groupOriginalPrice += Number(b.price || b.price_estimate || 0);
        groupTotalPaid += Number(b.deposit || b.actual_paid || 0);
      });

      groupOriginalPax = adjB24.groupTotalAdults + adjB24.groupTotalChildren;

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

    // 3.1. Calcular el total de huéspedes del grupo considerando el nuevo valor de esta habitación
    let totalNewGroupGuests = totalNewGuests;
    if (currentBooking) {
      const currentB24Adj = (adjB24 && adjB24.members) ? adjB24.members.find((m: any) => String(m.id) === String(id)) : null;
      const oldAdjAdults = currentB24Adj && currentB24Adj.display_num_adult !== undefined ? currentB24Adj.display_num_adult : Number(currentBooking.numAdult || 1);
      const oldAdjChildren = currentB24Adj && currentB24Adj.display_num_child !== undefined ? currentB24Adj.display_num_child : Number(currentBooking.numChild || 0);

      const diffAdults = newAdults - oldAdjAdults;
      const diffChildren = newChildren - oldAdjChildren;

      totalNewGroupGuests = (groupOriginalPax + diffAdults + diffChildren);

      // Validar capacidad individual de la habitación
      const roomIdentifier = String(currentBooking.roomId || currentBooking.roomName || '');
      const currentRoomRules = getCapacityRules(roomIdentifier, capacitySettings || undefined);
      if (totalNewGuests > currentRoomRules.max) {
        return NextResponse.json({
          success: false,
          error: `La capacidad máxima de la habitación es de ${currentRoomRules.max} personas. Has seleccionado ${totalNewGuests}.`
        }, { status: 400 });
      }
    }

    if (totalNewGroupGuests > groupMax) {
      return NextResponse.json({ 
        success: false, 
        error: `La capacidad máxima del grupo es de ${groupMax} personas. Has seleccionado un total de ${totalNewGroupGuests} en el grupo.` 
      }, { status: 400 });
    }

    // 3.2. Calcular ajuste de precio
    const originalExtraGuests = Math.max(0, groupOriginalPax - groupBase);
    const newExtraGuests = Math.max(0, totalNewGroupGuests - groupBase);
    const diffExtra = newExtraGuests - originalExtraGuests;

    const extraGuestPrice = capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500;
    
    const arrivalDate = currentBooking.arrival ? new Date(currentBooking.arrival) : null;
    const departureDate = currentBooking.departure ? new Date(currentBooking.departure) : null;
    const nights = (arrivalDate && departureDate)
      ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 1;

    const priceAdjustment = Math.round(diffExtra * extraGuestPrice * nights);
    const bookingOriginalPrice = Number(currentBooking.price || 0);
    const newPrice = Math.round(bookingOriginalPrice + priceAdjustment);
    const groupNewPrice = Math.round(groupOriginalPrice + priceAdjustment);
    const newBalance = Math.max(0, groupNewPrice - groupTotalPaid);

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
    const charges = currentItems.filter((item: any) => item.type === 'charge');
    const invoiceItemsUpdate: any[] = [];

    let mainRoomCharge = charges.find((c: any) => 
      (c.description || '').includes('[ROOMNAME1]') || 
      (c.description || '').toLowerCase().includes('room charge')
    );
    const ivaCharge = charges.find((c: any) => 
      (c.description || '').toLowerCase().includes('iva')
    );
    const lodgingTaxCharge = charges.find((c: any) => 
      (c.description || '').toLowerCase().includes('hospedaje') || 
      (c.description || '').toLowerCase().includes('tax')
    );

    if (!mainRoomCharge) {
      mainRoomCharge = charges.find((c: any) => c !== ivaCharge && c !== lodgingTaxCharge);
    }

    // 1. Cargo principal de habitación
    if (mainRoomCharge) {
      invoiceItemsUpdate.push({
        id: mainRoomCharge.id,
        description: '[ROOMNAME1] | [FIRSTNIGHT] - [LEAVINGDAY]',
        qty: 1,
        amount: newPrice,
        vatRate: 19
      });
    } else {
      invoiceItemsUpdate.push({
        description: '[ROOMNAME1] | [FIRSTNIGHT] - [LEAVINGDAY]',
        qty: 1,
        amount: newPrice,
        vatRate: 19
      });
    }

    // 2. IVA 16% (Incluido en el precio)
    if (ivaCharge) {
      invoiceItemsUpdate.push({
        id: ivaCharge.id,
        description: 'IVA 16% (Incluido en el precio)',
        qty: 1,
        amount: 0,
        vatRate: 0
      });
    } else {
      invoiceItemsUpdate.push({
        description: 'IVA 16% (Incluido en el precio)',
        qty: 1,
        amount: 0,
        vatRate: 0
      });
    }

    // 3. Tax Hospedaje 3% (Incluido en el precio)
    if (lodgingTaxCharge) {
      invoiceItemsUpdate.push({
        id: lodgingTaxCharge.id,
        description: 'Tax Hospedaje 3% (Incluido en el precio)',
        qty: 1,
        amount: 0,
        vatRate: 0
      });
    } else {
      invoiceItemsUpdate.push({
        description: 'Tax Hospedaje 3% (Incluido en el precio)',
        qty: 1,
        amount: 0,
        vatRate: 0
      });
    }

    // 4. Cancelar / eliminar cualquier otro cargo extra duplicado
    const handledIds = new Set([
      mainRoomCharge?.id,
      ivaCharge?.id,
      lodgingTaxCharge?.id
    ].filter(Boolean));

    charges.forEach((c: any) => {
      if (!handledIds.has(c.id)) {
        invoiceItemsUpdate.push({
          id: c.id,
          description: "",
          qty: "",
          amount: "",
          status: ""
        });
      }
    });

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
      details: `Huésped modificó su número de personas en el portal a ${newAdults}A/${newChildren}N. Precio ajustado en Beds24 de $${groupOriginalPrice} a $${newPrice} MXN.`
    }]);

    // Sincronizar de inmediato la reserva modificada en Supabase (beds24_reservations)
    try {
      const freshRes = await fetch(`https://api.beds24.com/v2/bookings?id=${bookingId}&includeInvoiceItems=true`, {
        headers: { 'token': BEDS24_TOKEN }
      });
      if (freshRes.ok) {
        const freshJson = await freshRes.json();
        if (freshJson.success && freshJson.data && freshJson.data.length > 0) {
          const { syncBeds24BookingLocal } = await import('@/lib/beds24');
          await syncBeds24BookingLocal(freshJson.data[0]);
          console.log(`[Update Guests] ✅ Reserva ${bookingId} sincronizada con Supabase tras modificación de huéspedes.`);
        }
      }
    } catch (syncErr) {
      console.error("[Update Guests] Error al sincronizar reserva modificada con Supabase:", syncErr);
    }

    return NextResponse.json({
      success: true,
      price: groupNewPrice,
      balance: newBalance,
      num_adult: newAdults,
      num_child: newChildren
    });

  } catch (err: any) {
    console.error("Error en update-guests API:", err);
    return NextResponse.json({ success: false, error: err.message || 'Error interno' }, { status: 500 });
  }
}
