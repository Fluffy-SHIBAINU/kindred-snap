// Writes the hand-made PDFs of fixtures/documents/, for the tests that the phone draws a PDF's pages as they look
// (tests/e2e/private-pdf.spec.ts): covers.pdf, field-under-box.pdf and three-pages.pdf. Each is typed out object by
// object with nothing compressed, so its words can be found in the file's bytes, and it holds no clock: the bytes are
// the same on every run. Synthetic data only. Positions are PDF points on a 612 by 792 page, from the bottom left.
// Run alone (`node scripts/make-fixture-pdfs.mjs`, from the repo root) or through scripts/make-fixture-images.mjs.
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve("fixtures/documents");

const stream = (dict, data) => `<< ${dict} /Length ${data.length} >>\nstream\n${data}\nendstream`;
const text = (font, size, x, y, words) => `BT /${font} ${size} Tf ${x} ${y} Td (${words}) Tj ET\n`;
const HELVETICA = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
const STAMP = "SYNTHETIC - demo document";

/** A PDF from its objects, numbered from 1 in the order given, with the cross-reference table worked out. */
function write(name, objects, catalog = "") {
  let out = "%PDF-1.7\n";
  const at = [];
  for (const [i, body] of objects.entries()) {
    at.push(out.length);
    out += `${i + 1} 0 obj\n${i ? body : `<< /Type /Catalog /Pages 2 0 R ${catalog}>>`}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(join(DIR, name), Buffer.from(out, "latin1"));
  console.log(name);
}

// A black square as a JPEG 2000 codestream, 8 by 8 grey pixels (sips wrote it from a black PNG; 142 bytes). pdf.js
// decodes it with openjpeg, one of the decoders it fetches from /pdf/wasm/.
const BLACK_JPX = Buffer.from(
  "/0//UQApAAAAAAAIAAAACAAAAAAAAAAAAAAACAAAAAgAAAAAAAAAAAABBwEB/1IADAAAAAEABQQEAAD/XAAjIncedup26na8bwBvAG7iZ0xnTGdkUANQA1BFV9JX0ldh/2QAEQABS2FrYWR1LXY1LjIuMf+QAAoAAAAAABkAAf+T39gMBzhCgICAgID/2Q==",
  "base64",
).toString("latin1");

// covers.pdf: one page with the name and the account number as live text, each under a cover of a kind that is not page
// content. The name is under a box annotation with its own appearance, [116 652 324 676], which is what a PDF editor's
// rectangle tool leaves. The account number is under a picture, [116 592 324 616]. The amount owed is left showing, and
// the tick is set in ZapfDingbats, a font pdf.js fetches from /pdf/standard_fonts/.
write("covers.pdf", [
  null,
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 7 0 R >> >> /Contents 6 0 R /Annots [8 0 R] >>",
  HELVETICA,
  "<< /Type /Font /Subtype /Type1 /BaseFont /ZapfDingbats >>",
  stream("", text("F1", 14, 72, 720, STAMP) + text("F1", 14, 72, 660, "Patient Dorothy M. Hale") + text("F1", 14, 72, 600, "Account ****4821") + text("F1", 14, 72, 540, "Patient owes $466.00") + text("F2", 14, 72, 480, "4") + "q 208 0 0 24 116 592 cm /Im1 Do Q\n"),
  stream("/Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /JPXDecode", BLACK_JPX),
  "<< /Type /Annot /Subtype /Square /Rect [116 652 324 676] /P 3 0 R /F 4 /C [0 0 0] /IC [0 0 0] /AP << /N 9 0 R >> >>",
  stream("/Type /XObject /Subtype /Form /BBox [0 0 208 24]", "0 g 0 0 208 24 re f"),
]);

// field-under-box.pdf: a form field filled with the name, on a white ground, and a black box annotation laid over the
// same rectangle afterwards. A PDF viewer shows the box; pdf.js draws every form field after every other annotation,
// so its picture would show the name. The phone refuses this file.
const FIELD = "[116 700 316 720]";
write("field-under-box.pdf", [
  null,
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [6 0 R 7 0 R] >>",
  HELVETICA,
  stream("", text("F1", 14, 72, 740, STAMP) + text("F1", 12, 72, 706, "Patient")),
  `<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /V (Dorothy M. Hale) /Rect ${FIELD} /P 3 0 R /F 4 /DA (/F1 12 Tf 0 g) /AP << /N 8 0 R >> >>`,
  `<< /Type /Annot /Subtype /Square /Rect ${FIELD} /P 3 0 R /F 4 /C [0 0 0] /IC [0 0 0] /AP << /N 9 0 R >> >>`,
  stream("/Type /XObject /Subtype /Form /BBox [0 0 200 20] /Resources << /Font << /F1 4 0 R >> >>", "1 g 0 0 200 20 re f /Tx BMC q BT /F1 12 Tf 0 g 2 6 Td (Dorothy M. Hale) Tj ET Q EMC"),
  stream("/Type /XObject /Subtype /Form /BBox [0 0 200 20]", "0 g 0 0 200 20 re f"),
], "/AcroForm << /Fields [6 0 R] /DA (/F1 12 Tf 0 g) /DR << /Font << /F1 4 0 R >> >> >> ");

// three-pages.pdf: as many pages as a PDF may have, each with a black block in a place of its own
// (page n: [72 + 180 (n - 1), 300, 120 wide, 120 high]), so a picture can be told from the other two.
const pageOf = (n) => stream("", text("F1", 14, 72, 720, `${STAMP}. Page ${n} of 3.`) + `0 g ${72 + 180 * (n - 1)} 300 120 120 re f\n`);
write("three-pages.pdf", [
  null,
  "<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>",
  ...[1, 2, 3].flatMap((n) => [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents ${2 + 2 * n} 0 R >>`, pageOf(n)]),
  HELVETICA,
]);
