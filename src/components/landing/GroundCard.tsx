"use client";

import { useState } from "react";

/**
 * The ground card (Theme Factory as an interactive card): one screen, three Dose grounds.
 * Pressing the button cycles white paper → green ground → night. Tokens only; the grounds are
 * the three named in DESIGN.md §3. Children render inside the card and inherit its colours.
 */
const GROUNDS = [
  { name: "White paper", bg: "var(--color-paper)", ink: "var(--color-ink)", btnBg: "var(--color-accent)", btnInk: "var(--color-accent-ink)" },
  { name: "Green ground", bg: "var(--color-green-ground)", ink: "var(--color-accent-ink)", btnBg: "var(--color-accent-ink)", btnInk: "var(--color-accent-deep)" },
  { name: "Night", bg: "var(--color-night)", ink: "var(--color-accent-ink)", btnBg: "var(--color-accent-soft)", btnInk: "var(--color-ink)" },
] as const;

export default function GroundCard({ children }: { children: React.ReactNode }) {
  const [i, setI] = useState(0);
  const g = GROUNDS[i];
  return (
    <div className="grid gap-6 md:grid-cols-2 md:items-center">
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">One system, three grounds</h2>
        <p>The same screen on white paper, the green ground and night. Press to change.</p>
        <button
          type="button"
          onClick={() => setI((i + 1) % GROUNDS.length)}
          className="h-14 w-fit min-w-52 rounded-input bg-white px-5 font-medium shadow-[inset_0_1px_0_#fff,0_0_0_1px_var(--color-rule),0_3px_0_var(--color-rule)] transition-transform duration-[120ms] active:translate-y-[3px]"
        >
          Change the ground
        </button>
        <p role="status" aria-atomic="true" className="text-muted">Ground: {g.name}</p>
      </div>
      <div
        className="rounded-card p-6 shadow-card transition-colors duration-[220ms]"
        style={{ background: g.bg, color: g.ink, ["--card-btn-bg" as string]: g.btnBg, ["--card-btn-ink" as string]: g.btnInk }}
      >
        {children}
      </div>
    </div>
  );
}
