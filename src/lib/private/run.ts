/**
 * The stateless investigation of private mode (docs/features/snap-incognito.md §5): the dropped pages are joined, the
 * existing pipeline runs against a store that lives for this one call, and what comes back is a result for the browser tab.
 * Nothing here reaches the process-wide store, a file or a log. An error is the caller's to turn into the `failed` status.
 */
import demoPolicy from "../../../fixtures/private/demo-policy.json";
import { MemoryStore } from "@/lib/adapters/store/memory";
import { tierFor } from "@/lib/eligibility";
import { fplPercent, guidelineCents } from "@/lib/fpl";
import { formatUsd } from "@/lib/money";
import { riverbendPolicy, runInvestigation } from "@/lib/pipeline";
import { STEP_KEYS } from "@/lib/progress";
import { estimateOpportunity } from "@/lib/savings";
import { formatDate } from "@/lib/templates/facts";
import type { Document, Policy, SourceRef, Step } from "@/lib/types";
import { DISCOUNT, RESULT, STEP_SUMMARIES, STEP_TITLES, fill } from "./copy";
import { assume, coverageOf, join, outcomeOf } from "./join";
import { PLACEHOLDERS, privateDrafts } from "./letters";
import { scrub } from "./scrub";
import type { Joined, PrivateOutcome, PrivatePolicy, PrivateRead, PrivateResult } from "./types";

const ID = "private";
const BILL_ID = "private-bill";
const NOTICE_ID = "private-notice";
const SIZES = [1, 2, 3, 4] as const;
// how an evidence line names the statement: by the document that was dropped, never by the coverage
const NOTICE_WORD = { msn: "Medicare notice", eob: "Insurer's statement" };
const sameName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The demo partner's synthetic policy with its synthetic coverage sentence, when the page names the demo partner. Demo readers only. */
export function demoMatch(h: PrivateRead["hospital"]): PrivatePolicy | null {
  const policy = riverbendPolicy();
  if (!h || sameName(h.name) !== sameName(policy.hospitalName)) return null;
  return { ccn: null, name: policy.hospitalName, exact: true, policy, ...(demoPolicy as Pick<PrivatePolicy, "city" | "state" | "insuredCovered" | "otherConditions">) };
}

/**
 * The joined pages as the pipeline's documents. Each holds amounts, codes and dates only: no field, no description and
 * no notice note, so there is no text of the page for the pipeline to quote. An evidence quote is composed here from
 * those values. An insurer's statement travels as kind `msn`, the one notice kind the pipeline knows.
 */
export function documentsOf(j: Joined, now: string): { bill: Document; notice: Document | null } {
  const ref = (documentId: string, parts: string[], line?: number): SourceRef => ({ documentId, page: 1, ...(line !== undefined && { line }), quote: parts.filter(Boolean).join(", ") });
  const base = { caseId: ID, fileName: "", pages: 1, fields: [], status: "readable" as const, uploadedAt: now };
  const owes = j.bill.patientOwesCents;
  const bill: Document = {
    ...base,
    id: BILL_ID,
    kind: "bill",
    billLines: j.bill.lines.map((l) => ({ ...l, description: "", source: ref(BILL_ID, [`Bill line ${l.n}`, l.code, formatDate(l.serviceDate), formatUsd(l.chargeCents)], l.n) })),
    billTotals: { totalChargesCents: 0, adjustmentsCents: 0, insurancePaidCents: 0, patientOwesCents: owes, dueDate: j.bill.dueDate ?? "", statementDate: j.bill.statementDate ?? "", source: ref(BILL_ID, [`Bill, amount you owe ${formatUsd(owes)}`]) },
  };
  const n = j.notice;
  if (!n) return { bill, notice: null };
  const word = NOTICE_WORD[n.kind];
  const total = n.maxFrom === "lines_sum" ? `lines ${n.lines.map((l) => l.n).join(", ")} added up` : n.kind === "msn" ? "the most you may be billed" : "your responsibility";
  const notice: Document = {
    ...base,
    id: NOTICE_ID,
    kind: "msn",
    msnLines: n.lines.map((l) => ({ ...l, service: "", approvedCents: 0, medicarePaidCents: 0, source: ref(NOTICE_ID, [`${word} line ${l.n}`, l.code, formatDate(l.serviceDate), `you may be billed ${formatUsd(l.youMayBeBilledCents)}`], l.n) })),
    msnTotals: { maxYouMayBeBilledCents: n.maxCents, period: "", source: ref(NOTICE_ID, [`${word}, ${total} ${formatUsd(n.maxCents)}`]) },
  };
  return { bill, notice };
}

/** The policy's tier for one to four people when a yearly income was read; without one, the income up to which it lists free care. */
function householdsOf(p: Policy, incomeCents: number | null): NonNullable<PrivateResult["households"]> {
  const free = p.freeCareMaxFpl.value;
  return SIZES.map((size) => {
    if (incomeCents === null) return { size, fplPercent: null, status: "unknown" as const, discountPercent: null, incomeUpToCents: free === null ? null : Math.round((guidelineCents(size) * free) / 100) };
    const e = tierFor(p, fplPercent(incomeCents, size));
    return { size, fplPercent: e.fplPercent, status: e.status, discountPercent: e.discountPercent, incomeUpToCents: null };
  });
}

/**
 * The five rows of "We're On It" once the request is back, all done, worded from `copy.ts`: the pipeline's own summaries
 * speak of asking Medicare, a billing specialist and approval, none of which exists here. `pages` is how many of the
 * dropped files were read as a bill, a notice or an income letter.
 */
export function privateSteps(r: Omit<PrivateResult, "steps">, pages: number): Step[] {
  const S = STEP_SUMMARIES;
  const line = r.findings.find((f) => f.kind === "line_not_patient_responsibility");
  const gap = r.findings.find((f) => f.kind === "patient_owes_exceeds_notice");
  // the row for a household of one is the assumed one
  const one = r.households?.find((h) => h.size === 1);
  const discount = one?.status === "free" ? DISCOUNT.free : one?.status === "discount" ? fill(DISCOUNT.discount, { percent: one.discountPercent ?? "" }) : DISCOUNT.none;
  const noNotice = r.outcome === "notice_covered" || r.outcome === "notice_unmatched" ? r.outcome : "no_notice";
  const summaries = [
    pages === 1 ? S.read.one : fill(S.read.many, { n: pages }),
    S.notice[r.noticeKind ?? noNotice],
    fill(S.compare[r.outcome], { n: line?.billLine ?? "", amount: formatUsd((line ?? gap)?.amountCents ?? 0) }),
    fill(S.help[r.help], { discount }),
    r.letters.length ? S.letters.ready : S.letters.none,
  ];
  return STEP_KEYS.map((key, i) => ({ key, title: STEP_TITLES[i], status: "done", summary: summaries[i] }));
}

/**
 * One check from the reads of the dropped pages. `match` looks the hospital up (the atlas, or the demo partner);
 * `householdSize` is the assumption, one person: it reaches the table and the estimate and never a letter.
 */
export async function runStateless(
  reads: PrivateRead[],
  deps: { match(h: PrivateRead["hospital"]): PrivatePolicy | null; today: string; demo: boolean },
  householdSize: 1 | 2 | 3 | 4 = 1,
): Promise<PrivateOutcome> {
  const j = join(reads);
  if ("stop" in j) return j.stop === "too_dark" ? { status: "unreadable", reason: "too_dark" } : { status: "needs_amount", reason: j.stop };
  const policy = deps.match(j.hospital);
  const coverage = coverageOf(j, policy);

  // a local store: it exists for this call only and is never the process-wide one
  const store = new MemoryStore();
  const { bill, notice } = documentsOf(j, deps.today);
  await store.cases.put({
    id: ID, code: "", state: "created", patientName: PLACEHOLDERS.patient, hospitalName: policy?.exact ? policy.name : PLACEHOLDERS.hospital, ownerId: "", consent: null,
    income: j.incomeAnnualCents === null ? null : { annualCents: j.incomeAnnualCents, householdSize, source: "document" },
    steps: [], createdAt: deps.today, updatedAt: deps.today,
  });
  await store.documents.put(bill);
  const c = await runInvestigation(
    store,
    ID,
    {
      claims: { kind: "dropped_document", state: async () => "connected", fetchNotice: async () => notice },
      // a policy that excludes this patient is never handed over, so no percent is computed for it
      policyFor: async () => (coverage === "not_covered" ? null : (policy?.policy ?? null)),
      now: () => deps.today,
      drafts: (ctx) => privateDrafts(j, policy, coverage, ctx),
    },
    { tolerant: true },
  );
  // never a partial packet: a letter that failed its number check leaves the case short of ready
  if (c.state !== "ready_to_send") return { status: "failed" };

  const all = await store.findingsFor(ID);
  const outcome = outcomeOf(all, j);
  // a covered charge caps the outcome, and then nothing in the result may point to a single line either
  const single = outcome === "line_found" || outcome === "line_possible";

  // the only guideline table is for the 48 states and DC
  const noThresholds = !!policy && (policy.state === "AK" || policy.state === "HI" || (policy.policy.freeCareMaxFpl.value === null && !policy.policy.tiers.value.length));
  const byIncome = !!policy && !noThresholds && (coverage === "covered" || coverage === "not_stated") && j.incomeAnnualCents !== null;
  const households = policy && coverage !== "not_covered" && !noThresholds ? householdsOf(policy.policy, byIncome ? j.incomeAnnualCents : null) : null;
  const help: PrivateResult["help"] = !policy
    ? "no_hospital"
    : coverage === "not_covered"
      ? "insured_not_covered"
      : !households
        ? "no_thresholds"
        : !byIncome
          ? "ceilings"
          : households.every((h) => h.status === households[0].status && h.discountPercent === households[0].discountPercent)
            ? "same_tier"
            : "by_household";

  // the help part stands only on a tier worked out from an income that was read
  const estimated = estimateOpportunity(single ? all : [], byIncome ? (c.eligibility ?? null) : null, j.bill.patientOwesCents);
  const estimate = estimated.parts.length
    ? { cents: estimated.cents, parts: estimated.parts.map((part) => ({ label: part.label.startsWith("Line") ? RESULT.partLine : RESULT.partHelp, cents: part.cents })) }
    : null;

  // under a policy that excludes this patient the result carries no percent and no tier, the policy's own included
  const unshown = { quote: null, sourceUrl: null, checkedOn: null };
  const shown = policy && coverage === "not_covered" ? { ...policy, policy: { ...policy.policy, freeCareMaxFpl: { value: null, ...unshown }, tiers: { value: [], ...unshown } } } : policy;

  const result: Omit<PrivateResult, "steps"> = {
    outcome,
    balanceCents: j.bill.patientOwesCents,
    dueDate: j.bill.dueDate,
    noticeKind: j.notice?.kind ?? null,
    // no explanation text: the pipeline's sentences speak of things that do not exist in this mode
    findings: all
      .filter((f) => single || f.kind !== "line_not_patient_responsibility")
      .map((f) => ({ kind: f.kind, amountCents: f.amountCents, confidence: f.confidence, billLine: f.evidence.find((e) => e.documentId === BILL_ID && e.line !== undefined)?.line ?? null, evidence: scrub(f.evidence.map((e) => e.quote)) })),
    policy: shown,
    coverage,
    help,
    households,
    estimate,
    letters: (await store.actionsFor(ID)).map(({ kind, title, draft }) => ({ kind, title, draft })),
    assumptions: assume(j, policy),
    leftOut: j.leftOut,
    demo: deps.demo,
  };
  return { status: "ok", result: { ...result, steps: privateSteps(result, reads.length - j.leftOut.other - j.leftOut.unreadable) } };
}
