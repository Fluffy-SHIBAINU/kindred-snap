// What leaves the phone when files are uploaded (docs/features/snap-incognito.md §12 and §8, layer one; rows T15 and T21 of §4).
// Port 3101: `PRIVATE_READER=stub`, which reads any redrawn JPEG as the demo bill, notice and income letter by position.
import { readdirSync, readFileSync } from "node:fs";
import { expect } from "@playwright/test";
import { REFUSED } from "../../src/lib/private/copy";
import { DOCS, beyondPdfJs, expectRedrawn, h1, markers, pick, sha256, test, uploadOf, whole } from "./wire";

const SET = ["bill-main.png", "msn-main.png", "income-letter.png"];

test.use({ baseURL: "http://localhost:3101" });

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

test("a text file renamed .jpg, eleven pages and a PDF that does not open are refused on the phone and nothing is sent", async ({ page, wire }) => {
  await page.goto(wire.origin + "/private");
  await page.waitForLoadState("networkidle");
  const loaded = wire.sent.length;
  const status = page.getByRole("status");

  // T21: a file the phone cannot decode
  await pick(page).setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("These are words, not a picture.") });
  await expect(status).toContainText(REFUSED.format);
  const eleven = readdirSync(DOCS).filter((f) => f.endsWith(".png")).slice(0, 11);
  expect(eleven).toHaveLength(11);
  await pick(page).setInputFiles(eleven.map((f) => DOCS + f));
  await expect(status).toContainText(REFUSED.too_many);
  await page.waitForTimeout(1000);
  expect(wire.sent.slice(loaded).map((s) => s.line)).toEqual([]);

  // T15: a PDF that does not open. The phone fetches pdf.js to try it, and sends nothing (the pages of one that opens: private-pdf.spec.ts)
  await pick(page).setInputFiles({ name: "bill.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n") });
  await expect(status).toContainText(REFUSED.pdf);
  await expect(h1(page, "Drop the Bill and What Came With It")).toBeVisible();
  await page.waitForTimeout(1000);
  expect(wire.sent.slice(loaded).some((s) => s.line === "GET /pdf/pdf.worker.min.mjs")).toBe(true);
  expect(beyondPdfJs(wire.sent.slice(loaded))).toEqual([]);
});
