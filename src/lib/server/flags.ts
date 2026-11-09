/**
 * Demo and development switches (`.env.example`). In production both are off unless ALLOW_DEMO=1,
 * and a production process that sets either without ALLOW_DEMO throws when this module loads.
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

/** Throws in production when DEMO_CONTROLS or STAFF_BYPASS is on and ALLOW_DEMO is not 1. */
export function assertFlagsSafe(env: Env = process.env): void {
  if (!prodWithoutAllow(env)) return;
  const bad = ["DEMO_CONTROLS", "STAFF_BYPASS"].filter((k) => on(env[k]));
  if (bad.length) throw new Error(bad.join(" and ") + " set in production without ALLOW_DEMO=1");
}

assertFlagsSafe();
