import './globals.css';
import { Inter } from 'next/font/google';
import { BottomNav } from '@/components/BottomNav';
import { AuthGuard } from '@/components/AuthGuard';
import CopilotWidget from '@/components/CopilotWidget';

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
          <main className="flex-1 w-full max-w-md mx-auto pb-[calc(100px+env(safe-area-inset-bottom))] pt-5 px-5">
            {children}
          </main>
          <BottomNav />
          <CopilotWidget />
        </AuthGuard>
      </body>
    </html>
  );
}
