/**
 * Dropped pages joined into one bill and at most one notice, and every assumption named in one place
 * (docs/features/snap-incognito.md §4 rows T12, T13 and T16 to T20, §5, §6). Pure: no store, no atlas, no clock.
 */
import { matchLines } from "@/lib/compare";
import type { Finding } from "@/lib/types";
import { ASSUMPTIONS, COVERAGE_WORDS, GUESS_KEYS, fill } from "./copy";
import type { Assumption, AssumptionKey, Coverage, Joined, Needed, PrivatePolicy, PrivateRead, PrivateResult } from "./types";

type Stop = { stop: "covered" | "no_bill" | "not_found" | "two_bills" | "too_dark" };
type ReadLine = PrivateRead["lines"][number];
type BillLine = Joined["bill"]["lines"][number];
type NoticeLine = NonNullable<Joined["notice"]>["lines"][number];

// `matchLines` takes the regular line shapes; its tolerant rungs read only the code, the date and the two amounts
const SOURCE = { documentId: "", page: 0, quote: "" };

/** For each bill line, in order: how it paired and with which notice line, or null. */
function pairs(bill: BillLine[], notice: NoticeLine[]) {
  const shaped = notice.map((l) => ({ ...l, service: "", approvedCents: 0, medicarePaidCents: 0, source: SOURCE }));
  return matchLines(bill.map((l) => ({ ...l, description: "", source: SOURCE })), shaped, { tolerant: true })
    .filter((m) => m.bill)
    .map((m) => ({ how: m.how, notice: m.msn ? notice[shaped.indexOf(m.msn)] : null }));
}

/** A read without its page, keys in one order, so two reads of the same page compare equal. */
const content = (r: PrivateRead) =>
  JSON.stringify({ ...r, page: 0 }, (_, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
const sameName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");
const differ = (values: Array<string | number | null>) => new Set(values.filter((v) => v !== null)).size > 1;
const first = <T>(values: Array<T | null>): T | null => values.find((v) => v !== null) ?? null;

/** The lines of several pages in page order. A page whose line numbers repeat an earlier page's continues the count instead. */
function inPageOrder(pages: PrivateRead[]): ReadLine[] {
  const out: ReadLine[] = [];
  for (const p of pages) {
    const top = Math.max(0, ...out.map((l) => l.n));
    const clash = p.lines.some((l) => out.some((o) => o.n === l.n));
    out.push(...p.lines.map((l, i) => (clash ? { ...l, n: top + i + 1 } : l)));
  }
  return out;
}

/**
 * One bill and at most one notice out of the reads, or the reason there is no amount to work from.
 * Left-out files (`other`, `unreadable`) are each counted; among the rest, reads equal apart from `page` count once.
 * A notice line needs both of its amounts: without "you may be billed" nothing can rest on it, and without the billed
 * amount it cannot be paired by amount.
 */
export function join(reads: PrivateRead[]): Joined | Stop {
  const leftOut = { other: reads.filter((r) => r.kind === "other").length, unreadable: reads.filter((r) => r.kind === "unreadable").length, secondStatement: false };
  if (reads.length > 0 && leftOut.unreadable === reads.length) return { stop: "too_dark" };

  const seen = new Set<string>();
  const docs = [...reads]
    .sort((a, b) => a.page - b.page)
    .filter((r) => r.kind !== "other" && r.kind !== "unreadable")
    .filter((r) => {
      const c = content(r);
      return !seen.has(c) && !!seen.add(c);
    });

  const bills = docs.filter((r) => r.kind === "bill");
  if (!bills.length) return { stop: "no_bill" };
  // pages of one bill agree on the hospital, the statement date and the amount owed wherever they show them
  if (differ(bills.map((b) => b.patientOwesCents)) || differ(bills.map((b) => b.statementDate)) || differ(bills.map((b) => b.hospital && sameName(b.hospital.name)))) return { stop: "two_bills" };
  const patientOwesCents = first(bills.map((b) => b.patientOwesCents));
  if (patientOwesCents === null) return { stop: bills.some((b) => b.covered.includes("patient_owes")) ? "covered" : "not_found" };

  const billLines = inPageOrder(bills);
  const lines = billLines.flatMap((l) => (l.chargeCents === null ? [] : [{ n: l.n, code: l.code ?? "", serviceDate: l.serviceDate ?? "", chargeCents: l.chargeCents }]));
  const coveredLines = billLines.filter((l) => l.chargeCents === null).map((l) => l.n);

  // a Medicare notice wins over an insurer's statement
  const msn = docs.filter((r) => r.kind === "msn");
  const eob = docs.filter((r) => r.kind === "eob");
  const pages = msn.length ? msn : eob;
  leftOut.secondStatement = msn.length > 0 && eob.length > 0;
  const incomePages = docs.filter((r) => r.kind === "income");
  const covered = new Set<Needed>([...bills, ...pages, ...incomePages].flatMap((r) => r.covered));

  let notice: Joined["notice"] = null;
  let noticeState: Joined["noticeState"] = "none";
  if (pages.length) {
    const kind = msn.length ? "msn" : "eob";
    const read = inPageOrder(pages);
    if (read.some((l) => l.youMayBeBilledCents === null)) covered.add("line_patient");
    const noticeLines = read.flatMap((l) =>
      l.youMayBeBilledCents === null || l.billedCents === null ? [] : [{ n: l.n, code: l.code ?? "", serviceDate: l.serviceDate ?? "", billedCents: l.billedCents, youMayBeBilledCents: l.youMayBeBilledCents }],
    );
    const maxima = [...new Set(pages.flatMap((p) => (p.noticeMaxCents === null ? [] : [p.noticeMaxCents])))];
    const oneClaim = maxima.length === 1 && !pages.some((p) => (p.claimCount ?? 1) > 1);
    if (!noticeLines.length && !maxima.length) {
      noticeState = "amounts_covered";
    } else if (oneClaim) {
      notice = { kind, lines: noticeLines, maxCents: maxima[0], maxFrom: "printed" };
      noticeState = "ok";
    } else {
      // no maximum for this visit alone: only the lines that pair with the bill count, and every bill line has to pair
      const paired = pairs(lines, noticeLines).map((p) => p.notice);
      if (!lines.length || coveredLines.length || paired.includes(null)) {
        noticeState = "unmatched";
      } else {
        const ours = noticeLines.filter((l) => paired.includes(l));
        notice = { kind, lines: ours, maxCents: ours.reduce((sum, l) => sum + l.youMayBeBilledCents, 0), maxFrom: "lines_sum" };
        noticeState = "ok";
      }
    }
  }

  // two income pages with the same amount and period are one income
  const incomes = incomePages.flatMap((r) => (r.income ? [r.income] : [])).filter((inc, i, all) => all.findIndex((o) => o.cents === inc.cents && o.period === inc.period) === i);
  const yearly = incomes.map((inc) => (inc.period === "year" ? inc.cents : inc.period === "month" ? inc.cents * 12 : null));
  const incomeAnnualCents = yearly.length > 0 && yearly.every((y) => y !== null) ? yearly.reduce<number>((sum, y) => sum + (y ?? 0), 0) : null;

  return {
    bill: { lines, coveredLines, patientOwesCents, statementDate: first(bills.map((b) => b.statementDate)), dueDate: first(bills.map((b) => b.dueDate)) },
    notice,
    noticeState,
    hospital: first(bills.map((b) => b.hospital)) ?? first(pages.map((p) => p.hospital)),
    incomes,
    incomeAnnualCents,
    covered: [...covered],
    leftOut,
  };
}

/** Whether the matched policy covers this patient. A statement that was dropped, usable or not, means the patient has insurance. */
export function coverageOf(j: Joined, policy: PrivatePolicy | null): Coverage {
  if (!policy) return "no_policy";
  if (policy.insuredCovered.value === true) return "covered";
  if (policy.insuredCovered.value === null) return "not_stated";
  return j.noticeState === "none" ? "insurance_unknown" : "not_covered";
}

/**
 * Every default of §6 that applied to this run: the guesses (which carry the chip Assumed) first, then the plain lines.
 * The household guess is listed only when it is in a figure: a tier worked out from an income for a household of one.
 */
export function assume(j: Joined, policy: PrivatePolicy | null): Assumption[] {
  const coverage = coverageOf(j, policy);
  const lines = [...j.bill.lines, ...(j.notice?.lines ?? [])];
  const codeAndDate = !!j.notice && pairs(j.bill.lines, j.notice.lines).some((p) => p.how === "code_date");
  // the only guideline table is for the 48 states and DC
  const otherGuideline = !!policy && (policy.state === "AK" || policy.state === "HI");
  const tierWorkedOut =
    !!policy && !otherGuideline && j.incomeAnnualCents !== null && (coverage === "covered" || coverage === "not_stated") &&
    (policy.policy.freeCareMaxFpl.value !== null || policy.policy.tiers.value.length > 0);
  const applies: Record<AssumptionKey, boolean> = {
    household_size: tierWorkedOut,
    coverage_type: !!j.notice,
    insurance_unknown: j.noticeState === "none",
    same_visit: !!j.notice && !codeAndDate,
    hospital: !policy,
    hospital_match: !!policy && !policy.exact,
    service_date: lines.some((l) => !l.serviceDate),
    line_code: lines.some((l) => !l.code),
    line_charge: j.bill.coveredLines.length > 0,
    line_patient: j.covered.includes("line_patient"),
    statement_date: j.bill.statementDate === null,
    due_date: j.bill.dueDate === null,
    no_notice: !j.notice,
    notice_lines_sum: j.notice?.maxFrom === "lines_sum",
    no_income: j.incomes.length === 0,
    income_period: j.incomes.some((inc) => inc.period !== "month" && inc.period !== "year"),
    income_added: j.incomes.length > 1 && j.incomeAnnualCents !== null,
    second_statement: j.leftOut.secondStatement,
    guideline_region: otherGuideline,
  };
  const slots: Record<string, string> = { ...(j.notice && COVERAGE_WORDS[j.notice.kind]), ...(policy && { hospital: policy.name, city: policy.city, state: policy.state }) };
  const keys = (Object.keys(ASSUMPTIONS) as AssumptionKey[]).filter((k) => applies[k]);
  return [...keys.filter((k) => GUESS_KEYS.includes(k)), ...keys.filter((k) => !GUESS_KEYS.includes(k))].map((key) => ({ key, ...ASSUMPTIONS[key], statement: fill(ASSUMPTIONS[key].statement, slots) }));
}

/** Which of the result's headings applies. A covered bill line can never be singled out, so it caps the outcome at "amounts differ". */
export function outcomeOf(findings: Finding[], j: Joined): PrivateResult["outcome"] {
  if (!j.notice) return j.noticeState === "amounts_covered" ? "notice_covered" : j.noticeState === "unmatched" ? "notice_unmatched" : "no_notice";
  const line = findings.find((f) => f.kind === "line_not_patient_responsibility");
  if (line && !j.bill.coveredLines.length) return line.confidence === "likely" ? "line_found" : "line_possible";
  return findings.some((f) => f.kind === "patient_owes_exceeds_notice") ? "amounts_differ" : "nothing_found";
}
