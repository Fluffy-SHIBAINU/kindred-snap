"use server";

import { redirect } from "next/navigation";
import { resumeInvestigation, runInvestigation } from "@/lib/pipeline";
import { extractDocument, getCase, hrefFor, pipelineDeps, storeDocument, uploadFrom } from "@/lib/server/cases";

const PARKED = ["needs_notice", "connector_unavailable"];

/** A photo of the paper Medicare notice: stored as the case's msn document, then the investigation continues from step 2. */
export async function addNoticeAndResume(formData: FormData): Promise<void> {
  const id = String(formData.get("caseId") ?? "");
  const { store, c } = await getCase(id);
  if (!c) redirect("/snap");
  if (!PARKED.includes(c.state)) redirect(hrefFor(c));
  const up = await uploadFrom(formData);
  const r = up && (await extractDocument(id, "msn", up));
  if (!r || !r.ok) redirect(`/case/${id}/working?error=${encodeURIComponent(r ? r.reason : "No photo or file was chosen.")}`);
  await storeDocument(store, r.doc);
  await resumeInvestigation(store, id, pipelineDeps(), { delayMs: 400 });
  redirect(`/case/${id}/working`);
}

/** Asks the synthetic Medicare connector again: a retry from `connector_unavailable`, or a fresh run from `needs_notice`. */
export async function retryMedicare(formData: FormData): Promise<void> {
  const id = String(formData.get("caseId") ?? "");
  const { store, c } = await getCase(id);
  if (!c) redirect("/snap");
  if (!PARKED.includes(c.state)) redirect(hrefFor(c));
  // resumeInvestigation only re-asks the connector from connector_unavailable; needs_notice → reading is legal, so the run starts over from the bill on file
  if (c.state === "needs_notice") await runInvestigation(store, id, pipelineDeps(), { delayMs: 400 });
  else await resumeInvestigation(store, id, pipelineDeps(), { delayMs: 400 });
  redirect(`/case/${id}/working`);
}
