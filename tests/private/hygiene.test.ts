import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pixelsOnly, sha256Hex, toForm } from "@/lib/private/hygiene";

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

describe("toForm", () => {
  it("names every page `file`, with the file name `file`, and sends demo ids as `demo` values", () => {
    const pages = toForm({ pages: [new Blob(["a"]), new Blob(["bc"])], demoIds: [] });
    expect([...pages.keys()]).toEqual(["file", "file"]);
    expect(pages.getAll("file").map((f) => [(f as File).name, (f as File).size])).toEqual([["file", 1], ["file", 2]]);
    const demo = toForm({ pages: [], demoIds: ["bill-main-covered", "msn-main-covered"] });
    expect([...demo.entries()]).toEqual([["demo", "bill-main-covered"], ["demo", "msn-main-covered"]]);
  });
});
