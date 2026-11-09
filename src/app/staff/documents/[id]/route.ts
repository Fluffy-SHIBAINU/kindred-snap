import { createReadStream, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { currentRole } from "@/lib/server/auth";
import { getServerStore } from "@/lib/server/store";

const DOCS_DIR = join(process.cwd(), "fixtures", "documents");
const SAFE_PNG = /^[A-Za-z0-9._-]+\.png$/;

/** Streams a document's fixture image to staff only. Anyone else gets the same 404 as the rest of /staff, never the file. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  if ((await currentRole()) !== "staff") return new Response("Not available", { status: 404 });
  const { id } = await ctx.params;
  const doc = await (await getServerStore()).documents.get(id);
  // basename plus an allow-list keeps a stored fileName from ever pointing outside fixtures/documents
  const file = doc ? basename(doc.fileName) : "";
  if (!file || !SAFE_PNG.test(file) || !existsSync(join(DOCS_DIR, file))) return new Response("Not available", { status: 404 });
  const body = Readable.toWeb(createReadStream(join(DOCS_DIR, file))) as ReadableStream;
  return new Response(body, { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
}
