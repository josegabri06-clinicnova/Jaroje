import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ['192.168.41.224'],
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [
      {
        source: '/llamadas',
        destination: '/reservas',
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      // Imágenes fijas de public/: por defecto el navegador las revalida en cada visita; así las reutiliza hasta un día
      // (y se sirve la copia guardada mientras se actualiza durante una semana). Si se cambia el logo, tarda como mucho un día en verse.
      ...['/logo-jaroje.png', '/icon-192.png', '/icon-512.png'].map((source) => ({
        source,
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      })),
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            // La cámara se permite solo a la propia aplicación (Recepción y Mantenimiento toman fotos); terceros siguen bloqueados
            value: 'camera=(self), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
} as any;

export default nextConfig;
