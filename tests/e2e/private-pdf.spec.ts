// A PDF's pages are turned into pictures on the phone (docs/features/snap-incognito.md §8, layer two; §12; row T15 of §4).
// Port 3101: `PRIVATE_READER=stub`, which reads any redrawn JPEG as the demo bill, notice and income letter by position.
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { REFUSED } from "../../src/lib/private/copy";
import { DOCS, beyondPdfJs, expectRedrawn, h1, markers, pick, sha256, test, uploadOf, whole } from "./wire";

// the synthetic bill with the patient's name and the account number as live text under black boxes (tests/fixtures.test.ts
// reads the name out of its text, so the checks below are about something that is really in the file)
const BOXED = "bill-main-boxed.pdf";
const NAME = "Dorothy";
// the name as a PDF can hold it: plain, and as two-byte text in either order
const HIDDEN = [Buffer.from("Dorothy M. Hale"), Buffer.from(NAME), Buffer.from(NAME, "utf16le"), Buffer.from(NAME, "utf16le").swap16()];

test.use({ baseURL: "http://localhost:3101" });

type Reports = { violations: string[] };

/** What the page did that it should not have: a load the policy refused, anything written to the console, a dialog, a request to another origin. */
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

/** A JPEG's width and height, from its frame header. */
function sizeOf(jpeg: Buffer): [number, number] {
  let i = 2;
  while (jpeg[i + 1] < 0xc0 || jpeg[i + 1] > 0xc2) i += 2 + jpeg.readUInt16BE(i + 2);
  return [jpeg.readUInt16BE(i + 7), jpeg.readUInt16BE(i + 5)];
}

test("a PDF is drawn on the phone: its pages arrive as pictures, and neither the file nor the name under its box is sent", async ({ page, wire }) => {
  const original = readFileSync(DOCS + BOXED);
  const watched = await watch(page, wire.origin);
  await page.goto(wire.origin + "/private");
  await page.waitForLoadState("networkidle");
  const loaded = wire.sent.length;
  // pdf.js is not part of the page: nothing of it was fetched before a PDF was picked
  expect(wire.sent.filter((s) => s.line.startsWith("GET /pdf/"))).toEqual([]);

  // the stub reads by position, so the PDF's one page stands where the bill's picture does in the other specs
  await pick(page).setInputFiles([BOXED, "msn-main.png", "income-letter.png"].map((f) => DOCS + f));
  // the same figures the three pictures give: $240.00 on line 3, and $409.50 if the household is one person
  await expect(h1(page, "We Found $240.00 You May Not Owe")).toBeVisible();
  const clipping = page.locator("main div.shadow-card").first();
  await expect(clipping).toContainText("Bill line 3, Q9967");
  await expect(clipping).toContainText("$240.00");
  await expect(page.getByText("$409.50", { exact: true })).toBeVisible();

  const pictures = uploadOf(wire.sent);
  expect(pictures).toHaveLength(3);
  for (const picture of pictures) {
    expectRedrawn(picture);
    // no label of any kind beside the picture: no APP1 to APP15 segment and no comment
    expect(markers(picture.body).filter((m) => (m >= 0xe1 && m <= 0xef) || m === 0xfe)).toEqual([]);
    expect(sha256(picture.body)).not.toBe(sha256(original));
  }
  // the page is drawn upright with its long edge at 2000 px (the fixture's page is 850 by 1100)
  expect(sizeOf(pictures[0].body)).toEqual([1547, 2000]);

  for (const s of wire.sent) {
    const bytes = whole(s);
    expect(bytes.includes("%PDF"), `${s.line}: %PDF`).toBe(false);
    for (const hidden of HIDDEN) expect(bytes.includes(hidden), `${s.line}: the name under the box`).toBe(false);
    expect(bytes.includes(original), `${s.line}: the PDF whole`).toBe(false);
    expect(bytes.includes(original.subarray(original.length >> 1, (original.length >> 1) + 64)), `${s.line}: the PDF in part`).toBe(false);
    expect(bytes.includes(BOXED.replace(".pdf", "")), `${s.line}: the file's name`).toBe(false);
  }

  // drawing it fetched pdf.js from our own origin and from nowhere else: the lazy chunk and the worker under /pdf/
  const since = wire.sent.slice(loaded);
  expect(since.map((s) => s.line)).toContain("GET /pdf/pdf.worker.min.mjs");
  expect(since.some((s) => /^GET \/_next\/static\/chunks\/[^?]+\.js$/.test(s.line))).toBe(true);
  expect(beyondPdfJs(since)).toEqual(["POST /private"]);
  expect(await watched.violations()).toEqual([]);
  expect(watched.noise).toEqual([]);
});

test("pictures alone never fetch pdf.js", async ({ page, wire }) => {
  await page.goto(wire.origin + "/private");
  await page.waitForLoadState("networkidle");
  const loaded = wire.sent.length;
  await pick(page).setInputFiles(["bill-main.png", "msn-main.png", "income-letter.png"].map((f) => DOCS + f));
  await expect(h1(page, "We Found $240.00 You May Not Owe")).toBeVisible();
  expect(wire.sent.slice(loaded).filter((s) => s.line.startsWith("GET /pdf/"))).toEqual([]);
});

test("a four-page PDF is refused on the phone and nothing is sent", async ({ page, wire }) => {
  const watched = await watch(page, wire.origin);
  await page.goto(wire.origin + "/private");
  await page.waitForLoadState("networkidle");
  const loaded = wire.sent.length;

  await pick(page).setInputFiles(DOCS + "four-pages.pdf");
  await expect(page.getByRole("status")).toContainText(REFUSED.pdf);
  await expect(h1(page, "Drop the Bill and What Came With It")).toBeVisible();
  await page.waitForTimeout(1000);
  // counting the pages takes pdf.js, fetched from our own origin; no page was drawn, and nothing was sent
  expect(beyondPdfJs(wire.sent.slice(loaded))).toEqual([]);
  expect(await watched.violations()).toEqual([]);
  expect(watched.noise).toEqual([]);
});
