-- 1. Añadir columnas a la tabla tasks
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS photo_url TEXT,
ADD COLUMN IF NOT EXISTS resolution_photo_url TEXT;

-- 2. Crear el bucket en Storage para las fotos de mantenimiento
INSERT INTO storage.buckets (id, name, public) 
VALUES ('maintenance_photos', 'maintenance_photos', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Crear políticas de seguridad para el bucket (Público para leer y subir)
-- Política para seleccionar/leer (Select)
CREATE POLICY "Maintenance Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'maintenance_photos');

-- Política para subir/insertar (Insert) - Permitimos a usuarios anónimos subir fotos
CREATE POLICY "Maintenance Public Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'maintenance_photos');

