'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = pathname?.startsWith('/public');
  const isBot = pathname === '/bot';

  if (isPublic || isBot) {
    return (
      <main className={`flex-1 w-full min-h-screen ${isBot ? 'bg-[#f0f2f5]' : 'bg-[#F6F5F2]'}`}>
        {children}
      </main>
    );
  }

  return (
    <main className="flex-1 w-full max-w-md mx-auto pb-[calc(100px+env(safe-area-inset-bottom))] pt-5 px-5">
      {children}
    </main>
  );
}
