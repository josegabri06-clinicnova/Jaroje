-- Ejecuta este comando en el editor SQL de Supabase para añadir los nuevos campos necesarios para Recepción

ALTER TABLE reservas
ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS checked_out BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS dni_image TEXT;
