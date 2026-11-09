import { describe, expect, it } from "vitest";
import { SyntheticBlueButton } from "@/lib/adapters/claims/synthetic";
import { MemoryStore, seedDemo } from "@/lib/adapters/store";
import { ApprovalRefused } from "@/lib/case/state";
import { approveAndSend, closeCase, deleteCase, deliverResponse, demoClockFor, recordBasisLetter } from "@/lib/caseFlow";
import { riverbendPolicy, runInvestigation } from "@/lib/pipeline";
import { StaffOnly } from "@/lib/savings";

const T0 = "2026-11-09T05:00:00.000Z";
const daysAfter = (n: number) => new Date(Date.parse(T0) + n * 86_400_000).toISOString();
const helper = { id: "demo-helper", role: "helper" as const };
const staff = { id: "demo-staff", role: "staff" as const };

/** The demo case run to `ready_to_send` with consent and income on record. */
async function readyStore() {
  const store = new MemoryStore();
  await seedDemo(store);
  const c = (await store.cases.get("demo"))!;
  await store.cases.put({
    ...c,
    consent: { caseId: "demo", grantedAt: T0, grantedBy: helper.id, role: "helper", scope: "investigate_and_prepare" },
    income: { annualCents: 3756000, householdSize: 1, source: "typed" },
  });
  await runInvestigation(store, "demo", { claims: new SyntheticBlueButton(), policyFor: async () => riverbendPolicy(), now: () => T0 });
  expect((await store.cases.get("demo"))!.state).toBe("ready_to_send");
  return store;
}

describe("approve and send", () => {
  it("approves every draft, sends simulated and marks the case sent", async () => {
    const store = await readyStore();
    const c = await approveAndSend(store, "demo", helper, T0);
    expect(c.state).toBe("sent");
    expect(c.sentAt).toBe(T0);
    const actions = await store.actionsFor("demo");
    expect(actions).toHaveLength(2);
    for (const a of actions) {
      expect(a.status).toBe("sent_simulated");
      expect(a.approvedBy).toBe(helper.id);
    }
    const kinds = (await store.audit("demo")).map((e) => e.action);
    expect(kinds.filter((k) => k === "action.approved")).toHaveLength(2);
    expect(kinds.filter((k) => k === "action.sent_simulated")).toHaveLength(2);
  });

  it("refuses without consent and refuses staff", async () => {
    const store = await readyStore();
    await expect(approveAndSend(store, "demo", staff, T0)).rejects.toBeInstanceOf(ApprovalRefused);
    const c = (await store.cases.get("demo"))!;
    await store.cases.put({ ...c, consent: null });
    await expect(approveAndSend(store, "demo", helper, T0)).rejects.toBeInstanceOf(ApprovalRefused);
  });

  it("closes a ready case with Done for now", async () => {
    const store = await readyStore();
    expect((await closeCase(store, "demo", T0)).state).toBe("closed");
  });
});

describe("the hospital's simulated reply", () => {
  it("is not due at day 11, arrives at day 12 and moves the case to responded", async () => {
    const store = await readyStore();
    await approveAndSend(store, "demo", helper, T0);
    expect(await deliverResponse(store, "demo", daysAfter(11))).toBeNull();
    expect((await store.cases.get("demo"))!.state).toBe("sent");
    const letter = await deliverResponse(store, "demo", daysAfter(12));
    expect(letter?.newBalanceCents).toBe(5650);
    expect(letter?.tierApplied).toBe(75);
    expect(letter?.quotedLine).toContain("Q9967");
    expect((await store.cases.get("demo"))!.state).toBe("responded");
    expect(await store.responses.list({ caseId: "demo" })).toHaveLength(1);
    expect((await store.audit("demo")).some((e) => e.action === "response.received_simulated")).toBe(true);
    // a second visit changes nothing
    expect(await deliverResponse(store, "demo", daysAfter(13))).toBeNull();
  });

  it("does nothing for a case that was never sent", async () => {
    const store = await readyStore();
    expect(await deliverResponse(store, "demo", daysAfter(30))).toBeNull();
  });
});

describe("recording the basis letter", () => {
  async function respondedStore() {
    const store = await readyStore();
    await approveAndSend(store, "demo", helper, T0);
    await deliverResponse(store, "demo", daysAfter(12));
    return store;
  }

  it("is staff only", async () => {
    const store = await respondedStore();
    await expect(recordBasisLetter(store, "demo", helper, daysAfter(12))).rejects.toBeInstanceOf(StaffOnly);
    expect((await store.resolutions.get("demo"))!.confirmedAdjustmentCents).toBeNull();
  });

  it("confirms the letter's figure against the amount asked and resolves the case", async () => {
    const store = await respondedStore();
    const res = await recordBasisLetter(store, "demo", staff, daysAfter(12));
    expect(res.estimatedOpportunityCents).toBe(40950);
    expect(res.confirmedAdjustmentCents).toBe(40950);
    expect(res.actualSavingsCents).toBe(40950);
    expect(res.basisDocumentId).toBe("letter-demo");
    expect((await store.cases.get("demo"))!.state).toBe("resolved");
    expect((await store.audit("demo")).some((e) => e.action === "resolution.recorded")).toBe(true);
  });

  it("needs a response on file", async () => {
    const store = await readyStore();
    await expect(recordBasisLetter(store, "demo", staff, T0)).rejects.toThrow(/No hospital response/);
  });
});

describe("delete and the demo clock", () => {
  it("leaves a tombstone and a case.deleted event", async () => {
    const store = await readyStore();
    const t = await deleteCase(store, "demo", helper, T0);
    expect(t?.state).toBe("closed");
    expect(t?.patientName).toBe("");
    expect(await store.actionsFor("demo")).toEqual([]);
    expect((await store.audit("demo")).at(-1)?.action).toBe("case.deleted");
    expect(await deleteCase(store, "nope", helper, T0)).toBeNull();
  });

  it("keeps its offset in store.meta so a later clock sees the advance", async () => {
    const store = new MemoryStore();
    (await demoClockFor(store)).advanceDays(12);
    expect(await store.meta.get("demo_clock_offset_ms")).toBe(String(12 * 86_400_000));
    const later = await demoClockFor(store);
    expect(Date.parse(later.now()) - Date.now()).toBeGreaterThan(11.9 * 86_400_000);
  });
});
