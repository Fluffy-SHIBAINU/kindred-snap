import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { sha256 } from "@/lib/adapters/extract/fixture";
import type { Store } from "@/lib/adapters/store/types";
import { DEMO_CASE_ID } from "@/lib/caseFlow";
import { DEMO_STAFF } from "@/lib/staff/caseDetail";
import type { Actor, Case } from "@/lib/types";
import { currentRole } from "./auth";
import { canReadCase, canStaff, type Viewer } from "./authz";
import { demoControlsEnabled } from "./flags";
import { getServerStore } from "./store";
import { getViewer } from "./supabaseAuth";
import { ensureWalkCase, isWalkId, type WalkHints } from "./walk";

/**
 * Who may open a case on the caregiver screens. A signed-in viewer is their Supabase user; anyone else is the anonymous
 * id this browser was given when it started its first case. Staff are the profile role, or STAFF_BYPASS (auth.ts).
 */

const VISITOR_COOKIE = "snap_visitor";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// a case waits weeks for the hospital's reply, so the browser keeps its id for a year
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;

/** The owner id a cookie stands for. Only the digest is stored, so an owner id read from a case row or the audit log cannot be replayed as the cookie. */
const ownerIdOf = (secret: string) => "visitor:" + sha256(new TextEncoder().encode(secret));

/** This browser's owner id, or null. The format check and the prefix keep a forged cookie from naming any other owner. */
async function visitorId(): Promise<string | null> {
  const v = (await cookies()).get(VISITOR_COOKIE)?.value;
  return v && UUID.test(v) ? ownerIdOf(v) : null;
}

type Who = { signedIn: Viewer | null; visitor: string | null; bypass: boolean };

const who = async (): Promise<Who> => ({ signedIn: await getViewer(), visitor: await visitorId(), bypass: (await currentRole()) === "staff" });

/**
 * The viewer for a case owned by `ownerId`: the session, else this browser's visitor id, or null with neither. A case this
 * browser started as a guest stays this browser's after signing in, as the guest line on the case screens promises.
 */
function viewerOf({ signedIn, visitor, bypass }: Who, ownerId?: string): Viewer | null {
  const id = visitor && visitor === ownerId ? visitor : (signedIn?.id ?? visitor);
  const role = bypass ? "staff" : (signedIn?.role ?? "helper");
  return id ? { id, role } : bypass ? { id: "staff", role } : null;
}

/** The viewer of this request for a case owned by `ownerId`. */
export const caseViewer = async (ownerId?: string) => viewerOf(await who(), ownerId);

/** The owner of a case this request starts: the signed-in user, else this browser's visitor id, minted here. Server actions only: it writes a cookie. */
export async function newCaseOwner(): Promise<string> {
  const signedIn = await getViewer();
  if (signedIn) return signedIn.id;
  const existing = await visitorId();
  if (existing) return existing;
  const v = crypto.randomUUID();
  (await cookies()).set(VISITOR_COOKIE, v, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: VISITOR_MAX_AGE });
  return ownerIdOf(v);
}

/** The seeded showcase the landing links to ("See a case"): synthetic, so anyone may read it; only DEMO_CONTROLS changes it. */
const isShowcase = (c: Pick<Case, "id">) => c.id === DEMO_CASE_ID;

/** The owner or staff (canReadCase), or anyone for the showcase. */
export const canOpenCase = (viewer: Viewer | null, c: Pick<Case, "id" | "ownerId">) => canReadCase(viewer, c) || isShowcase(c);

/** `guest`: the case is this browser's and nobody is signed in, so the screens say where it can be reopened. */
export type CaseAccess = { store: Store; c: Case; canWrite: boolean; actor: Actor; guest: boolean };

/**
 * Every caregiver page and server action that reads or changes a case starts here, before any case data is read out.
 * A viewer who may not open the case gets notFound(), the same page as for a case that does not exist. Changes (income,
 * notice, send, close, delete) are the owner's own; staff read here and act in the staff workspace. `write: true`
 * refuses anyone else. A walk case is rebuilt from its URL for its owner only (walk.ts). A staff view of someone else's
 * case is logged.
 */
export async function caseAccess(id: string, hints: WalkHints = {}, opts: { write?: boolean } = {}): Promise<CaseAccess> {
  const w = await who();
  const store = await getServerStore();
  let c = await store.cases.get(id);
  if (isWalkId(id)) {
    await ensureWalkCase(store, id, hints, viewerOf(w, c?.ownerId));
    c = await store.cases.get(id);
  }
  const viewer = viewerOf(w, c?.ownerId);
  if (!c || !canOpenCase(viewer, c)) notFound();
  const owner = viewer?.id === c.ownerId;
  const canWrite = isShowcase(c) ? demoControlsEnabled() : owner;
  if (opts.write && !canWrite) notFound();
  // who, which case and when; nothing of the case itself goes in the event
  if (!owner && canStaff(viewer)) await store.appendAudit(c.id, { at: new Date().toISOString(), actor: w.signedIn?.id ?? DEMO_STAFF.id, role: "staff", action: "case.viewed" });
  return { store, c, canWrite, actor: { id: c.ownerId, role: "helper" }, guest: owner && !w.signedIn };
}
