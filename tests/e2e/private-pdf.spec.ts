// A PDF's pages are turned into pictures on the phone (docs/features/snap-incognito.md §8, layer two; §12; row T15 of §4).
// Port 3101: `PRIVATE_READER=stub`, which reads any redrawn JPEG as the demo bill, notice and income letter by position
// and looks at no byte of it. What a picture shows is therefore read here, from the uploaded bytes (`inkOf`).
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";
import { REFUSED, SCREEN, STEP_SUMMARIES } from "../../src/lib/private/copy";
import { DOCS, beyondPdfJs, expectRedrawn, h1, inkOf, markers, pick, sha256, sizeOf, test, tracesIn, tracesOf, uploadOf, whole, type Sent, type Wire } from "./wire";

// the synthetic bill as Chrome printed it, with the patient's name and the account number as live text under black boxes
// that are part of the page's own drawing (tests/fixtures.test.ts reads both out of its text)
const BOXED = "bill-main-boxed.pdf";
// the same two as live text under a box annotation and under a JPEG 2000 picture, in a PDF typed out by hand
const COVERS = "covers.pdf";
// The words under the covers as text: plain, and two bytes a letter in either order. covers.pdf holds them as plain
// bytes. bill-main-boxed.pdf does not: there they are glyph numbers inside a packed stream, so for that file these catch
// only words the phone had read out of it, and the stretches of the file itself (`tracesOf`) catch the rest.
const HIDDEN = ["Dorothy M. Hale", "Dorothy", "****4821"].flatMap((w) => [Buffer.from(w), Buffer.from(w, "utf16le"), Buffer.from(w, "utf16le").swap16()]);
const NEEDS_NOTICE = "We Need the Notice or Statement to Check the Charges";
const FOUND = "We Found $240.00 You May Not Owe";

test.use({ baseURL: "http://localhost:3101" });

type Reports = { violations: string[] };

/**
 * What the page did that it should not have: a load the policy refused, anything written to the console, a dialog, a
 * request to another origin. A load the policy refuses inside pdf.js's worker is reported there, not here: for the
 * files the worker fetches, the proof is that the request reached our origin and the picture came out right.
 */
async function watch(page: Page, origin: string): Promise<{ noise: string[]; violations: () => Promise<string[]> }> {
  const noise: string[] = [];
  await page.addInitScript(() => {
    const reports = ((window as unknown as Reports).violations = [] as string[]);
    document.addEventListener("securitypolicyviolation", (e) => reports.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  page.on("console", (message) => noise.push(`console.${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => noise.push(`error: ${error.message}`));
  page.on("dialog", (dialog) => {
    noise.push(`dialog: ${dialog.message()}`);
    void dialog.dismiss();
  });
  page.on("request", (request) => {
    // a blob: or data: address is the page's own memory, not a request to anyone
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) noise.push(`elsewhere: ${request.url()}`);
  });
  return { noise, violations: () => page.evaluate(() => (window as unknown as Reports).violations) };
}

/** `/private` opened and settled, and how many requests that took: what a pick causes comes after them. */
async function open(page: Page, wire: Wire): Promise<number> {
  await page.goto(wire.origin + "/private");
  await page.waitForLoadState("networkidle");
  return wire.sent.length;
}

/** Where the page's own drawing sits in a PDF Chrome printed: the packed stream that holds its text operators. */
function drawingOf(pdf: Buffer): [number, number] {
  for (let at = pdf.indexOf("stream\n"); at !== -1; at = pdf.indexOf("stream\n", at + 1)) {
    const end = pdf.indexOf("endstream", at);
    try {
      if (inflateSync(pdf.subarray(at + 7, end)).includes(" Tj")) return [at + 7, end];
    } catch {
      // a stream that is not packed this way (a font, a picture) is not the page's drawing
    }
  }
  throw new Error("no page drawing found");
}

/** No request carries the PDF, a stretch of it, its name, or the words under its covers. */
function expectNothingOf(sent: Sent[], file: string) {
  const traces = tracesOf(readFileSync(DOCS + file), true);
  for (const s of sent) {
    const carried = whole(s);
    expect(tracesIn(carried, traces), `${s.line}: the PDF`).toEqual([]);
    for (const hidden of HIDDEN) expect(carried.includes(hidden), `${s.line}: the words under a cover`).toBe(false);
    expect(carried.includes(file.replace(".pdf", "")), `${s.line}: the file's name`).toBe(false);
  }
}

/** A picture drawn from a PDF page: a JPEG with no label of any kind beside it (no APP1 to APP15 segment, no comment). */
function expectPagePicture(picture: { name: string; fileName: string | null; body: Buffer }, size: [number, number]) {
  expectRedrawn(picture);
  expect(markers(picture.body).filter((m) => (m >= 0xe1 && m <= 0xef) || m === 0xfe)).toEqual([]);
  // drawn upright with its long edge at 2000 px
  expect(sizeOf(picture.body)).toEqual(size);
}

/** A rectangle of a 612 by 792 point page, given from the bottom left as a PDF gives it, in the pixels of its 2000 px picture. */
const points = ([x, y, w, h]: number[]) => [x, 792 - y - h, w, h].map((v) => Math.round((v * 2000) / 792));

/** A PDF the phone refuses: the sentence shows on the drop screen, and nothing is sent but the fetches of pdf.js itself. */
async function expectRefused(page: Page, wire: Wire, file: string) {
  const watched = await watch(page, wire.origin);
  const loaded = await open(page, wire);
  await pick(page).setInputFiles(DOCS + file);
  await expect(page.getByRole("status")).toContainText(REFUSED.pdf);
  await expect(h1(page, "Drop the Bill and What Came With It")).toBeVisible();
  await page.waitForTimeout(1000);
  const since = wire.sent.slice(loaded);
  expect(beyondPdfJs(since)).toEqual([]);
  expectNothingOf(wire.sent, file);
  expect(await watched.violations()).toEqual([]);
  return { since, noise: watched.noise };
}

test("the search of what a request carried finds a stretch of a PDF, as it is or as base64 inside other text", () => {
  const file = readFileSync(DOCS + BOXED);
  const traces = tracesOf(file, true);
  // a picture of the page holds nothing of the file
  expect(tracesIn(readFileSync(DOCS + "bill-main-exif.jpg"), traces)).toEqual([]);
  // the page's own drawing, where the name is: under 2 KB of the file, and a stretch of the search lies inside it
  const [from, to] = drawingOf(file);
  expect(to - from).toBeLessThan(2048);
  expect(traces.some((t) => t.bytes.length === 64 && t.at >= from && t.at + 64 <= to)).toBe(true);
  expect(tracesIn(Buffer.concat([Buffer.from("a part\r\n\r\n"), file.subarray(from, to)]), traces)).not.toEqual([]);
  // the same stretch, and the whole file, as base64 in JSON or a data URL, whatever stands before them
  for (const lead of ["", "x", "xy"]) {
    const wrapped = (bytes: Buffer) => Buffer.from(JSON.stringify({ file: Buffer.concat([Buffer.from(lead), bytes]).toString("base64") }));
    expect(tracesIn(wrapped(file.subarray(from, to)), traces), `the drawing after ${lead.length} bytes`).not.toEqual([]);
    expect(tracesIn(wrapped(file), traces), `the file after ${lead.length} bytes`).not.toEqual([]);
  }
  expect(tracesIn(Buffer.from("data:application/pdf;base64," + file.toString("base64")), traces)).toContain("%PDF- as base64");
  // the hand-made file is small: whole, or as base64, it is found too
  const small = readFileSync(DOCS + COVERS);
  expect(tracesIn(Buffer.from(small.toString("base64")), tracesOf(small, true))).not.toEqual([]);
  // and its words under the covers are plain bytes of it: the name, its first word and the account number
  expect(HIDDEN.filter((hidden) => small.includes(hidden))).toHaveLength(3);
});

test("a PDF is drawn on the phone: its pages arrive as pictures, and neither the file nor the name under its box is sent", async ({ page, wire }) => {
  const original = readFileSync(DOCS + BOXED);
  const watched = await watch(page, wire.origin);
  const loaded = await open(page, wire);
  // pdf.js is not part of the page: nothing of it was fetched before a PDF was picked
  expect(wire.sent.filter((s) => s.line.startsWith("GET /pdf/"))).toEqual([]);

  // the stub reads by position, so the PDF's one page stands where the bill's picture does in the other specs
  await pick(page).setInputFiles([BOXED, "msn-main.png", "income-letter.png"].map((f) => DOCS + f));
  // the same figures the three pictures give: $240.00 on line 3, and $409.50 if the household is one person
  await expect(h1(page, FOUND)).toBeVisible();
  const clipping = page.locator("main div.shadow-card").first();
  await expect(clipping).toContainText("Bill line 3, Q9967");
  await expect(clipping).toContainText("$240.00");
  await expect(page.getByText("$409.50", { exact: true })).toBeVisible();

  const pictures = uploadOf(wire.sent);
  expect(pictures).toHaveLength(3);
  for (const picture of pictures) {
    expectRedrawn(picture);
    expect(sha256(picture.body)).not.toBe(sha256(original));
  }
  // the fixture's page is 850 by 1100
  expectPagePicture(pictures[0], [1547, 2000]);
  // What the picture shows. The stub reader answers the same for any picture, so this is the only check that the page was
  // drawn as it looks: both boxes are solid ink over the name and the account number, the amount owed is print on white
  // (some ink, far from solid), and the foot of the page is white.
  const [name, account, owes, foot] = await inkOf(page, pictures[0].body, [[212, 251, 190, 22], [903, 251, 98, 22], [1300, 1045, 126, 42], [100, 1700, 1300, 250]]);
  expect([name, account]).toEqual([100, 100]);
  expect(owes).toBeGreaterThan(5);
  expect(owes).toBeLessThan(60);
  expect(foot).toBe(0);

  expectNothingOf(wire.sent, BOXED);

  // drawing it fetched pdf.js from our own origin and from nowhere else: the lazy chunk and the worker under /pdf/
  const since = wire.sent.slice(loaded);
  expect(since.map((s) => s.line)).toContain("GET /pdf/pdf.worker.min.mjs");
  expect(since.some((s) => /^GET \/_next\/static\/chunks\/[^?]+\.js$/.test(s.line))).toBe(true);
  expect(beyondPdfJs(since)).toEqual(["POST /private"]);
  expect(await watched.violations()).toEqual([]);
  expect(watched.noise).toEqual([]);
});

test("pictures alone never fetch pdf.js: neither its files under /pdf/ nor its chunk", async ({ page, wire }) => {
  const loaded = await open(page, wire);
  await pick(page).setInputFiles(["bill-main.png", "msn-main.png", "income-letter.png"].map((f) => DOCS + f));
  await expect(h1(page, FOUND)).toBeVisible();
  await page.getByRole("button", { name: "Get the letters" }).click();
  await expect(h1(page, "Your Letters")).toBeVisible();
  // pdf.js arrives as a chunk of its own, asked for only when a PDF is picked (the test above sees it arrive); the
  // whole check, to the letters, asks for no chunk at all
  expect(wire.sent.slice(loaded).map((s) => s.line)).toEqual(["POST /private"]);
});

test("while a PDF is being drawn the screen says so and the controls wait: a second pick cannot take the first one's place", async ({ page, wire }) => {
  // pdf.js's worker is slow to arrive, as on a phone's connection
  let arrive = () => {};
  wire.held = { match: /^\/pdf\/pdf\.worker/, until: new Promise<void>((done) => (arrive = done)) };
  await open(page, wire);
  await pick(page).setInputFiles(DOCS + BOXED);
  await expect(page.getByRole("status")).toHaveText(STEP_SUMMARIES.reading);
  for (const input of await page.locator("input[type=file]").all()) await expect(input).toBeDisabled();
  // the guide box has no control to switch off: a picture let go on it now (a small black one, made in the page) is left alone
  const dataTransfer = await page.evaluateHandle(async () => {
    const canvas = Object.assign(document.createElement("canvas"), { width: 40, height: 30 });
    canvas.getContext("2d")!.fillRect(0, 0, 40, 30);
    const png = await new Promise<Blob>((done) => canvas.toBlob((blob) => done(blob!)));
    const dropped = new DataTransfer();
    dropped.items.add(new File([png], "photo.png", { type: "image/png" }));
    return dropped;
  });
  await page.getByRole("img", { name: SCREEN.guideLabel }).dispatchEvent("drop", { dataTransfer });
  await page.waitForTimeout(500);
  await expect(page.getByRole("status")).toHaveText(STEP_SUMMARIES.reading);
  arrive();
  await expect(h1(page, NEEDS_NOTICE)).toBeVisible();
  // one check, of the PDF's page (1547 by 2000) and not of the picture dropped after it (40 by 30)
  const pictures = uploadOf(wire.sent);
  expect(pictures.map((p) => sizeOf(p.body))).toEqual([[1547, 2000]]);
  for (const input of await page.locator("input[type=file]").all()) await expect(input).toBeEnabled();
});

test("a three-page PDF arrives as three pictures, each its own page and in order", async ({ page, wire }) => {
  const watched = await watch(page, wire.origin);
  await open(page, wire);
  await pick(page).setInputFiles(DOCS + "three-pages.pdf");
  // three pictures: the stub reads them as the bill, the notice and the income letter
  await expect(h1(page, FOUND)).toBeVisible();

  const pictures = uploadOf(wire.sent);
  expect(pictures).toHaveLength(3);
  expect(new Set(pictures.map((p) => sha256(p.body))).size).toBe(3);
  // page n has its black block in the nth of three places (scripts/make-fixture-pdfs.mjs), and white in the other two
  const places = [0, 1, 2].map((i) => points([72 + 180 * i + 4, 304, 112, 112]));
  for (const [n, picture] of pictures.entries()) {
    expectPagePicture(picture, [1545, 2000]);
    expect(await inkOf(page, picture.body, places), `page ${n + 1}`).toEqual([0, 1, 2].map((i) => (i === n ? 100 : 0)));
  }
  expectNothingOf(wire.sent, "three-pages.pdf");
  expect(await watched.violations()).toEqual([]);
  expect(watched.noise).toEqual([]);
});

test("a cover that is an annotation, and one that is a picture pdf.js needs a decoder for, are both in the picture", async ({ page, wire }) => {
  const watched = await watch(page, wire.origin);
  const loaded = await open(page, wire);
  await pick(page).setInputFiles(DOCS + COVERS);
  // one picture: the stub reads it as the bill
  await expect(h1(page, NEEDS_NOTICE)).toBeVisible();

  const pictures = uploadOf(wire.sent);
  expect(pictures).toHaveLength(1);
  expectPagePicture(pictures[0], [1545, 2000]);
  // the box annotation over the name and the JPEG 2000 picture over the account number are solid ink; the line left
  // showing is print on white; the foot of the page is white
  const [annotation, picture, owes, foot] = await inkOf(page, pictures[0].body, [[120, 655, 200, 18], [120, 595, 200, 18], [72, 536, 140, 18], [72, 100, 468, 300]].map(points));
  expect([annotation, picture]).toEqual([100, 100]);
  expect(owes).toBeGreaterThan(5);
  expect(owes).toBeLessThan(60);
  expect(foot).toBe(0);

  // here the name and the account number are plain bytes of the file, and none of them left the phone
  expectNothingOf(wire.sent, COVERS);

  // what pdf.js's worker needed for this page came from our own origin, under the policy: the JPEG 2000 decoder and a standard font
  const since = wire.sent.slice(loaded).map((s) => s.line);
  expect(since.filter((line) => /^GET \/pdf\/wasm\/openjpeg/.test(line))).not.toEqual([]);
  expect(since).toContain("GET /pdf/standard_fonts/FoxitDingbats.pfb");
  expect(beyondPdfJs(wire.sent.slice(loaded))).toEqual(["POST /private"]);
  expect(await watched.violations()).toEqual([]);
  expect(watched.noise).toEqual([]);
});

test("a PDF whose picture cannot be decoded is refused: pdf.js would finish the page without it, and it can be a cover", async ({ page, wire }) => {
  // the decoder's files do not load (a dropped connection at that moment is enough)
  wire.unreachable = /^\/pdf\/wasm\//;
  const { since } = await expectRefused(page, wire, COVERS);
  // it was the decoder that was missing, and nothing else: pdf.js itself loaded and asked for it
  expect(since.map((s) => s.line)).toContain("GET /pdf/pdf.worker.min.mjs");
  expect(since.filter((s) => /^GET \/pdf\/wasm\/openjpeg/.test(s.line))).not.toEqual([]);
});

test("a PDF with a filled form field under a box is refused: pdf.js would draw the field over the box", async ({ page, wire }) => {
  const { noise } = await expectRefused(page, wire, "field-under-box.pdf");
  expect(noise).toEqual([]);
});

test("a four-page PDF is refused on the phone and nothing is sent", async ({ page, wire }) => {
  // counting the pages takes pdf.js, fetched from our own origin; no page was drawn, and nothing was sent
  const { noise } = await expectRefused(page, wire, "four-pages.pdf");
  expect(noise).toEqual([]);
});
