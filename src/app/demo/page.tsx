import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DemoBadge, SimulatedBadge } from "@/components/snap/Badges";
import { DEMO_CASE_ID, demoClockFor } from "@/lib/caseFlow";
import { demoControlsEnabled } from "@/lib/server/flags";
import { getServerStore } from "@/lib/server/store";
import { STATE_LABELS } from "@/lib/staff/dashboard";
import { formatDate } from "@/lib/templates/facts";
import { advanceDaysAction, deliverResponseAction, recordBasisAction, resetDemoAction } from "./actions";

export const instant = false;

const BUTTON = "flex min-h-14 w-full items-center justify-center rounded-input bg-white px-5 font-medium text-ink shadow-[inset_0_1px_0_var(--glint),0_0_0_1px_var(--color-rule),0_3px_0_var(--color-rule)] active:translate-y-[3px] active:shadow-[inset_0_1px_0_var(--glint),0_0_0_1px_var(--color-rule)]";

/** Controls for the demo video. Gated by DEMO_CONTROLS (src/lib/server/flags.ts); anyone else sees the not-available page. */
export default async function DemoPage() {
  await connection();
  if (!demoControlsEnabled()) notFound();
  const store = await getServerStore();
  const clock = await demoClockFor(store);
  const c = await store.cases.get(DEMO_CASE_ID);
  const letter = (await store.responses.list({ caseId: DEMO_CASE_ID }))[0];
  const res = await store.resolutions.get(DEMO_CASE_ID);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col gap-6 px-6 py-10 text-ink">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl">Demo Controls</h1>
        <DemoBadge />
        <SimulatedBadge />
      </div>
      <p>For the demo video. Everything here moves the in-process demo store; nothing leaves this server.</p>
      <p role="status" className="rounded-card bg-paper-2 px-4 py-3">
        Demo clock: {formatDate(clock.now().slice(0, 10))}. Demo case {c ? `${c.code}: ${STATE_LABELS[c.state]}` : "not in the store"}.
        {letter ? ` Hospital letter received ${formatDate(letter.receivedAt.slice(0, 10))}.` : ""}
        {res?.basisDocumentId ? " Basis letter recorded." : ""}
      </p>
      <div className="flex flex-col gap-3">
        <form action={resetDemoAction}>
          <button type="submit" className={BUTTON}>Reset demo</button>
        </form>
        <form action={advanceDaysAction}>
          <button type="submit" className={BUTTON}>Advance 12 days</button>
        </form>
        <form action={deliverResponseAction}>
          <button type="submit" className={BUTTON}>Deliver the hospital&rsquo;s response now</button>
        </form>
        <form action={recordBasisAction}>
          <button type="submit" className={BUTTON}>Record basis letter as staff</button>
        </form>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        <li>
          <a href={`/case/${DEMO_CASE_ID}`}>Open the demo case</a>
        </li>
        <li>
          <a href="/snap">Snap a bill</a>
        </li>
        <li>
          <a href="/staff">Staff dashboard</a>
        </li>
      </ul>
    </main>
  );
}
