import { describe, expect, it } from "vitest";
import { roleFromEnv } from "@/lib/server/auth";

describe("staff role from the environment", () => {
  it("is staff with the bypass outside production", () => {
    expect(roleFromEnv({ STAFF_BYPASS: "1", NODE_ENV: "development" })).toBe("staff");
    expect(roleFromEnv({ STAFF_BYPASS: "1", NODE_ENV: "test" })).toBe("staff");
  });
  it("is anonymous without the bypass", () => {
    expect(roleFromEnv({ NODE_ENV: "development" })).toBe("anonymous");
    expect(roleFromEnv({ STAFF_BYPASS: "0", NODE_ENV: "development" })).toBe("anonymous");
  });
  it("ignores the bypass in production unless ALLOW_DEMO=1", () => {
    expect(roleFromEnv({ STAFF_BYPASS: "1", NODE_ENV: "production" })).toBe("anonymous");
    expect(roleFromEnv({ STAFF_BYPASS: "1", NODE_ENV: "production", ALLOW_DEMO: "1" })).toBe("staff");
  });
});
