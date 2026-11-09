import { redirect } from "next/navigation";

/** The audit history arrives with the last Phase 4 task (mock S05); until then the tab lands on the dashboard. */
export default function StaffAudit() {
  redirect("/staff");
}
