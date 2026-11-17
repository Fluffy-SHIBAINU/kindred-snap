import { expect, test } from "@playwright/test";

test("/snap shows its heading", async ({ page }) => {
  await page.goto("/snap");
  await expect(page.getByRole("heading", { level: 1, name: "Take a Photo of the Bill" })).toBeVisible();
});
