import { describe, expect, it } from "vitest";
import { DEMO_SET, DemoOnly, FixturePrivateReader, StubPrivateReader, demoHashes, selectPrivateReader } from "@/lib/adapters/extract/privateRead";
import { boundRead } from "@/lib/private/scrub";

const TODAY = "2026-11-17";
const MAIN = ["bill-main", "msn-main", "income-letter"];
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const read = async (reader: { read(i: { demoId: string } | { bytes: Uint8Array }): Promise<unknown> }, input: { demoId: string } | { bytes: Uint8Array }, page = 1) => boundRead(await reader.read(input), page, TODAY);

describe("FixturePrivateReader", () => {
  const reader = new FixturePrivateReader();

  it("answers the uncovered set with the main fixture's amounts", async () => {
    const [bill, msn, income] = await Promise.all(MAIN.map((demoId, i) => read(reader, { demoId }, i + 1)));
    expect(bill).toMatchObject({ kind: "bill", page: 1, patientOwesCents: 46600, statementDate: "2026-10-20", dueDate: "2026-11-30", hospital: { name: "Riverbend Community Hospital", city: "Tacoma", state: "WA" }, covered: [] });
    expect(bill.lines.map((l) => [l.n, l.code, l.serviceDate, l.chargeCents])).toEqual([
      [1, "99284", "2026-09-14", 148000], [2, "74177", "2026-09-14", 295000], [3, "Q9967", "2026-09-14", 24000], [4, "96374", "2026-09-14", 31000], [5, "71046", "2026-09-14", 38000],
    ]);
    expect(msn).toMatchObject({ kind: "msn", page: 2, noticeMaxCents: 22600, claimCount: 1, patientOwesCents: null });
    expect(msn.lines.map((l) => [l.n, l.code, l.serviceDate, l.billedCents, l.youMayBeBilledCents])).toEqual([
      [1, "99284", "2026-09-14", 148000, 8400], [2, "74177", "2026-09-14", 295000, 9300], [3, "Q9967", "2026-09-14", 24000, 0], [4, "96374", "2026-09-14", 31000, 3000], [5, "71046", "2026-09-14", 38000, 1900],
    ]);
    expect(msn.lines.reduce((sum, l) => sum + l.youMayBeBilledCents!, 0)).toBe(22600);
    expect(income).toMatchObject({ kind: "income", page: 3, income: { cents: 3756000, period: "year" }, lines: [], hospital: null });
  });

  it.each(["-covered", "-partly"])("answers the %s set exactly as the uncovered one", async (suffix) => {
    for (const id of MAIN) expect(await read(reader, { demoId: id + suffix })).toEqual(await read(reader, { demoId: id }));
  });

  it("answers the amount-covered bill with no amount owed, and says it was covered", async () => {
    const stopped = await read(reader, { demoId: "bill-main-amount-covered" });
    expect(stopped).toEqual({ ...(await read(reader, { demoId: "bill-main" })), patientOwesCents: null, covered: ["patient_owes"] });
  });

  it("throws DemoOnly for a file and for an id it does not know", async () => {
    await expect(reader.read({ bytes })).rejects.toBeInstanceOf(DemoOnly);
    for (const demoId of ["bill-caseb", "", "constructor", "__proto__", "../reads"]) await expect(reader.read({ demoId }), demoId).rejects.toBeInstanceOf(DemoOnly);
  });

  it("hands out a copy: changing an answer does not change the next one", async () => {
    const first = (await reader.read({ demoId: "bill-main" })) as { patientOwesCents: unknown };
    first.patientOwesCents = "$1.00";
    expect((await read(reader, { demoId: "bill-main" })).patientOwesCents).toBe(46600);
  });
});

describe("StubPrivateReader", () => {
  it("answers any picture with the uncovered bill, notice and income by call order, then other", async () => {
    const stub = new StubPrivateReader();
    const fixture = new FixturePrivateReader();
    const answers = await Promise.all([1, 2, 3, 4, 5].map((page) => read(stub, { bytes }, page)));
    for (const [i, id] of MAIN.entries()) expect(answers[i]).toEqual(await read(fixture, { demoId: id }, i + 1));
    expect(answers.map((a) => a.kind)).toEqual(["bill", "msn", "income", "other", "other"]);
  });

  it("refuses a demo id, and not as a demo-only file", async () => {
    const refusal = new StubPrivateReader().read({ demoId: "bill-main" });
    await expect(refusal).rejects.toThrow();
    await expect(refusal).rejects.not.toBeInstanceOf(DemoOnly);
  });
});

describe("selectPrivateReader", () => {
  it("is the demo reader unless the flag says stub", () => {
    expect(selectPrivateReader({})).toBeInstanceOf(FixturePrivateReader);
    expect(selectPrivateReader({ PRIVATE_READER: "fixture" })).toBeInstanceOf(FixturePrivateReader);
    expect(selectPrivateReader({ PRIVATE_READER: "stub" })).toBeInstanceOf(StubPrivateReader);
  });

  it("returns a new reader per call, so the stub's order restarts with every request", async () => {
    const env = { PRIVATE_READER: "stub" };
    await selectPrivateReader(env).read({ bytes });
    expect(await read(selectPrivateReader(env), { bytes })).toMatchObject({ kind: "bill" });
  });

  it("throws for the live reader until I3, for the stub in production, and for a value it does not know", () => {
    expect(() => selectPrivateReader({ PRIVATE_READER: "gemini" })).toThrow(/I3/);
    expect(() => selectPrivateReader({ PRIVATE_READER: "stub", NODE_ENV: "production" })).toThrow(/ALLOW_DEMO/);
    expect(selectPrivateReader({ PRIVATE_READER: "stub", NODE_ENV: "production", ALLOW_DEMO: "1" })).toBeInstanceOf(StubPrivateReader);
    expect(() => selectPrivateReader({ PRIVATE_READER: "ocr" })).toThrow();
  });
});

describe("the demo files", () => {
  it("DEMO_SET is the covered set, and every demo file has its own hash", () => {
    expect(DEMO_SET).toEqual(["bill-main-covered", "msn-main-covered", "income-letter-covered"]);
    const hashes = demoHashes();
    expect(Object.keys(hashes)).toHaveLength(10);
    for (const sha of Object.keys(hashes)) expect(sha).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.values(hashes).sort()).toEqual([...MAIN, ...MAIN.map((id) => id + "-covered"), ...MAIN.map((id) => id + "-partly"), "bill-main-amount-covered"].sort());
  });
});
