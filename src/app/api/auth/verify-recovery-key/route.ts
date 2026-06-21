import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { recoveryKey } = await request.json();

    if (!recoveryKey) {
      return NextResponse.json({ success: false, error: 'Por favor, ingresa la Llave de Recuperación Maestra.' }, { status: 400 });
    }

    // Consultar la llave maestra registrada en settings
    const { data: dbKeyRow, error: dbKeyError } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'admin_recovery_key')
      .maybeSingle();

    if (dbKeyError) {
      return NextResponse.json({ success: false, error: `Error en base de datos: ${dbKeyError.message}` }, { status: 500 });
    }

    const expectedKey = dbKeyRow?.value || 'JRJ-SEC-9X2P-7QLK-4M1Z'; // Fallback por defecto si no se ha migrado

    if (recoveryKey.trim() !== expectedKey.trim()) {
      return NextResponse.json({ success: false, error: 'La Llave de Recuperación Maestra es incorrecta.' }, { status: 401 });
    }

    // Obtener el PIN administrador activo para sincronizar el estado del cliente
    const { data: adminPinRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'pin_admin')
      .maybeSingle();
    
    const adminPin = adminPinRow?.value || '1234';

    return NextResponse.json({
      success: true,
      role: 'admin',
      pin: adminPin
    });
  } catch (error: any) {
    console.error('Error verifying master recovery key:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
