import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ActionBar } from "@/components/snap/ActionBar";
import { SimulatedBadge } from "@/components/snap/Badges";
import { DueAlert } from "@/components/snap/DueAlert";
import { MoneyBlock } from "@/components/snap/MoneyBlock";
import { PrimaryAction } from "@/components/snap/PrimaryAction";
import { StepRow } from "@/components/snap/StepRow";
import { TalkToPerson } from "@/components/snap/TalkToPerson";
import { TextAction } from "@/components/snap/TextAction";
import { deliverResponse, demoClockFor } from "@/lib/caseFlow";
import { formatUsd } from "@/lib/money";
import { estimateOpportunity } from "@/lib/savings";
import { getCase, hrefFor, shortDate } from "@/lib/server/cases";
import { getServerStore } from "@/lib/server/store";
import { ensureWalkCase, parseWalkHints, walkSuffix } from "@/lib/server/walk";
import { formatDate } from "@/lib/templates/facts";

export const instant = false;

/** Mock M05: what was sent (simulated), the case code, the estimate and the hold that was asked for. Each visit checks whether the hospital's simulated reply is due. */
export default async function DonePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  await connection(); // the due-date and demo-clock reads below are request-time values
  const hints = parseWalkHints(await searchParams);
  await ensureWalkCase(await getServerStore(), id, hints);
  const { store, c: before } = await getCase(id);
  if (!before) notFound();
  const letter = (await deliverResponse(store, id, (await demoClockFor(store)).now())) ?? (await store.responses.list({ caseId: id }))[0] ?? null;
  const c = letter ? ((await store.cases.get(id)) ?? before) : before;
  // once the reply exists, every link carries "responded" so a cold instance rebuilds the case with it
  const linkHints = c.state === "responded" ? { ...hints, sent: true, responded: true } : hints;
  if (c.state !== "sent" && c.state !== "responded") redirect(hrefFor(c, linkHints));
  const q = walkSuffix(id, linkHints);

  const [actions, findings] = await Promise.all([store.actionsFor(id), store.findingsFor(id)]);
  const sent = actions.filter((a) => a.sentAt);
  const estimate = estimateOpportunity(findings, c.eligibility ?? null, c.balanceCents ?? 0);
  const answered = c.state === "responded" && letter;

  return (
    <>
      <div className="flex flex-col gap-3 px-6 pb-2">
        <h1>{answered ? `${c.hospitalName} Answered` : "Done! You Will Hear Back in 2 to 4 Weeks"}</h1>
        <ol aria-label={`Sent: ${sent.length}, with your OK`} className="m-0 flex list-none flex-col gap-2 p-0">
          {sent.map((a) => (
            <StepRow key={a.id} step={{ key: a.id, title: a.title, status: "done", summary: `Sent ${formatDate(a.sentAt!.slice(0, 10))}` }}>
              <SimulatedBadge />
            </StepRow>
          ))}
        </ol>
        {answered ? (
          <p role="status">
            Their letter arrived {formatDate(letter.receivedAt.slice(0, 10))}. Your case code: <span className="font-mono">{c.code}</span>.
          </p>
        ) : (
          <p>
            We&rsquo;ll text you the moment {c.hospitalName} answers. Your case code: <span className="font-mono">{c.code}</span>.
          </p>
        )}
        {estimate.cents > 0 && <MoneyBlock amountCents={estimate.cents} kind="estimated" label="Possible" note={estimate.parts.map((p) => formatUsd(p.cents)).join(" + ")} />}
        {!answered && c.dueDate && (
          <DueAlert>
            Bill due {shortDate(c.dueDate)}. We asked {c.hospitalName} to hold the account; the hold is asked for, not confirmed.
          </DueAlert>
        )}
      </div>
      <ActionBar>
        {answered ? <PrimaryAction href={`/case/${id}/resolved${q}`}>See what they said</PrimaryAction> : <PrimaryAction href={`/case/${id}${q}`}>Back to my case</PrimaryAction>}
        {answered && <TextAction href={`/case/${id}${q}`}>Back to my case</TextAction>}
        <TalkToPerson code={c.code} />
      </ActionBar>
    </>
  );
}
