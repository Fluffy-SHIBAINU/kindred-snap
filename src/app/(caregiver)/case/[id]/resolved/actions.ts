"use server";

import { redirect } from "next/navigation";
import { deleteCase, demoClockFor } from "@/lib/caseFlow";
import { caseAccess } from "@/lib/server/access";

/** "Delete everything on this case": documents, letters and personal fields go; the audit log keeps that a case existed. */
export async function deleteCaseAction(id: string): Promise<void> {
  const { store, actor } = await caseAccess(id, {}, { write: true });
  await deleteCase(store, id, actor, (await demoClockFor(store)).now());
  redirect("/snap");
}
