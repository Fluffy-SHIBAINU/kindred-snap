import type { Action, AuditEvent, Case, Consent, Document, Finding, Resolution, ResponseLetter } from "@/lib/types";

/** One keyed collection. `list(filter)` matches every given field by equality (for example `{ caseId }`). */
export type Collection<T> = {
  get(id: string): Promise<T | null>;
  list(filter?: Partial<T>): Promise<T[]>;
  put(item: T): Promise<void>;
};

export type Meta = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
};

/**
 * Everything the app persists. Cases, documents, findings, actions and responses are keyed by `id`;
 * resolutions and consents by `caseId` (one per case). The audit log is append-only and survives deletion.
 */
export type Store = {
  cases: Collection<Case>;
  documents: Collection<Document>;
  findings: Collection<Finding>;
  actions: Collection<Action>;
  resolutions: Collection<Resolution>;
  consents: Collection<Consent>;
  responses: Collection<ResponseLetter>;
  /** string key-values, used by the demo clock */
  meta: Meta;

  audit(caseId: string): Promise<readonly AuditEvent[]>;
  appendAudit(caseId: string, event: Omit<AuditEvent, "id" | "caseId">): Promise<AuditEvent>;

  ownerOf(caseId: string): Promise<string | null>;
  listCases(): Promise<Case[]>;
  documentsFor(caseId: string): Promise<Document[]>;
  findingsFor(caseId: string): Promise<Finding[]>;
  actionsFor(caseId: string): Promise<Action[]>;

  /**
   * Removes the case's documents, findings, actions, consent and response letters and blanks the personal
   * fields on the case, leaving a tombstone `{ id, state: 'closed', deletedAt }`. The audit log is kept.
   * The caller writes the `case.deleted` audit event (it knows the actor). Returns the tombstone, or null when unknown.
   */
  deleteCaseData(caseId: string, now?: string): Promise<Case | null>;
};
