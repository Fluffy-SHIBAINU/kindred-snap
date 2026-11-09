import { readFileSync } from "node:fs";
import type { Document } from "@/lib/types";
import { ConnectorUnavailable, type ClaimsConnector, type ClaimsState } from "./types";

export type CaseFixture = { documents: Document[] };

const CONNECTOR_DOWN_KEY = "edge-connector-down";
const NO_NOTICE_KEY = "edge-missing-notice";
const SAFE_KEY = /^[a-z0-9-]+$/;

/** Default loader: `fixtures/cases/<key>.json`, relative to the project root (where vitest and next run). */
export function loadCaseFixture(key: string): CaseFixture {
  if (!SAFE_KEY.test(key)) throw new Error(`Not a fixture key: ${key}`);
  return JSON.parse(readFileSync(`fixtures/cases/${key}.json`, "utf8")) as CaseFixture;
}

/**
 * Synthetic stand-in for CMS Blue Button 2.0. It never contacts CMS; it serves the fixture notice
 * for the case's fixture key and reports an honest `unavailable` state when told to be down.
 */
export class SyntheticBlueButton implements ClaimsConnector {
  readonly kind = "synthetic_bluebutton" as const;
  private readonly forceDown: boolean;
  private readonly loadFixture: (key: string) => CaseFixture;

  constructor(opts: { forceDown?: boolean; loadFixture?: (key: string) => CaseFixture } = {}) {
    this.forceDown = opts.forceDown ?? false;
    this.loadFixture = opts.loadFixture ?? loadCaseFixture;
  }

  private down(): boolean {
    return this.forceDown || process.env.CLAIMS_FORCE_DOWN === "1";
  }

  async state(): Promise<ClaimsState> {
    return this.down() ? "unavailable" : "connected";
  }

  async fetchNotice(ref: { caseId: string; fixtureKey?: string }): Promise<Document | null> {
    const key = ref.fixtureKey ?? "main";
    if (this.down() || key === CONNECTOR_DOWN_KEY) throw new ConnectorUnavailable("Medicare's connection isn't responding right now (synthetic)");
    if (key === NO_NOTICE_KEY) return null;
    const msn = this.loadFixture(key).documents.find((d) => d.kind === "msn");
    // the fixture's notice is re-homed on the live case (id and caseId) so two cases from one fixture never overwrite each other's notice
    return msn ? { ...msn, id: `${ref.caseId}-msn`, caseId: ref.caseId } : null;
  }
}
