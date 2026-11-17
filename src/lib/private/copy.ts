/**
 * Every fixed sentence private mode shows, held once and exactly as docs/features/snap-incognito.md writes it
 * (§1 promises, §2 screens, §4 left-out files, §6 chips, §7 result blocks); tests/private/copy.test.ts checks each
 * against that document. A `{slot}` is filled with `fill`: amounts already formatted, names from the atlas.
 * Nothing here carries a case's own figure. Object keys follow the unions of §5 (`outcome`, `help`, stop reasons).
 */
import { READER_TERMS, type ReaderTerms } from "./readerTerms";

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

/** The step summaries the feature document writes out; `reading` is the first row while the request runs. */
export const STEP_SUMMARIES = {
  reading: "Reading your files",
  noNotice: "No notice in your files",
  householdOfOne: "For a household of one, the policy lists {percent}% off. Assumed.",
  lettersReady: "Letters ready to print.",
};

/** Files left out of a check (§4: T13, T18, T19), by `PrivateResult["leftOut"]` key, as written for one file. */
export const LEFT_OUT = {
  other: "1 file wasn't a bill, a notice or an income letter. We left it out.",
  unreadable: "1 file was too blurry to read. We left it out. Drop a clearer copy.",
  secondStatement: "We left your insurer's statement out.",
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
  matched: "Matched to {hospital}, {city}, {state}",
  coverageNotStated: "The policy we read does not say whether it covers patients who have insurance. The hospital decides.",
  realPolicy: "Real hospital policy, checked {date}",
  otherConditions: "Other Conditions in the Policy",
  worked: "How we worked this out",
  assumed: "What we assumed ({n})",
  whoCanHelp: "Who can help",
  medicarePhone: "For the notice, call 1-800-MEDICARE (1-800-633-4227).",
};

/** The letters screen and the packet's fixed pages (§2, §7). Letter wording itself is in `letters.ts`. */
export const LETTERS = {
  coverSheet: "Before You Send",
  permission: "If you send this for someone else, the hospital may ask for the patient's written permission. Have the patient sign too, or attach their permission.",
  assumed: "What We Assumed",
  keep: "Keep this page. Do not send it.",
  attach: "Attach a copy of the bill and the notice. Send it all to Patient Financial Services, at the address printed on the bill.",
};

export const ERASE = {
  action: "Erase from this phone",
  ask: "Erase this check from this browser? You can't get it back.",
  confirm: "Erase it",
};
