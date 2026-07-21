import './globals.css';
import { Inter } from 'next/font/google';
import { BottomNav } from '@/components/BottomNav';
import { AuthGuard } from '@/components/AuthGuard';
import CopilotWidget from '@/components/CopilotWidget';
import RealtimeLogNotifier from '@/components/RealtimeLogNotifier';

import { LayoutWrapper } from '@/components/LayoutWrapper';

import { Beds24RateLimitBanner } from '@/components/Beds24RateLimitBanner';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
});

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // KEY: Prevents the keyboard from resizing the viewport on Android Chrome
  // This stops fixed elements (nav, panels) from jumping when keyboard opens
  interactiveWidget: 'resizes-visual',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="antialiased">
      <head>
        <title>Jaroje OS</title>
        <meta name="description" content="Sistema Operativo B2B para Hoteles" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Jaroje OS" />
        <meta name="theme-color" content="#fafafa" />
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </head>
      <body className={`${inter.className} bg-[#fafafa] text-zinc-900 min-h-screen flex flex-col selection:bg-zinc-200 overscroll-none`}>
        <AuthGuard>
          <Beds24RateLimitBanner />
          <RealtimeLogNotifier />
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
          <BottomNav />
          <CopilotWidget />
        </AuthGuard>
      </body>
    </html>
  );
}
