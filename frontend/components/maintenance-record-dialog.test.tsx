import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { MaintenanceFormState } from "@/app/(authenticated)/vehicles/[id]/actions";
import { MaintenanceRecordDialog } from "@/components/maintenance-record-dialog";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 15, 12));
});

afterAll(() => {
  vi.useRealTimers();
});

const blank: MaintenanceFormState = {
  values: {
    type: "",
    performed_at: "2026-06-15",
    description: "",
    mileage: "84,500",
    cost: "",
    notes: "",
  },
};

function renderDialog(
  props: Partial<Parameters<typeof MaintenanceRecordDialog>[0]> = {},
) {
  const action = vi.fn();
  const onValidSubmit = vi.fn();
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <MaintenanceRecordDialog
      open
      onOpenChange={onOpenChange}
      title="Add maintenance record"
      description="Log service done on this vehicle."
      submitLabel="Add record"
      state={blank}
      action={action}
      onValidSubmit={onValidSubmit}
      {...props}
    />,
  );

  return { user, action, onValidSubmit, onOpenChange, view };
}

const textbox = (name: RegExp) => screen.getByRole("textbox", { name });

async function chooseType(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(screen.getByRole("combobox", { name: "Type" }));
  await user.click(await screen.findByRole("option", { name: label }));
}

describe("MaintenanceRecordDialog", () => {
  it("starts from the given values", () => {
    renderDialog();

    expect(
      screen.getByRole("dialog", { name: "Add maintenance record" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-06-15");
    expect(screen.getByLabelText("Date")).toHaveAttribute("max", "2026-06-15");
    expect(textbox(/^Mileage/)).toHaveValue("84,500");
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent(
      "Choose a type",
    );
  });

  it("shows inline errors and focuses the first invalid field", async () => {
    const { user, action, onValidSubmit } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Add record" }));

    expect(screen.getByText("Type is required")).toBeInTheDocument();
    expect(screen.getByText("Description is required")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveFocus();
    expect(textbox(/^Description/)).toHaveAttribute("aria-invalid", "true");
    expect(action).not.toHaveBeenCalled();
    expect(onValidSubmit).not.toHaveBeenCalled();
  });

  it("focuses a later invalid field when the earlier ones are valid", async () => {
    const { user } = renderDialog();

    await chooseType(user, "Brakes");
    await user.type(textbox(/^Description/), "Front pads");
    await user.type(textbox(/^Cost/), "12.345");
    await user.click(screen.getByRole("button", { name: "Add record" }));

    expect(
      screen.getByText("Cost must be an amount like 49.99"),
    ).toBeInTheDocument();
    expect(textbox(/^Cost/)).toHaveFocus();
  });

  it("clears a field's error once it is edited", async () => {
    const { user } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Add record" }));
    await user.type(textbox(/^Description/), "P");

    expect(
      screen.queryByText("Description is required"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Type is required")).toBeInTheDocument();
  });

  it("submits a valid record", async () => {
    const { user, action, onValidSubmit } = renderDialog();

    await chooseType(user, "Oil change");
    await user.type(textbox(/^Description/), "Synthetic 5W-30");
    await user.type(textbox(/^Cost/), "49.99");
    await user.type(textbox(/^Notes/), "Shop: Main St");
    await user.click(screen.getByRole("button", { name: "Add record" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(onValidSubmit).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(action.mock.calls[0][0])).toEqual({
      type: "oil_change",
      performed_at: "2026-06-15",
      description: "Synthetic 5W-30",
      mileage: "84,500",
      cost: "49.99",
      notes: "Shop: Main St",
    });
  });

  it("shows errors and a message from an earlier attempt", () => {
    renderDialog({
      state: {
        values: { ...blank.values, type: "repair", cost: "-1" },
        errors: { cost: ["Cost must not be negative"] },
        message: "Could not reach the server. Please try again.",
      },
    });

    expect(screen.getByText("Cost must not be negative")).toBeInTheDocument();
    expect(
      screen.getByText("Could not reach the server. Please try again."),
    ).toBeInTheDocument();
    expect(textbox(/^Cost/)).toHaveFocus();
  });

  it("shows the server's errors when a new state arrives", () => {
    const { view } = renderDialog({ submitLabel: "Save" });

    view.rerender(
      <MaintenanceRecordDialog
        open
        onOpenChange={vi.fn()}
        title="Add maintenance record"
        description="Log service done on this vehicle."
        submitLabel="Save"
        state={{
          values: { ...blank.values, type: "brakes", description: "Pads" },
          errors: { performed_at: ["Date must not be in the future"] },
        }}
        action={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Date must not be in the future"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveFocus();
    expect(textbox(/^Description/)).toHaveValue("Pads");
  });

  it("shows a saving state and stays open while pending", async () => {
    const { user, onOpenChange } = renderDialog({
      submitLabel: "Save",
      pending: true,
    });

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await user.keyboard("{Escape}");

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes on Escape and Cancel", async () => {
    const { user, onOpenChange } = renderDialog();

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });
});
