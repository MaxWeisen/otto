import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { VehicleFormState } from "@/app/(authenticated)/vehicles/actions";
import { VehicleDetailsCard } from "@/components/vehicle-details-card";
import type { Vehicle } from "@/lib/vehicles";
import { server } from "@/test/server";

// Pin the clock so the latest accepted model year (next year) is stable.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});

afterAll(() => {
  vi.useRealTimers();
});

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

const modelsByMakeYear: Record<string, string[]> = {
  "honda|2003": ["Accord", "Civic", "CR-V"],
  "honda|2005": ["Accord", "Civic", "Element"],
  "toyota|2015": ["Camry", "Corolla"],
};

beforeEach(() => {
  server.use(
    http.get("*/api/vpic/models", ({ request }) => {
      const url = new URL(request.url);
      const key = `${url.searchParams.get("make")?.toLowerCase()}|${url.searchParams.get("year")}`;

      return HttpResponse.json({ models: modelsByMakeYear[key] ?? [] });
    }),
  );
});

type Action = (
  state: VehicleFormState,
  formData: FormData,
) => Promise<VehicleFormState>;

function renderCard(
  vehicle: Vehicle = accord,
  action: Action = vi.fn(async (state: VehicleFormState) => state),
) {
  const user = userEvent.setup();
  const view = render(
    <VehicleDetailsCard
      vehicle={vehicle}
      action={action}
    />,
  );

  return { user, action, view };
}

/** Resolves with the action's result for the submitted form. */
function savingAction(result: (values: FormData) => Partial<VehicleFormState>) {
  return vi.fn(async (_state: VehicleFormState, formData: FormData) => ({
    values: Object.fromEntries(formData) as VehicleFormState["values"],
    ...result(formData),
  }));
}

const editButton = () => screen.getByRole("button", { name: "Edit vehicle" });
const form = () => screen.queryByRole("form", { name: "Edit vehicle" });
const textbox = (name: string | RegExp) =>
  screen.getByRole("textbox", { name });
const detail = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling;

async function startEditing(user: ReturnType<typeof userEvent.setup>) {
  await user.click(editButton());
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Model" })).toBeEnabled(),
  );
}

describe("VehicleDetailsCard", () => {
  it("switches to a prefilled form in place and focuses the year", async () => {
    const { user } = renderCard();

    expect(detail("Model")).toHaveTextContent("Accord");
    expect(form()).not.toBeInTheDocument();

    await startEditing(user);

    expect(form()).toBeInTheDocument();
    expect(screen.getByText("Edit details")).toBeInTheDocument();
    expect(textbox("Year")).toHaveValue("2003");
    expect(textbox("Year")).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "Make" })).toHaveValue("Honda");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue(
      "Accord",
    );
    expect(textbox(/^Trim/)).toHaveValue("EX-V6");
    expect(textbox(/^VIN/)).toHaveValue("1HGCM82633A004352");
    expect(textbox(/^Mileage/)).toHaveValue("182,000");
    expect(textbox(/^Nickname/)).toHaveValue("Commuter");
  });

  it("prefills blank optional fields as empty", async () => {
    const { user } = renderCard({
      ...accord,
      trim: null,
      vin: null,
      nickname: null,
      mileage: null,
    });

    await startEditing(user);

    for (const name of [/^Trim/, /^VIN/, /^Mileage/, /^Nickname/]) {
      expect(textbox(name)).toHaveValue("");
    }
  });

  it("keeps a model the vPIC list does not include as Other", async () => {
    const { user } = renderCard({
      ...accord,
      year: 2015,
      make: "Toyota",
      model: "Camry Hybrid Custom",
    });

    await startEditing(user);

    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue(
      "Other / not listed",
    );
    expect(textbox("Model name")).toHaveValue("Camry Hybrid Custom");
  });

  it("keeps a make outside the list as Other", async () => {
    const { user } = renderCard({
      ...accord,
      year: 1981,
      make: "DeLorean",
      model: "DMC-12",
    });

    await user.click(editButton());

    expect(screen.getByRole("combobox", { name: "Make" })).toHaveValue(
      "Other / not listed",
    );
    expect(textbox("Make name")).toHaveValue("DeLorean");
    expect(textbox("Model")).toHaveValue("DMC-12");
  });

  it("shows an error for each invalid field without saving", async () => {
    const { user, action } = renderCard({
      ...accord,
      year: 1981,
      make: "DeLorean",
      model: "DMC-12",
    });

    await user.click(editButton());
    await user.clear(textbox("Year"));
    await user.type(textbox("Year"), "1700");
    await user.clear(textbox("Make name"));
    await user.clear(textbox("Model"));
    await user.clear(textbox(/^VIN/));
    await user.type(textbox(/^VIN/), "abc");
    await user.clear(textbox(/^Mileage/));
    await user.type(textbox(/^Mileage/), "-5");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.getByText("Year must be between 1886 and 2027"),
    ).toBeInTheDocument();
    expect(screen.getByText("Make is required")).toBeInTheDocument();
    expect(screen.getByText("Model is required")).toBeInTheDocument();
    expect(
      screen.getByText("VIN must be 17 characters (currently 3)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Mileage must be a whole number of 0 or more"),
    ).toBeInTheDocument();
    expect(textbox("Year")).toHaveFocus();
    expect(textbox("Year")).toHaveAttribute("aria-invalid", "true");
    expect(action).not.toHaveBeenCalled();
  });

  it("strips spaces from the VIN and uppercases it", async () => {
    const { user } = renderCard({ ...accord, vin: null });

    await startEditing(user);
    await user.type(textbox(/^VIN/), "1hg cm826 33a004352");

    expect(textbox(/^VIN/)).toHaveValue("1HGCM82633A004352");
  });

  it("restores the details unchanged on Cancel", async () => {
    const { user, action } = renderCard();

    await startEditing(user);
    await user.clear(textbox(/^Trim/));
    await user.type(textbox(/^Trim/), "LX");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(form()).not.toBeInTheDocument();
    expect(detail("Trim")).toHaveTextContent("EX-V6");
    expect(editButton()).toHaveFocus();
    expect(action).not.toHaveBeenCalled();

    await startEditing(user);

    expect(textbox(/^Trim/)).toHaveValue("EX-V6");
  });

  it("cancels on Escape", async () => {
    const { user, action } = renderCard();

    await startEditing(user);
    await user.type(textbox(/^Nickname/), " car");
    await user.keyboard("{Escape}");

    expect(form()).not.toBeInTheDocument();
    expect(editButton()).toHaveFocus();
    expect(action).not.toHaveBeenCalled();
  });

  it("cancels on Escape from a picker without clearing it first", async () => {
    const { user } = renderCard();

    await startEditing(user);
    await user.click(screen.getByRole("combobox", { name: "Make" }));
    await user.keyboard("{Escape}");

    expect(form()).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(form()).not.toBeInTheDocument();
    expect(detail("Make")).toHaveTextContent("Honda");
  });

  it("saves, confirms with a toast and returns to the details", async () => {
    const action = savingAction(() => ({ saved: true }));
    const { user, view } = renderCard(accord, action);

    await startEditing(user);
    await user.clear(textbox("Year"));
    await user.type(textbox("Year"), "2005");
    await user.clear(textbox(/^Mileage/));
    await user.type(textbox(/^Mileage/), "190,500");
    await user.clear(textbox(/^Nickname/));
    await user.type(textbox(/^Nickname/), "Daily");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(form()).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Vehicle updated");
    expect(editButton()).toHaveFocus();
    expect(action).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(action.mock.calls[0][1])).toEqual({
      year: "2005",
      make: "Honda",
      model: "Accord",
      trim: "EX-V6",
      vin: "1HGCM82633A004352",
      mileage: "190,500",
      nickname: "Daily",
    });

    // The server action refreshes the page with the saved vehicle.
    view.rerender(
      <VehicleDetailsCard
        vehicle={{
          ...accord,
          year: 2005,
          mileage: 190500,
          nickname: "Daily",
        }}
        action={action}
      />,
    );

    expect(detail("Mileage")).toHaveTextContent("190,500 mi");
  });

  it("disables Save and Cancel and ignores Escape while saving", async () => {
    let finish: (state: VehicleFormState) => void = () => {};
    const action = vi.fn(
      (state: VehicleFormState) =>
        new Promise<VehicleFormState>((resolve) => {
          finish = () => resolve({ ...state, saved: true });
        }),
    );
    const { user } = renderCard(accord, action);

    await startEditing(user);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await user.click(textbox(/^Trim/));
    await user.keyboard("{Escape}");

    expect(form()).toBeInTheDocument();

    finish(action.mock.calls[0][0]);

    await waitFor(() => expect(form()).not.toBeInTheDocument());
  });

  it("shows a backend error in the form and as a toast", async () => {
    const action = savingAction(() => ({
      message: "Something went wrong. Please try again.",
    }));
    const { user } = renderCard(accord, action);

    await startEditing(user);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Something went wrong. Please try again.", {
        selector: "form [role=alert] *",
      }),
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      "Something went wrong. Please try again.",
    );
    expect(form()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
  });

  it("shows a backend field error on its field and focuses it", async () => {
    const action = savingAction(() => ({
      errors: { vin: ["VIN must be 17 characters"] },
    }));
    const { user } = renderCard(accord, action);

    await startEditing(user);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("VIN must be 17 characters"),
    ).toBeInTheDocument();
    expect(textbox(/^VIN/)).toHaveFocus();
    expect(textbox(/^VIN/)).toHaveAttribute("aria-invalid", "true");
    expect(form()).toBeInTheDocument();
  });
});
