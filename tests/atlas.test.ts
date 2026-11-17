import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { atlasSources, findHospital, loadSheets, matchHospital, policyOf, privatePolicyOf, type AtlasSheet } from "@/lib/atlas";

// The atlas is a source (vendor/waive-data submodule or ATLAS_DIR), not a committed copy. Without it these checks skip.
const sheets = loadSheets();
const hasAtlas = sheets.some((s) => s.hospital.ccn === "220101");

describe.skipIf(!hasAtlas)("atlas loader", () => {
  it("reads the Waive atlas from a source directory, not from a copy in this repo", () => {
    expect(atlasSources().some((d) => d.includes("vendor/waive-data") || d === process.env.ATLAS_DIR)).toBe(true);
    expect(sheets.length).toBeGreaterThanOrEqual(30);
  });
  it("finds Newton-Wellesley by CCN and by name", () => {
    const byCcn = findHospital({ ccn: "220101" }, sheets);
    const byName = findHospital({ name: "Newton-Wellesley Hospital" }, sheets);
    expect(byCcn?.hospital.name).toMatch(/NEWTON-WELLESLEY/);
    expect(byName?.hospital.ccn).toBe("220101");
  });
  it("returns the quoted thresholds with their source", () => {
    const p = policyOf(findHospital({ ccn: "220101" }, sheets)!);
    expect(p.basis).toBe("atlas");
    expect(p.freeCareMaxFpl.value).toBe(150);
    expect(p.freeCareMaxFpl.quote).toMatch(/150/);
    expect(p.freeCareMaxFpl.sourceUrl).toMatch(/^https?:/);
    expect(p.tiers.value).toEqual([{ maxFplInclusive: 250, discountPercent: 85 }, { maxFplInclusive: 300, discountPercent: 70 }]);
    expect(p.hospitalName).toBe("Newton-wellesley Hospital".replace("wellesley", "Wellesley"));
  });
  it("returns null for a hospital it does not know", () => {
    expect(findHospital({ name: "Riverbend Community Hospital" }, sheets)).toBeNull();
    expect(findHospital({ ccn: "999999" }, sheets)).toBeNull();
  });
  it("merges an extra directory and lets the newer version win", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-"));
    const extra = { sheets: [{ hospital: { ccn: "220101", name: "NEWTON-WELLESLEY HOSPITAL", city: "NEWTON", state: "MA" }, version: 99, status: "published", eligibility: { free_care_max_fpl: { value: "175", quote: "175", source_id: "s1" } }, apply: {}, contacts: {}, sources: [{ id: "s1", url: "https://example.test/fap" }] }, { hospital: { ccn: "000001", name: "TEST HOSPITAL", city: "X", state: "ZZ" }, version: 1, status: "published", eligibility: {}, apply: {}, contacts: {}, sources: [] }] };
    writeFileSync(join(dir, "zz.json"), JSON.stringify(extra));
    const merged = loadSheets({ atlasDir: dir });
    expect(findHospital({ ccn: "000001" }, merged)).not.toBeNull();
    expect(policyOf(findHospital({ ccn: "220101" }, merged)!).freeCareMaxFpl.value).toBe(175);
    expect(loadSheets().some((s) => s.hospital.ccn === "000001")).toBe(false);
  });
});

// Hand-made sheets: these run without the atlas source.
const SOURCE = "https://example.test/fap";
const made = (ccn: string, name: string, city: string, state: string, eligibility: AtlasSheet["eligibility"] = {}): AtlasSheet => ({
  hospital: { ccn, name, city, state }, version: 1, status: "published", eligibility, apply: {}, contacts: {}, sources: [{ id: "s1", url: SOURCE }],
});

describe("matchHospital", () => {
  const sheets = [
    made("1", "MERCY HOSPITAL", "SPRINGFIELD", "MO"),
    made("2", "MERCY HOSPITAL", "SPRINGFIELD", "MA"),
    made("3", "ST. LUKE'S MEDICAL CENTER, INC", "BOISE", "ID"),
    made("4", "LAKESIDE HOSPITAL NORTH", "BOISE", "ID"),
    made("5", "LAKESIDE HOSPITAL SOUTH", "BOISE", "ID"),
    made("6", "ST. LUKE'S MEDICAL CENTER WEST", "MERIDIAN", "ID"),
  ];
  const ccn = (h: Parameters<typeof matchHospital>[0]) => { const m = matchHospital(h, sheets); return m && [m.sheet.hospital.ccn, m.exact]; };

  it("matches an equal name in the read state exactly, whatever the case and punctuation", () => {
    expect(ccn({ name: "St. Luke's Medical Center", city: null, state: "id" })).toEqual(["3", true]);
  });
  it("matches the same name in two states only in the read state", () => {
    expect(ccn({ name: "Mercy Hospital", city: null, state: "MA" })).toEqual(["2", true]);
    expect(ccn({ name: "Mercy Hospital", city: "Springfield", state: "MO" })).toEqual(["1", true]);
    expect(ccn({ name: "Mercy Hospital", city: "Springfield", state: "ID" })).toBeNull();
  });
  it("matches nothing unless the name and the state were both read", () => {
    expect(ccn({ name: "Mercy Hospital", city: "Springfield", state: null })).toBeNull();
    expect(ccn({ name: " ", city: "Boise", state: "ID" })).toBeNull();
    expect(ccn(null)).toBeNull();
  });
  it("matches by containment within one city, and says it is not exact", () => {
    expect(ccn({ name: "St. Luke's", city: "Boise", state: "ID" })).toEqual(["3", false]);
    expect(ccn({ name: "Lakeside Hospital North Campus", city: "boise", state: "ID" })).toEqual(["4", false]);
    // containment is never tried without the city
    expect(ccn({ name: "St. Luke's", city: null, state: "ID" })).toBeNull();
  });
  it("matches nothing when two sheets are candidates", () => {
    expect(ccn({ name: "Lakeside Hospital", city: "Boise", state: "ID" })).toBeNull();
    const twins = [made("7", "MERCY HOSPITAL", "JOPLIN", "MO"), ...sheets];
    expect(matchHospital({ name: "Mercy Hospital", city: "Joplin", state: "MO" }, twins)).toBeNull();
  });
});

describe("privatePolicyOf", () => {
  it("maps each field with its quote, source and date", () => {
    const s = made("9", "HARBOR VIEW HOSPITAL", "GIG HARBOR", "WA", {
      free_care_max_fpl: { value: "200", quote: "Free care at or below 200%.", source_id: "s1", checked_on: "2026-10-01" },
      insured_patients_covered: { value: false, quote: "Patients with insurance are not eligible.", source_id: "s1", checked_on: "2026-10-02" },
      asset_test: { value: true, quote: "Assets above $10,000 are counted.", source_id: "s1", checked_on: "2026-10-03" },
      residency: { value: [{ area: "WA" }], quote: "Applicants must live in Washington.", source_id: "s1", checked_on: "2026-10-04" },
    });
    const p = privatePolicyOf(s, true);
    expect(p).toMatchObject({ ccn: "9", name: "Harbor View Hospital", city: "Gig Harbor", state: "WA", exact: true });
    expect(p.policy).toEqual(policyOf(s));
    expect(p.policy.freeCareMaxFpl.value).toBe(200);
    expect(p.insuredCovered).toEqual({ value: false, quote: "Patients with insurance are not eligible.", sourceUrl: SOURCE, checkedOn: "2026-10-02" });
    expect(p.otherConditions).toEqual([
      { label: "Assets", quote: "Assets above $10,000 are counted.", sourceUrl: SOURCE, checkedOn: "2026-10-03" },
      { label: "Where the patient lives", quote: "Applicants must live in Washington.", sourceUrl: SOURCE, checkedOn: "2026-10-04" },
    ]);
  });
  it("leaves out what the sheet does not say", () => {
    const bare = privatePolicyOf(made("10", "X HOSPITAL", "Y", "ZZ"), false);
    expect(bare.exact).toBe(false);
    expect(bare.insuredCovered).toEqual({ value: null, quote: null, sourceUrl: null, checkedOn: null });
    expect(bare.otherConditions).toEqual([]);
    // no asset test, an asset test with no sentence to quote, a residency value with no sentence: none is a condition
    const quiet = privatePolicyOf(made("11", "X HOSPITAL", "Y", "ZZ", { asset_test: { value: false, quote: "No asset test applies." }, residency: { value: [{ area: "ZZ" }] } }), true);
    expect(quiet.otherConditions).toEqual([]);
    expect(privatePolicyOf(made("12", "X HOSPITAL", "Y", "ZZ", { asset_test: { value: true } }), true).otherConditions).toEqual([]);
    expect(privatePolicyOf(made("13", "X HOSPITAL", "Y", "ZZ", { insured_patients_covered: { value: true, quote: "Insured patients may apply." } }), true).insuredCovered.value).toBe(true);
  });
});
