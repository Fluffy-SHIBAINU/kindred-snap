import { SyntheticBlueButton } from "@/lib/adapters/claims/synthetic";
import { getStore, seedDemo, type Store } from "@/lib/adapters/store/index";
import { defaultPolicyFor, runInvestigation } from "@/lib/pipeline";

/**
 * One store per process, seeded from fixtures/cases on first use (synthetic patients only).
 * The demo case is investigated at seed time so /case/demo lands on the result screen for visitors.
 */
export async function getServerStore() {
  const g = globalThis as typeof globalThis & { __snapStore?: Store; __snapSeeded?: Promise<void> };
  if (!g.__snapStore) {
    g.__snapStore = getStore();
    g.__snapSeeded = seedDemo(g.__snapStore).then(() => prepareDemoCase(g.__snapStore as Store));
  }
  await g.__snapSeeded;
  return g.__snapStore as Store;
}

async function prepareDemoCase(store: Store) {
  const c = await store.cases.get("demo");
  if (!c || c.state !== "created") return;
  const now = new Date().toISOString();
  await store.consents.put({ caseId: c.id, grantedAt: now, grantedBy: c.ownerId, role: "helper", scope: "investigate_and_prepare" });
  await store.cases.put({
    ...c,
    income: { annualCents: 3756000, householdSize: 1, source: "typed" },
    consent: { caseId: c.id, grantedAt: now, grantedBy: c.ownerId, role: "helper", scope: "investigate_and_prepare" },
    updatedAt: now,
  });
  await runInvestigation(store, c.id, { claims: new SyntheticBlueButton(), policyFor: defaultPolicyFor, now: () => new Date().toISOString() });
}
