import type { CaseState } from "@/lib/case/state";

/** Resume-by-state: every case state has exactly one caregiver screen. */
export function screenFor(state: CaseState): "/snap" | "/working" | "/result" | "/done" | "/resolved" {
  switch (state) {
    case "created":
    case "reading":
    case "unreadable":
      return "/snap";
    case "needs_notice":
    case "connector_unavailable":
    case "comparing":
    case "checking_assistance":
    case "drafting":
    case "needs_review":
      return "/working";
    case "ready_to_send":
      return "/result";
    case "sent":
    case "responded":
      return "/done";
    case "resolved":
    case "closed":
      return "/resolved";
  }
}
