import { describe, expect, it } from "vitest";
import { approve, canTransition, IllegalTransition, markSent, TRANSITIONS, transition, type CaseState } from "@/lib/case/state";
import type { Action, Case } from "@/lib/types";

const now = "2026-11-09T04:00:00Z";
const base: Case = {
  id: "c1", code: "KS-0412", state: "ready_to_send", patientName: "Dorothy M. Hale", helperName: "Jenna Hale",
  hospitalName: "Riverbend Community Hospital", ownerId: "u-jenna",
  consent: { caseId: "c1", grantedAt: now, grantedBy: "u-jenna", role: "helper", scope: "investigate_and_prepare" },
  income: { annualCents: 3756000, householdSize: 1, source: "typed" }, steps: [], createdAt: now, updatedAt: now,
};
const drafted: Action[] = [
  { id: "a1", caseId: "c1", kind: "correction_request", title: "Correction letter about line 3", draft: "…", status: "drafted", validatedNumbers: ["$240.00"] },
  { id: "a2", caseId: "c1", kind: "assistance_application", title: "Help application, 75% tier", draft: "…", status: "drafted", validatedNumbers: [] },
];

describe("transitions", () => {
  it("allows every listed edge and closing from anywhere", () => {
    for (const from of Object.keys(TRANSITIONS) as CaseState[]) {
      for (const to of TRANSITIONS[from]) expect(canTransition(from, to)).toBe(true);
      expect(canTransition(from, "closed")).toBe(true);
    }
  });
  it("walks the happy path", () => {
    const path: CaseState[] = ["reading", "comparing", "checking_assistance", "drafting", "ready_to_send", "sent", "responded", "resolved"];
    let c: Case = { ...base, state: "created" };
    for (const s of path) c = transition(c, s, now);
    expect(c.state).toBe("resolved");
  });
  it("routes the connector outage and the done-for-now close", () => {
    expect(canTransition("reading", "connector_unavailable")).toBe(true);
    expect(canTransition("connector_unavailable", "needs_notice")).toBe(true);
    expect(canTransition("ready_to_send", "closed")).toBe(true);
  });
  it("refuses illegal edges", () => {
    expect(() => transition({ ...base, state: "created" }, "sent", now)).toThrow(IllegalTransition);
    expect(() => transition({ ...base, state: "sent" }, "ready_to_send", now)).toThrow(IllegalTransition);
    expect(() => transition({ ...base, state: "closed" }, "reading", now)).toThrow(IllegalTransition);
  });
});

describe("approval gate", () => {
  it("approves for the helper with consent", () => {
    const r = approve({ c: base, actions: drafted, actor: { id: "u-jenna", role: "helper" }, now });
    expect(r.actions.every((a) => a.status === "approved" && a.approvedBy === "u-jenna")).toBe(true);
    expect(r.c.state).toBe("ready_to_send");
  });
  it("refuses without consent, by staff, or before ready", () => {
    expect(() => approve({ c: { ...base, consent: null }, actions: drafted, actor: { id: "u", role: "helper" }, now })).toThrow(/consent/i);
    expect(() => approve({ c: base, actions: drafted, actor: { id: "s", role: "staff" }, now })).toThrow(/patient or their helper/);
    expect(() => approve({ c: { ...base, state: "drafting" }, actions: drafted, actor: { id: "u", role: "helper" }, now })).toThrow(/not ready/);
  });
  it("refuses to send before approval and refuses any non-simulated mode", () => {
    expect(() => markSent({ c: base, actions: drafted, now })).toThrow(/approved/);
    const approved = approve({ c: base, actions: drafted, actor: { id: "u-jenna", role: "helper" }, now });
    expect(() => markSent({ ...approved, now, externalActions: "live" })).toThrow(/not supported/);
    const sent = markSent({ ...approved, now, externalActions: "simulated" });
    expect(sent.c.state).toBe("sent");
    expect(sent.actions.every((a) => a.status === "sent_simulated" && a.sentAt === now)).toBe(true);
  });
});
