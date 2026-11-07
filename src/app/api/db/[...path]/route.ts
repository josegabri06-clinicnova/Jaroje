import { getSessionFromRequest } from '@/lib/session';
import { evaluateDbRequest } from '@/lib/db-gateway';

export const dynamic = 'force-dynamic';

/**
 * Pasarela de base de datos (ver src/lib/db-gateway.ts).
 *
 * Recibe las mismas peticiones que el cliente de Supabase enviaría al navegador (/rest/v1/<tabla>?...), exige la sesión,
 * pregunta al núcleo si ese rol puede hacer eso y, solo si es que sí, las reenvía a Supabase con la clave de servicio.
 *
 * APAGADA por defecto: sin la variable DB_GATEWAY_ENABLED=true responde 404 como si no existiera.
 */

const MAX_BODY_CHARS = 1_000_000;
const UPSTREAM_TIMEOUT_MS = 20_000;

const err = (status: number, message: string) =>
  Response.json({ message, code: 'DB_GATEWAY', details: null, hint: null }, { status, headers: { 'Cache-Control': 'no-store' } });

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  if (process.env.DB_GATEWAY_ENABLED !== 'true') return new Response(null, { status: 404 });

  // Defensa contra peticiones desde otras webs (CSRF): cabecera propia que otro sitio no puede añadir sin permiso de CORS
  // (esta ruta no envía cabeceras CORS) y, en cambios, el origen debe ser esta misma web.
  if (req.headers.get('x-jaroje-db') !== '1') return err(400, 'Petición no válida.');
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = req.headers.get('origin');
    if (origin) {
      let originHost = '';
      try { originHost = new URL(origin).host; } catch { /* origen ilegible: se rechaza abajo */ }
      if (!originHost || originHost !== req.headers.get('host')) return err(403, 'Origen no permitido.');
    }
  }

  const session = await getSessionFromRequest(req);
  if (!session) return err(401, 'Sesión requerida.');

  const { path: segments } = await ctx.params;
  const url = new URL(req.url);

  let bodyText: string | null = null;
  if (method !== 'GET' && method !== 'HEAD') {
    bodyText = await req.text();
    if (bodyText.length > MAX_BODY_CHARS) return err(413, 'Cuerpo demasiado grande.');
  }

  const decision = evaluateDbRequest({
    role: session.role,
    method,
    segments: segments ?? [],
    search: url.searchParams,
    accept: req.headers.get('accept'),
    prefer: req.headers.get('prefer'),
    bodyText,
  });

  if (!decision.ok) {
    // Sin datos personales: solo quién, qué y por qué
    console.warn(`[DB Gateway] Denegado: rol=${session.role} método=${method} ruta=${(segments ?? []).join('/').slice(0, 60)} motivo=${decision.reason}`);
    return err(decision.status, decision.reason);
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !serviceKey) {
    console.error('[DB Gateway] Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor.');
    return err(500, 'Servicio no disponible.');
  }

  try {
    const upstream = await fetch(`${base}/rest/v1/${decision.table}${decision.query ? `?${decision.query}` : ''}`, {
      method,
      headers: { ...decision.headers, apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: decision.body,
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    // Solo se devuelven las cabeceras que el cliente necesita; nada de lo que haya enviado Supabase más allá de eso
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    const contentType = upstream.headers.get('content-type');
    const contentRange = upstream.headers.get('content-range');
    if (contentType) headers.set('Content-Type', contentType);
    if (contentRange) headers.set('Content-Range', contentRange);

    const noBody = method === 'HEAD' || upstream.status === 204 || upstream.status === 205 || upstream.status === 304;
    return new Response(noBody ? null : await upstream.arrayBuffer(), { status: upstream.status, headers });
  } catch (e) {
    console.error('[DB Gateway] Error hablando con Supabase:', e instanceof Error ? e.name : 'desconocido');
    return err(504, 'La base de datos no ha respondido.');
  }
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
