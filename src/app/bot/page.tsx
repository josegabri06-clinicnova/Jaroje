"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BotPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/panel');
  }, [router]);

  return null;
}
