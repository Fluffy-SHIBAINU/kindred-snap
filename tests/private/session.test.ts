import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { demoMatch, runStateless } from "@/lib/private/run";
import { boundRead } from "@/lib/private/scrub";
import { IDLE_MS, forget, loadResult, saveResult } from "@/lib/private/session";
import type { PrivateResult } from "@/lib/private/types";

const KEY = "snap_private_v1";
const T0 = Date.UTC(2026, 10, 17, 12);
const TODAY = "2026-11-17";

// a real result, from the demo reads
let result: PrivateResult;
beforeAll(async () => {
  const table = JSON.parse(readFileSync("fixtures/private/reads.json", "utf8")) as Record<string, { read: unknown }>;
  const reads = ["bill-main", "msn-main", "income-letter"].map((id, i) => boundRead(table[id].read, i + 1, TODAY));
  const out = await runStateless(reads, { match: demoMatch, today: TODAY, demo: true });
  if (out.status !== "ok") throw new Error(`not ok: ${JSON.stringify(out)}`);
  result = out.result;
});

/** A browser tab: `window.sessionStorage` backed by a map the test can look into. */
function tab(): Map<string, string> {
  const items = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    },
  });
  return items;
}
const savedAt = (items: Map<string, string>) => (JSON.parse(items.get(KEY)!) as { at: number }).at;

afterEach(() => vi.unstubAllGlobals());

describe("the tab's copy of a private result", () => {
  it("is idle after 30 minutes, as S11 says", () => {
    expect(IDLE_MS).toBe(30 * 60 * 1000);
  });

  it("round trips through sessionStorage under one key, as { at, result }", () => {
    const items = tab();
    saveResult(result, T0);
    expect([...items.keys()]).toEqual([KEY]);
    expect(JSON.parse(items.get(KEY)!)).toEqual({ at: T0, result });
    expect(loadResult(T0 + 1000)).toEqual(result);
  });

  it("stamps the time itself when none is given", () => {
    const items = tab();
    const before = Date.now();
    saveResult(result);
    expect(savedAt(items)).toBeGreaterThanOrEqual(before);
    expect(loadResult()).toEqual(result);
  });

  it("counts idle time from the last use: every load refreshes the stamp", () => {
    const items = tab();
    saveResult(result, T0);
    expect(loadResult(T0 + IDLE_MS)).toEqual(result);
    expect(savedAt(items)).toBe(T0 + IDLE_MS);
    // 60 minutes after the save, 30 after the last use
    expect(loadResult(T0 + 2 * IDLE_MS)).toEqual(result);
  });

  it("purges a result older than 30 minutes and answers null", () => {
    const items = tab();
    saveResult(result, T0);
    expect(loadResult(T0 + IDLE_MS + 1)).toBeNull();
    expect(items.size).toBe(0);
    // gone for good, also for an earlier clock
    expect(loadResult(T0)).toBeNull();
  });

  it("forgets on request", () => {
    const items = tab();
    saveResult(result, T0);
    forget();
    expect(items.size).toBe(0);
    expect(loadResult(T0)).toBeNull();
  });

  it("answers null for an empty tab and writes nothing", () => {
    const items = tab();
    expect(loadResult(T0)).toBeNull();
    expect(items.size).toBe(0);
  });

  it.each(["not json", "{}", '"text"', "[]", JSON.stringify({ at: "yesterday", result: {} }), JSON.stringify({ at: T0 })])("purges a value it cannot use: %s", (value) => {
    const items = tab();
    items.set(KEY, value);
    expect(loadResult(T0)).toBeNull();
    expect(items.size).toBe(0);
  });

  it("does not throw where there is no window, as in a server render", () => {
    expect(typeof window).toBe("undefined");
    expect(() => saveResult(result, T0)).not.toThrow();
    expect(loadResult(T0)).toBeNull();
    expect(() => forget()).not.toThrow();
  });

  it("does not throw when the browser refuses storage, as a private window can", () => {
    const refuse = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    vi.stubGlobal("window", { get sessionStorage() { return refuse(); } });
    expect(() => saveResult(result, T0)).not.toThrow();
    expect(loadResult(T0)).toBeNull();
    expect(() => forget()).not.toThrow();
    vi.stubGlobal("window", { sessionStorage: { getItem: refuse, setItem: refuse, removeItem: refuse } });
    expect(() => saveResult(result, T0)).not.toThrow();
    expect(loadResult(T0)).toBeNull();
    expect(() => forget()).not.toThrow();
  });
});
