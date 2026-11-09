import { afterEach, describe, expect, it, vi } from "vitest";
import { assertFlagsSafe, demoControlsEnabled, staffBypassEnabled } from "@/lib/server/flags";

const dev = { NODE_ENV: "development", DEMO_CONTROLS: "1", STAFF_BYPASS: "1" };
const prod = { NODE_ENV: "production", DEMO_CONTROLS: "1", STAFF_BYPASS: "1" };

describe("flags", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("are on in development when set", () => {
    expect(demoControlsEnabled(dev)).toBe(true);
    expect(staffBypassEnabled(dev)).toBe(true);
    expect(demoControlsEnabled({ NODE_ENV: "development", DEMO_CONTROLS: "0" })).toBe(false);
    expect(() => assertFlagsSafe(dev)).not.toThrow();
  });

  it("are off in production without ALLOW_DEMO and the assert throws", () => {
    expect(demoControlsEnabled(prod)).toBe(false);
    expect(staffBypassEnabled(prod)).toBe(false);
    expect(() => assertFlagsSafe(prod)).toThrow(/DEMO_CONTROLS and STAFF_BYPASS/);
    expect(() => assertFlagsSafe({ NODE_ENV: "production", STAFF_BYPASS: "1" })).toThrow(/STAFF_BYPASS/);
    expect(() => assertFlagsSafe({ NODE_ENV: "production" })).not.toThrow();
  });

  it("are on in production with ALLOW_DEMO=1", () => {
    const allowed = { ...prod, ALLOW_DEMO: "1" };
    expect(demoControlsEnabled(allowed)).toBe(true);
    expect(staffBypassEnabled(allowed)).toBe(true);
    expect(() => assertFlagsSafe(allowed)).not.toThrow();
  });

  it("throws at import time in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_CONTROLS", "1");
    vi.stubEnv("ALLOW_DEMO", "0");
    vi.resetModules();
    await expect(import("@/lib/server/flags")).rejects.toThrow(/DEMO_CONTROLS/);
  });
});
