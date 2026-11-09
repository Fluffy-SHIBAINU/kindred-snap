import { arithmetic, type ArithmeticCheck } from "@/lib/compare";
import type { ExtractionResult } from "./types";

const LOWERED = 0.5;

/** Field keys each check depends on, as fixtures/cases/*.json names them; a line charge field is "line_<n>_charge". */
const INVOLVED: Record<string, (keys: string[]) => string[]> = {
  "line charges add up to total charges": (keys) => ["total_charges", ...keys.filter((k) => /^line_\d+_charge$/.test(k))],
  "patient owes equals total minus adjustments minus insurance paid": () => ["patient_owes", "total_charges", "adjustments", "insurance_paid"],
};

/** Deterministic post-extraction pass: sums only. A failing check lowers confidence on the fields it involves and nothing else. */
export function validateExtraction(result: ExtractionResult): { result: ExtractionResult; checks: ArithmeticCheck[] } {
  if (result.status !== "ok" || !result.billTotals || !result.billLines) return { result, checks: [] };
  const checks = arithmetic(result.billTotals, result.billLines);
  const keys = result.fields.map((f) => f.key);
  const suspect = new Set(checks.filter((c) => !c.ok).flatMap((c) => INVOLVED[c.check]?.(keys) ?? []));
  if (suspect.size === 0) return { result, checks };
  const fields = result.fields.map((f) => (suspect.has(f.key) ? { ...f, confidence: Math.min(f.confidence, LOWERED) } : f));
  return { result: { ...result, fields }, checks };
}
