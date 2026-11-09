import { SyntheticBlueButton } from "@/lib/adapters/claims/synthetic";
import { getStore, seedDemo, type Store } from "@/lib/adapters/store/index";
import { defaultPolicyFor, runInvestigation } from "@/lib/pipeline";

/**
 * One store per process, seeded from fixtures/cases on first use (synthetic patients only).
 * The demo case is investigated at seed time so /case/demo lands on the result screen for visitors.
 */
export async function getServerStore() {
  const g = globalThis as typeof globalThis & { __snapStore?: Store; __snapSeeded?: Promise<void> };
  // getStore() caches on the same global, so another caller may have created the store first; seeding is tracked separately.
  g.__snapStore ??= getStore();
  g.__snapSeeded ??= seedDemo(g.__snapStore).then(() => prepareDemoCase(g.__snapStore as Store));
  await g.__snapSeeded;
  return g.__snapStore as Store;
}

/**
 * The demo case must land on the result screen with the 75% tier. On a shared database a cold-start race can leave it
 * investigated without its income, so any demo case without income is reset to `created` and investigated again
 * (findings and actions carry deterministic ids and are overwritten).
 */
async function prepareDemoCase(store: Store) {
  const c = await store.cases.get("demo");
  if (!c || (c.income && c.state !== "created")) return;
  const now = new Date().toISOString();
  const consent = { caseId: c.id, grantedAt: now, grantedBy: c.ownerId, role: "helper" as const, scope: "investigate_and_prepare" };
  await store.consents.put(consent);
  await store.cases.put({ ...c, state: "created", steps: [], eligibility: undefined, income: { annualCents: 3756000, householdSize: 1, source: "typed" }, consent, updatedAt: now });
  await runInvestigation(store, c.id, { claims: new SyntheticBlueButton(), policyFor: defaultPolicyFor, now: () => new Date().toISOString() });
}
