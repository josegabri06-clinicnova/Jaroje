import { NextResponse } from 'next/server';
// @ts-ignore
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { registrationResponse, deviceName } = body;

    if (!registrationResponse || !deviceName) {
      return NextResponse.json({ success: false, error: 'Faltan parámetros obligatorios (registrationResponse, deviceName).' }, { status: 400 });
    }

    // Leer el challenge esperado de la cookie
    const expectedChallenge = request.headers.get('cookie')
      ?.split(';')
      .find(c => c.trim().startsWith('webauthn_registration_challenge='))
      ?.split('=')[1];

    if (!expectedChallenge) {
      return NextResponse.json({ success: false, error: 'El desafío de registro ha caducado o no existe. Por favor, reintente.' }, { status: 400 });
    }

    const host = request.headers.get('host') || 'localhost';
    const rpID = host.split(':')[0];
    
    // Determinar el origen dinámicamente
    const protocol = request.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
    const origin = `${protocol}://${host}`;

    const verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    const { verified, registrationInfo } = verification;

    if (!verified || !registrationInfo) {
      return NextResponse.json({ success: false, error: 'La verificación biométrica de registro falló.' }, { status: 400 });
    }

    const { credentialID, credentialPublicKey, counter } = registrationInfo;

    // Convertir Uint8Array a Base64 / Hex para almacenamiento en DB
    const publicKeyBase64 = Buffer.from(credentialPublicKey).toString('base64');
    const credentialIdStr = typeof credentialID === 'string'
      ? credentialID
      : Buffer.from(credentialID).toString('base64url');

    // Almacenar en la base de datos de Supabase
    const { error: dbError } = await supabase
      .from('user_passkeys')
      .insert({
        role: 'admin',
        credential_id: credentialIdStr,
        public_key: publicKeyBase64,
        counter: Number(counter),
        device_name: deviceName,
      });

    if (dbError) {
      console.error('Error guardando passkey en Supabase:', dbError);
      return NextResponse.json({ success: false, error: `Error en base de datos: ${dbError.message}` }, { status: 500 });
    }

    const response = NextResponse.json({ success: true });

    // Limpiar la cookie del challenge
    response.cookies.delete('webauthn_registration_challenge');

    return response;
  } catch (error: any) {
    console.error('Error verifying registration:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
