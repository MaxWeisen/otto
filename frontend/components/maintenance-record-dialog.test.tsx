import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import type { MaintenanceFormState } from "@/app/(authenticated)/vehicles/[id]/actions";
import { MaintenanceRecordDialog } from "@/components/maintenance-record-dialog";
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

const brakesValues = {
  type: "brakes",
  performed_at: "2026-01-18",
  description: "Front pads and rotors",
  mileage: "176,300",
  cost: "412.50",
  notes: "",
};

describe("MaintenanceRecordDialog", () => {
  it("shows inline errors and focuses the first invalid field", async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(
      <MaintenanceRecordDialog
        action={action}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add record" }));

    expect(screen.getByText("Type is required")).toBeInTheDocument();
    expect(screen.getByText("Description is required")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveFocus();
    expect(action).not.toHaveBeenCalled();
  });

  it("adds a valid record and confirms it", async () => {
    const user = userEvent.setup();
    const action = vi.fn<
      (
        state: MaintenanceFormState,
        formData: FormData,
      ) => Promise<MaintenanceFormState>
    >(async () => ({ values: brakesValues, saved: true }));
    render(
      <MaintenanceRecordDialog
        defaultMileage={182000}
        action={action}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(await screen.findByRole("option", { name: "Oil change" }));
    await user.type(
      screen.getByRole("textbox", { name: /^Description/ }),
      "Synthetic 5W-30",
    );
    await user.click(screen.getByRole("button", { name: "Add record" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Maintenance record added"),
    );
    expect(Object.fromEntries(action.mock.calls[0][1])).toMatchObject({
      type: "oil_change",
      description: "Synthetic 5W-30",
      mileage: "182,000",
    });
  });

  it("offers to try again when a new record could not be added", async () => {
    const user = userEvent.setup();
    render(
      <MaintenanceRecordDialog
        action={async () => ({
          values: brakesValues,
          message: "Could not reach the server. Please try again.",
        })}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(await screen.findByRole("option", { name: "Brakes" }));
    await user.type(
      screen.getByRole("textbox", { name: /^Description/ }),
      "Front pads",
    );
    await user.click(screen.getByRole("button", { name: "Add record" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not add the record", {
        description: "Could not reach the server. Please try again.",
        action: { label: "Try again", onClick: expect.any(Function) },
      }),
    );
  });

  it("shows Saving... while an edit is saved", async () => {
    const user = userEvent.setup();
    const saving = Promise.withResolvers<MaintenanceFormState>();
    render(
      <MaintenanceRecordDialog
        record={brakes}
        action={() => saving.promise}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByRole("button", { name: "Saving..." }),
    ).toBeDisabled();

    saving.resolve({ values: brakesValues, saved: true });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Maintenance record updated"),
    );
  });

  it("keeps an edit open with the server's error", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <MaintenanceRecordDialog
        record={brakes}
        action={async () => ({
          values: brakesValues,
          message: "Something went wrong.",
        })}
        open
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Something went wrong."),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows a toast when the edited record is gone", async () => {
    const user = userEvent.setup();
    render(
      <MaintenanceRecordDialog
        record={brakes}
        action={async () => ({
          values: brakesValues,
          message: "This maintenance record no longer exists.",
          gone: true,
        })}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This maintenance record no longer exists.",
      ),
    );
  });

  it("starts a new record from the latest mileage", () => {
    const props = { action: vi.fn(), onOpenChange: vi.fn() };
    const { rerender } = render(
      <MaintenanceRecordDialog
        {...props}
        defaultMileage={182000}
        open={false}
      />,
    );

    rerender(
      <MaintenanceRecordDialog
        {...props}
        defaultMileage={185500}
        open
      />,
    );

    expect(screen.getByRole("textbox", { name: /^Mileage/ })).toHaveValue(
      "185,500",
    );
  });
});
