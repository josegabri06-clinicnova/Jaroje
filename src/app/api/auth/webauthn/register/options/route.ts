import { NextResponse } from 'next/server';
// @ts-ignore
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const host = request.headers.get('host') || 'localhost';
    const rpID = host.split(':')[0];

    // Obtener las credenciales existentes para el administrador para evitar registros duplicados
    const { data: existingKeys, error: dbError } = await supabase
      .from('user_passkeys')
      .select('credential_id')
      .eq('role', 'admin');

    if (dbError) {
      return NextResponse.json({ success: false, error: dbError.message }, { status: 500 });
    }

    const excludeCredentials = existingKeys?.map(key => ({
      id: key.credential_id,
      type: 'public-key' as const,
    })) || [];

    const options = await generateRegistrationOptions({
      rpName: 'Jaroje Condominios',
      rpID,
      userID: 'admin-role-id-999', // Identificador de usuario constante para el rol único admin
      userName: 'admin@jaroje.com',
      userDisplayName: 'Administrador Jaroje',
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
      excludeCredentials,
    });

    const response = NextResponse.json(options);

    // Guardar el challenge en una cookie HTTP-only segura válida por 5 minutos
    response.cookies.set('webauthn_registration_challenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300, // 5 minutos
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Error generating registration options:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
