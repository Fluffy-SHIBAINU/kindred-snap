import { assertSimulated } from "@/lib/guards";
import type { Action, Actor, Case } from "@/lib/types";

export type CaseState =
  | "created" | "reading" | "unreadable" | "needs_notice" | "connector_unavailable" | "comparing" | "needs_review"
  | "checking_assistance" | "drafting" | "ready_to_send" | "sent" | "responded" | "resolved" | "closed";

/** Every legal edge. `closed` is reachable from anywhere (delete, abandon). */
export const TRANSITIONS: Record<CaseState, CaseState[]> = {
  created: ["reading"],
  reading: ["unreadable", "needs_notice", "connector_unavailable", "comparing"],
  unreadable: ["reading"],
  needs_notice: ["comparing", "reading"],
  connector_unavailable: ["comparing", "needs_notice"],
  comparing: ["needs_review", "checking_assistance"],
  needs_review: ["checking_assistance", "closed"],
  checking_assistance: ["drafting"],
  drafting: ["ready_to_send"],
  ready_to_send: ["sent", "closed"],
  sent: ["responded"],
  responded: ["resolved"],
  resolved: ["closed"],
  closed: [],
};

/** States while the app is working on its own; the caregiver sees the progress feed. */
export const WORKING_STATES: CaseState[] = ["reading", "comparing", "checking_assistance", "drafting"];

export class IllegalTransition extends Error {
  constructor(from: CaseState, to: CaseState) { super(`Illegal transition ${from} → ${to}`); }
}
export class ApprovalRefused extends Error {}

export function canTransition(from: CaseState, to: CaseState): boolean {
  return to === "closed" || TRANSITIONS[from].includes(to);
}

export function transition(c: Case, to: CaseState, now: string): Case {
  if (!canTransition(c.state, to)) throw new IllegalTransition(c.state, to);
  return { ...c, state: to, updatedAt: now };
}

/**
 * The one human gate. Only the patient or their helper, only when the case is ready, only with consent on record.
 * Marks every drafted action approved; the case stays `ready_to_send` until `markSent`.
 */
export function approve(input: { c: Case; actions: Action[]; actor: Actor; now: string }): { c: Case; actions: Action[] } {
  const { c, actions, actor, now } = input;
  if (c.state !== "ready_to_send") throw new ApprovalRefused(`Case is ${c.state}, not ready to send`);
  if (actor.role !== "patient" && actor.role !== "helper") throw new ApprovalRefused("Only the patient or their helper can approve");
  if (!c.consent) throw new ApprovalRefused("No consent on record");
  if (actions.length === 0) throw new ApprovalRefused("Nothing drafted to approve");
  return {
    c: { ...c, updatedAt: now },
    actions: actions.map((a) => (a.status === "drafted" ? { ...a, status: "approved", approvedBy: actor.id, approvedAt: now } : a)),
  };
}

/** Sending is always simulated in this build; the guard exists so a live mode must be a deliberate, reviewed change. */
export function markSent(input: { c: Case; actions: Action[]; now: string; externalActions?: string }): { c: Case; actions: Action[] } {
  const { c, actions, now } = input;
  assertSimulated(input.externalActions ?? process.env.EXTERNAL_ACTIONS ?? "simulated");
  if (actions.length === 0 || actions.some((a) => a.status !== "approved")) throw new ApprovalRefused("Every action must be approved before sending");
  return {
    c: transition(c, "sent", now),
    actions: actions.map((a) => ({ ...a, status: "sent_simulated", sentAt: now })),
  };
}
