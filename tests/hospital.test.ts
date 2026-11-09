import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoPartnerHospital, SYNTHETIC_FOOTER } from "@/lib/adapters/hospital/demoPartner";
import { NotApproved, type ResponseFacts } from "@/lib/adapters/hospital/types";
import { ExternalActionRefused } from "@/lib/guards";
import type { Action, Approval } from "@/lib/types";

const now = "2026-11-09T05:00:00.000Z";
const action: Action = { id: "act-1", caseId: "case-1", kind: "correction_request", title: "Ask to remove the contrast charge", draft: "…", status: "approved", validatedNumbers: [], approvedBy: "helper-jenna", approvedAt: now };
const approval: Approval = { approvedBy: "helper-jenna", approvedAt: now, role: "helper" };
const facts: ResponseFacts = {
  patientName: "Dorothy M. Hale (synthetic)",
  removedLineCents: 24000,
  removedLineLabel: "Q9967 Contrast material, low osmolar, 100 mL",
  tierPercent: 75,
  askedCents: 46600,
  correctedCents: 22600,
};
const hospital = new DemoPartnerHospital();
const daysAfter = (n: number) => new Date(Date.parse(now) + n * 86_400_000).toISOString();

afterEach(() => vi.unstubAllEnvs());

describe("demo-partner hospital connector", () => {
  it("refuses to send without an approval on record", async () => {
    await expect(hospital.send(action, undefined, now)).rejects.toBeInstanceOf(NotApproved);
    await expect(hospital.send(action, { ...approval, approvedAt: "" }, now)).rejects.toBeInstanceOf(NotApproved);
  });

  it("sends simulated with an approval", async () => {
    expect(await hospital.send(action, approval, now)).toEqual({ simulated: true, sentAt: now });
  });

  it("refuses any mode other than simulated", async () => {
    vi.stubEnv("EXTERNAL_ACTIONS", "live");
    await expect(hospital.send(action, approval, now)).rejects.toBeInstanceOf(ExternalActionRefused);
  });

  it("has no response at day 11", async () => {
    expect(await hospital.response({ caseId: "case-1", sentAt: now, now: daysAfter(11), facts })).toBeNull();
  });

  it("responds at day 12 with the removed line, the tier and the new balance", async () => {
    const letter = await hospital.response({ caseId: "case-1", sentAt: now, now: daysAfter(12), facts });
    expect(letter).not.toBeNull();
    expect(letter!.simulated).toBe(true);
    expect(letter!.newBalanceCents).toBe(5650);
    expect(letter!.tierApplied).toBe(75);
    expect(letter!.quotedLine).toBe("Q9967 Contrast material, low osmolar, 100 mL $240.00");
    expect(letter!.receivedAt).toBe(daysAfter(12));
    expect(letter!.text).toContain("Patient Financial Services, Riverbend Community Hospital (demo partner)");
    expect(letter!.text).toContain(letter!.quotedLine);
    expect(letter!.text).toContain("75% tier");
    expect(letter!.text).toContain("$169.50");
    expect(letter!.text).toContain("$56.50");
    expect(letter!.text.endsWith(SYNTHETIC_FOOTER)).toBe(true);
  });

  it("keeps the corrected balance when no tier applies and quotes nothing when no line was removed", async () => {
    const letter = await hospital.response({ caseId: "case-b", sentAt: now, now: daysAfter(30), facts: { ...facts, removedLineCents: 0, tierPercent: null, askedCents: 7600, correctedCents: 7600 } });
    expect(letter!.newBalanceCents).toBe(7600);
    expect(letter!.quotedLine).toBe("");
    expect(letter!.text).toContain("$76.00");
  });

  it("rounds half up to the cent", async () => {
    // 50% of $0.01 is half a cent of discount → $0.01 off, the same as estimateReduction rounds it
    const letter = await hospital.response({ caseId: "case-r", sentAt: now, now: daysAfter(12), facts: { ...facts, tierPercent: 50, correctedCents: 1 } });
    expect(letter!.newBalanceCents).toBe(0);
  });
});
