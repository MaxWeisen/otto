import { expect, test, type Page } from "@playwright/test";
import {
  clearVehicles,
  findVehicle,
  insertOtherUsersVehicle,
  insertVehicle,
} from "./db";

test.beforeEach(async () => {
  await clearVehicles();
});

const accord = {
  year: 2003,
  make: "Honda",
  model: "Accord",
  trim: "EX-V6",
  vin: "1HGCM82633A004352",
  nickname: "Commuter",
  mileage: 182000,
};

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

test("edits a vehicle in place and shows the new details everywhere", async ({
  page,
}) => {
  const id = await insertVehicle(accord);

  await page.goto(`/vehicles/${id}`);
  await page.getByRole("button", { name: "Edit vehicle" }).click();

  const form = page.getByRole("form", { name: "Edit vehicle" });

  await expect(page).toHaveURL(`/vehicles/${id}`);
  await expect(form.getByRole("textbox", { name: "Year" })).toBeFocused();
  await expect(form.getByRole("combobox", { name: "Model" })).toHaveValue(
    "Accord",
  );

  await form.getByRole("textbox", { name: "Year" }).fill("2020");
  await chooseOption(page, "Make", "toy", "Toyota");
  await expect(form.getByRole("combobox", { name: "Model" })).toBeEnabled();
  await chooseOption(page, "Model", "cam", "Camry");
  await form.getByRole("textbox", { name: /^Trim/ }).fill("SE");
  await form.getByRole("textbox", { name: /^VIN/ }).fill("4t1b11hk5ku000001");
  await form.getByRole("textbox", { name: /^Mileage/ }).fill("45,250");
  await form.getByRole("textbox", { name: /^Nickname/ }).fill("Family car");
  await form.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Vehicle updated")).toBeVisible();
  await expect(form).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit vehicle" }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "2020 Toyota Camry" }),
  ).toBeVisible();
  await expect(page).toHaveTitle("2020 Toyota Camry - Otto");

  const main = page.getByRole("main");
  const detail = (label: string) => main.locator(`dt:text-is("${label}") + dd`);

  await expect(main).toContainText("Family car");
  await expect(detail("Make")).toHaveText("Toyota");
  await expect(detail("Model")).toHaveText("Camry");
  await expect(detail("Trim")).toHaveText("SE");
  await expect(detail("Mileage")).toHaveText("45,250 mi");
  await expect(detail("VIN")).toHaveText("4T1B11HK5KU000001");

  await page.getByRole("link", { name: "Back to vehicles" }).click();

  const card = page.getByRole("listitem").filter({
    hasText: "2020 Toyota Camry",
  });

  await expect(card).toContainText("Family car");
  await expect(card.locator('dt:text-is("Trim") + dd')).toHaveText("SE");
  await expect(card.locator('dt:text-is("Mileage") + dd')).toHaveText(
    "45,250 mi",
  );
  await expect(page.getByText("2003 Honda Accord")).toHaveCount(0);
});

test("cancels an edit with Escape without saving", async ({ page }) => {
  const id = await insertVehicle(accord);

  await page.goto(`/vehicles/${id}`);
  await page.getByRole("button", { name: "Edit vehicle" }).click();

  const form = page.getByRole("form", { name: "Edit vehicle" });

  await form.getByRole("textbox", { name: /^Nickname/ }).fill("Renamed");
  await page.keyboard.press("Escape");

  await expect(form).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit vehicle" }),
  ).toBeFocused();
  await expect(page.getByRole("main")).toContainText("Commuter");

  await page.reload();

  await expect(page.getByRole("main")).toContainText("Commuter");
  expect(await findVehicle(id)).toMatchObject({ nickname: "Commuter" });
});

test("keeps people in the form until the vehicle is valid", async ({
  page,
}) => {
  const id = await insertVehicle(accord);

  await page.goto(`/vehicles/${id}`);
  await page.getByRole("button", { name: "Edit vehicle" }).click();

  const form = page.getByRole("form", { name: "Edit vehicle" });

  await form.getByRole("textbox", { name: "Year" }).fill("1700");
  await form.getByRole("textbox", { name: /^VIN/ }).fill("ABC");
  await form.getByRole("button", { name: "Save" }).click();

  await expect(form.getByText("Year must be between 1886")).toBeVisible();
  await expect(
    form.getByText("VIN must be 17 characters (currently 3)"),
  ).toBeVisible();
  await expect(form.getByRole("textbox", { name: "Year" })).toBeFocused();
  expect(await findVehicle(id)).toMatchObject({ year: 2003 });
});

test("cannot save over another user's vehicle with a crafted request", async ({
  page,
}) => {
  const ownId = await insertVehicle(accord);
  const otherId = await insertOtherUsersVehicle({
    year: 1967,
    make: "Chevrolet",
    model: "Impala",
    trim: "SS 427",
    nickname: "Someone else's car",
    mileage: 98765,
  });
  let craftedRequests = 0;

  // Point the save's bound vehicle id at the other user's vehicle, as a
  // tampered request from this browser would.
  await page.route(`**/vehicles/${ownId}`, async (route) => {
    const request = route.request();
    const body = request.postData();

    if (request.method() !== "POST" || !request.headers()["next-action"]) {
      await route.continue();
      return;
    }

    const crafted = body?.replace(`[${ownId},`, `[${otherId},`);

    expect(crafted).not.toBe(body);
    craftedRequests += 1;
    await route.continue({ postData: crafted });
  });

  await page.goto(`/vehicles/${ownId}`);
  await page.getByRole("button", { name: "Edit vehicle" }).click();

  const form = page.getByRole("form", { name: "Edit vehicle" });

  await form.getByRole("textbox", { name: /^Nickname/ }).fill("Stolen");
  await form.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Vehicle not found")).toBeVisible();
  await expect(page.getByText("Vehicle updated")).toHaveCount(0);
  expect(craftedRequests).toBe(1);
  expect(await findVehicle(otherId)).toEqual({
    year: 1967,
    make: "Chevrolet",
    model: "Impala",
    trim: "SS 427",
    vin: null,
    nickname: "Someone else's car",
    mileage: 98765,
  });
  expect(await findVehicle(ownId)).toMatchObject({ nickname: "Commuter" });
});
