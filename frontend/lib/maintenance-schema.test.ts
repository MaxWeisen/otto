import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  maintenanceApiErrors,
  readMaintenanceFormValues,
  today,
  validateMaintenanceForm,
  type MaintenanceFormValues,
} from "@/lib/maintenance-schema";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 15, 12));
});

afterAll(() => {
  vi.useRealTimers();
});

const valid: MaintenanceFormValues = {
  type: "oil_change",
  performed_at: "2026-06-01",
  description: " Synthetic 5W-30 and filter ",
  mileage: "84,500",
  cost: "$1,049.9",
  notes: "  ",
};

function errorsFor(values: Partial<MaintenanceFormValues>) {
  const result = validateMaintenanceForm({ ...valid, ...values });

  return result.success ? {} : result.errors;
}

describe("validateMaintenanceForm", () => {
  it("normalizes a valid record for the API", () => {
    expect(validateMaintenanceForm(valid)).toEqual({
      success: true,
      data: {
        type: "oil_change",
        performed_at: "2026-06-01",
        description: "Synthetic 5W-30 and filter",
        mileage: 84500,
        cost: "1049.9",
        notes: null,
      },
    });
  });

  it("leaves optional fields empty", () => {
    const result = validateMaintenanceForm({
      ...valid,
      mileage: "",
      cost: "",
      notes: "Shop: Main St",
    });

    expect(result.success && result.data).toMatchObject({
      mileage: null,
      cost: null,
      notes: "Shop: Main St",
    });
  });

  it.each([
    [{ type: "" }, "type", "Type is required"],
    [{ type: "detailing" }, "type", "Choose a type from the list"],
    [{ description: "  " }, "description", "Description is required"],
    [
      { description: "x".repeat(256) },
      "description",
      "Description must be at most 255 characters",
    ],
    [{ performed_at: "" }, "performed_at", "Date is required"],
    [
      { performed_at: "2026-02-30" },
      "performed_at",
      "Date must be a valid date",
    ],
    [
      { performed_at: "06/01/2026" },
      "performed_at",
      "Date must be a valid date",
    ],
    [
      { performed_at: "1885-12-31" },
      "performed_at",
      "Date must not be before 1886",
    ],
    [
      { performed_at: "2026-06-16" },
      "performed_at",
      "Date must not be in the future",
    ],
    [
      { mileage: "12.5" },
      "mileage",
      "Mileage must be a whole number of 0 or more",
    ],
    [{ cost: "-5" }, "cost", "Cost must not be negative"],
    [{ cost: "49.999" }, "cost", "Cost must be an amount like 49.99"],
    [{ cost: "abc" }, "cost", "Cost must be an amount like 49.99"],
    [{ cost: "123456789" }, "cost", "Cost is too large"],
    [
      { notes: "x".repeat(10001) },
      "notes",
      "Notes must be at most 10,000 characters",
    ],
  ] as const)("rejects %j", (values, field, message) => {
    expect(errorsFor(values)[field]).toEqual([message]);
  });

  it("accepts today, the largest cost and leading zeros", () => {
    expect(errorsFor({ performed_at: today(), cost: "0099999999.99" })).toEqual(
      {},
    );
  });
});

describe("today", () => {
  it("is the local date", () => {
    expect(today()).toBe("2026-06-15");
  });
});

describe("maintenanceApiErrors", () => {
  it("maps a message that names a field to that field", () => {
    expect(maintenanceApiErrors("cost must not be negative")).toEqual({
      errors: { cost: ["Cost must not be negative"] },
    });
    expect(
      maintenanceApiErrors("performed_at must not be in the future"),
    ).toEqual({
      errors: { performed_at: ["Date must not be in the future"] },
    });
  });

  it("keeps other messages for the whole form", () => {
    expect(maintenanceApiErrors("Something went wrong.")).toEqual({
      message: "Something went wrong.",
    });
  });
});

describe("readMaintenanceFormValues", () => {
  it("reads every field, defaulting missing ones to empty", () => {
    const formData = new FormData();
    formData.set("type", "brakes");
    formData.set("description", "Pads");

    expect(readMaintenanceFormValues(formData)).toEqual({
      type: "brakes",
      performed_at: "",
      description: "Pads",
      mileage: "",
      cost: "",
      notes: "",
    });
  });
});
