import { describe, expect, it } from "vitest";
import { allowedTokens, type CaseFacts } from "@/lib/templates/facts";
import { draft as correction } from "@/lib/templates/correction";
import { draft as assistance } from "@/lib/templates/assistance";
import { draft as information } from "@/lib/templates/information";
import { validateDraft } from "@/lib/templates/validate";

// the main synthetic case (fixtures/case-synthetic.json), as the pipeline will hand it to the templates
const main: CaseFacts = {
  patientName: "Dorothy M. Hale (synthetic)",
  helperName: "Jenna Hale (synthetic)",
  hospitalName: "Riverbend Community Hospital",
  accountMasked: "****4821",
  statementDate: "2026-10-20",
  dueDate: "2026-11-30",
  askedCents: 46600,
  noticeMaxCents: 22600,
  removedLine: {
    n: 3, code: "Q9967", description: "Contrast material for CT (low osmolar), 100 mL", chargeCents: 24000,
    noticeNote: "Payment for this item is included in the payment for another service on this claim (the CT scan). The facility may not bill you separately for it.",
  },
  gapCents: 24000,
  incomeAnnualCents: 3756000,
  householdSize: 1,
  fplPercent: 240,
  tierPercent: 75,
  policyQuote: "Households between 201% and 300% receive a 75% discount; between 301% and 400%, 50%.",
  correctedCents: 22600,
  windowDays: 240,
};

const drafts = [correction(main), assistance(main), information(main)];

describe("letter templates", () => {
  it("produce three drafts that validate against the case", () => {
    expect(drafts.map((d) => d.kind)).toEqual(["correction_request", "assistance_application", "information_request"]);
    for (const d of drafts) expect(validateDraft(d.draft, main)).toEqual({ ok: true, unknownNumbers: [] });
  });

  it("each quotes the removed line's code and amount and hedges", () => {
    for (const d of drafts) {
      expect(d.draft).toContain("Q9967");
      expect(d.draft).toContain("$240.00");
      expect(/appears|may not/.test(d.draft)).toBe(true);
      expect(d.draft).not.toMatch(/overcharge|error/i);
    }
  });

  it("allowed tokens cover money, percentages, dates and days", () => {
    const allowed = allowedTokens(main);
    for (const t of ["$466.00", "$226.00", "$240.00", "$37,560.00", "240%", "75%", "2026-11-30", "Nov 30, 2026", "240", "201%"]) expect(allowed.has(t)).toBe(true);
  });

  it("still validates without a helper, a removed line or a tier", () => {
    const bare: CaseFacts = { ...main, helperName: undefined, removedLine: undefined, tierPercent: null, policyQuote: null, windowDays: null };
    for (const d of [correction(bare), assistance(bare), information(bare)]) expect(validateDraft(d.draft, bare).ok).toBe(true);
  });
});

describe("validateDraft", () => {
  it("names a foreign dollar amount", () => {
    const r = validateDraft(correction(main).draft + "\nPlease also refund $999.00.", main);
    expect(r).toEqual({ ok: false, unknownNumbers: ["$999.00"] });
  });

  it("names foreign percentages, dates and day counts", () => {
    const r = validateDraft("You owe 12.5% by 2027-01-01, that is Jan 1, 2027, within 30 days.", main);
    expect(r.ok).toBe(false);
    expect(r.unknownNumbers).toEqual(["12.5%", "2027-01-01", "Jan 1, 2027", "30"]);
  });
});
