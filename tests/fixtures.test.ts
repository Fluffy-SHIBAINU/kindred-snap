import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { arithmetic } from "@/lib/compare";
import { listCaseFixtures, loadCaseFixture } from "@/lib/fixtures";
import type { Policy } from "@/lib/types";

/** every key ending in Cents, anywhere in the object, must hold an integer */
function centsAreIntegers(v: unknown, path = ""): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => centsAreIntegers(x, `${path}[${i}]`));
  if (v && typeof v === "object") {
    return Object.entries(v).flatMap(([k, x]) => (k.endsWith("Cents") && !Number.isInteger(x) ? [`${path}.${k}`] : centsAreIntegers(x, `${path}.${k}`)));
  }
  return [];
}

describe("case fixtures", () => {
  const keys = listCaseFixtures();
  it("lists the six cases", () => {
    expect(keys).toEqual(["edge-connector-down", "edge-missing-notice", "edge-needs-review", "edge-no-discrepancy", "edge-unreadable", "main"]);
  });
  it.each(keys)("%s parses against the types", (key) => {
    const { case: c, documents, consentText } = loadCaseFixture(key);
    expect(c.fixtureKey).toBe(key);
    expect(c.state).toBe("created");
    expect(c.hospitalCcn).toBeUndefined();
    expect(c.consent).toBeNull();
    expect(c.income).toBeNull();
    expect(c.steps).toEqual([]);
    for (const k of ["id", "code", "patientName", "hospitalName", "ownerId", "createdAt", "updatedAt"] as const) expect(typeof c[k]).toBe("string");
    expect(c.code).toMatch(/^SNAP-[A-Z0-9]{6}$/);
    expect(consentText.length).toBeGreaterThan(20);
    expect(documents.length).toBeGreaterThan(0);
    for (const d of documents) {
      expect(d.caseId).toBe(c.id);
      expect(["bill", "msn", "income", "response_letter"]).toContain(d.kind);
      expect(["readable", "unreadable", "pending"]).toContain(d.status);
      expect(typeof d.fileName).toBe("string");
      expect(Number.isInteger(d.pages)).toBe(true);
      for (const f of d.fields) expect(f.source.documentId).toBe(d.id);
      for (const l of [...(d.billLines ?? []), ...(d.msnLines ?? [])]) {
        expect(l.source.documentId).toBe(d.id);
        expect(l.source.line).toBe(l.n);
        expect(l.source.quote.length).toBeGreaterThan(5);
      }
      if (d.status === "readable" && d.billTotals) expect(arithmetic(d.billTotals, d.billLines ?? []).every((x) => x.ok)).toBe(true);
    }
    expect(centsAreIntegers({ c, documents })).toEqual([]);
  });
  it("main is Dorothy's $466.00 bill with a notice and the bill totals add up", () => {
    const { case: c, documents } = loadCaseFixture("main");
    expect(c.code).toBe("SNAP-7K4M2D");
    expect(c.balanceCents).toBe(46600);
    expect(c.dueDate).toBe("2026-11-30");
    const bill = documents.find((d) => d.kind === "bill")!;
    const msn = documents.find((d) => d.kind === "msn")!;
    expect(arithmetic(bill.billTotals!, bill.billLines!).every((x) => x.ok)).toBe(true);
    expect(msn.msnTotals!.maxYouMayBeBilledCents).toBe(22600);
    expect(bill.billLines![2].chargeCents).toBe(24000);
  });
  it("edge cases carry what their names say", () => {
    expect(loadCaseFixture("edge-unreadable").documents[0].status).toBe("unreadable");
    expect(loadCaseFixture("edge-missing-notice").documents.map((d) => d.kind)).toEqual(["bill"]);
    expect(loadCaseFixture("edge-no-discrepancy").case.balanceCents).toBe(7600);
    expect(loadCaseFixture("edge-needs-review").documents[0].billLines!.map((l) => l.code)).toEqual(["93005", "93005"]);
  });
  it("refuses a key that is not a plain name", () => {
    expect(() => loadCaseFixture("../hospitals")).toThrow();
  });
});

describe("document images", () => {
  const index = JSON.parse(readFileSync("fixtures/documents/index.json", "utf8")) as Array<{ sha256: string; kind: string; fixtureKey: string; file: string; unreadable?: boolean }>;
  it("has every entry's file with the stated hash", () => {
    expect(index.length).toBe(8);
    for (const e of index) {
      const path = `fixtures/documents/${e.file}`;
      expect(existsSync(path), path).toBe(true);
      expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(e.sha256);
      expect(["bill", "msn", "income"]).toContain(e.kind);
      expect(listCaseFixtures()).toContain(e.fixtureKey);
    }
    expect(index.find((e) => e.file === "bill-blurry.png")).toMatchObject({ kind: "bill", fixtureKey: "edge-unreadable", unreadable: true });
  });
});

describe("the demo-partner policy", () => {
  it("is the synthetic 200 / 75 / 50 policy with its own sentences", () => {
    const p = JSON.parse(readFileSync("fixtures/policies/riverbend.json", "utf8")) as Policy;
    expect(p.basis).toBe("synthetic_policy");
    expect(p.hospitalCcn).toBeNull();
    expect(p.freeCareMaxFpl.value).toBe(200);
    expect(p.tiers.value).toEqual([{ maxFplInclusive: 300, discountPercent: 75 }, { maxFplInclusive: 400, discountPercent: 50 }]);
    expect(p.windowDays.value).toBe(240);
    for (const f of [p.freeCareMaxFpl, p.tiers, p.windowDays]) { expect(f.quote).toMatch(/\./); expect(f.sourceUrl).toBeNull(); }
  });
});
