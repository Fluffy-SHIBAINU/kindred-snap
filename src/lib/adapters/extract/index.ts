import { GoogleGenAI } from "@google/genai";
import { FixtureExtractor } from "./fixture";
import { GeminiExtractor, type GeminiClient } from "./gemini";
import type { Extractor } from "./types";

export type { ExtractInput, ExtractKind, ExtractionOk, ExtractionResult, Extractor } from "./types";
export { FixtureExtractor, UNKNOWN_BYTES } from "./fixture";
export { GeminiExtractor, GEMINI_MODEL, buildRequest } from "./gemini";
export { validateExtraction } from "./validate";

/** Fixture unless EXTRACTOR=gemini and a key is set; the fixture adapter is the only one that reads nothing from the network. */
export function selectExtractor(env: Record<string, string | undefined> = process.env): Extractor {
  if (env.EXTRACTOR === "gemini" && env.GOOGLE_API_KEY) {
    return new GeminiExtractor(new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY }) as unknown as GeminiClient);
  }
  return new FixtureExtractor();
}
