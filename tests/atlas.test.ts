import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { atlasSources, findHospital, loadSheets, policyOf } from "@/lib/atlas";

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
