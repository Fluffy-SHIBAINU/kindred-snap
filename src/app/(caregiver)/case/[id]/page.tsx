import { notFound, redirect } from "next/navigation";
import { getCase, hrefFor } from "@/lib/server/cases";

/** Reads the store per request; nothing here can be prerendered. */
export const instant = false;

/** Pause and resume: /case/[id] always lands on the one screen the case's state calls for. */
export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { c } = await getCase(id);
  if (!c) notFound();
  redirect(hrefFor(c));
}
