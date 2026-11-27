import { expect, test } from "@playwright/test";

// The access check in a real build: the visitor cookie is set by the server action and read by the pages after it.

test("a demo walk opens for the browser that started it and for no other", async ({ page, browser }) => {
  await page.goto("/snap");
  await page.getByRole("button", { name: "Use the demo bill" }).click();
  await page.waitForURL(/\/case\/walk-[A-Za-z0-9]{6}\/income$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your Income" })).toBeVisible();
  const url = page.url();

  const other = await browser.newContext();
  try {
    const stranger = await other.newPage();
    const res = await stranger.goto(url);
    await expect(stranger.getByRole("heading", { level: 1, name: "Not Available" })).toBeVisible();
    // nothing of the case in the response, the streamed payload included: no code, no patient, no hospital
    expect(await res!.text()).not.toMatch(/SNAP-[A-Z0-9]{6}|Dorothy|Riverbend/);
  } finally {
    await other.close();
  }
});

test("the seeded showcase opens for anyone, read-only", async ({ page }) => {
  await page.goto("/case/demo/result");
  await expect(page.getByRole("link", { name: "Snap a bill" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Draft the letters and send" })).toHaveCount(0);
});
