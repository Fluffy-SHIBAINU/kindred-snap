import type { Actor, Eligibility, Finding, Resolution } from "@/lib/types";
import { estimateReduction } from "@/lib/eligibility";

export class BasisRequired extends Error {}
export class StaffOnly extends Error {}

/** What the app thinks could come off the balance. An estimate, never money. */
export function estimateOpportunity(findings: Finding[], eligibility: Eligibility | null, balanceCents: number): { cents: number; parts: Array<{ label: string; cents: number }> } {
  const parts: Array<{ label: string; cents: number }> = [];
  const gap = findings
    .filter((f) => f.kind === "patient_owes_exceeds_notice" && !f.requiresReview && f.amountCents != null)
    .reduce((a, f) => a + (f.amountCents ?? 0), 0);
  if (gap > 0) parts.push({ label: "Line Medicare says is not the patient's to pay", cents: gap });
  const corrected = Math.max(0, balanceCents - gap);
  if (eligibility) {
    const reduction = estimateReduction(corrected, eligibility);
    if (reduction > 0) parts.push({ label: `${eligibility.discountPercent}% assistance on the corrected balance`, cents: reduction });
  }
  return { cents: parts.reduce((a, p) => a + p.cents, 0), parts };
}

/**
 * Only a staff member, only with a basis document (the provider's own letter), can turn an estimate into a confirmed adjustment.
 * Actual savings is the confirmed adjustment on money the patient was asked to pay and had not yet paid.
 */
export function recordConfirmed(
  res: Resolution,
  input: { basisDocumentId: string | null | undefined; newBalanceCents: number; askedCents: number; paidCents?: number; actor: Actor; now: string },
): Resolution {
  if (input.actor.role !== "staff" && input.actor.role !== "admin") throw new StaffOnly("Only staff can record a confirmed adjustment");
  if (!input.basisDocumentId) throw new BasisRequired("A basis document (the provider's response) is required");
  if (input.newBalanceCents < 0 || input.newBalanceCents > input.askedCents) throw new Error("New balance must be between zero and the amount asked");
  const confirmed = input.askedCents - input.newBalanceCents;
  const paid = input.paidCents ?? 0;
  const actual = Math.max(0, Math.min(confirmed, input.askedCents - paid));
  return { ...res, confirmedAdjustmentCents: confirmed, actualSavingsCents: actual, basisDocumentId: input.basisDocumentId, recordedBy: input.actor.id, recordedAt: input.now };
}
