// The site-wide Content-Security-Policy (docs/features/snap-incognito.md §9 and §12): every route carries it, the
// pages load under it with nothing refused, and a page cannot reach another origin.
import { expect, test } from "@playwright/test";
import { contentSecurityPolicy } from "../../src/lib/csp";

// a name that never resolves, so nothing leaves this machine even if the policy were missing
const ELSEWHERE = "https://csp-probe.invalid/";

type Reports = { violations: string[] };

// `/staff` is closed on this server (no staff bypass in production mode), so what loads there is its not-available page
for (const path of ["/", "/snap", "/private", "/staff"]) {
  test(`${path} loads with no policy violation, and a fetch to another origin is blocked`, async ({ page }) => {
    // a refused load is reported twice: as an event on the page and as a console message
    await page.addInitScript(() => {
      const reports = ((window as unknown as Reports).violations = [] as string[]);
      document.addEventListener("securitypolicyviolation", (e) => reports.push(`${e.effectiveDirective} ${e.blockedURI}`));
    });
    const refused: string[] = [];
    page.on("console", (message) => {
      if (/content security policy/i.test(message.text())) refused.push(message.text());
    });

    const response = await page.goto(path);
    const headers = response!.headers();
    expect(headers["content-security-policy"]).toBe(contentSecurityPolicy(false));
    // the private route also sends no referrer and is never cached
    if (path === "/private") expect([headers["referrer-policy"], headers["cache-control"]]).toEqual(["no-referrer", "no-store"]);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as Reports).violations)).toEqual([]);
    expect(refused).toEqual([]);

    const probe = await page.evaluate(async (url) => {
      const reports = (window as unknown as Reports).violations;
      const blocked = await fetch(url).then(
        () => false,
        () => true,
      );
      // the event follows the refusal
      for (let i = 0; i < 20 && !reports.length; i++) await new Promise((resolve) => setTimeout(resolve, 50));
      return { blocked, reports };
    }, ELSEWHERE);
    expect(probe.blocked).toBe(true);
    expect(probe.reports).toHaveLength(1);
    expect(probe.reports[0]).toMatch(/^connect-src https:\/\/csp-probe\.invalid/);
  });
}
