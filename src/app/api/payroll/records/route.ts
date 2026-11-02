import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionFromRequest } from '@/lib/session';

export const dynamic = 'force-dynamic';

const PAYROLL_TYPES = ['nomina', 'anticipo', 'bono'];

async function isAdmin(req: Request) {
  const session = await getSessionFromRequest(req);
  return session?.role === 'admin';
}

const forbidden = () =>
  NextResponse.json({ success: false, error: 'Se requieren privilegios de administrador.' }, { status: 403 });

// Registros de nómina: solo se leen y se modifican desde el servidor, con sesión de administrador.
// La pantalla de Equipo ya no accede a la tabla `payroll` directamente con la clave pública.
export async function GET(req: Request) {
  if (!(await isAdmin(req))) return forbidden();
  const { data, error } = await supabaseAdmin
    .from('payroll')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[payroll/records] Error leyendo nóminas:', error.message);
    return NextResponse.json({ success: false, error: 'No se pudieron leer las nóminas.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, records: data || [] });
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) return forbidden();
  const body = await req.json().catch(() => ({}));

  const amount = Number(body?.amount);
  if (
    typeof body?.employee_name !== 'string' || !body.employee_name.trim() ||
    typeof body?.employee_phone !== 'string' || !body.employee_phone.trim() ||
    !Number.isFinite(amount) || amount <= 0 ||
    !PAYROLL_TYPES.includes(body?.type)
  ) {
    return NextResponse.json({ success: false, error: 'Datos de nómina inválidos.' }, { status: 400 });
  }

  const record = {
    employee_name: body.employee_name.trim(),
    employee_phone: body.employee_phone.trim(),
    amount,
    type: body.type,
    period: typeof body.period === 'string' ? body.period : '',
    notes: typeof body.notes === 'string' ? body.notes : '',
    document_url: typeof body.document_url === 'string' && body.document_url ? body.document_url : null,
    whatsapp_sent: false,
  };

  const { data, error } = await supabaseAdmin.from('payroll').insert([record]).select().single();
  if (error) {
    console.error('[payroll/records] Error guardando nómina:', error.message);
    return NextResponse.json({ success: false, error: 'No se pudo guardar la nómina.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, record: data });
}

// Solo se pueden marcar los avisos enviados; el resto del registro no se modifica
export async function PATCH(req: Request) {
  if (!(await isAdmin(req))) return forbidden();
  const body = await req.json().catch(() => ({}));
  if (typeof body?.id !== 'string' || !body.id) {
    return NextResponse.json({ success: false, error: 'Falta el identificador.' }, { status: 400 });
  }

  const flags: Record<string, boolean> = {};
  if (typeof body.whatsapp_sent === 'boolean') flags.whatsapp_sent = body.whatsapp_sent;
  if (typeof body.comprobante_sent === 'boolean') flags.comprobante_sent = body.comprobante_sent;
  if (Object.keys(flags).length === 0) {
    return NextResponse.json({ success: false, error: 'Nada que actualizar.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('payroll').update(flags).eq('id', body.id);
  if (error) {
    console.error('[payroll/records] Error actualizando nómina:', error.message);
    return NextResponse.json({ success: false, error: 'No se pudo actualizar la nómina.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin(req))) return forbidden();
  const body = await req.json().catch(() => ({}));
  if (typeof body?.id !== 'string' || !body.id) {
    return NextResponse.json({ success: false, error: 'Falta el identificador.' }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from('payroll').delete().eq('id', body.id);
  if (error) {
    console.error('[payroll/records] Error eliminando nómina:', error.message);
    return NextResponse.json({ success: false, error: 'No se pudo eliminar la nómina.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
