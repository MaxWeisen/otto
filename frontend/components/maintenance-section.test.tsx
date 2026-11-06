import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import {
  createMaintenanceRecordAction,
  deleteMaintenanceRecordAction,
  type DeleteMaintenanceResult,
  type MaintenanceFormState,
} from "@/app/(authenticated)/vehicles/[id]/actions";
import { MaintenanceSection } from "@/components/maintenance-section";
import type { MaintenanceRecord } from "@/lib/maintenance";
import type { Vehicle } from "@/lib/vehicles";

vi.mock("@/app/(authenticated)/vehicles/[id]/actions", () => ({
  createMaintenanceRecordAction: vi.fn(),
  updateMaintenanceRecordAction: vi.fn(),
  deleteMaintenanceRecordAction: vi.fn(),
}));

const accord: Vehicle = {
  id: 7,
  year: 2003,
  make: "Honda",
  model: "Accord",
  trim: null,
  vin: null,
  nickname: null,
  mileage: 182000,
};

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

describe("MaintenanceSection", () => {
  it("opens the add form from the empty state with the vehicle's mileage", async () => {
    const user = userEvent.setup();
    render(
      <MaintenanceSection
        vehicle={accord}
        records={[]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Add your first record" }),
    );

    expect(screen.getByRole("textbox", { name: /^Mileage/ })).toHaveValue(
      "182,000",
    );
  });

  it("lists records under their year with mileage and cost", () => {
    const inspection = {
      ...brakes,
      id: 30,
      performed_at: "2025-03-14",
      description: "State inspection",
    };
    render(
      <MaintenanceSection
        vehicle={accord}
        records={[brakes, inspection]}
      />,
    );

    const year2026 = screen.getByRole("region", { name: "2026" });
    expect(year2026).toHaveTextContent("Front pads and rotors");
    expect(year2026).toHaveTextContent("176,300 mi");
    expect(year2026).toHaveTextContent("$1,234.50");
    expect(screen.getByRole("region", { name: "2025" })).toHaveTextContent(
      "State inspection",
    );
  });

  it("shows notes behind More", async () => {
    const user = userEvent.setup();
    render(
      <MaintenanceSection
        vehicle={accord}
        records={[brakes]}
      />,
    );

    expect(screen.getByText("Akebono ceramic pads.")).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText("Akebono ceramic pads.")).toBeVisible();
  });

  it("shows a new record as saving, then removes it when the server rejects it", async () => {
    const user = userEvent.setup();
    const saving = Promise.withResolvers<MaintenanceFormState>();
    vi.mocked(createMaintenanceRecordAction).mockReturnValue(saving.promise);
    render(
      <MaintenanceSection
        vehicle={accord}
        records={[]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Add your first record" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      "Synthetic 5W-30",
    );
    await user.click(screen.getByRole("button", { name: "Add record" }));

    const entry = await screen.findByRole("listitem", { hidden: true });
    expect(entry).toHaveTextContent("Synthetic 5W-30");
    expect(entry).toHaveTextContent("Saving...");

    saving.resolve({ errors: { type: "Type is required" } });

    expect(await screen.findByText("Type is required")).toBeInTheDocument();
    expect(
      screen.queryByRole("listitem", { hidden: true }),
    ).not.toBeInTheDocument();
  });

  it("hides a deleted record, then restores it when deleting fails", async () => {
    const user = userEvent.setup();
    const deleting = Promise.withResolvers<DeleteMaintenanceResult>();
    vi.mocked(deleteMaintenanceRecordAction).mockReturnValue(deleting.promise);
    render(
      <MaintenanceSection
        vehicle={accord}
        records={[brakes]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Delete Brakes from Jan 18, 2026" }),
    );
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );

    await waitFor(() =>
      expect(screen.getByText("No maintenance logged yet")).toBeInTheDocument(),
    );

    deleting.resolve({ ok: false, error: "Something went wrong." });

    expect(
      await screen.findByText("Front pads and rotors"),
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Could not delete the record", {
      description: "Something went wrong.",
    });
  });
});
