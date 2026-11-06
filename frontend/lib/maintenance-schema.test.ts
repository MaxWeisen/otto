import { describe, expect, it, vi } from "vitest";
import {
  maintenanceApiErrors,
  today,
  validateMaintenanceForm,
  type MaintenanceFormValues,
} from "@/lib/maintenance-schema";

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

  it("accepts today", () => {
    expect(errorsFor({ performed_at: today() })).toEqual({});
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
      { performed_at: "1885-12-31" },
      "performed_at",
      "Date must not be before 1886",
    ],
    [
      { performed_at: "2999-01-01" },
      "performed_at",
      "Date must not be in the future",
    ],
    [{ cost: "-5" }, "cost", "Cost must not be negative"],
    [{ cost: "49.999" }, "cost", "Cost must be an amount like 49.99"],
    [{ cost: "123456789" }, "cost", "Cost is too large"],
  ] as const)("rejects %j", (values, field, message) => {
    expect(errorsFor(values)[field]).toEqual([message]);
  });

  it("accepts the latest date that has started anywhere on Earth", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));

    const tomorrow = errorsFor({ performed_at: "2026-06-16" });
    const dayAfter = errorsFor({ performed_at: "2026-06-17" });

    vi.useRealTimers();
    expect(tomorrow).toEqual({});
    expect(dayAfter).toEqual({
      performed_at: ["Date must not be in the future"],
    });
  });
});

describe("maintenanceApiErrors", () => {
  it("maps a message that names a field to that field", () => {
    expect(maintenanceApiErrors("cost must not be negative")).toEqual({
      errors: { cost: ["Cost must not be negative"] },
    });
  });

  it("keeps other messages for the whole form", () => {
    expect(maintenanceApiErrors("Something went wrong.")).toEqual({
      message: "Something went wrong.",
    });
  });
});
