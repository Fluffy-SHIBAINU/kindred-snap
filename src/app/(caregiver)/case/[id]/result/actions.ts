"use server";

import { notFound, redirect } from "next/navigation";
import { approveAndSend, closeCase, DEMO_CASE_ID, demoClockFor } from "@/lib/caseFlow";
import { demoControlsEnabled } from "@/lib/server/flags";
import { getServerStore } from "@/lib/server/store";
import { ensureWalkCase, isWalkId, sampleCaseHref, walkQuery, type WalkHints } from "@/lib/server/walk";

/** "Draft the letters and send": the one approval, then every draft is sent (simulated) and the case is `sent`. */
export async function approveAndSendAction(id: string, hints: WalkHints = {}): Promise<void> {
  // the shared sample is never sent by a visitor (an old link to /case/demo): the send lands on a private copy instead; the /demo video controls keep it
  if (id === DEMO_CASE_ID && !demoControlsEnabled()) redirect(sampleCaseHref("done", { sent: true }));
  const store = await getServerStore();
  if (isWalkId(id)) {
    // the walk case is rebuilt (on a cold instance) and sent in one go; the hint carries "sent" to every later page
    const sent = { ...hints, sent: true };
    await ensureWalkCase(store, id, sent);
    redirect(`/case/${id}/done${walkQuery(sent)}`);
  }
  const c = await store.cases.get(id);
  if (!c) notFound();
  // shortcut: the helper is whoever owns the case until Phase 6 adds sign-in
  await approveAndSend(store, id, { id: c.ownerId, role: "helper" }, (await demoClockFor(store)).now());
  redirect(`/case/${id}/done`);
}

/** "Done for now": close the case without sending anything. */
export async function closeCaseAction(id: string): Promise<void> {
  const store = await getServerStore();
  if (!(await store.cases.get(id))) notFound();
  await closeCase(store, id, (await demoClockFor(store)).now());
  redirect(`/case/${id}/resolved`);
}
