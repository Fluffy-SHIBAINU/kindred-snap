import type { CaseState } from "@/lib/case/state";

export type Role = "patient" | "helper" | "staff" | "admin" | "system";
export type Actor = { id: string; role: Role; name?: string };

export type SourceRef = {
  documentId: string;
  page: number;
  line?: number;
  quote: string;
  /** normalised 0–1000, [ymin, xmin, ymax, xmax]; approximate when it comes from the model */
  bbox?: [number, number, number, number];
};

export type ExtractedField = {
  key: string;
  value: string;
  originalValue: string;
  editedBy?: string;
  editedAt?: string;
  source: SourceRef;
  confidence: number;
};

export type BillLine = { n: number; code: string; description: string; serviceDate: string; chargeCents: number; source: SourceRef };

export type MsnLine = {
  n: number;
  code: string;
  service: string;
  serviceDate: string;
  billedCents: number;
  approvedCents: number;
  medicarePaidCents: number;
  youMayBeBilledCents: number;
  note?: string;
  source: SourceRef;
};

export type BillTotals = { totalChargesCents: number; adjustmentsCents: number; insurancePaidCents: number; patientOwesCents: number; dueDate: string; statementDate: string; source: SourceRef };
export type MsnTotals = { maxYouMayBeBilledCents: number; period: string; source: SourceRef };

export type DocumentKind = "bill" | "msn" | "income" | "response_letter";
export type Document = {
  id: string;
  caseId: string;
  kind: DocumentKind;
  fileName: string;
  pages: number;
  fields: ExtractedField[];
  billLines?: BillLine[];
  billTotals?: BillTotals;
  msnLines?: MsnLine[];
  msnTotals?: MsnTotals;
  text?: string;
  status: "readable" | "unreadable" | "pending";
  uploadedAt: string;
};

export type FindingKind = "patient_owes_exceeds_notice" | "line_not_patient_responsibility" | "possible_duplicate" | "no_discrepancy" | "insufficient_information";
export type Finding = {
  id: string;
  caseId: string;
  kind: FindingKind;
  amountCents: number | null;
  confidence: "likely" | "possible" | "insufficient";
  explanation: string;
  evidence: SourceRef[];
  requiresReview: boolean;
  staffStatus?: "confirmed" | "dismissed";
  dismissReason?: string;
};

export type Eligibility = {
  fplPercent: number | null;
  status: "free" | "discount" | "none" | "unknown";
  discountPercent: number | null;
  quote: string | null;
  sourceUrl: string | null;
  hospitalCcn: string | null;
  basis: "atlas" | "synthetic_policy" | "none";
};

export type ActionKind = "correction_request" | "information_request" | "assistance_application";
export type Action = {
  id: string;
  caseId: string;
  kind: ActionKind;
  title: string;
  draft: string;
  status: "drafted" | "approved" | "sent_simulated" | "responded";
  approvedBy?: string;
  approvedAt?: string;
  sentAt?: string;
  /** every dollar figure in the draft, each proven present in the case before display */
  validatedNumbers: string[];
};

export type Resolution = {
  caseId: string;
  estimatedOpportunityCents: number;
  confirmedAdjustmentCents: number | null;
  actualSavingsCents: number | null;
  basisDocumentId: string | null;
  recordedBy?: string;
  recordedAt?: string;
};

export type AuditAction =
  | "case.created" | "case.viewed" | "case.deleted" | "document.uploaded" | "field.edited" | "finding.confirmed" | "finding.dismissed"
  | "consent.granted" | "action.drafted" | "action.approved" | "action.sent_simulated" | "response.received_simulated" | "resolution.recorded" | "state.changed";
export type AuditEvent = { id: number; caseId: string; at: string; actor: string; role: Role; action: AuditAction; details?: Record<string, unknown> };

export type Consent = { caseId: string; grantedAt: string; grantedBy: string; role: "patient" | "helper"; scope: string };
export type Approval = { approvedBy: string; approvedAt: string; role: "patient" | "helper" };

export type StepStatus = "done" | "active" | "waiting" | "needs_you";
/** One row of the progress feed; titles come from docs/mocks/M03-working.dc.html */
export type Step = { key: string; title: string; status: StepStatus; summary: string };

export type ResponseLetter = { id: string; caseId: string; text: string; quotedLine: string; tierApplied: number | null; newBalanceCents: number; receivedAt: string; simulated: true };

export type PolicyField<T> = { value: T; quote: string | null; sourceUrl: string | null; checkedOn: string | null };
export type PolicyTier = { maxFplInclusive: number; discountPercent: number };
export type Policy = {
  basis: "atlas" | "synthetic_policy";
  hospitalCcn: string | null;
  hospitalName: string;
  freeCareMaxFpl: PolicyField<number | null>;
  tiers: PolicyField<PolicyTier[]>;
  windowDays: PolicyField<number | null>;
  phone: PolicyField<string | null>;
  formUrl: PolicyField<string | null>;
};

export type Case = {
  id: string;
  code: string;
  state: CaseState;
  patientName: string;
  helperName?: string;
  hospitalName: string;
  hospitalCcn?: string;
  ownerId: string;
  /** which fixture produced this case's documents (fixture extractor); absent for live extraction */
  fixtureKey?: string;
  consent: Consent | null;
  income: { annualCents: number; householdSize: number; source: "typed" | "document" } | null;
  dueDate?: string;
  balanceCents?: number;
  steps: Step[];
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
};
