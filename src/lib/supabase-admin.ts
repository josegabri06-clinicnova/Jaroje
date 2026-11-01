/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let adminClientInstance: SupabaseClient<any, any, any> | null = null;

/**
 * Obtiene la instancia singleton del cliente Supabase con Service Role Key.
 * Diseñado exclusivamente para uso en el servidor (API routes, server actions, webhooks).
 * Falla de forma explícita si SUPABASE_SERVICE_ROLE_KEY no está definida.
 */
export function getSupabaseAdmin(): SupabaseClient<any, any, any> {
  if (adminClientInstance) {
    return adminClientInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    
    const errMsg = `[Supabase Admin Error] Variables críticas de servidor no configuradas: ${missing.join(', ')}. No se permite degradar a ANON_KEY en el backend por motivos de seguridad.`;
    console.error(errMsg);
    throw new Error(errMsg);
  }

  adminClientInstance = createClient<any, any, any>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });

  return adminClientInstance;
}

/**
 * Proxy export para permitir el uso directo como `supabaseAdmin.from(...)`
 */
export const supabaseAdmin: SupabaseClient<any, any, any> = new Proxy({} as any, {
  get(_target, prop) {
    const client = getSupabaseAdmin();
    const val = (client as any)[prop];
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  },
});
