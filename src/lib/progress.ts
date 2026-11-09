import type { CaseState } from "@/lib/case/state";
import type { Step, StepStatus } from "@/lib/types";

/** The five rows of the progress feed; titles exactly as docs/mocks/M03-working.dc.html shows them. */
export const STEP_KEYS = ["read_bill", "fetch_notice", "compare", "assistance", "draft"] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export const STEP_TITLES: Record<StepKey, string> = {
  read_bill: "1. Read the bill",
  fetch_notice: "2. Medicare notice",
  compare: "3. Compare lines",
  assistance: "4. Help program",
  draft: "5. Write letters",
};
export type StepSummaries = Partial<Record<StepKey, string>>;

/** The mock writes the status into the title: "1. Read the bill: done", "5. Write letters: working". */
const SUFFIX: Record<StepStatus, string> = { done: ": done", active: ": working", needs_you: ": needs you", waiting: "" };

/** Which step the case is on and how that row reads. Earlier steps are done, later ones waiting. */
function position(state: CaseState, s: StepSummaries): { at: number; status: StepStatus } {
  switch (state) {
    case "created": return { at: 0, status: "waiting" };
    // the bill and the notice are both handled in `reading`; the notice step is the active one once the pipeline has given it a summary
    case "reading": return { at: s.fetch_notice != null ? 1 : 0, status: "active" };
    case "unreadable": return { at: 0, status: "needs_you" };
    case "needs_notice":
    case "connector_unavailable": return { at: 1, status: "needs_you" };
    case "comparing": return { at: 2, status: "active" };
    case "needs_review": return { at: 2, status: "needs_you" };
    case "checking_assistance": return { at: 3, status: "active" };
    case "drafting": return { at: 4, status: "active" };
    default: return { at: 5, status: "done" }; // ready_to_send and everything after it
  }
}

/** `blocked` marks one step "needs you" whatever the state says (a letter that failed its number check leaves the case in `drafting`). */
export function buildSteps(state: CaseState, summaries: StepSummaries = {}, blocked?: StepKey): Step[] {
  const { at, status } = position(state, summaries);
  return STEP_KEYS.map((key, i) => {
    const st: StepStatus = key === blocked ? "needs_you" : i < at ? "done" : i === at ? status : "waiting";
    return { key, title: STEP_TITLES[key] + SUFFIX[st], status: st, summary: summaries[key] ?? "" };
  });
}
