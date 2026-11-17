"use server";

import { DemoOnly, selectPrivateReader } from "@/lib/adapters/extract/privateRead";
import { matchHospital, privatePolicyOf } from "@/lib/atlas";
import { countPrivate } from "@/lib/private/count";
import { demoMatch, runStateless } from "@/lib/private/run";
import { boundRead, scrub } from "@/lib/private/scrub";
import type { PrivateOutcome, PrivateRead } from "@/lib/private/types";
import { privateReader } from "@/lib/server/flags";

// the limits `src/lib/private/hygiene.ts` checks on the phone; tests/private/actions.test.ts pins that the two agree
const MAX_PARTS = 10;
const MAX_BYTES = 4 * 1024 * 1024;

const isText = (v: FormDataEntryValue): v is string => typeof v === "string";
const isFile = (v: FormDataEntryValue): v is File => typeof v !== "string";

/** The hospital a page names, looked up in the atlas: exactly one sheet or nothing. */
function atlasMatch(h: PrivateRead["hospital"]) {
  const m = matchHospital(h);
  return m && privatePolicyOf(m.sheet, m.exact);
}

/**
 * One request from the dropped pages to a result. Demo reader: only ids of demo files are accepted, never a file.
 * Any other reader: only pictures redrawn on the phone, held in memory for this call. A part's file name and type
 * string are never read. A refusal that is not a demo-only one is thrown, so the caller answers `failed`.
 */
async function check(form: FormData): Promise<PrivateOutcome> {
  const kind = privateReader();
  const reader = selectPrivateReader();
  const files = form.getAll("file");
  const demos = form.getAll("demo");
  const today = new Date().toISOString().slice(0, 10);

  let inputs: Array<{ bytes: Uint8Array } | { demoId: string }>;
  if (kind === "fixture") {
    if (files.length || demos.length < 1 || demos.length > MAX_PARTS || !demos.every(isText)) throw new DemoOnly();
    inputs = demos.map((demoId) => ({ demoId }));
  } else {
    if (demos.length || files.length < 1 || files.length > MAX_PARTS || !files.every(isFile)) throw new Error();
    if (files.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES) throw new Error();
    // every page is in memory before the first read, so the reads start in drop order
    inputs = (await Promise.all(files.map((f) => f.arrayBuffer()))).map((buffer) => {
      const bytes = new Uint8Array(buffer);
      // a JPEG starts FF D8 FF: the phone redraws every page as one
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error();
      return { bytes };
    });
  }

  const raw = await Promise.all(inputs.map((input) => reader.read(input)));
  const reads = raw.map((r, i) => scrub(boundRead(r, i + 1, today)));
  // the demo partner exists for the demo and stub readers only; a live reader looks the hospital up in the atlas
  return runStateless(reads, kind === "gemini" ? { match: atlasMatch, today, demo: false } : { match: demoMatch, today, demo: true });
}

/**
 * Private mode's one server action (docs/features/snap-incognito.md §5): the dropped pages in, a result for the browser
 * tab out, nothing kept but the monthly count. `form` holds `file` × 1 to 10 (stub and live readers) or `demo` × 1 to 10
 * (demo reader). Every error becomes the one fixed status with no message, and nothing on this path logs: an error's
 * text can carry what was read off a page.
 */
export async function runPrivate(form: FormData): Promise<PrivateOutcome> {
  let outcome: PrivateOutcome;
  try {
    outcome = await check(form);
  } catch (e) {
    outcome = e instanceof DemoOnly ? { status: "unreadable", reason: "demo_only" } : { status: "failed" };
  }
  await countPrivate(outcome.status === "ok" ? "run_ok" : outcome.status);
  return outcome;
}
