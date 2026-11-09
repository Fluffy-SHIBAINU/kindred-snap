import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Document, SourceRef } from "@/lib/types";
import type { ExtractInput, ExtractionResult, Extractor } from "./types";

export const UNKNOWN_BYTES = "Demo only: use the demo bill or a fixture document";
export const TOO_DARK = "The photo is too dark or blurred to read.";

export type IndexEntry = { sha256: string; kind: string; fixtureKey: string; file: string; unreadable?: boolean };

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Looks the bytes up by hash and returns the matching synthetic document. Reads the JSON on each call: fixtures may be regenerated while the dev server runs. */
export class FixtureExtractor implements Extractor {
  constructor(private readonly root = join(process.cwd(), "fixtures")) {}

  async extract(input: ExtractInput): Promise<ExtractionResult> {
    const indexPath = join(this.root, "documents", "index.json");
    if (!existsSync(indexPath)) return { status: "unreadable", reason: UNKNOWN_BYTES };
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as IndexEntry[];
    const hash = sha256(input.bytes);
    const entry = index.find((e) => e.sha256 === hash);
    if (!entry) return { status: "unreadable", reason: UNKNOWN_BYTES };
    if (entry.unreadable) return { status: "unreadable", reason: TOO_DARK };

    const casePath = join(this.root, "cases", entry.fixtureKey + ".json");
    if (!existsSync(casePath)) return { status: "insufficient", missing: ["fixture case " + entry.fixtureKey] };
    const { documents } = JSON.parse(readFileSync(casePath, "utf8")) as { documents: Document[] };
    const doc = documents.find((d) => d.kind === input.kind);
    if (!doc) return { status: "insufficient", missing: [input.kind + " document"] };
    if (doc.status === "unreadable") return { status: "unreadable", reason: TOO_DARK };
    // SourceRefs point at the caller's document id, not the fixture's, so evidence resolves in the caller's store
    const home = <T extends { source: SourceRef }>(x: T): T => (input.documentId ? { ...x, source: { ...x.source, documentId: input.documentId } } : x);
    const billLines = doc.billLines?.map(home);
    const msnLines = doc.msnLines?.map(home);
    return {
      status: "ok",
      fields: doc.fields.map(home),
      lines: billLines ?? msnLines ?? [],
      pages: doc.pages,
      billLines,
      billTotals: doc.billTotals && home(doc.billTotals),
      msnLines,
      msnTotals: doc.msnTotals && home(doc.msnTotals),
      text: doc.text,
    };
  }
}
