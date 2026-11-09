import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { ActionBar } from "@/components/snap/ActionBar";
import { Clipping } from "@/components/snap/Clipping";
import { DueAlert } from "@/components/snap/DueAlert";
import { CameraIcon } from "@/components/snap/icons";
import { Poller } from "@/components/snap/Poller";
import { PRIMARY_CLASS, PrimaryAction } from "@/components/snap/PrimaryAction";
import { StepRow } from "@/components/snap/StepRow";
import { TalkToPerson } from "@/components/snap/TalkToPerson";
import { TextAction, TEXT_CLASS } from "@/components/snap/TextAction";
import { UploadForm } from "@/components/snap/UploadForm";
import { screenFor } from "@/lib/case/route";
import { WORKING_STATES } from "@/lib/case/state";
import { formatUsd } from "@/lib/money";
import { buildSteps } from "@/lib/progress";
import { daysLeft, daysLeftText, getCase, hrefFor, shortDate } from "@/lib/server/cases";
import type { Case, Finding } from "@/lib/types";
import { addNoticeAndResume, retryMedicare } from "./actions";

/** A notice photo resumes the investigation inside the request. */
export const maxDuration = 60;
/** Reads the store per request; nothing here can be prerendered. */
export const instant = false;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> };

/** Mock M03 with the E02 / E04 / E05 variants by state. No primary button while the app works on its own. */
export default async function WorkingPage({ params, searchParams }: Props) {
  const { id } = await params;
  await connection(); // the due-date and demo-clock reads below are request-time values
  const { error } = await searchParams;
  const { store, c } = await getCase(id);
  if (!c) notFound();

  const steps = c.steps.length ? c.steps : buildSteps(c.state);
  const current = steps.find((s) => s.status === "active" || s.status === "needs_you");
  const feed = (
    <ol aria-label="Five steps" className="flex flex-col gap-2">
      {steps.map((s) => <StepRow key={s.key} step={s} />)}
    </ol>
  );
  const notice = error && (
    <p role="status" className="rounded-card bg-paper-3 px-4 py-3 text-sm">
      {error}
    </p>
  );
  const next = screenFor(c.state) === "/working" ? null : hrefFor(c);

  let body: ReactNode;
  if (c.state === "needs_notice") body = <NeedsNotice c={c} feed={feed} notice={notice} />;
  else if (c.state === "connector_unavailable") body = <ConnectorUnavailable c={c} feed={feed} notice={notice} />;
  else if (c.state === "needs_review") body = <NeedsReview c={c} findings={await store.findingsFor(id)} />;
  else {
    body = (
      <>
        <div className="flex flex-col gap-4 px-6 pb-4">
          <h1>We&rsquo;re On It</h1>
          <p>Nothing for you to do yet. This page updates on its own.</p>
          {current && <p role="status" className="sr-only">{current.title}. {current.summary}</p>}
          {c.dueDate && c.balanceCents != null && (
            <DueAlert note={`${daysLeftText(daysLeft(c.dueDate))}. Saved as ${c.code}.`}>
              <span className="font-mono">{formatUsd(c.balanceCents)}</span> due {shortDate(c.dueDate)}
            </DueAlert>
          )}
          {feed}
        </div>
        <ActionBar>
          <TalkToPerson code={c.code} />
          {c.state === "ready_to_send" && <TextAction href={`/case/${id}/result`}>Preview the result</TextAction>}
        </ActionBar>
      </>
    );
  }

  return (
    <>
      <Poller next={next} poll={WORKING_STATES.includes(c.state)} />
      {body}
    </>
  );
}

/** "Bill: $466.00 due Nov 30 · 21 days left" (mocks E02 and E05). */
function BillLine({ c }: { c: Case }) {
  if (!c.dueDate || c.balanceCents == null) return null;
  return (
    <p className="flex flex-wrap items-baseline justify-between gap-x-3">
      <span>
        Bill: <strong className="font-mono">{formatUsd(c.balanceCents)}</strong> due {shortDate(c.dueDate)}
      </span>
      <span className="text-sm text-muted">{daysLeftText(daysLeft(c.dueDate))}</span>
    </p>
  );
}

type VariantProps = { c: Case; feed: ReactNode; notice: ReactNode };

/** Mock E02: Medicare has no notice for this visit, so nothing is judged until one arrives. */
function NeedsNotice({ c, feed, notice }: VariantProps) {
  return (
    <>
      <div className="flex flex-col gap-4 px-6 pb-4">
        <BillLine c={c} />
        <h1>To Check It, We Need Medicare&rsquo;s Notice.</h1>
        {notice}
        {feed}
        <p>
          Until we have it, we won&rsquo;t say whether {c.balanceCents != null && <span className="font-mono">{formatUsd(c.balanceCents)}</span>} is right. The notice comes
          by mail or from Medicare.gov.
        </p>
      </div>
      <ActionBar>
        <UploadForm action={addNoticeAndResume} capture hidden={{ caseId: c.id }} className={PRIMARY_CLASS} pendingText="Reading the notice and continuing…">
          <CameraIcon />
          Photo of the notice
        </UploadForm>
        <form action={retryMedicare}>
          <input type="hidden" name="caseId" value={c.id} />
          <TextAction type="submit">Connect Medicare (demo)</TextAction>
        </form>
        <TalkToPerson code={c.code} />
      </ActionBar>
    </>
  );
}

/** Mock E05: the synthetic connector is down; the paper notice continues the case now, or the caregiver waits. */
function ConnectorUnavailable({ c, feed, notice }: VariantProps) {
  return (
    <>
      <div className="flex flex-col gap-4 px-6 pb-4">
        <BillLine c={c} />
        <h1>Medicare Isn&rsquo;t Responding Right Now.</h1>
        {notice}
        <div role="status" className="flex flex-col gap-1 rounded-card bg-paper-3 px-4 py-3">
          <strong>Step 2, Medicare&rsquo;s notice: not available</strong>
          <p className="text-sm text-muted">Simulated connection. We try again when you ask.</p>
        </div>
        {feed}
        <p>
          This is on Medicare&rsquo;s side, not yours. Your progress is saved and the case picks up here. If you have the paper notice for this visit, take a photo
          and we continue now.
        </p>
        <p className="text-sm text-muted">Nothing has been sent. Nothing leaves without your OK.</p>
      </div>
      <ActionBar>
        <UploadForm action={addNoticeAndResume} capture hidden={{ caseId: c.id }} className={PRIMARY_CLASS} pendingText="Reading the notice and continuing…">
          <CameraIcon />
          Photo of the paper notice
        </UploadForm>
        <form action={retryMedicare}>
          <input type="hidden" name="caseId" value={c.id} />
          <button type="submit" className={TEXT_CLASS}>Wait and try later</button>
        </form>
        <TalkToPerson code={c.code} />
      </ActionBar>
    </>
  );
}

/** Mock E04: a finding needs a billing specialist; the evidence is shown, nothing is asked of the hospital. */
function NeedsReview({ c, findings }: { c: Case; findings: Finding[] }) {
  const open = findings.filter((f) => f.requiresReview && !f.staffStatus);
  return (
    <>
      <div className="flex flex-col gap-4 px-6 pb-4">
        <h1>A Billing Specialist Is Checking This Bill.</h1>
        <p role="status">Waiting for a billing specialist</p>
        {open.map((f) => (
          <div key={f.id} className="flex flex-col gap-3">
            <p>{f.explanation}</p>
            {f.evidence.map((e, i) => (
              <Clipping key={i} line={e.quote} source={`Document page ${e.page}${e.line != null ? `, line ${e.line}` : ""}`} />
            ))}
          </div>
        ))}
        <p>This can be correct. A billing specialist will look before we ask {c.hospitalName} anything.</p>
        <p className="text-sm text-muted">Nothing has been sent. We&rsquo;ll tell you what they find, usually within 2 business days.</p>
      </div>
      <ActionBar>
        <PrimaryAction href={`/case/${c.id}`}>Back to my case</PrimaryAction>
        <TalkToPerson code={c.code} />
      </ActionBar>
    </>
  );
}
