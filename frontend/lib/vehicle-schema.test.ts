import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  maxVehicleYear,
  readVehicleFormValues,
  validateVehicleFields,
  validateVehicleForm,
  vinError,
  type VehicleFormValues,
} from "@/lib/vehicle-schema";

// Pin the clock so the latest accepted model year (next year) is stable.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});

afterAll(() => {
  vi.useRealTimers();
});

const validValues: VehicleFormValues = {
  year: "2019",
  make: "Honda",
  model: "Civic",
  trim: "",
  nickname: "",
  mileage: "",
  vin: "",
};

function values(overrides: Partial<VehicleFormValues>): VehicleFormValues {
  return { ...validValues, ...overrides };
}

const long = "a".repeat(256);
const maxMultibyte = "é".repeat(255);
const vinCharsetError =
  "VIN can only use letters and digits, excluding I, O and Q";

describe("validateVehicleForm", () => {
  it("normalizes a valid vehicle into the API payload", () => {
    const result = validateVehicleForm({
      year: " 2019 ",
      make: "  Honda ",
      model: " Civic  ",
      trim: "  ",
      nickname: " Daily driver ",
      mileage: " 84,500 ",
      vin: " 1hgcm82633a004352 ",
    });

    expect(result).toEqual({
      success: true,
      data: {
        year: 2019,
        make: "Honda",
        model: "Civic",
        trim: null,
        nickname: "Daily driver",
        mileage: 84500,
        vin: "1HGCM82633A004352",
      },
    });
  });

  it("turns blank optional fields into null", () => {
    const result = validateVehicleForm(validValues);

    expect(result.success && result.data).toMatchObject({
      trim: null,
      nickname: null,
      mileage: null,
      vin: null,
    });
  });

  it.each([
    ["the earliest year", { year: "1886" }],
    ["next year", { year: "2027" }],
    ["zero mileage", { mileage: "0" }],
    ["the largest mileage", { mileage: "2147483647" }],
    ["255 multibyte characters", { make: maxMultibyte }],
    ["a VIN with every allowed letter", { vin: "ABCDEFGHJKLMNPRST" }],
  ])("accepts %s", (_name, overrides: Partial<VehicleFormValues>) => {
    expect(validateVehicleForm(values(overrides)).success).toBe(true);
  });

  it.each<[string, Partial<VehicleFormValues>, string, string]>([
    ["a blank year", { year: "  " }, "year", "Year is required"],
    ["a non-numeric year", { year: "20x9" }, "year", "Year must be a number"],
    [
      "a year before 1886",
      { year: "1885" },
      "year",
      "Year must be between 1886 and 2027",
    ],
    [
      "a year after next year",
      { year: "2028" },
      "year",
      "Year must be between 1886 and 2027",
    ],
    ["a blank make", { make: "   " }, "make", "Make is required"],
    [
      "a long make",
      { make: long },
      "make",
      "Make must be at most 255 characters",
    ],
    [
      "a null in the make",
      { make: "Hon\0da" },
      "make",
      "Make must not contain null characters",
    ],
    ["a blank model", { model: "" }, "model", "Model is required"],
    [
      "a long model",
      { model: long },
      "model",
      "Model must be at most 255 characters",
    ],
    [
      "a long trim",
      { trim: long },
      "trim",
      "Trim must be at most 255 characters",
    ],
    [
      "a long nickname",
      { nickname: long },
      "nickname",
      "Nickname must be at most 255 characters",
    ],
    [
      "negative mileage",
      { mileage: "-1" },
      "mileage",
      "Mileage must be a whole number of 0 or more",
    ],
    [
      "fractional mileage",
      { mileage: "10.5" },
      "mileage",
      "Mileage must be a whole number of 0 or more",
    ],
    [
      "mileage beyond the database limit",
      { mileage: "2147483648" },
      "mileage",
      "Mileage is too large",
    ],
    [
      "a short VIN",
      { vin: "1HGCM8263" },
      "vin",
      "VIN must be 17 characters (currently 9)",
    ],
    [
      "a long VIN",
      { vin: "1HGCM82633A0043521" },
      "vin",
      "VIN must be 17 characters (currently 18)",
    ],
    ["a VIN with I", { vin: "1HGCM82633I004352" }, "vin", vinCharsetError],
    ["a VIN with O", { vin: "1HGCM82633O004352" }, "vin", vinCharsetError],
    ["a VIN with Q", { vin: "1HGCM82633Q004352" }, "vin", vinCharsetError],
    [
      "a VIN with a symbol",
      { vin: "1HGCM82633-004352" },
      "vin",
      vinCharsetError,
    ],
  ])("rejects %s", (_name, overrides, field, message) => {
    const result = validateVehicleForm(values(overrides));

    expect(result.success).toBe(false);
    expect(!result.success && result.errors).toEqual({ [field]: [message] });
  });
});

describe("validateVehicleFields", () => {
  it("only checks the given fields", () => {
    const allInvalid = values({ year: "", make: "", model: "", vin: "X" });

    expect(validateVehicleFields(allInvalid, ["vin"])).toEqual({
      vin: ["VIN must be 17 characters (currently 1)"],
    });
    expect(validateVehicleFields(validValues, ["year", "make"])).toBeNull();
  });
});

describe("vinError", () => {
  it("allows a blank VIN and explains an invalid one", () => {
    expect(vinError("")).toBeUndefined();
    expect(vinError("1hgcm82633a004352")).toBeUndefined();
    expect(vinError("1HGCM82633O004352")).toBe(vinCharsetError);
  });
});

describe("maxVehicleYear", () => {
  it("is next year", () => {
    expect(maxVehicleYear()).toBe(2027);
  });
});

describe("readVehicleFormValues", () => {
  it("reads every field as a string, defaulting missing ones to blank", () => {
    const formData = new FormData();
    formData.set("make", "Honda");
    formData.set("vin", new File(["x"], "vin.txt"));

    expect(readVehicleFormValues(formData)).toEqual({
      year: "",
      make: "Honda",
      model: "",
      trim: "",
      nickname: "",
      mileage: "",
      vin: "",
    });
  });
});
