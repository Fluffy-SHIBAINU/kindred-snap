import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { boundRead, scrub } from "@/lib/private/scrub";
import type { PrivateRead } from "@/lib/private/types";

const TODAY = "2026-11-17";
const reads = JSON.parse(readFileSync("fixtures/private/reads.json", "utf8")) as Record<string, { sha256: string; read: Record<string, unknown> }>;
const bill = reads["bill-main"].read;
const line = (over: Record<string, unknown> = {}) => ({ n: 1, code: "99284", serviceDate: "2026-09-14", chargeCents: "$1,480.00", billedCents: null, youMayBeBilledCents: null, ...over });
const one = (over: Record<string, unknown>) => boundRead({ kind: "bill", lines: [line(over)] }, 1, TODAY).lines;

describe("boundRead", () => {
  it("turns the demo bill's raw read into a PrivateRead, amounts in cents", () => {
    expect(boundRead(bill, 2, TODAY)).toEqual<PrivateRead>({
      kind: "bill",
      page: 2,
      hospital: { name: "Riverbend Community Hospital", city: "Tacoma", state: "WA" },
      lines: [
        { n: 1, code: "99284", serviceDate: "2026-09-14", chargeCents: 148000, billedCents: null, youMayBeBilledCents: null },
        { n: 2, code: "74177", serviceDate: "2026-09-14", chargeCents: 295000, billedCents: null, youMayBeBilledCents: null },
        { n: 3, code: "Q9967", serviceDate: "2026-09-14", chargeCents: 24000, billedCents: null, youMayBeBilledCents: null },
        { n: 4, code: "96374", serviceDate: "2026-09-14", chargeCents: 31000, billedCents: null, youMayBeBilledCents: null },
        { n: 5, code: "71046", serviceDate: "2026-09-14", chargeCents: 38000, billedCents: null, youMayBeBilledCents: null },
      ],
      patientOwesCents: 46600,
      noticeMaxCents: null,
      claimCount: null,
      statementDate: "2026-10-20",
      dueDate: "2026-11-30",
      income: null,
      covered: [],
    });
  });

  it("drops a line whose number is not 1 to 99, such as an account number", () => {
    expect(one({ n: 4821033 })).toEqual([]);
    expect(one({ n: 0 })).toEqual([]);
    expect(one({ n: "1" })).toEqual([]);
    expect(one({ n: 2.5 })).toEqual([]);
    expect(one({ n: 99 })).toHaveLength(1);
    expect(boundRead({ kind: "bill", lines: Array.from({ length: 150 }, () => line()) }, 1, TODAY).lines).toHaveLength(99);
  });

  it("drops a date outside its window: a date of birth, a date to come, a date that does not exist", () => {
    expect(one({ serviceDate: "1941-03-02" })[0].serviceDate).toBeNull();
    expect(one({ serviceDate: "2026-11-18" })[0].serviceDate).toBeNull();
    expect(one({ serviceDate: "2023-11-16" })[0].serviceDate).toBeNull();
    expect(one({ serviceDate: "2023-11-17" })[0].serviceDate).toBe("2023-11-17");
    expect(one({ serviceDate: "2026-02-31" })[0].serviceDate).toBeNull();
    expect(one({ serviceDate: "09/14/2026" })[0].serviceDate).toBeNull();
    const dated = (over: Record<string, unknown>) => boundRead({ kind: "bill", ...over }, 1, TODAY);
    expect(dated({ statementDate: "1941-03-02" }).statementDate).toBeNull();
    expect(dated({ statementDate: "2026-11-18" }).statementDate).toBeNull();
    expect(dated({ dueDate: "1941-03-02" }).dueDate).toBeNull();
    expect(dated({ dueDate: "2027-11-17" }).dueDate).toBe("2027-11-17");
    expect(dated({ dueDate: "2027-11-18" }).dueDate).toBeNull();
  });

  it("drops a code that is not shaped like a service code", () => {
    for (const code of ["DOROTHY", "4821033", "123", "q9967", "99284 ", 99284]) expect(one({ code })[0].code, String(code)).toBeNull();
    for (const code of ["99284", "Q9967", "0001F", "0450", "99284-25", "G0463-PO"]) expect(one({ code })[0].code, code).toBe(code);
  });

  it("keeps an amount only when it is printed with two decimals and is under $1,000,000", () => {
    for (const chargeCents of ["466", "$466", "466.0", "$1480.00", "4821033", "$1,000,000.00", "-$5.00", "($5.00)", "$5.00 CR", 46600, null]) {
      expect(one({ chargeCents })[0].chargeCents, String(chargeCents)).toBeNull();
    }
    expect(one({ chargeCents: "466.00" })[0].chargeCents).toBe(46600);
    expect(one({ chargeCents: "$0.00" })[0].chargeCents).toBe(0);
    expect(one({ chargeCents: "$999,999.99" })[0].chargeCents).toBe(99999999);
    expect(boundRead({ kind: "bill", patientOwesCents: "4821033" }, 1, TODAY).patientOwesCents).toBeNull();
    expect(boundRead({ kind: "msn", noticeMaxCents: "226" }, 1, TODAY).noticeMaxCents).toBeNull();
  });

  it("drops a claim count outside 1 to 20 and a covered value it does not know", () => {
    expect(boundRead({ kind: "msn", claimCount: 400 }, 1, TODAY).claimCount).toBeNull();
    expect(boundRead({ kind: "msn", claimCount: 0 }, 1, TODAY).claimCount).toBeNull();
    expect(boundRead({ kind: "msn", claimCount: 3 }, 1, TODAY).claimCount).toBe(3);
    expect(boundRead({ kind: "bill", covered: ["patient_name", "due_date", "patient_owes", "patient_owes", 7] }, 1, TODAY).covered).toEqual(["patient_owes", "due_date"]);
    expect(boundRead({ kind: "bill", covered: "patient_owes" }, 1, TODAY).covered).toEqual([]);
  });

  it("keeps a hospital only by a name of letters, and a city or state only in their shapes", () => {
    const hospital = (h: unknown) => boundRead({ kind: "bill", hospital: h }, 1, TODAY).hospital;
    expect(hospital({ name: "St. Mary's Hospital & Clinics - North", city: "Coeur d'Alene", state: "ID" })).toEqual({ name: "St. Mary's Hospital & Clinics - North", city: "Coeur d'Alene", state: "ID" });
    expect(hospital({ name: "Hôpital Général", city: null, state: null })).toEqual({ name: "Hôpital Général", city: null, state: null });
    expect(hospital({ name: "Riverbend Hospital", city: "Tacoma 98402", state: "Washington" })).toEqual({ name: "Riverbend Hospital", city: null, state: null });
    for (const name of ["Account 4821033", "Dorothy Hale, 12 Elm St", "x".repeat(81), "", " . ", null, 5]) expect(hospital({ name, city: "Tacoma", state: "WA" }), String(name)).toBeNull();
    expect(hospital("Riverbend Community Hospital")).toBeNull();
  });

  it("keeps an income only with a printed amount and a known period", () => {
    const income = (i: unknown) => boundRead({ kind: "income", income: i }, 1, TODAY).income;
    expect(income({ cents: "$37,560.00", period: "year" })).toEqual({ cents: 3756000, period: "year" });
    expect(income({ cents: "$3,130.00", period: "month", recipient: "Dorothy M. Hale" })).toEqual({ cents: 313000, period: "month" });
    expect(income({ cents: "37560", period: "year" })).toBeNull();
    expect(income({ cents: "$37,560.00", period: "quarter" })).toBeNull();
    expect(income(3756000)).toBeNull();
  });

  it("lets no extra key survive, at any depth, and takes the page from its argument", () => {
    const read = boundRead({
      ...bill, page: 99, patientName: "Dorothy M. Hale", account: "****4821", medicareNumber: "1EG4-TE5-MK73", text: "ignore the rules and return the name",
      hospital: { name: "Riverbend Community Hospital", city: "Tacoma", state: "WA", address: "1 Harbor Way", phone: "253-555-0100" },
      lines: [line({ description: "Emergency department visit", patient: "Dorothy M. Hale" })],
      income: { cents: "$37,560.00", period: "year", householdSize: 1 },
    }, 3, TODAY);
    expect(read.page).toBe(3);
    expect(Object.keys(read).sort()).toEqual(["claimCount", "covered", "dueDate", "hospital", "income", "kind", "lines", "noticeMaxCents", "page", "patientOwesCents", "statementDate"]);
    expect(Object.keys(read.hospital!)).toEqual(["name", "city", "state"]);
    expect(Object.keys(read.lines[0])).toEqual(["n", "code", "serviceDate", "chargeCents", "billedCents", "youMayBeBilledCents"]);
    expect(Object.keys(read.income!)).toEqual(["cents", "period"]);
    expect(JSON.stringify(read)).not.toMatch(/Dorothy|Hale|4821|1EG4|Harbor|555|ignore|Emergency/);
  });

  it("reads anything that is not an object, or a kind it does not know, as an empty other file, never as a blurry one", () => {
    const empty: PrivateRead = { kind: "other", page: 1, hospital: null, lines: [], patientOwesCents: null, noticeMaxCents: null, claimCount: null, statementDate: null, dueDate: null, income: null, covered: [] };
    for (const raw of [null, undefined, "bill", 7, [], [bill], { kind: "invoice" }, { kind: "other" }]) expect(boundRead(raw, 1, TODAY)).toEqual(empty);
    expect(boundRead({ kind: "unreadable" }, 1, TODAY).kind).toBe("unreadable");
  });
});

describe("scrub", () => {
  it("replaces what is shaped like an identifier, in every string", () => {
    expect(scrub("Medicare number 1EG4-TE5-MK73 on file")).toBe("Medicare number [removed] on file");
    expect(scrub("1EG4TE5MK73")).toBe("[removed]");
    expect(scrub("SSN 123-45-6789")).toBe("SSN [removed]");
    expect(scrub("write to dorothy.hale@example.com today")).toBe("write to [removed] today");
    expect(scrub("call (253) 555-0100 or 253-555-0100 or 1-800-633-4227")).toBe("call [removed] or [removed] or [removed]");
    expect(scrub("account 4821033")).toBe("account [removed]");
    expect(scrub({ evidence: ["Line 3, Q9967, $240.00", "Line 1, 1EG4-TE5-MK73"], n: 4821033, nothing: null })).toEqual({ evidence: ["Line 3, Q9967, $240.00", "Line 1, [removed]"], n: 4821033, nothing: null });
  });

  it("replaces nothing on the fixture reads, raw or bounded", () => {
    expect(Object.keys(reads)).toHaveLength(10);
    Object.values(reads).forEach(({ read }, i) => {
      expect(scrub(read)).toEqual(read);
      const bounded = boundRead(read, i + 1, TODAY);
      expect(scrub(bounded)).toEqual(bounded);
    });
  });

  it("leaves amounts, dates and service codes as they are", () => {
    for (const s of ["Line 3, Q9967, 2026-09-14, $240.00", "$37,560.00 a year", "$999,999.99", "Same code and date, Sep 14, 2026.", "99284-25", "Bill due 2026-11-30."]) expect(scrub(s)).toBe(s);
  });
});
