// Renders fixtures/documents/html/*.html to fixtures/documents/<name>.png with headless Chrome
// and writes fixtures/documents/index.json = [{ sha256, kind, fixtureKey, file, unreadable? }].
// No npm dependency: run `node scripts/make-fixture-images.mjs` from the repo root.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DIR = resolve("fixtures/documents");

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

const index = [];
for (const d of DOCS) {
  const out = join(DIR, `${d.name}.png`);
  const r = spawnSync(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=850,1100",
    `--screenshot=${out}`, `file://${join(DIR, "html", `${d.name}.html`)}`,
  ], { stdio: "pipe", timeout: 60_000 });
  if (r.status !== 0) throw new Error(`Chrome failed on ${d.name}: ${r.stderr}`);
  const sha256 = createHash("sha256").update(readFileSync(out)).digest("hex");
  const { name, ...rest } = d;
  index.push({ sha256, ...rest, file: `${name}.png` });
  console.log(d.name, sha256.slice(0, 12));
}
writeFileSync(join(DIR, "index.json"), JSON.stringify(index, null, 2) + "\n");
