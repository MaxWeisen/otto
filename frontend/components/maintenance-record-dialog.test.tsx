import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MaintenanceRecordDialog } from "@/components/maintenance-record-dialog";

const blank = {
  type: "",
  performed_at: "2026-06-15",
  description: "",
  mileage: "84,500",
  cost: "",
  notes: "",
};

describe("MaintenanceRecordDialog", () => {
  it("shows inline errors and focuses the first invalid field", async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(
      <MaintenanceRecordDialog
        open
        onOpenChange={vi.fn()}
        title="Add maintenance record"
        description="Log service done on this vehicle."
        submitLabel="Add record"
        state={{ values: blank }}
        action={action}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add record" }));

    expect(screen.getByText("Type is required")).toBeInTheDocument();
    expect(screen.getByText("Description is required")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveFocus();
    expect(action).not.toHaveBeenCalled();
  });

  it("clears a field's error once it is edited", async () => {
    const user = userEvent.setup();
    render(
      <MaintenanceRecordDialog
        open
        onOpenChange={vi.fn()}
        title="Add maintenance record"
        description="Log service done on this vehicle."
        submitLabel="Add record"
        state={{ values: blank }}
        action={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add record" }));
    await user.type(
      screen.getByRole("textbox", { name: /^Description/ }),
      "Pads",
    );

    expect(
      screen.queryByText("Description is required"),
    ).not.toBeInTheDocument();
  });

  it("submits a valid record", async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(
      <MaintenanceRecordDialog
        open
        onOpenChange={vi.fn()}
        title="Add maintenance record"
        description="Log service done on this vehicle."
        submitLabel="Add record"
        state={{ values: blank }}
        action={action}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(await screen.findByRole("option", { name: "Oil change" }));
    await user.type(
      screen.getByRole("textbox", { name: /^Description/ }),
      "Synthetic 5W-30",
    );
    await user.click(screen.getByRole("button", { name: "Add record" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(Object.fromEntries(action.mock.calls[0][0])).toEqual({
      ...blank,
      type: "oil_change",
      description: "Synthetic 5W-30",
    });
  });

  it("shows the errors and message of a new state", () => {
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      title: "Edit maintenance record",
      description: "Update this record.",
      submitLabel: "Save",
      action: vi.fn(),
    };
    const { rerender } = render(
      <MaintenanceRecordDialog
        {...props}
        state={{ values: blank }}
      />,
    );

    rerender(
      <MaintenanceRecordDialog
        {...props}
        state={{
          values: { ...blank, type: "brakes", description: "Pads" },
          errors: { performed_at: ["Date must not be in the future"] },
          message: "Could not save the record.",
        }}
      />,
    );

    expect(
      screen.getByText("Date must not be in the future"),
    ).toBeInTheDocument();
    expect(screen.getByText("Could not save the record.")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveFocus();
  });

  it("shows a saving state while pending", () => {
    render(
      <MaintenanceRecordDialog
        open
        onOpenChange={vi.fn()}
        title="Edit maintenance record"
        description="Update this record."
        submitLabel="Save"
        state={{ values: blank }}
        action={vi.fn()}
        pending
      />,
    );

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  });
});
