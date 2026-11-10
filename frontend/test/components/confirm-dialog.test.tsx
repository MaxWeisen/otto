import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/confirm-dialog";

describe("ConfirmDialog", () => {
  it("shows the title and description", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete this record?"
        description="Brakes from Jan 18, 2026 will be permanently deleted."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Delete this record?",
    });
    expect(dialog).toHaveAccessibleDescription(
      "Brakes from Jan 18, 2026 will be permanently deleted.",
    );
  });

  it("calls onConfirm when confirmed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete this record?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("asks to close when cancelled", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete this record?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables both buttons while pending", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete this record?"
        description="This cannot be undone."
        confirmLabel="Delete"
        pending
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
