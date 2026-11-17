// What leaves the phone when files are uploaded (docs/features/snap-incognito.md §12 and §8, layer one; rows T15 and T21 of §4).
// Port 3101: `PRIVATE_READER=stub`, which reads any redrawn JPEG as the demo bill, notice and income letter by position.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createServer, request as forward } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test as base, type Page } from "@playwright/test";
import { REFUSED } from "../../src/lib/private/copy";

const DOCS = "fixtures/documents/";
const SET = ["bill-main.png", "msn-main.png", "income-letter.png"];

/** One request as it arrived: its line, its headers and its body. */
type Sent = { line: string; headers: string; body: Buffer };
type Part = { name: string; fileName: string | null; body: Buffer };

// Neither engine hands Playwright the bytes of an uploaded picture (Chromium gives no body at all, WebKit leaves the
// file parts empty), so each test opens the app through a pass-through that keeps every request exactly as it was sent.
const test = base.extend<{ wire: { origin: string; sent: Sent[] } }>({
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
test.use({ baseURL: "http://localhost:3101" });

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const pick = (page: Page) => page.locator("input[type=file][multiple]");
const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
/** Everything a request carried, as one run of bytes. */
const whole = (s: Sent) => Buffer.concat([Buffer.from(`${s.line}\n${s.headers}\n`), s.body]);

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
function markers(jpeg: Buffer): number[] {
  const found: number[] = [];
  let i = 2;
  for (; i + 4 <= jpeg.length && jpeg[i] === 0xff && jpeg[i + 1] !== 0xda; i += 2 + jpeg.readUInt16BE(i + 2)) found.push(jpeg[i + 1]);
  return jpeg[i] === 0xff ? [...found, jpeg[i + 1]] : found;
}

/** The one upload a check makes, as its parts: pictures named `file`, and React's own row that points at the form. */
function uploadOf(sent: Sent[]): Part[] {
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
function expectRedrawn(part: Part) {
  expect(part.fileName).toBe("file");
  expect(part.name).toMatch(/(^|_)file$/);
  expect([...part.body.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  const segments = markers(part.body);
  // the walk reached the scan, so every segment before the picture data was seen
  expect(segments.at(-1)).toBe(0xda);
  expect(segments).not.toContain(0xe1);
}

test("only redrawn pictures are uploaded: the originals, their names and their hidden details stay on the phone", async ({ page, wire }) => {
  const originals = SET.map((f) => readFileSync(DOCS + f));
  await page.goto(wire.origin + "/private");
  await pick(page).setInputFiles(SET.map((f) => DOCS + f));
  await expect(h1(page, "We Found $240.00 You May Not Owe")).toBeVisible();

  const pictures = uploadOf(wire.sent);
  expect(pictures).toHaveLength(SET.length);
  const hashes = originals.map(sha256);
  for (const picture of pictures) {
    expectRedrawn(picture);
    expect(hashes).not.toContain(sha256(picture.body));
  }
  for (const s of wire.sent) {
    const bytes = whole(s);
    for (const [i, original] of originals.entries()) {
      expect(bytes.includes(original), `${s.line}: ${SET[i]} whole`).toBe(false);
      // nor a stretch from its middle
      expect(bytes.includes(original.subarray(original.length >> 1, (original.length >> 1) + 64)), `${s.line}: ${SET[i]} in part`).toBe(false);
      expect(bytes.includes(SET[i].replace(".png", "")), `${s.line}: the name ${SET[i]}`).toBe(false);
    }
    expect(bytes.includes("%PDF"), `${s.line}: %PDF`).toBe(false);
  }
});

test("bill-main-exif.jpg loses its coordinates", async ({ page, wire }) => {
  const original = readFileSync(DOCS + "bill-main-exif.jpg");
  // the place the fixture carries: 12° 34' 56" N, 123° 45' 6" W, each number as a big-endian rational over 1
  const place = Buffer.concat([12, 34, 56, 123, 45, 6].map((n) => Buffer.from([0, 0, 0, n, 0, 0, 0, 1])));
  expect(markers(original)).toContain(0xe1);
  expect(original.includes(place)).toBe(true);

  await page.goto(wire.origin + "/private");
  await pick(page).setInputFiles(DOCS + "bill-main-exif.jpg");
  // the stub reads the first picture as the bill, so a bill alone is what comes back
  await expect(h1(page, "We Need the Notice or Statement to Check the Charges")).toBeVisible();

  const pictures = uploadOf(wire.sent);
  expect(pictures).toHaveLength(1);
  expectRedrawn(pictures[0]);
  expect(sha256(pictures[0].body)).not.toBe(sha256(original));
  for (const s of wire.sent) {
    expect(whole(s).includes(place), `${s.line}: the coordinates`).toBe(false);
    expect(whole(s).includes("bill-main-exif"), `${s.line}: the file name`).toBe(false);
  }
});

test("a text file renamed .jpg, a PDF and eleven pages are refused on the phone with no request", async ({ page, wire }) => {
  await page.goto(wire.origin + "/private");
  await page.waitForLoadState("networkidle");
  const loaded = wire.sent.length;
  const status = page.getByRole("status");

  // T21: a file the phone cannot decode
  await pick(page).setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("These are words, not a picture.") });
  await expect(status).toContainText(REFUSED.format);
  // T15: a PDF, before I2 turns its pages into pictures
  await pick(page).setInputFiles({ name: "bill.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n") });
  await expect(status).toContainText(REFUSED.pdf);
  const eleven = readdirSync(DOCS).filter((f) => f.endsWith(".png")).slice(0, 11);
  expect(eleven).toHaveLength(11);
  await pick(page).setInputFiles(eleven.map((f) => DOCS + f));
  await expect(status).toContainText(REFUSED.too_many);

  await expect(h1(page, "Drop the Bill and What Came With It")).toBeVisible();
  await page.waitForTimeout(1000);
  expect(wire.sent.slice(loaded).map((s) => s.line)).toEqual([]);
});
