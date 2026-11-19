/**
 * Redaction tolerance: one `it` per row of docs/features/snap-incognito.md §4, named by its id. Each case is the demo
 * reads (fixtures/private/reads.json) with one thing changed. The rows marked e2e are also driven through the browser.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DemoOnly, FixturePrivateReader, StubPrivateReader } from "@/lib/adapters/extract/privateRead";
import { matchHospital, privatePolicyOf, type AtlasSheet } from "@/lib/atlas";
import { GUESS_KEYS, RESULT } from "@/lib/private/copy";
import { join } from "@/lib/private/join";
import { demoMatch, runStateless } from "@/lib/private/run";
import { boundRead } from "@/lib/private/scrub";
import type { PrivatePolicy, PrivateRead, PrivateResult } from "@/lib/private/types";

const TODAY = "2026-11-17";
const table = JSON.parse(readFileSync("fixtures/private/reads.json", "utf8")) as Record<string, { read: Record<string, unknown> }>;
const demo = (id: string, page: number) => boundRead(table[id].read, page, TODAY);
const BILL = demo("bill-main", 1);
const MSN = demo("msn-main", 2);
const INCOME = demo("income-letter", 3);
const EOB: PrivateRead = { ...MSN, kind: "eob" };
const empty = (kind: PrivateRead["kind"], page: number): PrivateRead => boundRead({ kind }, page, TODAY);
const income = (cents: number, period: NonNullable<PrivateRead["income"]>["period"], page: number): PrivateRead => ({ ...empty("income", page), income: { cents, period } });
const lines = (r: PrivateRead, change: (l: PrivateRead["lines"][number]) => Partial<PrivateRead["lines"][number]>) => ({ ...r, lines: r.lines.map((l) => ({ ...l, ...change(l) })) });

type Deps = Parameters<typeof runStateless>[1];
const deps: Deps = { match: demoMatch, today: TODAY, demo: true };
const matching = (over: Partial<PrivatePolicy>): Deps => ({ ...deps, match: (h) => { const p = demoMatch(h); return p && { ...p, ...over }; } });
async function ok(reads: PrivateRead[], d: Deps = deps): Promise<PrivateResult> {
  const out = await runStateless(reads, d);
  if (out.status !== "ok") throw new Error(`not ok: ${JSON.stringify(out)}`);
  return out.result;
}

/** The guesses of a run, which carry the chip Assumed; `listed` are the plain lines under them. */
const chips = (r: PrivateResult) => r.assumptions.filter((a) => GUESS_KEYS.includes(a.key)).map((a) => a.key);
const listed = (r: PrivateResult) => r.assumptions.filter((a) => !GUESS_KEYS.includes(a.key)).map((a) => a.key);
const said = (r: PrivateResult, key: string) => r.assumptions.find((a) => a.key === key)?.statement;
const letter = (r: PrivateResult, kind: PrivateResult["letters"][number]["kind"]) => r.letters.find((l) => l.kind === kind)?.draft ?? "";
const kinds = (r: PrivateResult) => r.letters.map((l) => l.kind);
const found = (r: PrivateResult) => r.findings.map((f) => [f.kind, f.amountCents, f.confidence, f.billLine]);
/** Everything but the count of pages read, which differs when a file is added and nothing else does. */
const sansPages = (r: PrivateResult) => ({ ...r, steps: r.steps.slice(1) });

// T2 is the yardstick: the demo files with every identifier visible
const base = await ok([BILL, MSN, INCOME]);
const SAME_VISIT = "Please confirm this notice covers the same visit.";

describe("redaction tolerance (feature document section 4)", () => {
  it("T1: every identifier covered gives the full result", async () => {
    const r = await ok([demo("bill-main-covered", 1), demo("msn-main-covered", 2), demo("income-letter-covered", 3)]);
    expect(r.outcome).toBe("line_found");
    expect(found(r)).toEqual([["patient_owes_exceeds_notice", 24000, "likely", 3], ["line_not_patient_responsibility", 24000, "likely", 3]]);
    expect(r.households?.map((h) => [h.size, h.status, h.discountPercent])).toEqual([[1, "discount", 75], [2, "free", 100], [3, "free", 100], [4, "free", 100]]);
    expect(r.help).toBe("by_household");
    // $409.50 if the household is one person
    expect(r.estimate).toEqual({ cents: 40950, parts: [{ label: RESULT.partLine, cents: 24000 }, { label: RESULT.partHelp, cents: 16950 }] });
    expect(chips(r)).toEqual(["household_size", "coverage_type"]);
    expect(listed(r)).toEqual([]);
  });

  it("T2: every identifier visible gives the same result, byte for byte, with none of the fixture's names or numbers in it", async () => {
    const covered = await runStateless([demo("bill-main-covered", 1), demo("msn-main-covered", 2), demo("income-letter-covered", 3)], deps);
    const visible = await runStateless([BILL, MSN, INCOME], deps);
    expect(JSON.stringify(visible)).toBe(JSON.stringify(covered));
    const medicare = (JSON.parse(readFileSync("fixtures/case-synthetic.json", "utf8")) as { patient: { medicare_id_masked: string } }).patient.medicare_id_masked;
    for (const s of ["Dorothy", "Hale", "Jenna", "4821", medicare, medicare.slice(0, 4), "[removed]"]) expect(JSON.stringify(visible), s).not.toContain(s);
  });

  it("T3: partly covered files, and a mix of covered and uncovered ones, give the same result", async () => {
    expect(await ok([demo("bill-main-partly", 1), demo("msn-main-partly", 2), demo("income-letter-partly", 3)])).toEqual(base);
    expect(await ok([demo("bill-main-covered", 1), MSN, demo("income-letter-partly", 3)])).toEqual(base);
    expect(await ok([BILL, demo("msn-main-covered", 2), INCOME])).toEqual(base);
  });

  it("T4: a hospital that is covered, or matches no single atlas sheet, gets the comparison and no help program", async () => {
    const sheet = (ccn: string): AtlasSheet => ({
      hospital: { ccn, name: "RIVERBEND COMMUNITY HOSPITAL", city: "TACOMA", state: "WA" }, version: 1, status: "published",
      eligibility: { free_care_max_fpl: { value: "200", quote: "Free care at or below 200% of the federal poverty guideline." } }, apply: {}, contacts: {}, sources: [],
    });
    const atlas = (sheets: AtlasSheet[]): Deps => ({ today: TODAY, demo: false, match: (h) => { const m = matchHospital(h, sheets); return m && privatePolicyOf(m.sheet, m.exact); } });
    const one = atlas([sheet("500001")]);
    // the control: name and state read, one sheet
    const matched = await ok([BILL, MSN, INCOME], one);
    expect(matched.policy).toMatchObject({ ccn: "500001", name: "Riverbend Community Hospital", exact: true });
    expect(kinds(matched)).toEqual(["correction_request", "assistance_application"]);

    const nameCovered = [{ ...BILL, hospital: null, covered: ["hospital" as const] }, { ...MSN, hospital: null }, INCOME];
    const stateCovered = [{ ...BILL, hospital: { name: "Riverbend Community Hospital", city: "Tacoma", state: null } }, MSN, INCOME];
    for (const [reads, d] of [[nameCovered, one], [stateCovered, one], [[BILL, MSN, INCOME], atlas([sheet("500001"), sheet("500002")])]] as const) {
      const r = await ok([...reads], d);
      expect(r).toMatchObject({ outcome: "line_found", policy: null, coverage: "no_policy", help: "no_hospital", households: null });
      expect(found(r)).toEqual(found(base));
      expect(kinds(r)).toEqual(["correction_request"]);
      expect(letter(r, "correction_request")).toContain("To: Patient Financial Services, [Hospital name]");
      // the name on the page was a lookup key only: it is not in what goes back to the phone
      expect(JSON.stringify(r)).not.toMatch(/Riverbend|Tacoma/i);
      expect(chips(r)).toEqual(["coverage_type", "hospital"]);
      expect(said(r, "hospital")).toBe("We couldn't tell which hospital.");
      expect(r.estimate).toEqual({ cents: 24000, parts: [{ label: RESULT.partLine, cents: 24000 }] });
    }
  });

  it("T5: a covered service date pairs lines on code and amount, never as code and date", async () => {
    const r = await ok([lines(BILL, () => ({ serviceDate: null })), MSN, INCOME]);
    expect(r.outcome).toBe("line_possible");
    expect(found(r)).toEqual([["patient_owes_exceeds_notice", 24000, "possible", 3], ["line_not_patient_responsibility", 24000, "possible", 3]]);
    expect(r.findings[1].evidence[0]).toBe("Bill line 3, Q9967, $240.00");
    expect(chips(r)).toEqual(["household_size", "coverage_type", "same_visit"]);
    expect(listed(r)).toEqual(["service_date"]);
    // the letter names the line by its number and charge, prints no date for it, and asks instead of asserting
    const text = letter(r, "correction_request");
    expect(text).toContain(`Bill line 3 ($240.00) appears to match an item the notice shows with nothing the patient may be billed. Please review it. ${SAME_VISIT}`);
    expect(text).not.toMatch(/same code and date|Sep 14|2026-09-14/);
    expect(r.steps[2].summary).toBe("Line 3 may not be yours to pay. Assumed.");
  });

  it("T6: a line whose code is covered pairs on amount, in order, with confidence possible", async () => {
    const r = await ok([lines(BILL, (l) => (l.n === 3 ? { code: null } : {})), MSN, INCOME]);
    // the h1 of this outcome carries the chip Assumed and "We matched it by amount, not by date."
    expect(r.outcome).toBe("line_possible");
    expect(found(r)).toEqual([["patient_owes_exceeds_notice", 24000, "possible", 3], ["line_not_patient_responsibility", 24000, "possible", 3]]);
    expect(r.findings[1].evidence[0]).toBe("Bill line 3, Sep 14, 2026, $240.00");
    expect(listed(r)).toEqual(["line_code"]);
    const text = letter(r, "correction_request");
    expect(text).toContain(`Bill line 3 ($240.00) appears to match`);
    expect(text).toContain(SAME_VISIT);
    expect(text).not.toMatch(/Q9967|same code and date/);
    // the other four lines still pair on code and date
    expect(found(await ok([lines(BILL, (l) => (l.n === 1 ? { code: null } : {})), MSN, INCOME]))).toEqual(found(base));
  });

  it("T7: a covered statement date or due date leaves a blank and no due-date alert", async () => {
    const r = await ok([{ ...BILL, statementDate: null, dueDate: null, covered: ["statement_date", "due_date"] }, MSN, INCOME]);
    expect(r.dueDate).toBeNull();
    expect(r.outcome).toBe("line_found");
    expect(letter(r, "correction_request")).toContain("Re: account number [account number], statement dated [statement date], patient [Patient name]");
    expect(letter(r, "correction_request")).toContain("before the [due date] due date.");
    expect(letter(r, "assistance_application")).toContain("statement dated [statement date]");
    // no chip: listed as not shown
    expect(chips(r)).toEqual(chips(base));
    expect(listed(r)).toEqual(["statement_date", "due_date"]);
    const dueOnly = await ok([{ ...BILL, dueDate: null }, MSN, INCOME]);
    expect(dueOnly.dueDate).toBeNull();
    expect(letter(dueOnly, "correction_request")).toContain("statement dated Oct 20, 2026, patient [Patient name]");
    expect(listed(dueOnly)).toEqual(["due_date"]);
  });

  it("T8: a covered amount owed is the hard stop, and the next file completes the check", async () => {
    const stopped = [demo("bill-main-amount-covered", 1), MSN, INCOME];
    expect(await runStateless(stopped, deps)).toEqual({ status: "needs_amount", reason: "covered" });
    expect(await runStateless([demo("bill-main-amount-covered", 1)], deps)).toEqual({ status: "needs_amount", reason: "covered" });
    // the pages are kept on the phone; a copy that shows the amount is added and the same request runs again
    const completed = await ok([...stopped, { ...BILL, page: 4 }]);
    expect(sansPages(completed)).toEqual(sansPages(base));
    expect(completed.steps[0].summary).toBe("4 pages read.");
  });

  it("T9: with no notice or statement the comparison is insufficient information and the help path still runs", async () => {
    const r = await ok([BILL, INCOME]);
    expect(r.outcome).toBe("no_notice");
    expect(r.noticeKind).toBeNull();
    // the finding the pipeline itself makes without a notice
    expect(found(r)).toEqual([["insufficient_information", null, "insufficient", null]]);
    expect(kinds(r)).toEqual(["information_request", "assistance_application"]);
    expect(letter(r, "information_request")).toContain("[ ] The notice or statement from my insurance for this visit is attached   [ ] I have not received one");
    expect(chips(r)).toEqual(["household_size", "insurance_unknown"]);
    expect(said(r, "insurance_unknown")).toBe("We couldn't tell whether the patient has insurance.");
    expect(listed(r)).toEqual(["no_notice"]);
    // the demo policy covers insured patients, so not knowing changes nothing in the help program
    expect(r).toMatchObject({ coverage: "covered", help: "by_household", estimate: { cents: 34950, parts: [{ label: RESULT.partHelp, cents: 34950 }] } });
    // coverage is "insurance not known" only for a policy that excludes insured patients
    const excluding = await ok([BILL, INCOME], matching({ insuredCovered: { value: false, quote: "For patients who have no health insurance.", sourceUrl: null, checkedOn: null } }));
    expect(excluding).toMatchObject({ coverage: "insurance_unknown", help: "ceilings", estimate: null });
    expect(chips(excluding)).toEqual(["insurance_unknown"]);
  });

  it("T10: without a usable income the result lists the policy's ceilings and the letter leaves the income line blank", async () => {
    const covered: PrivateRead = { ...empty("income", 3), covered: ["income"] };
    for (const [name, extra, plain] of [["covered", [covered], "no_income"], ["no document", [], "no_income"], ["weekly", [income(72000, "week", 3)], "income_period"], ["fortnightly", [income(144000, "two_weeks", 3)], "income_period"]] as const) {
      const r = await ok([BILL, MSN, ...extra]);
      expect(r.help, name).toBe("ceilings");
      expect(r.households, name).toEqual([1, 2, 3, 4].map((size, i) => ({ size, fplPercent: null, status: "unknown", discountPercent: null, incomeUpToCents: [3192000, 4328000, 5464000, 6600000][i] })));
      // no estimate of the help: the line the notice shows stands alone
      expect(r.estimate, name).toEqual({ cents: 24000, parts: [{ label: RESULT.partLine, cents: 24000 }] });
      expect(letter(r, "assistance_application"), name).toContain("Total yearly household income: ____\nHousehold size: ____");
      expect(chips(r), name).toEqual(["coverage_type"]);
      expect(listed(r), name).toEqual([plain]);
    }
    expect(letter(await ok([BILL, MSN]), "assistance_application")).not.toContain("income letter");
    expect(letter(await ok([BILL, MSN, income(72000, "week", 3)]), "assistance_application")).toContain("The enclosed income letter shows $720.00 a week.\nTotal yearly household income: ____");
    expect((await ok([BILL])).estimate).toBeNull();
  });

  it("T11: an insurer's statement is compared on \"your responsibility\" and nothing says Medicare", async () => {
    const r = await ok([BILL, EOB, INCOME], matching({ insuredCovered: { value: true, quote: null, sourceUrl: null, checkedOn: null } }));
    expect(r.noticeKind).toBe("eob");
    expect(found(r)).toEqual(found(base));
    expect(r.findings[0].evidence[1]).toBe("Insurer's statement, your responsibility $226.00");
    expect(JSON.stringify(r)).not.toContain("Medicare");
    expect(letter(r, "correction_request")).toContain("The insurer's statement for the same visit shows the patient's responsibility as $226.00.");
    expect(chips(r)).toEqual(["household_size", "coverage_type"]);
    expect(said(r, "coverage_type")).toBe("We took this to be an insurance plan, because you dropped an insurer's statement.");
    // with the demo partner, the one "Medicare" left is inside the hospital's own quoted sentence
    const withDemoPolicy = await ok([BILL, EOB, INCOME]);
    expect(JSON.stringify({ ...withDemoPolicy, policy: null })).not.toContain("Medicare");
    for (const l of withDemoPolicy.letters) expect(l.title + l.draft).not.toContain("Medicare");
  });

  it("T12: several files count once when equal, join when they agree, stop when they are two bills, and incomes add only when they differ", async () => {
    const twice = await ok([BILL, MSN, INCOME, { ...BILL, page: 4 }, { ...MSN, page: 5 }, { ...INCOME, page: 6 }]);
    expect(sansPages(twice)).toEqual(sansPages(base));
    // two pages of one bill: what one page leaves blank the other fills
    const front: PrivateRead = { ...BILL, lines: BILL.lines.slice(0, 2), patientOwesCents: null, dueDate: null };
    const back: PrivateRead = { ...BILL, page: 4, lines: BILL.lines.slice(2), hospital: null, statementDate: null };
    expect(sansPages(await ok([front, MSN, INCOME, back]))).toEqual(sansPages(base));
    expect(await runStateless([BILL, MSN, { ...BILL, page: 4, patientOwesCents: 12000 }], deps)).toEqual({ status: "needs_amount", reason: "two_bills" });

    const added = await ok([BILL, MSN, INCOME, income(108000, "month", 4)]);
    // $37,560.00 a year and $1,080.00 a month: 316.5% for one person
    expect(added.households?.map((h) => [h.fplPercent, h.discountPercent])).toEqual([[316.5, 50], [233.5, 75], [184.9, 100], [153.1, 100]]);
    expect(chips(added)).toEqual(["household_size", "coverage_type", "income_added"]);
    const application = letter(added, "assistance_application");
    expect(application).toContain("The enclosed income letter shows $37,560.00 a year.\nThe enclosed income letter shows $1,080.00 a month.\nTotal yearly household income: ____");
    expect(application).not.toMatch(/\$50,520\.00|\$12,960\.00/);
  });

  it("T13: a file that is none of the four kinds is left out", async () => {
    const r = await ok([BILL, MSN, INCOME, empty("other", 4)]);
    expect(r.leftOut).toEqual({ other: 1, unreadable: 0, secondStatement: false });
    expect({ ...r, leftOut: base.leftOut }).toEqual(base);
  });

  it("T14: ink that shows through is read like anything else, and an identifier still has no key to come back in", async () => {
    const seeThrough = boundRead({ ...table["bill-main"].read, patientName: "Dorothy M. Hale", account: "****4821", medicareNumber: "1EG4-TE5-MK73", covered: ["patient_owes"] }, 1, TODAY);
    expect(seeThrough).toEqual({ ...BILL, covered: ["patient_owes"] });
    // the amount under thin ink is used as read
    const out = await runStateless([seeThrough, MSN, INCOME], deps);
    expect(JSON.stringify(out)).toBe(JSON.stringify({ status: "ok", result: base }));
  });

  it("T15: a PDF's pages are drawn as pictures on the phone, or it is refused there, so no read ever holds its hidden text (tests/e2e/private-pdf.spec.ts, private-upload.spec.ts)", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 Dorothy M. Hale, account 4821033");
    // demo mode reads demo ids only: bytes are refused, whatever they are
    await expect(new FixturePrivateReader().read({ bytes: pdf })).rejects.toBeInstanceOf(DemoOnly);
    // and a read has no key for a page's text
    const read = boundRead({ ...table["bill-main"].read, text: "%PDF-1.7 Dorothy M. Hale, account 4821033", pdfText: "Dorothy M. Hale" }, 1, TODAY);
    expect(read).toEqual(BILL);
    expect(JSON.stringify(await runStateless([read, MSN, INCOME], deps))).not.toMatch(/%PDF|Dorothy|4821033/);
  });

  it("T16: a bill line whose charge is covered keeps its number and is never paired; the outcome is amounts differ at most", async () => {
    const reads = [lines(BILL, (l) => (l.n === 3 ? { chargeCents: null } : {})), MSN, INCOME];
    expect(join(reads)).toMatchObject({ bill: { coveredLines: [3] } });
    const r = await ok(reads);
    expect(r.outcome).toBe("amounts_differ");
    expect(found(r)).toEqual([["patient_owes_exceeds_notice", 24000, "possible", null]]);
    expect(chips(r)).toEqual(["household_size", "coverage_type", "line_charge"]);
    expect(said(r, "line_charge")).toBe("A charge was covered, so we left that line out of the comparison.");
    expect(kinds(r)).toEqual(["information_request", "assistance_application"]);
    expect(r.steps[2].summary).toBe("The bill asks $240.00 more than the notice shows.");
    // another line's charge covered: line 3 still pairs, and still nothing points to a single line
    const other = await ok([lines(BILL, (l) => (l.n === 5 ? { chargeCents: null } : {})), MSN, INCOME]);
    expect(other.outcome).toBe("amounts_differ");
    expect(other.findings.map((f) => f.kind)).toEqual(["patient_owes_exceeds_notice"]);
    // the gap's evidence is the two totals: the pair on line 3 that explains it is not shown under "amounts differ"
    expect(other.findings[0].billLine).toBeNull();
    expect(other.findings[0].evidence).toEqual(["Bill, amount you owe $466.00", "Medicare notice, the most you may be billed $226.00"]);
    expect(kinds(other)).toEqual(["information_request", "assistance_application"]);
    for (const x of [r, other]) expect(x.estimate?.parts.map((p) => p.label)).toEqual([RESULT.partHelp]);
  });

  it("T17: a notice line whose \"you may be billed\" is covered is left out of pairing, and no single-line finding rests on it", async () => {
    const r = await ok([BILL, lines(MSN, (l) => (l.n === 3 ? { youMayBeBilledCents: null } : {})), INCOME]);
    expect(r.outcome).toBe("amounts_differ");
    expect(found(r)).toEqual([["patient_owes_exceeds_notice", 24000, "possible", null]]);
    expect(JSON.stringify(r.findings)).not.toContain("notice line 3");
    expect(kinds(r)).toEqual(["information_request", "assistance_application"]);
    // no chip: listed
    expect(chips(r)).toEqual(chips(base));
    expect(listed(r)).toEqual(["line_patient"]);
  });

  it("T18: one blurred file among good ones is left out, and the result follows from the rest", async () => {
    const r = await ok([BILL, empty("unreadable", 2), { ...MSN, page: 3 }, { ...INCOME, page: 4 }]);
    expect(r.leftOut).toEqual({ other: 0, unreadable: 1, secondStatement: false });
    expect({ ...r, leftOut: base.leftOut }).toEqual(base);
  });

  it("T19: a Medicare notice and an insurer's statement together are compared with the Medicare notice", async () => {
    const r = await ok([BILL, MSN, INCOME, { ...EOB, page: 4, noticeMaxCents: 5000 }]);
    expect(r.noticeKind).toBe("msn");
    expect(r.leftOut.secondStatement).toBe(true);
    expect(found(r)).toEqual(found(base));
    expect(r.estimate).toEqual(base.estimate);
    // no chip: listed
    expect(chips(r)).toEqual(chips(base));
    expect(listed(r)).toEqual(["second_statement"]);
    expect(said(r, "second_statement")).toBe("We left your insurer's statement out.");
    expect(JSON.stringify(r)).not.toContain("$50.00");
  });

  it("T20: without a maximum of its own the paired lines are added up, and an unpaired bill line means insufficient information", async () => {
    const elsewhere = { n: 6, code: "99213", serviceDate: "2026-08-02", chargeCents: null, billedCents: 21000, youMayBeBilledCents: 4200 };
    const maxCovered: PrivateRead = { ...MSN, noticeMaxCents: null, covered: ["notice_max"] };
    const severalClaims: PrivateRead = { ...MSN, claimCount: 2, noticeMaxCents: 26800, lines: [elsewhere, ...MSN.lines] };
    for (const notice of [maxCovered, severalClaims]) {
      const r = await ok([BILL, notice, INCOME]);
      expect(r.outcome).toBe("line_found");
      expect(found(r)).toEqual(found(base));
      expect(r.estimate).toEqual(base.estimate);
      expect(r.findings[0].evidence[1]).toBe("Medicare notice, lines 1, 2, 3, 4, 5 added up $226.00");
      expect(chips(r)).toEqual(["household_size", "coverage_type", "notice_lines_sum"]);
      expect(said(r, "notice_lines_sum")).toBe("We added up the lines we could match.");
      // the letter lists the lines by number and prints no total
      const text = letter(r, "correction_request");
      expect(text).toContain("Medicare's Summary Notice lists these charges on its lines 1, 2, 3, 4, 5.");
      expect(text).not.toMatch(/\$226\.00|\$268\.00/);
    }
    const unpaired = await ok([BILL, { ...maxCovered, lines: MSN.lines.slice(0, 4) }, INCOME]);
    expect(unpaired.outcome).toBe("notice_unmatched");
    expect(found(unpaired)).toEqual([["insufficient_information", null, "insufficient", null]]);
    expect(kinds(unpaired)).toEqual(["information_request", "assistance_application"]);
    expect(unpaired.steps[1].summary).toBe("The notice lists more than one visit.");
  });

  it("T21: a file the phone cannot decode is refused there and never sent raw (tests/e2e/private-upload.spec.ts)", async () => {
    const heic = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    // demo mode takes no bytes at all, and the upload test reader answers without looking at one: no read holds a file's content
    await expect(new FixturePrivateReader().read({ bytes: heic })).rejects.toBeInstanceOf(DemoOnly);
    expect(await new StubPrivateReader().read({ bytes: heic })).toEqual(await new StubPrivateReader().read({ bytes: new Uint8Array([0xff, 0xd8, 0xff]) }));
    expect(await new StubPrivateReader().read({ bytes: heic })).toEqual(table["bill-main"].read);
  });
});
