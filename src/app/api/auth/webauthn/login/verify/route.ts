import { NextResponse } from 'next/server';
// @ts-ignore
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { authenticationResponse } = body;

    if (!authenticationResponse) {
      return NextResponse.json({ success: false, error: 'Falta el parámetro obligatorio authenticationResponse.' }, { status: 400 });
    }

    // Leer el challenge esperado de la cookie
    const expectedChallenge = request.headers.get('cookie')
      ?.split(';')
      .find(c => c.trim().startsWith('webauthn_authentication_challenge='))
      ?.split('=')[1];

    if (!expectedChallenge) {
      return NextResponse.json({ success: false, error: 'El desafío de login ha caducado o no existe. Por favor, reintente.' }, { status: 400 });
    }

    const host = request.headers.get('host') || 'localhost';
    const rpID = host.split(':')[0];

    // Determinar el origen dinámicamente
    const protocol = request.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
    const origin = `${protocol}://${host}`;

    // Buscar la credencial en la base de datos
    const credentialId = authenticationResponse.id;
    const { data: key, error: dbError } = await supabase
      .from('user_passkeys')
      .select('*')
      .eq('credential_id', credentialId)
      .maybeSingle();

    if (dbError || !key) {
      return NextResponse.json({ success: false, error: 'Dispositivo no reconocido o no registrado en el sistema.' }, { status: 400 });
    }

    // Convertir de Base64 / Base64url de vuelta a Uint8Array
    const credentialPublicKey = new Uint8Array(Buffer.from(key.public_key, 'base64'));

    const verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: Buffer.from(key.credential_id, 'base64url'),
        credentialPublicKey,
        counter: Number(key.counter),
      },
    });

    const { verified, authenticationInfo } = verification;

    if (!verified || !authenticationInfo) {
      return NextResponse.json({ success: false, error: 'La firma biométrica es inválida.' }, { status: 400 });
    }

    // Actualizar el contador de la credencial en Supabase para mitigar ataques de replay
    await supabase
      .from('user_passkeys')
      .update({ counter: Number(authenticationInfo.newCounter) })
      .eq('credential_id', credentialId);

    // Obtener el PIN administrador de respaldo para la sesión del frontend
    const { data: adminPinRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'pin_admin')
      .maybeSingle();
    
    const adminPin = adminPinRow?.value || '1234';

    const response = NextResponse.json({
      success: true,
      role: 'admin',
      pin: adminPin
    });

    // Limpiar la cookie del challenge
    response.cookies.delete('webauthn_authentication_challenge');

    return response;
  } catch (error: any) {
    console.error('Error verifying authentication:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
