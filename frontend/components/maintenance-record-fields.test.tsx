import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MaintenanceRecordFields } from "@/components/maintenance-record-fields";

const values = {
  type: "brakes",
  performed_at: "2026-01-18",
  description: "Front pads",
  mileage: "176,300",
  cost: "",
  notes: "",
};

describe("MaintenanceRecordFields", () => {
  it("shows the values and marks fields with errors", () => {
    render(
      <MaintenanceRecordFields
        values={values}
        errors={{ cost: ["Cost must not be negative"] }}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent(
      "Brakes",
    );
    expect(screen.getByRole("textbox", { name: /^Mileage/ })).toHaveValue(
      "176,300",
    );
    expect(
      screen.getByRole("textbox", { name: /^Cost/ }),
    ).toHaveAccessibleDescription("Cost must not be negative");
  });

  it("clears a field's error once it is edited", async () => {
    const user = userEvent.setup();
    render(
      <MaintenanceRecordFields
        values={values}
        errors={{ cost: ["Cost must not be negative"] }}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /^Cost/ }), "5");

    expect(
      screen.queryByText("Cost must not be negative"),
    ).not.toBeInTheDocument();
  });
});
