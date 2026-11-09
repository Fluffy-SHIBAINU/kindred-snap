import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Policy, PolicyField } from "@/lib/types";

type PilotField<T> = { value: T; quote: string | null; source_id: string | null; checked_on: string | null } | null;
type PilotHospital = {
  ccn: string; name: string; city: string; state: string;
  transition: { law: string; effective: string; what_changes: string; source_url: string; confidence: string };
  policy: { free_care_max_fpl: PilotField<string | number>; discount_tiers: PilotField<Array<{ max_fpl_inclusive: string | number; discount_percent: number }>> };
  apply: { form_url: PilotField<string>; window_days_from_first_bill: PilotField<string | number> };
  contacts: { phone: PilotField<string> };
  sources: Record<string, { url: string | null; title?: string; fetched_on?: string }>;
};
export type PilotFile = { hospitals: PilotHospital[]; poverty_guidelines: Record<string, { household_1: number; household_2: number; per_additional: number; source_url: string }> };

export function loadPilotFile(path = join(process.cwd(), "fixtures", "hospitals.json")): PilotFile {
  return JSON.parse(readFileSync(path, "utf8")) as PilotFile;
}

/** The three pilot hospitals as policies, every value with its quote and dated source. */
export function pilotPolicies(file = loadPilotFile()): Array<Policy & { transition: PilotHospital["transition"]; city: string; state: string }> {
  return file.hospitals.map((h) => {
    const field = <T, U>(f: PilotField<T>, map: (v: T) => U, empty: U): PolicyField<U> =>
      f ? { value: map(f.value), quote: f.quote, sourceUrl: f.source_id ? h.sources[f.source_id]?.url ?? null : null, checkedOn: f.checked_on } : { value: empty, quote: null, sourceUrl: null, checkedOn: null };
    const num = (v: string | number | null | undefined) => (v == null || v === "" ? null : Number(v));
    return {
      basis: "atlas", hospitalCcn: h.ccn, hospitalName: h.name, city: h.city, state: h.state, transition: h.transition,
      freeCareMaxFpl: field(h.policy.free_care_max_fpl, num, null),
      tiers: field(h.policy.discount_tiers, (v) => (v ?? []).map((t) => ({ maxFplInclusive: Number(t.max_fpl_inclusive), discountPercent: Number(t.discount_percent) })), []),
      windowDays: field(h.apply.window_days_from_first_bill, num, null),
      phone: field(h.contacts.phone, (v) => v ?? null, null),
      formUrl: field(h.apply.form_url, (v) => v ?? null, null),
    };
  });
}
