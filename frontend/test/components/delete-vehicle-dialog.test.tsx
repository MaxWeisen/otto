import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { DeleteVehicleDialog } from "@/components/delete-vehicle-dialog";
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

describe("DeleteVehicleDialog", () => {
  it("names the vehicle and warns that its records go too", () => {
    render(
      <DeleteVehicleDialog
        vehicle={accord}
        open
        onOpenChange={vi.fn()}
        action={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Delete 2003 Honda Accord?",
    });
    expect(dialog).toHaveAccessibleDescription(
      "This permanently deletes the vehicle and all of its maintenance records. It cannot be undone.",
    );
  });

  it("shows a failed delete in the dialog and as a toast", async () => {
    const user = userEvent.setup();
    render(
      <DeleteVehicleDialog
        vehicle={accord}
        open
        onOpenChange={vi.fn()}
        action={vi.fn(async () => ({ message: "Unable to delete vehicle" }))}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete vehicle" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to delete vehicle",
    );
    expect(toast.error).toHaveBeenCalledWith("Unable to delete vehicle");
  });

  it("explains a delete that could not reach the server", async () => {
    const user = userEvent.setup();
    render(
      <DeleteVehicleDialog
        vehicle={accord}
        open
        onOpenChange={vi.fn()}
        action={vi.fn(async () => {
          throw new TypeError("Failed to fetch");
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete vehicle" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server. Please try again.",
    );
  });

  it("forgets a failed delete when it is opened again", async () => {
    const user = userEvent.setup();
    const props = {
      vehicle: accord,
      onOpenChange: vi.fn(),
      action: vi.fn(async () => ({ message: "Unable to delete vehicle" })),
    };
    const { rerender } = render(
      <DeleteVehicleDialog
        open
        {...props}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete vehicle" }));
    await screen.findByRole("alert");
    rerender(
      <DeleteVehicleDialog
        open={false}
        {...props}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    rerender(
      <DeleteVehicleDialog
        open
        {...props}
      />,
    );

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
