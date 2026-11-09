import { allowedTokens, numberTokens, type CaseFacts } from "./facts";

/** A draft may only contain numbers the case contains. Returns every offender; a draft with offenders is never shown. */
export function validateDraft(draft: string, facts: CaseFacts): { ok: boolean; unknownNumbers: string[] } {
  const allowed = allowedTokens(facts);
  const unknownNumbers = [...new Set(numberTokens(draft).filter((t) => !allowed.has(t)))];
  return { ok: unknownNumbers.length === 0, unknownNumbers };
}
