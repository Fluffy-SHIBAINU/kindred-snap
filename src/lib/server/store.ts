import { getStore, seedDemo, type Store } from "@/lib/adapters/store/index";

/** One store per process, seeded from fixtures/cases on first use (synthetic patients only). */
export async function getServerStore() {
  const g = globalThis as any;
  if (!g.__snapStore) {
    g.__snapStore = getStore();
    await seedDemo(g.__snapStore);
  }
  return g.__snapStore as Store;
}
