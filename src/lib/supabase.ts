import { createClient } from '@supabase/supabase-js';

// Usamos las variables de entorno para conectar con Supabase.
// Para el backend, lo ideal es usar SUPABASE_SERVICE_ROLE_KEY si se requiere bypass de RLS,
// pero por defecto usamos ANON_KEY para el MVP.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);
