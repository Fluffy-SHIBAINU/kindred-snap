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
  // Several serverless instances can cold-start together on one database; the last writer of this key prepares, the others leave it alone.
  const token = crypto.randomUUID();
  await store.meta.set("demo_prepare_lock", token);
  await new Promise((r) => setTimeout(r, 200));
  if ((await store.meta.get("demo_prepare_lock")) !== token) return;
  try {
    const fresh = await store.cases.get("demo");
    if (!fresh || (fresh.income && fresh.state !== "created")) return;
    const now = new Date().toISOString();
    const consent = { caseId: fresh.id, grantedAt: now, grantedBy: fresh.ownerId, role: "helper" as const, scope: "investigate_and_prepare" };
    await store.consents.put(consent);
    await store.cases.put({ ...fresh, state: "created", steps: [], eligibility: undefined, income: { annualCents: 3756000, householdSize: 1, source: "typed" }, consent, updatedAt: now });
    await runInvestigation(store, fresh.id, { claims: new SyntheticBlueButton(), policyFor: defaultPolicyFor, now: () => new Date().toISOString() });
  } catch (e) {
    // Another instance finished first, or the database hiccuped: the demo case is served as it is.
    console.error("demo case preparation skipped:", (e as Error).message);
  }
}
