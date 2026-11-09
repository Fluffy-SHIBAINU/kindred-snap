"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps the working screen live: refreshes the server component every 1.5s while the case is in an auto step,
 * and replaces the route the moment the server says the case belongs on another screen.
 */
export function Poller({ next, poll }: { next: string | null; poll: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (next) {
      router.replace(next);
      return;
    }
    if (!poll) return;
    const t = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(t);
  }, [next, poll, router]);
  return null;
}
