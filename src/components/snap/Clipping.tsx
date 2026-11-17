import type { ReactNode } from "react";

/** Mint highlighter stroke over the amount or phrase a finding rests on. */
export function Highlight({ children }: { children: ReactNode }) {
  return <span className="rounded-[3px] bg-accent-soft px-1 [box-decoration-break:clone]">{children}</span>;
}

type Props = {
  /** the document line, quoted exactly (set in the mono face). Its cell fills the strip, so a block of rows (private mode's evidence pair) can set its own amounts at the right edge; a line of text draws as it always did. */
  line: ReactNode;
  /** the amount on that line; highlighted on the right. Omit when the highlight sits inside `line`. */
  amount?: string;
  /** "Bill, page 1, line 3 (Q9967), statement Oct 20" — may include a SimulatedBadge */
  source: ReactNode;
};

/** The signature: a strip of the actual document with its source caption (DESIGN.md §1, §6 `.clip`). Stack two for a discrepancy. */
export function Clipping({ line, amount, source }: Props) {
  return (
    <div className="flex flex-col gap-1 rounded-input bg-white px-4 py-2.5 shadow-card">
      <div className="flex justify-between gap-3 font-mono text-sm leading-[1.45] text-ink [font-variant-numeric:tabular-nums]">
        <span className="flex-1">{line}</span>
        {amount && <Highlight>{amount}</Highlight>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">{source}</div>
    </div>
  );
}
