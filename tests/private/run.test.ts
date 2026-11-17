import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SyntheticBlueButton } from "@/lib/adapters/claims/synthetic";
import * as stores from "@/lib/adapters/store";
import { riverbendPolicy, runInvestigation } from "@/lib/pipeline";
import { STEP_TITLES } from "@/lib/private/copy";
import { join } from "@/lib/private/join";
import { demoMatch, documentsOf, privateSteps, runStateless } from "@/lib/private/run";
import { boundRead } from "@/lib/private/scrub";
import type { Joined, PrivateOutcome, PrivatePolicy, PrivateRead, PrivateResult } from "@/lib/private/types";
import * as serverStore from "@/lib/server/store";

const TODAY = "2026-11-17";
const table = JSON.parse(readFileSync("fixtures/private/reads.json", "utf8")) as Record<string, { read: unknown }>;
const demo = (id: string, page: number) => boundRead(table[id].read, page, TODAY);
const BILL = demo("bill-main", 1);
const MSN = demo("msn-main", 2);
const INCOME = demo("income-letter", 3);
const empty = (kind: PrivateRead["kind"], page: number): PrivateRead => boundRead({ kind }, page, TODAY);
const lines = (r: PrivateRead, change: (l: PrivateRead["lines"][number]) => Partial<PrivateRead["lines"][number]>) => ({ ...r, lines: r.lines.map((l) => ({ ...l, ...change(l) })) });

const deps = { match: demoMatch, today: TODAY, demo: true };
const matching = (over: Partial<PrivatePolicy>) => ({ ...deps, match: (h: PrivateRead["hospital"]) => { const p = demoMatch(h); return p && { ...p, ...over }; } });
const EXCLUDES = { value: false, quote: "Financial assistance under this policy is for patients who have no health insurance.", sourceUrl: null, checkedOn: null };
async function ok(reads: PrivateRead[], d: Parameters<typeof runStateless>[1] = deps, size?: 1 | 2 | 3 | 4): Promise<PrivateResult> {
  const out = await runStateless(reads, d, size);
  if (out.status !== "ok") throw new Error(`not ok: ${JSON.stringify(out)}`);
  return out.result;
}

// private mode has a store of its own for one call: the process-wide one is never asked for
const getStore = vi.spyOn(stores, "getStore");
const getServerStore = vi.spyOn(serverStore, "getServerStore");
afterEach(() => {
  expect(getStore).not.toHaveBeenCalled();
  expect(getServerStore).not.toHaveBeenCalled();
});

describe("demoMatch", () => {
  it("answers the demo partner's policy and its synthetic coverage sentence for the demo partner's name, and nothing else", () => {
    const p = demoMatch({ name: "RIVERBEND COMMUNITY HOSPITAL.", city: null, state: null });
    expect(p).toEqual({
      ccn: null, name: "Riverbend Community Hospital", city: "Tacoma", state: "WA", exact: true, policy: riverbendPolicy(),
      insuredCovered: { value: true, quote: "Patients with insurance, including Medicare, may apply for help with the amount they owe after insurance.", sourceUrl: null, checkedOn: null },
      otherConditions: [],
    });
    expect(demoMatch(BILL.hospital)).toEqual(p);
    expect(demoMatch({ name: "Lakeside Medical Center", city: "Tacoma", state: "WA" })).toBeNull();
    expect(demoMatch(null)).toBeNull();
  });
});

describe("runStateless on the uncovered demo reads", () => {
  it("finds what the regular investigation finds on the main fixture: $240.00 on line 3", async () => {
    const store = new stores.MemoryStore();
    await stores.seedDemo(store);
    await runInvestigation(store, "demo", { claims: new SyntheticBlueButton(), policyFor: async () => riverbendPolicy(), now: () => `${TODAY}T00:00:00.000Z` });
    const regular = (await store.findingsFor("demo")).map((f) => [f.kind, f.amountCents, f.confidence]);
    const r = await ok([BILL, MSN, INCOME]);
    expect(r.findings.map((f) => [f.kind, f.amountCents, f.confidence])).toEqual(regular);
    expect(r.findings.map((f) => f.kind)).toEqual(["patient_owes_exceeds_notice", "line_not_patient_responsibility"]);
    expect(r).toMatchObject({ outcome: "line_found", balanceCents: 46600, dueDate: "2026-11-30", noticeKind: "msn", coverage: "covered", demo: true, leftOut: { other: 0, unreadable: 0, secondStatement: false } });
    // evidence composed from the values that were read, and no explanation text
    expect(r.findings[1]).toEqual({
      kind: "line_not_patient_responsibility", amountCents: 24000, confidence: "likely", billLine: 3,
      evidence: ["Bill line 3, Q9967, Sep 14, 2026, $240.00", "Medicare notice line 3, Q9967, Sep 14, 2026, you may be billed $0.00"],
    });
    expect(r.findings[0].evidence.slice(0, 2)).toEqual(["Bill, amount you owe $466.00", "Medicare notice, the most you may be billed $226.00"]);
    expect(JSON.stringify(r)).not.toMatch(/explanation|\[removed\]/);
  });

  it("lists 75% off for a household of one and free care for two to four, and estimates 40950", async () => {
    const r = await ok([BILL, MSN, INCOME]);
    expect(r.help).toBe("by_household");
    expect(r.households).toEqual([
      { size: 1, fplPercent: 235.3, status: "discount", discountPercent: 75, incomeUpToCents: null },
      { size: 2, fplPercent: 173.6, status: "free", discountPercent: 100, incomeUpToCents: null },
      { size: 3, fplPercent: 137.5, status: "free", discountPercent: 100, incomeUpToCents: null },
      { size: 4, fplPercent: 113.8, status: "free", discountPercent: 100, incomeUpToCents: null },
    ]);
    expect(r.estimate).toEqual({ cents: 40950, parts: [{ label: "Line the notice shows as not yours to pay", cents: 24000 }, { label: "Help listed for a household of one", cents: 16950 }] });
    expect(r.assumptions.map((a) => a.key)).toEqual(["household_size", "coverage_type"]);
    expect(r.letters.map((l) => [l.kind, l.title])).toEqual([["correction_request", "Ask Patient Financial Services to Review Line 3"], ["assistance_application", "Help Application"]]);
    expect(r.policy).toEqual(demoMatch(BILL.hospital));
  });

  it("builds the five rows from the private copy, all done", async () => {
    const r = await ok([BILL, MSN, INCOME]);
    expect(r.steps.map((s) => s.title)).toEqual([...STEP_TITLES]);
    expect(r.steps.every((s) => s.status === "done")).toBe(true);
    expect(r.steps.map((s) => s.summary)).toEqual([
      "3 pages read.", "Medicare notice found.", "Line 3 is $240.00 the notice shows as not yours to pay.", "For a household of one, the policy lists 75% off. Assumed.", "Letters ready to print.",
    ]);
    const { steps, ...rest } = r;
    expect(privateSteps(rest, 3)).toEqual(steps);
  });

  it("the same tier for every household size is said without the assumption", async () => {
    const poor = await ok([BILL, MSN, { ...INCOME, income: { cents: 1200000, period: "year" } }]);
    expect(poor.help).toBe("same_tier");
    expect(poor.steps[3].summary).toBe("For households of one to four, the policy lists free care.");
    // 22600 left after the line, all of it listed as free care
    expect(poor.estimate).toMatchObject({ cents: 46600 });
    const rich = await ok([BILL, MSN, { ...INCOME, income: { cents: 20000000, period: "year" } }]);
    expect(rich.help).toBe("same_tier");
    expect(rich.steps[3].summary).toBe("For households of one to four, the policy lists no discount.");
    expect(rich.estimate).toEqual({ cents: 24000, parts: [{ label: "Line the notice shows as not yours to pay", cents: 24000 }] });
    expect(rich.letters.map((l) => l.kind)).toEqual(["correction_request", "assistance_application"]);
  });
});

describe("runStateless, what stops a check", () => {
  it("maps a stop of the join to needs_amount or unreadable", async () => {
    expect(await runStateless([], deps)).toEqual({ status: "needs_amount", reason: "no_bill" });
    expect(await runStateless([demo("bill-main-amount-covered", 1), MSN], deps)).toEqual({ status: "needs_amount", reason: "covered" });
    expect(await runStateless([{ ...BILL, patientOwesCents: null }], deps)).toEqual({ status: "needs_amount", reason: "not_found" });
    expect(await runStateless([BILL, { ...BILL, page: 2, patientOwesCents: 12000 }], deps)).toEqual({ status: "needs_amount", reason: "two_bills" });
    expect(await runStateless([empty("unreadable", 1), empty("unreadable", 2)], deps)).toEqual({ status: "unreadable", reason: "too_dark" });
  });

  it("a letter that fails its number check returns failed, never a partial packet", async () => {
    // a figure-shaped name is not a number of the case
    expect(await runStateless([BILL, MSN, INCOME], matching({ name: "Riverbend 12.5% Community Hospital" }))).toEqual({ status: "failed" });
  });
});

describe("runStateless, coverage decides whether a percent may appear", () => {
  it("a policy that excludes insured patients yields no percent anywhere in the serialised outcome", async () => {
    const out = await runStateless([BILL, MSN, INCOME], matching({ insuredCovered: EXCLUDES }));
    const text = JSON.stringify(out);
    expect(text).not.toContain("%");
    expect(text).not.toMatch(/Percent":\s*\d|235\.3|16950|40950/);
    const r = (out as Extract<PrivateOutcome, { status: "ok" }>).result;
    expect(r).toMatchObject({ outcome: "line_found", coverage: "not_covered", help: "insured_not_covered", households: null });
    // mock PM3c: the line alone
    expect(r.estimate).toEqual({ cents: 24000, parts: [{ label: "Line the notice shows as not yours to pay", cents: 24000 }] });
    expect(r.letters.map((l) => l.kind)).toEqual(["correction_request"]);
    expect(r.policy).toMatchObject({ name: "Riverbend Community Hospital", insuredCovered: EXCLUDES, policy: { freeCareMaxFpl: { value: null, quote: null }, tiers: { value: [], quote: null } } });
    expect(r.assumptions.map((a) => a.key)).toEqual(["coverage_type"]);
    expect(r.steps[3].summary).toBe("The policy may not cover patients who have insurance.");
  });

  it("the same policy with no statement dropped: insurance is not known, so the ceilings and no single percent", async () => {
    const r = await ok([BILL, INCOME], matching({ insuredCovered: EXCLUDES }));
    expect(r).toMatchObject({ coverage: "insurance_unknown", help: "ceilings", estimate: null });
    expect(r.households?.map((h) => [h.fplPercent, h.discountPercent, h.incomeUpToCents])).toEqual([[null, null, 3192000], [null, null, 4328000], [null, null, 5464000], [null, null, 6600000]]);
    expect(r.letters.map((l) => l.kind)).toEqual(["information_request", "assistance_application"]);
  });

  it("a policy that does not say shows the percent, and the result says the policy does not say", async () => {
    const r = await ok([BILL, MSN, INCOME], matching({ insuredCovered: { value: null, quote: null, sourceUrl: null, checkedOn: null } }));
    expect(r).toMatchObject({ coverage: "not_stated", help: "by_household", estimate: { cents: 40950 } });
  });

  it("Alaska and Hawaii give no percent: the only guideline is for the 48 states and DC", async () => {
    for (const state of ["AK", "HI"]) {
      const r = await ok([BILL, MSN, INCOME], matching({ state }));
      expect(r, state).toMatchObject({ help: "no_thresholds", households: null, estimate: { cents: 24000, parts: [{ cents: 24000 }] } });
      expect(r.assumptions.map((a) => a.key), state).toEqual(["coverage_type", "guideline_region"]);
      expect(r.steps[3].summary).toBe("We couldn't work out a discount.");
      // the policy's own sentences, on the result and quoted in the help application, are the only percents left
      expect(JSON.stringify({ ...r, policy: null, letters: null }), state).not.toMatch(/%|235\.3|16950/);
      expect(r.letters.map((l) => l.kind), state).toEqual(["correction_request", "assistance_application"]);
    }
  });

  it("a policy with no thresholds gives no table, and no hospital gives no policy at all", async () => {
    const p = riverbendPolicy();
    const bare = await ok([BILL, MSN, INCOME], matching({ policy: { ...p, freeCareMaxFpl: { ...p.freeCareMaxFpl, value: null }, tiers: { ...p.tiers, value: [] } } }));
    expect(bare).toMatchObject({ help: "no_thresholds", households: null, estimate: { cents: 24000 } });
    const unknown = await ok([BILL, MSN, INCOME], { ...deps, match: () => null });
    expect(unknown).toMatchObject({ help: "no_hospital", coverage: "no_policy", policy: null, households: null, estimate: { cents: 24000 } });
    expect(unknown.steps[3].summary).toBe("We couldn't tell which hospital.");
  });
});

describe("runStateless, what it never does", () => {
  it("leaves a policy's CCN, phone and link as the atlas wrote them: only what was read off a page is scrubbed", async () => {
    const p = riverbendPolicy();
    const atlas: Partial<PrivatePolicy> = {
      ccn: "500123",
      policy: { ...p, hospitalCcn: "500123", phone: { value: "(253) 555-0142", quote: "Call (253) 555-0142.", sourceUrl: "https://example.org/fap/2026000123", checkedOn: "2026-10-01" }, formUrl: { ...p.formUrl, value: "https://example.org/apply?id=1234567" } },
      otherConditions: [{ label: "Assets", quote: "Savings above $10,000 are counted. Questions: fap@example.org", sourceUrl: "https://example.org/fap", checkedOn: "2026-10-01" }],
    };
    const r = await ok([BILL, MSN, INCOME], matching(atlas));
    expect(r.policy).toEqual({ ...demoMatch(BILL.hospital), ...atlas });
    expect(JSON.stringify(r)).not.toContain("[removed]");
  });

  it("carries no sentence of the regular pipeline in any outcome", async () => {
    const outcomes = await Promise.all([
      runStateless([BILL, MSN, INCOME], deps),
      runStateless([BILL], deps),
      runStateless([BILL, { ...MSN, kind: "eob" }, INCOME], deps),
      runStateless([BILL, { ...MSN, noticeMaxCents: 20000 }], deps),
      runStateless([{ ...BILL, patientOwesCents: 22600 }, MSN, INCOME], deps),
      runStateless([BILL, MSN, INCOME], matching({ insuredCovered: EXCLUDES })),
      runStateless([BILL, MSN, INCOME], { ...deps, match: () => null }),
      // two lines with the same code on the same day: a possible duplicate, which parks nothing here
      runStateless([lines(BILL, (l) => (l.n === 5 ? { code: "96374" } : {})), MSN, INCOME], deps),
      runStateless([demo("bill-main-amount-covered", 1)], deps),
    ]);
    expect(outcomes.map((o) => o.status)).toEqual(["ok", "ok", "ok", "ok", "ok", "ok", "ok", "ok", "needs_amount"]);
    for (const o of outcomes) for (const word of ["approval", "specialist", "on record", "entered", "Photograph", "Dorothy", "Hale", "undefined", "NaN"]) expect(JSON.stringify(o), word).not.toContain(word);
  });

  it("leaves a possible duplicate out of the result: no reviewer exists here to send it to", async () => {
    // two lines with the same code on the same day
    const twice = lines(BILL, (l) => (l.n === 5 ? { code: "96374" } : {}));
    expect((await ok([twice, MSN, INCOME])).findings.map((f) => f.kind)).toEqual(["patient_owes_exceeds_notice", "line_not_patient_responsibility"]);
    // with nothing else to ask about, the two lines are not listed as unexplained evidence either
    const nothing = await ok([{ ...twice, patientOwesCents: 22600 }, MSN, INCOME]);
    expect(nothing.outcome).toBe("nothing_found");
    expect(nothing.findings).toEqual([]);
  });

  it("hands the pipeline documents with amounts, codes and dates only: no field, no description and no notice note", () => {
    // values no reader key carries, forced onto the reads
    const rogue = { description: "Dorothy M. Hale", note: "The facility may not bill you separately for it.", service: "CT scan" };
    const billRead = lines(BILL, (l) => ({ ...rogue, ...(l.n === 4 ? { code: null, serviceDate: null } : {}) }));
    const j = join([{ ...billRead, statementDate: null }, lines(MSN, (l) => ({ ...rogue, n: l.n }))]) as Joined;
    const { bill, notice } = documentsOf(j, TODAY);
    expect(bill).toMatchObject({ id: "private-bill", caseId: "private", kind: "bill", fileName: "", fields: [], status: "readable" });
    expect(bill.billLines!.map((l) => l.description)).toEqual(["", "", "", "", ""]);
    expect(bill.billLines![3]).toEqual({ n: 4, code: "", serviceDate: "", chargeCents: 31000, description: "", source: { documentId: "private-bill", page: 1, line: 4, quote: "Bill line 4, $310.00" } });
    expect(bill.billTotals).toMatchObject({ patientOwesCents: 46600, statementDate: "", dueDate: "2026-11-30" });
    // factsFor looks a notice note up by code and date, which blank values could match wrongly: there is no note to find
    expect(notice!.kind).toBe("msn");
    expect(notice!.msnLines).toHaveLength(5);
    for (const l of notice!.msnLines!) expect(Object.keys(l).sort()).toEqual(["approvedCents", "billedCents", "code", "medicarePaidCents", "n", "service", "serviceDate", "source", "youMayBeBilledCents"]);
    expect(notice!.msnLines!.map((l) => l.service)).toEqual(["", "", "", "", ""]);
    expect(JSON.stringify([bill, notice])).not.toMatch(/Dorothy|separately|CT scan/);
    expect(documentsOf(join([BILL]) as Joined, TODAY).notice).toBeNull();
  });

  it("writes no notice note into a letter, whatever the pages carried", async () => {
    const rogue = { note: "The facility may not bill you separately for it." };
    const r = await ok([lines(BILL, () => ({ code: null, serviceDate: null })), lines(MSN, () => ({ ...rogue, code: null, serviceDate: null })), INCOME]);
    expect(r.outcome).toBe("line_possible");
    expect(JSON.stringify(r)).not.toContain("separately for it");
  });

  it("logs nothing and asks for no store: no console call in private code, no store getter in the stateless run", () => {
    for (const file of readdirSync("src/lib/private")) expect(readFileSync(`src/lib/private/${file}`, "utf8"), file).not.toMatch(/console\./);
    for (const file of ["run.ts", "join.ts", "letters.ts"]) expect(readFileSync(`src/lib/private/${file}`, "utf8"), file).not.toMatch(/getStore|getServerStore|SyntheticBlueButton|defaultPolicyFor/);
  });
});
