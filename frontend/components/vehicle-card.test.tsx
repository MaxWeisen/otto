import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VehicleCard } from "./vehicle-card";

describe("VehicleCard", () => {
  it("wraps the VIN instead of truncating it", () => {
    render(
      <VehicleCard
        vehicle={{
          id: 1,
          year: 2003,
          make: "Honda",
          model: "Accord",
          trim: "EX-V6 Special Edition Coupe",
          vin: "1HGCM82633A004352",
          nickname: null,
          mileage: null,
        }}
      />,
    );

    const vin = screen.getByText("1HGCM82633A004352");

    expect(vin).toHaveClass("break-all");
    expect(vin).not.toHaveClass("truncate");
    expect(screen.getByText("EX-V6 Special Edition Coupe")).toHaveClass(
      "truncate",
    );
  });
});
