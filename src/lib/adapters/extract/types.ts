import type { BillLine, BillTotals, ExtractedField, MsnLine, MsnTotals } from "@/lib/types";

export type ExtractKind = "bill" | "msn" | "income";

export type ExtractInput = {
  bytes: Uint8Array;
  mime: string;
  kind: ExtractKind;
  /** id the SourceRefs point at: Gemini defaults to "doc-<kind>", the fixture extractor keeps the fixture's own ids when none is given */
  documentId?: string;
};

export type ExtractionOk = {
  status: "ok";
  fields: ExtractedField[];
  lines: BillLine[] | MsnLine[];
  pages: number;
  billLines?: BillLine[];
  billTotals?: BillTotals;
  msnLines?: MsnLine[];
  msnTotals?: MsnTotals;
  text?: string;
};

export type ExtractionResult =
  | ExtractionOk
  | { status: "unreadable"; reason: string }
  | { status: "insufficient"; missing: string[] };

export interface Extractor {
  extract(input: ExtractInput): Promise<ExtractionResult>;
}
