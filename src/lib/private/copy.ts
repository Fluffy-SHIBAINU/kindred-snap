/**
 * Every fixed sentence private mode shows, held once and exactly as docs/features/snap-incognito.md writes it
 * (§1 promises, §2 and §2a screens, §4 left-out files, §6 chips, §7 result blocks); tests/private/copy.test.ts checks each
 * against that document. A `{slot}` is filled with `fill`: amounts already formatted, names from the atlas.
 * Nothing here carries a case's own figure. Object keys follow the unions of §5 (`outcome`, `help`, stop reasons).
 */
import { READER_TERMS, type ReaderTerms } from "./readerTerms";
import type { Assumption, AssumptionKey, PrivateResult } from "./types";

type PromiseId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10" | "S11" | "S12" | "S13" | "S14" | "S15" | "S16";
type Place = "snap" | "body" | "details" | "erased" | "stop" | "failed";
type Reader = "fixture" | "stub" | "gemini";

export const BUTTON_LABEL = "Incognito — Private Mode";

/** The complete set of promise sentences (§1). S7 and S14 take their slots from the reader terms. */
export const PROMISES: Record<PromiseId, string> = {
  S1: "Private mode checks a bill with your name and numbers covered, or as it is. Kindred and the reading service receive whatever is showing. We use only the amounts, dates, service codes and the hospital's name, and Kindred keeps no copy. It is not anonymous.",
  S2: "You can cover your name, address and ID numbers first, with a marker or your phone's markup tool. Anything you leave showing travels with the picture to Kindred and the reading service. We use only the amounts, dates, service codes and the hospital's name.",
  S3: "Kindred and the reading service receive each page as it looks when you drop it. What you covered solidly does not reach us. What you left showing does.",
  S4: "A marker or highlighter can show through, even when it looks solid to you. A solid black box, or paper laid over the words before you take the photo, does not.",
  S5: "Kindred keeps no copy of your files and stores no personal details. We count that a private check happened and how it ended, by month, and nothing else.",
  S6: "This is not anonymous. A hospital, a date and an amount can point to one visit, and our web host records that this phone connected: internet address, time and page.",
  S7: "The pictures are read by {service} from {provider}. Its terms, which we read on {readOn}, say it does not train its models on them and may keep them for up to {retentionDays} days. We cannot check that ourselves or shorten it.",
  S8: "Demo: only the demo files are read. Any other file stays on this phone. Do not drop a real bill.",
  S9: "We covered the personal details we spotted on this phone before sending. We can miss some.",
  S10: "Where your files didn't show something, we made a best guess and marked it Assumed. Nothing assumed is written in a letter as a fact.",
  S11: "This result, the letters and the pages you dropped are kept in this browser tab, on this phone only, until you tap Erase from this phone or 30 minutes pass without use. Anyone who uses this phone before then can see them.",
  S12: "The letters leave blanks for the name, the account number and anything we assumed. Fill them in by hand before you send.",
  S13: "This check is erased from this browser. Kindred kept no copy. A PDF you saved, letters you shared or copied, and your photos are still where you put them.",
  S14: "The pictures you dropped went to {service}, which may keep them for up to {retentionDays} days. We cannot erase that copy.",
  S15: "Kindred kept nothing from these files.",
  S16: "Something went wrong on our side, not with your files. Kindred kept nothing from them. Try again in a few minutes.",
};

/** Added to S7 when the terms let the service's staff review what it receives. */
export const STAFF_REVIEW_SENTENCE = "Its staff may look at them to check for abuse.";

/** Fills `{slot}` marks; a mark with no value is left as written. */
export function fill(template: string, slots: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (mark, key: string) => (Object.hasOwn(slots, key) ? String(slots[key]) : mark));
}

export function fillTerms(template: string, t: ReaderTerms): string {
  return fill(template, { service: t.service, provider: t.provider, readOn: t.readOn, retentionDays: t.retentionDays ?? "" });
}

/**
 * The promise sentences one place shows, in order. S8 belongs to the demo reader (`fixture`) and S7 and S14 to the
 * live one (`gemini`). The `stub` reader gets neither: it uploads, so S8 would be false, and nothing it receives
 * goes to a reading service, so S7 and S14 would be false too.
 */
export function promisesFor(place: Place, reader: Reader, t: ReaderTerms = READER_TERMS): string[] {
  const demo = reader === "fixture";
  const s7 = reader === "gemini" ? [fillTerms(PROMISES.S7, t) + (t.staffMayReview ? " " + STAFF_REVIEW_SENTENCE : "")] : [];
  const s14 = reader === "gemini" ? [fillTerms(PROMISES.S14, t)] : [];
  switch (place) {
    case "snap":
      return demo ? [PROMISES.S8, PROMISES.S1] : [PROMISES.S1];
    case "body":
      return [...(demo ? [PROMISES.S8] : []), PROMISES.S2, PROMISES.S3, ...s7];
    case "details":
      return [PROMISES.S4, PROMISES.S5, PROMISES.S6];
    case "erased":
      return [PROMISES.S13, ...s14];
    case "stop":
      return [PROMISES.S15, ...s14];
    case "failed":
      return [PROMISES.S16, ...s14];
  }
}

const PDFS_LATER = "PDFs come next. For now, drop a photo or a screenshot.";

/** Body text and disclosure summaries of the Snap button, the drop screen and the working screen (§2). */
export const BODY = {
  snapSummary: "What is private mode?",
  drop: "The hospital bill and, if you have them, the Medicare notice or your insurer's statement, and an income letter. One page per photo.",
  whenLive: "When real bills are switched on:",
  pdfsLater: PDFS_LATER,
  detailsSummary: "What happens to my files",
  working: "Nothing for you to do yet. This page updates on its own.",
};

/** Button and link labels (§2). */
export const ACTIONS = {
  takePhoto: "Take photo",
  pick: "Pick photos or files instead",
  demoFiles: "Use the demo files",
  letters: "Get the letters",
  addFile: "Add another file",
  startOver: "Start over",
  print: "Print or save as PDF",
  share: "Share",
  copyText: "Copy the text",
};

/** Screen titles, and the result's h1 by `PrivateResult["outcome"]` (`{amount}` is the gap). */
export const H1 = {
  drop: "Drop the Bill and What Came With It",
  working: "We're On It",
  letters: "Your Letters",
  no_notice: "We Need the Notice or Statement to Check the Charges",
  notice_covered: "We Need the Notice or Statement to Check the Charges",
  notice_unmatched: "We Need the Notice or Statement to Check the Charges",
  line_found: "We Found {amount} You May Not Owe",
  line_possible: "A {amount} Line May Not Be Yours to Pay",
  amounts_differ: "The Two Amounts Differ by {amount}",
  nothing_found: "We Found Nothing to Ask About",
};

/** The line under the result's h1, by outcome. `line_found` has none: its clippings follow directly. */
export const H1_LINE = {
  no_notice: "Until we have it, we won't say whether {amount} is right. Drop the Medicare Summary Notice or your insurer's Explanation of Benefits for this visit and we'll check the charges.",
  notice_covered: "The notice's amounts are covered. Drop a copy that shows them.",
  notice_unmatched: "The notice lists more than one visit and we couldn't match every bill line to it. Drop the notice page for this visit.",
  line_possible: "We matched it by amount, not by date.",
  amounts_differ: "The bill asks {amount} more than the notice shows. That can be correct. We wrote a letter asking the hospital to go through it.",
  nothing_found: "The amount you owe is not more than the notice shows. That does not prove the bill is right.",
};

/** How "the notice" reads on the result, by what was dropped; Medicare is named only for a Medicare notice. */
export const NOTICE_NAME = { msn: "the Medicare notice", eob: "your insurer's statement", none: "the notice or statement" };

/** The help program's h2 by `PrivateResult["help"]`; the Medicare variant is for a dropped Medicare notice. */
export const H2 = {
  no_hospital: "We Couldn't Tell Which Hospital, So We Didn't Check Its Help Program",
  insured_not_covered: "This Hospital's Policy May Not Cover Patients Who Have Insurance",
  insured_not_covered_medicare: "This Hospital's Policy May Not Cover Patients Who Have Medicare",
  no_thresholds: "We Couldn't Work Out a Discount for This Hospital",
  ceilings: "What This Hospital's Policy Lists, by Household Size",
  by_household: "The Policy's Discount Depends on Household Size",
  same_tier: "The Policy Lists {percent}% Off for Households of One to Four",
};

/** The hard stop and the all-unreadable stop, by reason (§2). An error on our side is S16. */
export const STOP = {
  covered: "The amount you owe is covered. Drop a copy that shows it.",
  no_bill: "We couldn't find a hospital bill in these files. Drop the bill.",
  not_found: "We couldn't read the amount you owe. Drop a clearer copy.",
  two_bills: "These look like two different bills. Drop one bill at a time, with its notice.",
  too_dark: "The numbers are too blurry to trust, so we won't use them.",
};

/** Refused on the phone, with no request (§2). */
export const REFUSED = {
  demo_only: PROMISES.S8,
  pdf: PDFS_LATER,
  format: "This phone saved the photo in a format we can't open here. Take a screenshot of it and drop that.",
  too_many: "Up to 10 pages in one check. Drop fewer.",
};

export const STEP_TITLES = ["1. Read your files", "2. Notice or statement", "3. Compare lines", "4. Help program", "5. Write letters"] as const;

/**
 * The working rows' summaries (§2a), one group per row. `reading` is the first row while the request runs; `notice` is
 * keyed by the kind of statement found, else by outcome; `compare` by `PrivateResult["outcome"]`; `help` by
 * `PrivateResult["help"]`. `{discount}` is one of `DISCOUNT`.
 */
export const STEP_SUMMARIES = {
  reading: "Reading your files",
  read: { one: "1 page read.", many: "{n} pages read." },
  notice: {
    msn: "Medicare notice found.",
    eob: "Insurer's statement found.",
    no_notice: "No notice in your files.",
    notice_covered: "The notice's amounts are covered.",
    notice_unmatched: "The notice lists more than one visit.",
  },
  compare: {
    line_found: "Line {n} is {amount} the notice shows as not yours to pay.",
    line_possible: "Line {n} may not be yours to pay. Assumed.",
    amounts_differ: "The bill asks {amount} more than the notice shows.",
    nothing_found: "Nothing to ask about.",
    no_notice: "Nothing to compare yet.",
    notice_covered: "Nothing to compare yet.",
    notice_unmatched: "Nothing to compare yet.",
  } satisfies Record<PrivateResult["outcome"], string>,
  help: {
    by_household: "For a household of one, the policy lists {discount}. Assumed.",
    same_tier: "For households of one to four, the policy lists {discount}.",
    ceilings: "The policy's income limits are listed.",
    no_hospital: "We couldn't tell which hospital.",
    insured_not_covered: "The policy may not cover patients who have insurance.",
    no_thresholds: "We couldn't work out a discount.",
  } satisfies Record<PrivateResult["help"], string>,
  letters: { ready: "Letters ready to print.", none: "No letter to send." },
};

/** How `{discount}` reads inside a sentence, by the tier's status. */
export const DISCOUNT = { free: "free care", discount: "{percent}% off", none: "no discount" };

/** Files left out of a check (§2a; §4: T13, T18, T19), by `PrivateResult["leftOut"]` key. */
export const LEFT_OUT = {
  other: {
    one: "1 file wasn't a bill, a notice or an income letter. We left it out.",
    many: "{n} files weren't a bill, a notice or an income letter. We left them out.",
  },
  unreadable: {
    one: "1 file was too blurry to read. We left it out. Drop a clearer copy.",
    many: "{n} files were too blurry to read. We left them out. Drop clearer copies.",
  },
  secondStatement: "We left your insurer's statement out.",
};

/** Under a hard stop: the pages already dropped are kept for the next file. */
export const HELD = {
  one: "1 page is still on this phone. The next file adds to it.",
  many: "{n} pages are still on this phone. The next file adds to them.",
};

/** One chip per block (§6). Money has the one label Estimated. */
export const CHIPS = {
  read: "Read from your file",
  worked: "We worked this out",
  assumed: "Assumed",
  quoted: "Quoted",
  demo: "Demo files",
  estimated: "Estimated",
};

/** The result's blocks (§2, §7) and the estimate's part labels (§5). */
export const RESULT = {
  clippingCaption: "Same code and date, {date}. Our reading, not a copy of the pages.",
  moneyTitle: "What could come off the {amount} bill",
  moneyNote: "Estimated. The hospital decides.",
  ifOnePerson: "If the household is one person.",
  partLine: "Line the notice shows as not yours to pay",
  partHelp: "Help listed for a household of one",
  dropHospital: "Drop a copy that shows the hospital's name.",
  aboveCeilings: "Above these amounts the policy lists {discounts} discounts. Drop an income letter to see the estimate.",
  matched: "Matched to {hospital}, {city}, {state}.",
  matchedDemo: "Matched to {hospital}, {city}, {state} (demo hospital).",
  income: { year: "Your income letter shows {amount} a year.", month: "Your income letter shows {amount} a month." },
  coverageNotStated: "The policy we read does not say whether it covers patients who have insurance. The hospital decides.",
  excluded: "The hospital decides who its policy covers. We wrote no help application.",
  excludedWithLetter: "The hospital decides who its policy covers. We wrote the letter about line {n} and no help application.",
  realPolicy: "Real hospital policy, checked {date}",
  policySource: "{hospital}, financial assistance policy, checked {date}",
  policySourceDemo: "{hospital}, {city}, {state} (demo hospital). Demo policy sentence.",
  otherConditions: "Other Conditions in the Policy",
  worked: "How we worked this out",
  assumed: "What we assumed ({n})",
  nothingCovered: "Nothing we needed was covered in your files.",
  neverRead: "We never read a name, an address or an ID number, covered or not. The letters leave blanks for them.",
  ifPeople: "If {people} people live there, the policy lists {discount}.",
  due: "Bill due {date}.",
  dueHold: "The letter asks the hospital to hold the account while it reviews.",
  noLetter: "There is no letter to send.",
  whoCanHelp: "Who can help",
  medicarePhone: "For the notice, call 1-800-MEDICARE (1-800-633-4227).",
};

/** The household tables on the result and inside the row "How we worked this out" (§2a). A cell is keyed by the tier's status. */
export const TABLES = {
  people: "People at home",
  lists: "The policy lists",
  rowOne: "{a}",
  rowRange: "{a} to {b}",
  cell: { free: "Free care", discount: "{percent}% off", none: "No discount listed" },
  ceiling: "Free care if yearly income is up to",
  workedPeople: "People",
  workedUpTo: "{percent}% off up to",
  workedShare: "Share of the poverty guideline",
  sharesNote: "Shares use the {year} poverty guideline for the 48 states and DC.",
  ceilingsNote: "From the policy's tiers and the {year} poverty guideline for the 48 states and DC.",
};

/** The assumption keys that are guesses and carry the chip Assumed; every other key that applied is a plain line (§2a). */
export const GUESS_KEYS: AssumptionKey[] = ["household_size", "coverage_type", "insurance_unknown", "same_visit", "hospital", "hospital_match", "line_charge", "notice_lines_sum", "income_added"];

/** How the coverage reads in the `coverage_type` statement, by the kind of statement dropped. Only a Medicare notice names Medicare. */
export const COVERAGE_WORDS = {
  msn: { coverage: "Original Medicare", notice: "a Medicare notice" },
  eob: { coverage: "an insurance plan", notice: "an insurer's statement" },
};

const BLANK_FOR_IT = "Any letter leaves a blank for it.";

/**
 * One rule per gap in what the files show (§6): what we took to be so, and what the letters do instead of stating it.
 * `coverage_type` takes its slots from `COVERAGE_WORDS` and `hospital_match` from the matched sheet. `join.ts` decides
 * which apply to a run (`assume`).
 */
export const ASSUMPTIONS: Record<AssumptionKey, { statement: string; ifWrong: string; inLetter: Assumption["inLetter"] }> = {
  household_size: { statement: "One person lives in the home.", ifWrong: "The letter leaves household size blank and asks the hospital which tier applies.", inLetter: "blank" },
  coverage_type: { statement: "We took this to be {coverage}, because you dropped {notice}.", ifWrong: "The letters name the notice, never the coverage.", inLetter: "left_out" },
  insurance_unknown: { statement: "We couldn't tell whether the patient has insurance.", ifWrong: "The letter has tick boxes to mark by hand: a notice or statement is attached, or none was received.", inLetter: "blank" },
  same_visit: { statement: "We took the notice to be for the same visit as the bill.", ifWrong: "A letter that relies on the match asks the hospital to confirm the notice covers the same visit.", inLetter: "asks" },
  hospital: { statement: "We couldn't tell which hospital.", ifWrong: "The letters leave a blank for the hospital's name, and we wrote no help application.", inLetter: "blank" },
  hospital_match: { statement: RESULT.matched, ifWrong: "If this is not your hospital, ignore the help program and the phone number here.", inLetter: "blank" },
  service_date: { statement: "A service date wasn't shown, so we matched lines without it.", ifWrong: "A letter that names the line leaves its date blank.", inLetter: "blank" },
  line_code: { statement: "A service code wasn't shown, so we matched that line by its amount.", ifWrong: "A letter that names the line gives its number and charge, not a code.", inLetter: "left_out" },
  line_charge: { statement: "A charge was covered, so we left that line out of the comparison.", ifWrong: "No letter points to a single line. If the amounts differ, the letter asks the hospital to go through the bill.", inLetter: "asks" },
  line_patient: { statement: "An amount on the notice wasn't shown, so we left that line out.", ifWrong: "No letter rests on that line.", inLetter: "left_out" },
  statement_date: { statement: "The statement date wasn't shown.", ifWrong: BLANK_FOR_IT, inLetter: "blank" },
  due_date: { statement: "The due date wasn't shown, so there is no reminder of it here.", ifWrong: BLANK_FOR_IT, inLetter: "blank" },
  no_notice: { statement: "We had no notice or statement we could use, so we didn't check the charges.", ifWrong: "The letter asks the hospital for an itemized bill.", inLetter: "asks" },
  notice_lines_sum: { statement: "We added up the lines we could match.", ifWrong: "A letter lists the lines by number and prints no total.", inLetter: "left_out" },
  no_income: { statement: "No income was shown in your files.", ifWrong: "Any help application leaves the yearly household income blank.", inLetter: "blank" },
  income_period: { statement: "The income shown is not by month or by year, so we didn't use it.", ifWrong: "Any help application prints the figure as shown and leaves the yearly total blank.", inLetter: "blank" },
  income_added: { statement: "Your income letters show different amounts, so we added them together.", ifWrong: "Any help application prints each figure as shown and no sum.", inLetter: "left_out" },
  second_statement: { statement: LEFT_OUT.secondStatement, ifWrong: "The letters refer to the Medicare notice only.", inLetter: "left_out" },
  guideline_region: { statement: "We only have the poverty guideline for the 48 states and DC, so we worked out no percent for this hospital.", ifWrong: "No letter states a share of the guideline.", inLetter: "left_out" },
};

/** The letters screen and the packet's fixed pages (§2, §7). Letter wording itself is in `letters.ts`. */
export const LETTERS = {
  coverSheet: "Before You Send",
  permission: "If you send this for someone else, the hospital may ask for the patient's written permission. Have the patient sign too, or attach their permission.",
  assumed: "What We Assumed",
  keep: "Keep this page. Do not send it.",
  attach: "Attach a copy of the bill and the notice. Send it all to Patient Financial Services, at the address printed on the bill.",
};

/**
 * The notice tick boxes a letter prints for a pen (§6): `medicare` or `insurance`, then `none`. The first box names
 * Medicare only when a Medicare notice was among the files, so no other letter contains the word.
 */
export const TICK_BOXES = {
  medicare: "[ ] The Medicare notice or insurer's statement for this visit is attached",
  insurance: "[ ] The notice or statement from my insurance for this visit is attached",
  none: "[ ] I have not received one",
};

/** The packet's document titles (§2a): the cover sheet, one per letter kind, and the page that is kept. */
export const LETTER_TITLES = {
  cover: LETTERS.coverSheet,
  correction_request: "Ask Patient Financial Services to Review Line {n}",
  information_request: "Ask Patient Financial Services for an Itemized Bill",
  assistance_application: "Help Application",
  assumed: LETTERS.assumed,
};

/** The cover sheet's three lists (§2a). `attachNoticeIfAny` is for a check with no notice; `demoContact` for the demo hospital. */
export const COVER_SHEET = {
  blankTitle: "Still blank, for you to fill in by hand",
  blankLetters: "Patient name and account number, on each letter",
  blankApplication: "Household size and total yearly household income, on the help application",
  blankSigning: "The tick boxes, your name, the signatures and the date",
  attachTitle: "Attach",
  attachBill: "A copy of the bill",
  attachNotice: "A copy of the notice",
  attachNoticeIfAny: "A copy of the notice or statement, if you have one",
  attachIncome: "Proof of income, if you send the help application",
  whereTitle: "Where it goes",
  where: "Patient Financial Services, at the address printed on the bill.",
  demoContact: "The demo hospital has no phone number and no form link.",
};

/** On every printed page. */
export const PRINT_FOOTER = "Prepared with Kindred Snap private mode. Fill in the blanks by hand before sending.";

export const ERASE = {
  action: "Erase from this phone",
  ask: "Erase this check from this browser? You can't get it back.",
  confirm: "Erase it",
};
