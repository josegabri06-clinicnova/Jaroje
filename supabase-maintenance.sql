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
