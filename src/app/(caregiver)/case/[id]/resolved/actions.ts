"use server";

import { redirect } from "next/navigation";
import { deleteCase, demoClockFor } from "@/lib/caseFlow";
import { HELPER } from "@/lib/server/cases";
import { getServerStore } from "@/lib/server/store";

/** "Delete everything on this case": documents, letters and personal fields go; the audit log keeps that a case existed. */
export async function deleteCaseAction(id: string): Promise<void> {
  const store = await getServerStore();
  await deleteCase(store, id, HELPER, (await demoClockFor(store)).now());
  redirect("/snap");
}
