import { describe, expect, it } from "vitest";
import { filterOptions } from "@/lib/option-search";
import { VEHICLE_MAKES } from "@/lib/vehicle-makes";

describe("filterOptions", () => {
  it("returns every option for a blank query", () => {
    expect(filterOptions(VEHICLE_MAKES, "  ")).toBe(VEHICLE_MAKES);
  });

  it("ranks names starting with the query before later-word matches", () => {
    expect(filterOptions(VEHICLE_MAKES, "m")).toEqual([
      "Maserati",
      "Mazda",
      "McLaren",
      "Mercedes-Benz",
      "Mercury",
      "Mini",
      "Mitsubishi",
      "Aston Martin",
    ]);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(filterOptions(VEHICLE_MAKES, "  TOYO ")).toEqual(["Toyota"]);
  });

  it("matches words split by spaces or hyphens", () => {
    expect(filterOptions(VEHICLE_MAKES, "benz")).toEqual(["Mercedes-Benz"]);
    expect(filterOptions(VEHICLE_MAKES, "rover")).toEqual(["Land Rover"]);
  });

  it("does not match in the middle of a word", () => {
    expect(filterOptions(VEHICLE_MAKES, "yota")).toEqual([]);
  });

  it("matches multi-word queries from the start of the name", () => {
    expect(
      filterOptions(["Land Cruiser", "Prius Prime (PHEV)"], "prius p"),
    ).toEqual(["Prius Prime (PHEV)"]);
  });
});
