import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Policy, PolicyField } from "@/lib/types";

/** The shape of one Waive atlas sheet, as exported (fields we read; the file holds more). */
export type AtlasField<T = unknown> = { value: T; quote?: string; source_id?: string; checked_on?: string } | null;
export type AtlasSheet = {
  hospital: { ccn: string; name: string; city: string; state: string; website_domain?: string | null };
  version: number;
  status: string;
  eligibility: { free_care_max_fpl?: AtlasField<string | number>; discount_tiers?: AtlasField<Array<{ min_fpl_exclusive?: string | number; max_fpl_inclusive: string | number; discount_percent: number }>> };
  apply: { form_url?: AtlasField<string>; window_days_from_first_bill?: AtlasField<string | number> };
  contacts: { phone?: AtlasField<string> };
  sources: Array<{ id: string; url: string | null; title?: string; fetched_on?: string }>;
};

const FIXTURE_DIR = join(process.cwd(), "fixtures", "atlas");

let cache: AtlasSheet[] | null = null;

export function loadSheets(opts: { atlasDir?: string | undefined; force?: boolean } = {}): AtlasSheet[] {
  if (cache && !opts.force && opts.atlasDir === undefined) return cache;
  const dirs = [FIXTURE_DIR, opts.atlasDir ?? process.env.ATLAS_DIR].filter((d): d is string => !!d && existsSync(d));
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

/** Thresholds, tiers, window and contact, each with the quote and dated source the sheet carries. */
export function policyOf(sheet: AtlasSheet): Policy {
  const src = new Map(sheet.sources.map((s) => [s.id, s]));
  const field = <T, U>(f: AtlasField<T> | undefined, map: (v: T) => U, empty: U): PolicyField<U> => {
    if (!f) return { value: empty, quote: null, sourceUrl: null, checkedOn: null };
    const s = f.source_id ? src.get(f.source_id) : undefined;
    return { value: map(f.value), quote: f.quote ?? null, sourceUrl: s?.url ?? null, checkedOn: f.checked_on ?? null };
  };
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
