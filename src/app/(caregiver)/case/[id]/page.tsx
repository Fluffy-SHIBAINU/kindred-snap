import { redirect } from "next/navigation";
import { caseAccess } from "@/lib/server/access";
import { hrefFor } from "@/lib/server/cases";
import { parseWalkHints } from "@/lib/server/walk";

/** Reads the store per request; nothing here can be prerendered. */
export const instant = false;

/** Pause and resume: /case/[id] always lands on the one screen the case's state calls for. */
export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const hints = parseWalkHints(await searchParams);
  const { c } = await caseAccess(id, hints);
  redirect(hrefFor(c, hints));
}
