import { formatUsd } from "@/lib/money";
import type { ActionKind } from "@/lib/types";
import { formatDate, reLine, signature, type CaseFacts } from "./facts";

/** Asks for an itemized bill and the claim adjustment reason, for when the Medicare notice is missing or unclear. */
export function draft(f: CaseFacts): { kind: ActionKind; title: string; draft: string } {
  const line = f.removedLine;
  const lineAsk = line
    ? [
        `In particular, please include the claim adjustment reason for line ${line.n}:`,
        ``,
        `  Bill line ${line.n}: ${line.code} ${line.description} ${formatUsd(line.chargeCents)}`,
        line.noticeNote ? `  Notice line ${line.n}: "${line.noticeNote}"` : ``,
        ``,
        `This item appears on the statement as the patient's responsibility, and we want to confirm that it may be billed separately.`,
      ]
    : [`Without the itemized bill we cannot tell whether ${formatUsd(f.askedCents)} may not match what Medicare calculated as the patient's share. It appears the statement is a summary only.`];
  const text = [
    `To: Patient Financial Services, ${f.hospitalName}`,
    reLine(f),
    ``,
    `The statement asks for ${formatUsd(f.askedCents)}, due ${formatDate(f.dueDate)}. Please send an itemized bill for this account and the claim adjustment reason codes Medicare returned for each line.`,
    ...lineAsk,
    ``,
    `Please hold the account while we review the itemized bill, so that no collection activity or late fee occurs before the due date.`,
    ``,
    `Thank you,`,
    signature(f),
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
  return { kind: "information_request", title: "Ask for an Itemized Bill and the Claim Adjustment Reason", draft: text };
}
