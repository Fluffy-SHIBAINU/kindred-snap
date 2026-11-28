import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CasePage from "@/app/(caregiver)/case/[id]/page";
import DonePage from "@/app/(caregiver)/case/[id]/done/page";
import { addIncomeDocument, setIncomeAndStart } from "@/app/(caregiver)/case/[id]/income/actions";
import IncomePage from "@/app/(caregiver)/case/[id]/income/page";
import { deleteCaseAction } from "@/app/(caregiver)/case/[id]/resolved/actions";
import ResolvedPage from "@/app/(caregiver)/case/[id]/resolved/page";
import { approveAndSendAction, closeCaseAction } from "@/app/(caregiver)/case/[id]/result/actions";
import ResultPage from "@/app/(caregiver)/case/[id]/result/page";
import { addNoticeAndResume, retryMedicare } from "@/app/(caregiver)/case/[id]/working/actions";
import WorkingPage from "@/app/(caregiver)/case/[id]/working/page";
import PrivatePage from "@/app/(caregiver)/private/page";
import { resumeByCode } from "@/app/(caregiver)/resume/actions";
import { createCaseFromUpload } from "@/app/(caregiver)/snap/actions";
import StaffCasePage from "@/app/staff/cases/[id]/page";
import { GUEST_LINE, TalkToPerson } from "@/components/snap/TalkToPerson";
import { SyntheticBlueButton } from "@/lib/adapters/claims/synthetic";
import { MemoryStore, seedDemo, type Store } from "@/lib/adapters/store";
import { DELETE_TEXT, DELETED_TEXT, deliverResponse, recordBasisLetter } from "@/lib/caseFlow";
import { loadCaseFixture } from "@/lib/fixtures";
import { riverbendPolicy, runInvestigation } from "@/lib/pipeline";
import type { Case } from "@/lib/types";

/**
 * Who may open a case on the caregiver screens. Every page and server action is called as Next calls it, with the
 * request's cookies stood in for; the store is the in-memory one, seeded from the synthetic fixtures.
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));
// a Supabase session stood in for; undefined runs the real getViewer
const session = vi.hoisted(() => ({ viewer: undefined as { id: string; role: "helper" | "staff" } | null | undefined }));
vi.mock("@/lib/server/supabaseAuth", async (original) => {
  const real = await original<typeof import("@/lib/server/supabaseAuth")>();
  return { ...real, getViewer: async () => (session.viewer === undefined ? real.getViewer() : session.viewer) };
});

const COOKIE = "snap_visitor";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
/** The owner id a visitor cookie stands for: only its digest is ever stored. */
const ownerOf = (cookie: string) => "visitor:" + createHash("sha256").update(cookie).digest("hex");
const T0 = "2026-11-09T05:00:00.000Z";
const SIGNED_OUT = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];

const as = (visitor: string | null) => {
  jar.clear();
  if (visitor) jar.set(COOKIE, visitor);
};

/** What a page or action did: rendered, the not-available page, or a redirect to a path. */
async function outcome(run: () => unknown): Promise<string> {
  try {
    await run();
    return "rendered";
  } catch (e) {
    const digest = String((e as { digest?: unknown }).digest ?? "");
    if (digest.endsWith(";404")) return "not-found";
    if (digest.startsWith("NEXT_REDIRECT;")) return "redirect:" + digest.split(";")[2];
    throw e;
  }
}

/** The strings a rendered server component tree carries (its props, not its client components' output). */
const textOf = (tree: unknown) => JSON.stringify(tree);

const props = (id: string, sp: Record<string, string> = {}) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) });
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

let store: Store;

async function useStore(s: Store) {
  const g = globalThis as typeof globalThis & { __snapSeeded?: Promise<void> };
  g.__snapStore = s;
  g.__snapSeeded = Promise.resolve();
  store = s;
}

async function seeded(): Promise<Store> {
  const s = new MemoryStore();
  await seedDemo(s);
  return s;
}

/** A copy of the main fixture under a new id and owner, in `created`. */
async function putCase(id: string, code: string, ownerId: string, patch: Partial<Case> = {}): Promise<Case> {
  const fx = loadCaseFixture("main");
  const c: Case = { ...fx.case, id, code, ownerId, consent: null, income: null, steps: [], ...patch };
  await store.cases.put(c);
  for (const d of fx.documents) await store.documents.put({ ...d, id: `${id}-${d.kind}`, caseId: id });
  return c;
}

/** Runs a `created` case to `ready_to_send`. */
async function investigate(id: string) {
  const c = (await store.cases.get(id))!;
  await store.cases.put({
    ...c,
    consent: { caseId: id, grantedAt: T0, grantedBy: c.ownerId, role: "helper", scope: "investigate_and_prepare" },
    income: { annualCents: 3756000, householdSize: 1, source: "typed" },
  });
  await runInvestigation(store, id, { claims: new SyntheticBlueButton(), policyFor: async () => riverbendPolicy(), now: () => T0 });
  expect((await store.cases.get(id))!.state).toBe("ready_to_send");
}

const stateOf = async (id: string) => (await store.cases.get(id))?.state;

beforeEach(async () => {
  session.viewer = undefined;
  process.env.STAFF_BYPASS = "0";
  process.env.DEMO_CONTROLS = "0";
  for (const k of SIGNED_OUT) delete process.env[k];
  await useStore(await seeded());
  await putCase("case-ready", "SNAP-AAAAAA", ownerOf(OWNER));
  await investigate("case-ready");
  await putCase("case-new", "SNAP-BBBBBB", ownerOf(OWNER));
  await putCase("case-parked", "SNAP-CCCCCC", ownerOf(OWNER), { state: "needs_notice" });
});

afterEach(() => jar.clear());

describe("a viewer who does not own the case", () => {
  for (const [who, cookie] of [["another visitor", OTHER], ["no cookie", null], ["a forged demo-helper cookie", "demo-helper"]] as const) {
    it(`${who}: every case page is the not-available page`, async () => {
      as(cookie);
      expect(await outcome(() => CasePage(props("case-ready")))).toBe("not-found");
      expect(await outcome(() => IncomePage(props("case-new")))).toBe("not-found");
      expect(await outcome(() => WorkingPage(props("case-parked")))).toBe("not-found");
      expect(await outcome(() => ResultPage(props("case-ready")))).toBe("not-found");
      expect(await outcome(() => DonePage(props("case-ready")))).toBe("not-found");
      expect(await outcome(() => ResolvedPage(props("case-ready")))).toBe("not-found");
    });
  }

  it("cannot open a seeded fixture case by forging the old shared owner", async () => {
    as("demo-helper");
    expect(await outcome(() => WorkingPage(props("edge-needs-review")))).toBe("not-found");
  });

  it("cannot delete the case", async () => {
    as(OTHER);
    expect(await outcome(() => deleteCaseAction("case-ready"))).toBe("not-found");
    expect((await store.cases.get("case-ready"))!.deletedAt).toBeUndefined();
    expect(await store.documentsFor("case-ready")).toHaveLength(2);
  });

  it("cannot send, close, give income or add a notice", async () => {
    as(OTHER);
    expect(await outcome(() => approveAndSendAction("case-ready"))).toBe("not-found");
    expect(await outcome(() => closeCaseAction("case-ready"))).toBe("not-found");
    expect(await stateOf("case-ready")).toBe("ready_to_send");
    expect(await outcome(() => setIncomeAndStart(form({ caseId: "case-new", income: "37,560", household: "1" })))).toBe("not-found");
    expect(await outcome(() => addIncomeDocument(form({ caseId: "case-new", demo: "main" })))).toBe("not-found");
    expect((await store.cases.get("case-new"))!.income).toBeNull();
    expect(await outcome(() => retryMedicare(form({ caseId: "case-parked" })))).toBe("not-found");
    expect(await outcome(() => addNoticeAndResume(form({ caseId: "case-parked", demo: "main" })))).toBe("not-found");
    expect(await stateOf("case-parked")).toBe("needs_notice");
  });

  it("resume by code answers as for an unknown code", async () => {
    as(OTHER);
    expect(await outcome(() => resumeByCode(form({ code: "SNAP-AAAAAA" })))).toBe("redirect:/resume?notfound=1");
    expect(await outcome(() => resumeByCode(form({ code: "SNAP-ZZZZZZ" })))).toBe("redirect:/resume?notfound=1");
  });
});

describe("the owner", () => {
  beforeEach(() => as(OWNER));

  it("reads every screen of their case", async () => {
    expect(await outcome(() => CasePage(props("case-ready")))).toBe("redirect:/case/case-ready/result");
    expect(textOf(await ResultPage(props("case-ready")))).toContain("Draft the letters and send");
    expect(await outcome(() => IncomePage(props("case-new")))).toBe("rendered");
    expect(await outcome(() => WorkingPage(props("case-parked")))).toBe("rendered");
  });

  it("resumes by code", async () => {
    expect(await outcome(() => resumeByCode(form({ code: "snap aaaaaa" })))).toBe("redirect:/case/case-ready/result");
  });

  it("sends, then deletes, as themselves", async () => {
    expect(await outcome(() => approveAndSendAction("case-ready"))).toBe("redirect:/case/case-ready/done");
    expect(await stateOf("case-ready")).toBe("sent");
    expect((await store.actionsFor("case-ready")).every((a) => a.approvedBy === ownerOf(OWNER))).toBe(true);
    expect(await outcome(() => deleteCaseAction("case-ready"))).toBe("redirect:/snap");
    expect((await store.cases.get("case-ready"))!.deletedAt).toBeTruthy();
    expect((await store.audit("case-ready")).find((e) => e.action === "case.deleted")).toMatchObject({ actor: ownerOf(OWNER) });
  });
});

describe("staff (STAFF_BYPASS, the existing rule)", () => {
  beforeEach(() => {
    process.env.STAFF_BYPASS = "1";
    as(OTHER);
  });

  it("reads and resumes any case (canReadCase)", async () => {
    expect(await outcome(() => ResultPage(props("case-ready")))).toBe("rendered");
    expect(await outcome(() => WorkingPage(props("edge-needs-review")))).toBe("rendered");
    expect(await outcome(() => resumeByCode(form({ code: "SNAP-AAAAAA" })))).toBe("redirect:/case/case-ready/result");
  });

  it("does not change a family's case from the caregiver screens (approve() refuses staff; the staff workspace has its own actions)", async () => {
    expect(await outcome(() => approveAndSendAction("case-ready"))).toBe("not-found");
    expect(await outcome(() => deleteCaseAction("case-ready"))).toBe("not-found");
    expect(await stateOf("case-ready")).toBe("ready_to_send");
    expect((await store.cases.get("case-ready"))!.deletedAt).toBeUndefined();
  });

  it("is refused in production without ALLOW_DEMO", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(await outcome(() => ResultPage(props("case-ready")))).toBe("not-found");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("a signed-in viewer (Supabase session)", () => {
  it("owns the case they start and reads it; another account cannot", async () => {
    session.viewer = { id: "u-jenna", role: "helper" };
    as(null);
    const id = /walk-[A-Za-z0-9]{6}/.exec(await outcome(() => createCaseFromUpload(form({ demo: "main" }))))![0];
    expect(jar.size).toBe(0); // no visitor cookie for a signed-in viewer
    expect(await outcome(() => IncomePage(props(id)))).toBe("rendered");
    expect((await store.cases.get(id))!.ownerId).toBe("u-jenna");

    session.viewer = { id: "u-other", role: "helper" };
    expect(await outcome(() => IncomePage(props(id)))).toBe("not-found");
    expect(await outcome(() => deleteCaseAction(id))).toBe("not-found");
  });

  it("with the staff profile role reads any case and changes none", async () => {
    session.viewer = { id: "u-staff", role: "staff" };
    as(null);
    expect(await outcome(() => ResultPage(props("case-ready")))).toBe("rendered");
    expect(await outcome(() => deleteCaseAction("case-ready"))).toBe("not-found");
    expect((await store.cases.get("case-ready"))!.deletedAt).toBeUndefined();
  });
});

describe("Supabase configured with no session (the deployed setting)", () => {
  it("a visitor is still known by their cookie, and a stranger still refused", async () => {
    // unreachable on purpose and no real key: a signed-out request must not need the network
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    as(OWNER);
    expect(await outcome(() => ResultPage(props("case-ready")))).toBe("rendered");
    as(OTHER);
    expect(await outcome(() => ResultPage(props("case-ready")))).toBe("not-found");
  });
});

describe("the demo bill (a walk case)", () => {
  /** "Use the demo bill" as this browser; returns the walk id. */
  async function startWalk(): Promise<string> {
    const r = await outcome(() => createCaseFromUpload(form({ demo: "main" })));
    const m = /^redirect:\/case\/(walk-[A-Za-z0-9]{6})\/income$/.exec(r);
    expect(m, r).not.toBeNull();
    return m![1];
  }

  it("belongs to the browser that started it, and to no one else", async () => {
    as(null);
    const id = await startWalk();
    const visitor = jar.get(COOKIE);
    expect(visitor).toMatch(/^[0-9a-f-]{36}$/);
    expect(await outcome(() => IncomePage(props(id)))).toBe("rendered");
    expect((await store.cases.get(id))!.ownerId).toBe(ownerOf(visitor!));
    // the cookie is the secret: nothing stored for the case carries it
    expect(JSON.stringify([await store.cases.get(id), await store.audit(id), await store.documentsFor(id)])).not.toContain(visitor);

    as(OTHER);
    expect(await outcome(() => IncomePage(props(id)))).toBe("not-found");
    // a non-owner's hints must not advance someone else's walk
    expect(await outcome(() => DonePage(props(id, { income: "3756000", hh: "1", sent: "1" })))).toBe("not-found");
    expect(await outcome(() => approveAndSendAction(id, { incomeCents: 3756000, sent: true }))).toBe("not-found");
    expect(await stateOf(id)).toBe("created");
  });

  it("is rebuilt for its owner on a fresh instance, and for no one without a cookie", async () => {
    const id = "walk-ABC234";
    as(OWNER);
    await useStore(await seeded());
    expect(await outcome(() => ResultPage(props(id, { income: "3756000", hh: "1" })))).toBe("rendered");
    expect((await store.cases.get(id))!.ownerId).toBe(ownerOf(OWNER));

    as(null);
    await useStore(await seeded());
    expect(await outcome(() => ResultPage(props(id, { income: "3756000", hh: "1" })))).toBe("not-found");
    expect(await store.cases.get(id)).toBeNull();
  });
});

describe("the seeded showcase (/case/demo: old links and the /resume example code)", () => {
  beforeEach(async () => {
    await investigate("demo");
    as(OTHER);
  });

  it("anyone may read it, by link or by its code", async () => {
    expect(await outcome(() => ResultPage(props("demo")))).toBe("rendered");
    expect(await outcome(() => resumeByCode(form({ code: "SNAP-7K4M2D" })))).toBe("redirect:/case/demo/result");
  });

  it("no visitor may send, close or delete it: a send lands on a private copy this browser owns", async () => {
    as(null);
    const sent = await outcome(() => approveAndSendAction("demo"));
    const id = /^redirect:\/case\/(walk-[A-Za-z0-9]{6})\/done\?/.exec(sent)?.[1];
    expect(id, sent).toBeTruthy();
    expect(jar.get(COOKIE)).toMatch(/^[0-9a-f-]{36}$/);
    expect(await outcome(() => DonePage(props(id!, { income: "3756000", hh: "1", sent: "1" })))).toBe("rendered");
    expect((await store.cases.get(id!))!.ownerId).toBe(ownerOf(jar.get(COOKIE)!));
    as(OTHER);
    expect(await outcome(() => DonePage(props(id!, { income: "3756000", hh: "1", sent: "1" })))).toBe("not-found");
    expect(await outcome(() => closeCaseAction("demo"))).toBe("not-found");
    expect(await outcome(() => deleteCaseAction("demo"))).toBe("not-found");
    expect(await stateOf("demo")).toBe("ready_to_send");
  });

  it("DEMO_CONTROLS drives it for the demo video, as the shared demo helper", async () => {
    process.env.DEMO_CONTROLS = "1";
    expect(await outcome(() => approveAndSendAction("demo"))).toBe("redirect:/case/demo/done");
    expect((await store.actionsFor("demo")).every((a) => a.approvedBy === "demo-helper")).toBe(true);
  });
});

describe("the guest line", () => {
  // the page hands TalkToPerson `guest`; TalkToPerson prints the line
  const guestOn = (tree: unknown) => textOf(tree).includes('"guest":true');

  it("TalkToPerson prints the line only when told the case is a guest's", () => {
    expect(textOf(TalkToPerson({ code: "SNAP-AAAAAA", guest: true }))).toContain(GUEST_LINE);
    expect(textOf(TalkToPerson({ code: "SNAP-AAAAAA" }))).not.toContain(GUEST_LINE);
  });

  it("shows on a guest's own case screens, and nowhere else", async () => {
    as(OWNER);
    expect(guestOn(await ResultPage(props("case-ready")))).toBe(true);
    expect(guestOn(await WorkingPage(props("case-parked")))).toBe(true);
    expect(guestOn(await IncomePage(props("case-new")))).toBe(true);
    await investigate("demo");
    expect(guestOn(await ResultPage(props("demo")))).toBe(false); // the showcase is anyone's
    session.viewer = { id: "u-jenna", role: "helper" };
    expect(guestOn(await ResultPage(props("case-ready")))).toBe(false); // signed in
    session.viewer = undefined;
    process.env.STAFF_BYPASS = "1";
    as(OTHER);
    expect(guestOn(await ResultPage(props("case-ready")))).toBe(false); // staff, not the owner
  });

  it("signing in does not take a guest case from this browser, and does not move it to the account", async () => {
    as(OWNER);
    session.viewer = { id: "u-jenna", role: "helper" };
    expect(await outcome(() => ResultPage(props("case-ready")))).toBe("rendered");
    expect(await outcome(() => resumeByCode(form({ code: "SNAP-AAAAAA" })))).toBe("redirect:/case/case-ready/result");
    expect((await store.cases.get("case-ready"))!.ownerId).toBe(ownerOf(OWNER));
    as(null); // the same account in another browser
    expect(await outcome(() => ResultPage(props("case-ready")))).toBe("not-found");
  });
});

describe("delete: the words on the screen match what goes and what stays", () => {
  it("an uploaded bill, sent, answered and recorded, then deleted", async () => {
    as(null);
    const bill = new File([new Uint8Array(readFileSync("fixtures/documents/bill-main.png"))], "bill-main.png", { type: "image/png" });
    const upload = new FormData();
    upload.set("document", bill);
    const created = await outcome(() => createCaseFromUpload(upload));
    const id = /^redirect:\/case\/([0-9a-f-]{36})\/income$/.exec(created)?.[1];
    expect(id, created).toBeTruthy();
    expect((await store.cases.get(id!))!.ownerId).toBe(ownerOf(jar.get(COOKIE)!));
    const owner = jar.get(COOKIE)!;
    as(OTHER);
    expect(await outcome(() => IncomePage(props(id!)))).toBe("not-found");
    as(owner);

    await investigate(id!);
    expect(await outcome(() => approveAndSendAction(id!))).toBe(`redirect:/case/${id}/done`);
    const later = new Date(Date.now() + 40 * 86_400_000).toISOString();
    expect(await deliverResponse(store, id!, later)).not.toBeNull();
    const res = await recordBasisLetter(store, id!, { id: "demo-staff", role: "staff" }, later);

    const page = textOf(await ResolvedPage(props(id!)));
    expect(page).toContain(DELETE_TEXT);
    expect(page).not.toMatch(/Delete everything|Only the case code|keeps only/);

    expect(await outcome(() => deleteCaseAction(id!))).toBe("redirect:/snap");
    // what the words say goes
    expect(await store.documentsFor(id!)).toHaveLength(0);
    expect(await store.findingsFor(id!)).toHaveLength(0);
    expect(await store.responses.list({ caseId: id! })).toHaveLength(0);
    // what the words say stays: the case existed, the savings amounts, the log of actions with file names
    const tomb = (await store.cases.get(id!))!;
    expect(tomb).toMatchObject({ id, deletedAt: expect.any(String) });
    expect(tomb.patientName).not.toMatch(/Dorothy/);
    expect(await store.resolutions.get(id!)).toMatchObject({ estimatedOpportunityCents: res.estimatedOpportunityCents, confirmedAdjustmentCents: res.confirmedAdjustmentCents });
    const log = await store.audit(id!);
    expect(log.find((e) => e.action === "document.uploaded")?.details).toMatchObject({ fileName: "bill-main.png" });
    expect(log.some((e) => e.action === "case.deleted")).toBe(true);

    const after = textOf(await ResolvedPage(props(id!)));
    expect(after).toContain(DELETED_TEXT);
    expect(after).not.toMatch(/Everything on this case|Only the case code/);
  });
});

describe("staff views are logged", () => {
  const views = async (id: string) => (await store.audit(id)).filter((e) => e.action === "case.viewed");

  it("a staff view of someone else's case on the caregiver screens: who, which case, when, and nothing of the case", async () => {
    process.env.STAFF_BYPASS = "1";
    as(OTHER);
    await ResultPage(props("case-ready"));
    const [v, ...more] = await views("case-ready");
    expect(more).toHaveLength(0);
    expect(v).toMatchObject({ caseId: "case-ready", actor: "demo-staff", role: "staff", at: expect.any(String) });
    expect(v.details).toBeUndefined();
    expect(JSON.stringify(v)).not.toMatch(/Dorothy|SNAP-AAAAAA|Riverbend|466/);
  });

  it("names the signed-in staff member, and logs nothing for the owner or a refused viewer", async () => {
    session.viewer = { id: "u-staff", role: "staff" };
    as(null);
    await ResultPage(props("case-ready"));
    expect((await views("case-ready")).map((v) => v.actor)).toEqual(["u-staff"]);
    session.viewer = undefined;
    as(OWNER);
    await ResultPage(props("case-ready"));
    as(OTHER);
    await outcome(() => ResultPage(props("case-ready")));
    expect(await views("case-ready")).toHaveLength(1);
  });

  it("a view in the staff workspace", async () => {
    process.env.STAFF_BYPASS = "1";
    await StaffCasePage({ params: Promise.resolve({ id: "case-ready" }), searchParams: Promise.resolve({}) });
    const [v] = await views("case-ready");
    expect(v).toMatchObject({ caseId: "case-ready", actor: "demo-staff", role: "staff" });
    expect(v.details).toBeUndefined();
  });
});

describe("private mode", () => {
  it("renders with no cookie and sets none", async () => {
    as(null);
    expect(await outcome(() => PrivatePage())).toBe("rendered");
    expect(jar.size).toBe(0);
  });
});
