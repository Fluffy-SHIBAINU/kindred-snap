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
// A test can make files unreachable (`unreachable`: the request is kept like any other and answered with a 404) or
// slow (`held`: the request waits until the test lets it go).
export type Wire = { origin: string; sent: Sent[]; unreachable: RegExp | null; held: { match: RegExp; until: Promise<void> } | null };
export const test = base.extend<{ wire: Wire }>({
  wire: async ({ baseURL }, provide) => {
    const upstream = new URL(baseURL!);
    const sent: Sent[] = [];
    const wire: Wire = { origin: "", sent, unreachable: null, held: null };
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", async () => {
        const body = Buffer.concat(chunks);
        sent.push({ line: `${req.method} ${req.url}`, headers: JSON.stringify(req.headers), body });
        if (wire.unreachable?.test(req.url ?? "")) return void res.writeHead(404).end();
        if (wire.held?.match.test(req.url ?? "")) await wire.held.until;
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
    wire.origin = `http://localhost:${(server.address() as AddressInfo).port}`;
    await provide(wire);
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

/** A trace of a file: bytes that would be in a request only if the file, or a stretch of it, were sent. */
export type Trace = { what: string; at: number; bytes: Buffer };

/**
 * What of a file must be in no request: the file whole, a 64-byte stretch at every 1 KB of it, and the same as base64,
 * the form a file takes inside JSON or a data URL. Three bytes become four letters there, so a stretch reads three
 * different ways by where it starts; each way is searched. A PDF also gives itself away by `%PDF`, plain or as base64.
 */
export function tracesOf(file: Buffer, pdf = false): Trace[] {
  const traces: Trace[] = [{ what: "the file whole", at: 0, bytes: file }];
  for (let at = 0; at + 64 <= file.length; at += 1024) traces.push({ what: `its bytes from ${at}`, at, bytes: file.subarray(at, at + 64) });
  for (let shift = 0; shift < 3; shift++) {
    const letters = file.subarray(shift).toString("base64");
    // whole groups of four letters, and never the padded end
    for (let at = 0; at + 64 <= letters.length; at += 1368) traces.push({ what: `base64 of its bytes from ${shift + (at / 4) * 3}`, at: shift + (at / 4) * 3, bytes: Buffer.from(letters.slice(at, at + 60)) });
  }
  if (pdf) traces.push({ what: "%PDF", at: 0, bytes: Buffer.from("%PDF") }, { what: "%PDF- as base64", at: 0, bytes: Buffer.from("JVBERi0") });
  return traces;
}

/** The traces found in what a request carried: empty when nothing of the file was sent. */
export const tracesIn = (carried: Buffer, traces: Trace[]) => traces.filter((t) => carried.includes(t.bytes)).map((t) => t.what);

/**
 * How dark each rectangle `[x, y, width, height]` of an uploaded picture is, in percent of its pixels: the JPEG is
 * decoded in the page, so the test looks at what a reader of the picture would see, not at its bytes.
 */
export function inkOf(page: Page, jpeg: Buffer, rects: number[][]): Promise<number[]> {
  return page.evaluate(
    async ({ letters, rects }) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(letters), (c) => c.charCodeAt(0))], { type: "image/jpeg" }));
      const canvas = Object.assign(document.createElement("canvas"), { width: bitmap.width, height: bitmap.height });
      // read back several times: said up front, or Chromium writes a hint to the console, which the specs watch
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0);
      return rects.map(([x, y, w, h]) => {
        const data = ctx.getImageData(x, y, w, h).data;
        let dark = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 180) dark++;
        return Math.round((100 * dark) / (w * h));
      });
    },
    { letters: jpeg.toString("base64"), rects },
  );
}

/** A JPEG's width and height, from its frame header. */
export function sizeOf(jpeg: Buffer): [number, number] {
  let i = 2;
  while (jpeg[i + 1] < 0xc0 || jpeg[i + 1] > 0xc2) i += 2 + jpeg.readUInt16BE(i + 2);
  return [jpeg.readUInt16BE(i + 7), jpeg.readUInt16BE(i + 5)];
}

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
