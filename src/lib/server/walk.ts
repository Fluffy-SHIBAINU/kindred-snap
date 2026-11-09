import { SyntheticBlueButton } from "@/lib/adapters/claims/synthetic";
import { RESPONSE_DELAY_DAYS } from "@/lib/adapters/hospital/demoPartner";
import type { Store } from "@/lib/adapters/store/types";
import { approveAndSend, deliverResponse } from "@/lib/caseFlow";
import { loadCaseFixture } from "@/lib/fixtures";
import { defaultPolicyFor, runInvestigation } from "@/lib/pipeline";
import type { Case, Consent } from "@/lib/types";

/**
 * A demo walk-through ("Use the demo bill") must survive serverless: each request may land on an instance whose
 * memory store has never seen the case. A walk case is rebuilt from fixtures/cases/main.json plus the hints its URL
 * carries (income typed, letters sent, reply received), so any instance can serve any step.
 */

const WALK_ID = /^walk-[A-Za-z0-9]{6}$/;
const HELPER = { id: "demo-helper", role: "helper" } as const;

export type WalkHints = { incomeCents?: number; householdSize?: number; sent?: boolean; responded?: boolean };
type SearchParams = Record<string, string | string[] | undefined>;

export const isWalkId = (id: string) => WALK_ID.test(id);

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseWalkHints(sp: SearchParams): WalkHints {
  const h: WalkHints = {};
  const income = Number(first(sp.income));
  if (first(sp.income) && Number.isSafeInteger(income) && income >= 0) h.incomeCents = income;
  const hh = Number(first(sp.hh));
  if (Number.isInteger(hh) && hh >= 1 && hh <= 20) h.householdSize = hh;
  if (first(sp.sent) === "1") h.sent = true;
  if (first(sp.responded) === "1") h.responded = true;
  return h;
}

/** "?income=…&hh=…&sent=1&responded=1" for the hints that are set; "" when none are. */
export function walkQuery(h: WalkHints): string {
  const q = new URLSearchParams();
  if (h.incomeCents != null) q.set("income", String(h.incomeCents));
  if (h.householdSize != null) q.set("hh", String(h.householdSize));
  if (h.sent) q.set("sent", "1");
  if (h.responded) q.set("responded", "1");
  const s = q.toString();
  return s ? "?" + s : "";
}

/** The query to append to a link for this case: the hints for a walk case, nothing for any other. */
export const walkSuffix = (id: string, h: WalkHints) => (isWalkId(id) ? walkQuery(h) : "");

/** Materialises a missing walk case, then brings it (idempotently, in order) to the state its hints imply. Other ids: the stored case. */
export async function ensureWalkCase(store: Store, id: string, hints: WalkHints): Promise<Case | null> {
  if (!isWalkId(id)) return store.cases.get(id);
  let c = await store.cases.get(id);
  if (!c) c = await materialise(store, id);

  if (hints.incomeCents != null && c.state === "created") {
    const at = new Date().toISOString();
    const consent: Consent = { caseId: id, grantedAt: at, grantedBy: HELPER.id, role: HELPER.role, scope: "investigate_and_prepare" };
    await store.consents.put(consent);
    await store.cases.put({ ...c, consent, income: { annualCents: hints.incomeCents, householdSize: hints.householdSize ?? 1, source: "typed" }, updatedAt: at });
    await store.appendAudit(id, { at, actor: HELPER.id, role: HELPER.role, action: "consent.granted", details: { scope: consent.scope } });
    c = await runInvestigation(store, id, { claims: new SyntheticBlueButton(), policyFor: defaultPolicyFor, now: () => new Date().toISOString() });
  }
  if (hints.sent && c.state === "ready_to_send") {
    c = await approveAndSend(store, id, HELPER, new Date().toISOString());
  }
  if (hints.responded && c.state === "sent" && c.sentAt) {
    // the hint says the reply has arrived, so the demo clock is bypassed: "now" is exactly when the partner answers
    await deliverResponse(store, id, new Date(Date.parse(c.sentAt) + RESPONSE_DELAY_DAYS * 86_400_000).toISOString());
    c = (await store.cases.get(id)) ?? c;
  }
  return c;
}

async function materialise(store: Store, id: string): Promise<Case> {
  const fx = loadCaseFixture("main");
  const at = new Date().toISOString();
  const c: Case = {
    ...fx.case, id, code: "SNAP-" + id.slice(5).toUpperCase(), state: "created", ownerId: HELPER.id, fixtureKey: "main",
    consent: null, income: null, steps: [], createdAt: at, updatedAt: at,
  };
  await store.cases.put(c);
  for (const d of fx.documents) await store.documents.put({ ...d, id: `${id}-${d.kind}`, caseId: id });
  await store.appendAudit(id, { at, actor: HELPER.id, role: HELPER.role, action: "case.created", details: { code: c.code, fixtureKey: "main", walk: true } });
  return c;
}
