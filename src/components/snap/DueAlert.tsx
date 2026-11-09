import type { ReactNode } from "react";
import { CalendarIcon } from "./icons";

/** Dates and what happens to them (DESIGN.md §6 `.alert--warn`): paper-3 tray, calendar icon, ink text. Never red. */
export function DueAlert({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-card bg-paper-3 px-4 py-2.5 text-ink">
      <div className="flex items-start gap-3">
        <span className="shrink-0">
          <CalendarIcon />
        </span>
        <p>{children}</p>
      </div>
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  );
}
