import { redirect } from "next/navigation";

/** The queue table lives on the dashboard for now; a later Phase 4 task gives it its own page (mock S01). */
export default function StaffQueue() {
  redirect("/staff");
}
