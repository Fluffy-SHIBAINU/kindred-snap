import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "@/lib/csp";

const doc = readFileSync("docs/features/snap-incognito.md", "utf8");
const DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "form-action 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
];

describe("contentSecurityPolicy", () => {
  it("is the policy the feature document writes, directive for directive", () => {
    const policy = contentSecurityPolicy(false);
    expect(policy.split("; ")).toEqual(DIRECTIVES);
    expect(doc).toContain(`\`${policy}\``);
  });

  it("names no other origin and allows no eval outside development", () => {
    const policy = contentSecurityPolicy(false);
    expect(policy).not.toMatch(/https?:|\*|'unsafe-eval'/);
  });

  it("adds 'unsafe-eval' to script-src in development and changes nothing else", () => {
    const dev = contentSecurityPolicy(true).split("; ");
    expect(dev[1]).toBe("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval'");
    expect(dev.filter((_, i) => i !== 1)).toEqual(DIRECTIVES.filter((_, i) => i !== 1));
  });
});
