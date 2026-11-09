import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export type { Collection, Meta, Store } from "./types";
export { MemoryStore } from "./memory";
export { SupabaseStore } from "./supabase";
export { seedDemo } from "./seed";

declare global {
  // eslint-disable-next-line no-var
  var __snapStore: Store | undefined;
}

/** One store per process, chosen by `STORE` (default `memory`; `supabase` uses the service-role key, server only). */
export function getStore(): Store {
  if (globalThis.__snapStore) return globalThis.__snapStore;
  const kind = process.env.STORE ?? "memory";
  if (kind === "supabase") globalThis.__snapStore = SupabaseStore.create(process.env);
  else if (kind === "memory") globalThis.__snapStore = new MemoryStore();
  else throw new Error(`STORE=${kind} is not supported; use memory or supabase`);
  return globalThis.__snapStore;
}
