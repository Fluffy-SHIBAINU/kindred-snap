const TONE = { accent: "bg-accent", soft: "bg-accent-soft", ink: "bg-ink" } as const;

/**
 * One horizontal bar with its label and value as text; the bar itself is decoration (aria-hidden).
 * `pct` is the width relative to the row's maximum, 0–100. Render inside a <ul>.
 */
export function BarRow({ label, value, pct, tone = "accent" }: { label: string; value: string; pct: number; tone?: keyof typeof TONE }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-3">
      <span>{label}</span>
      <div aria-hidden="true" className={`h-7 rounded-md ${TONE[tone]}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      <span className="font-outlier text-right tabular-nums">{value}</span>
    </li>
  );
}
