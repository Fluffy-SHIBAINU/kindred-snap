import type { ReactNode } from "react";

/**
 * The bottom bar of a caregiver screen: the primary action first, then text actions. Rendered by the page at the end of
 * its content; it sticks to the foot of the shell's scrolling region, above the phone's home indicator.
 */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-rule bg-paper px-6 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}
