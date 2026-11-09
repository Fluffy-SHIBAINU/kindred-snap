import { describe, expect, it } from "vitest";
import { appendAudit } from "@/lib/audit";

describe("audit log", () => {
  it("appends with monotonic ids and cannot be edited", () => {
    let log = appendAudit([], { caseId: "c1", at: "t1", actor: "u", role: "helper", action: "case.created" });
    log = appendAudit(log, { caseId: "c1", at: "t2", actor: "u", role: "helper", action: "consent.granted", details: { scope: "investigate_and_prepare" } });
    expect(log.map((e) => e.id)).toEqual([1, 2]);
    expect(Object.isFrozen(log)).toBe(true);
    expect(() => { (log[0] as { actor: string }).actor = "x"; }).toThrow();
  });
});
