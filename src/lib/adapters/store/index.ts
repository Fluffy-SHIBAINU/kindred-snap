import { MemoryStore } from "./memory";
import type { Store } from "./types";

export type { Collection, Meta, Store } from "./types";
export { MemoryStore } from "./memory";
export { seedDemo } from "./seed";

declare global {
  // eslint-disable-next-line no-var
  var __snapStore: Store | undefined;
}

/** One store per process, chosen by `STORE` (default `memory`). Supabase arrives in Phase 6. */
export function getStore(): Store {
  if (globalThis.__snapStore) return globalThis.__snapStore;
  const kind = process.env.STORE ?? "memory";
  if (kind === "supabase") throw new Error("STORE=supabase is not implemented in this phase");
  if (kind !== "memory") throw new Error(`STORE=${kind} is not supported; use memory`);
  globalThis.__snapStore = new MemoryStore();
  return globalThis.__snapStore;
}
