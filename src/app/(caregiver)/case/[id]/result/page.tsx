import { notFound, redirect } from "next/navigation";
import { ActionBar } from "@/components/snap/ActionBar";
import { SimulatedBadge } from "@/components/snap/Badges";
import { Clipping, Highlight } from "@/components/snap/Clipping";
import { DueAlert } from "@/components/snap/DueAlert";
import { CheckIcon } from "@/components/snap/icons";
import { MoneyBlock } from "@/components/snap/MoneyBlock";
import { PrimaryAction } from "@/components/snap/PrimaryAction";
import { TalkToPerson } from "@/components/snap/TalkToPerson";
import { TEXT_CLASS, TextAction } from "@/components/snap/TextAction";
import { matchLines } from "@/lib/compare";
import { formatUsd } from "@/lib/money";
import { estimateOpportunity } from "@/lib/savings";
import { firstName, getCase, hrefFor, shortDate } from "@/lib/server/cases";
import { getServerStore } from "@/lib/server/store";
import { ensureWalkCase, parseWalkHints } from "@/lib/server/walk";
import type { Action, Case, Document } from "@/lib/types";
import { approveAndSendAction, closeCaseAction } from "./actions";

export const instant = false;

const SUMMARY = TEXT_CLASS + " cursor-pointer list-none [&::-webkit-details-marker]:hidden";

/** Mock M04 (a discrepancy) and E03 (the bill matches the notice): what the app found and the one tap that sends the letters. */
export default async function ResultPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const hints = parseWalkHints(await searchParams);
  await ensureWalkCase(await getServerStore(), id, hints);
  const { store, c } = await getCase(id);
  if (!c) notFound();
  if (c.state !== "ready_to_send") redirect(hrefFor(c, hints));

  const [docs, findings, actions] = await Promise.all([store.documentsFor(id), store.findingsFor(id), store.actionsFor(id)]);
  const bill = docs.find((d) => d.kind === "bill");
  const msn = docs.find((d) => d.kind === "msn");
  const flagged = findings.find((f) => f.kind === "line_not_patient_responsibility");
  const billLine = flagged ? bill?.billLines?.find((l) => l.n === flagged.evidence[0]?.line) : undefined;
  const msnLine = flagged ? msn?.msnLines?.find((l) => l.n === flagged.evidence[1]?.line) : undefined;
  const gap = findings.filter((f) => f.kind === "patient_owes_exceeds_notice" && !f.requiresReview).reduce((a, f) => a + (f.amountCents ?? 0), 0);
  const estimate = estimateOpportunity(findings, c.eligibility ?? null, c.balanceCents ?? 0);
  const name = firstName(c.patientName);
  const e = c.eligibility;
  const reduction = estimate.cents - gap;
  const corrected = Math.max(0, (c.balanceCents ?? 0) - gap);
  const estimateNote = [gap > 0 ? `${formatUsd(gap)} removed` : "", reduction > 0 ? `${formatUsd(reduction)} off ${formatUsd(corrected)}` : ""].filter(Boolean).join(" + ");

  const approve = approveAndSendAction.bind(null, id, hints);
  const close = closeCaseAction.bind(null, id);

  const body = gap > 0 && billLine && msnLine ? (
    <>
      <h1>
        {e?.status === "free" ? `${name} May Qualify for Free Care` : e?.status === "discount" ? `${name} May Get ${e.discountPercent}% Off` : `We Found ${formatUsd(gap)} You May Not Owe`}
      </h1>
      <h2>
        And <span className="font-mono [font-variant-numeric:tabular-nums]">{formatUsd(gap)}</span> of This Bill May Not Be {name}&rsquo;s to Pay
      </h2>
      <div className="flex flex-col gap-2">
        <Clipping
          line={`Bill line ${billLine.n}, ${billLine.description}`}
          amount={formatUsd(billLine.chargeCents)}
          source={`Bill, page ${billLine.source.page}, line ${billLine.n} (${billLine.code})${bill?.billTotals ? `, statement ${shortDate(bill.billTotals.statementDate)}` : ""}`}
        />
        <Clipping
          line={`Medicare line ${msnLine.n}, you may be billed`}
          amount={formatUsd(msnLine.youMayBeBilledCents)}
          source={
            <>
              <SimulatedBadge />
              <span>
                Medicare notice, line {msnLine.n} ({msnLine.code}){msnLine.note ? `: ‘${msnLine.note}’` : ""}
              </span>
            </>
          }
        />
      </div>
    </>
  ) : (
    <NoDiscrepancy c={c} bill={bill} msn={msn} />
  );

  return (
    <>
      <div className="flex flex-col gap-3 px-6 pb-2">
        {body}
        {estimate.cents > 0 && (
          <MoneyBlock amountCents={estimate.cents} kind="estimated" note={`Estimated. ${c.hospitalName} decides. ${estimateNote}.`} />
        )}
        {actions.length > 0 ? (
          <>
            <p className="text-sm text-muted">
              One tap sends {actions.length === 1 ? "the letter" : "both letters"} to {c.hospitalName}.
            </p>
            <details id="letters" className="flex flex-col gap-3">
              <summary className={SUMMARY}>Show the letters first</summary>
              <div className="flex flex-col gap-3 pt-2">
                {actions.map((a) => (
                  <Letter key={a.id} action={a} />
                ))}
              </div>
            </details>
          </>
        ) : (
          <p>Nothing to send. The bill agrees with the notice, and the hospital&rsquo;s help program does not apply at this income.</p>
        )}
        {c.dueDate && (
          <DueAlert>
            Bill due {shortDate(c.dueDate)}.{actions.length > 0 ? ` We ask ${c.hospitalName} to hold the account while they review.` : ""}
          </DueAlert>
        )}
      </div>
      <ActionBar>
        {actions.length > 0 ? (
          <form action={approve}>
            <PrimaryAction>{gap > 0 ? "Draft the letters and send" : "Check the help program"}</PrimaryAction>
          </form>
        ) : (
          <form action={close}>
            <PrimaryAction>Done for now</PrimaryAction>
          </form>
        )}
        {actions.length > 0 && gap === 0 && (
          <form action={close}>
            <TextAction type="submit">Done for now</TextAction>
          </form>
        )}
        <TalkToPerson code={c.code} />
      </ActionBar>
    </>
  );
}

function Letter({ action }: { action: Action }) {
  return (
    <article className="flex flex-col gap-2 rounded-card bg-white px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg leading-[1.15]">{action.title}</h3>
        <SimulatedBadge />
      </div>
      <pre className="whitespace-pre-wrap font-body text-sm leading-[1.5] text-ink-2">{action.draft}</pre>
    </article>
  );
}

/** Mock E03: every line agrees with the notice. */
function NoDiscrepancy({ c, bill, msn }: { c: Case; bill?: Document; msn?: Document }) {
  const lines = bill?.billLines ?? [];
  const matches = matchLines(lines, msn?.msnLines ?? []).filter((m) => m.bill && m.msn);
  return (
    <>
      <h1>This Bill Matches Medicare</h1>
      <p className="flex items-center gap-2">
        <CheckIcon size={24} /> {matches.length} of {lines.length} lines match
      </p>
      <div className="flex flex-col gap-2">
        {matches.map((m) => (
          <Clipping
            key={m.bill!.n}
            line={`Line ${m.bill!.n}: ${m.bill!.description} (${m.bill!.code})`}
            source={
              <>
                <SimulatedBadge />
                <span>
                  Billed {formatUsd(m.msn!.billedCents)}. Medicare approved {formatUsd(m.msn!.approvedCents)}; your share <Highlight>{formatUsd(m.msn!.youMayBeBilledCents)}</Highlight>.
                </span>
              </>
            }
          />
        ))}
      </div>
      {bill?.billTotals && msn?.msnTotals && (
        <p>
          Medicare says you may be billed <Highlight>{formatUsd(msn.msnTotals.maxYouMayBeBilledCents)}</Highlight>. {c.hospitalName} asks for <Highlight>{formatUsd(bill.billTotals.patientOwesCents)}</Highlight>. Nothing to dispute.
        </p>
      )}
      <p>{c.dueDate ? `Due ${shortDate(c.dueDate)}. ` : ""}You may still qualify for {c.hospitalName}&rsquo;s help program; we can prepare that application.</p>
    </>
  );
}
