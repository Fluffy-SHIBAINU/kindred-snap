import { notFound } from "next/navigation";
import { connection } from "next/server";

export type StaffRole = "staff" | "anonymous";

/** The dev bypass: STAFF_BYPASS=1 outside production, or anywhere when ALLOW_DEMO=1. Phase 6 adds the Supabase profile role. */
export function roleFromEnv(env: NodeJS.ProcessEnv = process.env): StaffRole {
  const allowed = env.NODE_ENV !== "production" || env.ALLOW_DEMO === "1";
  return env.STAFF_BYPASS === "1" && allowed ? "staff" : "anonymous";
}

/** Decided per request, never prerendered into a static shell. */
export async function currentRole(): Promise<StaffRole> {
  await connection();
  return roleFromEnv();
}

/** Returns the role, or throws notFound() so a non-staff request sees the not-available page and never the data. */
export async function requireStaff(): Promise<"staff"> {
  const role = await currentRole();
  if (role !== "staff") notFound();
  return role;
}
