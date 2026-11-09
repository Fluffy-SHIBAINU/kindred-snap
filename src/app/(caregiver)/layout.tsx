import Link from "next/link";
import type { ReactNode } from "react";
import { DemoBadge } from "@/components/snap/Badges";

/**
 * The phone shell for the six caregiver screens (mocks M01…M06): app bar, scrolling region, and the page's ActionBar
 * sticking to the foot. Full width on phones, a 390–430px column on the paper ground on desktop. Server component.
 */
// Every case screen reads the in-memory store at request time, so this segment is allowed to block (as the staff layout does).
export const instant = false;

export default function CaregiverLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh justify-center bg-paper text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-10 focus:rounded-input focus:bg-white focus:px-4 focus:py-3">
        Skip to content
      </a>
      <div className="flex h-full w-full max-w-[430px] flex-col md:min-w-[390px] md:border-x md:border-rule">
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-6 pt-5 pb-2">
          <Link href="/" className="text-lg font-extrabold tracking-[-0.02em] no-underline">
            Kindred Snap
          </Link>
          <DemoBadge />
        </header>
        <main id="main" className="flex min-h-0 flex-1 flex-col overflow-y-auto [&_h1]:text-2xl [&_h1]:leading-[1.15] [&_h2]:text-xl [&_h2]:leading-[1.15]">
          {children}
        </main>
      </div>
    </div>
  );
}
