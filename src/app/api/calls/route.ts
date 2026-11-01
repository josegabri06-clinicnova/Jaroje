import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizePhone } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);

    let query = supabase
      .from('conmutador_calls')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && status !== 'todas') {
      query = query.eq('status', status);
    }

    if (search) {
      const s = search.trim();
      query = query.or(`phone.ilike.%${s}%,caller_name.ilike.%${s}%,notes.ilike.%${s}%`);
    }

    const { data: calls, error } = await query;
    if (error) throw error;

    // Métricas rápidas de hoy
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: todayCalls } = await supabase
      .from('conmutador_calls')
      .select('id, status, created_at')
      .gte('created_at', startOfDay.toISOString());

    const totalToday = todayCalls?.length || 0;
    const nuevasToday = todayCalls?.filter(c => c.status === 'nueva')?.length || 0;
    const plantillasToday = todayCalls?.filter(c => c.status === 'plantilla_enviada')?.length || 0;

    return NextResponse.json({
      success: true,
      data: calls || [],
      metrics: {
        totalToday,
        nuevasToday,
        plantillasToday,
      }
    });
  } catch (err: any) {
    console.error("Error en GET /api/calls:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, caller_name, notes, registered_by } = body;

    if (!phone) {
      return NextResponse.json({ success: false, error: 'El número telefónico es obligatorio' }, { status: 400 });
    }

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      return NextResponse.json({ success: false, error: 'Formato telefónico inválido' }, { status: 400 });
    }

    let resolvedName = caller_name ? caller_name.trim() : '';

    // Si no se proporcionó nombre, buscar en reservas o conversaciones
    if (!resolvedName) {
      try {
        const { data: localGuest } = await supabase
          .from('local_reservas')
          .select('guest_name')
          .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${cleanPhone.slice(-10)}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (localGuest?.guest_name) {
          resolvedName = localGuest.guest_name;
        } else {
          const { data: convGuest } = await supabase
            .from('conversations')
            .select('guest_name')
            .eq('guest_phone', cleanPhone)
            .maybeSingle();
          if (convGuest?.guest_name && convGuest.guest_name !== cleanPhone) {
            resolvedName = convGuest.guest_name;
          }
        }
      } catch (e) {
        console.warn("Error buscando nombre de huésped en POST manual:", e);
      }
    }

    const newRecord = {
      phone: cleanPhone,
      caller_name: resolvedName || null,
      status: 'nueva',
      notes: notes?.trim() || null,
      attended_by: registered_by || 'Recepción',
      raw_data: { manual: true, registered_by: registered_by || 'Recepción' },
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('conmutador_calls')
      .insert([newRecord])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("Error en POST /api/calls:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, status, notes, caller_name, template_sent, attended_by } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Falta ID de la llamada' }, { status: 400 });
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (status !== undefined) updatePayload.status = status;
    if (notes !== undefined) updatePayload.notes = notes;
    if (caller_name !== undefined) updatePayload.caller_name = caller_name;
    if (attended_by !== undefined) {
      updatePayload.attended_by = attended_by;
      updatePayload.attended_at = new Date().toISOString();
    }
    if (template_sent !== undefined) {
      updatePayload.template_sent = template_sent;
      updatePayload.template_sent_at = new Date().toISOString();
      updatePayload.status = 'plantilla_enviada';
    }

    const { data, error } = await supabase
      .from('conmutador_calls')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("Error en PATCH /api/calls:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Falta ID de la llamada' }, { status: 400 });
    }

    const { error } = await supabase
      .from('conmutador_calls')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error en DELETE /api/calls:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
