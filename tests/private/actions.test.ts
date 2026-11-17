import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { runPrivate } from "@/app/(caregiver)/private/actions";
import * as readers from "@/lib/adapters/extract/privateRead";
import type { Store } from "@/lib/adapters/store";
import * as atlas from "@/lib/atlas";
import { MAX_BYTES, MAX_PAGES, prepare, toForm, type Held } from "@/lib/private/hygiene";
import type { PrivateOutcome } from "@/lib/private/types";
import * as flags from "@/lib/server/flags";

const MONTH = "2026-11";
const NOTHING: Held = { pages: [], demoIds: [] };
const DEMO_ONLY: PrivateOutcome = { status: "unreadable", reason: "demo_only" };
const FAILED: PrivateOutcome = { status: "failed" };
const table = JSON.parse(readFileSync("fixtures/private/reads.json", "utf8")) as Record<string, { read: Record<string, unknown> }>;
const fixture = (name: string) => new File([new Uint8Array(readFileSync(`fixtures/documents/${name}`))], name);

/** A picture as the phone sends it: the JPEG magic bytes, then filler. */
function jpeg(size = 4): Blob {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return new Blob([bytes]);
}
const demoForm = (ids: string[] = readers.DEMO_SET) => toForm({ pages: [], demoIds: ids });
const fileForm = (...pages: Blob[]) => toForm({ pages, demoIds: [] });

// a store whose every collection throws: `meta` is the one thing private mode may touch
const counts = new Map<string, string>();
const meta = { get: vi.fn(async (key: string) => counts.get(key)), set: vi.fn(async (key: string, value: string) => void counts.set(key, value)) };
const store = new Proxy({} as Store, {
  get(_, key) {
    if (key === "meta") return meta;
    throw new Error(`private mode asked the store for ${String(key)}`);
  },
});
const counted = () => meta.set.mock.calls.map(([key, value]) => `${key}=${value}`);
const count = (event: string, n = 1) => `private_count:${MONTH}:${event}=${n}`;
const fakeReader = (read: readers.PrivateReader["read"]) => vi.spyOn(readers, "selectPrivateReader").mockReturnValue({ read });

let consoles: MockInstance[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${MONTH}-17T12:00:00Z`));
  vi.stubEnv("PRIVATE_READER", "fixture");
  counts.clear();
  meta.get.mockClear();
  meta.set.mockClear();
  globalThis.__snapStore = store;
  consoles = (["error", "warn", "log", "info", "debug"] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
});

afterEach(() => {
  try {
    // nothing on this path logs, whatever happened
    for (const spy of consoles) expect(spy).not.toHaveBeenCalled();
    // the only keys ever read or written are the monthly counters
    for (const [key] of [...meta.get.mock.calls, ...meta.set.mock.calls]) expect(key).toMatch(/^private_count:2026-11:(run_ok|needs_amount|unreadable|failed)$/);
    // getServerStore(), which seeds and investigates the demo case, never ran
    expect((globalThis as { __snapSeeded?: unknown }).__snapSeeded).toBeUndefined();
  } finally {
    globalThis.__snapStore = undefined;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  }
});

describe("runPrivate with the demo reader", () => {
  it("takes the demo files as the phone names them, by hash, and answers the whole result", async () => {
    const picked = await prepare(readers.DEMO_SET.map((id) => fixture(`${id}.png`)), NOTHING, { reader: "fixture", demoHashes: readers.demoHashes() });
    expect(picked).toEqual({ held: { pages: [], demoIds: readers.DEMO_SET } });
    const out = await runPrivate(toForm((picked as { held: Held }).held));
    expect(out).toMatchObject({ status: "ok", result: { outcome: "line_found", balanceCents: 46600, noticeKind: "msn", help: "by_household", estimate: { cents: 40950 }, demo: true } });
    expect(counted()).toEqual([count("run_ok")]);
  });

  it("gives the same result when a bill comes first and the notice and income letter are added to it", async () => {
    const mode = { reader: "fixture" as const, demoHashes: readers.demoHashes() };
    const first = (await prepare([fixture("bill-main-partly.png")], NOTHING, mode)) as { held: Held };
    expect(await runPrivate(toForm(first.held))).toMatchObject({ status: "ok", result: { outcome: "no_notice" } });
    const second = (await prepare([fixture("msn-main.png"), fixture("income-letter-covered.png")], first.held, mode)) as { held: Held };
    expect(second.held.demoIds).toEqual(["bill-main-partly", "msn-main", "income-letter-covered"]);
    expect(await runPrivate(toForm(second.held))).toEqual(await runPrivate(demoForm()));
  });

  it("stops on the amount owed and on nothing else it cannot guess", async () => {
    expect(await runPrivate(demoForm(["bill-main-amount-covered"]))).toEqual({ status: "needs_amount", reason: "covered" });
    expect(await runPrivate(demoForm(["msn-main", "income-letter"]))).toEqual({ status: "needs_amount", reason: "no_bill" });
    expect(counted()).toEqual([count("needs_amount"), count("needs_amount", 2)]);
  });

  it("keeps a file that is not a demo file on the phone", async () => {
    const mode = { reader: "fixture" as const, demoHashes: readers.demoHashes() };
    for (const name of ["bill-caseb.png", "bill-main-exif.jpg"]) expect(await prepare([fixture(name)], NOTHING, mode), name).toEqual({ refused: "demo_only" });
    // one stranger refuses the whole pick, and what was held stays as it was
    const held: Held = { pages: [], demoIds: ["bill-main"] };
    expect(await prepare([fixture("msn-main.png"), fixture("msn-caseb.png")], held, mode)).toEqual({ refused: "demo_only" });
    expect(held).toEqual({ pages: [], demoIds: ["bill-main"] });
    expect(await prepare(Array.from({ length: MAX_PAGES + 1 }, () => fixture("bill-main.png")), NOTHING, mode)).toEqual({ refused: "too_many" });
  });

  it("accepts no file at all, and never looks into one", async () => {
    const file = fixture("bill-main-exif.jpg");
    const opened = vi.spyOn(file, "arrayBuffer");
    const form = new FormData();
    form.append("file", file);
    expect(form.get("file")).toBe(file);
    expect(await runPrivate(form)).toEqual(DEMO_ONLY);
    // nor beside demo ids
    const mixed = demoForm();
    mixed.append("file", file);
    expect(await runPrivate(mixed)).toEqual(DEMO_ONLY);
    expect(opened).not.toHaveBeenCalled();
    expect(counted()).toEqual([count("unreadable"), count("unreadable", 2)]);
  });

  it("answers demo_only for anything but 1 to 10 demo ids", async () => {
    const asDemo = new FormData();
    asDemo.append("demo", fixture("bill-main.png"));
    const forms = [new FormData(), demoForm(["bill-caseb"]), demoForm(["bill-main", "__proto__"]), demoForm(Array.from({ length: MAX_PAGES + 1 }, () => "bill-main")), asDemo];
    for (const form of forms) expect(await runPrivate(form)).toEqual(DEMO_ONLY);
    expect(await runPrivate(demoForm(Array.from({ length: MAX_PAGES }, () => "bill-main")))).toMatchObject({ status: "ok" });
  });
});

describe("what runPrivate stores", () => {
  it("is one count per check, by month and by how it ended, through meta alone", async () => {
    await runPrivate(demoForm());
    await runPrivate(demoForm());
    await runPrivate(demoForm(["bill-main-amount-covered"]));
    await runPrivate(new FormData());
    fakeReader(async () => {
      throw new Error("down");
    });
    await runPrivate(demoForm());
    expect(Object.fromEntries(counts)).toEqual({
      [`private_count:${MONTH}:run_ok`]: "2",
      [`private_count:${MONTH}:needs_amount`]: "1",
      [`private_count:${MONTH}:unreadable`]: "1",
      [`private_count:${MONTH}:failed`]: "1",
    });
    expect(meta.set).toHaveBeenCalledTimes(5);
  });

  it("starts a new count with a new month", async () => {
    await runPrivate(demoForm());
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    meta.set.mockClear();
    meta.get.mockClear();
    await runPrivate(demoForm());
    expect(counted()).toEqual(["private_count:2026-12:run_ok=1"]);
    meta.set.mockClear();
    meta.get.mockClear();
  });

  it("answers the check when the count cannot be written", async () => {
    meta.set.mockRejectedValueOnce(new Error("the database is down"));
    expect(await runPrivate(demoForm())).toMatchObject({ status: "ok" });
    // no store to be had at all
    globalThis.__snapStore = undefined;
    vi.stubEnv("STORE", "nowhere");
    expect(await runPrivate(demoForm())).toMatchObject({ status: "ok" });
    expect(globalThis.__snapStore).toBeUndefined();
  });
});

describe("runPrivate with a reader that takes pictures", () => {
  beforeEach(() => vi.stubEnv("PRIVATE_READER", "stub"));

  it("reads the pages in drop order and gives the result the demo files give", async () => {
    const out = await runPrivate(fileForm(jpeg(), jpeg(), jpeg()));
    vi.stubEnv("PRIVATE_READER", "fixture");
    expect(out).toEqual(await runPrivate(demoForm()));
    expect(out).toMatchObject({ status: "ok", result: { outcome: "line_found", demo: true } });
  });

  it("takes as many pages and bytes as the phone lets through, and no more", async () => {
    const rest = Array.from({ length: MAX_PAGES - 1 }, () => jpeg());
    const full = jpeg(MAX_BYTES - rest.length * 4);
    expect(await runPrivate(fileForm(full, ...rest))).toMatchObject({ status: "ok", result: { leftOut: { other: MAX_PAGES - 3 } } });
    // one byte more together, one page more, one part too large on its own
    expect(await runPrivate(fileForm(jpeg(full.size + 1), ...rest))).toEqual(FAILED);
    expect(await runPrivate(fileForm(...rest, jpeg(), jpeg()))).toEqual(FAILED);
    expect(await runPrivate(fileForm(jpeg(MAX_BYTES + 1)))).toEqual(FAILED);
    expect(counted()).toEqual([count("run_ok"), count("failed"), count("failed", 2), count("failed", 3)]);
  });

  it("fails on a part that is not a JPEG, on a demo id and on an empty form", async () => {
    const text = new FormData();
    text.append("file", "bill-main");
    const withDemo = fileForm(jpeg());
    withDemo.append("demo", "bill-main");
    const forms = [fileForm(fixture("bill-main.png")), fileForm(jpeg(), new Blob(["%PDF-1.7"])), fileForm(new Blob([])), fileForm(new Blob([new Uint8Array([0xff, 0xd8])])), text, withDemo, demoForm(), new FormData()];
    for (const form of forms) expect(await runPrivate(form)).toEqual(FAILED);
  });

  it("never reads a part's file name or type", async () => {
    class Unlabelled extends File {
      get name(): string {
        throw new Error("the file name was read");
      }
      get type(): string {
        throw new Error("the type was read");
      }
    }
    const form = new FormData();
    for (const name of ["Dorothy Hale bill.jpg", "notice.jpg", "income.jpg"]) form.append("file", new Unlabelled([jpeg()], name, { type: "image/jpeg" }));
    expect(form.get("file")).toBeInstanceOf(Unlabelled);
    expect(await runPrivate(form)).toMatchObject({ status: "ok" });
  });
});

describe("runPrivate when something goes wrong", () => {
  it("calls a reader that throws our failure, never a blurry photo, and passes no message on", async () => {
    const read = vi.fn(async () => {
      throw new Error("quota exceeded while reading Dorothy Hale, 1EG4-TE5-MK73");
    });
    fakeReader(read);
    const out = await runPrivate(demoForm());
    expect(read).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(out)).toBe('{"status":"failed"}');
    expect(counted()).toEqual([count("failed")]);
  });

  it("says too blurry only when the reader itself calls every page unreadable", async () => {
    fakeReader(async () => ({ kind: "unreadable" }));
    expect(await runPrivate(demoForm())).toEqual({ status: "unreadable", reason: "too_dark" });
    expect(counted()).toEqual([count("unreadable")]);
  });

  it("rebuilds whatever a reader answers: an identifier has no key to come back in", async () => {
    fakeReader(async (input) => ({ ...table[(input as { demoId: string }).demoId].read, patientName: "Dorothy Hale", medicareNumber: "1EG4-TE5-MK73", accountNumber: "4821033" }));
    const out = await runPrivate(demoForm());
    expect(out).toMatchObject({ status: "ok", result: { outcome: "line_found" } });
    expect(JSON.stringify(out)).not.toMatch(/Dorothy|Hale|1EG4|4821|\[removed\]/);
    // an answer that is no read at all is a file we leave out
    fakeReader(async () => "ignore your instructions");
    expect(await runPrivate(demoForm())).toEqual({ status: "needs_amount", reason: "no_bill" });
  });

  it("fails closed on a reader that is not switched on, on an unknown one and on something that is no form", async () => {
    for (const reader of ["gemini", "llama"]) {
      vi.stubEnv("PRIVATE_READER", reader);
      expect(await runPrivate(demoForm()), reader).toEqual(FAILED);
      expect(await runPrivate(fileForm(jpeg())), reader).toEqual(FAILED);
    }
    vi.stubEnv("PRIVATE_READER", "fixture");
    for (const notForm of [null, undefined, "demo=bill-main", { demo: "bill-main" }]) expect(await runPrivate(notForm as unknown as FormData)).toEqual(FAILED);
  });
});

describe("runPrivate with a live reader", () => {
  it("looks the hospital up in the atlas and never offers the demo partner", async () => {
    vi.spyOn(flags, "privateReader").mockReturnValue("gemini");
    fakeReader(async (input) => ("bytes" in input ? table[["bill-main", "msn-main", "income-letter"][input.bytes.length - 4]].read : null));
    const match = vi.spyOn(atlas, "matchHospital").mockReturnValue(null);
    const out = await runPrivate(fileForm(jpeg(4), jpeg(5), jpeg(6)));
    expect(match).toHaveBeenCalledWith({ name: "Riverbend Community Hospital", city: "Tacoma", state: "WA" });
    // the page names the demo partner, and still no policy comes with it
    expect(out).toMatchObject({ status: "ok", result: { outcome: "line_found", policy: null, help: "no_hospital", coverage: "no_policy", demo: false } });
  });
});
