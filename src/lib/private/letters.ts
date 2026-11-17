/**
 * The letters of private mode (docs/features/snap-incognito.md §6 and §7). The rule: no assumed value, and nothing
 * derived from one, is printed as a fact. A letter prints only values a dropped page showed (never the gap, a sum or a
 * yearly figure worked out from a monthly one), leaves a placeholder or a ruled blank for everything personal or guessed,
 * and prints tick boxes for a pen. Pure: it takes no name, no account number and no household figure.
 */
import { formatUsd } from "@/lib/money";
import { formatDate, type CaseFacts } from "@/lib/templates/facts";
import type { ActionKind, Finding } from "@/lib/types";
import { LETTER_TITLES, TICK_BOXES, fill } from "./copy";
import { assume, outcomeOf } from "./join";
import type { Coverage, Joined, PrivatePolicy } from "./types";

/** What a letter prints where a personal detail or an unread date would go. None is figure-shaped, so `validateDraft` passes them. */
export const PLACEHOLDERS = { patient: "[Patient name]", account: "[account number]", hospital: "[Hospital name]", statementDate: "[statement date]", dueDate: "[due date]" };

/** A ruled blank, as characters. */
const BLANK = "____";
const SAME_VISIT = "Please confirm this notice covers the same visit.";
// the statement is named by the kind of document that was dropped, never by the coverage
const NOTICE = { msn: "Medicare's Summary Notice", eob: "The insurer's statement" };
const PERIOD = { week: " a week", two_weeks: " every two weeks", month: " a month", year: " a year", other: "" };
const SIGNATURE = [
  "Thank you,",
  "",
  "[ ] I am the patient   [ ] I am helping the patient",
  "",
  `Name: ${BLANK}`,
  `Signature: ${BLANK}`,
  `Patient's signature, or attach the patient's written permission: ${BLANK}`,
  `Date: ${BLANK}`,
];

/**
 * Which letters exist and what they say: the correction letter when one line explains the gap, the information request
 * when the charges could not be checked or no line explains the gap, nothing when there is nothing to ask about; and the
 * help application whenever a policy was matched that does not exclude this patient, whatever the tier.
 * Each letter comes with the facts it is checked against: `ctx.facts` without anything that depends on the household guess.
 */
export function privateDrafts(
  j: Joined,
  policy: PrivatePolicy | null,
  coverage: Coverage,
  ctx: { facts: CaseFacts; findings: Finding[] },
): Array<{ kind: ActionKind; title: string; draft: string; facts: CaseFacts }> {
  const quotes = policy ? [policy.policy.freeCareMaxFpl.quote, policy.policy.tiers.quote, policy.policy.windowDays.quote].filter((q): q is string => !!q) : [];
  const facts: CaseFacts = {
    ...ctx.facts,
    patientName: PLACEHOLDERS.patient,
    hospitalName: policy?.exact ? policy.name : PLACEHOLDERS.hospital,
    incomeAnnualCents: undefined,
    householdSize: undefined,
    fplPercent: undefined,
    tierPercent: undefined,
    policyQuote: quotes.join("\n") || null,
    extraCents: j.incomes.map((i) => i.cents),
  };

  const outcome = outcomeOf(ctx.findings, j);
  const line = ctx.facts.removedLine;
  const notice = j.notice;
  const owes = formatUsd(j.bill.patientOwesCents);
  const due = formatDate(j.bill.dueDate ?? PLACEHOLDERS.dueDate);
  // the pairing is asked about, not asserted, unless the line that decides it paired on code and date
  const asks = outcome === "line_possible" || (!!notice && assume(j, policy).some((a) => a.key === "same_visit"));
  // a maximum we added up ourselves is never printed: the letter lists the lines by number instead
  const noticeSays = !notice
    ? ""
    : notice.maxFrom === "printed"
      ? ` ${NOTICE[notice.kind]}${asks ? "" : " for the same visit"} ${notice.kind === "msn" ? "says the most the patient may be billed is" : "shows the patient's responsibility as"} ${formatUsd(notice.maxCents)}.`
      : ` ${NOTICE[notice.kind]} lists these charges on its lines ${notice.lines.map((l) => l.n).join(", ")}.`;
  const corrected = `If this item may not be billed to the patient separately, please send a corrected statement${notice?.maxFrom === "printed" ? ` showing ${formatUsd(notice.maxCents)}` : ""}.`;
  const ticks = `${notice?.kind === "msn" ? TICK_BOXES.medicare : TICK_BOXES.insurance}   ${TICK_BOXES.none}`;
  const head = [
    `To: Patient Financial Services, ${facts.hospitalName}`,
    `Re: account number ${PLACEHOLDERS.account}, statement dated ${formatDate(j.bill.statementDate ?? PLACEHOLDERS.statementDate)}, patient ${PLACEHOLDERS.patient}`,
    "",
  ];
  const letter = (kind: ActionKind, title: string, body: string[]) => ({ kind, title, draft: [...head, ...body, "", ...SIGNATURE].join("\n"), facts });

  const out: ReturnType<typeof privateDrafts> = [];
  if ((outcome === "line_found" || outcome === "line_possible") && line) {
    const charge = formatUsd(line.chargeCents);
    out.push(letter("correction_request", fill(LETTER_TITLES.correction_request, { n: line.n }), [
      `The statement asks for ${owes}.${noticeSays}`,
      "",
      ...(outcome === "line_found"
        ? [`  Bill line ${line.n}: ${line.code} ${charge}`, "  The notice, same code and date: nothing the patient may be billed.", "", `Please review line ${line.n}. ${corrected}`]
        : [`Bill line ${line.n} (${charge}) appears to match an item the notice shows with nothing the patient may be billed. Please review it. ${SAME_VISIT}`, "", corrected]),
      "",
      ticks,
      "",
      `Please hold the account while you review, so that no collection activity or late fee occurs before the ${due} due date. If you believe the charge is correct, please explain why in writing.`,
    ]));
  } else if (outcome !== "nothing_found") {
    out.push(letter("information_request", LETTER_TITLES.information_request, [
      `The statement asks for ${owes}, due ${due}.${noticeSays}${notice && asks ? ` ${SAME_VISIT}` : ""}`,
      "",
      "We have not been able to compare each line of the statement with the notice. Please send an itemized bill for this account and the claim adjustment reason codes returned for each line.",
      "",
      ticks,
      "",
      "Please hold the account while we review the itemized bill, so that no collection activity or late fee occurs before the due date.",
    ]));
  }
  if (policy && coverage !== "not_covered") {
    out.push(letter("assistance_application", LETTER_TITLES.assistance_application, [
      `I am applying for financial assistance for the patient named above.${quotes.length ? " Your policy states:" : ""}`,
      ...(quotes.length ? ["", ...quotes.map((q) => `"${q}"`)] : []),
      "",
      // each figure and its period as the page prints them: no yearly total is worked out here
      ...j.incomes.map((i) => `The enclosed income letter shows ${formatUsd(i.cents)}${PERIOD[i.period]}.`),
      `Total yearly household income: ${BLANK}`,
      `Household size: ${BLANK}`,
      "",
      ticks,
      "",
      "Please tell us which tier of your published financial assistance policy, if any, applies to this household.",
    ]));
  }
  return out;
}
