import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), connection: async () => {} }));

// redirect() throws in Next; here it throws the target so a test can read where the visitor was sent
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import { approveAndSendAction } from "@/app/(caregiver)/case/[id]/result/actions";
import { getServerStore } from "@/lib/server/store";

const g = globalThis as typeof globalThis & { __snapStore?: unknown; __snapSeeded?: unknown };

async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if ((e as { url?: string }).url) return (e as { url: string }).url;
    throw e;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  g.__snapStore = undefined;
  g.__snapSeeded = undefined;
});

describe("the shared sample case", () => {
  it("a visitor's send on the sample leaves `demo` presentable for the next visitor, warm or cold", async () => {
    const store = await getServerStore();
    expect((await store.cases.get("demo"))!.state).toBe("ready_to_send");

    const done = await redirectOf(approveAndSendAction("demo"));
    expect(done).toMatch(/\/done(\?|$)/); // the visitor who sent reaches the done page

    // the next visitor on the same instance
    expect((await store.cases.get("demo"))!.state).toBe("ready_to_send");
    // the next visitor on a cold instance sharing the database (Supabase): seeding and preparing run again
    g.__snapSeeded = undefined;
    expect((await (await getServerStore()).cases.get("demo"))!.state).toBe("ready_to_send");
  });
});

describe("the sample entry (/sample)", () => {
  it("gives each visitor a private walk copy: sending reaches done and leaves `demo` and the next visitor's copy untouched", async () => {
    const { GET } = await import("@/app/sample/route");
    const { ensureWalkCase, isWalkId, parseWalkHints } = await import("@/lib/server/walk");
    const parse = (href: string) => {
      const u = new URL(href, "http://x");
      const [, , id, screen] = u.pathname.split("/");
      return { id, screen, hints: parseWalkHints(Object.fromEntries(u.searchParams)) };
    };
    const store = await getServerStore();
    const demoBefore = await store.cases.get("demo");

    const res = await GET();
    expect(res.status).toBe(307);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const a = parse(res.headers.get("Location")!);
    expect(isWalkId(a.id)).toBe(true);
    expect(a.screen).toBe("result");
    expect((await ensureWalkCase(store, a.id, a.hints))!.state).toBe("ready_to_send"); // what the result page loads

    const done = parse(await redirectOf(approveAndSendAction(a.id, a.hints)));
    expect(done).toMatchObject({ id: a.id, screen: "done" });
    expect((await ensureWalkCase(store, done.id, done.hints))!.state).toBe("sent"); // what the done page loads

    const b = parse((await GET()).headers.get("Location")!);
    expect(b.id).not.toBe(a.id);
    expect((await ensureWalkCase(store, b.id, b.hints))!.state).toBe("ready_to_send");
    expect(await store.cases.get("demo")).toEqual(demoBefore);
  });

  it("a send on an old /case/demo link lands on a private copy's done page", async () => {
    const { ensureWalkCase, isWalkId, parseWalkHints } = await import("@/lib/server/walk");
    const store = await getServerStore();
    const u = new URL(await redirectOf(approveAndSendAction("demo")), "http://x");
    const [, , id, screen] = u.pathname.split("/");
    expect(isWalkId(id)).toBe(true);
    expect(screen).toBe("done");
    expect((await ensureWalkCase(store, id, parseWalkHints(Object.fromEntries(u.searchParams))))!.state).toBe("sent");
  });
});
