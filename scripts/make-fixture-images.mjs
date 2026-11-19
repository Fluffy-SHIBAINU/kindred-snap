// Renders fixtures/documents/html/*.html to fixtures/documents/<name>.png with headless Chrome
// and writes fixtures/documents/index.json = [{ sha256, kind, fixtureKey, file, unreadable? }].
// For private mode it also renders the covered, partly covered and amount-covered pages, and writes
// fixtures/private/reads.json (what the private demo reader answers, by file), fixtures/documents/bill-main-exif.jpg,
// and the two PDFs bill-main-boxed.pdf and four-pages.pdf.
// No npm dependency: run `node scripts/make-fixture-images.mjs` from the repo root (macOS: Chrome and sips).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DIR = resolve("fixtures/documents");
const PRIVATE_DIR = resolve("fixtures/private");

// which case each image belongs to; the fixture extractor matches uploads by sha256 through this table
const DOCS = [
  { name: "bill-main", kind: "bill", fixtureKey: "main" },
  { name: "msn-main", kind: "msn", fixtureKey: "main" },
  { name: "income-letter", kind: "income", fixtureKey: "main" },
  { name: "bill-caseb", kind: "bill", fixtureKey: "edge-no-discrepancy" },
  { name: "msn-caseb", kind: "msn", fixtureKey: "edge-no-discrepancy" },
  { name: "bill-ekg", kind: "bill", fixtureKey: "edge-needs-review" },
  { name: "msn-ekg", kind: "msn", fixtureKey: "edge-needs-review" },
  { name: "bill-blurry", kind: "bill", fixtureKey: "edge-unreadable", unreadable: true },
];

/** Renders one page and returns the sha256 of its PNG. */
function render(name) {
  const out = join(DIR, `${name}.png`);
  const r = spawnSync(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=850,1100",
    `--screenshot=${out}`, `file://${join(DIR, "html", `${name}.html`)}`,
  ], { stdio: "pipe", timeout: 60_000 });
  if (r.status !== 0) throw new Error(`Chrome failed on ${name}: ${r.stderr}`);
  const sha256 = createHash("sha256").update(readFileSync(out)).digest("hex");
  console.log(name, sha256.slice(0, 12));
  return sha256;
}

const index = [];
const hashes = {};
for (const d of DOCS) {
  const { name, ...rest } = d;
  hashes[name] = render(name);
  index.push({ sha256: hashes[name], ...rest, file: `${name}.png` });
}
writeFileSync(join(DIR, "index.json"), JSON.stringify(index, null, 2) + "\n");

// ── private mode ────────────────────────────────────────────────────────────────────────────────
// What a reader takes off each main page: amounts as printed, dates, service codes and the hospital's name.
// No name, address, account number or description has a key here, covered or not.
const EMPTY = { hospital: null, lines: [], patientOwesCents: null, noticeMaxCents: null, claimCount: null, statementDate: null, dueDate: null, income: null, covered: [] };
const line = (n, code, chargeCents, billedCents, youMayBeBilledCents) => ({ n, code, serviceDate: "2026-09-14", chargeCents, billedCents, youMayBeBilledCents });
const READS = {
  "bill-main": {
    kind: "bill", ...EMPTY,
    hospital: { name: "Riverbend Community Hospital", city: "Tacoma", state: "WA" },
    lines: [
      line(1, "99284", "$1,480.00", null, null),
      line(2, "74177", "$2,950.00", null, null),
      line(3, "Q9967", "$240.00", null, null),
      line(4, "96374", "$310.00", null, null),
      line(5, "71046", "$380.00", null, null),
    ],
    patientOwesCents: "$466.00", statementDate: "2026-10-20", dueDate: "2026-11-30",
  },
  "msn-main": {
    kind: "msn", ...EMPTY,
    hospital: { name: "Riverbend Community Hospital", city: null, state: null },
    lines: [
      line(1, "99284", null, "$1,480.00", "$84.00"),
      line(2, "74177", null, "$2,950.00", "$93.00"),
      line(3, "Q9967", null, "$240.00", "$0.00"),
      line(4, "96374", null, "$310.00", "$30.00"),
      line(5, "71046", null, "$380.00", "$19.00"),
    ],
    noticeMaxCents: "$226.00", claimCount: 1,
  },
  "income-letter": { kind: "income", ...EMPTY, statementDate: "2026-01-05", income: { cents: "$37,560.00", period: "year" } },
};

// the three demo sets: a covered or partly covered page has the same read as its uncovered original
const MAIN = ["bill-main", "msn-main", "income-letter"];
const reads = {};
for (const suffix of ["", "-covered", "-partly"]) {
  for (const base of MAIN) {
    const name = base + suffix;
    reads[name] = { sha256: hashes[name] ?? render(name), read: READS[base] };
  }
}
// the hard stop: the amount owed is under a cover, and the reader says so
reads["bill-main-amount-covered"] = { sha256: render("bill-main-amount-covered"), read: { ...READS["bill-main"], patientOwesCents: null, covered: ["patient_owes"] } };
mkdirSync(PRIVATE_DIR, { recursive: true });
writeFileSync(join(PRIVATE_DIR, "reads.json"), JSON.stringify(reads, null, 2) + "\n");

// A JPEG of the synthetic bill with a place in its hidden details, for the test that the phone's redraw drops them.
// The coordinates are invented (open ocean): never put a real photo's EXIF here, the repository is public.
const jpg = join(DIR, "bill-main-exif.jpg");
const sips = spawnSync("sips", ["-s", "format", "jpeg", join(DIR, "bill-main.png"), "--out", jpg], { stdio: "pipe", timeout: 60_000 });
if (sips.status !== 0) { rmSync(jpg, { force: true }); throw new Error(`sips failed: ${sips.stderr}`); }
const plain = readFileSync(jpg);
if (plain[0] !== 0xff || plain[1] !== 0xd8) throw new Error("sips did not write a JPEG");
writeFileSync(jpg, Buffer.concat([plain.subarray(0, 2), exifGps([12, 34, 56], "N", [123, 45, 6], "W"), plain.subarray(2)]));
console.log("bill-main-exif.jpg", createHash("sha256").update(readFileSync(jpg)).digest("hex").slice(0, 12));

// PDFs for the test that the phone turns a PDF's pages into pictures: the bill with the name and account number as
// live text under black boxes (the words are in the file, which is the point), and four pages, one more than a PDF may have.
// Chrome writes the time into a PDF, so these two change on every run; no table keeps their hashes.
for (const name of ["bill-main-boxed", "four-pages"]) {
  const out = join(DIR, `${name}.pdf`);
  const r = spawnSync(CHROME, [
    "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
    `--print-to-pdf=${out}`, `file://${join(DIR, "html", `${name}.html`)}`,
  ], { stdio: "pipe", timeout: 60_000 });
  if (r.status !== 0) throw new Error(`Chrome failed on ${name}.pdf: ${r.stderr}`);
  console.log(`${name}.pdf`);
}

/** An APP1 EXIF segment holding only a GPS position (degrees, minutes, seconds), big-endian TIFF. */
function exifGps(lat, latRef, lon, lonRef) {
  const tiff = Buffer.alloc(140);
  let at = 0;
  const u16 = (v) => { tiff.writeUInt16BE(v, at); at += 2; };
  const u32 = (v) => { tiff.writeUInt32BE(v, at); at += 4; };
  const entry = (tag, type, count, value) => { u16(tag); u16(type); u32(count); value(); };
  const ascii = (c) => () => { tiff.write(c, at, "latin1"); at += 4; };
  tiff.write("MM", 0, "latin1"); at = 2; u16(42); u32(8);
  u16(1); entry(0x8825, 4, 1, () => u32(26)); u32(0);                     // IFD0: one pointer to the GPS IFD at 26
  u16(5);                                                                  // GPS IFD: 2 + 5 × 12 + 4 bytes, data from 92
  entry(0x0000, 1, 4, () => { tiff.writeUInt8(2, at); tiff.writeUInt8(3, at + 1); at += 4; });
  entry(0x0001, 2, 2, ascii(latRef));
  entry(0x0002, 5, 3, () => u32(92));
  entry(0x0003, 2, 2, ascii(lonRef));
  entry(0x0004, 5, 3, () => u32(116));
  u32(0);
  for (const v of [...lat, ...lon]) { u32(v); u32(1); }                    // six rationals: value / 1
  const head = Buffer.alloc(10);
  head.writeUInt16BE(0xffe1, 0);
  head.writeUInt16BE(2 + 6 + tiff.length, 2);
  head.write("Exif", 4, "latin1");                                         // followed by two zero bytes
  return Buffer.concat([head, tiff]);
}
