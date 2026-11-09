import type { Eligibility, Policy } from "@/lib/types";

/**
 * Where the household sits in the hospital's own policy. Free when at or below the free-care line,
 * else the first discount tier whose ceiling is at or above the household, else none. Unknown when the policy has no thresholds.
 */
export function tierFor(policy: Policy, fplPct: number): Eligibility {
  const base = { fplPercent: fplPct, hospitalCcn: policy.hospitalCcn, basis: policy.basis } as const;
  const free = policy.freeCareMaxFpl.value;
  const tiers = [...(policy.tiers.value ?? [])].sort((a, b) => a.maxFplInclusive - b.maxFplInclusive);
  if (free == null && tiers.length === 0) return { ...base, status: "unknown", discountPercent: null, quote: null, sourceUrl: null };
  if (free != null && fplPct <= free) return { ...base, status: "free", discountPercent: 100, quote: policy.freeCareMaxFpl.quote, sourceUrl: policy.freeCareMaxFpl.sourceUrl };
  const tier = tiers.find((t) => fplPct <= t.maxFplInclusive);
  if (tier) return { ...base, status: "discount", discountPercent: tier.discountPercent, quote: policy.tiers.quote, sourceUrl: policy.tiers.sourceUrl };
  return { ...base, status: "none", discountPercent: 0, quote: policy.tiers.quote ?? policy.freeCareMaxFpl.quote, sourceUrl: policy.tiers.sourceUrl ?? policy.freeCareMaxFpl.sourceUrl };
}

/** Estimated reduction on a balance, rounded half up to the cent. 75% of $226.00 is $169.50. */
export function estimateReduction(balanceCents: number, eligibility: Eligibility): number {
  if (eligibility.status === "unknown" || eligibility.status === "none" || eligibility.discountPercent == null) return 0;
  return Math.round((balanceCents * eligibility.discountPercent) / 100);
}
