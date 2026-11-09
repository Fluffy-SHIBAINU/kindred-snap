import { describe, expect, it } from "vitest";
import { DemoClock } from "@/lib/demoClock";

describe("demo clock", () => {
  const meta = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v) }; };
  it("advances and resets", () => {
    const c = new DemoClock(meta(), () => Date.UTC(2026, 10, 9));
    expect(c.now()).toBe("2026-11-09T00:00:00.000Z");
    c.advanceDays(12);
    expect(c.now()).toBe("2026-11-21T00:00:00.000Z");
    c.reset();
    expect(c.now()).toBe("2026-11-09T00:00:00.000Z");
    expect(() => c.advanceDays(-1)).toThrow();
  });
});
