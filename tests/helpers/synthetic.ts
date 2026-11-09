import { readFileSync } from "node:fs";
import { toCents } from "@/lib/money";
import type { BillLine, BillTotals, MsnLine, MsnTotals, SourceRef } from "@/lib/types";

type Raw = {
  bill: {
    service_date: string;
    statement_date: string;
    due_date: string;
    lines: Array<{ n: number; code: string; description: string; charge: number }>;
    total_charges: number;
    adjustments: number;
    insurance_paid: number;
    patient_owes: number;
  };
  msn: {
    period: string;
    lines: Array<{ n: number; service: string; billed: number; approved: number; medicare_paid: number; you_may_be_billed: number; note: string }>;
    max_you_may_be_billed: number;
  };
};

const raw = JSON.parse(readFileSync("fixtures/case-synthetic.json", "utf8")) as Raw;
const src = (documentId: string, page: number, line: number | undefined, quote: string): SourceRef => ({ documentId, page, line, quote });
const dollars = (n: number) => "$" + n.toFixed(2);

export const billLines: BillLine[] = raw.bill.lines.map((l) => ({
  n: l.n,
  code: l.code,
  description: l.description,
  serviceDate: raw.bill.service_date,
  chargeCents: toCents(l.charge),
  source: src("doc-bill", 1, l.n, l.code + " " + l.description + " " + dollars(l.charge)),
}));

export const billTotals: BillTotals = {
  totalChargesCents: toCents(raw.bill.total_charges),
  adjustmentsCents: toCents(raw.bill.adjustments),
  insurancePaidCents: toCents(raw.bill.insurance_paid),
  patientOwesCents: toCents(raw.bill.patient_owes),
  dueDate: raw.bill.due_date,
  statementDate: raw.bill.statement_date,
  source: src("doc-bill", 1, undefined, "Patient owes " + dollars(raw.bill.patient_owes)),
};

export const msnLines: MsnLine[] = raw.msn.lines.map((m) => ({
  n: m.n,
  code: m.service.split(" ")[0],
  service: m.service,
  serviceDate: raw.bill.service_date,
  billedCents: toCents(m.billed),
  approvedCents: toCents(m.approved),
  medicarePaidCents: toCents(m.medicare_paid),
  youMayBeBilledCents: toCents(m.you_may_be_billed),
  note: m.note,
  source: src("doc-msn", 2, m.n, m.service),
}));

export const msnTotals: MsnTotals = {
  maxYouMayBeBilledCents: toCents(raw.msn.max_you_may_be_billed),
  period: raw.msn.period,
  source: src("doc-msn", 2, undefined, "Maximum You May Be Billed " + dollars(raw.msn.max_you_may_be_billed)),
};
