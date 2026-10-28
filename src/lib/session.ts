/**
 * Módulo de Sesión Segura HttpOnly con Web Crypto API (compatible con Edge Runtime y Node.js).
 * Firma y verifica tokens de sesión criptográficos con HMAC-SHA256 sin dependencias externas.
 */

export interface SessionPayload {
  role: 'admin' | 'recepcion' | 'staff_limpieza' | 'staff_mantenimiento';
  exp: number; // Unix timestamp en segundos
  iat: number; // Unix timestamp en segundos
}

export const SESSION_COOKIE_NAME = 'jaroje_session';
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 días

function getSecretKey(): string {
  const secret = process.env.SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    throw new Error('[Security Exception] Ni SESSION_SECRET ni SUPABASE_SERVICE_ROLE_KEY están configurados en el servidor. Fallando por seguridad.');
  }
  return secret;
}

// Codificación base64url segura
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function getCryptoKey(): Promise<CryptoKey> {
  const secret = getSecretKey();
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Crea un token firmado criptográficamente para un rol dado.
 */
export async function createSessionToken(role: SessionPayload['role']): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    role,
    iat: now,
    exp: now + SESSION_DURATION_SECONDS,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const key = await getCryptoKey();
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(dataToSign)
  );

  let binarySig = '';
  const sigBytes = new Uint8Array(signatureBuffer);
  for (let i = 0; i < sigBytes.byteLength; i++) {
    binarySig += String.fromCharCode(sigBytes[i]);
  }
  const encodedSignature = btoa(binarySig)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${dataToSign}.${encodedSignature}`;
}

/**
 * Verifica la firma criptográfica y la expiración de un token de sesión.
 * Devuelve el payload si es válido o null si fue alterado o expiró.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const dataToVerify = `${encodedHeader}.${encodedPayload}`;

    // Decodificar firma
    let base64Sig = encodedSignature.replace(/-/g, '+').replace(/_/g, '/');
    while (base64Sig.length % 4) {
      base64Sig += '=';
    }
    const binarySig = atob(base64Sig);
    const sigBytes = new Uint8Array(binarySig.length);
    for (let i = 0; i < binarySig.length; i++) {
      sigBytes[i] = binarySig.charCodeAt(i);
    }

    const key = await getCryptoKey();
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(dataToVerify)
    );

    if (!isValid) {
      return null;
    }

    const payload: SessionPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return null; // Expirado
    }

    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Extrae la cookie jaroje_session de una Request y verifica su validez.
 */
export async function getSessionFromRequest(req: Request): Promise<SessionPayload | null> {
  try {
    const cookieHeader = req.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
    );
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) return null;
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

/**
 * Compara dos cadenas de forma segura en tiempo constante usando Web Crypto API.
 */
export async function timingSafeEqualString(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const hashA = await crypto.subtle.digest('SHA-256', enc.encode(a));
  const hashB = await crypto.subtle.digest('SHA-256', enc.encode(b));
  const bufA = new Uint8Array(hashA);
  const bufB = new Uint8Array(hashB);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

/**
 * Valida si una petición tiene autorización para exportar datos.
 * Acepta:
 * 1. Sesión activa en cookie con rol permitido (ej. 'admin' o 'recepcion')
 * 2. Token de exportación o PIN de admin en query string (?token=...) o header Authorization: Bearer
 */
export async function authorizeExportRequest(
  req: Request,
  allowedRoles: Array<SessionPayload['role']> = ['admin', 'recepcion']
): Promise<{ authorized: boolean; role?: SessionPayload['role']; reason?: string }> {
  // 1. Verificar sesión por cookie
  const session = await getSessionFromRequest(req);
  if (session && allowedRoles.includes(session.role)) {
    return { authorized: true, role: session.role };
  }

  // 2. Si no hay cookie de sesión, verificar exclusivamente token de exportación dedicado
  const url = new URL(req.url);
  const authHeader = req.headers.get('authorization') || '';
  const providedToken = (
    url.searchParams.get('token') ||
    req.headers.get('x-export-token') ||
    authHeader.replace(/^bearer\s+/i, '').trim()
  )?.trim();

  const exportSecret = process.env.EXPORT_TOKEN?.trim();
  if (providedToken && exportSecret) {
    if (await timingSafeEqualString(providedToken, exportSecret)) {
      return { authorized: true, role: 'admin' };
    }
  }

  return { authorized: false, reason: session ? 'Rol insuficiente' : 'No autenticado' };
}
