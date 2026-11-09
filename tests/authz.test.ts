import { describe, expect, it } from "vitest";
import { canReadCase, canStaff } from "@/lib/server/authz";

const c = { ownerId: "u-jenna" };

describe("authz", () => {
  it("lets the owner read their case", () => expect(canReadCase({ id: "u-jenna", role: "helper" }, c)).toBe(true));
  it("refuses another user", () => expect(canReadCase({ id: "u-other", role: "helper" }, c)).toBe(false));
  it("refuses a signed-out viewer", () => expect(canReadCase(null, c)).toBe(false));
  it("lets staff and admin read any case", () => {
    expect(canReadCase({ id: "u-staff", role: "staff" }, c)).toBe(true);
    expect(canReadCase({ id: "u-admin", role: "admin" }, c)).toBe(true);
  });
  it("canStaff is staff or admin only", () => {
    expect(canStaff({ id: "u", role: "staff" })).toBe(true);
    expect(canStaff({ id: "u", role: "admin" })).toBe(true);
    expect(canStaff({ id: "u", role: "patient" })).toBe(false);
    expect(canStaff(null)).toBe(false);
  });
});
