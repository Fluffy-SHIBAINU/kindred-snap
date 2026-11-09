import type { ReactNode } from "react";

/** A white card with one h2 the section is labelled by. `badges` sit on the heading row. */
export function Panel({ id, title, badges, children }: { id: string; title: string; badges?: ReactNode; children: ReactNode }) {
  const headingId = `${id}-h`;
  return (
    <section id={id} aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3.5 rounded-card bg-white p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-lg">{title}</h2>
        {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** `demo` is the paper-3 fill for "Demo partner · synthetic data"; `synthetic` is the outlined "Simulated" or "Synthetic data". */
export function Badge({ tone, children }: { tone: "demo" | "synthetic"; children: ReactNode }) {
  const fill = tone === "demo" ? "bg-paper-3 text-ink" : "text-ink-2 shadow-[inset_0_0_0_1px_var(--color-rule)]";
  return <span className={`inline-flex min-h-7 w-max items-center rounded-pill px-2.5 text-sm font-medium ${fill}`}>{children}</span>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}
