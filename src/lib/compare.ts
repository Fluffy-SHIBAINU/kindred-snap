import type { BillLine, BillTotals, Finding, MsnLine, MsnTotals, SourceRef } from "@/lib/types";

export type Match = { bill?: BillLine; msn?: MsnLine; how: "code_date" | "description" | "unmatched" };
export type ArithmeticCheck = { check: string; ok: boolean; expectedCents: number; actualCents: number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Pair bill lines with notice lines: same code and service date first, then a description match, else unmatched. */
export function matchLines(bill: BillLine[], msn: MsnLine[]): Match[] {
  const left = [...msn];
  const out: Match[] = [];
  for (const b of bill) {
    let i = left.findIndex((m) => m.code === b.code && m.serviceDate === b.serviceDate);
    let how: Match["how"] = "code_date";
    if (i < 0) {
      const nb = norm(b.description);
      i = left.findIndex((m) => { const nm = norm(m.service); return nm === nb || nm.includes(nb) || nb.includes(nm); });
      how = "description";
    }
    if (i < 0) out.push({ bill: b, how: "unmatched" });
    else out.push({ bill: b, msn: left.splice(i, 1)[0], how });
  }
  for (const m of left) out.push({ msn: m, how: "unmatched" });
  return out;
}

/** Deterministic checks on the bill's own figures. Never a judgement, only sums. */
export function arithmetic(totals: BillTotals, lines: BillLine[]): ArithmeticCheck[] {
  const sum = lines.reduce((a, l) => a + l.chargeCents, 0);
  const owes = totals.totalChargesCents - totals.adjustmentsCents - totals.insurancePaidCents;
  return [
    { check: "line charges add up to total charges", ok: sum === totals.totalChargesCents, expectedCents: totals.totalChargesCents, actualCents: sum },
    { check: "patient owes equals total minus adjustments minus insurance paid", ok: owes === totals.patientOwesCents, expectedCents: totals.patientOwesCents, actualCents: owes },
  ];
}

export function findDiscrepancies(input: {
  caseId: string;
  bill: { lines: BillLine[]; totals: BillTotals };
  msn: { lines: MsnLine[]; totals: MsnTotals } | null;
}): Finding[] {
  const { caseId, bill, msn } = input;
  let n = 0;
  const id = () => `${caseId}-f${++n}`;
  const findings: Finding[] = [];

  // (b) duplicate-looking lines: same code, same day. May be legitimate; a person decides.
  const seen = new Map<string, BillLine>();
  for (const l of bill.lines) {
    const k = `${l.code}|${l.serviceDate}`;
    const prev = seen.get(k);
    if (prev) {
      findings.push({
        id: id(), caseId, kind: "possible_duplicate", amountCents: l.chargeCents, confidence: "possible", requiresReview: true,
        explanation: `Lines ${prev.n} and ${l.n} both bill ${l.code} on ${l.serviceDate}. Two charges can be correct (two separate services); a billing specialist should check before anything is asked.`,
        evidence: [prev.source, l.source],
      });
    } else seen.set(k, l);
  }

  if (!msn) {
    findings.push({
      id: id(), caseId, kind: "insufficient_information", amountCents: null, confidence: "insufficient", requiresReview: false,
      explanation: "We have the bill but not Medicare's notice for this visit, so we cannot say yet what the patient should pay.",
      evidence: [bill.totals.source],
    });
    return findings;
  }

  const gap = bill.totals.patientOwesCents - msn.totals.maxYouMayBeBilledCents;
  if (gap > 0) {
    const matches = matchLines(bill.lines, msn.lines);
    const culprit = matches.find((m) => m.bill && m.msn && m.bill.chargeCents === gap && m.msn.youMayBeBilledCents === 0);
    const evidence: SourceRef[] = [bill.totals.source, msn.totals.source];
    if (culprit?.bill && culprit.msn) {
      findings.push({
        id: id(), caseId, kind: "patient_owes_exceeds_notice", amountCents: gap, confidence: "likely", requiresReview: false,
        explanation: `The bill asks the patient for ${usd(bill.totals.patientOwesCents)}; Medicare's notice says the most the patient may be billed is ${usd(msn.totals.maxYouMayBeBilledCents)}. The ${usd(gap)} gap equals line ${culprit.bill.n} exactly.`,
        evidence: [...evidence, culprit.bill.source, culprit.msn.source],
      });
      findings.push({
        id: id(), caseId, kind: "line_not_patient_responsibility", amountCents: culprit.bill.chargeCents, confidence: "likely", requiresReview: false,
        explanation: `Line ${culprit.bill.n} (${culprit.bill.code}) appears on the bill at ${usd(culprit.bill.chargeCents)}, while the notice shows ${usd(0)} the patient may be billed for the same service${culprit.msn.note ? ` and says: "${culprit.msn.note}"` : ""}. A later corrected claim could change this.`,
        evidence: [culprit.bill.source, culprit.msn.source],
      });
    } else {
      findings.push({
        id: id(), caseId, kind: "patient_owes_exceeds_notice", amountCents: gap, confidence: "possible", requiresReview: true,
        explanation: `The bill asks ${usd(bill.totals.patientOwesCents)} where Medicare's notice allows ${usd(msn.totals.maxYouMayBeBilledCents)}, a gap of ${usd(gap)} that no single line explains. A billing specialist should look before anything is asked.`,
        evidence,
      });
    }
  } else if (findings.length === 0) {
    findings.push({
      id: id(), caseId, kind: "no_discrepancy", amountCents: null, confidence: "likely", requiresReview: false,
      explanation: `The bill asks ${usd(bill.totals.patientOwesCents)} and Medicare's notice allows up to ${usd(msn.totals.maxYouMayBeBilledCents)}. The two agree.`,
      evidence: [bill.totals.source, msn.totals.source],
    });
  }
  return findings;
}

function usd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
