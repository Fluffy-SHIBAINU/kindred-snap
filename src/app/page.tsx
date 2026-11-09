import type { Metadata } from "next";
import { SimulatedBadge } from "@/components/snap/Badges";
import { Clipping } from "@/components/snap/Clipping";
import { MoneyBlock } from "@/components/snap/MoneyBlock";
import GroundCard from "@/components/landing/GroundCard";
import ResultPreview, { demoResult } from "@/components/landing/ResultPreview";
import WindowDust from "@/components/landing/WindowDust";
import { formatUsd } from "@/lib/money";

export const metadata: Metadata = { title: "Kindred Snap" };

const focus = "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-focus";
const btnShape = "inline-flex min-h-14 min-w-[220px] items-center justify-center rounded-input px-5 font-medium no-underline transition-transform duration-150 ease-out hover:-translate-y-px active:translate-y-[3px]";
const btn = `${btnShape} ${focus}`;
const primary = `${btn} bg-accent text-accent-ink shadow-[0_0_0_1px_var(--color-accent-deep),0_3px_0_var(--color-accent-deep)] hover:bg-accent-deep`;
const secondary = `${btn} bg-white text-ink shadow-[0_0_0_1px_var(--color-rule),0_3px_0_var(--color-rule)] hover:text-accent`;
const wrap = "mx-auto w-full max-w-[1280px] px-4 sm:px-8";
const mono = "font-mono [font-variant-numeric:tabular-nums]";

export default function Landing() {
  const r = demoResult();
  const lineAmount = formatUsd(r.billLine.chargeCents);
  const billClip = (
    <Clipping
      line={`${r.billLine.n} ${r.billLine.code} ${r.billLine.description}`}
      amount={lineAmount}
      source={`Bill, line ${r.billLine.n}, statement dated ${r.statementDate}`}
    />
  );

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <a href="#main" className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-input focus:bg-white focus:px-4 focus:py-3 focus:font-medium ${focus}`}>
        Skip to content
      </a>

      <main id="main" className="flex flex-col">
        <section aria-labelledby="hero-h" className="relative flex items-center overflow-hidden lg:min-h-[900px]">
          <WindowDust />
          <div className={`${wrap} relative grid items-center gap-16 py-12 lg:grid-cols-[minmax(0,1fr)_390px] lg:py-7`}>
            <div className="flex min-w-0 flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-[250ms]">
              <h1 id="hero-h" className="max-w-[15ch] text-3xl leading-[1.15] tracking-[-0.02em] lg:text-display">
                Hospital Bills, Handled for Your Parent.
              </h1>
              <p className="max-w-[36ch] text-lg">Photograph the bill and Medicare notice; it finds the gap and drafts the letter.</p>
              <p className="max-w-[48ch] text-ink-2">
                Every finding shows the bill line it rests on, and the hospital&apos;s own assistance policy is quoted, not summarised.
              </p>
              <div className="flex flex-wrap gap-4">
                <a href="/snap" className={primary}>Snap a bill</a>
                <a href="/case/demo/result" className={secondary}>See a case</a>
                <a href="/demo-bill" download className={secondary}>Download a demo bill</a>
              </div>
              </div>
            <div className="h-[844px] w-full max-w-[390px] justify-self-center overflow-hidden rounded-[28px] bg-paper shadow-card ring-1 ring-rule">
              <ResultPreview />
            </div>
          </div>
        </section>

        <section aria-labelledby="how-h" className="py-24">
          <div className={`${wrap} flex flex-col gap-4`}>
            <h2 id="how-h" className="text-3xl">How a Case Moves</h2>
            <div className="mt-8 grid gap-8 lg:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-4">
                <h3>Read It</h3>
                <p className="max-w-[40ch]">Snap reads every line of the hospital bill and keeps the exact text it rests on.</p>
                {billClip}
              </div>
              <div className="flex min-w-0 flex-col gap-4">
                <h3>Compare It</h3>
                <p className="max-w-[40ch]">Medicare&apos;s notice for the same visit says this item is included in the CT scan payment.</p>
                <Clipping
                  line={`${r.msnLine.n} ${r.msnLine.service.replace(/ \(\d{4}-\d{2}-\d{2}\)$/, "")}`}
                  amount={formatUsd(r.msnLine.youMayBeBilledCents)}
                  source={<><SimulatedBadge /><span>Medicare Summary Notice, line {r.msnLine.n}, you may be billed</span></>}
                />
                <p className="text-sm text-ink-2">
                  The bill asks for <span className={mono}>{formatUsd(r.owesCents)}</span> where Medicare allows{" "}
                  <span className={mono}>{formatUsd(r.allowedCents)}</span>, a gap of <span className={mono}>{lineAmount}</span>: this one line.
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-4">
                <h3>Resolve It</h3>
                <p className="max-w-[40ch]">You approve the letter before anything is sent, and the hospital&apos;s answer updates the case.</p>
                <MoneyBlock amountCents={r.estimate.cents} kind="confirmed" note="Confirmed adjustment, letter dated 2026-11-21" />
                <SimulatedBadge />
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="ground-h" className="bg-paper-2 py-24">
          <div className={wrap}>
            <GroundCard>
              <div className="flex flex-col gap-4">
                <h3 className="text-xl text-inherit">
                  A <span className={mono}>{lineAmount}</span> Line Medicare Says the Patient Does Not Owe
                </h3>
                {billClip}
                <a
                  href="/case/demo/result"
                  className={`${btnShape} w-full bg-(--card-btn-bg) text-[color:var(--card-btn-ink)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-current`}
                >
                  Read the letter
                </a>
              </div>
            </GroundCard>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule py-8">
        <div className={`${wrap} flex flex-wrap items-center gap-6`}>
          <span className="text-lg font-extrabold tracking-[-0.02em]">Kindred Snap</span>
          <span className="grow" />
          <a href="/staff" className={`inline-flex min-h-12 items-center font-medium underline hover:text-accent ${focus}`}>Staff workspace</a>
          <span className="text-sm text-muted">Policy data: Waive atlas, CC BY 4.0.</span>
        </div>
      </footer>
    </div>
  );
}
