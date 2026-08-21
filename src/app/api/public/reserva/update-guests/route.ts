import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getBeds24Bookings, getBeds24Token, getCapacityRules, detectAndAdjustGroupGuests, clearBeds24Cache } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    clearBeds24Cache();
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ success: false, error: 'Request body required' }, { status: 400 });

    const bookingId = body.bookingId;
    let rooms = body.rooms;

    if (!bookingId) {
      return NextResponse.json({ success: false, error: 'Faltan parámetros obligatorios' }, { status: 400 });
    }

    const normalizePhoneStr = (p?: string) => (p || '').replace(/\D/g, '');

    if (!rooms || !Array.isArray(rooms)) {
      if (body.numAdult === undefined || body.numChild === undefined) {
        return NextResponse.json({ success: false, error: 'Faltan parámetros obligatorios' }, { status: 400 });
      }
      rooms = [{
        bookingId: body.bookingId,
        numAdult: Number(body.numAdult),
        numChild: Number(body.numChild)
      }];
    }

    const id = Number(bookingId);

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

        if (siblings) {
          siblingLocal = siblings.filter(r => {
            const rPhone = (r.phone || '').trim();
            const samePhone = mainPhone && rPhone && normalizePhoneStr(rPhone) === normalizePhoneStr(mainPhone);
            const sameName = mainName && r.guest_name && cleanStr(r.guest_name).includes(mainName);
            return samePhone || sameName;
          });
        }
      } catch (err) {
        console.error("Error al buscar hermanos locales en update-guests:", err);
      }

      const UNIT_TO_ROOM: Record<string, string> = {
        '685542-1': '500', '685542-2': '501', '685542-3': '502', '685542-4': '503',
        '685542-5': '504', '685542-6': '505', '685542-7': '506', '685542-8': '507'
      };

      const localResMapped = {
        id: localRes.id,
        roomId: '685542',
        unitId: localRes.unit_id || '',
        num_adult: Number(localRes.num_adult || 1),
        num_child: Number(localRes.num_child || 0),
        price: Number(localRes.price || 0),
        deposit: Number(localRes.deposit || 0),
        room: localRes.unit_id ? (UNIT_TO_ROOM[localRes.unit_id] || localRes.unit_id) : ''
      };

      const siblingLocalMapped = siblingLocal.map(s => ({
        id: s.id,
        roomId: '685542',
        unitId: s.unit_id || '',
        num_adult: Number(s.num_adult || 1),
        num_child: Number(s.num_child || 0),
        price: Number(s.price || 0),
        deposit: Number(s.deposit || 0),
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

      const groupOriginalPax = adjLocal.groupTotalAdults + adjLocal.groupTotalChildren;

      // 2.1. Calcular el total de huéspedes del grupo considerando los nuevos valores
      let totalNewGroupAdults = 0;
      let totalNewGroupChildren = 0;
      let hasValidationError = false;
      let validationErrorMsg = '';

      adjLocal.members.forEach((b: any) => {
        const update = rooms.find((r: any) => String(r.bookingId) === String(b.id));
        const rRules = getCapacityRules(b.room || '', capacitySettings || undefined);
        
        let mAdults = b.display_num_adult !== undefined ? b.display_num_adult : Number(b.num_adult || 1);
        let mChildren = b.display_num_child !== undefined ? b.display_num_child : Number(b.num_child || 0);

        if (update) {
          mAdults = Number(update.numAdult);
          mChildren = Number(update.numChild);
          const totalRoomNew = mAdults + mChildren;
          if (totalRoomNew > rRules.max) {
            hasValidationError = true;
            validationErrorMsg = `La capacidad máxima de la habitación ${b.room || ''} es de ${rRules.max} personas. Has seleccionado ${totalRoomNew}.`;
          }
        }

        totalNewGroupAdults += mAdults;
        totalNewGroupChildren += mChildren;
      });

      if (hasValidationError) {
        return NextResponse.json({ success: false, error: validationErrorMsg }, { status: 400 });
      }

      const totalNewGroupGuests = totalNewGroupAdults + totalNewGroupChildren;

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

      const isUSD = (localRes.guest_name || '').toUpperCase().includes('(US DOLLARS)');
      const extraGuestPrice = isUSD ? 25 : (capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500);
      
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
      for (const r of rooms) {
        const isMain = String(r.bookingId) === String(id);
        const { error: dbErr } = await supabase
          .from('local_reservas')
          .update({
            num_adult: Number(r.numAdult),
            num_child: Number(r.numChild),
            ...(isMain ? { price: newPrice, balance: newBalance } : {})
          })
          .eq('id', r.bookingId);

        if (dbErr) {
          throw new Error(`Error al actualizar habitación ${r.bookingId} en BD local: ${dbErr.message}`);
        }
      }

      if (priceAdjustment !== 0 && !rooms.some((r: any) => String(r.bookingId) === String(id))) {
        const { error: dbErr } = await supabase
          .from('local_reservas')
          .update({
            price: newPrice,
            balance: newBalance
          })
          .eq('id', id);
        if (dbErr) throw dbErr;
      }

      // Log de auditoría
      const logDetails = rooms.map((r: any) => `Hab. ${r.bookingId}: ${r.numAdult}A/${r.numChild}N`).join(', ');
      await supabase.from('employee_logs').insert([{
        employee_num: '000',
        employee_name: `Huésped: ${localRes.guest_name}`,
        department: 'recepcion',
        module: 'portal_publico',
        action: 'huespedes_modificados',
        room: localRes.unit_id || 'Local',
        details: `Huésped modificó personas en el portal local: ${logDetails}. Precio de grupo ajustado de $${groupOriginalPrice} a $${groupNewPrice} MXN.`
      }]);

      const mainRoomUpdate = rooms.find((r: any) => String(r.bookingId) === String(id));
      const mainNewAdults = mainRoomUpdate ? Number(mainRoomUpdate.numAdult) : Number(localRes.num_adult || 1);
      const mainNewChildren = mainRoomUpdate ? Number(mainRoomUpdate.numChild) : Number(localRes.num_child || 0);

      return NextResponse.json({
        success: true,
        price: groupNewPrice,
        balance: newBalance,
        num_adult: mainNewAdults,
        num_child: mainNewChildren
      });
    }

    // 3. Si no es local, es de Beds24
    const BEDS24_TOKEN = await getBeds24Token();
    let currentBooking: any = null;
    
    // Obtener detalles actuales de la reserva desde Beds24 (bypassing Next.js fetch cache)
    const getRes = await fetch(`https://api.beds24.com/v2/bookings?id[]=${id}&includeInvoiceItems=true`, {
      headers: { 'token': BEDS24_TOKEN },
      cache: 'no-store'
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
      const allB24 = await getBeds24Bookings(true, false, true);
      const mainPhone = currentBooking.phone || currentBooking.mobile || '';
      const phoneNum = mainPhone ? normalizePhoneStr(mainPhone) : '';
      const mainName = `${currentBooking.firstName || ''} ${currentBooking.lastName || ''}`.toLowerCase().trim().replace(/\s+/g, ' ');

      const rawSource = String(`${currentBooking.referer || ''} ${currentBooking.source || ''} ${currentBooking.apiSource || ''} ${currentBooking.apiReference || ''}`).toLowerCase();
      const isMainOta = ['booking.com', 'airbnb', 'expedia'].some(c => rawSource.includes(c));

      const mainBookingMapped = {
        id: String(currentBooking.id),
        roomId: String(currentBooking.roomId || ''),
        roomName: currentBooking.roomName || '',
        num_adult: Number(currentBooking.numAdult || 1),
        num_child: Number(currentBooking.numChild || 0),
        price: Number(currentBooking.price || 0),
        deposit: Number(currentBooking.deposit || 0),
        channel: currentBooking.channel || 'direct'
      };

      const siblingBeds24 = allB24.filter(r => {
        if (String(r.id) === String(id)) return false; // Excluir la principal de los hermanos para evitar duplicación
        if (r.check_in !== currentBooking.arrival) return false;
        if (r.check_out !== currentBooking.departure) return false;

        const rChannel = (r.channel || '').toLowerCase();
        const rIsOta = ['booking.com', 'airbnb', 'expedia'].some(c => rChannel.includes(c));

        if (isMainOta !== rIsOta) return false;

        const rPhone = r.guest_phone || r.phone || r.mobile || '';
        const samePhone = phoneNum && rPhone && normalizePhoneStr(rPhone) === phoneNum && phoneNum.length >= 6;
        const sameName = mainName && r.guest_name && (r.guest_name.toLowerCase().includes(mainName) || mainName.includes(r.guest_name.toLowerCase()));

        return (isMainOta || rIsOta) ? !!sameName : !!(samePhone || sameName);
      });

      const groupList = [mainBookingMapped, ...siblingBeds24];

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

    // 3.1. Calcular el total de huéspedes del grupo considerando los nuevos valores
    let totalNewGroupAdults = 0;
    let totalNewGroupChildren = 0;
    let hasValidationError = false;
    let validationErrorMsg = '';

    if (currentBooking && adjB24 && adjB24.members) {
      adjB24.members.forEach((b: any) => {
        const update = rooms.find((r: any) => String(r.bookingId) === String(b.id));
        const roomIdentifier = String(b.roomId || b.unitId || b.room_name || b.roomName || b.room || '');
        const rRules = getCapacityRules(roomIdentifier, capacitySettings || undefined);

        let mAdults = b.display_num_adult !== undefined ? b.display_num_adult : Number(b.num_adult || 1);
        let mChildren = b.display_num_child !== undefined ? b.display_num_child : Number(b.num_child || 0);

        if (update) {
          mAdults = Number(update.numAdult);
          mChildren = Number(update.numChild);
          const totalRoomNew = mAdults + mChildren;
          if (totalRoomNew > rRules.max) {
            hasValidationError = true;
            validationErrorMsg = `La capacidad máxima de la habitación es de ${rRules.max} personas. Has seleccionado ${totalRoomNew}.`;
          }
        }

        totalNewGroupAdults += mAdults;
        totalNewGroupChildren += mChildren;
      });
    } else {
      const mainUpdate = rooms.find((r: any) => String(r.bookingId) === String(id));
      const mAdults = mainUpdate ? Number(mainUpdate.numAdult) : Number(currentBooking.numAdult || 1);
      const mChildren = mainUpdate ? Number(mainUpdate.numChild) : Number(currentBooking.numChild || 0);
      const totalRoomNew = mAdults + mChildren;
      const roomIdentifier = String(currentBooking.roomId || currentBooking.roomName || '');
      const rRules = getCapacityRules(roomIdentifier, capacitySettings || undefined);

      if (totalRoomNew > rRules.max) {
        hasValidationError = true;
        validationErrorMsg = `La capacidad máxima de la habitación es de ${rRules.max} personas. Has seleccionado ${totalRoomNew}.`;
      }

      totalNewGroupAdults = mAdults;
      totalNewGroupChildren = mChildren;
    }

    if (hasValidationError) {
      return NextResponse.json({ success: false, error: validationErrorMsg }, { status: 400 });
    }

    const totalNewGroupGuests = totalNewGroupAdults + totalNewGroupChildren;

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

    const isUSD = `${currentBooking.firstName || ''} ${currentBooking.lastName || ''}`.toUpperCase().includes('(US DOLLARS)');
    const extraGuestPrice = isUSD ? 25 : (capacitySettings?.extra_guest_price !== undefined ? Number(capacitySettings.extra_guest_price) : 500);
    
    const arrivalDate = currentBooking.arrival ? new Date(currentBooking.arrival) : null;
    const departureDate = currentBooking.departure ? new Date(currentBooking.departure) : null;
    const nights = (arrivalDate && departureDate)
      ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 1;

    const priceAdjustment = Math.round(diffExtra * extraGuestPrice * nights);
    const bookingOriginalPrice = Number(currentBooking.price || 0);
    const newPrice = Math.max(0, Math.round(bookingOriginalPrice + priceAdjustment));
    const groupNewPrice = Math.max(0, Math.round(groupOriginalPrice + priceAdjustment));
    const newBalance = Math.max(0, groupNewPrice - groupTotalPaid);

    // Actualizar los ítems de factura de la habitación principal
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

    // 3.3. Preparar la lista de actualizaciones para Beds24
    const updatedIds = new Set(rooms.map((r: any) => String(r.bookingId)));
    const beds24Updates = rooms.map((r: any) => {
      const payload: any = {
        id: String(r.bookingId),
        numAdult: r.numAdult,
        numChild: r.numChild
      };

      if (String(r.bookingId) === String(id)) {
        payload.price = newPrice;
        payload.invoiceItems = invoiceItemsUpdate;
      }

      return payload;
    });

    if (priceAdjustment !== 0 && !updatedIds.has(String(id))) {
      beds24Updates.push({
        id: String(id),
        numAdult: Number(currentBooking.numAdult || 1),
        numChild: Number(currentBooking.numChild || 0),
        price: newPrice,
        invoiceItems: invoiceItemsUpdate
      });
    }

    const beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(beds24Updates)
    });

    if (!beds24Response.ok) {
      const errText = await beds24Response.text();
      throw new Error(`Beds24 rechazó la modificación: ${errText}`);
    }

    // Log de auditoría
    const guestFullName = `${currentBooking.firstName || ''} ${currentBooking.lastName || ''}`.trim() || 'Huésped';
    const logDetailsB24 = rooms.map((r: any) => `Hab. ${r.bookingId}: ${r.numAdult}A/${r.numChild}N`).join(', ');
    await supabase.from('employee_logs').insert([{
      employee_num: '000',
      employee_name: `Huésped: ${guestFullName}`,
      department: 'recepcion',
      module: 'portal_publico',
      action: 'huespedes_modificados',
      room: currentBooking.roomName || 'Beds24',
      details: `Huésped modificó personas en el portal: ${logDetailsB24}. Precio de grupo ajustado de $${groupOriginalPrice} a $${groupNewPrice} MXN.`
    }]);

    // Sincronizar de inmediato las reservas modificadas en Supabase (beds24_reservations)
    try {
      const idsToSync = Array.from(new Set([String(id), ...rooms.map((r: any) => String(r.bookingId))]));
      const { syncBeds24BookingLocal } = await import('@/lib/beds24');
      for (const syncId of idsToSync) {
        const freshRes = await fetch(`https://api.beds24.com/v2/bookings?id=${syncId}&includeInvoiceItems=true`, {
          headers: { 'token': BEDS24_TOKEN },
          cache: 'no-store'
        });
        if (freshRes.ok) {
          const freshJson = await freshRes.json();
          if (freshJson.success && freshJson.data && freshJson.data.length > 0) {
            await syncBeds24BookingLocal(freshJson.data[0]);
          }
        }
      }
      console.log(`[Update Guests] ✅ Reservas ${idsToSync.join(', ')} sincronizadas con Supabase tras modificación.`);
    } catch (syncErr) {
      console.error("[Update Guests] Error al sincronizar reservas modificadas con Supabase:", syncErr);
    }

    const mainRoomUpdate = rooms.find((r: any) => String(r.bookingId) === String(id));
    const mainNewAdults = mainRoomUpdate ? Number(mainRoomUpdate.numAdult) : Number(currentBooking.numAdult || 1);
    const mainNewChildren = mainRoomUpdate ? Number(mainRoomUpdate.numChild) : Number(currentBooking.numChild || 0);

    return NextResponse.json({
      success: true,
      price: groupNewPrice,
      balance: newBalance,
      num_adult: mainNewAdults,
      num_child: mainNewChildren
    });

  } catch (err: any) {
    console.error("Error en update-guests API:", err);
    return NextResponse.json({ success: false, error: err.message || 'Error interno' }, { status: 500 });
  }
}
