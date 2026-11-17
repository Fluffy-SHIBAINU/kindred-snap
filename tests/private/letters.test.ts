import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatUsd } from "@/lib/money";
import { coverageOf, join } from "@/lib/private/join";
import { PLACEHOLDERS, privateDrafts } from "@/lib/private/letters";
import { boundRead } from "@/lib/private/scrub";
import type { Joined, PrivatePolicy, PrivateRead } from "@/lib/private/types";
import { numberTokens, type CaseFacts } from "@/lib/templates/facts";
import { validateDraft } from "@/lib/templates/validate";
import type { ActionKind, Finding, Policy } from "@/lib/types";

const TODAY = "2026-11-17";
const table = JSON.parse(readFileSync("fixtures/private/reads.json", "utf8")) as Record<string, { read: unknown }>;
const demo = (id: string, page: number) => boundRead(table[id].read, page, TODAY);
const BILL = demo("bill-main", 1);
const MSN = demo("msn-main", 2);
const INCOME = demo("income-letter", 3);
const EOB: PrivateRead = { ...MSN, kind: "eob" };
const income = (cents: number, period: NonNullable<PrivateRead["income"]>["period"], page: number): PrivateRead => ({ ...boundRead({ kind: "income" }, page, TODAY), income: { cents, period } });
const lines = (r: PrivateRead, change: (l: PrivateRead["lines"][number]) => Partial<PrivateRead["lines"][number]>) => ({ ...r, lines: r.lines.map((l) => ({ ...l, ...change(l) })) });

const riverbend = JSON.parse(readFileSync("fixtures/policies/riverbend.json", "utf8")) as Policy;
const QUOTES = [riverbend.freeCareMaxFpl.quote!, riverbend.tiers.quote!, riverbend.windowDays.quote!];
const policy = (over: Partial<PrivatePolicy> = {}, insured: boolean | null = true): PrivatePolicy => ({
  ccn: null, name: "Riverbend Community Hospital", city: "Tacoma", state: "WA", exact: true, policy: riverbend,
  insuredCovered: { value: insured, quote: null, sourceUrl: null, checkedOn: null }, otherConditions: [], ...over,
});

type Flag = { n: number; confidence: "likely" | "possible" };
const LIKELY: Flag = { n: 3, confidence: "likely" };
const finding = (kind: Finding["kind"], confidence: Finding["confidence"]): Finding => ({ id: kind, caseId: "private", kind, amountCents: null, confidence, explanation: "", evidence: [], requiresReview: false });

/**
 * What the pipeline hands `drafts` for these pages: the findings, and facts that still hold a name and the household's
 * figures (fixture names on purpose: none may reach a letter). `flag` is the line the comparison singled out.
 */
function ctxOf(j: Joined, flag?: Flag, household: Partial<CaseFacts> = { householdSize: 1, fplPercent: 235.3, tierPercent: 75 }): { facts: CaseFacts; findings: Finding[] } {
  const owes = j.bill.patientOwesCents;
  const gap = j.notice ? Math.max(0, owes - j.notice.maxCents) : 0;
  const line = flag && j.bill.lines.find((l) => l.n === flag.n);
  const findings = !j.notice
    ? [finding("insufficient_information", "insufficient")]
    : gap === 0
      ? [finding("no_discrepancy", "likely")]
      : flag
        ? [finding("patient_owes_exceeds_notice", flag.confidence), finding("line_not_patient_responsibility", flag.confidence)]
        : [finding("patient_owes_exceeds_notice", "possible")];
  return {
    findings,
    facts: {
      patientName: "Dorothy M. Hale (synthetic)", helperName: "Jenna Hale (synthetic)", hospitalName: j.hospital?.name ?? "",
      statementDate: j.bill.statementDate ?? "", dueDate: j.bill.dueDate ?? "", askedCents: owes, noticeMaxCents: j.notice?.maxCents,
      removedLine: line && { n: line.n, code: line.code, description: "", chargeCents: line.chargeCents }, gapCents: gap || undefined, correctedCents: owes - gap,
      incomeAnnualCents: j.incomeAnnualCents ?? undefined, policyQuote: riverbend.tiers.quote, windowDays: 240, ...household,
    },
  };
}

function draftsFor(reads: PrivateRead[], p: PrivatePolicy | null, flag?: Flag, household?: Partial<CaseFacts>) {
  const j = join(reads);
  if ("stop" in j) throw new Error(`stopped: ${j.stop}`);
  return privateDrafts(j, p, coverageOf(j, p), ctxOf(j, flag, household));
}
const kinds = (ds: ReturnType<typeof draftsFor>) => ds.map((d) => d.kind);
const of = (ds: ReturnType<typeof draftsFor>, kind: ActionKind) => ds.find((d) => d.kind === kind)!.draft;

// one row per way the pages can come: what was dropped, the matched policy, and the line the comparison singled out
const CASES: Array<{ name: string; reads: PrivateRead[]; policy: PrivatePolicy | null; flag?: Flag }> = [
  { name: "the demo files", reads: [BILL, MSN, INCOME], policy: policy(), flag: LIKELY },
  { name: "an insurer's statement", reads: [BILL, EOB, INCOME], policy: policy(), flag: LIKELY },
  { name: "no notice", reads: [BILL, INCOME], policy: policy() },
  { name: "a bill alone, dates covered, hospital unknown", reads: [{ ...BILL, statementDate: null, dueDate: null }], policy: null },
  { name: "service dates covered", reads: [lines(BILL, () => ({ serviceDate: null })), MSN, INCOME], policy: policy(), flag: { n: 3, confidence: "possible" } },
  { name: "a code covered on an insurer's statement", reads: [lines(BILL, (l) => (l.n === 3 ? { code: null } : {})), EOB], policy: policy({ exact: false }), flag: { n: 3, confidence: "possible" } },
  { name: "the notice's maximum covered", reads: [BILL, { ...MSN, noticeMaxCents: null }, INCOME], policy: policy(), flag: LIKELY },
  { name: "a gap no line explains", reads: [BILL, { ...MSN, noticeMaxCents: 20000 }, INCOME], policy: policy() },
  { name: "a gap no line explains, dates covered", reads: [lines(BILL, () => ({ serviceDate: null })), { ...EOB, noticeMaxCents: 20000 }], policy: policy() },
  { name: "nothing to ask about, two incomes", reads: [{ ...BILL, patientOwesCents: 22600 }, MSN, income(313000, "month", 3), income(72000, "week", 4)], policy: policy() },
  { name: "a policy that excludes insured patients", reads: [BILL, MSN, INCOME], policy: policy({}, false), flag: LIKELY },
  { name: "a policy that excludes insured patients, no statement", reads: [BILL, INCOME], policy: policy({}, false) },
  { name: "a notice with its amounts covered", reads: [BILL, { ...lines(MSN, () => ({ youMayBeBilledCents: null })), noticeMaxCents: null }, INCOME], policy: policy() },
  { name: "a charge covered", reads: [lines(BILL, (l) => (l.n === 5 ? { chargeCents: null } : {})), MSN, INCOME], policy: policy(), flag: LIKELY },
];
const ALL = CASES.map((c) => ({ ...c, drafts: draftsFor(c.reads, c.policy, c.flag) }));
const readValues = (reads: PrivateRead[]) =>
  new Set(reads.flatMap((r) => [r.patientOwesCents, r.noticeMaxCents, r.income?.cents, ...r.lines.flatMap((l) => [l.chargeCents, l.billedCents, l.youMayBeBilledCents])]).flatMap((c) => (c == null ? [] : [formatUsd(c)])));
const withoutQuotes = (draft: string) => QUOTES.reduce((text, q) => text.replace(`"${q}"`, ""), draft);

describe("placeholders", () => {
  it("are the five the feature document lists, and none is figure-shaped", () => {
    expect(PLACEHOLDERS).toEqual({ patient: "[Patient name]", account: "[account number]", hospital: "[Hospital name]", statementDate: "[statement date]", dueDate: "[due date]" });
    for (const p of Object.values(PLACEHOLDERS)) expect(numberTokens(p), p).toEqual([]);
  });
});

describe("privateDrafts on the demo files", () => {
  const [correction, application] = draftsFor([BILL, MSN, INCOME], policy(), LIKELY);

  it("writes the correction letter with blanks and tick boxes, as mock PM4a shows it", () => {
    expect(correction.title).toBe("Ask Patient Financial Services to Review Line 3");
    expect(correction.draft).toBe(
      [
        "To: Patient Financial Services, Riverbend Community Hospital",
        "Re: account number [account number], statement dated Oct 20, 2026, patient [Patient name]",
        "",
        "The statement asks for $466.00. Medicare's Summary Notice for the same visit says the most the patient may be billed is $226.00.",
        "",
        "  Bill line 3: Q9967 $240.00",
        "  The notice, same code and date: nothing the patient may be billed.",
        "",
        "Please review line 3. If this item may not be billed to the patient separately, please send a corrected statement showing $226.00.",
        "",
        "[ ] The Medicare notice or insurer's statement for this visit is attached   [ ] I have not received one",
        "",
        "Please hold the account while you review, so that no collection activity or late fee occurs before the Nov 30, 2026 due date. If you believe the charge is correct, please explain why in writing.",
        "",
        "Thank you,",
        "",
        "[ ] I am the patient   [ ] I am helping the patient",
        "",
        "Name: ____",
        "Signature: ____",
        "Patient's signature, or attach the patient's written permission: ____",
        "Date: ____",
      ].join("\n"),
    );
  });

  it("writes the help application: every policy sentence in policy order, the income as printed, the rest blank", () => {
    expect(application.title).toBe("Help Application");
    expect(application.draft).toBe(
      [
        "To: Patient Financial Services, Riverbend Community Hospital",
        "Re: account number [account number], statement dated Oct 20, 2026, patient [Patient name]",
        "",
        "I am applying for financial assistance for the patient named above. Your policy states:",
        "",
        ...QUOTES.map((q) => `"${q}"`),
        "",
        "The enclosed income letter shows $37,560.00 a year.",
        "Total yearly household income: ____",
        "Household size: ____",
        "",
        "[ ] The Medicare notice or insurer's statement for this visit is attached   [ ] I have not received one",
        "",
        "Please tell us which tier of your published financial assistance policy, if any, applies to this household.",
        "",
        "Thank you,",
        "",
        "[ ] I am the patient   [ ] I am helping the patient",
        "",
        "Name: ____",
        "Signature: ____",
        "Patient's signature, or attach the patient's written permission: ____",
        "Date: ____",
      ].join("\n"),
    );
  });

  it("returns facts with the placeholder for the name and nothing that depends on the household guess", () => {
    expect(correction.facts).toBe(application.facts);
    expect(correction.facts).toMatchObject({ patientName: "[Patient name]", hospitalName: "Riverbend Community Hospital", policyQuote: QUOTES.join("\n"), extraCents: [3756000], askedCents: 46600, windowDays: 240 });
    for (const key of ["incomeAnnualCents", "householdSize", "fplPercent", "tierPercent"] as const) expect(correction.facts[key], key).toBeUndefined();
  });
});

describe("privateDrafts, which letters exist", () => {
  const picked = Object.fromEntries(ALL.map((c) => [c.name, kinds(c.drafts)]));

  it("the correction letter when one line explains the gap, the information request when the charges could not be checked", () => {
    expect(picked["the demo files"]).toEqual(["correction_request", "assistance_application"]);
    expect(picked["service dates covered"]).toEqual(["correction_request", "assistance_application"]);
    expect(picked["no notice"]).toEqual(["information_request", "assistance_application"]);
    expect(picked["a gap no line explains"]).toEqual(["information_request", "assistance_application"]);
    expect(picked["a notice with its amounts covered"]).toEqual(["information_request", "assistance_application"]);
    // a covered charge means no single line can be pointed to
    expect(picked["a charge covered"]).toEqual(["information_request", "assistance_application"]);
    expect(picked["nothing to ask about, two incomes"]).toEqual(["assistance_application"]);
  });

  it("no help application without a matched policy, or under a policy that excludes this patient", () => {
    expect(picked["a bill alone, dates covered, hospital unknown"]).toEqual(["information_request"]);
    expect(picked["a policy that excludes insured patients"]).toEqual(["correction_request"]);
    // insurance not known: the application is written and its tick boxes say what is attached
    expect(picked["a policy that excludes insured patients, no statement"]).toEqual(["information_request", "assistance_application"]);
    expect(draftsFor([{ ...BILL, patientOwesCents: 22600 }, MSN], null)).toEqual([]);
  });

  it("a household above the one-person top tier still gets the application, word for word the same", () => {
    const rich = [BILL, MSN, income(8000000, "year", 3)];
    const one = draftsFor(rich, policy(), LIKELY, { householdSize: 1, fplPercent: 501.3, tierPercent: null });
    const four = draftsFor(rich, policy(), LIKELY, { householdSize: 4, fplPercent: 242.4, tierPercent: 75 });
    expect(kinds(one)).toEqual(["correction_request", "assistance_application"]);
    expect(of(one, "assistance_application")).toContain("The enclosed income letter shows $80,000.00 a year.");
    expect(one.map((d) => d.draft)).toEqual(four.map((d) => d.draft));
    expect(one.map((d) => d.facts)).toEqual(four.map((d) => d.facts));
  });
});

describe("privateDrafts, the rule of section 6", () => {
  it("every letter passes validateDraft with its own facts", () => {
    for (const c of ALL) for (const d of c.drafts) expect(validateDraft(d.draft, d.facts), `${c.name}: ${d.title}`).toEqual({ ok: true, unknownNumbers: [] });
  });

  it("(b) every dollar figure in a letter is a value read off a page: no sum, product or difference", () => {
    for (const c of ALL) {
      const read = readValues(c.reads);
      for (const d of c.drafts) for (const figure of d.draft.match(/\$[\d,]+(?:\.\d+)?/g) ?? []) expect(read.has(figure), `${c.name}: ${figure}`).toBe(true);
    }
    // the gap, the added-up maximum and the yearly figure worked out from a monthly one are in no letter
    const text = (name: string) => ALL.find((c) => c.name === name)!.drafts.map((d) => d.draft).join("\n");
    expect(text("a gap no line explains")).toContain("$200.00");
    expect(text("a gap no line explains")).not.toContain("$266.00");
    expect(text("the notice's maximum covered")).not.toContain("$226.00");
    expect(text("nothing to ask about, two incomes")).not.toContain("$37,560.00");
  });

  it("(c) outside the quoted policy sentences no letter contains a percent sign", () => {
    for (const c of ALL) for (const d of c.drafts) expect(withoutQuotes(d.draft), `${c.name}: ${d.title}`).not.toContain("%");
    expect(of(ALL[0].drafts, "assistance_application")).toContain("75%");
  });

  it("(d) no letter contains \"waiting\", and none contains \"Medicare\" unless a Medicare notice was among the reads", () => {
    for (const c of ALL) {
      for (const d of c.drafts) {
        expect(d.draft, c.name).not.toContain("waiting");
        if (!c.reads.some((r) => r.kind === "msn")) expect(d.title + d.draft, `${c.name}: ${d.title}`).not.toContain("Medicare");
      }
    }
    expect(of(ALL[1].drafts, "correction_request")).toContain("The insurer's statement for the same visit shows the patient's responsibility as $226.00.");
    expect(of(ALL[1].drafts, "correction_request")).toContain("[ ] The notice or statement from my insurance for this visit is attached   [ ] I have not received one");
    expect(of(ALL[2].drafts, "information_request")).toContain("[ ] The notice or statement from my insurance for this visit is attached   [ ] I have not received one");
  });

  it("(e) a pair made any other way than code and date is asked about, never asserted", () => {
    for (const name of ["service dates covered", "a code covered on an insurer's statement"]) {
      const letter = of(ALL.find((c) => c.name === name)!.drafts, "correction_request");
      expect(letter, name).toContain("Bill line 3 ($240.00) appears to match an item the notice shows with nothing the patient may be billed. Please review it. Please confirm this notice covers the same visit.");
      expect(letter, name).not.toContain("same code and date");
      expect(letter, name).not.toContain("for the same visit");
      expect(letter, name).not.toContain("Q9967");
    }
    // an information request that cites the notice asks too, when no line pairs on code and date
    const undated = of(ALL.find((c) => c.name === "a gap no line explains, dates covered")!.drafts, "information_request");
    expect(undated).toContain("The insurer's statement shows the patient's responsibility as $200.00. Please confirm this notice covers the same visit.");
    expect(of(ALL.find((c) => c.name === "a gap no line explains")!.drafts, "information_request")).not.toContain("Please confirm");
    for (const c of ALL) for (const d of c.drafts) if (d.draft.includes("same code and date")) expect(d.draft, c.name).not.toContain("Please confirm this notice covers the same visit.");
  });

  it("no letter contains a name, an identifier, or a value that failed to print", () => {
    for (const c of ALL) for (const d of c.drafts) for (const word of ["authorized representative", "NaN", "undefined", "null", "Dorothy", "Hale", "Jenna", "4821"]) expect(d.title + d.draft, `${c.name}: ${word}`).not.toContain(word);
  });
});

describe("privateDrafts, blanks", () => {
  it("leaves the placeholder for a date that was not shown, and for the hospital unless its name matched exactly", () => {
    const [request] = ALL.find((c) => c.name === "a bill alone, dates covered, hospital unknown")!.drafts;
    expect(request.title).toBe("Ask Patient Financial Services for an Itemized Bill");
    expect(request.draft).toBe(
      [
        "To: Patient Financial Services, [Hospital name]",
        "Re: account number [account number], statement dated [statement date], patient [Patient name]",
        "",
        "The statement asks for $466.00, due [due date].",
        "",
        "We have not been able to compare each line of the statement with the notice. Please send an itemized bill for this account and the claim adjustment reason codes returned for each line.",
        "",
        "[ ] The notice or statement from my insurance for this visit is attached   [ ] I have not received one",
        "",
        "Please hold the account while we review the itemized bill, so that no collection activity or late fee occurs before the due date.",
        "",
        "Thank you,",
        "",
        "[ ] I am the patient   [ ] I am helping the patient",
        "",
        "Name: ____",
        "Signature: ____",
        "Patient's signature, or attach the patient's written permission: ____",
        "Date: ____",
      ].join("\n"),
    );
    expect(draftsFor([{ ...BILL, dueDate: null }, MSN], policy(), LIKELY)[0].draft).toContain("before the [due date] due date.");
    // a match by containment is shown on the result, not asserted in a letter
    for (const d of ALL.find((c) => c.name === "a code covered on an insurer's statement")!.drafts) {
      expect(d.draft).toContain("To: Patient Financial Services, [Hospital name]");
      expect(d.facts.hospitalName).toBe("[Hospital name]");
      expect(d.draft).not.toContain("Riverbend");
    }
  });

  it("prints each income as the page shows it, never a sum or a yearly total, and leaves the income line blank without one", () => {
    const two = of(ALL.find((c) => c.name === "nothing to ask about, two incomes")!.drafts, "assistance_application");
    expect(two).toContain("The enclosed income letter shows $3,130.00 a month.\nThe enclosed income letter shows $720.00 a week.\nTotal yearly household income: ____\nHousehold size: ____");
    const none = of(draftsFor([BILL, MSN], policy(), LIKELY), "assistance_application");
    expect(none).not.toContain("income letter");
    expect(none).toContain("\n\nTotal yearly household income: ____\nHousehold size: ____\n");
  });

  it("lists the notice's lines by number and prints no total when the maximum was added up", () => {
    const letter = of(ALL.find((c) => c.name === "the notice's maximum covered")!.drafts, "correction_request");
    expect(letter).toContain("The statement asks for $466.00. Medicare's Summary Notice lists these charges on its lines 1, 2, 3, 4, 5.");
    expect(letter).toContain("Please review line 3. If this item may not be billed to the patient separately, please send a corrected statement.");
  });

  it("quotes only the policy sentences that exist", () => {
    const bare: Policy = { ...riverbend, freeCareMaxFpl: { ...riverbend.freeCareMaxFpl, quote: null }, tiers: { ...riverbend.tiers, quote: null }, windowDays: { ...riverbend.windowDays, quote: null } };
    const [application] = draftsFor([{ ...BILL, patientOwesCents: 22600 }, MSN], policy({ policy: bare }));
    expect(application.draft).toContain("I am applying for financial assistance for the patient named above.\n\nTotal yearly household income: ____");
    expect(application.facts.policyQuote).toBeNull();
    const [, partial] = draftsFor([BILL, INCOME], policy({ policy: { ...bare, tiers: riverbend.tiers } }));
    expect(partial.draft).toContain(`Your policy states:\n\n"${riverbend.tiers.quote}"\n\nThe enclosed income letter`);
  });
});
