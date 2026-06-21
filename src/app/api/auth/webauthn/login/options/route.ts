import { NextResponse } from 'next/server';
// @ts-ignore
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const host = request.headers.get('host') || 'localhost';
    const rpID = host.split(':')[0];

    // Obtener las credenciales registradas para el rol admin
    const { data: existingKeys, error: dbError } = await supabase
      .from('user_passkeys')
      .select('credential_id')
      .eq('role', 'admin');

    if (dbError) {
      return NextResponse.json({ success: false, error: dbError.message }, { status: 500 });
    }

    if (!existingKeys || existingKeys.length === 0) {
      return NextResponse.json({ success: false, error: 'No hay dispositivos registrados para el Administrador. Ingrese primero usando el PIN y registre un dispositivo en Ajustes.' }, { status: 400 });
    }

    const allowCredentials = existingKeys.map(key => ({
      id: key.credential_id,
      type: 'public-key' as const,
    }));

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'preferred',
    });

    const response = NextResponse.json(options);

    // Guardar el challenge en una cookie HTTP-only segura válida por 5 minutos
    response.cookies.set('webauthn_authentication_challenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300, // 5 minutos
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Error generating authentication options:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
