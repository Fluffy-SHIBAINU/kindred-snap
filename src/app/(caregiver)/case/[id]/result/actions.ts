"use server";

import { notFound, redirect } from "next/navigation";
import { approveAndSend, closeCase, demoClockFor } from "@/lib/caseFlow";
import { getServerStore } from "@/lib/server/store";

/** "Draft the letters and send": the one approval, then every draft is sent (simulated) and the case is `sent`. */
export async function approveAndSendAction(id: string): Promise<void> {
  const store = await getServerStore();
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
