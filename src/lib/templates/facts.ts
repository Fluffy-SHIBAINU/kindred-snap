import { formatUsd } from "@/lib/money";

/** Everything a letter may mention. Money is integer cents, dates ISO (YYYY-MM-DD). */
export type CaseFacts = {
  patientName: string;
  helperName?: string;
  hospitalName: string;
  accountMasked?: string;
  statementDate: string;
  dueDate: string;
  askedCents: number;
  noticeMaxCents: number;
  removedLine?: { n: number; code: string; description: string; chargeCents: number; noticeNote?: string };
  gapCents?: number;
  incomeAnnualCents?: number;
  householdSize?: number;
  fplPercent?: number;
  tierPercent?: number | null;
  policyQuote?: string | null;
  correctedCents: number;
  windowDays?: number | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-30" -> "Nov 30, 2026" (string arithmetic only, so no timezone shift). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

export function formatPercent(n: number): string {
  return (Number.isInteger(n) ? String(n) : n.toFixed(1)) + "%";
}

/** Who signs: the helper as authorized representative, or the patient. */
export function signature(f: CaseFacts): string {
  return f.helperName ? `${f.helperName}, authorized representative for ${f.patientName}` : f.patientName;
}

/** The account line used at the top of every letter. */
export function reLine(f: CaseFacts): string {
  const account = f.accountMasked ? `account ending ${f.accountMasked.replace(/\*/g, "")}, ` : "";
  return `Re: ${account}statement dated ${formatDate(f.statementDate)}, patient ${f.patientName}`;
}

/** Every dollar, percentage, date (ISO or "Nov 30, 2026") and "N days" token in a text; a days match yields its number. */
export function numberTokens(text: string): string[] {
  const re = /\$\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?%|\d{4}-\d{2}-\d{2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, \d{4}|\b(\d+) days\b/g;
  return [...text.matchAll(re)].map((m) => m[1] ?? m[0]);
}

/** Every number a letter about these facts may contain, formatted as the templates format it. */
export function allowedTokens(f: CaseFacts): Set<string> {
  const out = new Set<string>();
  const cents = [f.askedCents, f.noticeMaxCents, f.correctedCents, f.askedCents - f.noticeMaxCents, f.gapCents, f.incomeAnnualCents, f.removedLine?.chargeCents];
  for (const c of cents) if (c != null) out.add(formatUsd(c));
  for (const p of [f.fplPercent, f.tierPercent]) if (p != null) out.add(formatPercent(p));
  for (const d of [f.statementDate, f.dueDate]) { out.add(d); out.add(formatDate(d)); }
  if (f.windowDays != null) out.add(String(f.windowDays));
  // numbers inside quoted case text (the policy line, the notice note, the bill description) are facts too
  for (const q of [f.policyQuote, f.removedLine?.noticeNote, f.removedLine?.description]) if (q) for (const t of numberTokens(q)) out.add(t);
  return out;
}
