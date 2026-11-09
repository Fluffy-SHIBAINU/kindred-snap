import { describe, expect, it } from "vitest";
import { estimateReduction, tierFor } from "@/lib/eligibility";
import { fplPercent, guidelineCents } from "@/lib/fpl";
import { pilotPolicies } from "@/lib/pilots";
import type { Policy } from "@/lib/types";

const synthetic: Policy = {
  basis: "synthetic_policy", hospitalCcn: null, hospitalName: "Riverbend Community Hospital",
  freeCareMaxFpl: { value: 200, quote: "Households at or below 200% of the federal poverty guideline receive a 100% discount.", sourceUrl: null, checkedOn: null },
  tiers: { value: [{ maxFplInclusive: 300, discountPercent: 75 }, { maxFplInclusive: 400, discountPercent: 50 }], quote: "Households between 201% and 300% receive a 75% discount; between 301% and 400%, 50%.", sourceUrl: null, checkedOn: null },
  windowDays: { value: 240, quote: null, sourceUrl: null, checkedOn: null }, phone: { value: null, quote: null, sourceUrl: null, checkedOn: null }, formUrl: { value: null, quote: null, sourceUrl: null, checkedOn: null },
};

describe("poverty guideline", () => {
  it("uses the 2026 figures by default", () => {
    expect(guidelineCents(1)).toBe(1596000);
    expect(guidelineCents(2)).toBe(1596000 + 568000);
    expect(guidelineCents(1, 2025)).toBe(1565000);
  });
  it("computes percent to one decimal", () => {
    expect(fplPercent(3756000, 1)).toBe(235.3);
    expect(fplPercent(3756000, 1, 2025)).toBe(240);
    expect(fplPercent(1596000, 1)).toBe(100);
    expect(fplPercent(0, 3)).toBe(0);
  });
  it("rejects nonsense", () => {
    expect(() => guidelineCents(0)).toThrow();
    expect(() => fplPercent(-1, 1)).toThrow();
  });
});

describe("the synthetic policy", () => {
  it("is free at and below the line, tiered above it, none past the last tier", () => {
    expect(tierFor(synthetic, 200).status).toBe("free");
    expect(tierFor(synthetic, 200.1).discountPercent).toBe(75);
    expect(tierFor(synthetic, 235.3).discountPercent).toBe(75);
    expect(tierFor(synthetic, 300).discountPercent).toBe(75);
    expect(tierFor(synthetic, 300.1).discountPercent).toBe(50);
    expect(tierFor(synthetic, 400.1).status).toBe("none");
  });
  it("carries the quote with the tier", () => {
    expect(tierFor(synthetic, 240).quote).toMatch(/75% discount/);
  });
  it("rounds half up to the cent", () => {
    expect(estimateReduction(22600, tierFor(synthetic, 240))).toBe(16950);
    expect(estimateReduction(22601, { ...tierFor(synthetic, 240), discountPercent: 50 })).toBe(11301);
    expect(estimateReduction(22600, tierFor(synthetic, 500))).toBe(0);
  });
  it("is unknown without thresholds", () => {
    const empty = { ...synthetic, freeCareMaxFpl: { ...synthetic.freeCareMaxFpl, value: null }, tiers: { ...synthetic.tiers, value: [] } };
    expect(tierFor(empty, 150).status).toBe("unknown");
  });
});

describe("the three pilot hospitals", () => {
  const byCcn = Object.fromEntries(pilotPolicies().map((p) => [p.hospitalCcn, p]));
  it("Cedars-Sinai: free to 400%, 90% between 450% and 500%", () => {
    const p = byCcn["050625"];
    expect(tierFor(p, 235.3).status).toBe("free");
    expect(tierFor(p, 470).discountPercent).toBe(90);
    expect(tierFor(p, 470).quote).toBeTruthy();
    expect(tierFor(p, 470).sourceUrl).toMatch(/^https?:/);
  });
  it("Alexian Brothers: free to 250%, 90% at 350%", () => {
    const p = byCcn["140258"];
    expect(tierFor(p, 235.3).status).toBe("free");
    expect(tierFor(p, 350).discountPercent).toBe(90);
    expect(p.windowDays.value).toBe(240);
  });
  it("NYU Langone: free to 600%, 75% at 650%, none at 900%", () => {
    const p = byCcn["330214"];
    expect(tierFor(p, 600).status).toBe("free");
    expect(tierFor(p, 650).discountPercent).toBe(75);
    expect(tierFor(p, 900).status).toBe("none");
  });
});
