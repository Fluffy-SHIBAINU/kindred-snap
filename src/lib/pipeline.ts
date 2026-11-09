import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConnectorUnavailable, type ClaimsConnector } from "@/lib/adapters/claims/types";
import type { Store } from "@/lib/adapters/store/types";
import { findHospital, policyOf } from "@/lib/atlas";
import { transition, type CaseState } from "@/lib/case/state";
import { findDiscrepancies } from "@/lib/compare";
import { tierFor } from "@/lib/eligibility";
import { fplPercent } from "@/lib/fpl";
import { formatUsd } from "@/lib/money";
import { buildSteps, type StepKey, type StepSummaries } from "@/lib/progress";
import { estimateOpportunity } from "@/lib/savings";
import { assistanceDraft, correctionDraft, validateDraft, type CaseFacts } from "@/lib/templates";
import { formatDate, numberTokens } from "@/lib/templates/facts";
import type { Action, BillLine, BillTotals, Case, Document, Eligibility, MsnLine, MsnTotals, Policy } from "@/lib/types";

export type PipelineDeps = { claims: ClaimsConnector; policyFor: (c: Case) => Promise<Policy | null>; now: () => string };
export type PipelineOpts = { delayMs?: number };

type ReadableBill = Document & { billLines: BillLine[]; billTotals: BillTotals };
type ReadableMsn = Document & { msnLines: MsnLine[]; msnTotals: MsnTotals };
type Run = { store: Store; deps: PipelineDeps; opts: PipelineOpts; c: Case; summaries: StepSummaries };

/** The demo partner's synthetic policy (fixtures/policies/riverbend.json). */
export function riverbendPolicy(): Policy {
  return JSON.parse(readFileSync(join(process.cwd(), "fixtures", "policies", "riverbend.json"), "utf8")) as Policy;
}

/** The atlas when it knows the hospital (by CCN, else by name); the demo partner's policy when the case has no CCN; otherwise nothing. */
export async function defaultPolicyFor(c: Case): Promise<Policy | null> {
  const sheet = findHospital(c.hospitalCcn ? { ccn: c.hospitalCcn } : { name: c.hospitalName });
  if (sheet) return policyOf(sheet);
  return c.hospitalCcn ? null : riverbendPolicy();
}

/**
 * Runs the whole investigation inside the caller and persists the case (state and steps) after every step:
 * read bill → Medicare notice → compare → help program → letters → `ready_to_send`.
 * Stops in `unreadable`, `needs_notice`, `connector_unavailable` or `needs_review` when the case needs a person.
 */
export async function runInvestigation(store: Store, caseId: string, deps: PipelineDeps, opts: PipelineOpts = {}): Promise<Case> {
  const run = await load(store, caseId, deps, opts);
  run.summaries = {};
  if (run.c.state !== "reading") await save(run, "reading"); // from created, or unreadable after a new photo; anything else is illegal

  run.summaries.read_bill = "Reading the statement";
  await save(run);
  const bill = await billOf(run);
  if (!bill) {
    run.summaries.read_bill = "The photo is too dark or blurred to read. Take another photo.";
    await save(run, "unreadable");
    return run.c;
  }
  const t = bill.billTotals;
  run.c = { ...run.c, dueDate: t.dueDate, balanceCents: t.patientOwesCents };
  run.summaries.read_bill = `${bill.billLines.length} lines, ${formatUsd(t.patientOwesCents)} due ${shortDate(t.dueDate)}`;

  await pause(opts.delayMs);
  const msn = await fetchNotice(run);
  if (!msn) return run.c;
  return compareAndFinish(run, bill, msn);
}

/**
 * Continues a case parked in `needs_notice` (a notice document was added) or `connector_unavailable` (retry: a notice on
 * file first, else the connector again). Returns the case unchanged when there is nothing new to work with.
 */
export async function resumeInvestigation(store: Store, caseId: string, deps: PipelineDeps, opts: PipelineOpts = {}): Promise<Case> {
  const run = await load(store, caseId, deps, opts);
  if (run.c.state !== "needs_notice" && run.c.state !== "connector_unavailable") throw new Error(`Nothing to resume: case ${caseId} is ${run.c.state}`);
  const bill = await billOf(run);
  if (!bill) return runInvestigation(store, caseId, deps, opts);
  const onFile = readableMsn((await store.documentsFor(caseId)).find((d) => d.kind === "msn") ?? null);
  if (!onFile && run.c.state === "needs_notice") return run.c;
  const msn = onFile ?? (await fetchNotice(run));
  if (!msn) return run.c;
  return compareAndFinish(run, bill, msn);
}

async function load(store: Store, caseId: string, deps: PipelineDeps, opts: PipelineOpts): Promise<Run> {
  const c = await store.cases.get(caseId);
  if (!c) throw new Error(`No case ${caseId}`);
  const summaries = Object.fromEntries(c.steps.filter((s) => s.summary).map((s) => [s.key, s.summary])) as StepSummaries;
  return { store, deps, opts, c, summaries };
}

/** Persists the case with its steps rebuilt; moves state first when asked (and audits the move). */
async function save(run: Run, to?: CaseState, blocked?: StepKey): Promise<void> {
  const now = run.deps.now();
  if (to && to !== run.c.state) {
    const from = run.c.state;
    run.c = transition(run.c, to, now);
    await run.store.appendAudit(run.c.id, { at: now, actor: "system", role: "system", action: "state.changed", details: { from, to } });
  }
  run.c = { ...run.c, steps: buildSteps(run.c.state, run.summaries, blocked), updatedAt: now };
  await run.store.cases.put(run.c);
}

const pause = (ms?: number) => (ms ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());
const shortDate = (iso: string) => formatDate(iso).replace(/, \d{4}$/, "");

async function billOf(run: Run): Promise<ReadableBill | null> {
  const d = (await run.store.documentsFor(run.c.id)).find((d) => d.kind === "bill");
  return d && d.status === "readable" && d.billLines && d.billTotals ? (d as ReadableBill) : null;
}

function readableMsn(d: Document | null): ReadableMsn | null {
  return d && d.status === "readable" && d.msnLines && d.msnTotals ? (d as ReadableMsn) : null;
}

/** Asks the connector; parks the case in `connector_unavailable` or `needs_notice` (when that move is legal) and returns null. */
async function fetchNotice(run: Run): Promise<ReadableMsn | null> {
  run.summaries.fetch_notice = "Asking Medicare for the notice";
  await save(run);
  let doc: Document | null;
  try {
    doc = await run.deps.claims.fetchNotice({ caseId: run.c.id, fixtureKey: run.c.fixtureKey });
  } catch (e) {
    if (!(e instanceof ConnectorUnavailable)) throw e;
    run.summaries.fetch_notice = "Medicare's connection isn't responding. Try again, or photograph the paper notice.";
    await save(run, "connector_unavailable");
    return null;
  }
  const msn = readableMsn(doc);
  if (!msn) {
    run.summaries.fetch_notice = "Medicare has no notice on record for this visit yet. Photograph the paper notice when it arrives.";
    await save(run, "needs_notice");
    return null;
  }
  await run.store.documents.put(msn);
  return msn;
}

function noticeSummary(msn: ReadableMsn): string {
  const visit = msn.msnLines[0]?.serviceDate;
  const processed = /processed (\d{4}-\d{2}-\d{2})/.exec(msn.msnTotals.period)?.[1];
  return (visit ? `${shortDate(visit)} visit` : "Notice received") + (processed ? `, processed ${shortDate(processed)}` : "");
}

async function compareAndFinish(run: Run, bill: ReadableBill, msn: ReadableMsn): Promise<Case> {
  const { store, deps, opts } = run;
  run.summaries.fetch_notice = noticeSummary(msn);

  // 3. compare lines
  run.summaries.compare = "Comparing each line with the notice";
  await save(run, "comparing");
  await pause(opts.delayMs);
  const findings = findDiscrepancies({ caseId: run.c.id, bill: { lines: bill.billLines, totals: bill.billTotals }, msn: { lines: msn.msnLines, totals: msn.msnTotals } });
  // shortcut: finding ids are deterministic per case, so a rerun overwrites but never removes a stale finding; add a remove when reruns matter
  for (const f of findings) await store.findings.put(f);
  const n = bill.billLines.length;
  if (findings.some((f) => f.requiresReview)) {
    run.summaries.compare = "A billing specialist needs to check this bill before anything is asked.";
    await save(run, "needs_review");
    return run.c;
  }
  const flagged = findings.find((f) => f.kind === "line_not_patient_responsibility");
  const line = flagged ? bill.billLines.find((l) => l.n === flagged.evidence[0]?.line) : undefined;
  const gap = findings.filter((f) => f.kind === "patient_owes_exceeds_notice").reduce((a, f) => a + (f.amountCents ?? 0), 0);
  run.summaries.compare = line
    ? `${n - 1} of ${n} match. Line ${line.n}, ${formatUsd(line.chargeCents)}, needs asking`
    : `${n} of ${n} match. The bill agrees with the notice`;

  // 4. help program
  run.summaries.assistance = "Checking the hospital's financial assistance policy";
  await save(run, "checking_assistance");
  await pause(opts.delayMs);
  const policy = await deps.policyFor(run.c);
  const eligibility = eligibilityFor(run.c, policy);
  run.c = { ...run.c, eligibility };
  const estimate = estimateOpportunity(findings, eligibility, bill.billTotals.patientOwesCents);
  const prev = await store.resolutions.get(run.c.id);
  await store.resolutions.put({ caseId: run.c.id, confirmedAdjustmentCents: null, actualSavingsCents: null, basisDocumentId: null, ...prev, estimatedOpportunityCents: estimate.cents });
  run.summaries.assistance = assistanceSummary(eligibility, run.c.income != null);

  // 5. write letters
  const wantCorrection = gap > 0;
  const wantAssistance = eligibility.status !== "none";
  run.summaries.draft = wantCorrection && wantAssistance ? "Drafting the correction letter and the help application" : wantCorrection ? "Drafting the correction letter" : "Drafting the help application";
  await save(run, "drafting");
  await pause(opts.delayMs);
  const facts = factsFor(run.c, bill, msn, line, gap, eligibility, policy);
  const drafts = [...(wantCorrection ? [correctionDraft(facts)] : []), ...(wantAssistance ? [assistanceDraft(facts)] : [])];
  const failed: string[] = [];
  for (const d of drafts) {
    if (!validateDraft(d.draft, facts).ok) { failed.push(d.title); continue; }
    const a: Action = {
      id: `${run.c.id}-${d.kind}`, caseId: run.c.id, kind: d.kind, title: d.title, draft: d.draft, status: "drafted",
      validatedNumbers: [...new Set(numberTokens(d.draft).filter((t) => t.startsWith("$")))],
    };
    await store.actions.put(a);
    await store.appendAudit(run.c.id, { at: deps.now(), actor: "system", role: "system", action: "action.drafted", details: { actionId: a.id, kind: a.kind } });
  }
  if (failed.length) {
    // state.ts has no edge from drafting to needs_review, so the case stays in drafting with this step marked "needs you"
    const one = failed.length === 1;
    run.summaries.draft = `${one ? "One letter" : "Some letters"} mentioned a number not found in the case and ${one ? "was" : "were"} not saved. A person needs to look.`;
    await save(run, undefined, "draft");
    return run.c;
  }
  run.summaries.draft =
    drafts.length === 2 ? "Correction letter and help application ready for your approval"
    : wantCorrection ? "Correction letter ready for your approval"
    : wantAssistance ? "Help application ready for your approval"
    : "Nothing to send. The bill agrees with the notice.";
  await save(run, "ready_to_send");
  return run.c;
}

function eligibilityFor(c: Case, policy: Policy | null): Eligibility {
  const fpl = c.income ? fplPercent(c.income.annualCents, c.income.householdSize) : null;
  if (policy && fpl != null) return tierFor(policy, fpl);
  return { fplPercent: fpl, status: "unknown", discountPercent: null, quote: null, sourceUrl: null, hospitalCcn: c.hospitalCcn ?? null, basis: policy?.basis ?? "none" };
}

function assistanceSummary(e: Eligibility, hasIncome: boolean): string {
  switch (e.status) {
    case "free": return "Maybe free care, not confirmed";
    case "discount": return `Maybe ${e.discountPercent}% off, not confirmed`;
    case "none": return "Income appears above the policy's limits";
    default: return hasIncome ? "No published thresholds found for this hospital" : "Income not entered yet";
  }
}

function factsFor(c: Case, bill: ReadableBill, msn: ReadableMsn, line: BillLine | undefined, gap: number, e: Eligibility, policy: Policy | null): CaseFacts {
  const t = bill.billTotals;
  const note = line ? msn.msnLines.find((m) => m.code === line.code && m.serviceDate === line.serviceDate)?.note : undefined;
  return {
    patientName: c.patientName,
    helperName: c.helperName,
    hospitalName: c.hospitalName,
    accountMasked: bill.fields.find((f) => f.key === "account")?.value,
    statementDate: t.statementDate,
    dueDate: t.dueDate,
    askedCents: t.patientOwesCents,
    noticeMaxCents: msn.msnTotals.maxYouMayBeBilledCents,
    removedLine: line ? { n: line.n, code: line.code, description: line.description, chargeCents: line.chargeCents, noticeNote: note } : undefined,
    gapCents: gap > 0 ? gap : undefined,
    incomeAnnualCents: c.income?.annualCents,
    householdSize: c.income?.householdSize,
    fplPercent: e.fplPercent ?? undefined,
    tierPercent: e.status === "free" || e.status === "discount" ? e.discountPercent : null,
    policyQuote: e.quote,
    correctedCents: t.patientOwesCents - gap,
    windowDays: policy?.windowDays.value ?? null,
  };
}
