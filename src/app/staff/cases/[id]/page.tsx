import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Clipping } from "@/components/snap/Clipping";
import { Badge, Note, Panel } from "@/components/staff/Panel";
import { DataTable } from "@/components/staff/DataTable";
import { formatUsd } from "@/lib/money";
import { requireStaff } from "@/lib/server/auth";
import { demoControlsEnabled } from "@/lib/server/flags";
import { getServerStore } from "@/lib/server/store";
import { missingInformation, resolutionFor } from "@/lib/staff/caseDetail";
import { STATE_LABELS } from "@/lib/staff/dashboard";
import { formatDate } from "@/lib/templates/facts";
import type { Action, AuditEvent, Document, DocumentKind, Finding, FindingKind, ResponseLetter, Resolution, SourceRef } from "@/lib/types";
import { confirmFinding, deliverResponse, dismissFinding, editField, recordConfirmed } from "./actions";

const TABS = [
  ["documents", "Documents and fields"],
  ["findings", "Findings"],
  ["actions", "Actions"],
  ["resolution", "Resolution and history"],
] as const;
type Tab = (typeof TABS)[number][0];

const DOC_LABEL: Record<DocumentKind, string> = { bill: "Hospital Bill", msn: "Medicare Summary Notice", income: "Proof of Income", response_letter: "Hospital Response Letter" };
const KIND_LABEL: Record<FindingKind, string> = {
  patient_owes_exceeds_notice: "The Bill Asks More Than the Medicare Notice Allows",
  line_not_patient_responsibility: "A Line the Notice Shows as Not the Patient's to Pay",
  possible_duplicate: "Two Lines May Be the Same Service",
  no_discrepancy: "The Bill Agrees With the Notice",
  insufficient_information: "Not Enough Information to Compare",
};
const ACTION_LABEL: Record<Action["kind"], string> = { correction_request: "Correction request", information_request: "Information request", assistance_application: "Financial assistance application" };
const WAITING = "Waiting for the hospital";

const BTN = "inline-flex min-h-12 items-center justify-center rounded-input bg-accent px-4 font-medium text-accent-ink";
const BTN2 = "inline-flex min-h-12 items-center justify-center rounded-input bg-white px-4 font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-rule)]";
const INPUT = "min-h-12 w-full rounded-input bg-white px-3 text-ink shadow-[inset_0_0_0_1px_var(--color-rule)]";
const SUMMARY = "inline-flex min-h-12 cursor-pointer list-none items-center font-medium underline decoration-1 underline-offset-[0.16em]";

const when = (iso?: string) => (iso ? `${formatDate(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC` : "");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const confidence = (n: number) => `${n >= 0.9 ? "High" : n >= 0.7 ? "Medium" : "Low"} ${n.toFixed(2)}`;

function Badges() {
  return (
    <>
      <Badge tone="synthetic">Simulated</Badge>
    </>
  );
}

export default async function StaffCase({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; error?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const store = await getServerStore();
  const c = await store.cases.get(id);
  if (!c) notFound();
  const tab: Tab = (TABS.find(([t]) => t === sp.tab)?.[0] ?? "documents") as Tab;
  const [docs, findings, actions, responses, resolution, audit] = await Promise.all([
    store.documentsFor(id), store.findingsFor(id), store.actionsFor(id), store.responses.list({ caseId: id }), resolutionFor(store, c), store.audit(id),
  ]);
  const docLabel = (documentId: string) => {
    const d = docs.find((x) => x.id === documentId);
    return d ? DOC_LABEL[d.kind] : "Document";
  };

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl">{c.patientName || "Deleted Case"}</h1>
        <p>
          Case <span className="font-outlier">{c.code}</span>. State: {STATE_LABELS[c.state]}.
        </p>
        <p className="flex flex-wrap items-center gap-2">
          {c.hospitalName} <Badges />
        </p>
        {c.balanceCents != null && c.dueDate ? (
          <p>
            <span className="font-outlier tabular-nums">{formatUsd(c.balanceCents)}</span> due {formatDate(c.dueDate)}. Our work does not pause this.
          </p>
        ) : null}
        <p className="text-sm text-muted">
          {c.consent ? `Authorized by ${c.consent.grantedBy} (${c.consent.role}) on ${formatDate(c.consent.grantedAt.slice(0, 10))}. Scope: ${c.consent.scope}.` : "No consent on record yet."}
          {c.helperName ? ` Helper: ${c.helperName}.` : ""}
        </p>
      </header>

      <nav aria-label="Case sections" className="flex flex-wrap gap-1 border-b border-rule pb-2">
        {TABS.map(([t, label]) => (
          <a
            key={t}
            href={`/staff/cases/${id}?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`inline-flex min-h-12 items-center rounded-input px-3.5 font-medium no-underline ${t === tab ? "bg-white text-ink shadow-[inset_0_0_0_1px_var(--color-rule)]" : "text-ink-2"}`}
          >
            {label}
          </a>
        ))}
      </nav>

      {sp.error ? (
        <p role="status" className="rounded-input bg-paper-3 px-4 py-3">
          {sp.error}
        </p>
      ) : null}

      {tab === "documents" && <DocumentsTab caseId={id} docs={docs} />}
      {tab === "findings" && <FindingsTab caseId={id} findings={findings} missing={missingInformation(c)} docLabel={docLabel} />}
      {tab === "actions" && <ActionsTab caseId={id} state={c.state} actions={actions} responses={responses} />}
      {tab === "resolution" && <ResolutionTab caseId={id} resolution={resolution} responses={responses} audit={audit} />}
    </>
  );
}

function DocumentsTab({ caseId, docs }: { caseId: string; docs: Document[] }) {
  if (docs.length === 0) return <p>No documents on this case yet.</p>;
  return (
    <>
      <h2 className="text-xl">Documents: {docs.length}</h2>
      {docs.map((d) => (
        <Panel key={d.id} id={`doc-${d.id}`} title={DOC_LABEL[d.kind]} badges={<Badges />}>
          <p className="text-sm text-muted">
            {d.fileName ? `${d.fileName}, ` : ""}
            {d.pages} {d.pages === 1 ? "page" : "pages"}, {cap(d.status)}. Added {when(d.uploadedAt)}.
          </p>
          {d.fileName.endsWith(".png") ? (
            // eslint-disable-next-line @next/next/no-img-element -- a fixture PNG streamed by our own route handler
            <img src={`/staff/documents/${d.id}`} alt={`${DOC_LABEL[d.kind]}, page 1 of ${d.pages}, synthetic`} className="max-h-[560px] w-auto rounded-input shadow-card" />
          ) : null}
          {d.text ? (
            <div className="flex flex-col gap-2 rounded-input bg-paper-2 p-4 font-mono text-sm">
              {d.text.split("\n\n").map((p, i) => <p key={i} className="max-w-none">{p}</p>)}
            </div>
          ) : null}
          <FieldsTable caseId={caseId} doc={d} />
          <LinesTable doc={d} />
        </Panel>
      ))}
    </>
  );
}

function FieldsTable({ caseId, doc }: { caseId: string; doc: Document }) {
  if (doc.fields.length === 0) return <p>No fields were read from this document.</p>;
  return (
    <DataTable>
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">Value</th>
          <th scope="col">Confidence</th>
          <th scope="col">Source</th>
          <th scope="col">Edit</th>
        </tr>
      </thead>
      <tbody>
        {doc.fields.map((f) => {
          const inputId = `${doc.id}-${f.key}`;
          return (
            <tr key={f.key}>
              <td>{f.key.replace(/_/g, " ")}</td>
              <td>
                <span className="font-outlier">{f.value}</span>
                {f.editedBy ? (
                  <span className="block text-muted">
                    Edited by {f.editedBy} {when(f.editedAt)}. Original: <span className="font-outlier">{f.originalValue}</span>
                  </span>
                ) : null}
              </td>
              <td>
                <Badge tone="synthetic">{confidence(f.confidence)}</Badge>
              </td>
              <td>
                {DOC_LABEL[doc.kind]}, page {f.source.page}
                {f.source.line != null ? `, line ${f.source.line}` : ""}
                <span className="block font-mono text-muted">“{f.source.quote}”</span>
              </td>
              <td>
                <details>
                  <summary className={SUMMARY}>Edit</summary>
                  <form action={editField} className="flex flex-col gap-2 pt-2">
                    <input type="hidden" name="caseId" value={caseId} />
                    <input type="hidden" name="documentId" value={doc.id} />
                    <input type="hidden" name="key" value={f.key} />
                    <label htmlFor={inputId}>New value</label>
                    <input id={inputId} name="value" defaultValue={f.value} required className={INPUT} />
                    <button type="submit" className={BTN2}>Save the value</button>
                  </form>
                </details>
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

function LinesTable({ doc }: { doc: Document }) {
  const bill = doc.billLines ?? [];
  const msn = doc.msnLines ?? [];
  if (bill.length === 0 && msn.length === 0) return null;
  return (
    <DataTable>
      <thead>
        <tr>
          <th scope="col">Line</th>
          <th scope="col">Code and description</th>
          <th scope="col">Service date</th>
          <th scope="col">{bill.length ? "Charge" : "You may be billed"}</th>
          <th scope="col">Quoted</th>
        </tr>
      </thead>
      <tbody>
        {bill.map((l) => (
          <tr key={l.n}>
            <td className="font-outlier">{l.n}</td>
            <td><span className="font-outlier">{l.code}</span> {l.description}</td>
            <td className="font-outlier">{l.serviceDate}</td>
            <td className="font-outlier tabular-nums">{formatUsd(l.chargeCents)}</td>
            <td className="font-mono text-muted">“{l.source.quote}”</td>
          </tr>
        ))}
        {msn.map((l) => (
          <tr key={l.n}>
            <td className="font-outlier">{l.n}</td>
            <td>
              <span className="font-outlier">{l.code}</span> {l.service}
              {l.note ? <span className="block text-muted">“{l.note}”</span> : null}
            </td>
            <td className="font-outlier">{l.serviceDate}</td>
            <td className="font-outlier tabular-nums">{formatUsd(l.youMayBeBilledCents)}</td>
            <td className="font-mono text-muted">“{l.source.quote}”</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function Evidence({ source: ref, docLabel }: { source: SourceRef; docLabel: (id: string) => string }) {
  const label = docLabel(ref.documentId);
  return (
    <Clipping
      line={ref.quote}
      source={
        <>
          <span>
            {label}, page {ref.page}
            {ref.line != null ? `, line ${ref.line}` : ""}
          </span>
          {label === DOC_LABEL.msn || label === DOC_LABEL.response_letter ? <Badge tone="synthetic">Simulated</Badge> : null}
        </>
      }
    />
  );
}

function FindingsTab({ caseId, findings, missing, docLabel }: { caseId: string; findings: Finding[]; missing: ReturnType<typeof missingInformation>; docLabel: (id: string) => string }) {
  const reviewed = findings.filter((f) => f.staffStatus).length;
  return (
    <>
      <h2 className="text-xl">
        {findings.length === 0 ? "No Findings Yet" : `${findings.length} ${findings.length === 1 ? "Finding" : "Findings"}, ${reviewed} Reviewed by Staff`}
      </h2>
      <Note>Every amount on this page is estimated until the hospital answers. Drafts are prepared from findings staff have not dismissed.</Note>
      {findings.map((f) => (
        <Panel
          key={f.id}
          id={`finding-${f.id}`}
          title={KIND_LABEL[f.kind]}
          badges={
            <>
              <Badge tone="synthetic">{cap(f.confidence)}</Badge>
              {f.requiresReview ? <Badge tone="demo">Needs a specialist's review</Badge> : null}
              {f.staffStatus ? <Badge tone="demo">{f.staffStatus === "confirmed" ? "Staff confirmed" : "Dismissed by staff"}</Badge> : null}
            </>
          }
        >
          <p>{f.explanation}</p>
          {f.amountCents != null ? (
            <p>
              Estimated amount: <span className="font-outlier tabular-nums">{formatUsd(f.amountCents)}</span>. Not confirmed by the hospital.
            </p>
          ) : null}
          {f.evidence.length ? (
            <div className="flex flex-col gap-2.5">
              {f.evidence.map((e, i) => <Evidence key={i} source={e} docLabel={docLabel} />)}
            </div>
          ) : (
            <p className="text-muted">No document line supports this finding; it records what is missing.</p>
          )}
          {f.staffStatus === "dismissed" ? <p className="text-muted">Dismissed: {f.dismissReason}</p> : null}
          <div className="flex flex-wrap items-start gap-3">
            <form action={confirmFinding}>
              <input type="hidden" name="caseId" value={caseId} />
              <input type="hidden" name="findingId" value={f.id} />
              <button type="submit" className={BTN}>Confirm finding</button>
            </form>
            <details>
              <summary className={SUMMARY}>Dismiss (reason required)</summary>
              <form action={dismissFinding} className="flex flex-col gap-2 pt-2">
                <input type="hidden" name="caseId" value={caseId} />
                <input type="hidden" name="findingId" value={f.id} />
                <label htmlFor={`reason-${f.id}`}>Reason</label>
                <input id={`reason-${f.id}`} name="reason" required className={INPUT} />
                <button type="submit" className={BTN2}>Dismiss finding</button>
              </form>
            </details>
          </div>
        </Panel>
      ))}
      <Panel id="missing" title={missing.length ? `Missing Information: ${missing.length}` : "Missing Information: None"}>
        {missing.length === 0 ? (
          <p>Nothing is missing. The notice is on file and the income is typed.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {missing.map((m) => (
              <li key={m.key}>
                <span className="font-medium">{m.title}</span>
                <span className="block text-muted">{m.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function Step({ title, detail }: { title: string; detail: ReactNode }) {
  return (
    <li className="flex flex-col">
      <span className="font-medium">{title}</span>
      <span className="text-sm text-muted">{detail}</span>
    </li>
  );
}

function ActionsTab({ caseId, state, actions, responses }: { caseId: string; state: string; actions: Action[]; responses: ResponseLetter[] }) {
  const log = [
    ...actions.filter((a) => a.sentAt).map((a) => ({ at: a.sentAt!, title: `Sent (simulated): ${a.title}`, body: `${ACTION_LABEL[a.kind]}, approved by ${a.approvedBy}.` })),
    ...responses.map((r) => ({ at: r.receivedAt, title: "Response received (simulated)", body: r.text })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <>
      <h2 className="text-xl">{actions.length === 0 ? "No Letters Drafted Yet" : `${actions.length} ${actions.length === 1 ? "Action" : "Actions"}`}</h2>
      <Note>Simulated. Sends go to the demo partner adapter, not a real hospital. Staff cannot approve on the patient's behalf.</Note>
      {actions.map((a) => (
        <Panel key={a.id} id={`action-${a.id}`} title={a.title} badges={<><Badge tone="synthetic">Simulated</Badge><Badge tone="synthetic">{cap(a.status.replace("_simulated", " (simulated)"))}</Badge></>}>
          <p className="text-sm text-muted">{ACTION_LABEL[a.kind]}. Every dollar figure in the draft was checked against the case before it was saved: {a.validatedNumbers.join(", ") || "none"}.</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            <Step title="Drafted" detail="By the app, from the case's own documents." />
            <Step title={a.approvedAt ? `Approved by ${a.approvedBy}` : "Approval"} detail={a.approvedAt ? when(a.approvedAt) : "Waiting for the patient or helper to approve in the app."} />
            <Step title="Sent (simulated)" detail={a.sentAt ? when(a.sentAt) : "Not sent. Nothing is sent before approval."} />
            {a.status === "responded" ? <Step title="Response received (simulated)" detail="See the correspondence log." /> : null}
          </ul>
          <details>
            <summary className={SUMMARY}>Show the letter</summary>
            <div className="flex flex-col gap-2 rounded-input bg-paper-2 p-4 pt-4 font-mono text-sm">
              {a.draft.split("\n\n").map((p, i) => <p key={i} className="max-w-none">{p}</p>)}
            </div>
          </details>
        </Panel>
      ))}
      <Panel id="correspondence" title={`Correspondence: ${log.length} ${log.length === 1 ? "Entry" : "Entries"}`} badges={<Badges />}>
        {log.length === 0 ? (
          <p>Nothing has been sent yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {log.map((e, i) => (
              <li key={i} className="flex flex-col gap-1">
                <span className="text-sm text-muted">{when(e.at)}</span>
                <span className="font-medium">{e.title}</span>
                <div className="flex flex-col gap-2 font-mono text-sm">
                  {e.body.split("\n\n").map((p, j) => <p key={j} className="max-w-none">{p}</p>)}
                </div>
              </li>
            ))}
          </ul>
        )}
        {demoControlsEnabled() && state === "sent" ? (
          <form action={deliverResponse} className="flex flex-col items-start gap-2 border-t border-rule pt-4">
            <input type="hidden" name="caseId" value={caseId} />
            <button type="submit" className={BTN}>Deliver the simulated response now</button>
            <Note>Demo control. The demo partner's letter is written from this case's own figures and lands 12 days after the send.</Note>
          </form>
        ) : null}
      </Panel>
    </>
  );
}

function ResolutionTab({ caseId, resolution, responses, audit }: { caseId: string; resolution: Resolution; responses: ResponseLetter[]; audit: readonly AuditEvent[] }) {
  const money = (cents: number | null) => (cents == null ? WAITING : formatUsd(cents));
  const basis = responses.find((r) => r.id === resolution.basisDocumentId);
  return (
    <>
      <h2 className="text-xl">Resolution</h2>
      <Panel id="resolution" title="Three Rows, Never Merged" badges={<Badges />}>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          <dt>1. Estimated opportunity</dt>
          <dd className="m-0 font-outlier tabular-nums">{formatUsd(resolution.estimatedOpportunityCents)} <span className="font-body text-muted">Estimated</span></dd>
          <dt>2. Confirmed adjustment</dt>
          <dd className="m-0 font-outlier tabular-nums">{money(resolution.confirmedAdjustmentCents)} {resolution.confirmedAdjustmentCents != null ? <span className="font-body text-muted">Confirmed by the hospital</span> : null}</dd>
          <dt>3. Actual patient savings</dt>
          <dd className="m-0 font-outlier tabular-nums">{money(resolution.actualSavingsCents)} {resolution.actualSavingsCents != null ? <span className="font-body text-muted">Actual savings</span> : null}</dd>
        </dl>
        {basis ? (
          <Note>
            Basis: the hospital's response letter received {when(basis.receivedAt)} (simulated), new balance {formatUsd(basis.newBalanceCents)}. Recorded by {resolution.recordedBy} {when(resolution.recordedAt)}.
          </Note>
        ) : (
          <Note>Estimated is the app's computation. Confirmed requires a basis document from the hospital. Actual is the confirmed adjustment on a balance the patient was asked to pay.</Note>
        )}
      </Panel>

      <Panel id="record" title="Record Confirmed Adjustment">
        <form action={recordConfirmed} className="flex max-w-[520px] flex-col gap-3">
          <input type="hidden" name="caseId" value={caseId} />
          <label htmlFor="basis">Basis document</label>
          <select id="basis" name="basisDocumentId" className={INPUT} defaultValue="">
            <option value="">Choose the hospital's response letter</option>
            {responses.map((r) => (
              <option key={r.id} value={r.id}>
                Response letter received {when(r.receivedAt)} (simulated), new balance {formatUsd(r.newBalanceCents)}
              </option>
            ))}
          </select>
          {responses.length === 0 ? <Note>No response letter on file yet. A confirmed adjustment needs the hospital's own letter; an estimate can never become one.</Note> : null}
          <label htmlFor="newBalance">New balance in dollars, as the letter states it</label>
          <input id="newBalance" name="newBalance" inputMode="decimal" className={INPUT} />
          <button type="submit" className={`${BTN} self-start`}>Record confirmed adjustment</button>
        </form>
      </Panel>

      <Panel id="history" title={`History: ${audit.length} ${audit.length === 1 ? "Event" : "Events"}, Append-Only`}>
        {audit.length === 0 ? (
          <p>No events recorded yet.</p>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {[...audit].reverse().map((e) => (
                <tr key={e.id}>
                  <td className="font-outlier whitespace-nowrap">{when(e.at)}</td>
                  <td>{e.actor} ({e.role})</td>
                  <td>{e.action}</td>
                  <td className="font-mono text-muted">{e.details ? Object.entries(e.details).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("; ") : ""}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <Note>A correction is a new event, never an edit.</Note>
      </Panel>
    </>
  );
}
