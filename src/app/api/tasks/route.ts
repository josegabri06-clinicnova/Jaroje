import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status    = searchParams.get('status');
  const direction = searchParams.get('direction');

  let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });

  if (status)    query = query.eq('status', status);
  if (direction) query = query.eq('direction', direction);

  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const result = data || [];
  const unread = result.filter(
    t => !t.read_by_admin && t.status !== 'resuelta' && t.direction === 'staff_to_admin'
  ).length;

  return NextResponse.json({ success: true, data: result, total: result.length, unread });
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === 'update_status') {
      const { data, error } = await supabase
        .from('tasks')
        .update({ 
          status: body.status,
          resolved_at: body.status === 'resuelta' ? new Date().toISOString() : null
        })
        .eq('id', body.id)
        .select()
        .single();
        
      if (error) throw error;
      return NextResponse.json({ success: true, task: data });
    }

    if (body.action === 'mark_read') {
      await supabase
        .from('tasks')
        .update({ read_by_admin: true })
        .eq('direction', 'staff_to_admin');
      return NextResponse.json({ success: true });
    }

    const newTask = {
      type:          body.type          || 'otro',
      room:          body.room          || 'General',
      description:   body.description   || '',
      status:        body.status        || 'nuevo',
      reported_by:   body.reported_by   || 'Staff',
      direction:     body.direction     || 'staff_to_admin',
      read_by_admin: body.direction === 'admin_to_staff',
      image_base64:  body.image_base64  || null,
      photo_url:     body.photo_url     || null,
    };

    const { data, error } = await supabase.from('tasks').insert([newTask]).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, task: data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const olderThanDays = searchParams.get('olderThanDays');
    
    if (id) {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (olderThanDays) {
      const days = parseInt(olderThanDays);
      if (isNaN(days)) {
        return NextResponse.json({ success: false, error: 'Parámetro olderThanDays inválido' }, { status: 400 });
      }
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('status', 'resuelta')
        .lt('created_at', cutoffDate.toISOString());
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    const body = await req.json().catch(() => ({}));
    if (body.ids && Array.isArray(body.ids)) {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .in('id', body.ids);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase.from('tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
