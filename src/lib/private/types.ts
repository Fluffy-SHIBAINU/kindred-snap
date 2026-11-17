/**
 * The shapes of private mode, exactly as docs/features/snap-incognito.md §5 and §6 write them, plus `Joined`
 * (docs/BUILD.md Phase 10). `src/lib/types.ts` is unchanged; nothing here is stored.
 */
import type { ActionKind, Eligibility, Finding, Policy, PolicyField, Step } from "@/lib/types";

/** What the reader says a dropped file is. It classifies each file itself; nobody tells it what was dropped. */
export type DocKind = "bill" | "msn" | "eob" | "income" | "other" | "unreadable";

/** The values a check needs. A reader lists the ones it saw under a cover. */
export type Needed = "patient_owes" | "hospital" | "service_date" | "line_code" | "line_charge" | "line_patient" | "statement_date" | "due_date" | "notice_max" | "income";

/** One file as read: amounts, dates, codes and the hospital's name, nothing else. */
export type PrivateRead = {
  kind: DocKind;
  /** position in drop order, set by us */
  page: number;
  /** lookup key only; never returned */
  hospital: { name: string; city: string | null; state: string | null } | null;
  lines: Array<{ n: number; code: string | null; serviceDate: string | null; chargeCents: number | null; billedCents: number | null; youMayBeBilledCents: number | null }>;
  patientOwesCents: number | null;
  /** "Maximum You May Be Billed", or "your responsibility" on an eob */
  noticeMaxCents: number | null;
  claimCount: number | null;
  statementDate: string | null;
  dueDate: string | null;
  /** the total as printed; the yearly total when the page prints one */
  income: { cents: number; period: "week" | "two_weeks" | "month" | "year" | "other" } | null;
  /** needed values the reader saw under a cover */
  covered: Needed[];
};

/** What `runPrivate` returns. No variant carries a message text. */
export type PrivateOutcome =
  | { status: "ok"; result: PrivateResult }
  | { status: "needs_amount"; reason: "covered" | "no_bill" | "not_found" | "two_bills" }
  | { status: "unreadable"; reason: "demo_only" | "too_dark" }
  | { status: "failed" };

/** Whether the matched policy covers this patient; it decides whether a percent may appear at all (§7). */
export type Coverage = "covered" | "not_covered" | "not_stated" | "insurance_unknown" | "no_policy";

/** A hospital's published policy as private mode shows it. `exact` is false for a match by containment, which is shown, not asserted. */
export type PrivatePolicy = {
  ccn: string | null;
  name: string;
  city: string;
  state: string;
  exact: boolean;
  policy: Policy;
  insuredCovered: PolicyField<boolean | null>;
  otherConditions: Array<{ label: "Assets" | "Where the patient lives"; quote: string; sourceUrl: string | null; checkedOn: string | null }>;
};

/** A finding without its explanation text: the pipeline's sentences speak of things that do not exist in this mode. */
export type PrivateFinding = { kind: Finding["kind"]; amountCents: number | null; confidence: Finding["confidence"]; billLine: number | null; evidence: string[] };

export type PrivateResult = {
  outcome: "line_found" | "line_possible" | "amounts_differ" | "no_notice" | "notice_covered" | "notice_unmatched" | "nothing_found";
  balanceCents: number;
  dueDate: string | null;
  noticeKind: "msn" | "eob" | null;
  findings: PrivateFinding[];
  steps: Step[];
  policy: PrivatePolicy | null;
  coverage: Coverage;
  help: "no_hospital" | "insured_not_covered" | "no_thresholds" | "ceilings" | "by_household" | "same_tier";
  households: Array<{ size: 1 | 2 | 3 | 4; fplPercent: number | null; status: Eligibility["status"]; discountPercent: number | null; incomeUpToCents: number | null }> | null;
  estimate: { cents: number; parts: Array<{ label: string; cents: number }> } | null;
  letters: Array<{ kind: ActionKind; title: string; draft: string }>;
  assumptions: Assumption[];
  leftOut: { other: number; unreadable: number; secondStatement: boolean };
  demo: boolean;
};

/** One rule per gap in what the files show (§6). */
export type AssumptionKey =
  | "household_size" | "coverage_type" | "insurance_unknown" | "same_visit" | "hospital" | "hospital_match" | "service_date" | "line_code" | "line_charge"
  | "line_patient" | "statement_date" | "due_date" | "no_notice" | "notice_lines_sum" | "no_income" | "income_period" | "income_added" | "second_statement" | "guideline_region";
export type Assumption = { key: AssumptionKey; statement: string; ifWrong: string; inLetter: "blank" | "asks" | "left_out" };

/** The dropped pages joined into one bill and at most one notice. Blank codes and dates are empty strings. */
export type Joined = {
  bill: {
    lines: Array<{ n: number; code: string; serviceDate: string; chargeCents: number }>;
    coveredLines: number[];
    patientOwesCents: number;
    statementDate: string | null;
    dueDate: string | null;
  };
  notice: {
    kind: "msn" | "eob";
    lines: Array<{ n: number; code: string; serviceDate: string; billedCents: number; youMayBeBilledCents: number }>;
    maxCents: number;
    maxFrom: "printed" | "lines_sum";
  } | null;
  noticeState: "none" | "amounts_covered" | "unmatched" | "ok";
  hospital: PrivateRead["hospital"];
  incomes: Array<{ cents: number; period: "week" | "two_weeks" | "month" | "year" | "other" }>;
  incomeAnnualCents: number | null;
  covered: Needed[];
  leftOut: PrivateResult["leftOut"];
};
