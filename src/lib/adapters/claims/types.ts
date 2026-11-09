import type { Document } from "@/lib/types";

/** `not_configured` is reserved for a build that has production Blue Button access; nothing returns it here. */
export type ClaimsState = "connected" | "unavailable" | "not_configured";

/** The only kind in this build is synthetic. No sandbox or live connector exists (CLAUDE.md rule 2). */
export interface ClaimsConnector {
  kind: "synthetic_bluebutton";
  state(): Promise<ClaimsState>;
  /** The Medicare Summary Notice for a case, null when Medicare has no notice on record. Throws ConnectorUnavailable when the connection is down. */
  fetchNotice(ref: { caseId: string; fixtureKey?: string }): Promise<Document | null>;
}

export class ConnectorUnavailable extends Error {}
