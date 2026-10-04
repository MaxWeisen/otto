import { expect, test, type Page } from "@playwright/test";
import { clearVehicles } from "./db";

test.beforeEach(async () => {
  await clearVehicles();
});

async function chooseOption(
  page: Page,
  label: string,
  query: string,
  option: string,
) {
  const combobox = page.getByRole("combobox", { name: label });

  await combobox.click();
  await combobox.fill(query);
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("signed-in visitors land on an empty vehicle list", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL("/vehicles");
  await expect(page.getByText("No vehicles yet")).toBeVisible();
});

test("adds a vehicle through both steps", async ({ page }) => {
  await page.goto("/vehicles");
  await page.getByRole("button", { name: "Add vehicle" }).click();

  await expect(page).toHaveURL("/vehicles/new");
  await expect(page.getByText("Step 1 of 2")).toBeVisible();

  await page.getByRole("textbox", { name: "Year" }).fill("2020");
  await chooseOption(page, "Make", "toy", "Toyota");
  await expect(page.getByRole("combobox", { name: "Model" })).toBeEnabled();
  await chooseOption(page, "Model", "cam", "Camry");
  await page.getByRole("textbox", { name: /^Trim/ }).fill("SE");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Step 2 of 2")).toBeVisible();

  await page.getByRole("textbox", { name: /^Mileage/ }).fill("84,500");
  await page.getByRole("textbox", { name: /^Nickname/ }).fill("Family car");
  await page.getByRole("button", { name: "Add vehicle" }).click();

  await expect(page).toHaveURL("/vehicles");
  await expect(page.getByText("Vehicle added")).toBeVisible();

  const card = page.getByRole("listitem").filter({
    hasText: "2020 Toyota Camry",
  });

  await expect(card).toContainText("Family car");
  await expect(card).toContainText("SE");
  await expect(card).toContainText("84,500 mi");
  await expect(page.getByText("1 vehicle in your garage")).toBeVisible();
});

test("fills step 1 from a decoded VIN and saves it", async ({ page }) => {
  await page.goto("/vehicles/new");

  await page.getByRole("textbox", { name: /^VIN/ }).fill("1hgcm82633a004352");
  await page.getByRole("button", { name: "Decode" }).click();

  await expect(page.getByText("2003 Honda Accord EX-V6")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Year" })).toHaveValue("2003");
  await expect(page.getByRole("combobox", { name: "Make" })).toHaveValue(
    "Honda",
  );
  await expect(page.getByRole("combobox", { name: "Model" })).toHaveValue(
    "Accord",
  );
  await expect(page.getByRole("textbox", { name: /^Trim/ })).toHaveValue(
    "EX-V6",
  );

  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Add vehicle" }).click();

  await expect(page).toHaveURL("/vehicles");

  const card = page.getByRole("listitem").filter({
    hasText: "2003 Honda Accord",
  });

  await expect(card).toContainText("EX-V6");
  await expect(card).toContainText("1HGCM82633A004352");
});

test("keeps people on step 1 until it is valid", async ({ page }) => {
  await page.goto("/vehicles/new");

  await page.getByRole("textbox", { name: "Year" }).fill("1700");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await expect(page.getByText("Year must be between 1886 and")).toBeVisible();
  await expect(page.getByText("Make is required")).toBeVisible();
  await expect(page.getByText("Model is required")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Year" })).toBeFocused();
});
