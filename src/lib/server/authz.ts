import type { Case, Role } from "@/lib/types";

export type Viewer = { id: string; role: Role };

/** Staff and admins see every case. */
export function canStaff(viewer: Viewer | null): boolean {
  return viewer?.role === "staff" || viewer?.role === "admin";
}

/** The case owner, or staff. Everyone else gets the not-available page. */
export function canReadCase(viewer: Viewer | null, c: Pick<Case, "ownerId">): boolean {
  return !!viewer && (viewer.id === c.ownerId || canStaff(viewer));
}
