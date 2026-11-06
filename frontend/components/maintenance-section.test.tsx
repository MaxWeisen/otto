import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import type {
  DeleteMaintenanceResult,
  MaintenanceFormState,
} from "@/app/(authenticated)/vehicles/[id]/actions";
import { MaintenanceSection } from "@/components/maintenance-section";
import type { MaintenanceRecord } from "@/lib/maintenance";
import type { Vehicle } from "@/lib/vehicles";

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
  cost: "412.50",
  notes: null,
  created_at: "2026-01-18T17:00:00Z",
};

describe("MaintenanceSection", () => {
  it("opens the add dialog from the empty state with the vehicle's mileage", async () => {
    const user = userEvent.setup();
    render(
      <MaintenanceSection
        vehicle={accord}
        records={[]}
        createAction={vi.fn()}
        updateAction={vi.fn()}
        deleteAction={vi.fn()}
      />,
    );

    expect(screen.getByText("No maintenance logged yet")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Add your first record" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Add maintenance record",
    });
    expect(
      within(dialog).getByRole("textbox", { name: /^Mileage/ }),
    ).toHaveValue("182,000");
  });

  it("shows a new record as saving, then removes it when saving fails", async () => {
    const user = userEvent.setup();
    const saving = Promise.withResolvers<MaintenanceFormState>();
    render(
      <MaintenanceSection
        vehicle={accord}
        records={[brakes]}
        createAction={() => saving.promise}
        updateAction={vi.fn()}
        deleteAction={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add record" }));
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(await screen.findByRole("option", { name: "Oil change" }));
    await user.type(
      screen.getByRole("textbox", { name: /^Description/ }),
      "Synthetic 5W-30",
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Add record",
      }),
    );

    const entry = (await screen.findByText("Synthetic 5W-30")).closest("li");
    expect(entry).toHaveTextContent("Saving...");

    saving.resolve({
      values: {
        type: "oil_change",
        performed_at: "2026-01-20",
        description: "Synthetic 5W-30",
        mileage: "",
        cost: "",
        notes: "",
      },
      message: "Could not reach the server. Please try again.",
    });

    await waitFor(() =>
      expect(screen.queryByText("Synthetic 5W-30")).not.toBeInTheDocument(),
    );
    expect(toast.error).toHaveBeenCalledWith(
      "Could not add the record",
      expect.objectContaining({
        description: "Could not reach the server. Please try again.",
      }),
    );
  });

  it("hides a record while it is deleted, then restores it when deleting fails", async () => {
    const user = userEvent.setup();
    const deleting = Promise.withResolvers<DeleteMaintenanceResult>();
    render(
      <MaintenanceSection
        vehicle={accord}
        records={[brakes]}
        createAction={vi.fn()}
        updateAction={vi.fn()}
        deleteAction={() => deleting.promise}
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
      expect(
        screen.queryByText("Front pads and rotors"),
      ).not.toBeInTheDocument(),
    );

    deleting.resolve({ ok: false, error: "Something went wrong." });

    expect(
      await screen.findByText("Front pads and rotors"),
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Could not delete the record", {
      description: "Something went wrong.",
    });
  });

  it("opens the edit dialog filled with the record", async () => {
    const user = userEvent.setup();
    render(
      <MaintenanceSection
        vehicle={accord}
        records={[brakes]}
        createAction={vi.fn()}
        updateAction={vi.fn()}
        deleteAction={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Edit Brakes from Jan 18, 2026" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Edit maintenance record",
    });
    expect(
      within(dialog).getByRole("textbox", { name: /^Description/ }),
    ).toHaveValue("Front pads and rotors");
    expect(within(dialog).getByRole("textbox", { name: /^Cost/ })).toHaveValue(
      "412.50",
    );
  });

  it("keeps the edit dialog open with the error when saving fails", async () => {
    const user = userEvent.setup();
    const updateAction = vi.fn(async () => ({
      values: {
        type: "brakes",
        performed_at: "2026-01-18",
        description: "Front pads and rotors",
        mileage: "176,300",
        cost: "412.50",
        notes: "",
      },
      message: "This maintenance record no longer exists.",
    }));
    render(
      <MaintenanceSection
        vehicle={accord}
        records={[brakes]}
        createAction={vi.fn()}
        updateAction={updateAction}
        deleteAction={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Edit Brakes from Jan 18, 2026" }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("This maintenance record no longer exists."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
