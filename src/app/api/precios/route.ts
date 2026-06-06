import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET - Obtener todas las reglas de precios dinámicos
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('pricing_rules')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('API Precios GET Error:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('API Precios GET Exception:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST - Crear o actualizar una regla de precio dinámico
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, room_type_id, rule_type, name, price, start_date, end_date } = body;

    if (!room_type_id || !rule_type || !name || price === undefined) {
      return NextResponse.json({
        success: false,
        error: 'Faltan parámetros requeridos: room_type_id, rule_type, name, price'
      }, { status: 400 });
    }

    if (!['base', 'seasonal', 'special'].includes(rule_type)) {
      return NextResponse.json({
        success: false,
        error: 'rule_type inválido. Debe ser base, seasonal o special'
      }, { status: 400 });
    }

    const payload: any = {
      room_type_id,
      rule_type,
      name,
      price: Number(price),
      start_date: start_date || null,
      end_date: end_date || null
    };

    if (id) {
      // Modificación
      const { data, error } = await supabase
        .from('pricing_rules')
        .update(payload)
        .eq('id', id)
        .select();

      if (error) {
        console.error('API Precios UPDATE Error:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data: data?.[0] });
    } else {
      // Inserción
      const { data, error } = await supabase
        .from('pricing_rules')
        .insert([payload])
        .select();

      if (error) {
        console.error('API Precios INSERT Error:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data: data?.[0] });
    }
  } catch (err: any) {
    console.error('API Precios POST Exception:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE - Eliminar una regla de precio dinámico
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Falta el parámetro id' }, { status: 400 });
    }

    const { error } = await supabase
      .from('pricing_rules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('API Precios DELETE Error:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('API Precios DELETE Exception:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
