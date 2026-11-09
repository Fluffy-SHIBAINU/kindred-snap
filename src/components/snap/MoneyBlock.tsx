import { formatUsd } from "@/lib/money";
import { CheckIcon, InfoIcon } from "./icons";

type Props = {
  amountCents: number;
  /** The three money labels never merge (CLAUDE.md rule 4). */
  kind: "estimated" | "confirmed" | "actual";
  /** heading above the amount, e.g. "Confirmed Nov 21" */
  label?: string;
  /** badge text for `confirmed`, default "Confirmed by the hospital" */
  badge?: string;
  /** small muted line beneath, e.g. "$240.00 removed + $169.50 off $226.00" */
  note?: string;
};

const AMOUNT = "font-mono text-2xl font-medium tracking-[-0.01em] [font-variant-numeric:tabular-nums]";

/** DESIGN.md §6 `.money`: estimated (dashed badge), confirmed (accent stamp) or actual (ink band). */
export function MoneyBlock({ amountCents, kind, label, badge, note }: Props) {
  if (kind === "actual") {
    return (
      <div className="flex flex-col gap-1 rounded-card bg-ink px-4 py-3 text-paper">
        <span className="font-medium">{label ?? "Actual savings"}</span>
        <span className={AMOUNT + " text-accent-soft"}>{formatUsd(amountCents)}</span>
        {note && <span className="text-sm">{note}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="font-medium">{label}</span>}
      <span className={AMOUNT}>{formatUsd(amountCents)}</span>
      {kind === "estimated" ? (
        <span className="inline-flex min-h-7 w-max items-center gap-1.5 rounded-pill border border-dashed border-ink-2 px-2.5 text-sm font-medium text-ink-2">
          <InfoIcon />
          Estimated
        </span>
      ) : (
        <span className="inline-flex min-h-7 w-max items-center gap-1.5 rounded-pill bg-accent px-2.5 text-sm font-medium text-accent-ink">
          <CheckIcon />
          {badge ?? "Confirmed by the hospital"}
        </span>
      )}
      {note && <span className="text-sm text-muted">{note}</span>}
    </div>
  );
}
