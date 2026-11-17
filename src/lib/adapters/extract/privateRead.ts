/**
 * Who reads the files dropped in private mode (docs/features/snap-incognito.md §5). A reader answers with unknown data:
 * `boundRead` (src/lib/private/scrub.ts) rebuilds it before anything else sees it. Nothing here logs.
 */
import table from "../../../../fixtures/private/reads.json";
import { assertFlagsSafe, privateReader } from "@/lib/server/flags";

/** The demo reader was handed something that is not a demo file. */
export class DemoOnly extends Error {}

export interface PrivateReader {
  read(input: { bytes: Uint8Array } | { demoId: string }): Promise<unknown>;
}

// written by scripts/make-fixture-images.mjs: one amounts-only read per demo file, keyed by the file's base name
const READS = table as Record<string, { sha256: string; read: unknown }>;
const UNCOVERED = ["bill-main", "msn-main", "income-letter"];

/** What `Use the demo files` sends: the covered set. */
export const DEMO_SET: string[] = UNCOVERED.map((id) => `${id}-covered`);

/** sha256 → demo id. The page ships these, so the phone can name a demo file without sending it. */
export function demoHashes(): Record<string, string> {
  return Object.fromEntries(Object.entries(READS).map(([id, r]) => [r.sha256, id]));
}

/** Demo mode: answers a demo id from the table. It never reads a file, so nothing a user drops needs to be uploaded. */
export class FixturePrivateReader implements PrivateReader {
  async read(input: { bytes: Uint8Array } | { demoId: string }): Promise<unknown> {
    if (!("demoId" in input) || !Object.hasOwn(READS, input.demoId)) throw new DemoOnly();
    return structuredClone(READS[input.demoId].read);
  }
}

/**
 * e2e only: answers any picture with the uncovered bill, notice and income reads by call order, then "other", so the
 * upload path can be tested without a key. It looks at no byte.
 */
export class StubPrivateReader implements PrivateReader {
  private calls = 0;

  async read(input: { bytes: Uint8Array } | { demoId: string }): Promise<unknown> {
    if ("demoId" in input) throw new Error("the stub reader reads files, not demo ids");
    const id = UNCOVERED[this.calls++];
    return id ? structuredClone(READS[id].read) : { kind: "other" };
  }
}

/** A new reader per call, so the stub's order restarts with every request. `stub` in production needs ALLOW_DEMO=1; `gemini` throws until I3. */
export function selectPrivateReader(env: Record<string, string | undefined> = process.env): PrivateReader {
  assertFlagsSafe(env);
  return privateReader(env) === "stub" ? new StubPrivateReader() : new FixturePrivateReader();
}
