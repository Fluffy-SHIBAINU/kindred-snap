/** Decorative inline icons (DESIGN.md §9: aria-hidden; status never rides on the icon alone). */
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The tick in a circle, InfoIcon's partner for a status that stands alone (mock PM5). */
export function CheckCircleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </svg>
  );
}

/** A step that has not started (mock PM2). */
export function ClockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} {...stroke} aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function InfoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.5" />
    </svg>
  );
}

export function CameraIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke} aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v12H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

/** Points down; a disclosure row turns it when open. */
export function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} {...stroke} aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function DocumentIcon({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke} aria-hidden="true">
      <path d="M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6" />
    </svg>
  );
}

/** Spins while an auto step is working; still under reduced motion (the word "working" carries the state). */
export function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} {...stroke} strokeWidth={2.5} aria-hidden="true" className="motion-safe:animate-spin">
      <path d="M12 3a9 9 0 1 1-9 9" />
    </svg>
  );
}
