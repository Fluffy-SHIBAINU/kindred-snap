import { afterEach, describe, expect, it, vi } from "vitest";
import { assertFlagsSafe, demoControlsEnabled, privateReader, staffBypassEnabled } from "@/lib/server/flags";

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

  it("private reader defaults to fixture and rejects any unknown value", () => {
    expect(privateReader({})).toBe("fixture");
    expect(privateReader({ PRIVATE_READER: "" })).toBe("fixture");
    expect(privateReader({ PRIVATE_READER: "fixture" })).toBe("fixture");
    expect(privateReader({ PRIVATE_READER: "stub" })).toBe("stub");
    expect(privateReader({ PRIVATE_READER: "gemini" })).toBe("gemini");
    expect(() => privateReader({ PRIVATE_READER: "Gemini" })).toThrow(/PRIVATE_READER/);
    expect(() => assertFlagsSafe({ NODE_ENV: "development", PRIVATE_READER: "live" })).toThrow(/PRIVATE_READER/);
  });

  it("private reader stub throws in production without ALLOW_DEMO=1, and nowhere else", () => {
    expect(() => assertFlagsSafe({ NODE_ENV: "production", PRIVATE_READER: "stub" })).toThrow(/PRIVATE_READER=stub/);
    expect(() => assertFlagsSafe({ NODE_ENV: "production", PRIVATE_READER: "stub", ALLOW_DEMO: "1" })).not.toThrow();
    expect(() => assertFlagsSafe({ NODE_ENV: "development", PRIVATE_READER: "stub" })).not.toThrow();
    expect(() => assertFlagsSafe({ NODE_ENV: "production", PRIVATE_READER: "fixture" })).not.toThrow();
  });

  it("private reader gemini throws in every environment until Phase 10 I3", () => {
    const message = "PRIVATE_READER=gemini is not available until Phase 10 I3";
    expect(() => assertFlagsSafe({ NODE_ENV: "development", PRIVATE_READER: "gemini" })).toThrow(message);
    expect(() => assertFlagsSafe({ NODE_ENV: "production", PRIVATE_READER: "gemini", ALLOW_DEMO: "1" })).toThrow(message);
  });

  it("throws at import time on an unsafe private reader", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PRIVATE_READER", "gemini");
    vi.resetModules();
    await expect(import("@/lib/server/flags")).rejects.toThrow(/PRIVATE_READER=gemini/);
  });
});
