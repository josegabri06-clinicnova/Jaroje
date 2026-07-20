"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const role = localStorage.getItem('jaroje_role');
    if (!role) {
      router.replace('/login');
    } else if (role === 'admin' || role === 'recepcion') {
      router.replace('/calendario');
    } else {
      router.replace('/staff');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-800" />
    </div>
  );
}
