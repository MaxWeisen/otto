import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { MaintenanceRecordForm } from "@/components/maintenance-record-form";
import type { MaintenanceRecord } from "@/lib/maintenance";

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

describe("MaintenanceRecordForm", () => {
  it("starts an edit from the record's values", () => {
    render(
      <MaintenanceRecordForm
        record={brakes}
        action={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue(
      "brakes",
    );
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(
      "Front pads and rotors",
    );
    expect(screen.getByRole("textbox", { name: /^Mileage/ })).toHaveValue(
      "176,300",
    );
  });

  it("stays open and shows the server's errors under their fields", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MaintenanceRecordForm
        defaultMileage={182000}
        action={async () => ({
          values: { description: "", mileage: "182,000" },
          errors: { description: "Description is required" },
        })}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add record" }));

    expect(
      await screen.findByRole("textbox", { name: "Description" }),
    ).toHaveAccessibleDescription("Description is required");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the chosen type after another field is rejected", async () => {
    const user = userEvent.setup();
    render(
      <MaintenanceRecordForm
        action={async (_state, formData) => ({
          values: Object.fromEntries(formData) as Record<string, string>,
          errors: { description: "Description is required" },
        })}
        onClose={vi.fn()}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Type" }),
      "Brakes",
    );
    await user.click(screen.getByRole("button", { name: "Add record" }));

    expect(
      await screen.findByText("Description is required"),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue(
      "brakes",
    );
  });

  it("closes with a toast once saved", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MaintenanceRecordForm
        record={brakes}
        action={async () => ({ saved: true })}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(toast.success).toHaveBeenCalledWith("Maintenance record updated");
  });
});
