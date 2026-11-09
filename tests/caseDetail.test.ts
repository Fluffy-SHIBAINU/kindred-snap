import { describe, expect, it } from "vitest";
import { MemoryStore, seedDemo } from "@/lib/adapters/store";
import { findDiscrepancies } from "@/lib/compare";
import { BasisRequired } from "@/lib/savings";
import { DEMO_STAFF, ReasonRequired, WrongState, deliverResponse, editField, missingInformation, recordResolution, reviewFinding } from "@/lib/staff/caseDetail";
import type { Case } from "@/lib/types";

const now = "2026-11-09T05:00:00.000Z";

/** The demo case as it stands after the helper approved and the letters were sent (simulated). */
async function sentDemo() {
  const store = new MemoryStore();
  await seedDemo(store);
  const c = (await store.cases.get("demo"))!;
  const docs = await store.documentsFor("demo");
  const bill = docs.find((d) => d.kind === "bill")!;
  const msn = docs.find((d) => d.kind === "msn")!;
  for (const f of findDiscrepancies({ caseId: "demo", bill: { lines: bill.billLines!, totals: bill.billTotals! }, msn: { lines: msn.msnLines!, totals: msn.msnTotals! } })) await store.findings.put(f);
  const sent: Case = {
    ...c, state: "sent", sentAt: now, income: { annualCents: 3756000, householdSize: 1, source: "typed" },
    eligibility: { fplPercent: 235, status: "discount", discountPercent: 75, quote: "q", sourceUrl: null, hospitalCcn: null, basis: "synthetic_policy" },
  };
  await store.cases.put(sent);
  await store.actions.put({ id: "demo-correction_request", caseId: "demo", kind: "correction_request", title: "t", draft: "d", status: "sent_simulated", approvedBy: "demo-helper", approvedAt: now, sentAt: now, validatedNumbers: [] });
  return store;
}

describe("staff case detail", () => {
  it("edits a field, keeps the original and audits both values", async () => {
    const store = await sentDemo();
    const doc = await editField(store, { caseId: "demo", documentId: "demo-bill", key: "patient_owes", value: "$466.01", actor: DEMO_STAFF, now });
    const f = doc.fields.find((x) => x.key === "patient_owes")!;
    expect(f).toMatchObject({ value: "$466.01", originalValue: "$466.00", editedBy: "demo-staff", editedAt: now });
    const last = (await store.audit("demo")).at(-1)!;
    expect(last.action).toBe("field.edited");
    expect(last.details).toMatchObject({ key: "patient_owes", from: "$466.00", to: "$466.01" });
    await expect(editField(store, { caseId: "demo", documentId: "demo-bill", key: "patient_owes", value: "  ", actor: DEMO_STAFF, now })).rejects.toBeInstanceOf(ReasonRequired);
  });

  it("confirms a finding, and refuses to dismiss one without a reason", async () => {
    const store = await sentDemo();
    const [f] = await store.findingsFor("demo");
    expect((await reviewFinding(store, { caseId: "demo", findingId: f.id, status: "confirmed", actor: DEMO_STAFF, now })).staffStatus).toBe("confirmed");
    await expect(reviewFinding(store, { caseId: "demo", findingId: f.id, status: "dismissed", actor: DEMO_STAFF, now })).rejects.toBeInstanceOf(ReasonRequired);
    const d = await reviewFinding(store, { caseId: "demo", findingId: f.id, status: "dismissed", reason: "Duplicate of a corrected claim", actor: DEMO_STAFF, now });
    expect(d).toMatchObject({ staffStatus: "dismissed", dismissReason: "Duplicate of a corrected claim" });
    expect((await store.audit("demo")).map((e) => e.action)).toEqual(["finding.confirmed", "finding.dismissed"]);
  });

  it("lists the notice and the income as missing only when they are", async () => {
    const store = await sentDemo();
    const c = (await store.cases.get("demo"))!;
    expect(missingInformation(c)).toEqual([]);
    expect(missingInformation({ ...c, state: "needs_notice", income: null }).map((m) => m.key)).toEqual(["notice", "income"]);
  });

  it("delivers the simulated response from the case's own figures and moves the case to responded", async () => {
    const store = await sentDemo();
    await expect(deliverResponse(store, "edge-no-discrepancy", DEMO_STAFF).catch((e) => Promise.reject(e))).rejects.toBeInstanceOf(WrongState);
    const c = await deliverResponse(store, "demo", DEMO_STAFF);
    expect(c.state).toBe("responded");
    const [letter] = await store.responses.list({ caseId: "demo" });
    expect(letter.newBalanceCents).toBe(5650);
    expect(letter.quotedLine).toContain("Q9967");
    expect((await store.documentsFor("demo")).some((d) => d.kind === "response_letter" && d.id === letter.id)).toBe(true);
    expect((await store.actionsFor("demo"))[0].status).toBe("responded");
    expect((await store.audit("demo")).at(-1)!.action).toBe("response.received_simulated");
  });

  it("records a confirmed adjustment only with a response letter as basis, then resolves the case", async () => {
    const store = await sentDemo();
    await deliverResponse(store, "demo", DEMO_STAFF);
    const [letter] = await store.responses.list({ caseId: "demo" });
    await expect(recordResolution(store, { caseId: "demo", basisDocumentId: null, newBalanceCents: 5650, actor: DEMO_STAFF, now })).rejects.toBeInstanceOf(BasisRequired);
    const res = await recordResolution(store, { caseId: "demo", basisDocumentId: letter.id, newBalanceCents: 5650, actor: DEMO_STAFF, now });
    expect(res).toMatchObject({ estimatedOpportunityCents: 40950, confirmedAdjustmentCents: 40950, actualSavingsCents: 40950, basisDocumentId: letter.id, recordedBy: "demo-staff" });
    expect((await store.cases.get("demo"))!.state).toBe("resolved");
    expect((await store.audit("demo")).at(-1)!.action).toBe("resolution.recorded");
  });
});
