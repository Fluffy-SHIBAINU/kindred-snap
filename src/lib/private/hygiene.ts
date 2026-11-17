/**
 * What the phone does to a dropped file before anything is sent (docs/features/snap-incognito.md §8, layer one).
 * Browser only: canvas, `createImageBitmap` and `crypto.subtle`. A client component imports it; server code never does.
 * With the demo reader a file is hashed and named by its demo id, and is neither drawn nor sent. With any other reader
 * every picture is drawn to a canvas and encoded again as a JPEG, so only pixels travel: the original file, its name
 * and its hidden details (time, place, device, preview, leftover data) stay on the phone.
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
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    // a browser that cannot write a JPEG answers with a PNG, which is not sent
    return blob && blob.type === "image/jpeg" ? await pixelsOnly(blob) : null;
  } catch {
    return null;
  } finally {
    bitmap.close();
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
 * Other readers: a PDF is refused (`pdf`), each picture is redrawn, one that does not decode is refused (`format`),
 * more than 10 pages is `too_many`, and when the pages pass 4 MB together each is redrawn once at a lower quality
 * before that is `too_many` as well. Pages are drawn one at a time: a phone's memory holds few full-size photos.
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
      if ((await file.slice(0, 5).text()) === "%PDF-") return { refused: "pdf" };
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
