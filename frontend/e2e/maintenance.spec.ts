import { expect, test, type Page } from "@playwright/test";
import {
  clearVehicles,
  findMaintenanceRecords,
  insertMaintenanceRecord,
  insertOtherUsersVehicle,
  insertVehicle,
} from "./db";
import { E2E_BACKEND_PORT } from "./env";

test.beforeEach(async () => {
  await clearVehicles();
});

const accord = {
  year: 2003,
  make: "Honda",
  model: "Accord",
  mileage: 182000,
};

function maintenance(page: Page) {
  return page.getByRole("main").getByRole("region", { name: /^\d{4}$/ });
}

test("adds, edits and deletes a maintenance record", async ({ page }) => {
  const id = await insertVehicle(accord);

  await page.goto(`/vehicles/${id}`);
  await expect(page.getByText("No maintenance logged yet")).toBeVisible();

  await page.getByRole("button", { name: "Add your first record" }).click();

  const addDialog = page.getByRole("dialog", {
    name: "Add maintenance record",
  });

  await expect(
    addDialog.getByRole("textbox", { name: /^Mileage/ }),
  ).toHaveValue("182,000");
  await addDialog.getByRole("button", { name: "Add record" }).click();
  await expect(addDialog.getByText("Type is required")).toBeVisible();
  await expect(addDialog.getByRole("combobox", { name: "Type" })).toBeFocused();

  await addDialog.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "Oil change" }).click();
  await addDialog
    .getByRole("textbox", { name: /^Description/ })
    .fill("Synthetic 5W-30 and filter");
  await addDialog.getByLabel("Date").fill("2025-03-14");
  await addDialog.getByRole("textbox", { name: /^Mileage/ }).fill("181,250");
  await addDialog.getByRole("textbox", { name: /^Cost/ }).fill("79.9");
  await addDialog
    .getByRole("textbox", { name: /^Notes/ })
    .fill("Shop: Main St Auto");
  await addDialog.getByRole("button", { name: "Add record" }).click();

  await expect(addDialog).toHaveCount(0);
  await expect(page.getByText("Maintenance record added")).toBeVisible();

  const entry = maintenance(page).getByRole("listitem");

  await expect(entry).toHaveCount(1);
  await expect(entry).not.toHaveAttribute("aria-busy");
  await expect(entry).toContainText("Oil change");
  await expect(entry).toContainText("Mar 14");
  await expect(entry).toContainText("181,250 mi");
  await expect(entry).toContainText("$79.90");

  await page.reload();

  await expect(page.getByRole("region", { name: "2025" })).toBeVisible();
  await expect(entry).toContainText("Synthetic 5W-30 and filter");
  await expect(entry.getByText("Shop: Main St Auto")).toBeHidden();
  await entry.getByRole("button", { name: "More" }).click();
  await expect(entry.getByText("Shop: Main St Auto")).toBeVisible();
  expect(await findMaintenanceRecords(id)).toEqual([
    {
      type: "oil_change",
      description: "Synthetic 5W-30 and filter",
      performed_at: "2025-03-14",
      mileage: 181250,
      cost: "79.90",
      notes: "Shop: Main St Auto",
    },
  ]);

  await entry
    .getByRole("button", { name: "Edit Oil change from Mar 14, 2025" })
    .click();

  const editDialog = page.getByRole("dialog", {
    name: "Edit maintenance record",
  });

  await expect(editDialog.getByRole("textbox", { name: /^Cost/ })).toHaveValue(
    "79.90",
  );
  await editDialog.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "Repair" }).click();
  await editDialog
    .getByRole("textbox", { name: /^Description/ })
    .fill("Replaced washer reservoir");
  await editDialog.getByRole("textbox", { name: /^Cost/ }).fill("1234.56");
  await editDialog.getByRole("button", { name: "Save" }).click();

  await expect(editDialog).toHaveCount(0);
  await expect(page.getByText("Maintenance record updated")).toBeVisible();
  await expect(entry).toContainText("Replaced washer reservoir");
  await expect(entry).toContainText("$1,234.56");
  await expect(
    entry.getByRole("button", { name: "Edit Repair from Mar 14, 2025" }),
  ).toBeFocused();

  await page.reload();
  await expect(entry).toContainText("Repair");
  await expect(entry).toContainText("Replaced washer reservoir");

  await entry
    .getByRole("button", { name: "Delete Repair from Mar 14, 2025" })
    .click();
  await page
    .getByRole("alertdialog", { name: "Delete this record?" })
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(page.getByText("Maintenance record deleted")).toBeVisible();
  await expect(page.getByText("No maintenance logged yet")).toBeVisible();
  expect(await findMaintenanceRecords(id)).toEqual([]);

  await page.reload();
  await expect(page.getByText("No maintenance logged yet")).toBeVisible();
});

test("groups records by year, newest first", async ({ page }) => {
  const id = await insertVehicle(accord);

  await insertMaintenanceRecord(id, {
    type: "inspection",
    description: "State inspection",
    performed_at: "2025-03-14",
  });
  await insertMaintenanceRecord(id, {
    type: "brakes",
    description: "Front pads and rotors",
    performed_at: "2026-01-18",
    cost: "412.50",
  });
  await insertMaintenanceRecord(id, {
    type: "tire_rotation",
    description: "Rotated tires",
    performed_at: "2025-09-21",
    mileage: 171400,
  });

  await page.goto(`/vehicles/${id}`);

  await expect(
    page.getByRole("main").getByRole("heading", { level: 3 }),
  ).toHaveText(["2026", "2025"]);
  await expect(maintenance(page).getByRole("listitem")).toHaveText([
    /Front pads and rotors/,
    /Rotated tires/,
    /State inspection/,
  ]);
});

test("cannot read or change another user's maintenance records", async ({
  page,
  request,
}) => {
  const otherId = await insertOtherUsersVehicle({
    year: 1967,
    make: "Chevrolet",
    model: "Impala",
  });
  const recordId = await insertMaintenanceRecord(otherId, {
    type: "repair",
    description: "Someone else's rebuild",
    performed_at: "2025-05-01",
    cost: "999.00",
  });
  const before = await findMaintenanceRecords(otherId);
  const api = `http://localhost:${E2E_BACKEND_PORT}/api/vehicles/${otherId}/maintenance`;
  const record = {
    type: "other",
    description: "Crafted",
    performed_at: "2025-06-01",
  };

  const responses = await Promise.all([
    request.get(api),
    request.post(api, { data: record }),
    request.get(`${api}/${recordId}`),
    request.put(`${api}/${recordId}`, { data: record }),
    request.delete(`${api}/${recordId}`),
  ]);

  expect(responses.map((response) => response.status())).toEqual([
    404, 404, 404, 404, 404,
  ]);
  for (const response of responses) {
    expect(await response.text()).not.toContain("Someone else's rebuild");
  }
  expect(await findMaintenanceRecords(otherId)).toEqual(before);

  const response = await page.goto(`/vehicles/${otherId}`);

  await expect(page.getByText("Vehicle not found")).toBeVisible();
  expect(await response!.text()).not.toContain("Someone else's rebuild");
});
