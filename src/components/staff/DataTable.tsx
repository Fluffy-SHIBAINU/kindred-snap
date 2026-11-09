import type { ReactNode } from "react";

/** Scrolls sideways on narrow screens; pass <thead> and <tbody> with scope="col" headers. */
export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm [&_td]:border-b [&_td]:border-rule [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_th]:bg-paper-3 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-medium">
        {children}
      </table>
    </div>
  );
}
