import { describe, expect, it } from "vitest";
import { BasisRequired, estimateOpportunity, recordConfirmed, StaffOnly } from "@/lib/savings";
import type { Eligibility, Finding, Resolution } from "@/lib/types";

const likelyGap: Finding = { id: "f1", caseId: "c1", kind: "patient_owes_exceeds_notice", amountCents: 24000, confidence: "likely", explanation: "", evidence: [], requiresReview: false };
const tier75: Eligibility = { fplPercent: 235.3, status: "discount", discountPercent: 75, quote: "q", sourceUrl: null, hospitalCcn: null, basis: "synthetic_policy" };
const empty: Resolution = { caseId: "c1", estimatedOpportunityCents: 40950, confirmedAdjustmentCents: null, actualSavingsCents: null, basisDocumentId: null };
const now = "2026-11-21T10:00:00Z";

describe("estimate", () => {
  it("adds the gap and the assistance on the corrected balance", () => {
    const e = estimateOpportunity([likelyGap], tier75, 46600);
    expect(e.cents).toBe(40950);
    expect(e.parts.map((p) => p.cents)).toEqual([24000, 16950]);
  });
  it("ignores findings that need review and absent eligibility", () => {
    expect(estimateOpportunity([{ ...likelyGap, requiresReview: true }], null, 46600).cents).toBe(0);
    expect(estimateOpportunity([], tier75, 46600).cents).toBe(34950);
  });
});

describe("confirmed and actual", () => {
  it("needs staff and a basis document", () => {
    expect(() => recordConfirmed(empty, { basisDocumentId: "letter-1", newBalanceCents: 5650, askedCents: 46600, actor: { id: "u", role: "helper" }, now })).toThrow(StaffOnly);
    expect(() => recordConfirmed(empty, { basisDocumentId: null, newBalanceCents: 5650, askedCents: 46600, actor: { id: "s", role: "staff" }, now })).toThrow(BasisRequired);
  });
  it("records the provider's figure, and actual equals confirmed when nothing was paid", () => {
    const r = recordConfirmed(empty, { basisDocumentId: "letter-1", newBalanceCents: 5650, askedCents: 46600, actor: { id: "s", role: "staff" }, now });
    expect(r.confirmedAdjustmentCents).toBe(40950);
    expect(r.actualSavingsCents).toBe(40950);
    expect(r.recordedBy).toBe("s");
  });
  it("caps actual savings by what was still owed", () => {
    const r = recordConfirmed(empty, { basisDocumentId: "letter-1", newBalanceCents: 5650, askedCents: 46600, paidCents: 20000, actor: { id: "s", role: "staff" }, now });
    expect(r.actualSavingsCents).toBe(26600);
  });
  it("never creates a confirmed figure from the estimate alone", () => {
    expect(empty.confirmedAdjustmentCents).toBeNull();
  });
});
