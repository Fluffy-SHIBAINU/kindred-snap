import { describe, expect, it } from "vitest";
import { MemoryStore, seedDemo } from "@/lib/adapters/store";
import { dashboardData } from "@/lib/staff/dashboard";

async function seeded() {
  const store = new MemoryStore();
  await seedDemo(store);
  return store;
}

describe("staff dashboard data", () => {
  it("counts the seeded cases, all new, with nothing confirmed", async () => {
    const d = await dashboardData(await seeded());
    expect(d.counts).toEqual({ queue: 6, awaitingApproval: 0, needsReview: 0, confirmed: 0 });
    expect(d.byState).toEqual([{ label: "New", count: 6 }]);
    expect(d.queue).toHaveLength(6);
    expect(d.queue.every((r) => r.nextAction.length > 0)).toBe(true);
  });

  it("shows the demo case's estimate and waits for the hospital until a resolution is recorded", async () => {
    const store = await seeded();
    const before = await dashboardData(store);
    expect(before.savings).toEqual({ estimatedCents: 0, confirmedCents: null, actualCents: null });

    await store.resolutions.put({ caseId: "demo", estimatedOpportunityCents: 40950, confirmedAdjustmentCents: 40950, actualSavingsCents: 40950, basisDocumentId: "letter-1" });
    const after = await dashboardData(store);
    expect(after.savings).toEqual({ estimatedCents: 40950, confirmedCents: 40950, actualCents: 40950 });
    expect(after.counts.confirmed).toBe(1);
  });

  it("puts needs-review first, then the earliest due date, and drops closed cases", async () => {
    const store = await seeded();
    const [a, b] = await store.listCases();
    await store.cases.put({ ...a, state: "needs_review", dueDate: "2027-01-01" });
    await store.cases.put({ ...b, state: "closed" });
    const d = await dashboardData(store);
    expect(d.queue[0].id).toBe(a.id);
    expect(d.queue.map((r) => r.id)).not.toContain(b.id);
    expect(d.counts).toMatchObject({ queue: 5, needsReview: 1 });
    const dues = d.queue.slice(1).map((r) => r.dueDate ?? "9999");
    expect(dues).toEqual([...dues].sort());
  });
});
