import { findDiscrepancies } from "@/lib/compare";
import { tierFor } from "@/lib/eligibility";
import { loadCaseFixture } from "@/lib/fixtures";
import { fplPercent } from "@/lib/fpl";
import { formatUsd } from "@/lib/money";
import { riverbendPolicy } from "@/lib/pipeline";
import { estimateOpportunity } from "@/lib/savings";
import type { BillLine, BillTotals, MsnLine, MsnTotals } from "@/lib/types";
import { DemoBadge } from "@/components/snap/Badges";
import { Clipping } from "@/components/snap/Clipping";
import { DueAlert } from "@/components/snap/DueAlert";
import { MoneyBlock } from "@/components/snap/MoneyBlock";

// The synthetic demo household (same as tests/pipeline.test.ts): $37,560 for one person, about 235% of the guideline.
const DEMO_INCOME = { annualCents: 3756000, householdSize: 1 };

const short = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The demo case's result, computed from the fixture with the same functions the pipeline uses. No store. */
export function demoResult() {
  const fx = loadCaseFixture("main");
  const bill = fx.documents.find((d) => d.kind === "bill") as unknown as { billLines: BillLine[]; billTotals: BillTotals };
  const msn = fx.documents.find((d) => d.kind === "msn") as unknown as { msnLines: MsnLine[]; msnTotals: MsnTotals };
  const findings = findDiscrepancies({ caseId: fx.case.id, bill: { lines: bill.billLines, totals: bill.billTotals }, msn: { lines: msn.msnLines, totals: msn.msnTotals } });
  const flagged = findings.find((f) => f.kind === "line_not_patient_responsibility");
  const billLine = bill.billLines.find((l) => l.n === flagged?.evidence[0]?.line);
  const msnLine = msn.msnLines.find((l) => l.n === flagged?.evidence[1]?.line);
  if (!flagged || !billLine || !msnLine) throw new Error("Demo fixture no longer shows the flagged line");
  const eligibility = tierFor(riverbendPolicy(), fplPercent(DEMO_INCOME.annualCents, DEMO_INCOME.householdSize));
  const estimate = estimateOpportunity(findings, eligibility, bill.billTotals.patientOwesCents);
  const corrected = bill.billTotals.patientOwesCents - billLine.chargeCents;
  return {
    firstName: (fx.case.patientName ?? "").split(" ")[0],
    hospital: (fx.case.hospitalName ?? "").split(" ")[0],
    percent: eligibility.discountPercent ?? 0,
    billLine,
    msnLine,
    owesCents: bill.billTotals.patientOwesCents,
    allowedCents: msn.msnTotals.maxYouMayBeBilledCents,
    estimate,
    correctedCents: corrected,
    statementDate: bill.billTotals.statementDate,
    dueDate: bill.billTotals.dueDate,
  };
}

const mono = "font-mono [font-variant-numeric:tabular-nums]";

/**
 * A static picture of the M04 result screen for the landing hero. It is a figure, not a page:
 * its headings are styled text so the landing keeps one h1, and its controls are not interactive.
 */
export default function ResultPreview() {
  const r = demoResult();
  const removed = formatUsd(r.billLine.chargeCents);
  const off = formatUsd(r.estimate.cents - r.billLine.chargeCents);
  return (
    <figure className="m-0 flex h-full flex-col bg-paper text-ink" aria-label={`Preview of a case result: ${r.firstName} may get ${r.percent}% off`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-6 pb-1 pt-2">
        <span className="text-lg font-extrabold tracking-[-0.02em]">Kindred Snap</span>
        <DemoBadge />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-6 pb-2">
        <p className="text-2xl font-bold leading-[1.15] tracking-[-0.01em]">
          {r.firstName} May Get {r.percent}% Off
        </p>
        <p className="text-xl font-bold leading-[1.15] tracking-[-0.01em]">
          And <span className={mono}>{removed}</span> of This Bill May Not Be Hers to Pay
        </p>
        <div className="flex flex-col gap-2">
          <Clipping line={`Bill line ${r.billLine.n}, contrast dye`} amount={removed} source={`Bill, page ${r.billLine.source.page}, line ${r.billLine.n} (${r.billLine.code}), statement ${short(r.statementDate)}`} />
          <Clipping line={`Medicare line ${r.msnLine.n}, you may be billed`} amount={formatUsd(r.msnLine.youMayBeBilledCents)} source={`Medicare notice, line ${r.msnLine.n} (${r.msnLine.code}): 'may not bill you separately for it.'`} />
        </div>
        <MoneyBlock amountCents={r.estimate.cents} kind="estimated" note={`Estimated. ${r.hospital} decides. ${removed} removed + ${off} off ${formatUsd(r.correctedCents)}.`} />
        <p className="text-sm text-muted">One tap sends both letters to {r.hospital}.</p>
        <DueAlert>
          Bill due {short(r.dueDate)}. We ask {r.hospital} to hold the account while they review.
        </DueAlert>
      </div>
      <div className="flex flex-col gap-2 border-t border-rule bg-paper px-6 pb-7 pt-3" aria-hidden="true">
        <span className="flex min-h-14 items-center justify-center rounded-input bg-accent px-5 font-medium text-accent-ink shadow-[0_0_0_1px_var(--color-accent-deep),0_3px_0_var(--color-accent-deep)]">
          Draft the letters and send
        </span>
        <span className="flex min-h-12 items-center justify-center font-medium underline underline-offset-[0.16em]">Show the letters first</span>
      </div>
    </figure>
  );
}
