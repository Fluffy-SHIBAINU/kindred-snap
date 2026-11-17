import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrivatePolicy } from "@/lib/private/types";
import type { Policy, PolicyField } from "@/lib/types";

/** The shape of one Waive atlas sheet, as exported (fields we read; the file holds more). */
export type AtlasField<T = unknown> = { value: T; quote?: string; source_id?: string; checked_on?: string } | null;
export type AtlasSheet = {
  hospital: { ccn: string; name: string; city: string; state: string; website_domain?: string | null };
  version: number;
  status: string;
  eligibility: {
    free_care_max_fpl?: AtlasField<string | number>;
    discount_tiers?: AtlasField<Array<{ min_fpl_exclusive?: string | number; max_fpl_inclusive: string | number; discount_percent: number }>>;
    insured_patients_covered?: AtlasField<boolean>;
    asset_test?: AtlasField<boolean>;
    residency?: AtlasField<unknown>;
  };
  apply: { form_url?: AtlasField<string>; window_days_from_first_bill?: AtlasField<string | number> };
  contacts: { phone?: AtlasField<string> };
  sources: Array<{ id: string; url: string | null; title?: string; fetched_on?: string }>;
};

/**
 * The Waive atlas is a SOURCE, never copied into this repository. Directories searched, later wins per CCN:
 *  1. vendor/waive-data/data/atlas — the private waive-data repository as a git submodule (run `git submodule update --init`)
 *  2. ATLAS_DIR — any other checkout on this machine
 *  3. fixtures/atlas — a place for small hand-made test sheets only (none committed)
 */
const SUBMODULE_DIR = join(process.cwd(), "vendor", "waive-data", "data", "atlas");
const FIXTURE_DIR = join(process.cwd(), "fixtures", "atlas");

let cache: AtlasSheet[] | null = null;

export function atlasSources(atlasDir: string | undefined = process.env.ATLAS_DIR): string[] {
  return [SUBMODULE_DIR, atlasDir, FIXTURE_DIR].filter((d): d is string => !!d && existsSync(d));
}

export function loadSheets(opts: { atlasDir?: string | undefined; force?: boolean } = {}): AtlasSheet[] {
  if (cache && !opts.force && opts.atlasDir === undefined) return cache;
  const dirs = atlasSources(opts.atlasDir);
  const byCcn = new Map<string, AtlasSheet>();
  for (const dir of dirs) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const data = JSON.parse(readFileSync(join(dir, f), "utf8")) as { sheets?: AtlasSheet[] };
      for (const s of data.sheets ?? []) {
        const prev = byCcn.get(s.hospital.ccn);
        if (!prev || s.version > prev.version) byCcn.set(s.hospital.ccn, s);
      }
    }
  }
  const sheets = [...byCcn.values()];
  if (opts.atlasDir === undefined) cache = sheets;
  return sheets;
}

const normName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\b(THE|INC|LLC|CORP)\b/g, "").replace(/\s+/g, " ").trim();

export function findHospital(query: { ccn?: string; name?: string }, sheets: AtlasSheet[] = loadSheets()): AtlasSheet | null {
  if (query.ccn) return sheets.find((s) => s.hospital.ccn === query.ccn) ?? null;
  if (query.name) {
    const q = normName(query.name);
    if (!q) return null;
    return sheets.find((s) => normName(s.hospital.name) === q) ?? sheets.find((s) => normName(s.hospital.name).startsWith(q) || q.startsWith(normName(s.hospital.name))) ?? null;
  }
  return null;
}

/**
 * The one sheet a hospital read off a page points to (private mode). Null unless name and state were both read. The sheets in
 * that state with the same name; else, when the city was read, those in that city where one name contains the other, which is
 * shown but not asserted (`exact: false`). Two candidates are no match.
 */
export function matchHospital(h: { name: string; city: string | null; state: string | null } | null, sheets: AtlasSheet[] = loadSheets()): { sheet: AtlasSheet; exact: boolean } | null {
  const name = normName(h?.name ?? ""), state = normName(h?.state ?? ""), city = normName(h?.city ?? "");
  if (!name || !state) return null;
  const inState = sheets.filter((s) => normName(s.hospital.state) === state);
  const equal = inState.filter((s) => normName(s.hospital.name) === name);
  const contains = (s: AtlasSheet) => { const n = normName(s.hospital.name); return !!n && (n.includes(name) || name.includes(n)); };
  const candidates = equal.length || !city ? equal : inState.filter((s) => normName(s.hospital.city) === city && contains(s));
  return candidates.length === 1 ? { sheet: candidates[0], exact: equal.length === 1 } : null;
}

/** Maps one field of a sheet to its value with the quote and dated source the sheet carries for it. */
function fieldOf(sheet: AtlasSheet) {
  const src = new Map(sheet.sources.map((s) => [s.id, s]));
  return <T, U>(f: AtlasField<T> | undefined, map: (v: T) => U, empty: U): PolicyField<U> => {
    if (!f) return { value: empty, quote: null, sourceUrl: null, checkedOn: null };
    const s = f.source_id ? src.get(f.source_id) : undefined;
    return { value: map(f.value), quote: f.quote ?? null, sourceUrl: s?.url ?? null, checkedOn: f.checked_on ?? null };
  };
}

/**
 * A sheet as private mode shows it: the policy, whether it covers patients who have insurance, and any asset or residency rule.
 * A rule is carried as the policy's own sentence only; its value is never interpreted.
 */
export function privatePolicyOf(sheet: AtlasSheet, exact: boolean): PrivatePolicy {
  const field = fieldOf(sheet);
  const policy = policyOf(sheet);
  const e = sheet.eligibility;
  const condition = (label: "Assets" | "Where the patient lives", f: AtlasField | undefined) => {
    const { quote, sourceUrl, checkedOn } = field(f, () => null, null);
    return quote ? [{ label, quote, sourceUrl, checkedOn }] : [];
  };
  return {
    ccn: sheet.hospital.ccn,
    name: policy.hospitalName,
    city: titleCase(sheet.hospital.city),
    state: sheet.hospital.state,
    exact,
    policy,
    insuredCovered: field(e.insured_patients_covered, (v) => (typeof v === "boolean" ? v : null), null),
    otherConditions: [...(e.asset_test?.value === true ? condition("Assets", e.asset_test) : []), ...condition("Where the patient lives", e.residency)],
  };
}

/** Thresholds, tiers, window and contact, each with the quote and dated source the sheet carries. */
export function policyOf(sheet: AtlasSheet): Policy {
  const field = fieldOf(sheet);
  const num = (v: string | number | null | undefined) => (v == null || v === "" ? null : Number(v));
  return {
    basis: "atlas",
    hospitalCcn: sheet.hospital.ccn,
    hospitalName: titleCase(sheet.hospital.name),
    freeCareMaxFpl: field(sheet.eligibility.free_care_max_fpl, (v) => num(v), null),
    tiers: field(sheet.eligibility.discount_tiers, (v) => (v ?? []).map((t) => ({ maxFplInclusive: Number(t.max_fpl_inclusive), discountPercent: Number(t.discount_percent) })), []),
    windowDays: field(sheet.apply.window_days_from_first_bill, (v) => num(v), null),
    phone: field(sheet.contacts.phone, (v) => v ?? null, null),
    formUrl: field(sheet.apply.form_url, (v) => v ?? null, null),
  };
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/'S\b/g, "'s").trim();
}
