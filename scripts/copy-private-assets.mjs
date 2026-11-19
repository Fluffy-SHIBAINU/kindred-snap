// Copies what private mode loads in the browser from node_modules to public/, so every file comes from our own origin
// (docs/features/snap-incognito.md §8 and §9). public/pdf/ is not committed: `npm run build` and `npm run e2e` run this first.
// pdf.js: the legacy worker (it pairs with the legacy build that hygiene.ts imports), and what the worker fetches to
// draw a page: character maps, the standard fonts, the colour profile and the image decoders.
import { cpSync, rmSync } from "node:fs";

const FROM = "node_modules/pdfjs-dist/";
const TO = "public/pdf/";

rmSync(TO, { recursive: true, force: true });
cpSync(FROM + "legacy/build/pdf.worker.min.mjs", TO + "pdf.worker.min.mjs");
for (const dir of ["cmaps", "standard_fonts", "iccs", "wasm"]) {
  // the script sandbox for forms in a PDF is never run here, so it is not served either
  cpSync(FROM + dir, TO + dir, { recursive: true, filter: (src) => !/quickjs/i.test(src) });
}
