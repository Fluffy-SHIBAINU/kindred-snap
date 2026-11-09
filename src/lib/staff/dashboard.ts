import type { Store } from "@/lib/adapters/store/types";
import type { CaseState } from "@/lib/case/state";
import { estimateOpportunity } from "@/lib/savings";
import type { Case } from "@/lib/types";

export const STATE_LABELS: Record<CaseState, string> = {
  created: "New",
  reading: "Reading",
  unreadable: "Needs a new photo",
  needs_notice: "Needs info",
  connector_unavailable: "Medicare unavailable",
  comparing: "Comparing",
  needs_review: "Needs review",
  checking_assistance: "Checking assistance",
  drafting: "Drafting",
  ready_to_send: "Awaiting approval",
  sent: "Sent",
  responded: "Responded",
  resolved: "Resolved",
  closed: "Closed",
};

/** What a staff member does (or waits for) next, by state. Nothing here promises an outcome. */
export const NEXT_ACTION: Record<CaseState, string> = {
  created: "Waiting for the caregiver to start the case.",
  reading: "Reading the bill.",
  unreadable: "Waiting for a new photo or the PDF from the caregiver.",
  needs_notice: "Waiting for the Medicare Summary Notice from the caregiver.",
  connector_unavailable: "Retrying the Medicare connection; the caregiver can photograph the paper notice.",
  comparing: "Comparing the bill with the notice.",
  needs_review: "A billing specialist checks the flagged lines before anything is asked.",
  checking_assistance: "Checking the hospital's financial assistance policy.",
  drafting: "Drafting the letters.",
  ready_to_send: "Caregiver to approve the letters.",
  sent: "Waiting for the hospital's response (simulated).",
  responded: "Record the hospital's letter as the basis for a confirmed adjustment.",
  resolved: "Close the case.",
  closed: "Nothing to do.",
};

export type QueueRow = { id: string; code: string; patientName: string; hospitalName: string; stateLabel: string; dueDate?: string; nextAction: string };
export type Dashboard = {
  counts: { queue: number; awaitingApproval: number; needsReview: number; confirmed: number };
  byState: Array<{ label: string; count: number }>;
  /** the demo case (fixtureKey 'main'); null when the store has none */
  savings: { estimatedCents: number; confirmedCents: number | null; actualCents: number | null } | null;
  queue: QueueRow[];
};

const STATE_ORDER = Object.keys(STATE_LABELS) as CaseState[];

/** Needs-review first, then the earliest due date; cases without a due date last. */
function queueOrder(a: Case, b: Case): number {
  if ((a.state === "needs_review") !== (b.state === "needs_review")) return a.state === "needs_review" ? -1 : 1;
  return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
}

export async function dashboardData(store: Store): Promise<Dashboard> {
  const open = (await store.listCases()).filter((c) => c.state !== "closed").sort(queueOrder);
  const resolutions = await store.resolutions.list();
  const counts = {
    queue: open.length,
    awaitingApproval: open.filter((c) => c.state === "ready_to_send").length,
    needsReview: open.filter((c) => c.state === "needs_review").length,
    confirmed: resolutions.filter((r) => r.confirmedAdjustmentCents != null).length,
  };
  const byState = STATE_ORDER.map((s) => ({ label: STATE_LABELS[s], count: open.filter((c) => c.state === s).length })).filter((r) => r.count > 0);

  const demo = open.find((c) => c.fixtureKey === "main");
  let savings: Dashboard["savings"] = null;
  if (demo) {
    const res = await store.resolutions.get(demo.id);
    const estimatedCents = res?.estimatedOpportunityCents ?? estimateOpportunity(await store.findingsFor(demo.id), demo.eligibility ?? null, demo.balanceCents ?? 0).cents;
    savings = { estimatedCents, confirmedCents: res?.confirmedAdjustmentCents ?? null, actualCents: res?.actualSavingsCents ?? null };
  }

  const queue = open.map((c) => ({
    id: c.id, code: c.code, patientName: c.patientName, hospitalName: c.hospitalName,
    stateLabel: STATE_LABELS[c.state], dueDate: c.dueDate, nextAction: NEXT_ACTION[c.state],
  }));
  return { counts, byState, savings, queue };
}
