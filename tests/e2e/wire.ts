// What the upload specs share (private-upload.spec.ts, private-pdf.spec.ts): a pass-through that keeps every request
// exactly as the browser sent it, and the readers of what it kept. Port 3101, the stub reader.
import { createHash } from "node:crypto";
import { createServer, request as forward } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test as base, type Page } from "@playwright/test";

export const DOCS = "fixtures/documents/";

/** One request as it arrived: its line, its headers and its body. */
export type Sent = { line: string; headers: string; body: Buffer };
export type Part = { name: string; fileName: string | null; body: Buffer };

// Neither engine hands Playwright the bytes of an uploaded picture (Chromium gives no body at all, WebKit leaves the
// file parts empty), so each test opens the app through a pass-through that keeps every request exactly as it was sent.
export const test = base.extend<{ wire: { origin: string; sent: Sent[] } }>({
  wire: async ({ baseURL }, provide) => {
    const upstream = new URL(baseURL!);
    const sent: Sent[] = [];
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        sent.push({ line: `${req.method} ${req.url}`, headers: JSON.stringify(req.headers), body });
        // the Host header goes through as the browser wrote it, so the app sees the origin the page has
        const out = forward({ hostname: upstream.hostname, port: upstream.port, path: req.url, method: req.method, headers: req.headers }, (back) => {
          res.writeHead(back.statusCode ?? 502, back.headers);
          back.pipe(res);
        });
        out.on("error", () => res.destroy());
        out.end(body);
      });
    });
    await new Promise<void>((done) => server.listen(0, done));
    await provide({ origin: `http://localhost:${(server.address() as AddressInfo).port}`, sent });
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  },
});

export const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export const pick = (page: Page) => page.locator("input[type=file][multiple]");
export const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
/** Everything a request carried, as one run of bytes. */
export const whole = (s: Sent) => Buffer.concat([Buffer.from(`${s.line}\n${s.headers}\n`), s.body]);

/**
 * The requests that are anything but the page fetching pdf.js: its lazy chunk and the files under /pdf/, each a GET
 * with no body. Opening a PDF, even one that is then refused, needs those; it may cause nothing else.
 */
export const beyondPdfJs = (sent: Sent[]) => sent.filter((s) => !/^GET \/(pdf|_next\/static)\//.test(s.line) || s.body.length > 0).map((s) => s.line);

/** The parts of a multipart body. */
function partsOf(s: Sent): Part[] {
  const boundary = Buffer.from("--" + /boundary=([^;"]+)/.exec(s.headers)![1]);
  const parts: Part[] = [];
  let at = s.body.indexOf(boundary);
  for (let next = s.body.indexOf(boundary, at + 1); at !== -1 && next !== -1; at = next, next = s.body.indexOf(boundary, at + 1)) {
    // between two boundaries: a line break, the part's headers, a blank line, the bytes, a line break
    const part = s.body.subarray(at + boundary.length + 2, next - 2);
    const blank = part.indexOf("\r\n\r\n");
    const head = part.subarray(0, blank).toString("latin1");
    parts.push({ name: /\bname="([^"]*)"/.exec(head)![1], fileName: /\bfilename="([^"]*)"/.exec(head)?.[1] ?? null, body: part.subarray(blank + 4) });
  }
  return parts;
}

/** The markers of a JPEG's segments, from the first to the start of the scan (FFDA). */
export function markers(jpeg: Buffer): number[] {
  const found: number[] = [];
  let i = 2;
  for (; i + 4 <= jpeg.length && jpeg[i] === 0xff && jpeg[i + 1] !== 0xda; i += 2 + jpeg.readUInt16BE(i + 2)) found.push(jpeg[i + 1]);
  return jpeg[i] === 0xff ? [...found, jpeg[i + 1]] : found;
}

/** The one upload a check makes, as its parts: pictures named `file`, and React's own row that points at the form. */
export function uploadOf(sent: Sent[]): Part[] {
  const posts = sent.filter((s) => s.line.startsWith("POST "));
  expect(posts.map((s) => s.line)).toEqual(["POST /private"]);
  const parts = partsOf(posts[0]);
  const rows = parts.filter((p) => p.fileName === null);
  // React sends a FormData argument's parts under a prefixed name ("1_file") beside one short row of its own
  expect(rows.map((p) => p.name)).toEqual(["0"]);
  expect(rows[0].body.toString("latin1")).toMatch(/^\["\$K\d+"\]$/);
  return parts.filter((p) => p.fileName !== null);
}

/** A picture redrawn on the phone: named `file`, a JPEG, with no APP1 (Exif) segment. */
export function expectRedrawn(part: Part) {
  expect(part.fileName).toBe("file");
  expect(part.name).toMatch(/(^|_)file$/);
  expect([...part.body.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  const segments = markers(part.body);
  // the walk reached the scan, so every segment before the picture data was seen
  expect(segments.at(-1)).toBe(0xda);
  expect(segments).not.toContain(0xe1);
}
