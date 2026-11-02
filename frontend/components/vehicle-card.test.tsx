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

  it("lists the make and leaves the model to the title", () => {
    render(
      <VehicleCard
        vehicle={{
          id: 1,
          year: 2003,
          make: "Honda",
          model: "Accord",
          trim: null,
          vin: null,
          nickname: null,
          mileage: null,
        }}
      />,
    );

    expect(screen.getByText("2003 Honda Accord")).toBeInTheDocument();
    expect(
      screen.getByText("Make", { selector: "dt" }).nextElementSibling,
    ).toHaveTextContent("Honda");
    expect(screen.queryByText("Model")).not.toBeInTheDocument();
  });

  it("links to the vehicle's detail page", () => {
    render(
      <VehicleCard
        vehicle={{
          id: 42,
          year: 2019,
          make: "Ford",
          model: "F-150",
          trim: null,
          vin: null,
          nickname: null,
          mileage: null,
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Details for 2019 Ford F-150" }),
    ).toHaveAttribute("href", "/vehicles/42");
  });
});
