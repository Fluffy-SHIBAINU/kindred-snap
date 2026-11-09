"use server";

import { redirect } from "next/navigation";
import { runInvestigation } from "@/lib/pipeline";
import { extractDocument, getCase, HELPER, hrefFor, incomeCentsFrom, now, parseIncome, pipelineDeps, storeDocument, uploadFrom } from "@/lib/server/cases";
import type { Consent } from "@/lib/types";

/** Records income, household size and the consent sentence, then runs the whole investigation before showing /working. */
export async function setIncomeAndStart(formData: FormData): Promise<void> {
  const id = String(formData.get("caseId") ?? "");
  const { store, c } = await getCase(id);
  if (!c) redirect("/snap");
  if (c.state !== "created") redirect(hrefFor(c));

  const annualCents = parseIncome(String(formData.get("income") ?? ""));
  if (annualCents == null) redirect(`/case/${id}/income?error=income`);
  const householdSize = Number(formData.get("household"));
  if (!Number.isInteger(householdSize) || householdSize < 1 || householdSize > 20) redirect(`/case/${id}/income?error=household`);

  const at = now();
  const consent: Consent = { caseId: id, grantedAt: at, grantedBy: HELPER.id, role: HELPER.role, scope: "investigate_and_prepare" };
  const source = c.income?.source === "document" && c.income.annualCents === annualCents ? "document" : "typed";
  await store.consents.put(consent);
  await store.cases.put({ ...c, consent, income: { annualCents, householdSize, source }, updatedAt: at });
  await store.appendAudit(id, { at, actor: HELPER.id, role: HELPER.role, action: "consent.granted", details: { scope: consent.scope } });

  await runInvestigation(store, id, pipelineDeps(), { delayMs: 400 });
  redirect(`/case/${id}/working`);
}

/** "Snap a document instead": reads an income document and fills the income field from it. */
export async function addIncomeDocument(formData: FormData): Promise<void> {
  const id = String(formData.get("caseId") ?? "");
  const { store, c } = await getCase(id);
  if (!c) redirect("/snap");
  const up = await uploadFrom(formData);
  const r = up && (await extractDocument(id, "income", up));
  const annualCents = r && r.ok ? incomeCentsFrom(r.doc.fields) : null;
  if (!r || !r.ok || annualCents == null) redirect(`/case/${id}/income?error=document`);
  await storeDocument(store, r.doc);
  await store.cases.put({ ...c, income: { annualCents, householdSize: c.income?.householdSize ?? 1, source: "document" }, updatedAt: now() });
  redirect(`/case/${id}/income`);
}
