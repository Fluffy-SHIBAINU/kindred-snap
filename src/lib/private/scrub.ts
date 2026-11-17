/**
 * What stands between a reader's answer and everything else (docs/features/snap-incognito.md §5). `boundRead` rebuilds
 * the answer key by key from an allow-list, so a key the reader was never asked for cannot come back; `scrub` then
 * replaces anything still shaped like an identifier. Nothing here logs or throws on bad input: a bad value is null.
 */
import type { DocKind, Needed, PrivateRead } from "./types";

const KINDS: readonly DocKind[] = ["bill", "msn", "eob", "income", "other", "unreadable"];
const NEEDED: readonly Needed[] = ["patient_owes", "hospital", "service_date", "line_code", "line_charge", "line_patient", "statement_date", "due_date", "notice_max", "income"];
const PERIODS = ["week", "two_weeks", "month", "year", "other"] as const;

const CODE = /^(\d{4,5}|[A-Z]\d{4}|\d{4}[A-Z])(-[A-Z0-9]{2})?$/;
// printed with two decimals, which an account number is not
const AMOUNT = /^\$?\d{1,3}(,\d{3})*\.\d{2}$/;
// letters, spaces and &.'- only: no digit can ride in on a hospital's name or city
const NAME = /^(?=.*\p{L})[\p{L} &.'-]{1,80}$/u;
const STATE = /^[A-Z]{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const oneOf = <T extends string>(allowed: readonly T[], v: unknown): T | null => allowed.find((a) => a === v) ?? null;
const int = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null);
const text = (v: unknown, shape: RegExp): string | null => (typeof v === "string" && shape.test(v) ? v : null);

/** An amount as printed, in cents; null unless it has two decimals and is under $1,000,000. */
function cents(v: unknown): number | null {
  if (typeof v !== "string" || !AMOUNT.test(v)) return null;
  const c = Number(v.replace(/[$,.]/g, ""));
  return c < 100_000_000 ? c : null;
}

const shiftYears = (iso: string, years: number) => String(Number(iso.slice(0, 4)) + years).padStart(4, "0") + iso.slice(4);

/** A real calendar date between two ISO dates, else null. */
function date(v: unknown, from: string, to: string): string | null {
  if (typeof v !== "string" || !ISO_DATE.test(v) || v < from || v > to) return null;
  const t = Date.parse(v + "T00:00:00Z");
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v ? v : null;
}

/**
 * One reader answer as a `PrivateRead`. `page` is always the argument. Service and statement dates lie within the three
 * years before `today` and a due date no more than one year after it, which rejects a date of birth. A line without a
 * line number from 1 to 99 is dropped; any other value outside its bounds becomes null. A kind we do not know is `other`.
 */
export function boundRead(raw: unknown, page: number, today: string): PrivateRead {
  const r = obj(raw);
  const past = shiftYears(today, -3);
  const h = obj(r.hospital);
  const name = text(h.name, NAME);
  const income = obj(r.income);
  const incomeCents = cents(income.cents);
  const period = oneOf(PERIODS, income.period);
  return {
    kind: oneOf(KINDS, r.kind) ?? "other",
    page,
    hospital: name === null ? null : { name, city: text(h.city, NAME), state: text(h.state, STATE) },
    lines: list(r.lines).slice(0, 99).flatMap((item) => {
      const l = obj(item);
      const n = int(l.n, 1, 99);
      if (n === null) return [];
      return [{
        n,
        code: text(l.code, CODE),
        serviceDate: date(l.serviceDate, past, today),
        chargeCents: cents(l.chargeCents),
        billedCents: cents(l.billedCents),
        youMayBeBilledCents: cents(l.youMayBeBilledCents),
      }];
    }),
    patientOwesCents: cents(r.patientOwesCents),
    noticeMaxCents: cents(r.noticeMaxCents),
    claimCount: int(r.claimCount, 1, 20),
    statementDate: date(r.statementDate, past, today),
    dueDate: date(r.dueDate, past, shiftYears(today, 1)),
    income: incomeCents === null || period === null ? null : { cents: incomeCents, period },
    covered: NEEDED.filter((k) => list(r.covered).includes(k)),
  };
}

const SENSITIVE = new RegExp(
  [
    String.raw`\b[1-9][A-Z][A-Z0-9]\d[- ]?[A-Z][A-Z0-9]\d[- ]?[A-Z]{2}\d{2}\b`, // a Medicare number
    String.raw`\b\d{3}[- ]\d{2}[- ]\d{4}\b`, // a Social Security number
    String.raw`[^\s@]+@[^\s@]+\.[^\s@]+`, // an email
    String.raw`(?:\+?1[-. ]?)?\(?\b\d{3}\)?[-. ]?\d{3}[-. ]\d{4}\b`, // a phone number
    String.raw`\d{6,}`, // a run of six or more digits
  ].join("|"),
  "gi",
);

/**
 * Replaces anything shaped like a Medicare number, a Social Security number, an email, a phone number or a run of six or
 * more digits with "[removed]", in every string of `value`. Numbers are left alone: amounts are integers of cents.
 * For the bounded reads and the evidence lines composed from them, before any atlas data is joined; never for atlas text.
 */
export function scrub<T>(value: T): T {
  if (typeof value === "string") return value.replace(SENSITIVE, "[removed]") as T;
  if (Array.isArray(value)) return value.map((v) => scrub(v)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)])) as T;
  return value;
}
