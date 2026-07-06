import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getBeds24Bookings } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { bookingId, type, description } = body;

    if (!bookingId || !type || !description) {
      return NextResponse.json({ success: false, error: 'Faltan parámetros obligatorios' }, { status: 400 });
    }

    const id = Number(bookingId);
    let roomName = 'General';
    let guestName = 'Huésped';

    // 1. Buscar en local_reservas de Supabase
    const { data: localRes } = await supabase
      .from('local_reservas')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (localRes) {
      const UNIT_TO_ROOM: Record<string, string> = {
        '1': '500', '2': '501', '3': '502', '4': '503',
        '5': '504', '6': '505', '7': '506', '8': '507'
      };
      const physicalName = localRes.unit_id ? (UNIT_TO_ROOM[localRes.unit_id] || localRes.unit_id) : '';
      roomName = physicalName ? `Habitación ${physicalName}` : 'Local';
      guestName = localRes.guest_name || 'Huésped';
    } else {
      // 2. Buscar en Beds24
      const allBeds24 = await getBeds24Bookings(true);
      const booking = allBeds24.find(r => r.id === id);
      if (booking) {
        roomName = booking.room_name || `Habitación ${booking.roomId}`;
        guestName = booking.guest_name || 'Huésped';
      }
    }

    // 3. Insertar tarea de mantenimiento en la tabla 'tasks'
    const newTask = {
      type: type || 'otro',
      room: roomName,
      description: description,
      status: 'nuevo',
      reported_by: `Huésped: ${guestName} (Reserva: ${bookingId})`,
      direction: 'staff_to_admin',
      read_by_admin: false,
      created_at: new Date().toISOString()
    };

    const { data: taskData, error: taskErr } = await supabase
      .from('tasks')
      .insert([newTask])
      .select()
      .single();

    if (taskErr) throw taskErr;

    // 4. Log en la tabla employee_logs para alertas en tiempo real
    const auditDetail = {
      text: `Nueva incidencia de mantenimiento reportada por el huésped ${guestName} en ${roomName}: ${description}`,
      mantenimiento: {
        taskId: taskData.id,
        room: roomName,
        description: description,
        status: 'nuevo',
        type: type,
        reported_by: `Huésped: ${guestName} (Reserva: ${bookingId})`
      }
    };

    await supabase.from('employee_logs').insert([{
      employee_num: '000',
      employee_name: `Huésped: ${guestName}`,
      department: 'mantenimiento',
      module: 'mantenimiento',
      action: 'report_maintenance',
      room: roomName,
      details: JSON.stringify(auditDetail),
      created_at: new Date().toISOString()
    }]);

    return NextResponse.json({ success: true, taskId: taskData.id });

  } catch (err: any) {
    console.error("Error en report-maintenance API:", err);
    return NextResponse.json({ success: false, error: err.message || 'Error interno' }, { status: 500 });
  }
}
