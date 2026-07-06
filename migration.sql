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

-- Registrar la llave de recuperación maestra por defecto para administración en Supabase
INSERT INTO public.settings (key, value)
VALUES ('admin_recovery_key', 'JRJ-SEC-9X2P-7QLK-4M1Z')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ──────────────────────────────────────────────────────────────────────────────
-- INTEGRACIÓN DE PASARELA DE TRANSFERENCIA BANCARIA (CUSTOM GATEWAY)
-- ──────────────────────────────────────────────────────────────────────────────

-- Crear tabla para registro de comprobantes de transferencia
CREATE TABLE IF NOT EXISTS public.transfer_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    guest_name TEXT,
    guest_email TEXT,
    receipt_url TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.transfer_receipts ENABLE ROW LEVEL SECURITY;

-- Crear políticas de acceso público
DROP POLICY IF EXISTS "Allow public insert" ON public.transfer_receipts;
CREATE POLICY "Allow public insert" ON public.transfer_receipts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public select" ON public.transfer_receipts;
CREATE POLICY "Allow public select" ON public.transfer_receipts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public update" ON public.transfer_receipts;
CREATE POLICY "Allow public update" ON public.transfer_receipts FOR UPDATE USING (true) WITH CHECK (true);

-- Crear bucket de storage "transfer-receipts" si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('transfer-receipts', 'transfer-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Crear políticas para almacenamiento público de comprobantes
DROP POLICY IF EXISTS "Permitir subida pública de comprobantes" ON storage.objects;
CREATE POLICY "Permitir subida pública de comprobantes"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'transfer-receipts');

DROP POLICY IF EXISTS "Permitir lectura pública de comprobantes" ON storage.objects;
CREATE POLICY "Permitir lectura pública de comprobantes"
ON storage.objects
FOR SELECT
USING (bucket_id = 'transfer-receipts');


-- ──────────────────────────────────────────────────────────────────────────────
-- CONFIGURACIÓN DE PAGO POR RESERVACIÓN (PORTAL DEL HUÉSPED)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.booking_portal_settings (
    booking_id TEXT PRIMARY KEY,
    show_card_payment BOOLEAN DEFAULT true,
    transfer_account TEXT DEFAULT 'santander',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.booking_portal_settings ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso público
DROP POLICY IF EXISTS "Allow public select on booking_portal_settings" ON public.booking_portal_settings;
CREATE POLICY "Allow public select on booking_portal_settings" ON public.booking_portal_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on booking_portal_settings" ON public.booking_portal_settings;
CREATE POLICY "Allow public insert on booking_portal_settings" ON public.booking_portal_settings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on booking_portal_settings" ON public.booking_portal_settings;
CREATE POLICY "Allow public update on booking_portal_settings" ON public.booking_portal_settings FOR UPDATE USING (true) WITH CHECK (true);

-- Añadir columna de idioma en booking_portal_settings
ALTER TABLE public.booking_portal_settings 
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'es';
