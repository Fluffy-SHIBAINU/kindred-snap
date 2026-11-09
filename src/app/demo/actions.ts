"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import type { Store } from "@/lib/adapters/store/types";
import { DEMO_CASE_ID, deliverResponse, demoClockFor, recordBasisLetter } from "@/lib/caseFlow";
import { demoControlsEnabled } from "@/lib/server/flags";
import { getServerStore } from "@/lib/server/store";

const DEMO_STAFF = { id: "demo-staff", role: "staff" } as const;

async function gated(): Promise<Store> {
  if (!demoControlsEnabled()) notFound();
  return getServerStore();
}

/** Drops the in-process store (cases, clock offset, audit) and reseeds it from the fixtures. */
export async function resetDemoAction(): Promise<void> {
  await gated();
  globalThis.__snapStore = undefined;
  await getServerStore();
  refresh();
}

export async function advanceDaysAction(): Promise<void> {
  (await demoClockFor(await gated())).advanceDays(12);
  refresh();
}

export async function deliverResponseAction(): Promise<void> {
  const store = await gated();
  await deliverResponse(store, DEMO_CASE_ID, (await demoClockFor(store)).now());
  refresh();
}

export async function recordBasisAction(): Promise<void> {
  const store = await gated();
  await recordBasisLetter(store, DEMO_CASE_ID, DEMO_STAFF, (await demoClockFor(store)).now());
  refresh();
}
