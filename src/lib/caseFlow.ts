import { DemoPartnerHospital } from "@/lib/adapters/hospital/demoPartner";
import type { HospitalConnector, ResponseFacts } from "@/lib/adapters/hospital/types";
import type { Store } from "@/lib/adapters/store/types";
import { approve, markSent, transition, type CaseState } from "@/lib/case/state";
import { DemoClock } from "@/lib/demoClock";
import { recordConfirmed } from "@/lib/savings";
import type { Actor, Approval, Case, Resolution, ResponseLetter } from "@/lib/types";

/** What happens to a case after the pipeline leaves it `ready_to_send`: the one human gate, the simulated send and reply, staff's record, deletion. */

const HOSPITAL: HospitalConnector = new DemoPartnerHospital();
const CLOCK_KEY = "demo_clock_offset_ms";
/** The seeded demo case (fixtures/cases/main.json), the one the demo controls drive. */
export const DEMO_CASE_ID = "demo";

async function mustGet(store: Store, caseId: string): Promise<Case> {
  const c = await store.cases.get(caseId);
  if (!c) throw new Error(`No case ${caseId}`);
  return c;
}

/** Moves the case, persists it and audits the move (the pipeline does the same in `save`). */
async function move(store: Store, c: Case, to: CaseState, now: string, patch: Partial<Case> = {}): Promise<Case> {
  const next = { ...transition(c, to, now), ...patch };
  await store.cases.put(next);
  await store.appendAudit(c.id, { at: now, actor: "system", role: "system", action: "state.changed", details: { from: c.state, to } });
  return next;
}

/** The demo clock backed by `store.meta`, read once here; writes go straight through. */
export async function demoClockFor(store: Store): Promise<DemoClock> {
  const cache = new Map<string, string>();
  const stored = await store.meta.get(CLOCK_KEY);
  if (stored != null) cache.set(CLOCK_KEY, stored);
  // shortcut: the write is not awaited (the memory store settles at once); await it when a remote store arrives
  return new DemoClock({ get: (k) => cache.get(k), set: (k, v) => { cache.set(k, v); void store.meta.set(k, v); } });
}

/** The caregiver's one tap: approve every draft, send each (simulated), mark the case sent. */
export async function approveAndSend(store: Store, caseId: string, actor: Actor, now: string, hospital: HospitalConnector = HOSPITAL): Promise<Case> {
  const loaded = await mustGet(store, caseId);
  // Consent is also kept in its own table; a concurrent writer can have dropped it from the case row (last writer wins on one row).
  const c: Case = loaded.consent ? loaded : { ...loaded, consent: (await store.consents.get(caseId)) ?? null };
  const approved = approve({ c, actions: await store.actionsFor(caseId), actor, now });
  const approval: Approval = { approvedBy: actor.id, approvedAt: now, role: actor.role as Approval["role"] };
  for (const a of approved.actions) await hospital.send(a, approval, now);
  const sent = markSent({ c: approved.c, actions: approved.actions, now });
  for (const a of sent.actions) {
    await store.actions.put(a);
    await store.appendAudit(caseId, { at: now, actor: actor.id, role: actor.role, action: "action.approved", details: { actionId: a.id, kind: a.kind } });
    await store.appendAudit(caseId, { at: now, actor: "system", role: "system", action: "action.sent_simulated", details: { actionId: a.id, kind: a.kind } });
  }
  const next: Case = { ...sent.c, sentAt: now };
  await store.cases.put(next);
  await store.appendAudit(caseId, { at: now, actor: "system", role: "system", action: "state.changed", details: { from: c.state, to: next.state } });
  return next;
}

/** "Done for now": nothing worth sending, or the caregiver stops here. */
export async function closeCase(store: Store, caseId: string, now: string): Promise<Case> {
  return move(store, await mustGet(store, caseId), "closed", now);
}

/** The figures the simulated letter is written from, every one already in the case. Null until the bill is read. */
export async function responseFactsFor(store: Store, c: Case): Promise<ResponseFacts | null> {
  const bill = (await store.documentsFor(c.id)).find((d) => d.kind === "bill");
  if (!bill?.billTotals) return null;
  const findings = await store.findingsFor(c.id);
  const flagged = findings.find((f) => f.kind === "line_not_patient_responsibility");
  const line = flagged ? bill.billLines?.find((l) => l.n === flagged.evidence[0]?.line) : undefined;
  const gap = findings.filter((f) => f.kind === "patient_owes_exceeds_notice" && !f.requiresReview).reduce((a, f) => a + (f.amountCents ?? 0), 0);
  const e = c.eligibility;
  const asked = bill.billTotals.patientOwesCents;
  return {
    patientName: c.patientName,
    removedLineCents: line?.chargeCents ?? 0,
    removedLineLabel: line ? `${line.code} ${line.description}` : "",
    tierPercent: e && (e.status === "free" || e.status === "discount") ? e.discountPercent : null,
    askedCents: asked,
    correctedCents: asked - gap,
  };
}

/** Checks whether the hospital's simulated reply is due; when it is, stores it and moves the case to `responded`. */
export async function deliverResponse(store: Store, caseId: string, now: string, hospital: HospitalConnector = HOSPITAL): Promise<ResponseLetter | null> {
  const c = await store.cases.get(caseId);
  if (!c || c.state !== "sent" || !c.sentAt) return null;
  const facts = await responseFactsFor(store, c);
  if (!facts) return null;
  const letter = await hospital.response({ caseId, sentAt: c.sentAt, now, facts });
  if (!letter) return null;
  await store.responses.put(letter);
  for (const a of await store.actionsFor(caseId)) await store.actions.put({ ...a, status: "responded" });
  await store.appendAudit(caseId, { at: now, actor: "system", role: "system", action: "response.received_simulated", details: { letterId: letter.id, newBalanceCents: letter.newBalanceCents } });
  await move(store, c, "responded", now);
  return letter;
}

/** Staff records the hospital's letter as the basis of the confirmed adjustment; the case becomes `resolved`. */
export async function recordBasisLetter(store: Store, caseId: string, actor: Actor, now: string): Promise<Resolution> {
  const c = await mustGet(store, caseId);
  const letter = (await store.responses.list({ caseId }))[0];
  if (!letter) throw new Error("No hospital response to record");
  if (c.balanceCents == null) throw new Error("The bill's balance is not on the case");
  const prev = (await store.resolutions.get(caseId)) ?? { caseId, estimatedOpportunityCents: 0, confirmedAdjustmentCents: null, actualSavingsCents: null, basisDocumentId: null };
  const res = recordConfirmed(prev, { basisDocumentId: letter.id, newBalanceCents: letter.newBalanceCents, askedCents: c.balanceCents, actor, now });
  await store.resolutions.put(res);
  await store.appendAudit(caseId, { at: now, actor: actor.id, role: actor.role, action: "resolution.recorded", details: { basisDocumentId: letter.id, confirmedAdjustmentCents: res.confirmedAdjustmentCents } });
  if (c.state === "responded") await move(store, c, "resolved", now);
  return res;
}

/** Removes everything personal on the case (the store keeps a tombstone and the audit log) and records who did it. */
export async function deleteCase(store: Store, caseId: string, actor: Actor, now: string): Promise<Case | null> {
  const tombstone = await store.deleteCaseData(caseId, now);
  if (tombstone) await store.appendAudit(caseId, { at: now, actor: actor.id, role: actor.role, action: "case.deleted" });
  return tombstone;
}
