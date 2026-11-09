import type { Action, Approval, ResponseLetter } from "@/lib/types";

/** The case figures the simulated letter is written from; every one must already be present in the case. */
export type ResponseFacts = {
  patientName: string;
  removedLineCents: number;
  removedLineLabel: string;
  tierPercent: number | null;
  askedCents: number;
  correctedCents: number;
};

/** The only kind in this build is the synthetic demo partner; there is no live hospital connector (CLAUDE.md rule 2). */
export interface HospitalConnector {
  kind: "demo_partner_synthetic";
  /** Marks an approved action as sent, simulated. Throws NotApproved without `approval.approvedAt`, ExternalActionRefused outside simulated mode. */
  send(action: Action, approval: Approval | undefined, now: string): Promise<{ simulated: true; sentAt: string }>;
  /** The hospital's simulated reply, null until enough days have passed since `sentAt`. */
  response(input: { caseId: string; sentAt: string; now: string; facts: ResponseFacts }): Promise<ResponseLetter | null>;
}

export class NotApproved extends Error {}
