import { describe, expect, it } from "vitest";
import { SupabaseStore, type SupabaseLike } from "@/lib/adapters/store/supabase";
import type { Case, Document, Finding } from "@/lib/types";
import { billLines, billTotals } from "./helpers/synthetic";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string } | null };
const PK: Record<string, string> = { consents: "case_id", resolutions: "case_id", meta: "key" };

/** Minimal PostgREST stand-in: bigint columns come back as strings and timestamps as "+00:00", like the real API. */
function fakeClient() {
  const tables: Record<string, Row[]> = {};
  const calls: string[] = [];
  let serial = 0;
  const wire = (r: Row): Row => Object.fromEntries(Object.entries(r).map(([k, v]) => [k,
    (k.endsWith("_cents") || k === "id") && typeof v === "number" ? String(v)
      : (k.endsWith("_at") || k === "at") && typeof v === "string" ? v.replace(".000Z", "+00:00") : v]));
  function query(table: string, rows: () => Row[], onRun?: (matched: Row[]) => void) {
    const filters: [string, unknown][] = [];
    let orderBy: string | undefined;
    const q = {
      eq(c: string, v: unknown) { filters.push([c, v]); return q; },
      order(c: string) { orderBy = c; return q; },
      then<A = Res, B = never>(ok?: ((r: Res) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
        let out = rows().filter((r) => filters.every(([c, v]) => r[c] === v));
        if (orderBy) out = [...out].sort((a, b) => Number(a[orderBy!]) - Number(b[orderBy!]));
        onRun?.(out);
        return Promise.resolve<Res>({ data: out.map(wire), error: null }).then(ok, fail);
      },
    };
    return q;
  }
  const client: SupabaseLike = {
    from(table) {
      const t = (tables[table] ??= []);
      return {
        select: () => { calls.push(`${table}.select`); return query(table, () => t); },
        insert: (row) => {
          calls.push(`${table}.insert`);
          const stored = { ...row, id: ++serial } as Row;
          t.push(stored);
          return { select: () => query(table, () => [stored]) };
        },
        upsert: (row) => {
          calls.push(`${table}.upsert`);
          const pk = PK[table] ?? "id";
          const i = t.findIndex((r) => r[pk] === (row as Row)[pk]);
          if (i >= 0) t[i] = { ...t[i], ...row }; else t.push({ ...row });
          return Promise.resolve({ data: null, error: null });
        },
        delete: () => {
          calls.push(`${table}.delete`);
          return { eq: (c, v) => query(table, () => t.filter((r) => r[c] === v), (m) => { tables[table] = t.filter((r) => !m.includes(r)); }) };
        },
      };
    },
  };
  return { client, tables, calls };
}

const now = "2026-11-09T04:00:00.000Z";
const mainCase: Case = {
  id: "case-main", code: "SNAP-7K2M9P", state: "ready_to_send", patientName: "Dorothy M. Hale (synthetic)", helperName: "Jenna Hale (synthetic)",
  hospitalName: "Riverbend Community Hospital", ownerId: "u-jenna", fixtureKey: "main",
  consent: { caseId: "case-main", grantedAt: now, grantedBy: "u-jenna", role: "helper", scope: "investigate_and_prepare" },
  income: { annualCents: 3756000, householdSize: 1, source: "typed" }, dueDate: "2026-11-30", balanceCents: 46600, steps: [], createdAt: now, updatedAt: now,
};
const bill: Document = { id: "doc-bill", caseId: "case-main", kind: "bill", fileName: "bill-main.png", pages: 1, fields: [], billLines, billTotals, status: "readable", uploadedAt: now };
const finding: Finding = { id: "f1", caseId: "case-main", kind: "no_discrepancy", amountCents: null, confidence: "insufficient", explanation: "Nothing found.", evidence: [], requiresReview: false };

describe("supabase store (fake client)", () => {
  it("round-trips cases and documents through snake_case rows", async () => {
    const { client, tables } = fakeClient();
    const store = new SupabaseStore(client);
    await store.cases.put(mainCase);
    await store.documents.put(bill);
    await store.findings.put(finding);
    expect(tables.cases[0]).toMatchObject({ patient_name: mainCase.patientName, owner_id: "u-jenna", balance_cents: 46600, sent_at: null });
    expect(await store.cases.get("case-main")).toEqual(mainCase);
    expect(await store.documents.get("doc-bill")).toEqual(bill);
    expect(await store.findings.get("f1")).toEqual(finding);
    expect(await store.documentsFor("case-main")).toEqual([bill]);
    expect(await store.cases.get("nope")).toBeNull();
    expect(await store.ownerOf("case-main")).toBe("u-jenna");
  });

  it("turns bigint strings into numbers", async () => {
    const { client } = fakeClient();
    const store = new SupabaseStore(client);
    await store.cases.put(mainCase);
    await store.resolutions.put({ caseId: "case-main", estimatedOpportunityCents: 40950, confirmedAdjustmentCents: null, actualSavingsCents: null, basisDocumentId: null });
    expect((await store.cases.get("case-main"))!.balanceCents).toBe(46600);
    const r = (await store.resolutions.get("case-main"))!;
    expect(r.estimatedOpportunityCents).toBe(40950);
    expect(r.confirmedAdjustmentCents).toBeNull();
  });

  it("appends audit events in order and keeps meta", async () => {
    const { client } = fakeClient();
    const store = new SupabaseStore(client);
    const first = await store.appendAudit("case-main", { at: now, actor: "u-jenna", role: "helper", action: "case.created" });
    await store.appendAudit("other", { at: now, actor: "u-x", role: "helper", action: "case.created" });
    const third = await store.appendAudit("case-main", { at: now, actor: "u-jenna", role: "helper", action: "consent.granted", details: { scope: "x" } });
    expect(first).toEqual({ id: 1, caseId: "case-main", at: now, actor: "u-jenna", role: "helper", action: "case.created" });
    expect(third.id).toBe(3);
    expect((await store.audit("case-main")).map((e) => e.action)).toEqual(["case.created", "consent.granted"]);
    expect(await store.meta.get("demo_clock_offset_ms")).toBeUndefined();
    await store.meta.set("demo_clock_offset_ms", "1036800000");
    await store.meta.set("demo_clock_offset_ms", "5");
    expect(await store.meta.get("demo_clock_offset_ms")).toBe("5");
  });

  it("deleteCaseData removes child rows, blanks the case and keeps the audit log", async () => {
    const { client, tables, calls } = fakeClient();
    const store = new SupabaseStore(client);
    await store.cases.put(mainCase);
    await store.documents.put(bill);
    await store.findings.put(finding);
    await store.consents.put(mainCase.consent!);
    await store.appendAudit("case-main", { at: now, actor: "u-jenna", role: "helper", action: "case.created" });
    const deletedAt = "2026-11-10T00:00:00.000Z";
    const tomb = await store.deleteCaseData("case-main", deletedAt);
    expect(tomb).toMatchObject({ id: "case-main", state: "closed", patientName: "deleted", consent: null, income: null, deletedAt });
    expect(tables.cases[0]).toMatchObject({ patient_name: "deleted", helper_name: null, income: null, consent: null, eligibility: null, balance_cents: null, deleted_at: deletedAt });
    expect(await store.cases.get("case-main")).toEqual(tomb);
    expect(await store.documentsFor("case-main")).toEqual([]);
    expect(await store.findingsFor("case-main")).toEqual([]);
    expect(await store.consents.get("case-main")).toBeNull();
    expect(calls).toEqual(expect.arrayContaining(["documents.delete", "findings.delete", "actions.delete", "consents.delete", "responses.delete"]));
    expect(calls).not.toContain("audit_events.delete");
    expect((await store.audit("case-main")).length).toBe(1);
    expect(await store.deleteCaseData("nope")).toBeNull();
  });

  it("create() refuses to start without the service-role key", () => {
    expect(() => SupabaseStore.create({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" })).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(SupabaseStore.create({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test" })).toBeInstanceOf(SupabaseStore);
  });
});
