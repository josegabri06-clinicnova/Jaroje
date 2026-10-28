import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ success: false, error: 'Falta el ID del dispositivo a eliminar.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('user_passkeys')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting passkey:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
