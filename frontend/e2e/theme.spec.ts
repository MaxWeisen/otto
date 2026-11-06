import { expect, test } from "@playwright/test";

test.use({ colorScheme: "light" });

test("remembers the chosen theme across reloads", async ({ page }) => {
  const html = page.locator("html");
  const toggle = page.getByRole("button", { name: "Toggle theme" });

  await page.goto("/vehicles");

  await expect(html).not.toHaveClass(/\bdark\b/);

  await toggle.click();

  await expect(html).toHaveClass(/\bdark\b/);

  await page.reload();

  await expect(html).toHaveClass(/\bdark\b/);

  await page.emulateMedia({ colorScheme: "dark" });
  await toggle.click();

  await expect(html).not.toHaveClass(/\bdark\b/);

  await page.reload();

  await expect(html).not.toHaveClass(/\bdark\b/);
});
