"use client";

import { usePathname } from "next/navigation";

const TABS = [
  ["Dashboard", "/staff"],
  ["Queue", "/staff/queue"],
  ["Cases", "/staff/cases"],
  ["Audit", "/staff/audit"],
] as const;

/** Plain links; the current one is marked for assistive tech and by a white fill. */
export function StaffTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Staff workspace" className="flex flex-wrap gap-1">
      {TABS.map(([label, href]) => {
        const current = href === "/staff" ? path === href : path.startsWith(href);
        return (
          <a
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`inline-flex min-h-12 items-center rounded-input px-3.5 font-medium no-underline ${current ? "bg-white text-ink shadow-[inset_0_0_0_1px_var(--color-rule)]" : "text-ink-2"}`}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
