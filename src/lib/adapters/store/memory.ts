import { appendAudit } from "@/lib/audit";
import type { Action, AuditEvent, Case, Consent, Document, Finding, Resolution, ResponseLetter } from "@/lib/types";
import type { Collection, Store } from "./types";

/** Map-backed collection. Items are cloned on the way in and out so callers never share references with the store. */
class MemCollection<T extends object> implements Collection<T> {
  private items = new Map<string, T>();
  constructor(private key: (item: T) => string) {}
  async get(id: string): Promise<T | null> {
    const item = this.items.get(id);
    return item ? structuredClone(item) : null;
  }
  async list(filter?: Partial<T>): Promise<T[]> {
    const all = [...this.items.values()];
    const wanted = filter ? Object.entries(filter) : [];
    return all.filter((item) => wanted.every(([k, v]) => (item as Record<string, unknown>)[k] === v)).map((i) => structuredClone(i));
  }
  async put(item: T): Promise<void> {
    this.items.set(this.key(item), structuredClone(item));
  }
  async remove(predicate: (item: T) => boolean): Promise<void> {
    for (const [k, v] of this.items) if (predicate(v)) this.items.delete(k);
  }
}

export class MemoryStore implements Store {
  cases = new MemCollection<Case>((c) => c.id);
  documents = new MemCollection<Document>((d) => d.id);
  findings = new MemCollection<Finding>((f) => f.id);
  actions = new MemCollection<Action>((a) => a.id);
  resolutions = new MemCollection<Resolution>((r) => r.caseId);
  consents = new MemCollection<Consent>((c) => c.caseId);
  responses = new MemCollection<ResponseLetter>((r) => r.id);

  private metaMap = new Map<string, string>();
  meta = {
    get: async (key: string) => this.metaMap.get(key),
    set: async (key: string, value: string) => void this.metaMap.set(key, value),
  };

  private auditLogs = new Map<string, readonly AuditEvent[]>();
  async audit(caseId: string): Promise<readonly AuditEvent[]> {
    return this.auditLogs.get(caseId) ?? Object.freeze([]);
  }
  async appendAudit(caseId: string, event: Omit<AuditEvent, "id" | "caseId">): Promise<AuditEvent> {
    const log = appendAudit(await this.audit(caseId), { ...event, caseId });
    this.auditLogs.set(caseId, log);
    return log[log.length - 1];
  }

  async ownerOf(caseId: string): Promise<string | null> {
    return (await this.cases.get(caseId))?.ownerId ?? null;
  }
  listCases(): Promise<Case[]> { return this.cases.list(); }
  documentsFor(caseId: string): Promise<Document[]> { return this.documents.list({ caseId }); }
  findingsFor(caseId: string): Promise<Finding[]> { return this.findings.list({ caseId }); }
  actionsFor(caseId: string): Promise<Action[]> { return this.actions.list({ caseId }); }

  async deleteCaseData(caseId: string, now: string = new Date().toISOString()): Promise<Case | null> {
    const c = await this.cases.get(caseId);
    if (!c) return null;
    const sameCase = (x: { caseId: string }) => x.caseId === caseId;
    await Promise.all([this.documents, this.findings, this.actions, this.consents, this.responses].map((col) => col.remove(sameCase)));
    const tombstone: Case = {
      id: c.id, code: c.code, state: "closed", patientName: "", hospitalName: c.hospitalName, hospitalCcn: c.hospitalCcn,
      ownerId: c.ownerId, fixtureKey: c.fixtureKey, consent: null, income: null, steps: [],
      createdAt: c.createdAt, updatedAt: now, deletedAt: now,
    };
    await this.cases.put(tombstone);
    return tombstone;
  }
}
