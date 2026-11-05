import { expect, test } from "@playwright/test";

test.use({ colorScheme: "light" });

test("remembers the chosen theme across reloads", async ({ page }) => {
  const html = page.locator("html");

  await page.goto("/vehicles");

  await expect(html).not.toHaveClass(/\bdark\b/);

  await page.getByRole("button", { name: "Switch to dark theme" }).click();

  await expect(html).toHaveClass(/\bdark\b/);

  await page.reload();

  await expect(html).toHaveClass(/\bdark\b/);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("button", { name: "Switch to light theme" }).click();

  await expect(html).not.toHaveClass(/\bdark\b/);

  await page.reload();

  await expect(html).not.toHaveClass(/\bdark\b/);
  await expect(
    page.getByRole("button", { name: "Switch to dark theme" }),
  ).toBeVisible();
});
