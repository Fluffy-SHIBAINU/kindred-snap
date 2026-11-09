import { Badge, Note, Panel } from "@/components/staff/Panel";
import { QueueTable } from "@/components/staff/QueueTable";
import { requireStaff } from "@/lib/server/auth";
import { getServerStore } from "@/lib/server/store";
import { NEXT_ACTION, STATE_LABELS } from "@/lib/staff/dashboard";

/** Every case, closed ones included, in the dashboard's queue table. */
export default async function StaffCases() {
  await requireStaff();
  const cases = (await (await getServerStore()).listCases()).sort((a, b) => a.code.localeCompare(b.code));
  const rows = cases.map((c) => ({
    id: c.id, code: c.code, patientName: c.patientName || "Deleted", hospitalName: c.hospitalName,
    stateLabel: STATE_LABELS[c.state], dueDate: c.dueDate, nextAction: NEXT_ACTION[c.state],
  }));
  return (
    <>
      <h1 className="text-2xl">Cases</h1>
      <Panel id="cases" title={`All Cases: ${rows.length}`} badges={<><Badge tone="demo">Demo partner · synthetic data</Badge><Badge tone="synthetic">Simulated</Badge></>}>
        {rows.length === 0 ? <p>No cases yet. New cases appear here as caregivers add them.</p> : <QueueTable rows={rows} />}
        <Note>Every patient is synthetic. Closed cases stay listed; a deleted case keeps only its code.</Note>
      </Panel>
    </>
  );
}
