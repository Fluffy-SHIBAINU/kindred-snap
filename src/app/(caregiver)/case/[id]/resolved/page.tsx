import { redirect } from "next/navigation";
import { ActionBar } from "@/components/snap/ActionBar";
import { SimulatedBadge } from "@/components/snap/Badges";
import { Clipping } from "@/components/snap/Clipping";
import { MoneyBlock } from "@/components/snap/MoneyBlock";
import { PrimaryAction } from "@/components/snap/PrimaryAction";
import { TalkToPerson } from "@/components/snap/TalkToPerson";
import { TEXT_CLASS } from "@/components/snap/TextAction";
import { DELETE_TEXT, DELETED_TEXT } from "@/lib/caseFlow";
import { formatUsd } from "@/lib/money";
import { caseAccess } from "@/lib/server/access";
import { firstName, hrefFor, shortDate } from "@/lib/server/cases";
import { parseWalkHints } from "@/lib/server/walk";
import { deleteCaseAction } from "./actions";

export const instant = false;

const SUMMARY = TEXT_CLASS + " cursor-pointer list-none [&::-webkit-details-marker]:hidden";

/** Mock M06: the hospital's (simulated) letter, the three money labels that never merge, and the delete control. */
export default async function ResolvedPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const hints = parseWalkHints(await searchParams);
  const { store, c, canWrite, guest } = await caseAccess(id, hints);
  if (c.state !== "responded" && c.state !== "resolved" && c.state !== "closed") redirect(hrefFor(c, hints));

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
          <p>{DELETED_TEXT}</p>
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
        {!deleted && canWrite && (
          <details className="w-full">
            <summary className={SUMMARY}>Delete documents, findings and responses</summary>
            <form action={remove} className="mt-1 flex flex-col gap-3 rounded-card bg-paper-2 px-4 py-3">
              <p className="text-sm">{DELETE_TEXT}</p>
              <p className="text-sm">It cannot be undone.</p>
              <button type="submit" className="flex min-h-14 w-full items-center justify-center rounded-input bg-white px-5 font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-ink)]">
                Delete them
              </button>
            </form>
          </details>
        )}
      </div>
      <ActionBar>
        <PrimaryAction href="/snap">Snap another bill</PrimaryAction>
        <TalkToPerson code={c.code} guest={guest} />
      </ActionBar>
    </>
  );
}
