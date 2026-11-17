import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSUMPTIONS, GUESS_KEYS } from "@/lib/private/copy";
import { assume, coverageOf, join, outcomeOf } from "@/lib/private/join";
import { boundRead } from "@/lib/private/scrub";
import type { Joined, PrivatePolicy, PrivateRead } from "@/lib/private/types";
import type { Finding, Policy } from "@/lib/types";

const TODAY = "2026-11-17";
const table = JSON.parse(readFileSync("fixtures/private/reads.json", "utf8")) as Record<string, { read: unknown }>;
const demo = (id: string, page: number) => boundRead(table[id].read, page, TODAY);
const BILL = demo("bill-main", 1);
const MSN = demo("msn-main", 2);
const INCOME = demo("income-letter", 3);
const empty = (kind: PrivateRead["kind"], page: number): PrivateRead => boundRead({ kind }, page, TODAY);
const income = (cents: number, period: NonNullable<PrivateRead["income"]>["period"], page: number): PrivateRead => ({ ...empty("income", page), income: { cents, period } });
const joined = (reads: PrivateRead[]): Joined => {
  const j = join(reads);
  if ("stop" in j) throw new Error(`stopped: ${j.stop}`);
  return j;
};
const lines = (r: PrivateRead, change: (l: PrivateRead["lines"][number]) => Partial<PrivateRead["lines"][number]>) => ({ ...r, lines: r.lines.map((l) => ({ ...l, ...change(l) })) });

const riverbend = JSON.parse(readFileSync("fixtures/policies/riverbend.json", "utf8")) as Policy;
const policy = (over: Partial<PrivatePolicy> = {}, insured: boolean | null = true): PrivatePolicy => ({
  ccn: null, name: "Riverbend Community Hospital", city: "Tacoma", state: "WA", exact: true, policy: riverbend,
  insuredCovered: { value: insured, quote: null, sourceUrl: null, checkedOn: null }, otherConditions: [], ...over,
});
const keys = (j: Joined, p: PrivatePolicy | null) => assume(j, p).map((a) => a.key);
const finding = (kind: Finding["kind"], confidence: Finding["confidence"] = "likely"): Finding => ({ id: "f", caseId: "private", kind, amountCents: 24000, confidence, explanation: "", evidence: [], requiresReview: false });

describe("join", () => {
  it("joins the demo set into the main fixture's bill, notice and income", () => {
    expect(joined([BILL, MSN, INCOME])).toEqual<Joined>({
      bill: {
        lines: [
          { n: 1, code: "99284", serviceDate: "2026-09-14", chargeCents: 148000 },
          { n: 2, code: "74177", serviceDate: "2026-09-14", chargeCents: 295000 },
          { n: 3, code: "Q9967", serviceDate: "2026-09-14", chargeCents: 24000 },
          { n: 4, code: "96374", serviceDate: "2026-09-14", chargeCents: 31000 },
          { n: 5, code: "71046", serviceDate: "2026-09-14", chargeCents: 38000 },
        ],
        coveredLines: [], patientOwesCents: 46600, statementDate: "2026-10-20", dueDate: "2026-11-30",
      },
      notice: {
        kind: "msn",
        lines: [
          { n: 1, code: "99284", serviceDate: "2026-09-14", billedCents: 148000, youMayBeBilledCents: 8400 },
          { n: 2, code: "74177", serviceDate: "2026-09-14", billedCents: 295000, youMayBeBilledCents: 9300 },
          { n: 3, code: "Q9967", serviceDate: "2026-09-14", billedCents: 24000, youMayBeBilledCents: 0 },
          { n: 4, code: "96374", serviceDate: "2026-09-14", billedCents: 31000, youMayBeBilledCents: 3000 },
          { n: 5, code: "71046", serviceDate: "2026-09-14", billedCents: 38000, youMayBeBilledCents: 1900 },
        ],
        maxCents: 22600, maxFrom: "printed",
      },
      noticeState: "ok",
      hospital: { name: "Riverbend Community Hospital", city: "Tacoma", state: "WA" },
      incomes: [{ cents: 3756000, period: "year" }],
      incomeAnnualCents: 3756000,
      covered: [],
      leftOut: { other: 0, unreadable: 0, secondStatement: false },
    });
  });

  it("counts reads that are equal apart from the page once, whatever order their keys or pages come in", () => {
    const reordered = Object.fromEntries(Object.entries({ ...BILL, page: 4 }).reverse()) as PrivateRead;
    expect(join([INCOME, { ...MSN, page: 5 }, reordered, BILL, MSN, { ...INCOME, page: 6 }])).toEqual(join([BILL, MSN, INCOME]));
  });

  it("counts every file that is not one of the four kinds, or is too blurry, as left out", () => {
    const j = joined([BILL, empty("other", 2), empty("other", 3), empty("unreadable", 4), MSN]);
    expect(j.leftOut).toEqual({ other: 2, unreadable: 1, secondStatement: false });
    expect(j.bill.lines).toHaveLength(5);
    expect(j.notice?.maxCents).toBe(22600);
  });

  it("stops as too dark only when every file is unreadable", () => {
    expect(join([empty("unreadable", 1), empty("unreadable", 2)])).toEqual({ stop: "too_dark" });
    expect(join([empty("unreadable", 1), empty("other", 2)])).toEqual({ stop: "no_bill" });
    expect(join([empty("unreadable", 1), MSN])).toEqual({ stop: "no_bill" });
  });

  it("stops when no file is a bill", () => {
    expect(join([])).toEqual({ stop: "no_bill" });
    expect(join([MSN, INCOME])).toEqual({ stop: "no_bill" });
  });

  it("joins the pages of one bill in page order, a blank on one page filled from another", () => {
    const front: PrivateRead = { ...BILL, page: 1, lines: BILL.lines.slice(0, 2), patientOwesCents: null, dueDate: null };
    const back: PrivateRead = { ...BILL, page: 2, lines: BILL.lines.slice(2), hospital: null, statementDate: null };
    const j = joined([back, front]);
    expect(j.bill.lines.map((l) => [l.n, l.code])).toEqual([[1, "99284"], [2, "74177"], [3, "Q9967"], [4, "96374"], [5, "71046"]]);
    expect(j.bill).toMatchObject({ patientOwesCents: 46600, statementDate: "2026-10-20", dueDate: "2026-11-30" });
    expect(j.hospital?.name).toBe("Riverbend Community Hospital");
    // a second page that numbers its lines from 1 again continues the count
    const renumbered = lines(back, (l) => ({ n: l.n - 2 }));
    expect(joined([front, renumbered]).bill.lines.map((l) => [l.n, l.code])).toEqual(j.bill.lines.map((l) => [l.n, l.code]));
  });

  it("takes another copy of a page once: the same lines, with a value showing that the first copy had covered", () => {
    const j = joined([demo("bill-main-amount-covered", 1), MSN, { ...BILL, page: 3 }]);
    expect(j.bill.lines.map((l) => l.n)).toEqual([1, 2, 3, 4, 5]);
    expect(j.bill.patientOwesCents).toBe(46600);
    // a notice dropped twice, the first time with its maximum covered
    const notice = joined([BILL, { ...MSN, noticeMaxCents: null, covered: ["notice_max"] }, { ...MSN, page: 3 }]).notice;
    expect(notice).toMatchObject({ maxCents: 22600, maxFrom: "printed" });
    expect(notice?.lines.map((l) => l.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("stops at two bills when pages differ in the amount owed, the statement date or the hospital", () => {
    const other = (over: Partial<PrivateRead>): PrivateRead => ({ ...BILL, page: 2, lines: [], ...over });
    expect(join([BILL, other({ patientOwesCents: 12000 })])).toEqual({ stop: "two_bills" });
    expect(join([BILL, other({ statementDate: "2026-08-01" })])).toEqual({ stop: "two_bills" });
    expect(join([BILL, other({ hospital: { name: "Lakeside Medical Center", city: "Tacoma", state: "WA" } })])).toEqual({ stop: "two_bills" });
    expect("stop" in join([BILL, other({ hospital: { name: "RIVERBEND COMMUNITY HOSPITAL.", city: null, state: null } })])).toBe(false);
    expect("stop" in join([BILL, other({ patientOwesCents: null, statementDate: null, hospital: null })])).toBe(false);
  });

  it("stops without an amount owed: covered when a bill says so, else not found", () => {
    expect(join([demo("bill-main-amount-covered", 1), MSN])).toEqual({ stop: "covered" });
    expect(join([{ ...BILL, patientOwesCents: null }, MSN])).toEqual({ stop: "not_found" });
    expect(join([{ ...BILL, patientOwesCents: null }, { ...MSN, covered: ["patient_owes"] }])).toEqual({ stop: "not_found" });
  });

  it("keeps a bill line with a covered charge by its number and out of the lines; a covered code or date is blank", () => {
    const j = joined([lines(BILL, (l) => (l.n === 3 ? { chargeCents: null } : l.n === 4 ? { code: null, serviceDate: null } : {})), MSN]);
    expect(j.bill.coveredLines).toEqual([3]);
    expect(j.bill.lines.map((l) => l.n)).toEqual([1, 2, 4, 5]);
    expect(j.bill.lines[2]).toEqual({ n: 4, code: "", serviceDate: "", chargeCents: 31000 });
  });

  it("uses the Medicare notice when an insurer's statement was dropped with it", () => {
    const eob: PrivateRead = { ...MSN, kind: "eob", page: 4, noticeMaxCents: 5000, covered: ["notice_max"] };
    const both = joined([BILL, eob, MSN]);
    expect(both.notice).toMatchObject({ kind: "msn", maxCents: 22600 });
    expect(both.leftOut.secondStatement).toBe(true);
    expect(both.covered).toEqual([]);
    const alone = joined([BILL, eob]);
    expect(alone.notice).toMatchObject({ kind: "eob", maxCents: 5000 });
    expect(alone.leftOut.secondStatement).toBe(false);
    expect(alone.covered).toEqual(["notice_max"]);
  });

  it("drops a notice line whose amount is not shown, and says a needed value was missing", () => {
    const j = joined([BILL, lines(MSN, (l) => (l.n === 3 ? { youMayBeBilledCents: null } : l.n === 5 ? { billedCents: null } : {}))]);
    expect(j.notice?.lines.map((l) => l.n)).toEqual([1, 2, 4]);
    expect(j.notice).toMatchObject({ maxCents: 22600, maxFrom: "printed" });
    expect(j.covered).toEqual(["line_patient"]);
  });

  it("has no notice when its line amounts and its maximum are all covered", () => {
    const j = joined([BILL, { ...lines(MSN, () => ({ youMayBeBilledCents: null })), noticeMaxCents: null }]);
    expect(j.notice).toBeNull();
    expect(j.noticeState).toBe("amounts_covered");
  });

  it("uses the printed maximum when the notice lists one claim", () => {
    expect(joined([BILL, { ...MSN, claimCount: null }]).notice).toMatchObject({ maxCents: 22600, maxFrom: "printed" });
    // its lines need not account for the bill: the printed figure stands
    expect(joined([BILL, { ...MSN, lines: MSN.lines.slice(0, 1) }]).notice).toMatchObject({ maxCents: 22600, maxFrom: "printed" });
  });

  it("adds up the paired lines when the maximum is covered or the notice lists several claims", () => {
    const elsewhere = { n: 6, code: "99213", serviceDate: "2026-08-02", chargeCents: null, billedCents: 21000, youMayBeBilledCents: 4200 };
    const several = joined([BILL, { ...MSN, claimCount: 2, noticeMaxCents: 26800, lines: [elsewhere, ...MSN.lines] }]);
    expect(several.notice).toMatchObject({ maxCents: 22600, maxFrom: "lines_sum" });
    expect(several.notice?.lines.map((l) => l.n)).toEqual([1, 2, 3, 4, 5]);
    expect(several.noticeState).toBe("ok");
    expect(joined([BILL, { ...MSN, noticeMaxCents: null }]).notice).toMatchObject({ maxCents: 22600, maxFrom: "lines_sum" });
    // without dates the lines still pair, on code and amount
    expect(joined([lines(BILL, () => ({ serviceDate: null })), { ...MSN, noticeMaxCents: null }]).notice?.maxCents).toBe(22600);
  });

  it("has no notice when a bill line pairs with nothing on a notice without a maximum of its own", () => {
    const short = { ...MSN, noticeMaxCents: null, lines: MSN.lines.slice(0, 4) };
    expect(joined([BILL, short])).toMatchObject({ notice: null, noticeState: "unmatched" });
    expect(joined([BILL, { ...MSN, claimCount: 3 }]).noticeState).toBe("ok");
    expect(joined([BILL, { ...short, claimCount: 3, lines: MSN.lines.slice(1) }]).noticeState).toBe("unmatched");
    // a covered charge cannot pair, and a bill with no lines pairs nothing
    expect(joined([lines(BILL, (l) => (l.n === 3 ? { chargeCents: null } : {})), { ...MSN, noticeMaxCents: null }]).noticeState).toBe("unmatched");
    expect(joined([{ ...BILL, lines: [] }, { ...MSN, noticeMaxCents: null }]).noticeState).toBe("unmatched");
    expect(joined([{ ...BILL, lines: [] }, MSN]).notice?.maxFrom).toBe("printed");
  });

  it("counts equal incomes once, turns a monthly figure into a yearly one, and adds incomes that differ", () => {
    const of = (...pages: PrivateRead[]) => { const j = joined([BILL, ...pages]); return [j.incomes, j.incomeAnnualCents]; };
    expect(of()).toEqual([[], null]);
    expect(of(INCOME, { ...INCOME, page: 4, statementDate: "2026-02-05" })).toEqual([[{ cents: 3756000, period: "year" }], 3756000]);
    expect(of(income(313000, "month", 3))).toEqual([[{ cents: 313000, period: "month" }], 3756000]);
    expect(of(INCOME, income(108000, "month", 4))).toEqual([[{ cents: 3756000, period: "year" }, { cents: 108000, period: "month" }], 3756000 + 1296000]);
    expect(of({ ...empty("income", 3), covered: ["income"] })).toEqual([[], null]);
  });

  it("lists an income printed by the week or fortnight but works out no yearly figure from it", () => {
    for (const period of ["week", "two_weeks", "other"] as const) expect(joined([BILL, income(72000, period, 3)])).toMatchObject({ incomes: [{ cents: 72000, period }], incomeAnnualCents: null });
    expect(joined([BILL, INCOME, income(72000, "week", 4)])).toMatchObject({ incomes: [{ cents: 3756000, period: "year" }, { cents: 72000, period: "week" }], incomeAnnualCents: null });
  });

  it("takes the hospital from the bill, else from the notice", () => {
    expect(joined([BILL, MSN]).hospital).toEqual({ name: "Riverbend Community Hospital", city: "Tacoma", state: "WA" });
    expect(joined([{ ...BILL, hospital: null }, MSN]).hospital).toEqual({ name: "Riverbend Community Hospital", city: null, state: null });
    expect(joined([{ ...BILL, hospital: null }, { ...MSN, hospital: null }]).hospital).toBeNull();
    expect(joined([{ ...BILL, hospital: null }]).hospital).toBeNull();
  });

  it("gathers the values the readers saw under a cover", () => {
    expect(joined([{ ...BILL, covered: ["due_date", "statement_date"] }, { ...MSN, covered: ["notice_max", "due_date"] }, { ...INCOME, covered: ["income"] }]).covered).toEqual(["due_date", "statement_date", "notice_max", "income"]);
  });
});

describe("outcomeOf", () => {
  const ok = joined([BILL, MSN]);

  it("without a notice, says why there is none", () => {
    expect(outcomeOf([finding("insufficient_information", "insufficient")], joined([BILL]))).toBe("no_notice");
    expect(outcomeOf([], { ...ok, notice: null, noticeState: "amounts_covered" })).toBe("notice_covered");
    expect(outcomeOf([], { ...ok, notice: null, noticeState: "unmatched" })).toBe("notice_unmatched");
  });

  it("a line found is certain only when its pair is likely", () => {
    const both = (confidence: Finding["confidence"]) => [finding("patient_owes_exceeds_notice", confidence), finding("line_not_patient_responsibility", confidence)];
    expect(outcomeOf(both("likely"), ok)).toBe("line_found");
    expect(outcomeOf(both("possible"), ok)).toBe("line_possible");
  });

  it("a covered bill line caps the outcome at amounts differ", () => {
    const capped = { ...ok, bill: { ...ok.bill, coveredLines: [2] } };
    expect(outcomeOf([finding("patient_owes_exceeds_notice"), finding("line_not_patient_responsibility")], capped)).toBe("amounts_differ");
    expect(outcomeOf([finding("no_discrepancy")], capped)).toBe("nothing_found");
  });

  it("a gap no line explains is amounts differ, and no gap is nothing found", () => {
    expect(outcomeOf([finding("patient_owes_exceeds_notice", "possible")], ok)).toBe("amounts_differ");
    expect(outcomeOf([finding("no_discrepancy")], ok)).toBe("nothing_found");
    expect(outcomeOf([], ok)).toBe("nothing_found");
  });
});

describe("coverageOf", () => {
  const withNotice = joined([BILL, MSN]);
  const without = joined([BILL]);

  it("follows the policy's own sentence on patients who have insurance", () => {
    expect(coverageOf(withNotice, null)).toBe("no_policy");
    expect(coverageOf(withNotice, policy({}, true))).toBe("covered");
    expect(coverageOf(without, policy({}, true))).toBe("covered");
    expect(coverageOf(withNotice, policy({}, null))).toBe("not_stated");
  });

  it("a policy that excludes insured patients does not cover a patient who dropped a statement, usable or not", () => {
    expect(coverageOf(withNotice, policy({}, false))).toBe("not_covered");
    expect(coverageOf({ ...withNotice, notice: null, noticeState: "amounts_covered" }, policy({}, false))).toBe("not_covered");
    expect(coverageOf({ ...withNotice, notice: null, noticeState: "unmatched" }, policy({}, false))).toBe("not_covered");
    expect(coverageOf(without, policy({}, false))).toBe("insurance_unknown");
  });
});

describe("assume", () => {
  const full = joined([BILL, MSN, INCOME]);

  it("the demo set assumes the household and the coverage type, and nothing else", () => {
    const made = assume(full, policy());
    expect(made.map((a) => a.key)).toEqual(["household_size", "coverage_type"]);
    expect(made[0]).toEqual({ key: "household_size", ...ASSUMPTIONS.household_size });
    expect(made[1]).toEqual({ key: "coverage_type", statement: "We took this to be Original Medicare, because you dropped a Medicare notice.", ifWrong: ASSUMPTIONS.coverage_type.ifWrong, inLetter: "left_out" });
  });

  it("lists the household guess only when it is in a figure", () => {
    expect(keys(full, policy())).toContain("household_size");
    expect(keys(joined([BILL, MSN]), policy())).not.toContain("household_size");
    expect(keys(joined([BILL, MSN, income(72000, "week", 3)]), policy())).not.toContain("household_size");
    expect(keys(full, null)).not.toContain("household_size");
    expect(keys(full, policy({}, false))).not.toContain("household_size");
    expect(keys(full, policy({}, null))).toContain("household_size");
    const noThresholds: Policy = { ...riverbend, freeCareMaxFpl: { ...riverbend.freeCareMaxFpl, value: null }, tiers: { ...riverbend.tiers, value: [] } };
    expect(keys(full, policy({ policy: noThresholds }))).not.toContain("household_size");
  });

  it("an insurer's statement is taken to be a plan, in words that never name Medicare", () => {
    const made = assume(joined([BILL, { ...MSN, kind: "eob" }, INCOME]), policy());
    expect(made.find((a) => a.key === "coverage_type")?.statement).toBe("We took this to be an insurance plan, because you dropped an insurer's statement.");
    expect(JSON.stringify(made)).not.toContain("Medicare");
  });

  it("with no notice: insurance is not known, and the missing notice is a plain line", () => {
    expect(keys(joined([BILL, INCOME]), policy())).toEqual(["household_size", "insurance_unknown", "no_notice"]);
    // a notice that could not be used is not a guess about insurance
    expect(keys(joined([BILL, INCOME, { ...MSN, noticeMaxCents: null, lines: [] }]), policy())).toEqual(["household_size", "no_notice"]);
  });

  it("assumes the same visit unless a line pairs on code and date", () => {
    expect(keys(full, policy())).not.toContain("same_visit");
    const undated = joined([lines(BILL, () => ({ serviceDate: null })), MSN, INCOME]);
    expect(keys(undated, policy())).toEqual(["household_size", "coverage_type", "same_visit", "service_date"]);
    const uncoded = joined([lines(BILL, (l) => (l.n === 3 ? { code: null } : {})), MSN, INCOME]);
    expect(keys(uncoded, policy())).toEqual(["household_size", "coverage_type", "line_code"]);
    expect(keys(joined([BILL, { ...MSN, lines: [] }, INCOME]), policy())).toContain("same_visit");
  });

  it("without a matched hospital says so; a match by containment shows the match and how to ignore it", () => {
    expect(keys(full, null)).toEqual(["coverage_type", "hospital"]);
    const loose = assume(full, policy({ exact: false })).find((a) => a.key === "hospital_match");
    expect(loose).toEqual({ key: "hospital_match", statement: "Matched to Riverbend Community Hospital, Tacoma, WA.", ifWrong: "If this is not your hospital, ignore the help program and the phone number here.", inLetter: "blank" });
    expect(keys(full, policy())).not.toContain("hospital_match");
  });

  it("names a covered charge, a notice line left out, and the lines added up", () => {
    const j = joined([lines(BILL, (l) => (l.n === 5 ? { chargeCents: null } : {})), lines(MSN, (l) => (l.n === 5 ? { youMayBeBilledCents: null } : {})), INCOME]);
    expect(keys(j, policy())).toEqual(["household_size", "coverage_type", "line_charge", "line_patient"]);
    expect(keys(joined([BILL, { ...MSN, noticeMaxCents: null }, INCOME]), policy())).toEqual(["household_size", "coverage_type", "notice_lines_sum"]);
  });

  it("lists what was not shown as plain lines: dates, income, a second statement", () => {
    const bare = joined([{ ...BILL, statementDate: null, dueDate: null }, MSN, { ...MSN, kind: "eob", page: 4 }]);
    expect(keys(bare, policy())).toEqual(["coverage_type", "statement_date", "due_date", "no_income", "second_statement"]);
    expect(keys(joined([BILL, MSN, income(72000, "two_weeks", 3)]), policy())).toEqual(["coverage_type", "income_period"]);
    expect(keys(joined([BILL, MSN, INCOME, income(108000, "month", 4)]), policy())).toEqual(["household_size", "coverage_type", "income_added"]);
    expect(keys(joined([BILL, MSN, INCOME, income(72000, "week", 4)]), policy())).toEqual(["coverage_type", "income_period"]);
  });

  it("says why there is no percent for a hospital in Alaska or Hawaii", () => {
    expect(keys(full, policy({ state: "AK" }))).toEqual(["coverage_type", "guideline_region"]);
    expect(keys(full, policy({ state: "HI" }))).toEqual(["coverage_type", "guideline_region"]);
  });

  it("puts the guesses, which carry the chip, before the plain lines, and fills every slot", () => {
    const messy = joined([lines({ ...BILL, dueDate: null }, (l) => ({ serviceDate: null, ...(l.n === 5 ? { chargeCents: null } : {}) })), MSN, INCOME, income(108000, "month", 4)]);
    const made = assume(messy, policy({ exact: false }));
    const guess = made.map((a) => GUESS_KEYS.includes(a.key));
    expect(guess.lastIndexOf(true)).toBeLessThan(guess.indexOf(false));
    expect(made.map((a) => a.key)).toEqual(["household_size", "coverage_type", "same_visit", "hospital_match", "line_charge", "income_added", "service_date", "due_date"]);
    for (const a of made) expect(a.statement + a.ifWrong, a.key).not.toMatch(/[{}]/);
  });
});
