"use server";

import { redirect } from "next/navigation";
import { deleteCase, demoClockFor } from "@/lib/caseFlow";
import { caseAccess } from "@/lib/server/access";

/** "Delete documents, findings and responses": what DELETE_TEXT (caseFlow.ts) says goes and stays. */
export async function deleteCaseAction(id: string): Promise<void> {
  const { store, actor } = await caseAccess(id, {}, { write: true });
  await deleteCase(store, id, actor, (await demoClockFor(store)).now());
  redirect("/snap");
}
