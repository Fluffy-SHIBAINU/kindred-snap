import { DataTable } from "@/components/staff/DataTable";
import type { QueueRow } from "@/lib/staff/dashboard";

/** The queue table of mock S00/S01: one row per case, the code linking to the case page. */
export function QueueTable({ rows }: { rows: QueueRow[] }) {
  return (
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
        {rows.map((r) => (
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
  );
}
