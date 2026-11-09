import { describe, expect, it } from "vitest";
import { formatUsd, sumCents, toCents } from "@/lib/money";

describe("toCents", () => {
  it("parses dollar strings", () => {
    expect(toCents("$1,234.50")).toBe(123450);
    expect(toCents("466.00")).toBe(46600);
    expect(toCents("226")).toBe(22600);
    expect(toCents(" $0.5 ")).toBe(50);
  });
  it("parses numbers with rounding", () => {
    expect(toCents(1234.5)).toBe(123450);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
  it("handles negatives in both notations", () => {
    expect(toCents("-$12.50")).toBe(-1250);
    expect(toCents("(12.50)")).toBe(-1250);
  });
  it("rejects garbage", () => {
    expect(() => toCents("twelve")).toThrow();
    expect(() => toCents("1.234")).toThrow();
    expect(() => toCents(Number.NaN)).toThrow();
  });
});

describe("formatUsd and sumCents", () => {
  it("formats cents as US dollars", () => {
    expect(formatUsd(123450)).toBe("$1,234.50");
    expect(formatUsd(5)).toBe("$0.05");
    expect(formatUsd(-1250)).toBe("-$12.50");
  });
  it("sums", () => {
    expect(sumCents([148000, 295000, 24000, 31000, 38000])).toBe(536000);
    expect(sumCents([])).toBe(0);
  });
});
