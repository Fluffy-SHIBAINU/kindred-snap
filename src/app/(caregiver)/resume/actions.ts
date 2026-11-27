"use server";

import { redirect } from "next/navigation";
import { canOpenCase, caseViewer } from "@/lib/server/access";
import { hrefFor, normalizeCode } from "@/lib/server/cases";
import { getServerStore } from "@/lib/server/store";

/** Finds the case by its code and sends the caregiver to its current screen. A case this viewer may not open answers as an unknown code. */
export async function resumeByCode(formData: FormData): Promise<void> {
  const code = normalizeCode(String(formData.get("code") ?? ""));
  const c = code ? (await (await getServerStore()).listCases()).find((x) => x.code === code) : undefined;
  if (!c || !canOpenCase(await caseViewer(), c)) redirect("/resume?notfound=1");
  redirect(hrefFor(c));
}
