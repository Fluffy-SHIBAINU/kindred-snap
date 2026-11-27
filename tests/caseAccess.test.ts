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
import { SyntheticBlueButton } from "@/lib/adapters/claims/synthetic";
import { MemoryStore, seedDemo, type Store } from "@/lib/adapters/store";
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

const COOKIE = "snap_visitor";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
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
  process.env.STAFF_BYPASS = "0";
  process.env.DEMO_CONTROLS = "0";
  for (const k of SIGNED_OUT) delete process.env[k];
  await useStore(await seeded());
  await putCase("case-ready", "SNAP-AAAAAA", "visitor:" + OWNER);
  await investigate("case-ready");
  await putCase("case-new", "SNAP-BBBBBB", "visitor:" + OWNER);
  await putCase("case-parked", "SNAP-CCCCCC", "visitor:" + OWNER, { state: "needs_notice" });
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
    expect(await outcome(() => ResultPage(props("case-ready")))).toBe("rendered");
    expect(await outcome(() => IncomePage(props("case-new")))).toBe("rendered");
    expect(await outcome(() => WorkingPage(props("case-parked")))).toBe("rendered");
  });

  it("resumes by code", async () => {
    expect(await outcome(() => resumeByCode(form({ code: "snap aaaaaa" })))).toBe("redirect:/case/case-ready/result");
  });

  it("sends, then deletes, as themselves", async () => {
    expect(await outcome(() => approveAndSendAction("case-ready"))).toBe("redirect:/case/case-ready/done");
    expect(await stateOf("case-ready")).toBe("sent");
    expect((await store.actionsFor("case-ready")).every((a) => a.approvedBy === "visitor:" + OWNER)).toBe(true);
    expect(await outcome(() => deleteCaseAction("case-ready"))).toBe("redirect:/snap");
    expect((await store.cases.get("case-ready"))!.deletedAt).toBeTruthy();
    expect((await store.audit("case-ready")).find((e) => e.action === "case.deleted")).toMatchObject({ actor: "visitor:" + OWNER });
  });
});

describe("staff (STAFF_BYPASS, the existing rule)", () => {
  beforeEach(() => {
    process.env.STAFF_BYPASS = "1";
    as(OTHER);
  });

  it("reads and deletes any case", async () => {
    expect(await outcome(() => ResultPage(props("case-ready")))).toBe("rendered");
    expect(await outcome(() => WorkingPage(props("edge-needs-review")))).toBe("rendered");
    expect(await outcome(() => resumeByCode(form({ code: "SNAP-AAAAAA" })))).toBe("redirect:/case/case-ready/result");
    expect(await outcome(() => deleteCaseAction("case-ready"))).toBe("redirect:/snap");
    expect((await store.cases.get("case-ready"))!.deletedAt).toBeTruthy();
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
    expect((await store.cases.get(id))!.ownerId).toBe("visitor:" + visitor);

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
    expect((await store.cases.get(id))!.ownerId).toBe("visitor:" + OWNER);

    as(null);
    await useStore(await seeded());
    expect(await outcome(() => ResultPage(props(id, { income: "3756000", hh: "1" })))).toBe("not-found");
    expect(await store.cases.get(id)).toBeNull();
  });
});

describe("the seeded showcase (/case/demo, linked from the landing)", () => {
  beforeEach(async () => {
    await investigate("demo");
    as(OTHER);
  });

  it("anyone may read it, by link or by its code", async () => {
    expect(await outcome(() => ResultPage(props("demo")))).toBe("rendered");
    expect(await outcome(() => resumeByCode(form({ code: "SNAP-7K4M2D" })))).toBe("redirect:/case/demo/result");
  });

  it("no visitor may send, close or delete it", async () => {
    expect(await outcome(() => approveAndSendAction("demo"))).toBe("not-found");
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

describe("private mode", () => {
  it("renders with no cookie and sets none", async () => {
    as(null);
    expect(await outcome(() => PrivatePage())).toBe("rendered");
    expect(jar.size).toBe(0);
  });
});
