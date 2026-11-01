import { createClient } from '@supabase/supabase-js';

// Cliente de Supabase para el frontend (browser) y suscripciones en tiempo real.
// Utiliza exclusivamente la clave anónima pública sujeta a RLS.
// Para el backend (API routes, crons, webhooks), use siempre `supabaseAdmin` desde `@/lib/supabase-admin`.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
  },
});
