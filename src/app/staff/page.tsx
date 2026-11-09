import { BarRow } from "@/components/staff/BarRow";
import { DataTable } from "@/components/staff/DataTable";
import { Badge, Note, Panel } from "@/components/staff/Panel";
import { StatBlock } from "@/components/staff/StatBlock";
import { formatUsd } from "@/lib/money";
import { requireStaff } from "@/lib/server/auth";
import { getServerStore } from "@/lib/server/store";
import { dashboardData } from "@/lib/staff/dashboard";

const WAITING = "Waiting for the hospital";
const pct = (n: number, max: number) => (max > 0 ? (n / max) * 100 : 0);

function DemoBadges() {
  return (
    <>
      <Badge tone="synthetic">Simulated</Badge>
    </>
  );
}

export default async function StaffDashboard() {
  // Pages render in parallel with their layout, so the layout's gate alone would leave this page's data in the payload. Every staff page gates before it reads.
  await requireStaff();
  const { counts, byState, savings, queue } = await dashboardData(await getServerStore());
  const maxState = Math.max(0, ...byState.map((r) => r.count));
  const maxSavings = savings ? Math.max(savings.estimatedCents, savings.confirmedCents ?? 0, savings.actualCents ?? 0) : 0;
  const money = (cents: number | null) => (cents == null ? WAITING : formatUsd(cents));

  return (
    <>
      <h1 className="text-2xl">Dashboard</h1>

      <Panel id="counts" title="Today">
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <StatBlock figure={counts.queue} label="Cases in the queue" />
          <StatBlock figure={counts.awaitingApproval} label="Cases awaiting a caregiver's approval" />
          <StatBlock figure={counts.needsReview} label="Cases that need a specialist's review" />
          <StatBlock figure={counts.confirmed} label="Adjustments confirmed by a hospital" />
        </div>
        <Note>Synthetic demo counts</Note>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel id="states" title="Cases by State">
          {byState.length === 0 ? (
            <p>No cases yet. New cases appear here as caregivers add them.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {byState.map((r) => (
                <BarRow key={r.label} label={r.label} value={String(r.count)} pct={pct(r.count, maxState)} />
              ))}
            </ul>
          )}
          <Note>Bars are proportional to the count.</Note>
        </Panel>

        <Panel id="savings" title="Savings on the Demo Case" badges={<DemoBadges />}>
          {savings ? (
            <>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                <BarRow label="Estimated opportunity" value={formatUsd(savings.estimatedCents)} pct={pct(savings.estimatedCents, maxSavings)} tone="soft" />
                <BarRow label="Confirmed adjustment" value={money(savings.confirmedCents)} pct={pct(savings.confirmedCents ?? 0, maxSavings)} />
                <BarRow label="Actual patient savings" value={money(savings.actualCents)} pct={pct(savings.actualCents ?? 0, maxSavings)} tone="ink" />
              </ul>
              <Note>Estimated is the app's computation. Confirmed requires a basis document from the hospital. Actual is the confirmed adjustment on a balance the patient was asked to pay. The app tracks them separately.</Note>
            </>
          ) : (
            <p>No savings to show until a case has an estimate.</p>
          )}
        </Panel>
      </div>

      <Panel id="queue" title="Queue" badges={<DemoBadges />}>
        {queue.length === 0 ? (
          <p>No open cases. New cases appear here as caregivers add them.</p>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th scope="col">Case</th>
                <th scope="col">Patient</th>
                <th scope="col">Hospital</th>
                <th scope="col">State</th>
                <th scope="col">Due</th>
                <th scope="col">Next action</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={`/staff/cases/${r.id}`} className="font-outlier">{r.code}</a>
                  </td>
                  <td>{r.patientName}</td>
                  <td>{r.hospitalName}</td>
                  <td>{r.stateLabel}</td>
                  <td className={r.dueDate ? "font-outlier tabular-nums" : undefined}>{r.dueDate ?? "Not read yet"}</td>
                  <td>{r.nextAction}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <Note>Every patient is synthetic. Due dates show only where the bill was read.</Note>
      </Panel>
    </>
  );
}
