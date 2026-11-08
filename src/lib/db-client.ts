import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de base de datos para el NAVEGADOR que pasa por la pasarela del servidor (/api/db) en vez de hablar con
 * Supabase directamente con la clave pública. Se usa igual que el cliente de siempre (`.from('tabla').select()...`),
 * así que las páginas casi no cambian: solo cambia cómo se crea el cliente.
 *
 * - La petición lleva la cookie de sesión (misma web) y una cabecera propia que la pasarela exige.
 * - No sirve para tiempo real (`.channel()`) ni para Storage: eso va aparte: el tiempo real de room_status (Staff y Recepción) usa su propio cliente con la clave pública y Storage va por rutas del servidor.
 * - La "clave" que se le pasa es un texto cualquiera: la pasarela la ignora y usa la suya, que nunca sale del servidor.
 */
export function createDbClient() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return createClient(`${origin}/api/db`, 'pasarela', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { 'x-jaroje-db': '1' },
      fetch: (input, init) => fetch(input, { ...init, credentials: 'same-origin', cache: 'no-store' }),
    },
  });
}
