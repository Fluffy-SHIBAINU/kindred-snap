/** HHS poverty guidelines, 48 contiguous states and DC, in cents. Source: fixtures/hospitals.json → poverty_guidelines. */
export const POVERTY_GUIDELINES: Record<number, { base: number; perPerson: number }> = {
  2026: { base: 1596000, perPerson: 568000 },
  2025: { base: 1565000, perPerson: 550000 },
};
export const DEFAULT_GUIDELINE_YEAR = 2026;

export function guidelineCents(householdSize: number, year = DEFAULT_GUIDELINE_YEAR): number {
  const g = POVERTY_GUIDELINES[year];
  if (!g) throw new Error(`No poverty guideline for ${year}`);
  if (!Number.isInteger(householdSize) || householdSize < 1) throw new Error(`Household size must be a whole number of at least 1`);
  return g.base + g.perPerson * (householdSize - 1);
}

/** Percent of the federal poverty guideline, to one decimal place. */
export function fplPercent(annualCents: number, householdSize: number, year = DEFAULT_GUIDELINE_YEAR): number {
  if (annualCents < 0) throw new Error("Income cannot be negative");
  return Math.round((annualCents / guidelineCents(householdSize, year)) * 1000) / 10;
}
