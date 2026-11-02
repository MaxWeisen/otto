import { expect, test } from "@playwright/test";
import { clearVehicles, insertOtherUsersVehicle, insertVehicle } from "./db";

test.beforeEach(async () => {
  await clearVehicles();
});

test("opens a vehicle's details from the list", async ({ page }) => {
  const id = await insertVehicle({
    year: 2003,
    make: "Honda",
    model: "Accord",
    trim: "EX-V6",
    vin: "1HGCM82633A004352",
    nickname: "Commuter",
    mileage: 182000,
  });

  await page.goto("/vehicles");

  const card = page.getByRole("listitem").filter({
    hasText: "2003 Honda Accord",
  });

  await expect(card.locator('dt:text-is("Make") + dd')).toHaveText("Honda");

  await card
    .getByRole("button", { name: "Details for 2003 Honda Accord" })
    .click();

  await expect(page).toHaveURL(`/vehicles/${id}`);
  await expect(page).toHaveTitle("2003 Honda Accord - Otto");
  await expect(
    page.getByRole("heading", { name: "2003 Honda Accord" }),
  ).toBeVisible();

  const main = page.getByRole("main");
  const detail = (label: string) => main.locator(`dt:text-is("${label}") + dd`);

  await expect(main).toContainText("Commuter");
  await expect(detail("Make")).toHaveText("Honda");
  await expect(detail("Model")).toHaveText("Accord");
  await expect(detail("Trim")).toHaveText("EX-V6");
  await expect(detail("Mileage")).toHaveText("182,000 mi");
  await expect(detail("VIN")).toHaveText("1HGCM82633A004352");

  await page.getByRole("link", { name: "Back to vehicles" }).click();

  await expect(page).toHaveURL("/vehicles");
});

test("hides another user's vehicle behind the not-found page", async ({
  page,
}) => {
  const id = await insertOtherUsersVehicle({
    year: 1967,
    make: "Chevrolet",
    model: "Impala",
    trim: "SS 427",
    vin: "164677J100001",
    nickname: "Someone else's car",
    mileage: 98765,
  });

  const response = await page.goto(`/vehicles/${id}`);
  const html = await response!.text();
  const main = page.getByRole("main");

  await expect(main.getByText("Vehicle not found")).toBeVisible();

  for (const detail of [
    "Impala",
    "SS 427",
    "164677J100001",
    "Someone else's car",
    "98765",
    "98,765",
  ]) {
    expect(html).not.toContain(detail);
    await expect(main).not.toContainText(detail);
  }

  await main.getByRole("button", { name: "Back to vehicles" }).click();

  await expect(page).toHaveURL("/vehicles");
});

test("shows the not-found page for an id that is not a number", async ({
  page,
}) => {
  await page.goto("/vehicles/abc");

  await expect(page.getByText("Vehicle not found")).toBeVisible();
});

test("keeps /vehicles/new as the add vehicle page", async ({ page }) => {
  await page.goto("/vehicles/new");

  await expect(
    page.getByRole("heading", { name: "Add vehicle" }),
  ).toBeVisible();
  await expect(page.getByText("Vehicle not found")).toHaveCount(0);
});
