import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { WhatsAppInAppHeader } from '@/components/WhatsAppInAppHeader';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#075E54',
  interactiveWidget: 'resizes-visual',
};

export const metadata: Metadata = {
  title: 'Condominios Jaroje | Portal de Reservas y Huéspedes',
  description: 'Portal de reservas directas y gestión de autoservicio para huéspedes de Condominios Jaroje.',
  formatDetection: {
    telephone: false,
  },
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F6F5F2] antialiased overscroll-none">
      <Suspense fallback={<div className="h-10 bg-[#075E54] w-full" />}>
        <WhatsAppInAppHeader />
      </Suspense>
      <div className="flex-1 w-full pb-[env(safe-area-inset-bottom)]">
        {children}
      </div>
    </div>
  );
}
