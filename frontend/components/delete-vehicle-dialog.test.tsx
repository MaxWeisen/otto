import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import type { DeleteVehicleState } from "@/app/(authenticated)/vehicles/actions";
import { DeleteVehicleDialog } from "@/components/delete-vehicle-dialog";
import type { Vehicle } from "@/lib/vehicles";

const accord: Vehicle = {
  id: 7,
  year: 2003,
  make: "Honda",
  model: "Accord",
  trim: "EX-V6",
  vin: "1HGCM82633A004352",
  nickname: "Commuter",
  mileage: 182000,
};

type DeleteAction = () => Promise<DeleteVehicleState>;

function renderDialog(action: DeleteAction = vi.fn(async () => ({}))) {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  const view = render(
    <DeleteVehicleDialog
      vehicle={accord}
      open
      onOpenChange={onOpenChange}
      action={action}
    />,
  );

  function setOpen(open: boolean) {
    view.rerender(
      <DeleteVehicleDialog
        vehicle={accord}
        open={open}
        onOpenChange={onOpenChange}
        action={action}
      />,
    );
  }

  return { user, action, onOpenChange, setOpen };
}

/** Resolves the delete with the given result once finish is called. */
function pendingDelete() {
  let finish: (state: DeleteVehicleState) => void = () => {};
  const action = vi.fn(
    () =>
      new Promise<DeleteVehicleState>((resolve) => {
        finish = resolve;
      }),
  );

  return { action, finish: (state: DeleteVehicleState) => finish(state) };
}

const dialog = () => screen.queryByRole("alertdialog");
const cancelButton = () => screen.getByRole("button", { name: "Cancel" });
const confirmButton = () =>
  screen.getByRole("button", { name: "Delete vehicle" });
const inlineError = (message: string) =>
  screen.queryByText(message, { selector: "[role=alert] *" });

describe("DeleteVehicleDialog", () => {
  it("names the vehicle and what is lost, focusing Cancel", async () => {
    const { action } = renderDialog();

    expect(dialog()).toHaveAccessibleName("Delete 2003 Honda Accord?");
    expect(dialog()).toHaveAccessibleDescription(
      "This permanently deletes the vehicle and all of its maintenance records. It cannot be undone.",
    );
    await waitFor(() => expect(cancelButton()).toHaveFocus());
    expect(action).not.toHaveBeenCalled();
  });

  it("asks to close on Cancel without deleting", async () => {
    const { user, action, onOpenChange } = renderDialog();

    await user.click(cancelButton());

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(action).not.toHaveBeenCalled();
  });

  it("deletes on confirm and cannot be dismissed meanwhile", async () => {
    const { action, finish } = pendingDelete();
    const { user, onOpenChange } = renderDialog(action);

    await user.click(confirmButton());

    expect(action).toHaveBeenCalledTimes(1);
    expect(confirmButton()).toBeDisabled();
    expect(cancelButton()).toBeDisabled();

    await user.keyboard("{Escape}");

    expect(onOpenChange).not.toHaveBeenCalled();

    finish({});

    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows a failed delete in the dialog and as a toast, and lets it be retried", async () => {
    const { action, finish } = pendingDelete();
    const { user } = renderDialog(action);

    await user.click(confirmButton());
    finish({ message: "Unable to delete vehicle" });

    expect(
      await screen.findByText("Unable to delete vehicle", {
        selector: "[role=alert] *",
      }),
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Unable to delete vehicle",
    );
    expect(confirmButton()).toBeEnabled();
    expect(confirmButton()).toHaveFocus();

    await user.click(confirmButton());

    expect(action).toHaveBeenCalledTimes(2);
    expect(inlineError("Unable to delete vehicle")).not.toBeInTheDocument();

    finish({ message: "Unable to delete vehicle" });

    await waitFor(() => expect(confirmButton()).toBeEnabled());
  });

  it("forgets a failed delete once the dialog has closed", async () => {
    const { user, setOpen } = renderDialog(
      vi.fn(async () => ({ message: "Unable to delete vehicle" })),
    );

    await user.click(confirmButton());
    await screen.findByText("Unable to delete vehicle", {
      selector: "[role=alert] *",
    });

    setOpen(false);
    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
    setOpen(true);

    expect(dialog()).toBeInTheDocument();
    expect(inlineError("Unable to delete vehicle")).not.toBeInTheDocument();
  });
});
