import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getStore, MemoryStore, seedDemo } from "@/lib/adapters/store";
import type { CaseFixture } from "@/lib/adapters/store/seed";
import type { Action, Case, Consent, Document, Finding, Resolution, ResponseLetter } from "@/lib/types";
import { billLines, billTotals, msnLines, msnTotals } from "./helpers/synthetic";

const now = "2026-11-09T04:00:00.000Z";
const mainCase: Case = {
  id: "case-main", code: "SNAP-7K2M9P", state: "ready_to_send", patientName: "Dorothy M. Hale (synthetic)", helperName: "Jenna Hale (synthetic)",
  hospitalName: "Riverbend Community Hospital", ownerId: "u-jenna", fixtureKey: "main",
  consent: { caseId: "case-main", grantedAt: now, grantedBy: "u-jenna", role: "helper", scope: "investigate_and_prepare" },
  income: { annualCents: 3756000, householdSize: 1, source: "typed" }, dueDate: "2026-11-30", balanceCents: 46600, steps: [], createdAt: now, updatedAt: now,
};
const bill: Document = { id: "doc-bill", caseId: "case-main", kind: "bill", fileName: "bill-main.png", pages: 1, fields: [], billLines, billTotals, status: "readable", uploadedAt: now };
const msn: Document = { id: "doc-msn", caseId: "case-main", kind: "msn", fileName: "msn-main.png", pages: 2, fields: [], msnLines, msnTotals, status: "readable", uploadedAt: now };
const finding: Finding = { id: "f1", caseId: "case-main", kind: "patient_owes_exceeds_notice", amountCents: 24000, confidence: "likely", explanation: "The bill appears to ask for $240.00 more than the notice allows.", evidence: [billLines[2].source, msnLines[2].source], requiresReview: false };
const action: Action = { id: "a1", caseId: "case-main", kind: "correction_request", title: "Ask about line 3", draft: "…", status: "drafted", validatedNumbers: ["$240.00"] };
const resolution: Resolution = { caseId: "case-main", estimatedOpportunityCents: 40950, confirmedAdjustmentCents: null, actualSavingsCents: null, basisDocumentId: null };
const consent: Consent = mainCase.consent!;
const response: ResponseLetter = { id: "r1", caseId: "case-main", text: "SYNTHETIC — demo partner response", quotedLine: "Q9967", tierApplied: 75, newBalanceCents: 5650, receivedAt: now, simulated: true };

async function fill(store: MemoryStore) {
  await store.cases.put(mainCase);
  await store.documents.put(bill);
  await store.documents.put(msn);
  await store.findings.put(finding);
  await store.actions.put(action);
  await store.resolutions.put(resolution);
  await store.consents.put(consent);
  await store.responses.put(response);
}

describe("memory store", () => {
  it("round-trips every collection and filters by case", async () => {
    const store = new MemoryStore();
    await fill(store);
    expect(await store.cases.get("case-main")).toEqual(mainCase);
    expect(await store.documents.get("doc-bill")).toEqual(bill);
    expect(await store.findings.get("f1")).toEqual(finding);
    expect(await store.actions.get("a1")).toEqual(action);
    expect(await store.resolutions.get("case-main")).toEqual(resolution);
    expect(await store.consents.get("case-main")).toEqual(consent);
    expect(await store.responses.get("r1")).toEqual(response);
    expect(await store.cases.get("nope")).toBeNull();
    expect((await store.documentsFor("case-main")).map((d) => d.id).sort()).toEqual(["doc-bill", "doc-msn"]);
    expect(await store.findingsFor("case-main")).toEqual([finding]);
    expect(await store.actionsFor("other")).toEqual([]);
    expect(await store.ownerOf("case-main")).toBe("u-jenna");
    expect(await store.ownerOf("nope")).toBeNull();
  });

  it("does not share references with callers", async () => {
    const store = new MemoryStore();
    const c = { ...mainCase };
    await store.cases.put(c);
    c.patientName = "changed";
    const got = (await store.cases.get("case-main"))!;
    expect(got.patientName).toBe(mainCase.patientName);
    got.patientName = "changed again";
    expect((await store.cases.get("case-main"))!.patientName).toBe(mainCase.patientName);
  });

  it("appends audit events with monotonic ids per case and keeps meta", async () => {
    const store = new MemoryStore();
    await store.appendAudit("case-main", { at: now, actor: "u-jenna", role: "helper", action: "case.created" });
    const second = await store.appendAudit("case-main", { at: now, actor: "u-jenna", role: "helper", action: "consent.granted" });
    expect(second.id).toBe(2);
    expect((await store.audit("case-main")).map((e) => e.id)).toEqual([1, 2]);
    expect(await store.audit("other")).toEqual([]);
    expect(await store.meta.get("demo_clock_offset_ms")).toBeUndefined();
    await store.meta.set("demo_clock_offset_ms", "1036800000");
    expect(await store.meta.get("demo_clock_offset_ms")).toBe("1036800000");
  });

  it("deleteCaseData removes personal data but keeps the audit log and a tombstone", async () => {
    const store = new MemoryStore();
    await fill(store);
    await store.appendAudit("case-main", { at: now, actor: "u-jenna", role: "helper", action: "case.created" });
    const deletedAt = "2026-11-10T00:00:00.000Z";
    const tomb = await store.deleteCaseData("case-main", deletedAt);
    expect(tomb).toMatchObject({ id: "case-main", state: "closed", deletedAt, patientName: "", consent: null, income: null });
    expect(tomb!.helperName).toBeUndefined();
    expect(tomb!.balanceCents).toBeUndefined();
    expect(await store.cases.get("case-main")).toEqual(tomb);
    expect(await store.documentsFor("case-main")).toEqual([]);
    expect(await store.findingsFor("case-main")).toEqual([]);
    expect(await store.actionsFor("case-main")).toEqual([]);
    expect(await store.consents.get("case-main")).toBeNull();
    expect(await store.responses.list({ caseId: "case-main" })).toEqual([]);
    expect((await store.audit("case-main")).length).toBe(1);
    expect(await store.deleteCaseData("nope")).toBeNull();
  });
});

describe("seedDemo", () => {
  const keys = ["main", "edge-unreadable", "edge-missing-notice", "edge-no-discrepancy", "edge-needs-review", "edge-connector-down"];
  const dir = mkdtempSync(join(tmpdir(), "cases-"));
  for (const key of keys) {
    const fx: CaseFixture = {
      case: { ...mainCase, id: `case-${key}`, code: `SNAP-${key.slice(0, 6).toUpperCase()}`, fixtureKey: key, consent: null },
      documents: key === "main" ? [bill, msn] : [{ ...bill, id: `doc-bill-${key}`, caseId: `case-${key}` }],
      consentText: "I ask Kindred Snap to look into this bill and prepare letters for me to approve.",
    };
    writeFileSync(join(dir, `${key}.json`), JSON.stringify(fx));
  }

  it("loads six cases with their documents and is idempotent", async () => {
    const store = new MemoryStore();
    expect(await seedDemo(store, dir)).toBe(6);
    expect(await seedDemo(store, dir)).toBe(6);
    expect((await store.listCases()).length).toBe(6);
    expect((await store.documentsFor("case-main")).length).toBe(2);
    expect((await store.documents.list()).length).toBe(7);
  });

  it.skipIf(!existsSync("fixtures/cases"))("loads the six committed fixtures", async () => {
    const store = new MemoryStore();
    await seedDemo(store);
    const cases = await store.listCases();
    expect(cases.length).toBe(6);
    expect(cases.every((c) => c.hospitalName === "Riverbend Community Hospital")).toBe(true);
    expect(cases.find((c) => c.fixtureKey === "main")).toBeDefined();
  });
});

describe("getStore", () => {
  afterEach(() => { globalThis.__snapStore = undefined; delete process.env.STORE; });
  it("returns one singleton", () => {
    expect(getStore()).toBe(getStore());
    expect(getStore()).toBeInstanceOf(MemoryStore);
  });
  it("STORE=supabase without the service-role key fails clearly", () => {
    process.env.STORE = "supabase";
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => getStore()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    if (saved !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  });
});
