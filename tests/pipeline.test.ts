import { describe, expect, it } from "vitest";
import { SyntheticBlueButton } from "@/lib/adapters/claims/synthetic";
import { MemoryStore, seedDemo } from "@/lib/adapters/store";
import { loadCaseFixture } from "@/lib/fixtures";
import { formatUsd } from "@/lib/money";
import { defaultPolicyFor, resumeInvestigation, riverbendPolicy, runInvestigation, type PipelineDeps } from "@/lib/pipeline";
import { buildSteps, STEP_TITLES } from "@/lib/progress";
import { formatDate, formatPercent, numberTokens } from "@/lib/templates/facts";
import type { Case, Policy } from "@/lib/types";

const income = { annualCents: 3756000, householdSize: 1, source: "typed" as const };
let tick = 0;
const deps: PipelineDeps = {
  claims: new SyntheticBlueButton(),
  policyFor: async () => riverbendPolicy(),
  now: () => new Date(Date.UTC(2026, 10, 9, 4, 0, tick++)).toISOString(),
};

async function setup(caseId: string, patch: Partial<Case> = {}) {
  const store = new MemoryStore();
  await seedDemo(store);
  await store.cases.put({ ...(await store.cases.get(caseId))!, ...patch });
  return store;
}

/** Every number the case itself holds, formatted as the letters format them: an independent check on the stored drafts. */
async function caseNumbers(store: MemoryStore, caseId: string, policy: Policy): Promise<Set<string>> {
  const c = (await store.cases.get(caseId))!;
  const out = new Set<string>();
  const money = (n: number) => out.add(formatUsd(n));
  const date = (d: string) => { out.add(d); out.add(formatDate(d)); };
  const quoted = (q?: string | null) => { if (q) for (const t of numberTokens(q)) out.add(t); };
  for (const d of await store.documentsFor(caseId)) {
    for (const l of d.billLines ?? []) { money(l.chargeCents); date(l.serviceDate); quoted(l.description); }
    if (d.billTotals) { const t = d.billTotals; [t.totalChargesCents, t.adjustmentsCents, t.insurancePaidCents, t.patientOwesCents].forEach(money); date(t.dueDate); date(t.statementDate); }
    for (const l of d.msnLines ?? []) { [l.billedCents, l.approvedCents, l.medicarePaidCents, l.youMayBeBilledCents].forEach(money); quoted(l.note); }
    if (d.msnTotals) money(d.msnTotals.maxYouMayBeBilledCents);
  }
  if (c.income) money(c.income.annualCents);
  if (c.eligibility?.fplPercent != null) out.add(formatPercent(c.eligibility.fplPercent));
  if (c.eligibility?.discountPercent != null) out.add(formatPercent(c.eligibility.discountPercent));
  quoted(c.eligibility?.quote);
  if (policy.windowDays.value != null) out.add(String(policy.windowDays.value));
  return out;
}

async function expectDraftsGrounded(store: MemoryStore, caseId: string) {
  const allowed = await caseNumbers(store, caseId, riverbendPolicy());
  const actions = await store.actionsFor(caseId);
  expect(actions.length).toBeGreaterThan(0);
  for (const a of actions) {
    expect(a.status).toBe("drafted");
    expect(numberTokens(a.draft).filter((t) => !allowed.has(t))).toEqual([]);
    for (const n of a.validatedNumbers) expect(allowed.has(n)).toBe(true);
    expect(/appears|may not/.test(a.draft)).toBe(true);
    expect(a.draft).not.toMatch(/overcharge|error/i);
  }
}

describe("runInvestigation", () => {
  it("main case: ready to send, two letters, estimated $409.50, every step done", async () => {
    const store = await setup("demo", { income });
    const c = await runInvestigation(store, "demo", deps);
    expect(c.state).toBe("ready_to_send");
    expect(c.steps.map((s) => s.status)).toEqual(["done", "done", "done", "done", "done"]);
    expect(c.steps.map((s) => s.title)).toEqual(Object.values(STEP_TITLES).map((t) => t + ": done"));
    expect(c.steps[0].summary).toBe("5 lines, $466.00 due Nov 30");
    expect(c.steps[1].summary).toBe("Sep 14 visit, processed Oct 2");
    expect(c.steps[2].summary).toBe("4 of 5 match. Line 3, $240.00, needs asking");
    expect(c.steps[3].summary).toBe("Maybe 75% off, not confirmed");
    expect(c.eligibility).toMatchObject({ status: "discount", discountPercent: 75, fplPercent: 235.3, basis: "synthetic_policy" });
    expect((await store.actionsFor("demo")).map((a) => a.kind).sort()).toEqual(["assistance_application", "correction_request"]);
    expect((await store.resolutions.get("demo"))!.estimatedOpportunityCents).toBe(40950);
    expect((await store.findingsFor("demo")).map((f) => f.kind).sort()).toEqual(["line_not_patient_responsibility", "patient_owes_exceeds_notice"]);
    expect((await store.cases.get("demo"))!.state).toBe("ready_to_send");
    expect((await store.audit("demo")).filter((e) => e.action === "action.drafted").length).toBe(2);
    await expectDraftsGrounded(store, "demo");
  });

  it("missing notice: parks in needs_notice, then resumes to ready_to_send once a notice document is added", async () => {
    const store = await setup("edge-missing-notice", { income });
    const parked = await runInvestigation(store, "edge-missing-notice", deps);
    expect(parked.state).toBe("needs_notice");
    expect(parked.steps[0].status).toBe("done");
    expect(parked.steps[1]).toMatchObject({ title: "2. Medicare notice: needs you", status: "needs_you" });
    expect(parked.steps[2].status).toBe("waiting");
    expect(await store.actionsFor("edge-missing-notice")).toEqual([]);
    // nothing new yet: resume leaves the case where it is
    expect((await resumeInvestigation(store, "edge-missing-notice", deps)).state).toBe("needs_notice");
    const msn = loadCaseFixture("main").documents.find((d) => d.kind === "msn")!;
    await store.documents.put({ ...msn, id: "edge-missing-notice-msn", caseId: "edge-missing-notice" });
    const done = await resumeInvestigation(store, "edge-missing-notice", deps);
    expect(done.state).toBe("ready_to_send");
    expect(done.steps.every((s) => s.status === "done")).toBe(true);
    expect((await store.actionsFor("edge-missing-notice")).length).toBe(2);
    await expectDraftsGrounded(store, "edge-missing-notice");
  });

  it("duplicate lines: stops in needs_review with a possible_duplicate finding and no letters", async () => {
    const store = await setup("edge-needs-review", { income });
    const c = await runInvestigation(store, "edge-needs-review", deps);
    expect(c.state).toBe("needs_review");
    expect(c.steps[2]).toMatchObject({ title: "3. Compare lines: needs you", status: "needs_you" });
    expect(c.steps[3].status).toBe("waiting");
    const findings = await store.findingsFor("edge-needs-review");
    expect(findings.map((f) => f.kind)).toEqual(["possible_duplicate"]);
    expect(findings[0].requiresReview).toBe(true);
    expect(await store.actionsFor("edge-needs-review")).toEqual([]);
    expect(c.eligibility).toBeUndefined();
  });

  it("connector down: surfaces the recovery step, and a retry with a notice on file completes", async () => {
    const store = await setup("edge-connector-down", { income });
    const c = await runInvestigation(store, "edge-connector-down", deps);
    expect(c.state).toBe("connector_unavailable");
    expect(c.steps[1]).toMatchObject({ status: "needs_you", summary: "Medicare's connection isn't responding. Try again, or photograph the paper notice." });
    const done = await resumeInvestigation(store, "edge-connector-down", deps);
    expect(done.state).toBe("ready_to_send");
    expect((await store.actionsFor("edge-connector-down")).length).toBe(2);
  });

  it("no discrepancy: ready to send with only the assistance application", async () => {
    const store = await setup("edge-no-discrepancy", { income: { annualCents: 2200000, householdSize: 1, source: "typed" } });
    const c = await runInvestigation(store, "edge-no-discrepancy", deps);
    expect(c.state).toBe("ready_to_send");
    expect(c.steps[2].summary).toBe("2 of 2 match. The bill agrees with the notice");
    expect(c.steps[3].summary).toBe("Maybe free care, not confirmed");
    expect(c.eligibility).toMatchObject({ status: "free", fplPercent: 137.8 });
    expect((await store.actionsFor("edge-no-discrepancy")).map((a) => a.kind)).toEqual(["assistance_application"]);
    expect((await store.findingsFor("edge-no-discrepancy")).map((f) => f.kind)).toEqual(["no_discrepancy"]);
    expect((await store.resolutions.get("edge-no-discrepancy"))!.estimatedOpportunityCents).toBe(7600);
    await expectDraftsGrounded(store, "edge-no-discrepancy");
  });

  it("unreadable bill: stops in unreadable with the first step needing the caregiver", async () => {
    const store = await setup("edge-unreadable");
    const c = await runInvestigation(store, "edge-unreadable", deps);
    expect(c.state).toBe("unreadable");
    expect(c.steps[0]).toMatchObject({ title: "1. Read the bill: needs you", status: "needs_you" });
    expect(c.balanceCents).toBeUndefined();
  });

  it("refuses to start a case that is already past reading", async () => {
    const store = await setup("demo", { income });
    await runInvestigation(store, "demo", deps);
    await expect(runInvestigation(store, "demo", deps)).rejects.toThrow(/Illegal transition/);
    await expect(resumeInvestigation(store, "demo", deps)).rejects.toThrow(/Nothing to resume/);
  });
});

describe("runInvestigation, tolerant (pages with covered values)", () => {
  const tolerant = { tolerant: true };
  const noNotice: PipelineDeps = { ...deps, claims: { kind: "dropped_document", state: async () => "connected", fetchNotice: async () => null } };

  it("goes on without a notice: ready to send with an insufficient_information finding", async () => {
    const store = await setup("edge-missing-notice", { income });
    const c = await runInvestigation(store, "edge-missing-notice", noNotice, tolerant);
    expect(c.state).toBe("ready_to_send");
    expect(c.steps.map((s) => s.status)).toEqual(["done", "done", "done", "done", "done"]);
    expect(c.steps[1].summary).toBe("No notice to compare with");
    expect(c.steps[2].summary).not.toMatch(/agrees|match/);
    const findings = await store.findingsFor("edge-missing-notice");
    expect(findings.map((f) => [f.kind, f.amountCents, f.requiresReview])).toEqual([["insufficient_information", null, false]]);
    // the help program and its letter still run, on the whole balance; no correction letter without a notice
    expect(c.eligibility).toMatchObject({ status: "discount", discountPercent: 75 });
    expect((await store.actionsFor("edge-missing-notice")).map((a) => a.kind)).toEqual(["assistance_application"]);
    expect((await store.resolutions.get("edge-missing-notice"))!.estimatedOpportunityCents).toBe(34950);
    expect((await store.documentsFor("edge-missing-notice")).some((d) => d.kind === "msn")).toBe(false);
    await expectDraftsGrounded(store, "edge-missing-notice");
    // off by default: the same connector parks the regular run
    const regular = await setup("edge-missing-notice", { income });
    expect((await runInvestigation(regular, "edge-missing-notice", noNotice)).state).toBe("needs_notice");
  });

  it("does not park the duplicate-EKG case", async () => {
    const store = await setup("edge-needs-review", { income });
    const c = await runInvestigation(store, "edge-needs-review", deps, tolerant);
    expect(c.state).toBe("ready_to_send");
    const findings = await store.findingsFor("edge-needs-review");
    expect(findings.map((f) => f.kind)).toEqual(["possible_duplicate"]);
    expect(findings[0].requiresReview).toBe(true);
    expect(c.steps[2].summary).not.toMatch(/agrees/);
    expect((await store.actionsFor("edge-needs-review")).map((a) => a.kind)).toEqual(["assistance_application"]);
  });

  it("still parks when the connector is down", async () => {
    const store = await setup("edge-connector-down", { income });
    expect((await runInvestigation(store, "edge-connector-down", deps, tolerant)).state).toBe("connector_unavailable");
  });
});

describe("runInvestigation with deps.drafts", () => {
  type Ctx = Parameters<NonNullable<PipelineDeps["drafts"]>>[0];

  it("calls it once even when the income is above every tier, and it alone decides which letters exist", async () => {
    const store = await setup("demo", { income: { ...income, annualCents: 20000000 } });
    const seen: Ctx[] = [];
    const drafts = (ctx: Ctx) => {
      seen.push(ctx);
      return [{ kind: "information_request" as const, title: "Ask", draft: `The statement asks for ${formatUsd(ctx.facts.askedCents)}.`, facts: ctx.facts }];
    };
    const c = await runInvestigation(store, "demo", { ...deps, drafts });
    expect(seen).toHaveLength(1);
    expect(seen[0].eligibility.status).toBe("none");
    expect(seen[0].policy?.basis).toBe("synthetic_policy");
    expect(seen[0].findings.map((f) => f.kind).sort()).toEqual(["line_not_patient_responsibility", "patient_owes_exceeds_notice"]);
    expect(seen[0].facts).toMatchObject({ askedCents: 46600, noticeMaxCents: 22600, gapCents: 24000 });
    expect(c.state).toBe("ready_to_send");
    // the templates would have written a correction letter here
    const actions = await store.actionsFor("demo");
    expect(actions.map((a) => [a.kind, a.title, a.validatedNumbers])).toEqual([["information_request", "Ask", ["$466.00"]]]);

    const none = await setup("demo", { income });
    expect((await runInvestigation(none, "demo", { ...deps, drafts: () => [] })).state).toBe("ready_to_send");
    expect(await none.actionsFor("demo")).toEqual([]);
  });

  it("checks each letter against the facts it returns: a number its own facts do not allow leaves the case in drafting", async () => {
    const store = await setup("demo", { income });
    const text = "The enclosed income letter shows $3,130.00 a month.";
    const c = await runInvestigation(store, "demo", {
      ...deps,
      drafts: ({ facts }) => [
        { kind: "assistance_application", title: "Apply", draft: text, facts: { ...facts, extraCents: [313000] } },
        { kind: "information_request", title: "Ask", draft: text, facts },
      ],
    });
    expect(c.state).toBe("drafting");
    expect(c.steps[4]).toMatchObject({ title: "5. Write letters: needs you", status: "needs_you" });
    expect((await store.actionsFor("demo")).map((a) => a.kind)).toEqual(["assistance_application"]);
  });
});

describe("defaultPolicyFor", () => {
  it("uses the demo partner's policy when the case has no CCN and nothing when an unknown CCN is given", async () => {
    const c = (await setup("demo").then((s) => s.cases.get("demo")))!;
    expect((await defaultPolicyFor(c))?.basis).toBe("synthetic_policy");
    expect(await defaultPolicyFor({ ...c, hospitalCcn: "000000", hospitalName: "No Such Hospital" })).toBeNull();
  });
});

describe("buildSteps", () => {
  it("maps states to the mock's rows and suffixes", () => {
    expect(buildSteps("created").map((s) => s.title)).toEqual(Object.values(STEP_TITLES));
    expect(buildSteps("reading", { read_bill: "Reading the statement" })[0]).toMatchObject({ title: "1. Read the bill: working", status: "active" });
    expect(buildSteps("reading", { read_bill: "5 lines", fetch_notice: "Asking" }).map((s) => s.status)).toEqual(["done", "active", "waiting", "waiting", "waiting"]);
    expect(buildSteps("drafting").map((s) => s.status)).toEqual(["done", "done", "done", "done", "active"]);
    expect(buildSteps("drafting", {}, "draft")[4]).toMatchObject({ title: "5. Write letters: needs you", status: "needs_you" });
    expect(buildSteps("sent").every((s) => s.status === "done")).toBe(true);
  });
});
