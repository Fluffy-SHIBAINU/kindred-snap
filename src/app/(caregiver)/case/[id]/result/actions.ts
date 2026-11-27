"use server";

import { redirect } from "next/navigation";
import { approveAndSend, closeCase, demoClockFor } from "@/lib/caseFlow";
import { caseAccess } from "@/lib/server/access";
import { isWalkId, walkQuery, type WalkHints } from "@/lib/server/walk";

/** "Draft the letters and send": the one approval, then every draft is sent (simulated) and the case is `sent`. */
export async function approveAndSendAction(id: string, hints: WalkHints = {}): Promise<void> {
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
