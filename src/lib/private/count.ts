/**
 * The one value private mode stores (docs/features/snap-incognito.md §5, S5): how many private checks ended each way,
 * by month. It goes through `getStore().meta`, never `getServerStore()`, which seeds and investigates the demo case.
 * Nothing here logs, and a count that cannot be written never fails a check.
 */
import { getStore } from "@/lib/adapters/store";

export async function countPrivate(event: "run_ok" | "needs_amount" | "unreadable" | "failed"): Promise<void> {
  try {
    const meta = getStore().meta;
    const key = `private_count:${new Date().toISOString().slice(0, 7)}:${event}`;
    // shortcut: read then write, so two checks ending in the same instant can count as one; use a database-side increment if the count must be exact
    await meta.set(key, String((Number(await meta.get(key)) || 0) + 1));
  } catch {
    // no store, or the store is down: the check still answers
  }
}
