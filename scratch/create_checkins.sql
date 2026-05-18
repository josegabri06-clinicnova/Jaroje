-- Ejecuta este comando en el editor SQL de Supabase
-- Esto creará una tabla para guardar la información de recepción de las reservas de Beds24

CREATE TABLE IF NOT EXISTS checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id TEXT NOT NULL UNIQUE,
    guest_name TEXT,
    room_name TEXT,
    checked_in BOOLEAN DEFAULT false,
    checked_out BOOLEAN DEFAULT false,
    dni_image TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS (opcional pero recomendado si usas políticas)
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;

-- Crear una política para que todos puedan leer y escribir (solo para MVP, ajusta en producción)
CREATE POLICY "Permitir todo en checkins" ON checkins
    FOR ALL
    USING (true)
    WITH CHECK (true);
