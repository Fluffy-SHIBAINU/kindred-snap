import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Case, Document } from "@/lib/types";
import type { Store } from "./types";

/** The shape of one `fixtures/cases/*.json` file (synthetic patients only). */
export type CaseFixture = { case: Case; documents: Document[]; consentText?: string };

const FIXTURE_DIR = join(process.cwd(), "fixtures", "cases");

/** Loads every case fixture into the store. Puts are keyed by id, so running it again changes nothing. Returns the number of cases. */
export async function seedDemo(store: Store, dir: string = FIXTURE_DIR): Promise<number> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  for (const f of files) {
    const fx = JSON.parse(readFileSync(join(dir, f), "utf8")) as CaseFixture;
    await store.cases.put(fx.case);
    for (const d of fx.documents ?? []) await store.documents.put(d);
  }
  return files.length;
}
