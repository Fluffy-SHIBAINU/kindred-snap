import { afterEach, describe, expect, it, vi } from "vitest";
import { SyntheticBlueButton } from "@/lib/adapters/claims/synthetic";
import { ConnectorUnavailable } from "@/lib/adapters/claims/types";
import type { Document } from "@/lib/types";
import { msnLines, msnTotals } from "./helpers/synthetic";

const msn: Document = {
  id: "doc-msn",
  caseId: "case-fixture",
  kind: "msn",
  fileName: "msn-main.png",
  pages: 2,
  fields: [],
  msnLines,
  msnTotals,
  status: "readable",
  uploadedAt: "2026-11-09T01:00:00.000Z",
};
const loadFixture = vi.fn(() => ({ documents: [msn] }));
const connector = (forceDown?: boolean) => new SyntheticBlueButton({ forceDown, loadFixture });

afterEach(() => vi.unstubAllEnvs());

describe("synthetic Blue Button connector", () => {
  it("is connected and serves the notice for the main case, re-homed on the live case", async () => {
    const c = connector();
    expect(await c.state()).toBe("connected");
    const doc = await c.fetchNotice({ caseId: "case-1", fixtureKey: "main" });
    expect(loadFixture).toHaveBeenCalledWith("main");
    expect(doc?.kind).toBe("msn");
    expect(doc?.caseId).toBe("case-1");
    expect(doc?.id).toBe("case-1-msn");
    expect(doc?.msnTotals?.maxYouMayBeBilledCents).toBe(22600);
    expect(doc?.msnLines?.[2].youMayBeBilledCents).toBe(0);
  });

  it("defaults to the main fixture when the case has no fixture key", async () => {
    expect((await connector().fetchNotice({ caseId: "case-2" }))?.kind).toBe("msn");
  });

  it("returns null when Medicare has no notice on record", async () => {
    expect(await connector().fetchNotice({ caseId: "case-3", fixtureKey: "edge-missing-notice" })).toBeNull();
  });

  it("throws ConnectorUnavailable for the connector-down case while still reporting connected", async () => {
    const c = connector();
    await expect(c.fetchNotice({ caseId: "case-4", fixtureKey: "edge-connector-down" })).rejects.toBeInstanceOf(ConnectorUnavailable);
    expect(await c.state()).toBe("connected");
  });

  it("is unavailable when forced down, and the state says so", async () => {
    const c = connector(true);
    expect(await c.state()).toBe("unavailable");
    await expect(c.fetchNotice({ caseId: "case-5", fixtureKey: "main" })).rejects.toBeInstanceOf(ConnectorUnavailable);
  });

  it("recovers when CLAIMS_FORCE_DOWN is cleared", async () => {
    const c = connector();
    vi.stubEnv("CLAIMS_FORCE_DOWN", "1");
    expect(await c.state()).toBe("unavailable");
    await expect(c.fetchNotice({ caseId: "case-6", fixtureKey: "main" })).rejects.toBeInstanceOf(ConnectorUnavailable);
    vi.stubEnv("CLAIMS_FORCE_DOWN", "0");
    expect(await c.state()).toBe("connected");
    expect((await c.fetchNotice({ caseId: "case-6", fixtureKey: "main" }))?.kind).toBe("msn");
  });

  it("refuses a fixture key that is not a plain name", async () => {
    await expect(new SyntheticBlueButton().fetchNotice({ caseId: "x", fixtureKey: "../hospitals" })).rejects.toThrow(/fixture key/);
  });
});
