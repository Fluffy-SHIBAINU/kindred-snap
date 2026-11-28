"use server";

import { redirect } from "next/navigation";
import { runInvestigation } from "@/lib/pipeline";
import { caseAccess } from "@/lib/server/access";
import { extractDocument, hrefFor, incomeCentsFrom, now, parseIncome, pipelineDeps, storeDocument, uploadFrom } from "@/lib/server/cases";
import { isWalkId, walkQuery } from "@/lib/server/walk";
import type { Consent } from "@/lib/types";

/** Records income, household size and the consent sentence, then runs the whole investigation before showing /working. */
export async function setIncomeAndStart(formData: FormData): Promise<void> {
  const id = String(formData.get("caseId") ?? "");
  if (isWalkId(id)) {
    // a walk case may be missing on this instance; the hints rebuild it here and on every later page
    const incomeCents = parseIncome(String(formData.get("income") ?? "")) ?? 3756000;
    const hh = Number(formData.get("household"));
    const hints = { incomeCents, householdSize: Number.isInteger(hh) && hh >= 1 && hh <= 20 ? hh : 1 };
    await caseAccess(id, hints, { write: true });
    redirect(`/case/${id}/working${walkQuery(hints)}`);
  }
  const { store, c, actor } = await caseAccess(id, {}, { write: true });
  if (c.state !== "created") redirect(hrefFor(c));

  const annualCents = parseIncome(String(formData.get("income") ?? ""));
  if (annualCents == null) redirect(`/case/${id}/income?error=income`);
  const householdSize = Number(formData.get("household"));
  if (!Number.isInteger(householdSize) || householdSize < 1 || householdSize > 20) redirect(`/case/${id}/income?error=household`);

  const at = now();
  const consent: Consent = { caseId: id, grantedAt: at, grantedBy: actor.id, role: "helper", scope: "investigate_and_prepare" };
  const source = c.income?.source === "document" && c.income.annualCents === annualCents ? "document" : "typed";
  await store.consents.put(consent);
  await store.cases.put({ ...c, consent, income: { annualCents, householdSize, source }, updatedAt: at });
  await store.appendAudit(id, { at, actor: actor.id, role: actor.role, action: "consent.granted", details: { scope: consent.scope } });

  await runInvestigation(store, id, pipelineDeps(), { delayMs: 400 });
  redirect(`/case/${id}/working`);
}

/** "Snap a document instead": reads an income document and fills the income field from it. */
export async function addIncomeDocument(formData: FormData): Promise<void> {
  const id = String(formData.get("caseId") ?? "");
  const { store, c, actor } = await caseAccess(id, {}, { write: true });
  const up = await uploadFrom(formData);
  const r = up && (await extractDocument(id, "income", up));
  const annualCents = r && r.ok ? incomeCentsFrom(r.doc.fields) : null;
  if (!r || !r.ok || annualCents == null) redirect(`/case/${id}/income?error=document`);
  await storeDocument(store, r.doc, actor);
  await store.cases.put({ ...c, income: { annualCents, householdSize: c.income?.householdSize ?? 1, source: "document" }, updatedAt: now() });
  redirect(`/case/${id}/income`);
}
