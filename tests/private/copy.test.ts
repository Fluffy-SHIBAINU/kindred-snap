import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACTIONS, ASSUMPTIONS, BODY, BUTTON_LABEL, CHIPS, COVERAGE_WORDS, COVER_SHEET, DISCOUNT, ERASE, GUESS_KEYS, H1, H1_LINE, H2, HELD, LEFT_OUT, LETTERS, LETTER_TITLES, NOTICE_NAME,
  PRINT_FOOTER, PROMISES as P, REFUSED, RESULT, STAFF_REVIEW_SENTENCE, STEP_SUMMARIES, STEP_TITLES, STOP, TABLES, TICK_BOXES, fill, fillTerms, promisesFor,
} from "@/lib/private/copy";
import { READER_TERMS, readerTermsComplete, type ReaderTerms } from "@/lib/private/readerTerms";

const doc = readFileSync("docs/features/snap-incognito.md", "utf8");

// an invented, complete record: no real provider's figure belongs in a test
const terms: ReaderTerms = { provider: "Example Cloud", service: "Example Reader", retentionDays: 30, trains: false, staffMayReview: false, url: "https://example.com/terms", readOn: "Nov 17, 2026", goLiveApprovedOn: "2026-11-17" };

// the feature document's own example values for the slots
const EXAMPLES: Array<Record<string, string | number>> = [
  { amount: "$240.00", percent: 75, date: "Sep 14, 2026", n: "n", discounts: "75% and 50%", hospital: "Riverbend Community Hospital", city: "Tacoma", state: "WA" },
  { amount: "$466.00", date: "<date>" },
  {}, // §2a writes its strings with their slots
];
const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : Object.values(v as object).flatMap(strings));
const { insured_not_covered_medicare: medicareH2, ...h2 } = H2;
const fixed = strings([
  BODY, ACTIONS, H1, H1_LINE, NOTICE_NAME, h2, STOP, REFUSED, STEP_TITLES, STEP_SUMMARIES, DISCOUNT, LEFT_OUT, HELD, CHIPS, RESULT, TABLES, LETTERS, LETTER_TITLES,
  COVER_SHEET, PRINT_FOOTER, ERASE, TICK_BOXES,
]);
const section2a = doc.slice(doc.indexOf("### 2a."), doc.indexOf("## 3."));
const places = ["snap", "body", "details", "erased", "stop", "failed"] as const;

describe("private copy", () => {
  it("holds every promise sentence S1 to S16 exactly as the feature document writes it", () => {
    expect(Object.keys(P)).toEqual(Array.from({ length: 16 }, (_, i) => `S${i + 1}`));
    for (const [id, sentence] of Object.entries(P)) expect(doc.includes(sentence), id).toBe(true);
    expect(doc).toContain(STAFF_REVIEW_SENTENCE);
  });

  it("names the button as the founder wrote it", () => {
    expect(BUTTON_LABEL).toBe("Incognito — Private Mode");
    expect(doc).toContain(BUTTON_LABEL);
  });

  it("holds every other fixed string as the feature document writes it, slots filled with its examples", () => {
    for (const s of fixed) expect(EXAMPLES.some((e) => doc.includes(fill(s, e))), s).toBe(true);
    // the document writes the Medicare heading elided
    expect(doc).toContain("…Who Have Medicare");
    expect(medicareH2).toBe(H2.insured_not_covered.replace(/Insurance$/, "Medicare"));
  });

  it("holds every string of the feature document's section 2a, slots as written", () => {
    const { reading, ...rows } = STEP_SUMMARIES;
    expect(doc).toContain(reading);
    const settled = strings([rows, DISCOUNT, LEFT_OUT, HELD, TABLES, LETTER_TITLES, COVER_SHEET, PRINT_FOOTER]);
    for (const s of settled) expect(section2a.includes(s), s).toBe(true);
    // the other way round: nothing the section quotes is missing from copy.ts
    const quoted = [...section2a.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(quoted.length).toBeGreaterThan(70);
    for (const q of quoted) expect(fixed, q).toContain(q);
  });

  it("lists the guesses, which carry the chip Assumed, as section 2a does", () => {
    expect(section2a).toContain(GUESS_KEYS.map((k) => "`" + k + "`").join(", "));
  });

  it("holds a statement and an if-wrong sentence for every assumption key, as section 6 writes them", () => {
    const keys = doc.match(/type AssumptionKey = ([^;]+);/)![1].split(" | ").map((k) => k.replace(/"/g, ""));
    expect(Object.keys(ASSUMPTIONS)).toEqual(keys);
    for (const k of GUESS_KEYS) expect(keys).toContain(k);
    const section6 = doc.slice(doc.indexOf("## 6. Assumptions"), doc.indexOf("## 7."));
    for (const [key, a] of Object.entries(ASSUMPTIONS)) {
      const statements = key === "coverage_type" ? Object.values(COVERAGE_WORDS).map((w) => fill(a.statement, w)) : [a.statement];
      for (const s of [...statements, a.ifWrong]) expect(section6.includes(s) || section2a.includes(s), `${key}: ${s}`).toBe(true);
      expect(["blank", "asks", "left_out"], key).toContain(a.inLetter);
    }
  });

  it("names Medicare in an assumption only where a Medicare notice was dropped", () => {
    const { coverage_type, second_statement, ...rest } = ASSUMPTIONS;
    expect(JSON.stringify(rest)).not.toContain("Medicare");
    expect(fill(coverage_type.statement, COVERAGE_WORDS.eob) + coverage_type.ifWrong).not.toContain("Medicare");
    expect(fill(coverage_type.statement, COVERAGE_WORDS.msn)).toBe("We took this to be Original Medicare, because you dropped a Medicare notice.");
    expect(second_statement.ifWrong).toContain("Medicare");
  });

  it("carries no demo figure or name: amounts, percents, dates and hospitals are slots", () => {
    for (const s of [...fixed, ...strings(ASSUMPTIONS), ...Object.values(P), medicareH2]) expect(s).not.toMatch(/\$\d|\d%|Riverbend|Tacoma|Sep 14/);
  });

  it("fills slots and leaves a mark with no value as written", () => {
    expect(fill(H1.line_found, { amount: "$240.00" })).toBe("We Found $240.00 You May Not Owe");
    expect(fill(RESULT.matched, { hospital: "A {city} Hospital", city: "Tacoma" })).toBe("Matched to A {city} Hospital, Tacoma, {state}.");
    expect(fill(STEP_SUMMARIES.help.same_tier, { discount: fill(DISCOUNT.discount, { percent: 75 }) })).toBe("For households of one to four, the policy lists 75% off.");
    expect(fill("{constructor}", {})).toBe("{constructor}");
  });
});

describe("reader terms", () => {
  it("ship empty, so no figure can be approved by default", () => {
    expect(READER_TERMS).toEqual({ provider: "", service: "", retentionDays: null, trains: null, staffMayReview: null, url: "", readOn: "", goLiveApprovedOn: "" });
    expect(readerTermsComplete()).toBe(false);
  });

  it("are complete only when every field is filled and the service does not train on the pictures", () => {
    expect(readerTermsComplete(terms)).toBe(true);
    expect(readerTermsComplete({ ...terms, staffMayReview: true })).toBe(true);
    expect(readerTermsComplete({ ...terms, trains: true })).toBe(false);
    expect(readerTermsComplete({ ...terms, url: "  " })).toBe(false);
    for (const key of Object.keys(terms) as Array<keyof ReaderTerms>) expect(readerTermsComplete({ ...terms, [key]: READER_TERMS[key] }), key).toBe(false);
  });

  it("fill S7 and S14 with no slot left over", () => {
    expect(fillTerms(P.S7, terms)).toBe(
      "The pictures are read by Example Reader from Example Cloud. Its terms, which we read on Nov 17, 2026, say it does not train its models on them and may keep them for up to 30 days. We cannot check that ourselves or shorten it.",
    );
    expect(fillTerms(P.S14, terms)).toBe("The pictures you dropped went to Example Reader, which may keep them for up to 30 days. We cannot erase that copy.");
  });
});

describe("promisesFor", () => {
  const s7 = fillTerms(P.S7, terms);
  const s14 = fillTerms(P.S14, terms);

  it("demo reader: S8 leads on Snap and in the body, and S14 is never shown", () => {
    expect(promisesFor("snap", "fixture")).toEqual([P.S8, P.S1]);
    expect(promisesFor("body", "fixture")).toEqual([P.S8, P.S2, P.S3]);
    expect(promisesFor("details", "fixture")).toEqual([P.S4, P.S5, P.S6]);
    expect(promisesFor("erased", "fixture")).toEqual([P.S13]);
    expect(promisesFor("stop", "fixture")).toEqual([P.S15]);
    expect(promisesFor("failed", "fixture")).toEqual([P.S16]);
  });

  it("live reader: S7 in the body and S14 after an erase, a stop or a failure, filled from the terms", () => {
    expect(promisesFor("snap", "gemini", terms)).toEqual([P.S1]);
    expect(promisesFor("body", "gemini", terms)).toEqual([P.S2, P.S3, s7]);
    expect(promisesFor("details", "gemini", terms)).toEqual([P.S4, P.S5, P.S6]);
    expect(promisesFor("erased", "gemini", terms)).toEqual([P.S13, s14]);
    expect(promisesFor("stop", "gemini", terms)).toEqual([P.S15, s14]);
    expect(promisesFor("failed", "gemini", terms)).toEqual([P.S16, s14]);
  });

  it("live reader: S7 gains the staff sentence when the terms allow staff review", () => {
    expect(promisesFor("body", "gemini", { ...terms, staffMayReview: true })).toEqual([P.S2, P.S3, s7 + " " + STAFF_REVIEW_SENTENCE]);
  });

  it("live reader: no place returns S13, S15 or S16 without S14", () => {
    for (const place of places) {
      const shown = promisesFor(place, "gemini", terms);
      if ([P.S13, P.S15, P.S16].some((s) => shown.includes(s))) expect(shown, place).toContain(s14);
    }
  });

  it("stub reader: neither the demo sentence nor the live ones, in any place", () => {
    expect(promisesFor("snap", "stub")).toEqual([P.S1]);
    expect(promisesFor("body", "stub")).toEqual([P.S2, P.S3]);
    for (const place of places) for (const s of promisesFor(place, "stub", terms)) expect([P.S8, s7, s14], place).not.toContain(s);
  });
});
