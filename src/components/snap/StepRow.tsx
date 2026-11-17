import type { ReactNode } from "react";
import type { Step, StepStatus } from "@/lib/types";
import { CheckIcon, SpinnerIcon } from "./icons";

/** DESIGN.md §3: done = mint + check + the word; active = accent ring + "working"; waiting = paper-2 + "Next"; needs you = white tray. */
const ROW: Record<StepStatus, string> = {
  done: "bg-accent-soft",
  active: "bg-white shadow-[0_0_0_2px_var(--color-accent),var(--shadow-card)]",
  waiting: "bg-paper-2 text-ink-2",
  needs_you: "bg-white shadow-[0_0_0_1px_var(--color-rule),var(--shadow-card)]",
};
const ICON: Record<StepStatus, string> = {
  done: "bg-accent text-accent-ink",
  active: "bg-white text-accent shadow-[0_0_0_1px_var(--color-accent)]",
  waiting: "bg-white text-muted shadow-[0_0_0_1px_var(--color-rule)]",
  needs_you: "bg-white text-ink shadow-[0_0_0_1px_var(--color-rule)]",
};

type Props = {
  step: Step;
  /** sits beside the summary (a badge) */
  children?: ReactNode;
  /** drawn in a waiting row's circle, which is empty on every other screen (private mode's working screen, mock PM2) */
  waitingIcon?: ReactNode;
  /** a done row's summary in ink-2: muted on the mint ground is 4.44:1, under AA. Private mode only; off for every other screen */
  strong?: boolean;
};

/** One row of the progress feed; the status word is already in `step.title` (progress.ts). Render inside an <ol>. */
export function StepRow({ step, children, waitingIcon, strong }: Props) {
  const sub = step.summary || (step.status === "waiting" ? "Next" : "");
  return (
    <li className={"flex items-start gap-3.5 rounded-card px-4 py-2 " + ROW[step.status]} aria-current={step.status === "active" ? "step" : undefined}>
      <span className={"flex size-7 shrink-0 items-center justify-center rounded-pill " + ICON[step.status]}>
        {step.status === "done" ? <CheckIcon /> : step.status === "active" ? <SpinnerIcon /> : step.status === "waiting" ? waitingIcon : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{step.title}</div>
        {(sub || children) && (
          <div className={"flex flex-wrap items-center gap-2 text-sm " + (strong && step.status === "done" ? "text-ink-2" : "text-muted")}>
            {sub}
            {children}
          </div>
        )}
      </div>
    </li>
  );
}
