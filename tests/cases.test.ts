import { describe, expect, it } from "vitest";
import { CODE_PATTERN, daysLeft, daysLeftText, hrefFor, incomeCentsFrom, newCaseCode, normalizeCode, parseIncome } from "@/lib/server/cases";

const src = { documentId: "d", page: 1, quote: "" };
const field = (key: string, value: string) => ({ key, value, originalValue: value, confidence: 1, source: src });

describe("case codes", () => {
  it("are SNAP- plus six unambiguous characters", () => {
    for (let i = 0; i < 50; i++) expect(newCaseCode()).toMatch(CODE_PATTERN);
  });
  it("normalise what a caregiver types", () => {
    expect(normalizeCode(" snap 7k4m2d ")).toBe("SNAP-7K4M2D");
    expect(normalizeCode("7K4M2D")).toBe("SNAP-7K4M2D");
    expect(normalizeCode("SNAP-7K4M2O")).toBeNull(); // O is not in the alphabet
    expect(normalizeCode("")).toBeNull();
  });
});

describe("income", () => {
  it("parses typed amounts and refuses the rest", () => {
    expect(parseIncome("37,560")).toBe(3756000);
    expect(parseIncome("$37,560.00")).toBe(3756000);
    expect(parseIncome("-5")).toBeNull();
    expect(parseIncome("about 37k")).toBeNull();
  });
  it("takes the first income-like field from a document", () => {
    expect(incomeCentsFrom([field("period", "2025"), field("annual_income", "$37,560.00")])).toBe(3756000);
    expect(incomeCentsFrom([field("period", "2025")])).toBeNull();
  });
});

describe("resume", () => {
  it("sends each state to its screen, created to income", () => {
    expect(hrefFor({ id: "x", state: "created" })).toBe("/case/x/income");
    expect(hrefFor({ id: "x", state: "unreadable" })).toBe("/snap");
    expect(hrefFor({ id: "x", state: "drafting" })).toBe("/case/x/working");
    expect(hrefFor({ id: "x", state: "ready_to_send" })).toBe("/case/x/result");
  });
  it("counts days left without a timezone shift", () => {
    expect(daysLeft("2026-11-30", new Date("2026-11-09T23:30:00Z"))).toBe(21);
    expect(daysLeftText(21)).toBe("21 days left");
    expect(daysLeftText(0)).toBe("Due today");
    expect(daysLeftText(-1)).toBe("Past the due date");
  });
});
