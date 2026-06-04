-- Crear el bucket 'dni_images' para almacenar las fotos de pasaportes/DNI de manera optimizada
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dni_images', 
  'dni_images', 
  true, 
  5242880, -- 5MB limit
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Crear política para permitir que cualquiera pueda ver las imágenes (para el frontend)
CREATE POLICY "Public Access DNI"
ON storage.objects FOR SELECT
USING ( bucket_id = 'dni_images' );

-- Crear política para permitir subidas anónimas (o autenticadas) a dni_images
CREATE POLICY "Allow public uploads DNI"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'dni_images' );

-- Crear política para permitir actualizar y eliminar imágenes en dni_images
CREATE POLICY "Allow public updates DNI"
ON storage.objects FOR UPDATE
WITH CHECK ( bucket_id = 'dni_images' );

CREATE POLICY "Allow public deletes DNI"
ON storage.objects FOR DELETE
USING ( bucket_id = 'dni_images' );

-- =========================================================================
-- Políticas de Row Level Security (RLS) para la tabla checkins
-- =========================================================================
-- Habilitar Row Level Security (RLS) en la tabla checkins
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

-- Crear políticas públicas/anónimas para el panel de recepción
CREATE POLICY "Permitir lectura pública de checkins" 
ON public.checkins FOR SELECT 
USING (true);

CREATE POLICY "Permitir inserción pública de checkins" 
ON public.checkins FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Permitir actualización pública de checkins" 
ON public.checkins FOR UPDATE 
USING (true) WITH CHECK (true);

CREATE POLICY "Permitir eliminación pública de checkins" 
ON public.checkins FOR DELETE 
USING (true);

