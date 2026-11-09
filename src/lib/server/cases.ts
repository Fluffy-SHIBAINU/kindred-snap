import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SyntheticBlueButton } from "@/lib/adapters/claims/synthetic";
import { selectExtractor, validateExtraction, type ExtractKind } from "@/lib/adapters/extract";
import { sha256, type IndexEntry } from "@/lib/adapters/extract/fixture";
import type { Store } from "@/lib/adapters/store/types";
import { screenFor } from "@/lib/case/route";
import type { CaseState } from "@/lib/case/state";
import { toCents } from "@/lib/money";
import { defaultPolicyFor, type PipelineDeps } from "@/lib/pipeline";
import { getServerStore } from "@/lib/server/store";
import { walkSuffix, type WalkHints } from "@/lib/server/walk";
import { formatDate } from "@/lib/templates/facts";
import type { Case, Document, ExtractedField } from "@/lib/types";

/** Until Phase 6 there are no accounts: every caregiver action is the demo helper (the README says the demo is not private). */
export const HELPER = { id: "demo-helper", role: "helper" } as const;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 unambiguous characters, so a byte mod 32 is unbiased
export const CODE_PATTERN = /^SNAP-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

export function newCaseCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "SNAP-" + Array.from(bytes, (b) => ALPHABET[b % 32]).join("");
}

/** "snap 7k4m2d" → "SNAP-7K4M2D"; null when it cannot be a case code. */
export function normalizeCode(input: string): string | null {
  let s = input.toUpperCase().replace(/[\s-]/g, "");
  if (s.startsWith("SNAP")) s = s.slice(4);
  const code = "SNAP-" + s;
  return CODE_PATTERN.test(code) ? code : null;
}

export const now = () => new Date().toISOString();

export function pipelineDeps(): PipelineDeps {
  return { claims: new SyntheticBlueButton(), policyFor: defaultPolicyFor, now };
}

export async function getCase(id: string): Promise<{ store: Store; c: Case | null }> {
  const store = await getServerStore();
  return { store, c: await store.cases.get(id) };
}

/** The caregiver screen a case resumes at. `created` already holds its bill and waits for income, so it goes to /income rather than screenFor's /snap. */
export function hrefFor(c: { id: string; state: CaseState }, hints: WalkHints = {}): string {
  const screen = screenFor(c.state);
  const q = walkSuffix(c.id, hints);
  if (screen !== "/snap") return `/case/${c.id}${screen}${q}`;
  return c.state === "created" ? `/case/${c.id}/income${q}` : "/snap";
}

export type Upload = { bytes: Uint8Array; mime: string; fileName: string };

/** The uploaded file, or the demo bill when the form says demo=main; null when the form carries neither. */
export async function uploadFrom(formData: FormData): Promise<Upload | null> {
  if (formData.get("demo") === "main") {
    const bytes = readFileSync(join(process.cwd(), "fixtures", "documents", "bill-main.png"));
    return { bytes: new Uint8Array(bytes), mime: "image/png", fileName: "bill-main.png" };
  }
  const f = formData.get("document");
  if (!(f instanceof File) || f.size === 0) return null;
  return { bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type || "application/octet-stream", fileName: f.name || "document" };
}

/** Which fixture the bytes belong to (fixture extractor); undefined for anything else. */
export function fixtureKeyOf(bytes: Uint8Array): string | undefined {
  const index = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "documents", "index.json"), "utf8")) as IndexEntry[];
  const hash = sha256(bytes);
  return index.find((e) => e.sha256 === hash)?.fixtureKey;
}

export type Extracted = { ok: true; doc: Document } | { ok: false; reason: string };

/** Runs the extractor and shapes a readable Document for the case. Bytes are never stored: the photo stays on the phone. */
export async function extractDocument(caseId: string, kind: ExtractKind, up: Upload): Promise<Extracted> {
  const id = crypto.randomUUID();
  const { result: r } = validateExtraction(await selectExtractor(process.env).extract({ bytes: up.bytes, mime: up.mime, kind, documentId: id }));
  if (r.status === "unreadable") return { ok: false, reason: r.reason };
  if (r.status === "insufficient") return { ok: false, reason: "We could not find: " + r.missing.join(", ") + "." };
  const doc: Document = {
    id, caseId, kind, fileName: up.fileName, pages: r.pages, fields: r.fields,
    billLines: r.billLines, billTotals: r.billTotals, msnLines: r.msnLines, msnTotals: r.msnTotals, text: r.text,
    status: "readable", uploadedAt: now(),
  };
  return { ok: true, doc };
}

export async function storeDocument(store: Store, doc: Document): Promise<void> {
  await store.documents.put(doc);
  await store.appendAudit(doc.caseId, { at: doc.uploadedAt, actor: HELPER.id, role: HELPER.role, action: "document.uploaded", details: { documentId: doc.id, kind: doc.kind, fileName: doc.fileName } });
}

export const fieldValue = (fields: ExtractedField[], key: string) => fields.find((f) => f.key === key)?.value;

/** Yearly income from an income document: the first field whose key names income and parses as money. */
export function incomeCentsFrom(fields: ExtractedField[]): number | null {
  for (const f of fields) {
    if (!/income|annual|yearly/i.test(f.key)) continue;
    const cents = parseIncome(f.value);
    if (cents != null) return cents;
  }
  return null;
}

/** A typed yearly income ("37,560", "$37,560.00") as cents; null when it is not a non-negative amount. */
export function parseIncome(input: string): number | null {
  try {
    const cents = toCents(input);
    return cents >= 0 ? cents : null;
  } catch {
    return null;
  }
}

export const firstName = (name: string) => name.split(/\s+/)[0] || "the patient";

/** "2026-11-30" → "Nov 30" */
export const shortDate = (iso: string) => formatDate(iso).replace(/, \d{4}$/, "");

/** Whole days from today (UTC) to an ISO date; negative when past. */
export function daysLeft(dueIso: string, today = new Date()): number {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((Date.parse(dueIso + "T00:00:00Z") - t) / 86_400_000);
}

export function daysLeftText(n: number): string {
  return n > 1 ? `${n} days left` : n === 1 ? "1 day left" : n === 0 ? "Due today" : "Past the due date";
}
