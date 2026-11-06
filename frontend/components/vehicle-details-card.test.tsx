import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VehicleFormState } from "@/app/(authenticated)/vehicles/actions";
import { VehicleDetailsCard } from "@/components/vehicle-details-card";
import type { Vehicle } from "@/lib/vehicles";
import { server } from "@/test/server";

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

beforeEach(() => {
  server.use(
    http.get("*/api/vpic/models", () =>
      HttpResponse.json({ models: ["Accord", "Camry", "Civic"] }),
    ),
  );
});

async function startEditing(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Edit vehicle" }));
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Model" })).toBeEnabled(),
  );
}

function submittedState(formData: FormData) {
  return Object.fromEntries(formData) as VehicleFormState["values"];
}

describe("VehicleDetailsCard", () => {
  it("switches to a prefilled form in place and focuses the year", async () => {
    const user = userEvent.setup();
    render(
      <VehicleDetailsCard
        vehicle={accord}
        action={vi.fn()}
        deleteAction={vi.fn()}
      />,
    );

    await startEditing(user);

    expect(screen.getByRole("textbox", { name: "Year" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Year" })).toHaveValue("2003");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue(
      "Accord",
    );
    expect(screen.getByRole("textbox", { name: /^Mileage/ })).toHaveValue(
      "182,000",
    );
  });

  it("keeps a model the vPIC list does not include as Other", async () => {
    const user = userEvent.setup();
    render(
      <VehicleDetailsCard
        vehicle={{ ...accord, model: "Accord Hybrid Custom" }}
        action={vi.fn()}
        deleteAction={vi.fn()}
      />,
    );

    await startEditing(user);

    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue(
      "Other / not listed",
    );
    expect(screen.getByRole("textbox", { name: "Model name" })).toHaveValue(
      "Accord Hybrid Custom",
    );
  });

  it("keeps a make outside the list as Other", async () => {
    const user = userEvent.setup();
    render(
      <VehicleDetailsCard
        vehicle={{ ...accord, year: 1981, make: "DeLorean", model: "DMC-12" }}
        action={vi.fn()}
        deleteAction={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit vehicle" }));

    expect(screen.getByRole("combobox", { name: "Make" })).toHaveValue(
      "Other / not listed",
    );
    expect(screen.getByRole("textbox", { name: "Make name" })).toHaveValue(
      "DeLorean",
    );
  });

  it("shows an error for each invalid field and focuses the first", async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(
      <VehicleDetailsCard
        vehicle={accord}
        action={action}
        deleteAction={vi.fn()}
      />,
    );

    await startEditing(user);
    await user.clear(screen.getByRole("textbox", { name: "Year" }));
    await user.type(screen.getByRole("textbox", { name: "Year" }), "1700");
    await user.clear(screen.getByRole("textbox", { name: /^Mileage/ }));
    await user.type(screen.getByRole("textbox", { name: /^Mileage/ }), "-5");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.getByText(/^Year must be between 1886 and \d{4}$/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Mileage must be a whole number of 0 or more"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Year" })).toHaveFocus();
    expect(action).not.toHaveBeenCalled();
  });

  it("restores the details on Cancel and returns focus to Edit", async () => {
    const user = userEvent.setup();
    render(
      <VehicleDetailsCard
        vehicle={accord}
        action={vi.fn()}
        deleteAction={vi.fn()}
      />,
    );

    await startEditing(user);
    await user.type(screen.getByRole("textbox", { name: /^Trim/ }), " LX");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("EX-V6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit vehicle" })).toHaveFocus();
  });

  it("cancels on Escape", async () => {
    const user = userEvent.setup();
    render(
      <VehicleDetailsCard
        vehicle={accord}
        action={vi.fn()}
        deleteAction={vi.fn()}
      />,
    );

    await startEditing(user);
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("form", { name: "Edit vehicle" }),
    ).not.toBeInTheDocument();
  });

  it("saves, confirms with a toast and returns to the details", async () => {
    const user = userEvent.setup();
    const action = vi.fn(
      async (_state: VehicleFormState, formData: FormData) => ({
        values: submittedState(formData),
        saved: true,
      }),
    );
    render(
      <VehicleDetailsCard
        vehicle={accord}
        action={action}
        deleteAction={vi.fn()}
      />,
    );

    await startEditing(user);
    await user.clear(screen.getByRole("textbox", { name: /^Nickname/ }));
    await user.type(
      screen.getByRole("textbox", { name: /^Nickname/ }),
      "Daily",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Vehicle updated"),
    );
    expect(action.mock.calls[0][1].get("nickname")).toBe("Daily");
    expect(screen.getByRole("button", { name: "Edit vehicle" })).toHaveFocus();
  });

  it("saves the prefilled model while the model list is still loading", async () => {
    server.use(
      http.get("*/api/vpic/models", async () => {
        await delay(1000);
        return HttpResponse.json({ models: ["Accord"] });
      }),
    );
    const user = userEvent.setup();
    const action = vi.fn(
      async (_state: VehicleFormState, formData: FormData) => ({
        values: submittedState(formData),
        saved: true,
      }),
    );
    render(
      <VehicleDetailsCard
        vehicle={accord}
        action={action}
        deleteAction={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit vehicle" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.calls[0][1].get("model")).toBe("Accord");
  });

  it("shows a backend error in the form and as a toast", async () => {
    const user = userEvent.setup();
    render(
      <VehicleDetailsCard
        vehicle={accord}
        action={async (_state, formData) => ({
          values: submittedState(formData),
          message: "Something went wrong. Please try again.",
        })}
        deleteAction={vi.fn()}
      />,
    );

    await startEditing(user);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    expect(toast.error).toHaveBeenCalledWith(
      "Something went wrong. Please try again.",
    );
  });

  it("shows a backend field error on its field and focuses it", async () => {
    const user = userEvent.setup();
    render(
      <VehicleDetailsCard
        vehicle={accord}
        action={async (_state, formData) => ({
          values: submittedState(formData),
          errors: { vin: ["VIN must be 17 characters"] },
        })}
        deleteAction={vi.fn()}
      />,
    );

    await startEditing(user);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("VIN must be 17 characters"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^VIN/ })).toHaveFocus();
  });

  it("offers Delete only in edit mode", async () => {
    const user = userEvent.setup();
    render(
      <VehicleDetailsCard
        vehicle={accord}
        action={vi.fn()}
        deleteAction={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();

    await startEditing(user);

    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("deletes the vehicle after confirmation", async () => {
    const user = userEvent.setup();
    const deleteAction = vi.fn(async () => ({}));
    render(
      <VehicleDetailsCard
        vehicle={accord}
        action={vi.fn()}
        deleteAction={deleteAction}
      />,
    );

    await startEditing(user);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete vehicle" }));

    expect(deleteAction).toHaveBeenCalledOnce();
  });
});
