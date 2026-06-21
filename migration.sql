-- Script para crear la tabla de almacenamiento de credenciales biométricas (Passkeys)

CREATE TABLE IF NOT EXISTS public.user_passkeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL, -- en este caso 'admin'
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter BIGINT DEFAULT 0,
    device_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

-- Crear políticas básicas para permitir lectura pública de credenciales (requerido para WebAuthn)
-- e inserción controlada o bypass desde backend API routes (service role).
CREATE POLICY "Permitir lectura de credenciales de seguridad" 
ON public.user_passkeys
FOR SELECT 
USING (true);
