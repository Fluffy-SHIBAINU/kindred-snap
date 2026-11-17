/**
 * Demo and development switches (`.env.example`). In production both are off unless ALLOW_DEMO=1,
 * and a production process that sets either without ALLOW_DEMO throws when this module loads.
 * PRIVATE_READER (who reads the files dropped in private mode) is checked in every environment.
 */
type Env = Record<string, string | undefined>;

const on = (v: string | undefined) => v === "1" || v === "true";
const prodWithoutAllow = (env: Env) => env.NODE_ENV === "production" && env.ALLOW_DEMO !== "1";

export function demoControlsEnabled(env: Env = process.env): boolean {
  return on(env.DEMO_CONTROLS) && !prodWithoutAllow(env);
}

export function staffBypassEnabled(env: Env = process.env): boolean {
  return on(env.STAFF_BYPASS) && !prodWithoutAllow(env);
}

const READERS = ["fixture", "stub", "gemini"] as const;

/** Unset is `fixture`: demo mode, where nothing a user drops is uploaded. Any other value throws. */
export function privateReader(env: Env = process.env): "fixture" | "stub" | "gemini" {
  const reader = READERS.find((r) => r === (env.PRIVATE_READER || "fixture"));
  if (!reader) throw new Error("PRIVATE_READER must be fixture, stub or gemini");
  return reader;
}

/**
 * Throws on an unsafe PRIVATE_READER in any environment, and in production when DEMO_CONTROLS or
 * STAFF_BYPASS is on and ALLOW_DEMO is not 1.
 */
export function assertFlagsSafe(env: Env = process.env): void {
  const reader = privateReader(env);
  // the Phase 10 I3 flag task replaces this check with the project, location and reader-terms checks
  if (reader === "gemini") throw new Error("PRIVATE_READER=gemini is not available until Phase 10 I3");
  if (reader === "stub" && prodWithoutAllow(env)) throw new Error("PRIVATE_READER=stub set in production without ALLOW_DEMO=1");
  if (!prodWithoutAllow(env)) return;
  const bad = ["DEMO_CONTROLS", "STAFF_BYPASS"].filter((k) => on(env[k]));
  if (bad.length) throw new Error(bad.join(" and ") + " set in production without ALLOW_DEMO=1");
}

assertFlagsSafe();
