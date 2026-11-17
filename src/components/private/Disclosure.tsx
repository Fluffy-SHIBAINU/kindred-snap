import type { ComponentProps, ReactNode } from "react";
import { ChevronIcon } from "@/components/snap/icons";

type Props = { summary: ReactNode } & Omit<ComponentProps<"details">, "className">;

/** kit.css `.disclosure`: a paper-2 row that opens in place. No script, so a server page can use it. On paper it is a plain block at the size of mock PM4b's sheet. */
export function Disclosure({ summary, children, ...rest }: Props) {
  return (
    <details className="group rounded-card bg-paper-2 print:bg-transparent" {...rest}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 py-2.5 font-medium print:px-0 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{summary}</span>
        <span className="shrink-0 group-open:rotate-180 print:hidden">
          <ChevronIcon />
        </span>
      </summary>
      <div className="flex flex-col gap-2 px-4 pb-3.5 text-sm text-ink-2 print:px-0 print:text-xs print:text-ink">{children}</div>
    </details>
  );
}
