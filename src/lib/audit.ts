import type { AuditEvent } from "@/lib/types";

/** Append-only. Ids are monotonic per log; entries are frozen; nothing is ever edited or removed. */
export function appendAudit(log: readonly AuditEvent[], e: Omit<AuditEvent, "id">): readonly AuditEvent[] {
  const id = (log.at(-1)?.id ?? 0) + 1;
  return Object.freeze([...log, Object.freeze({ ...e, id })]);
}
