"use server";

import { redirect } from "next/navigation";
import { toCents } from "@/lib/money";
import { BasisRequired } from "@/lib/savings";
import { requireStaff } from "@/lib/server/auth";
import { demoControlsEnabled } from "@/lib/server/flags";
import { getServerStore } from "@/lib/server/store";
import { DEMO_STAFF, NotFoundInCase, ReasonRequired, WrongState, deliverResponse as deliver, editField as edit, recordResolution, reviewFinding } from "@/lib/staff/caseDetail";

type Tab = "documents" | "findings" | "actions" | "resolution";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "");

/** Known failures come back to the tab as a message; anything else is a bug and surfaces as one. */
function message(e: unknown): string {
  if (e instanceof ReasonRequired || e instanceof BasisRequired || e instanceof NotFoundInCase || e instanceof WrongState) return e.message;
  if (e instanceof Error && /New balance must be|not a number|not an amount|Not a dollar amount/i.test(e.message)) return e.message;
  throw e;
}

/** redirect() throws, so it runs after the try/catch that turns known errors into a message. */
function back(caseId: string, tab: Tab, error?: string): never {
  const q = new URLSearchParams({ tab });
  if (error) q.set("error", error);
  redirect(`/staff/cases/${caseId}?${q}`);
}

export async function editField(fd: FormData): Promise<void> {
  await requireStaff();
  const caseId = str(fd, "caseId");
  let error: string | undefined;
  try {
    await edit(await getServerStore(), { caseId, documentId: str(fd, "documentId"), key: str(fd, "key"), value: str(fd, "value"), actor: DEMO_STAFF, now: new Date().toISOString() });
  } catch (e) {
    error = message(e);
  }
  back(caseId, "documents", error);
}

export async function confirmFinding(fd: FormData): Promise<void> {
  await requireStaff();
  const caseId = str(fd, "caseId");
  let error: string | undefined;
  try {
    await reviewFinding(await getServerStore(), { caseId, findingId: str(fd, "findingId"), status: "confirmed", actor: DEMO_STAFF, now: new Date().toISOString() });
  } catch (e) {
    error = message(e);
  }
  back(caseId, "findings", error);
}

export async function dismissFinding(fd: FormData): Promise<void> {
  await requireStaff();
  const caseId = str(fd, "caseId");
  let error: string | undefined;
  try {
    await reviewFinding(await getServerStore(), { caseId, findingId: str(fd, "findingId"), status: "dismissed", reason: str(fd, "reason"), actor: DEMO_STAFF, now: new Date().toISOString() });
  } catch (e) {
    error = message(e);
  }
  back(caseId, "findings", error);
}

export async function deliverResponse(fd: FormData): Promise<void> {
  await requireStaff();
  const caseId = str(fd, "caseId");
  let error: string | undefined;
  if (!demoControlsEnabled()) error = "Demo controls are off";
  else {
    try {
      await deliver(await getServerStore(), caseId, DEMO_STAFF);
    } catch (e) {
      error = message(e);
    }
  }
  back(caseId, "actions", error);
}

export async function recordConfirmed(fd: FormData): Promise<void> {
  await requireStaff();
  const caseId = str(fd, "caseId");
  let error: string | undefined;
  try {
    const basis = str(fd, "basisDocumentId") || null;
    if (!basis) throw new BasisRequired("Choose the basis document: the hospital's response letter");
    const raw = str(fd, "newBalance").trim();
    if (!raw) throw new BasisRequired("Enter the new balance the letter states");
    await recordResolution(await getServerStore(), { caseId, basisDocumentId: basis, newBalanceCents: toCents(raw), actor: DEMO_STAFF, now: new Date().toISOString() });
  } catch (e) {
    error = message(e);
  }
  back(caseId, "resolution", error);
}
