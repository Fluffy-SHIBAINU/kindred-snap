import { describe, expect, it } from "vitest";
import { MemoryStore, seedDemo } from "@/lib/adapters/store";
import { ensureWalkCase, isWalkId, parseWalkHints, walkQuery } from "@/lib/server/walk";

const ID = "walk-TEST01";
const INCOME = { incomeCents: 3756000, householdSize: 1 };
const OWNER = { id: "visitor:owner", role: "helper" as const };

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
    const c = await ensureWalkCase(store, ID, {}, OWNER);
    expect(c).toMatchObject({ id: ID, state: "created", code: "SNAP-TEST01", fixtureKey: "main", ownerId: OWNER.id });
    expect((await store.documentsFor(ID)).map((d) => d.id).sort()).toEqual([`${ID}-bill`, `${ID}-msn`]);
    expect((await store.cases.get("demo"))!.state).toBe("created"); // the seeded demo case is untouched
  });

  it("with income hints ends ready_to_send with two drafted actions", async () => {
    const store = await fresh();
    const c = await ensureWalkCase(store, ID, INCOME, OWNER);
    expect(c!.state).toBe("ready_to_send");
    expect(await store.actionsFor(ID)).toHaveLength(2);
  });

  it("a second fresh store given income and sent ends sent (the cross-instance guarantee)", async () => {
    await ensureWalkCase(await fresh(), ID, INCOME, OWNER);
    const other = await fresh();
    const c = await ensureWalkCase(other, ID, { ...INCOME, sent: true }, OWNER);
    expect(c!.state).toBe("sent");
    expect(c!.sentAt).toBeTruthy();
    expect((await other.actionsFor(ID)).every((a) => a.status === "sent_simulated")).toBe(true);
  });

  it("with responded ends responded with a response row, and is idempotent", async () => {
    const store = await fresh();
    const hints = { ...INCOME, sent: true, responded: true };
    const c = await ensureWalkCase(store, ID, hints, OWNER);
    expect(c!.state).toBe("responded");
    const letters = await store.responses.list({ caseId: ID });
    expect(letters).toHaveLength(1);
    const auditLen = (await store.audit(ID)).length;
    const again = await ensureWalkCase(store, ID, hints, OWNER);
    expect(again!.state).toBe("responded");
    expect(await store.responses.list({ caseId: ID })).toHaveLength(1);
    expect((await store.audit(ID)).length).toBe(auditLen);
  });

  it("two concurrent calls for one new id in one process build it once, with no 1500 ms loser wait", async () => {
    const store = await fresh();
    const t0 = Date.now();
    const [a, b] = await Promise.all([ensureWalkCase(store, ID, INCOME, OWNER), ensureWalkCase(store, ID, INCOME, OWNER)]);
    expect(Date.now() - t0).toBeLessThan(1000); // one 150 ms lock wait; a caller that lost the lock would sleep 1500 ms more
    expect(a!.state).toBe("ready_to_send");
    expect(b).toEqual(a);
    const audit = await store.audit(ID);
    expect(audit.filter((e) => e.action === "case.created")).toHaveLength(1);
    expect(audit.filter((e) => e.action === "consent.granted")).toHaveLength(1);
  });

  it("returns the stored case unchanged for a non-walk id", async () => {
    const store = await fresh();
    const before = await store.cases.get("demo");
    expect(await ensureWalkCase(store, "demo", { ...INCOME, sent: true }, OWNER)).toEqual(before);
    expect(await ensureWalkCase(store, "nope", INCOME, OWNER)).toBeNull();
  });

  it("never advances someone else's walk, and builds none without a viewer", async () => {
    const store = await fresh();
    await ensureWalkCase(store, ID, {}, OWNER);
    const c = await ensureWalkCase(store, ID, { ...INCOME, sent: true }, { id: "visitor:other", role: "helper" });
    expect(c).toMatchObject({ state: "created", ownerId: OWNER.id });
    expect(await store.actionsFor(ID)).toHaveLength(0);
    expect(await ensureWalkCase(await fresh(), ID, INCOME, null)).toBeNull();
  });
});
