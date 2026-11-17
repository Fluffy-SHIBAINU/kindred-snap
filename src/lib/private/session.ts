/**
 * The browser tab's copy of a private result (docs/features/snap-incognito.md §7 "The tab", S11): sessionStorage only,
 * so a reload does not lose it, purged after 30 idle minutes. Nothing else is stored in the browser. Every access goes
 * through `window` inside a try: there is no window on the server, and a browser can refuse storage (a private
 * window, a full quota). None of these functions throws.
 */
import type { PrivateResult } from "./types";

export const IDLE_MS = 1_800_000;
const KEY = "snap_private_v1";

export function saveResult(r: PrivateResult, now: number = Date.now()): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ at: now, result: r }));
  } catch {
    // no storage: the result lives in the component's memory only
  }
}

/** The saved result, or null. One older than `IDLE_MS`, or one that does not parse, is purged; any other is given a fresh `at`. */
export function loadResult(now: number = Date.now()): PrivateResult | null {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as { at?: unknown; result?: PrivateResult } | null;
    if (!saved) return null;
    if (typeof saved.at !== "number" || !saved.result || now - saved.at > IDLE_MS) {
      forget();
      return null;
    }
    saveResult(saved.result, now);
    return saved.result;
  } catch {
    forget();
    return null;
  }
}

export function forget(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // no storage: nothing was kept
  }
}
