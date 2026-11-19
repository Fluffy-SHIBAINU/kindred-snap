import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pixelsOnly, prepare, sha256Hex, toForm, type Held } from "@/lib/private/hygiene";

// pdf.js is stood in for: opening and drawing a real PDF takes a browser (tests/e2e/private-pdf.spec.ts)
const pdfjs = vi.hoisted(() => ({ getDocument: vi.fn(), destroy: vi.fn(async () => {}) }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ GlobalWorkerOptions: {}, VerbosityLevel: { ERRORS: 0 }, getDocument: pdfjs.getDocument }));

// The parts of hygiene.ts that need no canvas. The redraw itself runs in a browser: tests/e2e/private-upload.spec.ts.
const exif = new Uint8Array(readFileSync("fixtures/documents/bill-main-exif.jpg"));
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const latin1 = (b: Uint8Array) => Buffer.from(b).toString("latin1");

/** A JPEG's segment markers in order, and where its scan starts. */
function layout(b: Uint8Array): { markers: number[]; scan: number } {
  const markers: number[] = [];
  let i = 2;
  while (b[i] === 0xff && b[i + 1] !== 0xda) {
    markers.push(b[i + 1]);
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return { markers, scan: i };
}

describe("pixelsOnly", () => {
  it("drops the Exif and Photoshop blocks of a JPEG and keeps every other byte", async () => {
    const before = layout(exif);
    // the fixture: an Exif block with invented GPS, the JFIF header, the encoder's own Exif block, a Photoshop block, the tables
    expect(before.markers).toEqual([0xe1, 0xe0, 0xe1, 0xed, 0xc0, 0xc4, 0xc4, 0xc4, 0xc4, 0xdb, 0xdb, 0xdd]);
    const out = await bytesOf((await pixelsOnly(new Blob([exif])))!);
    const after = layout(out);
    expect([...out.slice(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect(after.markers).toEqual([0xe0, 0xc0, 0xc4, 0xc4, 0xc4, 0xc4, 0xdb, 0xdb, 0xdd]);
    expect(latin1(out)).not.toMatch(/Exif|Photoshop|8BIM/);
    // what is left is the original's own bytes, the scan untouched: only the three blocks are gone
    expect(out.slice(after.scan)).toEqual(exif.slice(before.scan));
    expect(exif.length - out.length).toBe(150 + 78 + 58);
  });

  it("gives a JPEG picture, and the same one when run again", async () => {
    const once = (await pixelsOnly(new Blob([exif])))!;
    expect(once.type).toBe("image/jpeg");
    expect(await bytesOf((await pixelsOnly(once))!)).toEqual(await bytesOf(once));
  });

  it("drops a comment and a colour profile too", async () => {
    const seg = (marker: number, text: string) => [0xff, marker, 0, text.length + 2, ...Buffer.from(text)];
    const jpeg = new Uint8Array([0xff, 0xd8, ...seg(0xe0, "JFIF"), ...seg(0xfe, "taken by D. Hale"), ...seg(0xe2, "ICC_PROFILE"), ...seg(0xdb, "table"), 0xff, 0xda, 1, 2, 3, 0xff, 0xd9]);
    const out = await bytesOf((await pixelsOnly(new Blob([jpeg])))!);
    expect([...out]).toEqual([0xff, 0xd8, ...seg(0xe0, "JFIF"), ...seg(0xdb, "table"), 0xff, 0xda, 1, 2, 3, 0xff, 0xd9]);
  });

  it("answers null for bytes that are not a JPEG with a scan: nothing of the kind is sent", async () => {
    const png = new Uint8Array(readFileSync("fixtures/documents/bill-main.png"));
    const cut = exif.slice(0, 200);
    const badLength = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3]);
    for (const bytes of [png, cut, badLength, new Uint8Array([0xff, 0xd8]), new Uint8Array([])]) expect(await pixelsOnly(new Blob([bytes]))).toBeNull();
  });
});

describe("sha256Hex", () => {
  it("is the file's SHA-256 in hex, the form reads.json keys the demo files by", async () => {
    const table = JSON.parse(readFileSync("fixtures/private/reads.json", "utf8")) as Record<string, { sha256: string }>;
    const png = new Uint8Array(readFileSync("fixtures/documents/bill-main-covered.png"));
    expect(await sha256Hex(new Blob([png]))).toBe(createHash("sha256").update(png).digest("hex"));
    expect(await sha256Hex(new Blob([png]))).toBe(table["bill-main-covered"].sha256);
  });
});

describe("prepare, a PDF", () => {
  const stub = { reader: "stub" as const, demoHashes: {} };
  const pdf = (lead = "") => new File([lead + "%PDF-1.7\n1 0 obj\n<< >>\nendobj\n"], "bill.pdf");
  const holding = (n: number): Held => ({ pages: Array.from({ length: n }, () => new Blob(["page"])), demoIds: [] });
  // a PDF that opens with `numPages` Letter pages, each drawn to a canvas that encodes as a small JPEG with a comment in it
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xfe, 0, 4, 1, 2, 0xff, 0xdb, 0, 4, 1, 2, 0xff, 0xda, 1, 2, 3, 0xff, 0xd9]);
  const canvas = { width: 0, height: 0, toBlob: (done: (b: Blob) => void) => done(new Blob([jpeg], { type: "image/jpeg" })) };
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
    cleanup: vi.fn(),
    getAnnotations: vi.fn(async () => [] as Array<{ subtype: string }>),
    // what pdf.js holds for a page once it is drawn: its pictures by id, null for one that did not decode
    objs: [] as Array<[string, unknown]>,
    commonObjs: [] as Array<[string, unknown]>,
  };
  const getPage = vi.fn(async (n: number) => (n > 0 ? page : null));
  const opens = (numPages: number) => pdfjs.getDocument.mockImplementation(() => ({ promise: Promise.resolve({ numPages, getPage }), destroy: pdfjs.destroy }));

  beforeEach(() => {
    vi.clearAllMocks();
    page.objs = [];
    page.commonObjs = [];
    vi.stubGlobal("document", { createElement: () => canvas });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("that does not open is refused as `pdf`, never sent as it is, and what pdf.js held is let go", async () => {
    pdfjs.getDocument.mockImplementation(() => ({ promise: Promise.reject(new Error("locked with a password")), destroy: pdfjs.destroy }));
    expect(await prepare([pdf()], holding(1), stub)).toEqual({ refused: "pdf" });
    expect(pdfjs.destroy).toHaveBeenCalledTimes(1);
    // everything pdf.js fetches is asked of our own origin, and it writes nothing to the console
    expect(pdfjs.getDocument.mock.calls[0][0]).toMatchObject({ cMapUrl: "/pdf/cmaps/", standardFontDataUrl: "/pdf/standard_fonts/", iccUrl: "/pdf/iccs/", wasmUrl: "/pdf/wasm/", verbosity: 0 });
    // pdf.js itself failing to load is the same refusal
    pdfjs.getDocument.mockImplementation(() => {
      throw new Error("no worker");
    });
    expect(await prepare([pdf()], holding(0), stub)).toEqual({ refused: "pdf" });
  });

  it("with more than three pages is refused as `pdf` before a page is drawn", async () => {
    opens(4);
    expect(await prepare([pdf()], holding(0), stub)).toEqual({ refused: "pdf" });
    expect(page.render).not.toHaveBeenCalled();
    expect(pdfjs.destroy).toHaveBeenCalledTimes(1);
  });

  it("that opens adds one picture a page, long edge 2000 px, pixels only, and lets go of the canvas and of pdf.js", async () => {
    opens(3);
    const sizes: number[][] = [];
    page.render.mockImplementation(() => (sizes.push([canvas.width, canvas.height]), { promise: Promise.resolve() }));
    const out = await prepare([pdf("\n")], holding(7), stub);
    if (!("held" in out)) throw new Error("refused");
    expect(out.held.pages).toHaveLength(10);
    // each page once and in the file's order, never the first page three times
    expect(getPage.mock.calls).toEqual([[1], [2], [3]]);
    expect(sizes).toEqual([[1545, 2000], [1545, 2000], [1545, 2000]]);
    // the comment the encoder wrote is gone: a page goes through the same step as a photo
    expect([...new Uint8Array(await out.held.pages[9].arrayBuffer())]).toEqual([0xff, 0xd8, 0xff, 0xdb, 0, 4, 1, 2, 0xff, 0xda, 1, 2, 3, 0xff, 0xd9]);
    expect(page.cleanup).toHaveBeenCalledTimes(3);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    expect(pdfjs.destroy).toHaveBeenCalledTimes(1);
  });

  it("counts its pages toward the ten: eight held and three more are too many, and the next PDF is never opened", async () => {
    opens(3);
    expect(await prepare([pdf()], holding(8), stub)).toEqual({ refused: "too_many" });
    pdfjs.getDocument.mockClear();
    expect(await prepare([pdf(), pdf()], holding(8), stub)).toEqual({ refused: "too_many" });
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(1);
  });

  it("with no page in it is refused as `pdf`: nothing would be sent for it", async () => {
    opens(0);
    expect(await prepare([pdf()], holding(1), stub)).toEqual({ refused: "pdf" });
  });

  it("with a picture pdf.js could not decode is refused as `pdf`: the page was finished without it, and it can be a cover", async () => {
    opens(1);
    // a picture that decoded is no reason to refuse
    page.objs = [["img_p0_1", { width: 8, height: 8 }]];
    page.commonObjs = [["g_d0_f1", { loadedName: "g_d0_f1" }]];
    expect(await prepare([pdf()], holding(0), stub)).toHaveProperty("held");
    for (const where of ["objs", "commonObjs"] as const) {
      page.objs = [];
      page.commonObjs = [];
      page[where] = [["img_p0_1", { width: 8, height: 8 }], ["img_p0_2", null]];
      pdfjs.destroy.mockClear();
      expect(await prepare([pdf()], holding(0), stub), where).toEqual({ refused: "pdf" });
      expect(pdfjs.destroy).toHaveBeenCalledTimes(1);
    }
  });

  it("with a form field and a box annotation on one page is refused as `pdf` before the page is drawn", async () => {
    opens(1);
    // pdf.js would draw the field over the box, whatever their order in the file
    for (const kinds of [["Widget", "Square"], ["Link", "Ink", "Widget"]]) {
      page.getAnnotations.mockResolvedValueOnce(kinds.map((subtype) => ({ subtype })));
      expect(await prepare([pdf()], holding(0), stub), kinds.join()).toEqual({ refused: "pdf" });
    }
    expect(page.render).not.toHaveBeenCalled();
    // a form with links and notes only, or boxes with no form field, is drawn
    for (const kinds of [["Widget", "Link", "Popup", "Widget"], ["Square", "Link", "FreeText"]]) {
      page.getAnnotations.mockResolvedValueOnce(kinds.map((subtype) => ({ subtype })));
      expect(await prepare([pdf()], holding(0), stub), kinds.join()).toHaveProperty("held");
    }
    expect(page.render).toHaveBeenCalledTimes(2);
  });

  it("with the demo reader is refused as demo only and never opened", async () => {
    expect(await prepare([pdf()], holding(0), { reader: "fixture", demoHashes: {} })).toEqual({ refused: "demo_only" });
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });
});

describe("toForm", () => {
  it("names every page `file`, with the file name `file`, and sends demo ids as `demo` values", () => {
    const pages = toForm({ pages: [new Blob(["a"]), new Blob(["bc"])], demoIds: [] });
    expect([...pages.keys()]).toEqual(["file", "file"]);
    expect(pages.getAll("file").map((f) => [(f as File).name, (f as File).size])).toEqual([["file", 1], ["file", 2]]);
    const demo = toForm({ pages: [], demoIds: ["bill-main-covered", "msn-main-covered"] });
    expect([...demo.entries()]).toEqual([["demo", "bill-main-covered"], ["demo", "msn-main-covered"]]);
  });
});
