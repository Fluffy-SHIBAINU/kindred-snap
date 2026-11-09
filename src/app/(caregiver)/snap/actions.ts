"use server";

import { redirect } from "next/navigation";
import { buildSteps } from "@/lib/progress";
import { extractDocument, fieldValue, fixtureKeyOf, HELPER, newCaseCode, now, storeDocument, uploadFrom } from "@/lib/server/cases";
import { getServerStore } from "@/lib/server/store";
import type { Case } from "@/lib/types";

const unreadableHref = (reason: string) => "/snap?unreadable=" + encodeURIComponent(reason);

/** The bill photo (or the demo bill) becomes a new case in `created`; an unreadable photo re-shows /snap with the reason. */
export async function createCaseFromUpload(formData: FormData): Promise<void> {
  const up = await uploadFrom(formData);
  if (!up) redirect(unreadableHref("No photo or file was chosen."));
  const id = crypto.randomUUID();
  const r = await extractDocument(id, "bill", up);
  if (!r.ok) redirect(unreadableHref(r.reason));

  const { doc } = r;
  const at = now();
  const c: Case = {
    id,
    code: newCaseCode(),
    state: "created",
    patientName: fieldValue(doc.fields, "patient_name") ?? "the patient",
    hospitalName: fieldValue(doc.fields, "hospital_name") ?? "Riverbend Community Hospital",
    ownerId: HELPER.id,
    fixtureKey: fixtureKeyOf(up.bytes),
    consent: null,
    income: null,
    dueDate: doc.billTotals?.dueDate,
    balanceCents: doc.billTotals?.patientOwesCents,
    steps: buildSteps("created"),
    createdAt: at,
    updatedAt: at,
  };
  const store = await getServerStore();
  await store.cases.put(c);
  await store.appendAudit(id, { at, actor: HELPER.id, role: HELPER.role, action: "case.created", details: { code: c.code, fixtureKey: c.fixtureKey ?? null } });
  await storeDocument(store, doc);
  redirect(`/case/${id}/income`);
}
