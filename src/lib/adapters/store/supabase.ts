import { createClient } from "@supabase/supabase-js";
import type { Action, AuditEvent, Case, Consent, Document, Finding, Resolution, ResponseLetter } from "@/lib/types";
import type { Collection, Meta, Store } from "./types";

/** Next.js memoises identical GET fetches within one render; a row written moments earlier would then read back as missing. Every Supabase call gets its own signal and no-store, which opts out. */
const noMemoFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store", signal: init?.signal ?? new AbortController().signal });

type Result = PromiseLike<{ data: unknown; error: { message: string } | null }>;
type Query = Result & { eq(column: string, value: unknown): Query; order(column: string, opts?: { ascending?: boolean }): Query };
/** The slice of the supabase-js client the store uses, so tests can pass a fake. */
export type SupabaseLike = {
  from(table: string): {
    select(columns?: string): Query;
    insert(row: object): { select(columns?: string): Query };
    upsert(row: object): Result;
    delete(): { eq(column: string, value: unknown): Query };
  };
};

type Row = Record<string, unknown>;
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

async function run<T>(table: string, q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`supabase ${table}: ${error.message}`);
  return data as T;
}

/**
 * One table. `opt` are optional fields: written as null when absent (so an upsert clears them) and dropped
 * when null on read. `keepNull` are fields whose type allows null, kept as null on read.
 */
class SupaCollection<T extends object> implements Collection<T> {
  constructor(private db: SupabaseLike, private table: string, private key: string, private opt: string[] = [], private keepNull: string[] = []) {}

  toRow(item: T): Row {
    const row: Row = {};
    for (const k of this.opt) row[snake(k)] = null;
    for (const [k, v] of Object.entries(item)) row[snake(k)] = v ?? null;
    return row;
  }

  fromRow(row: Row): T {
    const out: Row = {};
    for (const [col, v] of Object.entries(row)) {
      const k = camel(col);
      if (v === null) { if (this.keepNull.includes(k)) out[k] = null; continue; }
      // bigint arrives as a string from PostgREST; timestamptz as "+00:00", normalised to the app's ISO form
      if (k.endsWith("Cents") && typeof v === "string") out[k] = Number(v);
      else if (k.endsWith("At") && typeof v === "string") out[k] = new Date(v).toISOString();
      else out[k] = v;
    }
    return out as T;
  }

  async get(id: string): Promise<T | null> {
    const rows = await run<Row[]>(this.table, this.db.from(this.table).select("*").eq(snake(this.key), id));
    return rows?.[0] ? this.fromRow(rows[0]) : null;
  }
  async list(filter?: Partial<T>): Promise<T[]> {
    let q = this.db.from(this.table).select("*");
    for (const [k, v] of Object.entries(filter ?? {})) q = q.eq(snake(k), v);
    return ((await run<Row[]>(this.table, q)) ?? []).map((r) => this.fromRow(r));
  }
  async put(item: T): Promise<void> {
    await run(this.table, this.db.from(this.table).upsert(this.toRow(item)));
  }
  async removeFor(caseId: string): Promise<void> {
    await run(this.table, this.db.from(this.table).delete().eq("case_id", caseId));
  }
}

function auditFromRow(r: Row): AuditEvent {
  const e: AuditEvent = { id: Number(r.id), caseId: r.case_id as string, at: new Date(r.at as string).toISOString(), actor: r.actor as string, role: r.role as AuditEvent["role"], action: r.action as AuditEvent["action"] };
  if (r.details != null) e.details = r.details as Record<string, unknown>;
  return e;
}

/** Server only: built with the service-role key, which bypasses RLS. Access checks live in src/lib/server/authz.ts. */
export class SupabaseStore implements Store {
  cases: SupaCollection<Case>;
  documents: SupaCollection<Document>;
  findings: SupaCollection<Finding>;
  actions: SupaCollection<Action>;
  resolutions: SupaCollection<Resolution>;
  consents: SupaCollection<Consent>;
  responses: SupaCollection<ResponseLetter>;
  meta: Meta;

  constructor(private db: SupabaseLike) {
    this.cases = new SupaCollection(db, "cases", "id", ["helperName", "hospitalCcn", "fixtureKey", "dueDate", "balanceCents", "eligibility", "sentAt", "deletedAt"], ["consent", "income"]);
    this.documents = new SupaCollection(db, "documents", "id", ["billLines", "billTotals", "msnLines", "msnTotals", "text"]);
    this.findings = new SupaCollection(db, "findings", "id", ["staffStatus", "dismissReason"], ["amountCents"]);
    this.actions = new SupaCollection(db, "actions", "id", ["approvedBy", "approvedAt", "sentAt"]);
    this.resolutions = new SupaCollection(db, "resolutions", "caseId", ["recordedBy", "recordedAt"], ["confirmedAdjustmentCents", "actualSavingsCents", "basisDocumentId"]);
    this.consents = new SupaCollection(db, "consents", "caseId");
    this.responses = new SupaCollection(db, "responses", "id", [], ["tierApplied"]);
    this.meta = {
      get: async (key) => (await run<Row[]>("meta", db.from("meta").select("value").eq("key", key)))?.[0]?.value as string | undefined,
      set: async (key, value) => void (await run("meta", db.from("meta").upsert({ key, value }))),
    };
  }

  static create(env: Record<string, string | undefined> = process.env): SupabaseStore {
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) throw new Error("STORE=supabase needs NEXT_PUBLIC_SUPABASE_URL");
    if (!key) throw new Error("STORE=supabase needs SUPABASE_SERVICE_ROLE_KEY (server only; from the Supabase dashboard, Project Settings → API Keys)");
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: noMemoFetch } });
    // the real builder's generics are wider than SupabaseLike; the calls used are the same
    return new SupabaseStore(client as unknown as SupabaseLike);
  }

  async audit(caseId: string): Promise<readonly AuditEvent[]> {
    const rows = await run<Row[]>("audit_events", this.db.from("audit_events").select("*").eq("case_id", caseId).order("id", { ascending: true }));
    return Object.freeze((rows ?? []).map(auditFromRow));
  }
  async appendAudit(caseId: string, event: Omit<AuditEvent, "id" | "caseId">): Promise<AuditEvent> {
    const row = { case_id: caseId, at: event.at, actor: event.actor, role: event.role, action: event.action, details: event.details ?? null };
    const rows = await run<Row[]>("audit_events", this.db.from("audit_events").insert(row).select("*"));
    return auditFromRow(rows[0]);
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
    // shortcut: files in the `documents` bucket are not removed; the store never writes storage_path yet
    await Promise.all([this.documents, this.findings, this.actions, this.consents, this.responses].map((col) => col.removeFor(caseId)));
    const tombstone: Case = {
      id: c.id, code: c.code, state: "closed", patientName: "deleted", hospitalName: c.hospitalName, hospitalCcn: c.hospitalCcn,
      ownerId: c.ownerId, fixtureKey: c.fixtureKey, consent: null, income: null, steps: [],
      createdAt: c.createdAt, updatedAt: now, deletedAt: now,
    };
    await this.cases.put(tombstone);
    return tombstone;
  }
}
