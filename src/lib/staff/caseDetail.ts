import { DemoPartnerHospital, RESPONSE_DELAY_DAYS } from "@/lib/adapters/hospital/demoPartner";
import type { ResponseFacts } from "@/lib/adapters/hospital/types";
import type { Store } from "@/lib/adapters/store/types";
import { transition } from "@/lib/case/state";
import { estimateOpportunity, recordConfirmed } from "@/lib/savings";
import type { Actor, Case, Document, Finding, Resolution } from "@/lib/types";

/** The staff member behind every write from the staff workspace until Phase 6 brings real profiles. */
export const DEMO_STAFF: Actor = { id: "demo-staff", role: "staff" };

export class NotFoundInCase extends Error {}
export class ReasonRequired extends Error {}
export class WrongState extends Error {}

const DAY_MS = 86_400_000;

/** Writes the new value, keeps the original, stamps who and when, and audits `field.edited` with both values. */
export async function editField(store: Store, input: { caseId: string; documentId: string; key: string; value: string; actor: Actor; now: string }): Promise<Document> {
  const value = input.value.trim();
  if (!value) throw new ReasonRequired("Enter a value");
  const doc = await store.documents.get(input.documentId);
  if (!doc || doc.caseId !== input.caseId) throw new NotFoundInCase(`No document ${input.documentId} on case ${input.caseId}`);
  const field = doc.fields.find((f) => f.key === input.key);
  if (!field) throw new NotFoundInCase(`No field ${input.key} on document ${input.documentId}`);
  const from = field.value;
  const next: Document = {
    ...doc,
    fields: doc.fields.map((f) => (f.key === input.key ? { ...f, value, editedBy: input.actor.id, editedAt: input.now } : f)),
  };
  await store.documents.put(next);
  await store.appendAudit(input.caseId, { at: input.now, actor: input.actor.id, role: input.actor.role, action: "field.edited", details: { documentId: doc.id, key: input.key, from, to: value } });
  return next;
}

/** Confirm, or dismiss with a reason. Either way the finding keeps its evidence; only `staffStatus` changes. */
export async function reviewFinding(
  store: Store,
  input: { caseId: string; findingId: string; status: "confirmed" | "dismissed"; reason?: string; actor: Actor; now: string },
): Promise<Finding> {
  const reason = input.reason?.trim();
  if (input.status === "dismissed" && !reason) throw new ReasonRequired("A reason is required to dismiss a finding");
  const f = await store.findings.get(input.findingId);
  if (!f || f.caseId !== input.caseId) throw new NotFoundInCase(`No finding ${input.findingId} on case ${input.caseId}`);
  const next: Finding = { ...f, staffStatus: input.status, dismissReason: input.status === "dismissed" ? reason : undefined };
  await store.findings.put(next);
  await store.appendAudit(input.caseId, {
    at: input.now, actor: input.actor.id, role: input.actor.role,
    action: input.status === "confirmed" ? "finding.confirmed" : "finding.dismissed",
    details: { findingId: f.id, kind: f.kind, ...(reason ? { reason } : {}) },
  });
  return next;
}

export type MissingItem = { key: "notice" | "income"; title: string; detail: string };

/** What the case still lacks. Neither item invents a fact; both say who can supply it. */
export function missingInformation(c: Case): MissingItem[] {
  const out: MissingItem[] = [];
  if (c.state === "needs_notice") out.push({ key: "notice", title: "Medicare Summary Notice", detail: "Medicare has no notice on record for this visit yet. The caregiver can photograph the paper notice when it arrives." });
  if (!c.income) out.push({ key: "income", title: "Household income", detail: "No yearly income has been typed, so the assistance check cannot run. The caregiver supplies it on the income screen." });
  return out;
}

/** The figures the demo partner writes its letter from, every one taken from the case's own documents and findings. */
export async function responseFacts(store: Store, c: Case): Promise<ResponseFacts> {
  const bill = (await store.documentsFor(c.id)).find((d) => d.kind === "bill");
  const findings = await store.findingsFor(c.id);
  const flagged = findings.find((f) => f.kind === "line_not_patient_responsibility" && f.staffStatus !== "dismissed");
  const line = flagged ? bill?.billLines?.find((l) => l.n === flagged.evidence[0]?.line) : undefined;
  const gap = findings.filter((f) => f.kind === "patient_owes_exceeds_notice" && !f.requiresReview && f.staffStatus !== "dismissed").reduce((a, f) => a + (f.amountCents ?? 0), 0);
  const asked = bill?.billTotals?.patientOwesCents ?? c.balanceCents ?? 0;
  const e = c.eligibility;
  return {
    patientName: c.patientName,
    removedLineCents: line?.chargeCents ?? 0,
    removedLineLabel: line ? `${line.code} ${line.description}` : "",
    tierPercent: e && (e.status === "free" || e.status === "discount") ? e.discountPercent : null,
    askedCents: asked,
    correctedCents: asked - gap,
  };
}

/**
 * Demo control: the hospital's simulated reply lands now, however many days have passed. Stores the letter, files it
 * as a `response_letter` document (the basis staff can pick), marks the actions responded and moves the case to `responded`.
 */
export async function deliverResponse(store: Store, caseId: string, actor: Actor, hospital = new DemoPartnerHospital()): Promise<Case> {
  const c = await store.cases.get(caseId);
  if (!c) throw new NotFoundInCase(`No case ${caseId}`);
  if (c.state !== "sent" || !c.sentAt) throw new WrongState(`Case is ${c.state}; a response needs a sent case`);
  const receivedAt = new Date(Date.parse(c.sentAt) + RESPONSE_DELAY_DAYS * DAY_MS).toISOString();
  const letter = await hospital.response({ caseId, sentAt: c.sentAt, now: receivedAt, facts: await responseFacts(store, c) });
  if (!letter) throw new WrongState("The demo partner has no response yet");
  await store.responses.put(letter);
  await store.documents.put({
    id: letter.id, caseId, kind: "response_letter", fileName: "", pages: 1, status: "readable", uploadedAt: receivedAt, text: letter.text,
    fields: [{ key: "new_balance", value: String(letter.newBalanceCents), originalValue: String(letter.newBalanceCents), confidence: 1, source: { documentId: letter.id, page: 1, quote: letter.text.split("\n\n").find((p) => p.startsWith("The new balance")) ?? letter.text } }],
  });
  for (const a of await store.actionsFor(caseId)) if (a.status === "sent_simulated") await store.actions.put({ ...a, status: "responded" });
  const next = transition(c, "responded", receivedAt);
  await store.cases.put(next);
  await store.appendAudit(caseId, { at: receivedAt, actor: actor.id, role: actor.role, action: "response.received_simulated", details: { letterId: letter.id, newBalanceCents: letter.newBalanceCents, simulated: true } });
  return next;
}

/** The resolution row for a case: the stored one, or an estimate-only row built from the findings. */
export async function resolutionFor(store: Store, c: Case): Promise<Resolution> {
  const stored = await store.resolutions.get(c.id);
  if (stored) return stored;
  const estimate = estimateOpportunity(await store.findingsFor(c.id), c.eligibility ?? null, c.balanceCents ?? 0).cents;
  return { caseId: c.id, estimatedOpportunityCents: estimate, confirmedAdjustmentCents: null, actualSavingsCents: null, basisDocumentId: null };
}

/**
 * Staff records what the hospital confirmed in writing. The basis must be a response letter on this case
 * (`recordConfirmed` refuses without one); the case moves from `responded` to `resolved`.
 */
export async function recordResolution(
  store: Store,
  input: { caseId: string; basisDocumentId: string | null; newBalanceCents: number; actor: Actor; now: string },
): Promise<Resolution> {
  const c = await store.cases.get(input.caseId);
  if (!c) throw new NotFoundInCase(`No case ${input.caseId}`);
  if (input.basisDocumentId) {
    const basis = await store.responses.get(input.basisDocumentId);
    if (!basis || basis.caseId !== c.id) throw new NotFoundInCase("The basis document must be a response letter on this case");
  }
  const res = recordConfirmed(await resolutionFor(store, c), {
    basisDocumentId: input.basisDocumentId, newBalanceCents: input.newBalanceCents, askedCents: c.balanceCents ?? 0, actor: input.actor, now: input.now,
  });
  await store.resolutions.put(res);
  if (c.state === "responded") await store.cases.put(transition(c, "resolved", input.now));
  await store.appendAudit(c.id, {
    at: input.now, actor: input.actor.id, role: input.actor.role, action: "resolution.recorded",
    details: { basisDocumentId: res.basisDocumentId, confirmedAdjustmentCents: res.confirmedAdjustmentCents, actualSavingsCents: res.actualSavingsCents },
  });
  return res;
}
