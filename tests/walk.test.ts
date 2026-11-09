import { describe, expect, it } from "vitest";
import { MemoryStore, seedDemo } from "@/lib/adapters/store";
import { ensureWalkCase, isWalkId, parseWalkHints, walkQuery } from "@/lib/server/walk";

const ID = "walk-TEST01";
const INCOME = { incomeCents: 3756000, householdSize: 1 };

async function fresh() {
  const store = new MemoryStore();
  await seedDemo(store);
  return store;
}

describe("walk ids and hints", () => {
  it("recognises walk ids", () => {
    expect(isWalkId(ID)).toBe(true);
    expect(isWalkId("walk-ABC")).toBe(false);
    expect(isWalkId("demo")).toBe(false);
  });
  it("round-trips hints through the query", () => {
    const h = { ...INCOME, sent: true, responded: true };
    expect(walkQuery(h)).toBe("?income=3756000&hh=1&sent=1&responded=1");
    expect(parseWalkHints(Object.fromEntries(new URLSearchParams(walkQuery(h).slice(1))))).toEqual(h);
    expect(walkQuery({})).toBe("");
    expect(parseWalkHints({ income: "abc", hh: "99" })).toEqual({});
  });
});

describe("ensureWalkCase", () => {
  it("materialises a missing walk case from the main fixture", async () => {
    const store = await fresh();
    const c = await ensureWalkCase(store, ID, {});
    expect(c).toMatchObject({ id: ID, state: "created", code: "SNAP-TEST01", fixtureKey: "main", ownerId: "demo-helper" });
    expect((await store.documentsFor(ID)).map((d) => d.id).sort()).toEqual([`${ID}-bill`, `${ID}-msn`]);
    expect((await store.cases.get("demo"))!.state).toBe("created"); // the seeded demo case is untouched
  });

  it("with income hints ends ready_to_send with two drafted actions", async () => {
    const store = await fresh();
    const c = await ensureWalkCase(store, ID, INCOME);
    expect(c!.state).toBe("ready_to_send");
    expect(await store.actionsFor(ID)).toHaveLength(2);
  });

  it("a second fresh store given income and sent ends sent (the cross-instance guarantee)", async () => {
    await ensureWalkCase(await fresh(), ID, INCOME);
    const other = await fresh();
    const c = await ensureWalkCase(other, ID, { ...INCOME, sent: true });
    expect(c!.state).toBe("sent");
    expect(c!.sentAt).toBeTruthy();
    expect((await other.actionsFor(ID)).every((a) => a.status === "sent_simulated")).toBe(true);
  });

  it("with responded ends responded with a response row, and is idempotent", async () => {
    const store = await fresh();
    const hints = { ...INCOME, sent: true, responded: true };
    const c = await ensureWalkCase(store, ID, hints);
    expect(c!.state).toBe("responded");
    const letters = await store.responses.list({ caseId: ID });
    expect(letters).toHaveLength(1);
    const auditLen = (await store.audit(ID)).length;
    const again = await ensureWalkCase(store, ID, hints);
    expect(again!.state).toBe("responded");
    expect(await store.responses.list({ caseId: ID })).toHaveLength(1);
    expect((await store.audit(ID)).length).toBe(auditLen);
  });

  it("returns the stored case unchanged for a non-walk id", async () => {
    const store = await fresh();
    const before = await store.cases.get("demo");
    expect(await ensureWalkCase(store, "demo", { ...INCOME, sent: true })).toEqual(before);
    expect(await ensureWalkCase(store, "nope", INCOME)).toBeNull();
  });
});
