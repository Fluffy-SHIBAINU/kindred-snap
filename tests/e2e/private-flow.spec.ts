// Private mode end to end with the demo reader (docs/features/snap-incognito.md §12; rows T1 to T3 and T8 of §4).
// Port 3100: `PRIVATE_READER=fixture`, where nothing a user picks is uploaded and only demo ids reach the server.
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";
import { BUTTON_LABEL, HELD, PROMISES, STOP } from "../../src/lib/private/copy";

const DOCS = "fixtures/documents/";
const SETS = {
  uncovered: ["bill-main.png", "msn-main.png", "income-letter.png"],
  covered: ["bill-main-covered.png", "msn-main-covered.png", "income-letter-covered.png"],
  partly: ["bill-main-partly.png", "msn-main-partly.png", "income-letter-partly.png"],
  mixed: ["bill-main-covered.png", "msn-main.png", "income-letter-partly.png"],
};
// the route offers file inputs and nothing else to fill, choose or tick
const BANNED = ["input:not([type=file])", "select", "textarea", "[contenteditable]", "[role=textbox]", "[type=radio]", "[type=checkbox]"];
// the synthetic patient, her helper, the account number and the Medicare number printed on the uncovered pages
const NAMES = /Dorothy|Hale|Jenna|4821|1EG4/;

// Every request a test's page makes is checked when the test ends: none goes to another origin, none carries a query string.
const test = base.extend<{ requests: string[] }>({
  requests: [
    async ({ page, baseURL }, provide) => {
      const seen: string[] = [];
      page.on("request", (r) => seen.push(`${r.method()} ${r.url()}`));
      await provide(seen);
      for (const line of seen) {
        const url = new URL(line.slice(line.indexOf(" ") + 1));
        expect(url.origin, line).toBe(baseURL);
        expect(url.search, line).toBe("");
      }
    },
    { auto: true },
  ],
});

const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const drop = (page: Page) => h1(page, "Drop the Bill and What Came With It");
const found = (page: Page) => h1(page, "We Found $240.00 You May Not Owe");
const needsNotice = (page: Page) => h1(page, "We Need the Notice or Statement to Check the Charges");
const pick = (page: Page) => page.locator("input[type=file][multiple]");
const paths = (files: string[]) => files.map((f) => DOCS + f);
/** The result as the tab keeps it, serialised. */
const stored = (page: Page) => page.evaluate(() => JSON.stringify((JSON.parse(window.sessionStorage.getItem("snap_private_v1") ?? "{}") as { result?: unknown }).result));

async function clean(page: Page, step: string) {
  for (const selector of BANNED) expect(await page.locator(selector).count(), `${step}: ${selector}`).toBe(0);
}

async function axe(page: Page, step: string) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const grave = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(grave.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`), step).toEqual([]);
}

/** Row T1: $240.00 on line 3, 75% off for one person and free care for two to four, $409.50 if the household is one person. */
async function expectFullResult(page: Page) {
  await expect(found(page)).toBeVisible();
  const clipping = page.locator("main div.shadow-card").first();
  await expect(clipping).toContainText("Bill line 3, Q9967");
  await expect(clipping).toContainText("$240.00");
  await expect(page.getByText("$409.50", { exact: true })).toBeVisible();
  await expect(page.getByText("If the household is one person.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "The Policy's Discount Depends on Household Size" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "75% off" })).toHaveText(/^1\s*Assumed\s*75% off$/);
  await expect(page.getByRole("row").filter({ hasText: "Free care" })).toHaveText(/^2 to 4\s*Free care$/);
}

test("the button on /snap is in the first viewport and opens /private", async ({ page }) => {
  await page.goto("/snap");
  const link = page.getByRole("link", { name: BUTTON_LABEL });
  await expect(link).toBeVisible();
  const box = (await link.boundingBox())!;
  const bar = (await page.locator("[data-action-bar]").boundingBox())!;
  expect(await page.locator("main").evaluate((main) => main.scrollTop)).toBe(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  // inside 390 by 844 and above the bar that sticks to the foot
  expect(box.y + box.height).toBeLessThanOrEqual(Math.min(844, bar.y));
  await link.click();
  await expect(drop(page)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/private");
});

test("/private shows S8, S2 and S3 with nothing opened", async ({ page }) => {
  await page.goto("/private");
  await expect(drop(page)).toBeVisible();
  expect(await page.locator("details[open]").count()).toBe(0);
  for (const sentence of [PROMISES.S8, PROMISES.S2, PROMISES.S3]) await expect(page.getByText(sentence, { exact: true })).toBeVisible();
});

test("the demo files: file inputs only and axe on all four screens, the result of row T1, one letter a page, erase", async ({ page, browserName }) => {
  await page.goto("/private");
  await expect(drop(page)).toBeVisible();
  await clean(page, "drop");
  await axe(page, "drop");
  await page.getByText("What happens to my files").click();
  await clean(page, "drop, details open");

  // the one request is held back so the working screen can be looked at
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/private", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  await page.getByRole("button", { name: "Use the demo files" }).click();
  await expect(h1(page, "We're On It")).toBeVisible();
  await clean(page, "working");
  await axe(page, "working");
  release();

  await expectFullResult(page);
  await page.unroute("**/private");
  await clean(page, "result");
  await axe(page, "result");
  // the two guesses of row T1: household size and coverage type
  const assumed = page.locator("details", { hasText: "What we assumed (2)" });
  await page.getByText("How we worked this out").click();
  await assumed.locator("summary").click();
  await expect(assumed.getByText("One person lives in the home.")).toBeVisible();
  await expect(assumed.getByText("We took this to be Original Medicare, because you dropped a Medicare notice.")).toBeVisible();
  await expect(assumed.getByText("Assumed", { exact: true })).toHaveCount(2);
  await clean(page, "result, rows open");
  expect(await stored(page)).not.toMatch(NAMES);

  await page.getByRole("button", { name: "Get the letters" }).click();
  await expect(h1(page, "Your Letters")).toBeVisible();
  await clean(page, "letters");
  await axe(page, "letters");

  // print: the button opens every document, and on paper each one ends its page
  await page.evaluate(() => {
    window.print = () => {};
  });
  const docs = page.locator("details[data-print-page]");
  const count = await docs.count();
  expect(count).toBe(4);
  await page.getByRole("button", { name: "Print or save as PDF" }).click();
  expect(await page.locator("details[data-print-page]:not([open])").count()).toBe(0);
  await clean(page, "letters, rows open");
  await page.emulateMedia({ media: "print" });
  expect(await docs.evaluateAll((els) => els.map((el) => getComputedStyle(el).breakAfter))).toEqual([...Array<string>(count - 1).fill("page"), "auto"]);
  for (const hidden of ["header", "[data-action-bar]"]) await expect(page.locator(hidden)).toBeHidden();
  if (browserName === "chromium") {
    // only Chromium can print to a file here: the cover sheet, two letters and the page that is kept make four pages.
    // A browser's own print dialog adds margins; `page.pdf` has none unless told.
    const pdf = await page.pdf({ format: "Letter", margin: { top: "0.5in", bottom: "0.5in", left: "0.6in", right: "0.6in" } });
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g)).toHaveLength(count);
  }
  await page.emulateMedia({ media: "screen" });

  await page.getByText("Erase from this phone", { exact: true }).click();
  await clean(page, "erase asked");
  await page.getByRole("button", { name: "Erase it" }).click();
  await expect(page.getByRole("status")).toContainText(PROMISES.S13);
  await expect(drop(page)).toBeVisible();
  expect(await page.evaluate(() => [window.sessionStorage.length, window.localStorage.length])).toEqual([0, 0]);
  await clean(page, "erased");
});

test("each demo set picked by hand, and a mixed one, gives the demo files' result byte for byte (T1 to T3)", async ({ page }) => {
  await page.goto("/private");
  await page.getByRole("button", { name: "Use the demo files" }).click();
  await expectFullResult(page);
  const demo = await stored(page);
  expect(demo).toContain('"outcome":"line_found"');
  for (const [name, files] of Object.entries(SETS)) {
    // a reload keeps the result and drops the held pages, so the result offers to start over
    await page.reload();
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(drop(page)).toBeVisible();
    await pick(page).setInputFiles(paths(files));
    await expectFullResult(page);
    const result = await stored(page);
    expect(result, name).toBe(demo);
    expect(result, name).not.toMatch(NAMES);
  }
});

test("a bill first, then the notice and the income letter added afterwards, ends in the full result", async ({ page }) => {
  await page.goto("/private");
  await pick(page).setInputFiles(DOCS + "bill-main-covered.png");
  await expect(needsNotice(page)).toBeVisible();
  await expect(page.getByText("Until we have it, we won't say whether $466.00 is right.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "What This Hospital's Policy Lists, by Household Size" })).toBeVisible();
  await clean(page, "no notice");

  await page.getByLabel("Add another file").setInputFiles(DOCS + "msn-main-covered.png");
  await expect(found(page)).toBeVisible();
  await page.getByLabel("Add another file").setInputFiles(DOCS + "income-letter-covered.png");
  await expectFullResult(page);
});

test("the hard stop: a covered amount owed stops the check, keeps the page, and the next file completes it (T8)", async ({ page }) => {
  await page.goto("/private");
  await pick(page).setInputFiles(DOCS + "bill-main-amount-covered.png");
  const status = page.getByRole("status");
  await expect(status).toContainText(STOP.covered);
  await expect(status).toContainText(PROMISES.S15);
  await expect(status).toContainText(HELD.one);
  await expect(drop(page)).toBeVisible();
  await clean(page, "hard stop");
  expect(await stored(page)).toBeUndefined();

  await pick(page).setInputFiles(DOCS + "bill-main-covered.png");
  await expect(needsNotice(page)).toBeVisible();
});

test("a file that is not a demo file makes no request", async ({ page, requests }) => {
  await page.goto("/private");
  await page.waitForLoadState("networkidle");
  const loaded = requests.length;
  await pick(page).setInputFiles(DOCS + "bill-ekg.png");
  await expect(page.getByRole("status")).toContainText(PROMISES.S8);
  await expect(drop(page)).toBeVisible();
  await clean(page, "refused");
  await page.waitForTimeout(1000);
  expect(requests.slice(loaded)).toEqual([]);
});

test("keyboard only, from the drop screen to Print or save as PDF", async ({ page, browserName }) => {
  // Safari moves through links and buttons with Option-Tab; Tab alone stops at form fields
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  const tabTo = async (name: string) => {
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press(tab);
      if (await page.evaluate((text) => (document.activeElement?.textContent ?? "").trim() === text, name)) return;
    }
    throw new Error(`Tab never reached "${name}"`);
  };
  await page.addInitScript(() => {
    window.print = () => {
      window.name = "printed";
    };
  });
  await page.goto("/private");
  await expect(drop(page)).toBeVisible();
  await tabTo("Use the demo files");
  await page.keyboard.press("Enter");
  await expect(found(page)).toBeVisible();
  await tabTo("Get the letters");
  await page.keyboard.press("Enter");
  await expect(h1(page, "Your Letters")).toBeVisible();
  await tabTo("Print or save as PDF");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.name)).toBe("printed");
  expect(await page.locator("details[data-print-page]:not([open])").count()).toBe(0);
});
