import { describe, expect, it } from "vitest";
import { arithmetic, findDiscrepancies, matchLines } from "@/lib/compare";
import { billLines, billTotals, msnLines, msnTotals } from "./helpers/synthetic";

describe("the synthetic case", () => {
  it("adds up", () => {
    expect(arithmetic(billTotals, billLines).every((c) => c.ok)).toBe(true);
  });
  it("matches every line by code and date", () => {
    const m = matchLines(billLines, msnLines);
    expect(m.filter((x) => x.how === "code_date")).toHaveLength(5);
  });
  it("finds the $240.00 gap and names line 3", () => {
    const f = findDiscrepancies({ caseId: "c1", bill: { lines: billLines, totals: billTotals }, msn: { lines: msnLines, totals: msnTotals } });
    const gap = f.find((x) => x.kind === "patient_owes_exceeds_notice");
    const line = f.find((x) => x.kind === "line_not_patient_responsibility");
    expect(gap?.amountCents).toBe(24000);
    expect(gap?.confidence).toBe("likely");
    expect(gap?.requiresReview).toBe(false);
    expect(line?.amountCents).toBe(24000);
    expect(line?.evidence.map((e) => e.documentId)).toEqual(["doc-bill", "doc-msn"]);
    expect(line?.explanation).toMatch(/appears/);
    expect(f.some((x) => x.kind === "possible_duplicate")).toBe(false);
  });
});

describe("edge cases", () => {
  it("reports insufficient information without a notice", () => {
    const f = findDiscrepancies({ caseId: "c2", bill: { lines: billLines, totals: billTotals }, msn: null });
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe("insufficient_information");
    expect(f[0].amountCents).toBeNull();
  });
  it("says the two agree for Case B", () => {
    const lines = [
      { ...billLines[0], n: 1, code: "99283", chargeCents: 112000 },
      { ...billLines[4], n: 2, code: "71046", chargeCents: 38000 },
    ];
    const totals = { ...billTotals, totalChargesCents: 150000, adjustmentsCents: 112000, insurancePaidCents: 30400, patientOwesCents: 7600, dueDate: "2026-12-01" };
    const msn = [
      { ...msnLines[0], n: 1, code: "99283", approvedCents: 28500, medicarePaidCents: 22800, youMayBeBilledCents: 5700 },
      { ...msnLines[4], n: 2, code: "71046", approvedCents: 9500, medicarePaidCents: 7600, youMayBeBilledCents: 1900 },
    ];
    const f = findDiscrepancies({ caseId: "c3", bill: { lines, totals }, msn: { lines: msn, totals: { ...msnTotals, maxYouMayBeBilledCents: 7600 } } });
    expect(f.map((x) => x.kind)).toEqual(["no_discrepancy"]);
  });
  it("flags two EKGs on one day for review instead of calling them an error", () => {
    const ekg = (n: number) => ({ ...billLines[0], n, code: "93005", description: "Electrocardiogram, tracing only", chargeCents: 16500 });
    const lines = [ekg(1), ekg(2)];
    const totals = { ...billTotals, totalChargesCents: 33000, adjustmentsCents: 24000, insurancePaidCents: 7200, patientOwesCents: 1800 };
    const msn = [{ ...msnLines[0], n: 1, code: "93005", service: "93005 Electrocardiogram, tracing only (2 units)", approvedCents: 9000, medicarePaidCents: 7200, youMayBeBilledCents: 1800 }];
    const f = findDiscrepancies({ caseId: "c4", bill: { lines, totals }, msn: { lines: msn, totals: { ...msnTotals, maxYouMayBeBilledCents: 1800 } } });
    const dup = f.find((x) => x.kind === "possible_duplicate");
    expect(dup?.requiresReview).toBe(true);
    expect(dup?.explanation).toMatch(/can be correct/);
    expect(f.some((x) => x.kind === "no_discrepancy")).toBe(false);
  });
  it("marks a gap no single line explains as possible and for review", () => {
    const msn = msnLines.map((m) => (m.n === 3 ? { ...m, youMayBeBilledCents: 1000 } : m));
    const f = findDiscrepancies({ caseId: "c5", bill: { lines: billLines, totals: billTotals }, msn: { lines: msn, totals: { ...msnTotals, maxYouMayBeBilledCents: 23600 } } });
    const gap = f.find((x) => x.kind === "patient_owes_exceeds_notice");
    expect(gap?.amountCents).toBe(23000);
    expect(gap?.confidence).toBe("possible");
    expect(gap?.requiresReview).toBe(true);
  });
});
