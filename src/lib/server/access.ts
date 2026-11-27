import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Store } from "@/lib/adapters/store/types";
import { DEMO_CASE_ID } from "@/lib/caseFlow";
import type { Actor, Case } from "@/lib/types";
import { currentRole } from "./auth";
import { canReadCase, type Viewer } from "./authz";
import { demoControlsEnabled } from "./flags";
import { getServerStore } from "./store";
import { getViewer } from "./supabaseAuth";
import { ensureWalkCase, type WalkHints } from "./walk";

/**
 * Who may open a case on the caregiver screens. A signed-in viewer is their Supabase user; anyone else is the anonymous
 * id this browser was given when it started its first case. Staff are the profile role, or STAFF_BYPASS (auth.ts).
 */

const VISITOR_COOKIE = "snap_visitor";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// a case waits weeks for the hospital's reply, so the browser keeps its id for a year
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;

/** "visitor:<uuid>" from this browser's cookie, or null. The prefix and the format check keep a forged cookie from naming any other owner. */
async function visitorId(): Promise<string | null> {
  const v = (await cookies()).get(VISITOR_COOKIE)?.value;
  return v && UUID.test(v) ? "visitor:" + v : null;
}

/** The viewer of this request, or null when it has neither a session nor a visitor id. */
export async function caseViewer(): Promise<Viewer | null> {
  const signedIn = await getViewer();
  const id = signedIn?.id ?? (await visitorId());
  if ((await currentRole()) === "staff") return { id: id ?? "staff", role: "staff" };
  return signedIn ?? (id ? { id, role: "helper" } : null);
}

/** The owner of a case this request starts: the signed-in user, else this browser's visitor id, minted here. Server actions only: it writes a cookie. */
export async function newCaseOwner(): Promise<string> {
  const signedIn = await getViewer();
  if (signedIn) return signedIn.id;
  const existing = await visitorId();
  if (existing) return existing;
  const v = crypto.randomUUID();
  (await cookies()).set(VISITOR_COOKIE, v, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: VISITOR_MAX_AGE });
  return "visitor:" + v;
}

/** The seeded showcase the landing links to ("See a case"): synthetic, so anyone may read it; only DEMO_CONTROLS changes it. */
const isShowcase = (c: Pick<Case, "id">) => c.id === DEMO_CASE_ID;

/** The owner or staff (canReadCase), or anyone for the showcase. */
export const canOpenCase = (viewer: Viewer | null, c: Pick<Case, "id" | "ownerId">) => canReadCase(viewer, c) || isShowcase(c);

export type CaseAccess = { store: Store; c: Case; canWrite: boolean; actor: Actor };

/**
 * Every caregiver page and server action that reads or changes a case starts here, before any case data is read out.
 * A viewer who may not open the case gets notFound(), the same page as for a case that does not exist. Changes (income,
 * notice, send, close, delete) are the owner's own; staff read here and act in the staff workspace. `write: true`
 * refuses anyone else. A walk case is rebuilt from its URL for its owner only (walk.ts).
 */
export async function caseAccess(id: string, hints: WalkHints = {}, opts: { write?: boolean } = {}): Promise<CaseAccess> {
  const viewer = await caseViewer();
  const store = await getServerStore();
  await ensureWalkCase(store, id, hints, viewer);
  const c = await store.cases.get(id);
  if (!c || !canOpenCase(viewer, c)) notFound();
  const canWrite = isShowcase(c) ? demoControlsEnabled() : viewer?.id === c.ownerId;
  if (opts.write && !canWrite) notFound();
  return { store, c, canWrite, actor: { id: c.ownerId, role: "helper" } };
}
