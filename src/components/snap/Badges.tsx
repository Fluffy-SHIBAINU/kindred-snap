/** DESIGN.md §6 badges: both appear wherever hospital or Medicare data is on screen. */
export function DemoBadge() {
  return (
    <span className="inline-flex min-h-7 w-max items-center rounded-pill bg-paper-3 px-2.5 text-sm font-medium text-ink">
      Demo partner · synthetic data
    </span>
  );
}

export function SimulatedBadge() {
  return (
    <span className="inline-flex min-h-7 w-max items-center rounded-pill px-2.5 text-sm font-medium text-ink-2 ring-1 ring-inset ring-rule">
      Simulated
    </span>
  );
}
