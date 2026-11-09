import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FixtureExtractor, TOO_DARK, UNKNOWN_BYTES, type IndexEntry } from "@/lib/adapters/extract/fixture";
import { GEMINI_MODEL, GeminiExtractor, buildRequest, type GeminiRequest } from "@/lib/adapters/extract/gemini";
import { selectExtractor } from "@/lib/adapters/extract";
import type { ExtractionOk } from "@/lib/adapters/extract/types";
import { validateExtraction } from "@/lib/adapters/extract/validate";
import { billLines, billTotals } from "./helpers/synthetic";

const INDEX = "fixtures/documents/index.json";
const index: IndexEntry[] = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf8")) : [];
const mainBill = index.find((e) => e.kind === "bill" && e.fixtureKey === "main");
const dark = index.find((e) => e.unreadable || e.fixtureKey === "edge-unreadable");
const bytesOf = (e: IndexEntry) => new Uint8Array(readFileSync("fixtures/documents/" + e.file));

describe("FixtureExtractor", () => {
  const fx = new FixtureExtractor();

  it.skipIf(!mainBill)("returns the synthetic bill for the demo bill bytes", async () => {
    const r = await fx.extract({ bytes: bytesOf(mainBill!), mime: "image/png", kind: "bill" });
    expect(r.status).toBe("ok");
    const ok = r as ExtractionOk;
    expect(ok.billTotals?.patientOwesCents).toBe(46600);
    expect(ok.billLines?.find((l) => l.code === "Q9967")?.chargeCents).toBe(24000);
    expect(ok.lines).toBe(ok.billLines);
  });

  it.skipIf(!mainBill)("points every SourceRef at the caller's document id when one is given", async () => {
    const r = (await fx.extract({ bytes: bytesOf(mainBill!), mime: "image/png", kind: "bill", documentId: "doc-42" })) as ExtractionOk;
    const refs = [...r.fields, ...(r.billLines ?? []), r.billTotals!].map((x) => x.source.documentId);
    expect(new Set(refs)).toEqual(new Set(["doc-42"]));
  });

  it.skipIf(!mainBill)("is insufficient when the case has no document of the asked kind", async () => {
    const r = await fx.extract({ bytes: bytesOf(mainBill!), mime: "image/png", kind: "income" });
    expect(r).toEqual({ status: "insufficient", missing: ["income document"] });
  });

  it.skipIf(!dark)("reports a too-dark photo", async () => {
    const r = await fx.extract({ bytes: bytesOf(dark!), mime: "image/png", kind: "bill" });
    expect(r).toEqual({ status: "unreadable", reason: TOO_DARK });
  });

  it("returns unreadable with the demo-only copy for unknown bytes", async () => {
    const r = await fx.extract({ bytes: crypto.getRandomValues(new Uint8Array(64)), mime: "image/jpeg", kind: "bill" });
    expect(r).toEqual({ status: "unreadable", reason: UNKNOWN_BYTES });
  });
});

const dollars = (c: number) => (c / 100).toFixed(2);
const canned = (patientOwes: string | null) => ({
  pages: 1,
  fields: [{ key: "patient_owes", value: patientOwes ?? "", confidence: 0.97, page: 1, quote: "Patient owes " + patientOwes }],
  lines: billLines.map((l) => ({ n: l.n, code: l.code, description: l.description, serviceDate: l.serviceDate, charge: dollars(l.chargeCents), page: 1, quote: l.source.quote })),
  totals: {
    totalCharges: dollars(billTotals.totalChargesCents), adjustments: dollars(billTotals.adjustmentsCents), insurancePaid: dollars(billTotals.insurancePaidCents),
    patientOwes, dueDate: billTotals.dueDate, statementDate: billTotals.statementDate, page: 1, quote: billTotals.source.quote,
  },
});
const fake = (json: unknown) => {
  const calls: GeminiRequest[] = [];
  return { calls, client: { models: { generateContent: async (req: GeminiRequest) => { calls.push(req); return { text: JSON.stringify(json) }; } } } };
};
const input = { bytes: new Uint8Array([1, 2, 3]), mime: "image/png", kind: "bill" as const };

describe("GeminiExtractor", () => {
  it("converts a canned response to cents with the model, temperature 0 and a JSON schema", async () => {
    const { client, calls } = fake(canned("466.00"));
    const r = await new GeminiExtractor(client).extract(input);
    expect(r.status).toBe("ok");
    const ok = r as ExtractionOk;
    expect(ok.billTotals).toMatchObject({ patientOwesCents: 46600, totalChargesCents: billTotals.totalChargesCents, dueDate: "2026-11-30" });
    expect(ok.billLines?.map((l) => l.chargeCents)).toEqual(billLines.map((l) => l.chargeCents));
    expect(ok.billLines?.[0].source).toMatchObject({ documentId: "doc-bill", page: 1, line: 1 });
    expect(calls[0]).toMatchObject({ model: GEMINI_MODEL, config: { temperature: 0, responseMimeType: "application/json" } });
    expect(calls[0].config.responseJsonSchema).toMatchObject({ type: "object" });
  });

  it("returns insufficient, never a filled value, when a total is missing", async () => {
    const r = await new GeminiExtractor(fake(canned(null)).client).extract(input);
    expect(r).toEqual({ status: "insufficient", missing: ["patient owes"] });
  });

  it("returns unreadable when the model output is not JSON", async () => {
    const client = { models: { generateContent: async () => ({ text: "I cannot read this" }) } };
    const r = await new GeminiExtractor(client).extract(input);
    expect(r.status).toBe("unreadable");
  });

  it("places document content only in the inlineData part, never in the prompt text", () => {
    const text = readFileSync("fixtures/documents/injection.txt", "utf8");
    expect(text).toContain("ignore previous instructions");
    const req = buildRequest({ bytes: new Uint8Array(Buffer.from(text)), mime: "text/plain", kind: "bill" });
    const parts = req.contents.flatMap((c) => c.parts);
    const prompt = parts.filter((p): p is { text: string } => "text" in p).map((p) => p.text).join("\n");
    const inline = parts.filter((p): p is { inlineData: { mimeType: string; data: string } } => "inlineData" in p);
    expect(prompt.toLowerCase()).not.toContain("ignore previous instructions");
    expect(prompt).not.toContain("1,480.00");
    expect(inline).toHaveLength(1);
    expect(Buffer.from(inline[0].inlineData.data, "base64").toString("utf8")).toBe(text);
    expect(JSON.stringify(req.config)).not.toContain("ignore previous");
  });
});

describe("validateExtraction", () => {
  const field = (key: string) => ({ key, value: "x", originalValue: "x", confidence: 0.95, source: billTotals.source });
  const ok: ExtractionOk = { status: "ok", pages: 1, lines: billLines, billLines, billTotals, fields: [field("total_charges"), field("patient_owes"), field("line_3_charge"), field("due_date")] };

  it("leaves a consistent bill alone", () => {
    const { result, checks } = validateExtraction(ok);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(result).toBe(ok);
  });

  it("lowers confidence to 0.5 only on the fields a failing check involves", () => {
    const broken: ExtractionOk = { ...ok, billTotals: { ...billTotals, totalChargesCents: billTotals.totalChargesCents + 100 } };
    const { result, checks } = validateExtraction(broken);
    expect(checks.map((c) => c.ok)).toEqual([false, false]);
    const conf = Object.fromEntries((result as ExtractionOk).fields.map((f) => [f.key, f.confidence]));
    expect(conf).toEqual({ total_charges: 0.5, patient_owes: 0.5, line_3_charge: 0.5, due_date: 0.95 });
  });

  it("passes non-ok results through", () => {
    const r = { status: "unreadable" as const, reason: "x" };
    expect(validateExtraction(r)).toEqual({ result: r, checks: [] });
  });
});

describe("selectExtractor", () => {
  it("defaults to the fixture adapter and needs both EXTRACTOR=gemini and a key for Gemini", () => {
    expect(selectExtractor({})).toBeInstanceOf(FixtureExtractor);
    expect(selectExtractor({ EXTRACTOR: "gemini" })).toBeInstanceOf(FixtureExtractor);
    expect(selectExtractor({ EXTRACTOR: "fixture", GOOGLE_API_KEY: "k" })).toBeInstanceOf(FixtureExtractor);
    expect(selectExtractor({ EXTRACTOR: "gemini", GOOGLE_API_KEY: "k" })).toBeInstanceOf(GeminiExtractor);
  });
});
