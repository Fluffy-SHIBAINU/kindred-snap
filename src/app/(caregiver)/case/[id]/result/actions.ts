"use server";

import { redirect } from "next/navigation";
import { approveAndSend, closeCase, DEMO_CASE_ID, demoClockFor } from "@/lib/caseFlow";
import { caseAccess, newCaseOwner } from "@/lib/server/access";
import { demoControlsEnabled } from "@/lib/server/flags";
import { isWalkId, sampleCaseHref, walkQuery, type WalkHints } from "@/lib/server/walk";

/** "Draft the letters and send": the one approval, then every draft is sent (simulated) and the case is `sent`. */
export async function approveAndSendAction(id: string, hints: WalkHints = {}): Promise<void> {
  if (id === DEMO_CASE_ID && !demoControlsEnabled()) {
    // the shared sample is never sent by a visitor (an old link to /case/demo): the send lands on a private copy, owned by this browser; the /demo video controls keep it
    await newCaseOwner();
    redirect(sampleCaseHref("done", { sent: true }));
  }
  if (isWalkId(id)) {
    // the walk case is rebuilt (on a cold instance) and sent in one go; the hint carries "sent" to every later page
    const sent = { ...hints, sent: true };
    await caseAccess(id, sent, { write: true });
    redirect(`/case/${id}/done${walkQuery(sent)}`);
  }
  const { store, actor } = await caseAccess(id, {}, { write: true });
  await approveAndSend(store, id, actor, (await demoClockFor(store)).now());
  redirect(`/case/${id}/done`);
}

/** "Done for now": close the case without sending anything. */
export async function closeCaseAction(id: string): Promise<void> {
  const { store } = await caseAccess(id, {}, { write: true });
  await closeCase(store, id, (await demoClockFor(store)).now());
  redirect(`/case/${id}/resolved`);
}
