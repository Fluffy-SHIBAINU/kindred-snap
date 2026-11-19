/**
 * What the phone does to a dropped file before anything is sent (docs/features/snap-incognito.md §8, layers one and two).
 * Browser only: canvas, `createImageBitmap` and `crypto.subtle`. A client component imports it; server code never does.
 * With the demo reader a file is hashed and named by its demo id, and is neither drawn nor sent. With any other reader
 * every picture, and every page of a PDF, is drawn to a canvas and encoded again as a JPEG, so only pixels travel: the
 * original file, its name, its hidden details (time, place, device, preview, leftover data) and the text a PDF keeps
 * under a cover box stay on the phone.
 */

/** The limits of one check; `runPrivate` holds the same two for what arrives. */
export const MAX_PAGES = 10;
export const MAX_BYTES = 4 * 1024 * 1024;

const LONG_EDGE = 2000;
const SMALLER_QUALITY = 0.6;

/** What the phone holds between picks: the redrawn pages, or the ids of demo files. Component memory only, never storage. */
export type Held = { pages: Blob[]; demoIds: string[] };

/** The picture as a new JPEG with the long edge at most 2000 px, or null when the file does not decode as a picture. */
export async function reencode(file: File, quality = 0.8): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // a JPEG has no see-through pixels: without a white ground they come out black
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await jpegOf(canvas, quality);
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

/** What is on a canvas as a JPEG of pixels only, or null. */
async function jpegOf(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  // a browser that cannot write a JPEG answers with a PNG, which is not sent
  return blob && blob.type === "image/jpeg" ? pixelsOnly(blob) : null;
}

// pdf.js's worker and what the worker fetches (fonts, character maps, image decoders, colour profile), all from our own
// origin: scripts/copy-private-assets.mjs puts them there before every build
const PDF_FILES = "/pdf/";

/**
 * Every page of a PDF as a JPEG drawn on the phone (§8, layer two), so the text a PDF keeps under a cover box never
 * leaves it: only the pixels of the page as it looks travel. Null when the PDF does not open (broken, locked with a
 * password, or pdf.js itself did not load), has more than `max` pages, or has a page that is known not to come out as
 * it looks (a picture that did not decode, a form field with a box over it); the PDF is never sent instead. pdf.js is
 * loaded only here, when a PDF is picked, and what it holds is let go whether the pages come out or not.
 */
export async function rasterise(file: File, max = 3): Promise<Blob[] | null> {
  let opening: { destroy(): Promise<void> } | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    // the legacy build: it brings what an older phone's browser lacks
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_FILES + "pdf.worker.min.mjs";
    const task = pdfjs.getDocument({
      data: await file.arrayBuffer(),
      cMapUrl: PDF_FILES + "cmaps/",
      standardFontDataUrl: PDF_FILES + "standard_fonts/",
      iccUrl: PDF_FILES + "iccs/",
      wasmUrl: PDF_FILES + "wasm/",
      // pdf.js writes its warnings to the console; nothing on the private path logs
      verbosity: pdfjs.VerbosityLevel.ERRORS,
      // `stopAtErrors` stays off: with it pdf.js stops a page at the first thing it cannot draw and still finishes,
      // without everything that came after, a cover included; without it only that one thing is left out
    });
    opening = task;
    // no `onPassword` is set, so a locked PDF fails to open here and nobody is asked for anything
    const pdf = await task.promise;
    if (pdf.numPages > max) return null;
    const pages: Blob[] = [];
    canvas = document.createElement("canvas");
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      // pdf.js draws a form field after every other annotation, whatever their order in the file, so a box laid over a
      // filled field would come out under it: a page that has both is not drawn (links and pop-up notes cover nothing)
      const kinds = new Set((await page.getAnnotations()).map((a: { subtype: string }) => a.subtype));
      if (kinds.has("Widget") && [...kinds].some((kind) => !["Widget", "Link", "Popup"].includes(kind))) return null;
      const size = page.getViewport({ scale: 1 });
      // a PDF page has no pixels of its own: it is drawn with its long edge at 2000 px, the size a photo is brought down to
      const viewport = page.getViewport({ scale: LONG_EDGE / Math.max(size.width, size.height) });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      // pdf.js paints the white ground itself
      await page.render({ canvas, viewport }).promise;
      // pdf.js finishes a page without a picture it could not decode (its decoder did not load, say), and that picture
      // can be the cover over a name: such a page is not sent. Pictures are held per page, or in common when shared.
      // This sees a picture of the usual kind only: one used as a stencil, or set inline in the page's drawing, is
      // left out by pdf.js without a sign (docs/features/snap-incognito.md §10, item 11).
      for (const held of [page.objs, page.commonObjs]) for (const [, data] of held) if (data === null) return null;
      const jpeg = await jpegOf(canvas, 0.8);
      page.cleanup();
      if (!jpeg) return null;
      pages.push(jpeg);
    }
    return pages;
  } catch {
    return null;
  } finally {
    // a phone gives canvases little memory, and holds on to one until its size is set to nothing
    if (canvas) canvas.width = canvas.height = 0;
    await opening?.destroy().catch(() => {});
  }
}

/**
 * A JPEG without the labels an encoder writes beside the picture: the APP1 to APP15 segments (Exif, colour profile,
 * Photoshop block) and comments. Safari's encoder adds a small Exif block of its own to a canvas picture; it holds no
 * detail of the original, and it is still not sent. Null when the bytes are not a JPEG laid out as segments and a scan.
 */
export async function pixelsOnly(jpeg: Blob): Promise<Blob | null> {
  const b = new Uint8Array(await jpeg.arrayBuffer());
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  const kept: Blob[] = [jpeg.slice(0, 2)];
  let i = 2;
  // up to the start of the scan every segment is FF, a marker, and a two-byte length that counts itself
  while (i + 4 <= b.length && b[i] === 0xff && b[i + 1] !== 0xda) {
    const marker = b[i + 1];
    const end = i + 2 + ((b[i + 2] << 8) | b[i + 3]);
    if (!((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe)) kept.push(jpeg.slice(i, end));
    i = end;
  }
  if (b[i] !== 0xff || b[i + 1] !== 0xda) return null;
  kept.push(jpeg.slice(i));
  return new Blob(kept, { type: "image/jpeg" });
}

export async function sha256Hex(b: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await b.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const bytesOf = (pages: Blob[]) => pages.reduce((sum, p) => sum + p.size, 0);

// pages already redrawn at the lower quality: a later pick does not redraw them a second time
const madeSmaller = new WeakSet<Blob>();

/** A page redrawn once at the lower quality. One that already was, or that does not redraw, is kept as it is. */
async function smaller(page: Blob): Promise<Blob> {
  if (madeSmaller.has(page)) return page;
  const again = (await reencode(new File([page], "file"), SMALLER_QUALITY)) ?? page;
  madeSmaller.add(again);
  return again;
}

/**
 * Adds newly picked files to what is held, or refuses the whole pick and leaves `held` as it was; it never throws.
 * Demo reader: each file must be a demo file, known by its hash (`demo_only` otherwise); no canvas is touched.
 * Other readers: each page of a PDF is drawn as a picture (`pdf` when `rasterise` gives none), each
 * picture is redrawn, one that does not decode is refused (`format`), more than 10 pages is `too_many`, and when the
 * pages pass 4 MB together each is redrawn once at a lower quality before that is `too_many` as well. Pages are drawn
 * one at a time: a phone's memory holds few full-size photos.
 */
export async function prepare(
  files: File[],
  held: Held,
  mode: { reader: "fixture" | "stub" | "gemini"; demoHashes: Record<string, string> },
): Promise<{ held: Held } | { refused: "demo_only" | "format" | "pdf" | "too_many" }> {
  try {
    if (mode.reader === "fixture") {
      const demoIds = [...held.demoIds];
      for (const file of files) {
        const hash = await sha256Hex(file);
        if (!Object.hasOwn(mode.demoHashes, hash)) return { refused: "demo_only" };
        demoIds.push(mode.demoHashes[hash]);
      }
      return demoIds.length > MAX_PAGES ? { refused: "too_many" } : { held: { pages: held.pages, demoIds } };
    }

    if (held.pages.length + files.length > MAX_PAGES) return { refused: "too_many" };
    let pages = [...held.pages];
    for (const file of files) {
      // a PDF is known by its opening bytes, which the format lets sit anywhere in the first 1024
      if ((await file.slice(0, 1024).text()).includes("%PDF-")) {
        const drawn = await rasterise(file);
        // a PDF with no page in it is one that did not open
        if (!drawn?.length) return { refused: "pdf" };
        pages.push(...drawn);
        // a PDF can add up to three pages: the count is checked here, before the next file is opened and drawn
        if (pages.length > MAX_PAGES) return { refused: "too_many" };
        continue;
      }
      const page = await reencode(file);
      if (!page) return { refused: "format" };
      pages.push(page);
    }
    if (bytesOf(pages) > MAX_BYTES) {
      const redrawn: Blob[] = [];
      for (const page of pages) redrawn.push(await smaller(page));
      pages = redrawn;
      if (bytesOf(pages) > MAX_BYTES) return { refused: "too_many" };
    }
    return { held: { pages, demoIds: held.demoIds } };
  } catch {
    // a file that cannot be read at all is refused like one that cannot be opened
    return { refused: mode.reader === "fixture" ? "demo_only" : "format" };
  }
}

/** The one request's form: each page as a part named `file` with the file name `file`, or the demo ids as `demo` values. */
export function toForm(held: Held): FormData {
  const form = new FormData();
  for (const page of held.pages) form.append("file", page, "file");
  for (const id of held.demoIds) form.append("demo", id);
  return form;
}
