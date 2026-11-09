import { notFound, redirect } from "next/navigation";
import { ActionBar } from "@/components/snap/ActionBar";
import { SimulatedBadge } from "@/components/snap/Badges";
import { Clipping } from "@/components/snap/Clipping";
import { MoneyBlock } from "@/components/snap/MoneyBlock";
import { PrimaryAction } from "@/components/snap/PrimaryAction";
import { TalkToPerson } from "@/components/snap/TalkToPerson";
import { TEXT_CLASS } from "@/components/snap/TextAction";
import { formatUsd } from "@/lib/money";
import { firstName, getCase, hrefFor, shortDate } from "@/lib/server/cases";
import { deleteCaseAction } from "./actions";

export const instant = false;

const SUMMARY = TEXT_CLASS + " cursor-pointer list-none [&::-webkit-details-marker]:hidden";

/** Mock M06: the hospital's (simulated) letter, the three money labels that never merge, and the delete control. */
export default async function ResolvedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store, c } = await getCase(id);
  if (!c) notFound();
  if (c.state !== "responded" && c.state !== "resolved" && c.state !== "closed") redirect(hrefFor(c));

  const letter = (await store.responses.list({ caseId: id }))[0];
  const res = await store.resolutions.get(id);
  const confirmed = res?.basisDocumentId && res.confirmedAdjustmentCents != null ? res : null;
  const balanceLine = letter?.text.split("\n\n").find((p) => p.startsWith("The new balance is")) ?? "";
  const deleted = Boolean(c.deletedAt);
  const remove = deleteCaseAction.bind(null, id);

  return (
    <>
      <div className="flex flex-col gap-3 px-6 pb-2">
        <h1>{letter ? `${c.hospitalName} Fixed the Bill` : "Case Closed"}</h1>
        {deleted && (
          <p>
            Everything on this case was deleted. Only the case code <span className="font-mono">{c.code}</span> remains in the record.
          </p>
        )}
        {letter && (
          <>
            <p>
              {firstName(c.patientName)} now owes <span className="font-mono [font-variant-numeric:tabular-nums]">{formatUsd(letter.newBalanceCents)}</span>.
            </p>
            <Clipping
              line={`‘${balanceLine}’`}
              amount={formatUsd(letter.newBalanceCents)}
              source={
                <>
                  <SimulatedBadge />
                  <span>
                    {c.hospitalName} letter, {shortDate(letter.receivedAt)}
                  </span>
                </>
              }
            />
          </>
        )}
        {res && !deleted && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <MoneyBlock amountCents={res.estimatedOpportunityCents} kind="estimated" label="Estimated" />
            {confirmed ? (
              <MoneyBlock amountCents={confirmed.confirmedAdjustmentCents!} kind="confirmed" label={`Confirmed ${confirmed.recordedAt ? shortDate(confirmed.recordedAt) : ""}`.trim()} badge={`Confirmed by ${c.hospitalName}`} />
            ) : (
              <p role="status" className="self-end text-sm text-muted">
                Waiting for the hospital&rsquo;s letter to be recorded
              </p>
            )}
            {confirmed?.actualSavingsCents != null && (
              <div className="col-span-2">
                <MoneyBlock amountCents={confirmed.actualSavingsCents} kind="actual" />
              </div>
            )}
          </div>
        )}
        {!deleted && (
          <details className="w-full">
            <summary className={SUMMARY}>Delete everything on this case</summary>
            <form action={remove} className="mt-1 flex flex-col gap-3 rounded-card bg-paper-2 px-4 py-3">
              <p className="text-sm">
                This removes the documents, the letters and {firstName(c.patientName)}&rsquo;s details from this case. It cannot be undone. The record keeps only that case {c.code} existed.
              </p>
              <button type="submit" className="flex min-h-14 w-full items-center justify-center rounded-input bg-white px-5 font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-ink)]">
                Delete everything
              </button>
            </form>
          </details>
        )}
      </div>
      <ActionBar>
        <PrimaryAction href="/snap">Snap another bill</PrimaryAction>
        <TalkToPerson code={c.code} />
      </ActionBar>
    </>
  );
}
