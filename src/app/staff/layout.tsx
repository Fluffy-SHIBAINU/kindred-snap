import type { ReactNode } from "react";
import { Badge } from "@/components/staff/Panel";
import { StaffTabs } from "@/components/staff/StaffTabs";
import { requireStaff } from "@/lib/server/auth";

// The gate reads the request, so this route renders on the server every time instead of serving a prerendered shell:
// a non-staff request gets a real 404 before anything streams, and the in-memory store is read live.
// Pages render in parallel with this layout, so each staff page also calls requireStaff() before reading the store.
export const instant = false;

export default async function StaffLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-input focus:bg-white focus:px-4 focus:py-3">
        Skip to the content
      </a>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rule bg-paper-2 px-8 py-4">
        <a href="/staff" className="font-display text-lg font-bold no-underline">
          Kindred Snap <span className="font-medium text-ink-2">Staff</span>
        </a>
        <StaffTabs />
        <Badge tone="synthetic">Synthetic data</Badge>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-8 pb-12 pt-6">
        {children}
      </main>
    </div>
  );
}
