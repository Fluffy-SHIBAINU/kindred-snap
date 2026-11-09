import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Case, Document } from "@/lib/types";

export type CaseFixture = { case: Case; documents: Document[]; consentText: string };

const DIR = join(process.cwd(), "fixtures", "cases");

/** Fixture keys, one per `fixtures/cases/*.json`, sorted. */
export function listCaseFixtures(): string[] {
  return readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
}

export function loadCaseFixture(key: string): CaseFixture {
  // keys can arrive from a stored case.fixtureKey; never let one escape the directory
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error(`Unknown fixture: ${key}`);
  return JSON.parse(readFileSync(join(DIR, `${key}.json`), "utf8")) as CaseFixture;
}
