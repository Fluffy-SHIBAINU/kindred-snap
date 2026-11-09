import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The synthetic demo bill as a download, so a visitor can run the flow with a file of their own.
 * Served from the fixture itself, never a copy, so its bytes match fixtures/documents/index.json and the
 * fixture extractor recognises the upload.
 */
export async function GET() {
  const bytes = readFileSync(join(process.cwd(), "fixtures", "documents", "bill-main.png"));
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": 'attachment; filename="kindred-snap-demo-bill.png"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
