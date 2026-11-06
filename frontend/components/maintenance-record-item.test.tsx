import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MaintenanceRecordItem } from "@/components/maintenance-record-item";
import type { MaintenanceRecord } from "@/lib/maintenance";

vi.mock("@/app/(authenticated)/vehicles/[id]/actions", () => ({
  updateMaintenanceRecordAction: vi.fn(),
  deleteMaintenanceRecordAction: vi.fn(),
}));

const brakes: MaintenanceRecord = {
  id: 31,
  vehicle_id: 7,
  type: "brakes",
  description: "Front pads and rotors",
  performed_at: "2026-01-18",
  mileage: 176300,
  cost: "1234.5",
  notes: "Akebono ceramic pads.",
  created_at: "2026-01-18T17:00:00Z",
};

describe("MaintenanceRecordItem", () => {
  it("shows the type, date, description, mileage and cost", () => {
    render(<MaintenanceRecordItem record={brakes} />);

    const entry = screen.getByRole("listitem");
    expect(entry).toHaveTextContent("Brakes");
    expect(entry).toHaveTextContent("Jan 18");
    expect(entry).toHaveTextContent("Front pads and rotors");
    expect(entry).toHaveTextContent("176,300 mi");
    expect(entry).toHaveTextContent("$1,234.50");
  });

  it("shows notes behind More and hides them with Less", async () => {
    const user = userEvent.setup();
    render(<MaintenanceRecordItem record={brakes} />);

    expect(screen.getByText("Akebono ceramic pads.")).not.toBeVisible();

    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText("Akebono ceramic pads.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Less" }));
    expect(screen.getByText("Akebono ceramic pads.")).not.toBeVisible();
  });

  it("shows a pending record as saving, without actions", () => {
    render(<MaintenanceRecordItem record={{ ...brakes, pending: true }} />);

    expect(screen.getByRole("listitem")).toHaveTextContent("Saving...");
    expect(
      screen.queryByRole("button", { name: /^Edit/ }),
    ).not.toBeInTheDocument();
  });

  it("opens the edit dialog filled with the record", async () => {
    const user = userEvent.setup();
    render(<MaintenanceRecordItem record={brakes} />);

    await user.click(
      screen.getByRole("button", { name: "Edit Brakes from Jan 18, 2026" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Edit maintenance record",
    });
    expect(
      within(dialog).getByRole("textbox", { name: /^Description/ }),
    ).toHaveValue("Front pads and rotors");
  });
});
