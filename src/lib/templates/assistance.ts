import { formatUsd } from "@/lib/money";
import type { ActionKind } from "@/lib/types";
import { formatPercent, reLine, signature, type CaseFacts } from "./facts";

/** Applies for the hospital's published financial assistance; eligibility stays the hospital's decision. */
export function draft(f: CaseFacts): { kind: ActionKind; title: string; draft: string } {
  const line = f.removedLine;
  const income = f.incomeAnnualCents != null ? `Annual household income: ${formatUsd(f.incomeAnnualCents)}.` : `Household income: to be provided.`;
  const fpl = f.fplPercent != null ? ` That appears to be about ${formatPercent(f.fplPercent)} of the federal poverty guideline.` : "";
  const tier =
    f.tierPercent != null
      ? `Under your published financial assistance policy this appears to fall in the ${formatPercent(f.tierPercent)} discount tier. Please apply that tier to the account.`
      : `Please tell us which tier of your published financial assistance policy, if any, applies to this household.`;
  const balance = line
    ? `We have separately asked you to review line ${line.n} (${line.code}, ${formatUsd(line.chargeCents)}), which may not be the patient's responsibility. Please apply the discount to the balance after that review, which we understand would be ${formatUsd(f.correctedCents)} rather than ${formatUsd(f.askedCents)}.`
    : `Please apply the discount to the current balance of ${formatUsd(f.correctedCents)}.`;
  const window = f.windowDays != null ? ` We understand your policy accepts applications within ${f.windowDays} days of the first statement.` : "";
  const text = [
    `To: Patient Financial Services, ${f.hospitalName}`,
    reLine(f),
    ``,
    `I am applying for financial assistance for ${f.patientName}.`,
    ``,
    `Household size: ${f.householdSize ?? "to be provided"}.`,
    income + fpl,
    ``,
    tier,
    f.policyQuote ? `Your policy states: "${f.policyQuote}"` : ``,
    ``,
    balance,
    ``,
    `I can provide income documents on request. I understand the hospital decides eligibility.${window}`,
    ``,
    `Thank you,`,
    signature(f),
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
  return { kind: "assistance_application", title: `Apply for Financial Assistance at ${f.hospitalName}`, draft: text };
}
