import { formatUsd } from "@/lib/money";
import type { ActionKind } from "@/lib/types";
import { formatDate, reLine, signature, type CaseFacts } from "./facts";

/** Asks Patient Financial Services to review one line and hold the account. Never asserts an overbilling. */
export function draft(f: CaseFacts): { kind: ActionKind; title: string; draft: string } {
  const gap = formatUsd(f.gapCents ?? f.askedCents - f.noticeMaxCents);
  const line = f.removedLine;
  const lineBlock = line
    ? [
        `The difference of ${gap} appears to match line ${line.n} on the statement:`,
        ``,
        `  Bill line ${line.n}: ${line.code} ${line.description} ${formatUsd(line.chargeCents)}`,
        line.noticeNote ? `  Notice line ${line.n}: "${line.noticeNote}"` : `  Notice line ${line.n}: no separate patient responsibility is shown for this item.`,
        ``,
        `Please review line ${line.n}. If this item may not be billed to the patient separately, please send a corrected statement showing ${formatUsd(f.correctedCents)}.`,
      ]
    : [`The difference of ${gap} does not appear on the notice as the patient's responsibility. Please review the statement and, if the amount may not be billed to the patient, send a corrected statement showing ${formatUsd(f.correctedCents)}.`];
  const text = [
    `To: Patient Financial Services, ${f.hospitalName}`,
    reLine(f),
    ``,
    `The statement asks for ${formatUsd(f.askedCents)}. Medicare's Summary Notice for the same visit says the most the patient may be billed is ${formatUsd(f.noticeMaxCents)}.`,
    ...lineBlock,
    ``,
    `Please hold the account while you review, so that no collection activity or late fee occurs before the ${formatDate(f.dueDate)} due date. If you believe the charge is correct, please explain why in writing.`,
    ``,
    `Thank you,`,
    signature(f),
  ].join("\n");
  const title = line ? `Ask Patient Financial Services to Review Line ${line.n}` : "Ask Patient Financial Services to Review the Statement";
  return { kind: "correction_request", title, draft: text };
}
