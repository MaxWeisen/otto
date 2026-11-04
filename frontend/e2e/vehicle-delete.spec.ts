import { expect, test } from "@playwright/test";
import {
  clearVehicles,
  countMaintenanceRecords,
  findVehicle,
  insertMaintenanceRecord,
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
  nickname: "Commuter",
  mileage: 182000,
};

const camry = { year: 2015, make: "Toyota", model: "Camry" };

test("deletes a vehicle with its maintenance records after confirmation", async ({
  page,
}) => {
  const id = await insertVehicle(accord);
  await insertVehicle(camry);
  await insertMaintenanceRecord(id);

  await page.goto(`/vehicles/${id}`);

  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit vehicle" }).click();
  await page.getByRole("button", { name: "Delete" }).click();

  const dialog = page.getByRole("alertdialog", {
    name: "Delete 2003 Honda Accord?",
  });

  await expect(dialog).toContainText("maintenance records");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("form", { name: "Edit vehicle" })).toBeVisible();
  expect(await findVehicle(id)).toBeDefined();

  await page.getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete vehicle" }).click();

  await expect(page).toHaveURL("/vehicles");
  await expect(page.getByText("Vehicle deleted")).toBeVisible();
  await expect(page.getByText("1 vehicle in your garage")).toBeVisible();
  await expect(page.getByText("2015 Toyota Camry")).toBeVisible();
  await expect(page.getByText("2003 Honda Accord")).toHaveCount(0);
  expect(await findVehicle(id)).toBeUndefined();
  expect(await countMaintenanceRecords(id)).toBe(0);

  await page.goto(`/vehicles/${id}`);

  await expect(page.getByText("Vehicle not found")).toBeVisible();
});

test("cannot delete another user's vehicle with a crafted request", async ({
  page,
}) => {
  const ownId = await insertVehicle(accord);
  const otherId = await insertOtherUsersVehicle({
    year: 1967,
    make: "Chevrolet",
    model: "Impala",
    nickname: "Someone else's car",
  });
  await insertMaintenanceRecord(otherId);
  let craftedRequests = 0;

  // Point the delete's bound vehicle id at the other user's vehicle, as a
  // tampered request from this browser would.
  await page.route(`**/vehicles/${ownId}`, async (route) => {
    const request = route.request();
    const body = request.postData();

    if (request.method() !== "POST" || !request.headers()["next-action"]) {
      await route.continue();
      return;
    }

    const crafted = body?.replace(`[${ownId}]`, `[${otherId}]`);

    expect(crafted).not.toBe(body);
    craftedRequests += 1;
    await route.continue({ postData: crafted });
  });

  await page.goto(`/vehicles/${ownId}`);
  await page.getByRole("button", { name: "Edit vehicle" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete vehicle" }).click();

  await expect(page.getByText("Vehicle not found")).toBeVisible();
  await expect(page.getByText("Vehicle deleted")).toHaveCount(0);
  expect(craftedRequests).toBe(1);
  expect(await findVehicle(otherId)).toMatchObject({
    make: "Chevrolet",
    nickname: "Someone else's car",
  });
  expect(await countMaintenanceRecords(otherId)).toBe(1);
  expect(await findVehicle(ownId)).toBeDefined();
});
