import { describe, expect, it } from "vitest";
import { screenFor } from "@/lib/case/route";
import { TRANSITIONS, type CaseState } from "@/lib/case/state";

describe("screenFor", () => {
  it("maps every state to one screen", () => {
    for (const s of Object.keys(TRANSITIONS) as CaseState[]) expect(screenFor(s)).toMatch(/^\/(snap|working|result|done|resolved)$/);
  });
  it("sends the six-screen flow to the right places", () => {
    expect(screenFor("created")).toBe("/snap");
    expect(screenFor("drafting")).toBe("/working");
    expect(screenFor("connector_unavailable")).toBe("/working");
    expect(screenFor("ready_to_send")).toBe("/result");
    expect(screenFor("sent")).toBe("/done");
    expect(screenFor("resolved")).toBe("/resolved");
  });
});
