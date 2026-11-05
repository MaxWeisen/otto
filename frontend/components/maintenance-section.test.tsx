import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { Component, type ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  DeleteMaintenanceResult,
  MaintenanceFormState,
} from "@/app/(authenticated)/vehicles/[id]/actions";
import { MaintenanceSection } from "@/components/maintenance-section";
import type { MaintenanceRecord } from "@/lib/maintenance";
import type { Vehicle } from "@/lib/vehicles";
import { NotFoundError } from "@/test/next-mocks";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 15, 12));
});

afterAll(() => {
  vi.useRealTimers();
});

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

const inspection: MaintenanceRecord = {
  ...brakes,
  id: 30,
  type: "inspection",
  description: "State inspection",
  performed_at: "2025-03-14",
  cost: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

class NotFoundBoundary extends Component<
  { children: ReactNode },
  { notFound: boolean }
> {
  state = { notFound: false };

  static getDerivedStateFromError(error: unknown) {
    if (error instanceof NotFoundError) return { notFound: true };
    throw error;
  }

  render() {
    return this.state.notFound ? <p>Not found</p> : this.props.children;
  }
}

function renderSection(records: MaintenanceRecord[] = [brakes, inspection]) {
  const create = deferred<MaintenanceFormState>();
  const update = deferred<MaintenanceFormState>();
  const remove = deferred<DeleteMaintenanceResult>();
  const createAction = vi.fn(() => create.promise);
  const updateAction = vi.fn(() => update.promise);
  const deleteAction = vi.fn(() => remove.promise);
  const user = userEvent.setup();
  const props = { vehicle: accord, createAction, updateAction, deleteAction };
  const view = render(
    <NotFoundBoundary>
      <MaintenanceSection
        records={records}
        {...props}
      />
    </NotFoundBoundary>,
  );
  const rerender = (next: MaintenanceRecord[]) =>
    view.rerender(
      <NotFoundBoundary>
        <MaintenanceSection
          records={next}
          {...props}
        />
      </NotFoundBoundary>,
    );

  return {
    user,
    create,
    update,
    remove,
    createAction,
    updateAction,
    deleteAction,
    rerender,
  };
}

type User = ReturnType<typeof userEvent.setup>;

const entry = (text: string) =>
  screen.getByText(text).closest("li") as HTMLElement;
const dialog = () => screen.queryByRole("dialog");

async function fillNewRecord(user: User) {
  await user.click(screen.getByRole("combobox", { name: "Type" }));
  await user.click(await screen.findByRole("option", { name: "Oil change" }));
  await user.type(
    screen.getByRole("textbox", { name: /^Description/ }),
    "Synthetic 5W-30",
  );
  await user.type(screen.getByRole("textbox", { name: /^Cost/ }), "49.99");
}

describe("MaintenanceSection", () => {
  it("shows an empty state that opens the add dialog", async () => {
    const { user } = renderSection([]);

    expect(screen.getByText("No maintenance logged yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add record" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Add your first record" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Add maintenance record" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-06-15");
    expect(screen.getByRole("textbox", { name: /^Mileage/ })).toHaveValue(
      "182,000",
    );
  });

  it("adds a record optimistically, then shows the saved one", async () => {
    const { user, create, createAction, rerender } = renderSection();

    await user.click(screen.getByRole("button", { name: "Add record" }));
    await fillNewRecord(user);
    await user.click(
      within(dialog()!).getByRole("button", { name: "Add record" }),
    );

    await waitFor(() => expect(dialog()).not.toBeInTheDocument());

    const pending = entry("Synthetic 5W-30");

    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(within(pending).getByText("Saving...")).toBeInTheDocument();
    expect(within(pending).getByText("$49.99")).toBeInTheDocument();
    expect(within(pending).getByText("182,000 mi")).toBeInTheDocument();
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining("Synthetic 5W-30"),
      expect.stringContaining("Front pads and rotors"),
      expect.stringContaining("State inspection"),
    ]);
    expect(createAction).toHaveBeenCalledTimes(1);

    const saved: MaintenanceRecord = {
      ...brakes,
      id: 32,
      type: "oil_change",
      description: "Synthetic 5W-30",
      performed_at: "2026-06-15",
      mileage: 182000,
      cost: "49.99",
    };

    rerender([saved, brakes, inspection]);
    create.resolve({
      values: {} as MaintenanceFormState["values"],
      saved: true,
    });

    await waitFor(() =>
      expect(entry("Synthetic 5W-30")).not.toHaveAttribute("aria-busy"),
    );
    expect(screen.getAllByText("Synthetic 5W-30")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Edit Oil change from Jun 15, 2026" }),
    ).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Maintenance record added");
  });

  it("removes a failed new record and offers to try again", async () => {
    const { user, create } = renderSection();

    await user.click(screen.getByRole("button", { name: "Add record" }));
    await fillNewRecord(user);
    await user.click(
      within(dialog()!).getByRole("button", { name: "Add record" }),
    );

    expect(await screen.findByText("Saving...")).toBeInTheDocument();

    const values = {
      type: "oil_change",
      performed_at: "2026-06-15",
      description: "Synthetic 5W-30",
      mileage: "182,000",
      cost: "49.99",
      notes: "",
    };

    create.resolve({
      values,
      message: "Could not reach the server. Please try again.",
    });

    await waitFor(() =>
      expect(screen.queryByText("Synthetic 5W-30")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Saving...")).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Could not add the record", {
      description: "Could not reach the server. Please try again.",
      action: { label: "Try again", onClick: expect.any(Function) },
    });

    const action = vi.mocked(toast.error).mock.calls[0][1]?.action as {
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
    };

    act(() => action.onClick({} as React.MouseEvent<HTMLButtonElement>));

    expect(
      await screen.findByRole("dialog", { name: "Add maintenance record" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Description/ })).toHaveValue(
      "Synthetic 5W-30",
    );
  });

  it("deletes a record optimistically after confirmation", async () => {
    const { user, remove, deleteAction, rerender } = renderSection();

    await user.click(
      screen.getByRole("button", { name: "Delete Brakes from Jan 18, 2026" }),
    );

    const confirm = screen.getByRole("alertdialog", {
      name: "Delete this record?",
    });

    expect(confirm).toHaveTextContent(
      "Brakes from Jan 18, 2026 will be permanently deleted.",
    );

    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Front pads and rotors"),
      ).not.toBeInTheDocument(),
    );
    expect(deleteAction).toHaveBeenCalledWith(31);

    rerender([inspection]);
    remove.resolve({ ok: true });

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Maintenance record deleted"),
    );
    expect(screen.queryByText("Front pads and rotors")).not.toBeInTheDocument();
  });

  it("shows not-found instead of an error toast when adding to a missing vehicle", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { user, create } = renderSection();

    await user.click(screen.getByRole("button", { name: "Add record" }));
    await fillNewRecord(user);
    await user.click(
      within(dialog()!).getByRole("button", { name: "Add record" }),
    );

    expect(await screen.findByText("Saving...")).toBeInTheDocument();

    create.reject(new NotFoundError());

    expect(await screen.findByText("Not found")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("shows not-found instead of an error toast when deleting from a missing vehicle", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { user, remove } = renderSection();

    await user.click(
      screen.getByRole("button", { name: "Delete Brakes from Jan 18, 2026" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));

    remove.reject(new NotFoundError());

    expect(await screen.findByText("Not found")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("restores a record that could not be deleted", async () => {
    const { user, remove } = renderSection();

    await user.click(
      screen.getByRole("button", { name: "Delete Brakes from Jan 18, 2026" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Front pads and rotors"),
      ).not.toBeInTheDocument(),
    );

    remove.resolve({
      ok: false,
      error: "Something went wrong. Please try again.",
    });

    expect(
      await screen.findByText("Front pads and rotors"),
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Could not delete the record", {
      description: "Something went wrong. Please try again.",
    });
  });

  it("keeps a record when deletion is cancelled", async () => {
    const { user, deleteAction } = renderSection();

    await user.click(
      screen.getByRole("button", { name: "Delete Brakes from Jan 18, 2026" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Front pads and rotors")).toBeInTheDocument();
    expect(deleteAction).not.toHaveBeenCalled();
  });

  it("edits a record in the prefilled dialog without optimism", async () => {
    const { user, update, updateAction } = renderSection();

    await user.click(
      screen.getByRole("button", { name: "Edit Brakes from Jan 18, 2026" }),
    );

    const edit = screen.getByRole("dialog", {
      name: "Edit maintenance record",
    });
    const description = within(edit).getByRole("textbox", {
      name: /^Description/,
    });

    expect(
      within(edit).getByRole("combobox", { name: "Type" }),
    ).toHaveTextContent("Brakes");
    expect(within(edit).getByLabelText("Date")).toHaveValue("2026-01-18");
    expect(description).toHaveValue("Front pads and rotors");
    expect(within(edit).getByRole("textbox", { name: /^Mileage/ })).toHaveValue(
      "176,300",
    );
    expect(within(edit).getByRole("textbox", { name: /^Cost/ })).toHaveValue(
      "412.50",
    );

    await user.clear(description);
    await user.type(description, "Rear pads");
    await user.click(within(edit).getByRole("button", { name: "Save" }));

    expect(
      await within(edit).findByRole("button", { name: "Saving..." }),
    ).toBeDisabled();
    expect(updateAction).toHaveBeenCalledWith(
      31,
      expect.anything(),
      expect.any(FormData),
    );
    expect(screen.getAllByText("Front pads and rotors")).toHaveLength(1);
    expect(entry("Front pads and rotors")).not.toHaveAttribute("aria-busy");

    update.resolve({
      values: {} as MaintenanceFormState["values"],
      saved: true,
    });

    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Maintenance record updated");
  });

  it("keeps the edit dialog open with the error when saving fails", async () => {
    const { user, update } = renderSection();

    await user.click(
      screen.getByRole("button", { name: "Edit Brakes from Jan 18, 2026" }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    update.resolve({
      values: {
        type: "brakes",
        performed_at: "2026-01-18",
        description: "Front pads and rotors",
        mileage: "176,300",
        cost: "412.50",
        notes: "",
      },
      message: "This maintenance record no longer exists.",
    });

    expect(
      await within(dialog()!).findByText(
        "This maintenance record no longer exists.",
      ),
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      "This maintenance record no longer exists.",
    );
  });
});
