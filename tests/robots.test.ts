import { expect, it } from "vitest";
import robots from "@/app/robots";

it("robots keeps crawlers off the sample entry, case pages and staff", () => {
  const rules = robots().rules;
  expect(Array.isArray(rules) ? rules : [rules]).toContainEqual({ userAgent: "*", allow: "/", disallow: ["/sample", "/case/", "/staff"] });
});
